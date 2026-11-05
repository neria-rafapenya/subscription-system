from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from html import escape
import sqlite3
import secrets
from uuid import uuid4

from fastapi import File, FastAPI, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import AppEnvironment, get_settings
from .db import add_subscription_period, connection, rows
from .security import (
    create_local_access_token,
    customer_id_from_local_access_token,
    hash_password,
    hash_recovery_token,
    verify_password,
)
from .storage import delete_storage_key, public_file_url, save_service_upload
from .paypal import PayPalAPIError, PayPalConfigurationError, cancel_subscription as paypal_cancel_subscription, create_subscription as paypal_create_subscription, get_subscription as paypal_get_subscription, paypal_settings, plan_id_for_tier
from .validation import normalize_spanish_person_id


settings = get_settings()
POLICIES_VERSION = "v1"


class SubscriptionCreate(BaseModel):
    plan_id: str
    customer_id: str = "customer-local"


class CheckoutCreate(BaseModel):
    plan_id: str
    customer_id: str = "customer-local"
    billing_address: str = Field(min_length=5, max_length=500)
    tax_id: str = Field(min_length=3, max_length=32)
    policies_accepted: bool


class LocalPaymentSimulation(BaseModel):
    confirmed: bool


class PayPalSubscriptionRegistration(BaseModel):
    provider_subscription_id: str = Field(min_length=3, max_length=128)


class PlanPriceUpdate(BaseModel):
    amount_cents: int = Field(gt=0)
    confirmed: bool = False


class LocalLogin(BaseModel):
    email: str
    password: str


class CustomerRegistration(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    password_confirmation: str = Field(min_length=8, max_length=128)


class PasswordRecoveryRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class PasswordReset(BaseModel):
    token: str = Field(min_length=20, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=500)
    minimum_tier: str = Field(default="basic", pattern="^(basic|premium)$")
    active: bool = True


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1, max_length=500)
    minimum_tier: str | None = Field(default=None, pattern="^(basic|premium)$")
    active: bool | None = None


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    cognito_sub: str | None = Field(default=None, max_length=255)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, min_length=3, max_length=255)
    cognito_sub: str | None = Field(default=None, max_length=255)


class SubscriptionStatusUpdate(BaseModel):
    status: str = Field(pattern="^(active|suspended)$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.file_storage_path.mkdir(parents=True, exist_ok=True)
    connection().close()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

cors_options = {
    "allow_origins": ["http://localhost:5173", "http://localhost:8081", "http://127.0.0.1:8081"],
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.app_env in {AppEnvironment.DEVELOPMENT, AppEnvironment.INTEGRATION}:
    cors_options["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app.add_middleware(CORSMiddleware, **cors_options)
app.mount("/media", StaticFiles(directory=str(settings.file_storage_path), check_dir=False), name="media")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env.value}


@app.get("/config")
def public_config() -> dict[str, str | bool | None]:
    return {
        "environment": settings.app_env.value,
        "local_auth_enabled": settings.local_auth_enabled,
        "auth_provider": "local" if settings.local_auth_enabled else "cognito",
        "payment_provider": settings.payment_provider,
    }


@app.get("/payments/paypal/config")
def paypal_public_config(authorization: str | None = Header(default=None)) -> dict[str, object]:
    """Expose only PayPal's public client configuration to the signed-in app."""
    authenticated_customer_id(authorization)
    if settings.payment_provider != "paypal":
        return {"enabled": False, "environment": None, "client_id": None, "plan_ids": {}}
    try:
        config = paypal_settings()
    except (PayPalConfigurationError, PayPalAPIError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    plan_ids = {
        plan["id"]: plan_id_for_tier(plan["tier"])
        for plan in rows("SELECT id, tier FROM plans WHERE active = 1")
    }
    return {
        "enabled": True,
        "environment": "sandbox" if "sandbox.paypal.com" in config.base_url else "production",
        "client_id": config.client_id,
        "plan_ids": plan_ids,
    }


def authenticated_customer_id(authorization: str | None, fallback: str | None = None) -> str:
    if not settings.local_auth_enabled:
        raise HTTPException(status_code=501, detail="La validación de Cognito se conectará en este entorno")
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    customer_id = customer_id_from_local_access_token(token)
    if customer_id:
        customer = rows("SELECT id FROM customers WHERE id = ?", (customer_id,))
        if customer:
            return customer_id
    if fallback:
        return fallback
    raise HTTPException(status_code=401, detail="Se requiere una sesión válida")


@app.get("/me")
def current_user(authorization: str | None = Header(default=None)) -> dict[str, object]:
    customer_id = authenticated_customer_id(authorization)
    customer = rows(
        """
        SELECT id, name, email, billing_address, tax_id,
               policies_accepted_at, policies_version
        FROM customers WHERE id = ?
        """,
        (customer_id,),
    )[0]
    return customer


@app.post("/auth/local/login")
def local_login(payload: LocalLogin) -> dict[str, object]:
    if not settings.local_auth_enabled:
        raise HTTPException(status_code=501, detail="Este entorno utilizará Cognito para el login")
    customer = rows(
        "SELECT id, name, email, password_hash FROM customers WHERE lower(email) = lower(?)",
        (payload.email.strip(),),
    )
    if not customer or not verify_password(payload.password, customer[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid local credentials")
    user = {"id": customer[0]["id"], "name": customer[0]["name"], "email": customer[0]["email"]}
    return {
        "access_token": create_local_access_token(customer[0]["id"]),
        "token_type": "bearer",
        "user": user,
    }


@app.get("/services")
def list_services() -> list[dict]:
    services = rows(
        "SELECT id, name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, active FROM services ORDER BY active DESC, name"
    )
    return [service_with_file_urls(service) for service in services]


def service_with_file_urls(service: dict) -> dict:
    service["image_url"] = public_file_url(service.get("image_key"))
    service["attachment_url"] = public_file_url(service.get("attachment_key"))
    return service


@app.get("/services/available")
def list_available_services(authorization: str | None = Header(default=None)) -> list[dict]:
    customer_id = authenticated_customer_id(authorization)
    subscription = rows(
        """
        SELECT plans.tier
        FROM subscriptions
        JOIN plans ON plans.id = subscriptions.plan_id
        WHERE subscriptions.customer_id = ?
          AND subscriptions.status IN ('active', 'grace_period')
        ORDER BY CASE plans.tier WHEN 'premium' THEN 0 ELSE 1 END
        LIMIT 1
        """,
        (customer_id,),
    )
    subscription_tier = subscription[0]["tier"] if subscription else None
    services = rows(
        "SELECT id, name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, active FROM services WHERE active = 1 ORDER BY name"
    )
    for service in services:
        service["included"] = bool(
            subscription_tier == "premium"
            or (subscription_tier == "basic" and service["minimum_tier"] == "basic")
        )
        service["subscription_tier"] = subscription_tier
    return [service_with_file_urls(service) for service in services]


@app.post("/services", status_code=201)
def create_service(
    name: str = Form(..., min_length=1, max_length=120),
    description: str = Form(..., min_length=1, max_length=500),
    minimum_tier: str = Form("basic", pattern="^(basic|premium)$"),
    active: bool = Form(True),
    image: UploadFile | None = File(None),
    attachment: UploadFile | None = File(None),
) -> dict:
    name = name.strip()
    description = description.strip()
    if not name or not description:
        raise HTTPException(status_code=422, detail="El nombre y la descripción son obligatorios")
    service_id = f"service-{uuid4().hex[:12]}"
    image_key = image_filename = attachment_key = attachment_filename = None
    if image:
        image_key, image_filename = save_service_upload(settings.file_storage_path, service_id, image, "image")
    if attachment:
        attachment_key, attachment_filename = save_service_upload(settings.file_storage_path, service_id, attachment, "attachment")
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO services
                (id, name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (service_id, name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, int(active)),
        )
        conn.commit()
    return service_with_file_urls({"id": service_id, "name": name, "description": description, "minimum_tier": minimum_tier, "image_key": image_key, "image_filename": image_filename, "attachment_key": attachment_key, "attachment_filename": attachment_filename, "active": int(active)})


@app.get("/services/{service_id}")
def service_detail(service_id: str) -> dict:
    services = rows(
        "SELECT id, name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, active FROM services WHERE id = ?",
        (service_id,),
    )
    if not services:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return service_with_file_urls(services[0])


@app.patch("/services/{service_id}")
def update_service(
    service_id: str,
    name: str | None = Form(None, min_length=1, max_length=120),
    description: str | None = Form(None, min_length=1, max_length=500),
    minimum_tier: str | None = Form(None, pattern="^(basic|premium)$"),
    active: bool | None = Form(None),
    image: UploadFile | None = File(None),
    attachment: UploadFile | None = File(None),
    remove_image: bool = Form(False),
    remove_attachment: bool = Form(False),
) -> dict:
    current = rows("SELECT id, name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, active FROM services WHERE id = ?", (service_id,))
    if not current:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    service = current[0]
    name = name.strip() if name is not None else service["name"]
    description = description.strip() if description is not None else service["description"]
    if not name or not description:
        raise HTTPException(status_code=422, detail="El nombre y la descripción son obligatorios")
    minimum_tier = minimum_tier or service["minimum_tier"]
    active = int(active) if active is not None else service["active"]
    image_key, image_filename = service["image_key"], service["image_filename"]
    attachment_key, attachment_filename = service["attachment_key"], service["attachment_filename"]
    old_image_key, old_attachment_key = image_key, attachment_key
    if image:
        image_key, image_filename = save_service_upload(settings.file_storage_path, service_id, image, "image")
    elif remove_image:
        image_key = image_filename = None
    if attachment:
        attachment_key, attachment_filename = save_service_upload(settings.file_storage_path, service_id, attachment, "attachment")
    elif remove_attachment:
        attachment_key = attachment_filename = None
    with connection() as conn:
        conn.execute(
            """
            UPDATE services
            SET name = ?, description = ?, minimum_tier = ?,
                image_key = ?, image_filename = ?, attachment_key = ?, attachment_filename = ?, active = ?
            WHERE id = ?
            """,
            (name, description, minimum_tier, image_key, image_filename, attachment_key, attachment_filename, active, service_id),
        )
        conn.commit()
    if image_key != old_image_key:
        delete_storage_key(settings.file_storage_path, old_image_key)
    if attachment_key != old_attachment_key:
        delete_storage_key(settings.file_storage_path, old_attachment_key)
    return service_with_file_urls({"id": service_id, "name": name, "description": description, "minimum_tier": minimum_tier, "image_key": image_key, "image_filename": image_filename, "attachment_key": attachment_key, "attachment_filename": attachment_filename, "active": active})


@app.delete("/services/{service_id}")
def deactivate_service(service_id: str) -> dict[str, str]:
    with connection() as conn:
        result = conn.execute("UPDATE services SET active = 0 WHERE id = ?", (service_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        conn.commit()
    return {"id": service_id, "status": "deactivated"}


@app.delete("/services/{service_id}/permanent")
def permanently_delete_service(service_id: str) -> dict[str, str]:
    with connection() as conn:
        service = conn.execute("SELECT id, image_key, attachment_key FROM services WHERE id = ?", (service_id,)).fetchone()
        if not service:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        conn.execute("DELETE FROM services WHERE id = ?", (service_id,))
        conn.execute(
            "INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, 'deleted')",
            (f"deleted-service:{service_id}",),
        )
        conn.commit()
    delete_storage_key(settings.file_storage_path, service["image_key"])
    delete_storage_key(settings.file_storage_path, service["attachment_key"])
    return {"id": service_id, "status": "deleted"}


@app.get("/plans")
def list_plans() -> list[dict]:
    return rows("SELECT id, name, description, amount_cents, currency, interval, tier, active FROM plans WHERE active = 1 ORDER BY amount_cents")


def normalize_customer_values(name: str, email: str, cognito_sub: str | None = None) -> tuple[str, str, str | None]:
    clean_name = name.strip()
    clean_email = email.strip().lower()
    clean_cognito_sub = cognito_sub.strip() if cognito_sub else None
    if not clean_name:
        raise HTTPException(status_code=422, detail="El nombre del cliente es obligatorio")
    if "@" not in clean_email or clean_email.startswith("@") or clean_email.endswith("@"):
        raise HTTPException(status_code=422, detail="El correo del cliente no es válido")
    return clean_name, clean_email, clean_cognito_sub or None


@app.get("/customers")
def list_customers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    sort: str = Query(default="created_at"),
    direction: str = Query(default="desc"),
) -> dict[str, object]:
    sort_columns = {
        "created_at": "customers.created_at",
        "name": "lower(customers.name)",
        "email": "lower(customers.email)",
    }
    if sort not in sort_columns:
        raise HTTPException(status_code=422, detail="Ordenación de clientes no válida")
    if direction not in {"asc", "desc"}:
        raise HTTPException(status_code=422, detail="Dirección de ordenación no válida")
    with connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        offset = (page - 1) * page_size
        items = [
            dict(row)
            for row in conn.execute(
                f"""
                SELECT customers.id, customers.cognito_sub, customers.name, customers.email,
                       customers.billing_address, customers.tax_id,
                       customers.policies_accepted_at, customers.policies_version,
                       customers.created_at,
                       COUNT(DISTINCT subscriptions.id) AS subscription_count,
                       SUM(CASE WHEN subscriptions.status IN ('pending', 'active', 'grace_period', 'suspended') THEN 1 ELSE 0 END) AS current_subscription_count,
                       (
                           SELECT COUNT(*) FROM checkout_sessions
                           WHERE checkout_sessions.customer_id = customers.id
                             AND checkout_sessions.status IN ('created', 'approval_pending')
                       ) AS pending_checkout_count
                FROM customers
                LEFT JOIN subscriptions ON subscriptions.customer_id = customers.id
                GROUP BY customers.id, customers.cognito_sub, customers.name, customers.email,
                         customers.billing_address, customers.tax_id,
                         customers.policies_accepted_at, customers.policies_version, customers.created_at
                ORDER BY {sort_columns[sort]} {direction.upper()}
                LIMIT ? OFFSET ?
                """,
                (page_size, offset),
            ).fetchall()
        ]
    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "sort": sort,
        "direction": direction,
    }


@app.post("/customers", status_code=201)
def create_customer(payload: CustomerCreate) -> dict:
    name, email, cognito_sub = normalize_customer_values(payload.name, payload.email, payload.cognito_sub)
    customer_id = f"customer-{uuid4().hex[:12]}"
    try:
        with connection() as conn:
            conn.execute(
                "INSERT INTO customers (id, cognito_sub, name, email) VALUES (?, ?, ?, ?)",
                (customer_id, cognito_sub, name, email),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese correo") from exc
    return {"id": customer_id, "cognito_sub": cognito_sub, "name": name, "email": email, "subscription_count": 0, "current_subscription_count": 0}


@app.get("/customers/{customer_id}")
def customer_detail(customer_id: str) -> dict[str, object]:
    with connection() as conn:
        customer = conn.execute(
            """
            SELECT id, cognito_sub, name, email, billing_address, tax_id,
                   policies_accepted_at, policies_version, created_at
            FROM customers WHERE id = ?
            """,
            (customer_id,),
        ).fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        subscriptions = [
            dict(row)
            for row in conn.execute(
                """
                SELECT subscriptions.id, subscriptions.status, subscriptions.provider,
                       subscriptions.amount_cents, subscriptions.currency, subscriptions.interval,
                       subscriptions.auto_renew, subscriptions.cancel_at_period_end,
                       subscriptions.current_period_start, subscriptions.current_period_end,
                       plans.name AS plan_name
                FROM subscriptions
                JOIN plans ON plans.id = subscriptions.plan_id
                WHERE subscriptions.customer_id = ?
                ORDER BY subscriptions.id DESC
                """,
                (customer_id,),
            ).fetchall()
        ]
        checkouts = [
            dict(row)
            for row in conn.execute(
                """
                SELECT checkout_sessions.id, checkout_sessions.plan_id, plans.name AS plan_name,
                       checkout_sessions.provider, checkout_sessions.status, checkout_sessions.provider_checkout_id,
                       checkout_sessions.approval_url, checkout_sessions.subscription_id,
                       checkout_sessions.amount_cents, checkout_sessions.currency, checkout_sessions.interval,
                       checkout_sessions.billing_address, checkout_sessions.tax_id,
                       checkout_sessions.policies_accepted_at, checkout_sessions.policies_version
                FROM checkout_sessions
                JOIN plans ON plans.id = checkout_sessions.plan_id
                WHERE checkout_sessions.customer_id = ?
                ORDER BY checkout_sessions.id DESC
                """,
                (customer_id,),
            ).fetchall()
        ]
        notifications = [
            dict(row)
            for row in conn.execute(
                """
                SELECT id, plan_id, subscription_id, type, title, body, status, created_at
                FROM notifications
                WHERE customer_id = ?
                ORDER BY created_at DESC
                """,
                (customer_id,),
            ).fetchall()
        ]
    return {"customer": dict(customer), "subscriptions": subscriptions, "checkouts": checkouts, "notifications": notifications}


@app.patch("/customers/{customer_id}")
def update_customer(customer_id: str, payload: CustomerUpdate) -> dict:
    current = rows("SELECT id, cognito_sub, name, email FROM customers WHERE id = ?", (customer_id,))
    if not current:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    values = current[0]
    name = payload.name.strip() if payload.name is not None else values["name"]
    email = payload.email.strip().lower() if payload.email is not None else values["email"]
    cognito_sub = payload.cognito_sub.strip() if payload.cognito_sub else None
    name, email, cognito_sub = normalize_customer_values(name, email, cognito_sub if payload.cognito_sub is not None else values["cognito_sub"])
    try:
        with connection() as conn:
            conn.execute(
                "UPDATE customers SET name = ?, email = ?, cognito_sub = ? WHERE id = ?",
                (name, email, cognito_sub, customer_id),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese correo") from exc
    return {"id": customer_id, "cognito_sub": cognito_sub, "name": name, "email": email}


@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: str) -> dict[str, str]:
    if customer_id == "customer-local":
        raise HTTPException(status_code=409, detail="El usuario demo local no se puede eliminar")
    with connection() as conn:
        customer = conn.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        linked_counts = {
            "subscriptions": conn.execute("SELECT COUNT(*) FROM subscriptions WHERE customer_id = ?", (customer_id,)).fetchone()[0],
            "checkouts": conn.execute("SELECT COUNT(*) FROM checkout_sessions WHERE customer_id = ?", (customer_id,)).fetchone()[0],
            "notifications": conn.execute("SELECT COUNT(*) FROM notifications WHERE customer_id = ?", (customer_id,)).fetchone()[0],
        }
        if any(linked_counts.values()):
            raise HTTPException(
                status_code=409,
                detail="No se puede eliminar: el cliente tiene historial de suscripciones, pagos o notificaciones",
            )
        conn.execute("DELETE FROM auth_recovery_tokens WHERE customer_id = ?", (customer_id,))
        conn.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
        conn.commit()
    return {"id": customer_id, "status": "deleted"}


@app.post("/auth/register", status_code=201)
def register_customer(payload: CustomerRegistration) -> dict[str, object]:
    if not settings.local_auth_enabled:
        raise HTTPException(status_code=501, detail="Este entorno utilizará Cognito para el alta de usuarios")
    if payload.password != payload.password_confirmation:
        raise HTTPException(status_code=422, detail="Las contraseñas no coinciden")
    name, email, _ = normalize_customer_values(payload.name, payload.email)
    customer_id = f"customer-{uuid4().hex[:12]}"
    try:
        with connection() as conn:
            conn.execute(
                "INSERT INTO customers (id, cognito_sub, name, email, password_hash) VALUES (?, ?, ?, ?, ?)",
                (customer_id, None, name, email, hash_password(payload.password)),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo") from exc
    return {
        "access_token": create_local_access_token(customer_id),
        "token_type": "bearer",
        "user": {"id": customer_id, "name": name, "email": email},
        "subscription_count": 0,
    }


@app.post("/auth/forgot-password")
def forgot_password(payload: PasswordRecoveryRequest) -> dict[str, str]:
    if not settings.local_auth_enabled:
        raise HTTPException(status_code=501, detail="La recuperación se gestionará mediante Cognito en este entorno")
    response: dict[str, str] = {
        "message": "Si el correo existe, se ha generado una instrucción de recuperación.",
    }
    customer = rows("SELECT id FROM customers WHERE lower(email) = lower(?)", (payload.email.strip(),))
    if not customer:
        return response

    raw_token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).replace(microsecond=0).isoformat()
    with connection() as conn:
        conn.execute(
            "INSERT INTO auth_recovery_tokens (id, customer_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
            (f"recovery-{uuid4().hex[:12]}", customer[0]["id"], hash_recovery_token(raw_token), expires_at),
        )
        conn.commit()
    if settings.app_env == AppEnvironment.DEVELOPMENT:
        response["reset_token"] = raw_token
    return response


@app.post("/auth/reset-password")
def reset_password(payload: PasswordReset) -> dict[str, str]:
    if not settings.local_auth_enabled:
        raise HTTPException(status_code=501, detail="La recuperación se gestionará mediante Cognito en este entorno")
    token_rows = rows(
        """
        SELECT id, customer_id, expires_at, used_at
        FROM auth_recovery_tokens
        WHERE token_hash = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (hash_recovery_token(payload.token),),
    )
    if not token_rows:
        raise HTTPException(status_code=400, detail="El token de recuperación no es válido")
    token_row = token_rows[0]
    expires_at = datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if token_row["used_at"] or expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="El token de recuperación ha caducado o ya se ha utilizado")

    with connection() as conn:
        conn.execute(
            "UPDATE customers SET password_hash = ? WHERE id = ?",
            (hash_password(payload.password), token_row["customer_id"]),
        )
        conn.execute(
            "UPDATE auth_recovery_tokens SET used_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).replace(microsecond=0).isoformat(), token_row["id"]),
        )
        conn.commit()
    return {"message": "Contraseña actualizada correctamente"}


@app.patch("/plans/{plan_id}/price")
def update_plan_price(plan_id: str, payload: PlanPriceUpdate) -> dict:
    plan = rows(
        "SELECT id, name, amount_cents, currency, interval FROM plans WHERE id = ? AND active = 1",
        (plan_id,),
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Price change confirmation is required")

    current = plan[0]
    if payload.amount_cents == current["amount_cents"]:
        raise HTTPException(status_code=400, detail="The new price is equal to the current price")

    with connection() as conn:
        conn.execute(
            "UPDATE plans SET amount_cents = ? WHERE id = ?",
            (payload.amount_cents, plan_id),
        )
        recipients = conn.execute(
            """
            SELECT id, customer_id, current_period_end
            FROM subscriptions
            WHERE plan_id = ?
              AND status IN ('pending', 'active', 'grace_period', 'suspended')
            """,
            (plan_id,),
        ).fetchall()
        old_price = current["amount_cents"] / 100
        new_price = payload.amount_cents / 100
        body = (
            f"El plan {current['name']} cambiará de {old_price:.2f} {current['currency']} "
            f"a {new_price:.2f} {current['currency']}. Tu suscripción actual conservará su precio "
            "hasta el final del periodo vigente. La renovación automática queda pausada hasta "
            "que aceptes el nuevo precio o canceles la suscripción."
        )
        for recipient in recipients:
            conn.execute(
                """
                INSERT INTO notifications (id, customer_id, plan_id, subscription_id, type, title, body, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"notification-{uuid4().hex[:12]}",
                    recipient["customer_id"],
                    plan_id,
                    recipient["id"],
                    "plan_price_change",
                    "Cambio de precio de tu suscripción",
                    body,
                    "pending",
                ),
            )
            conn.execute(
                """
                UPDATE subscriptions
                SET auto_renew = 0, cancel_at_period_end = 1
                WHERE id = ?
                """,
                (recipient["id"],),
            )
        conn.commit()

    return {
        "plan_id": plan_id,
        "old_amount_cents": current["amount_cents"],
        "new_amount_cents": payload.amount_cents,
        "active_subscriptions_unchanged": len(recipients),
        "notifications_queued": len(recipients),
    }


@app.get("/notifications")
def list_notifications() -> list[dict]:
    return rows(
        """
        SELECT notifications.id, notifications.customer_id,
               customers.cognito_sub AS user_id, customers.name AS customer_name,
               customers.email AS customer_email, notifications.plan_id,
               notifications.subscription_id,
               plans.name AS plan_name, notifications.type, notifications.title,
               notifications.body, notifications.status, notifications.created_at
        FROM notifications
        JOIN customers ON customers.id = notifications.customer_id
        JOIN plans ON plans.id = notifications.plan_id
        ORDER BY notifications.created_at DESC
        """
    )


@app.get("/notifications/me")
def list_my_notifications(authorization: str | None = Header(default=None)) -> list[dict]:
    customer_id = authenticated_customer_id(authorization)
    return rows(
        """
        SELECT id, plan_id, subscription_id, type, title, body, status, created_at
        FROM notifications
        WHERE customer_id = ?
        ORDER BY created_at DESC
        """,
        (customer_id,),
    )


@app.get("/subscriptions")
def list_subscriptions() -> list[dict]:
    return rows(
        """
        SELECT subscriptions.id, subscriptions.customer_id, subscriptions.plan_id,
               customers.cognito_sub AS user_id, customers.name AS customer_name,
               customers.email AS customer_email, subscriptions.status,
               subscriptions.provider, plans.name AS plan_name,
               subscriptions.amount_cents, subscriptions.currency, subscriptions.interval,
               subscriptions.auto_renew, subscriptions.cancel_at_period_end,
               subscriptions.current_period_end
        FROM subscriptions
        JOIN plans ON plans.id = subscriptions.plan_id
        JOIN customers ON customers.id = subscriptions.customer_id
        ORDER BY subscriptions.id
        """
    )


@app.get("/subscriptions/me")
def list_my_subscriptions(authorization: str | None = Header(default=None)) -> list[dict]:
    customer_id = authenticated_customer_id(authorization)
    return rows(
        """
        SELECT subscriptions.id, subscriptions.customer_id, subscriptions.plan_id,
               customers.cognito_sub AS user_id, customers.name AS customer_name,
               customers.email AS customer_email, subscriptions.status,
               subscriptions.provider, plans.name AS plan_name,
               subscriptions.amount_cents, subscriptions.currency, subscriptions.interval,
               subscriptions.auto_renew, subscriptions.cancel_at_period_end,
               subscriptions.current_period_end
        FROM subscriptions
        JOIN plans ON plans.id = subscriptions.plan_id
        JOIN customers ON customers.id = subscriptions.customer_id
        WHERE subscriptions.customer_id = ?
        ORDER BY subscriptions.id
        """,
        (customer_id,),
    )


@app.get("/checkout/subscriptions/me")
def list_my_pending_checkouts(authorization: str | None = Header(default=None)) -> list[dict]:
    customer_id = authenticated_customer_id(authorization)
    return rows(
        """
        SELECT checkout_sessions.id, checkout_sessions.customer_id, checkout_sessions.plan_id,
               checkout_sessions.provider, checkout_sessions.status,
               checkout_sessions.provider_checkout_id, checkout_sessions.approval_url,
               checkout_sessions.amount_cents, checkout_sessions.currency,
               checkout_sessions.interval, plans.name AS plan_name
        FROM checkout_sessions
        JOIN plans ON plans.id = checkout_sessions.plan_id
        WHERE checkout_sessions.customer_id = ?
          AND checkout_sessions.status IN ('created', 'approval_pending')
        ORDER BY checkout_sessions.id DESC
        """,
        (customer_id,),
    )


@app.post("/checkout/subscriptions/{checkout_id}/cancel")
def cancel_pending_checkout(checkout_id: str, authorization: str | None = Header(default=None)) -> dict[str, str]:
    customer_id = authenticated_customer_id(authorization)
    checkout = rows(
        """
        SELECT id, customer_id, provider, status, provider_checkout_id
        FROM checkout_sessions
        WHERE id = ?
        """,
        (checkout_id,),
    )
    if not checkout:
        raise HTTPException(status_code=404, detail="Checkout no encontrado")
    session = checkout[0]
    if session["customer_id"] != customer_id:
        raise HTTPException(status_code=403, detail="El checkout no pertenece al usuario autenticado")
    if session["status"] not in {"created", "approval_pending"}:
        raise HTTPException(status_code=409, detail="El checkout ya no está pendiente")

    if session["provider"] == "paypal" and settings.payment_provider == "paypal" and session["provider_checkout_id"]:
        try:
            provider_subscription = paypal_get_subscription(session["provider_checkout_id"])
            if provider_subscription.get("status") == "ACTIVE":
                raise HTTPException(
                    status_code=409,
                    detail="PayPal ya ha aprobado este checkout. Comprueba su estado antes de reiniciarlo.",
                )
            try:
                paypal_cancel_subscription(session["provider_checkout_id"], "Checkout cancelado por el usuario")
            except PayPalAPIError as exc:
                # PayPal Sandbox can return 404 for a subscription that is still
                # APPROVAL_PENDING. It is not an active billing agreement, so the
                # local checkout must still be released for the user. The checkout
                # is also blocked locally from being completed if an old PayPal
                # approval link is used later.
                if exc.status_code != 404 or provider_subscription.get("status") not in {"APPROVAL_PENDING", "APPROVED"}:
                    raise
        except HTTPException:
            raise
        except (PayPalConfigurationError, PayPalAPIError) as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    with connection() as conn:
        conn.execute("UPDATE checkout_sessions SET status = 'cancelled' WHERE id = ?", (checkout_id,))
        conn.commit()
    return {"id": checkout_id, "status": "cancelled"}


@app.post("/checkout/subscriptions", status_code=201)
def create_subscription_checkout(payload: CheckoutCreate, authorization: str | None = Header(default=None)) -> dict:
    customer_id = authenticated_customer_id(authorization)
    billing_address = payload.billing_address.strip()
    tax_id = payload.tax_id.strip().upper()
    if not billing_address:
        raise HTTPException(status_code=422, detail="La dirección de facturación es obligatoria")
    try:
        tax_id = normalize_spanish_person_id(tax_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not payload.policies_accepted:
        raise HTTPException(status_code=422, detail="Debes aceptar las políticas para continuar")
    plan = rows(
        "SELECT id, amount_cents, currency, interval, tier FROM plans WHERE id = ? AND active = 1",
        (payload.plan_id,),
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    existing = rows(
        """
        SELECT id, status
        FROM subscriptions
        WHERE customer_id = ?
          AND status IN ('pending', 'active', 'grace_period', 'suspended')
        ORDER BY id
        LIMIT 1
        """,
        (customer_id,),
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"El usuario ya tiene una suscripción vigente ({existing[0]['status']}).",
        )
    open_checkout = rows(
        """
        SELECT id FROM checkout_sessions
        WHERE customer_id = ? AND status IN ('created', 'approval_pending')
        ORDER BY rowid DESC LIMIT 1
        """,
        (customer_id,),
    )
    if open_checkout:
        raise HTTPException(status_code=409, detail="Ya hay un checkout de suscripción pendiente para este usuario.")

    checkout_id = f"checkout-{uuid4().hex[:12]}"
    policies_accepted_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    try:
        with connection() as conn:
            conn.execute(
                """
                UPDATE customers
                SET billing_address = ?, tax_id = ?,
                    policies_accepted_at = ?, policies_version = ?
                WHERE id = ?
                """,
                (billing_address, tax_id, policies_accepted_at, POLICIES_VERSION, customer_id),
            )
            conn.execute(
                """
                INSERT INTO checkout_sessions
                    (id, customer_id, plan_id, provider, status, amount_cents, currency, interval,
                     billing_address, tax_id, policies_accepted_at, policies_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    checkout_id,
                    customer_id,
                    payload.plan_id,
                    settings.payment_provider,
                    "created",
                    plan[0]["amount_cents"],
                    plan[0]["currency"],
                    plan[0]["interval"],
                    billing_address,
                    tax_id,
                    policies_accepted_at,
                    POLICIES_VERSION,
                ),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="El usuario ya tiene una suscripción vigente.") from exc

    if settings.payment_provider == "paypal":
        try:
            provider_subscription_id, _approval_url = paypal_create_subscription(
                tier=plan[0]["tier"],
                checkout_id=checkout_id,
                name=rows("SELECT name FROM customers WHERE id = ?", (customer_id,))[0]["name"],
                email=rows("SELECT email FROM customers WHERE id = ?", (customer_id,))[0]["email"],
            )
        except (PayPalConfigurationError, PayPalAPIError) as exc:
            with connection() as conn:
                conn.execute("UPDATE checkout_sessions SET status = 'failed' WHERE id = ?", (checkout_id,))
                conn.commit()
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        with connection() as conn:
            conn.execute(
                "UPDATE checkout_sessions SET status = 'approval_pending', provider_checkout_id = ?, approval_url = NULL WHERE id = ?",
                (provider_subscription_id, checkout_id),
            )
            conn.commit()
        return {
            "checkout_id": checkout_id,
            "status": "approval_pending",
            "provider": settings.payment_provider,
            "approval_url": None,
            "provider_subscription_id": provider_subscription_id,
        }

    if settings.payment_provider != "local":
        raise HTTPException(status_code=501, detail=f"Proveedor de pago no soportado: {settings.payment_provider}")
    return {
        "checkout_id": checkout_id,
        "status": "created",
        "provider": settings.payment_provider,
        "approval_url": None,
    }


@app.post("/checkout/subscriptions/{checkout_id}/paypal")
def register_paypal_subscription(
    checkout_id: str,
    payload: PayPalSubscriptionRegistration,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    customer_id = authenticated_customer_id(authorization)
    checkout = rows(
        """
        SELECT id, customer_id, provider, status, provider_checkout_id
        FROM checkout_sessions
        WHERE id = ?
        """,
        (checkout_id,),
    )
    if not checkout:
        raise HTTPException(status_code=404, detail="Checkout no encontrado")
    session = checkout[0]
    if session["customer_id"] != customer_id:
        raise HTTPException(status_code=403, detail="El checkout no pertenece al usuario autenticado")
    if session["provider"] != "paypal":
        raise HTTPException(status_code=409, detail="Este checkout no utiliza PayPal")
    if session["status"] not in {"created", "approval_pending"}:
        raise HTTPException(status_code=409, detail="El checkout ya no está pendiente")
    if session["provider_checkout_id"] and session["provider_checkout_id"] != payload.provider_subscription_id:
        raise HTTPException(status_code=409, detail="El checkout ya está asociado a otra suscripción PayPal")

    with connection() as conn:
        conn.execute(
            """
            UPDATE checkout_sessions
            SET status = 'approval_pending', provider_checkout_id = ?, approval_url = NULL
            WHERE id = ?
            """,
            (payload.provider_subscription_id, checkout_id),
        )
        conn.commit()
    return {"checkout_id": checkout_id, "status": "approval_pending", "provider_subscription_id": payload.provider_subscription_id}


@app.post("/checkout/subscriptions/{checkout_id}/complete", status_code=201)
def complete_subscription_checkout(
    checkout_id: str,
    payload: LocalPaymentSimulation | None = None,
    authorization: str | None = Header(default=None),
) -> dict:
    customer_id = authenticated_customer_id(authorization)
    checkout = rows(
        """
        SELECT id, customer_id, plan_id, provider, status,
               provider_checkout_id, subscription_id, amount_cents, currency, interval
        FROM checkout_sessions
        WHERE id = ?
        """,
        (checkout_id,),
    )
    if not checkout:
        raise HTTPException(status_code=404, detail="Checkout session not found")
    session = checkout[0]
    if session["customer_id"] != customer_id:
        raise HTTPException(status_code=403, detail="El checkout no pertenece al usuario autenticado")
    if session["status"] == "approved":
        return {"checkout_id": checkout_id, "subscription_id": session.get("subscription_id"), "status": "active"}
    if session["status"] not in {"created", "approval_pending"}:
        raise HTTPException(status_code=409, detail="Checkout session is not available")

    if session["provider"] == "local" and settings.payment_provider != "local":
        raise HTTPException(
            status_code=409,
            detail="Este checkout se creó con el proveedor local. Cancélalo y crea uno nuevo para pagar con PayPal.",
        )

    if session["provider"] == "local":
        if payload is None or not payload.confirmed:
            raise HTTPException(status_code=422, detail="Confirma el pago simulado dentro de la aplicación")

    if session["provider"] == "paypal":
        if not session["provider_checkout_id"]:
            raise HTTPException(status_code=409, detail="PayPal no ha creado todavía la suscripción")
        try:
            provider_subscription = paypal_get_subscription(session["provider_checkout_id"])
        except (PayPalConfigurationError, PayPalAPIError) as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if provider_subscription.get("status") != "ACTIVE":
            provider_status = provider_subscription.get("status", "UNKNOWN")
            raise HTTPException(status_code=409, detail=f"PayPal todavía no ha confirmado la suscripción (estado: {provider_status}).")
        subscription_id = f"sub-{uuid4().hex[:12]}"
        period_start = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        period_end = add_subscription_period(period_start, session["interval"])
        try:
            with connection() as conn:
                conn.execute(
                    """
                    INSERT INTO subscriptions
                        (id, customer_id, plan_id, status, provider, provider_subscription_id,
                         amount_cents, currency, interval, auto_renew, cancel_at_period_end,
                         current_period_start, current_period_end)
                    VALUES (?, ?, ?, 'active', 'paypal', ?, ?, ?, ?, 1, 0, ?, ?)
                    """,
                    (subscription_id, session["customer_id"], session["plan_id"], session["provider_checkout_id"], session["amount_cents"], session["currency"], session["interval"], period_start, period_end),
                )
                conn.execute("UPDATE checkout_sessions SET status = 'approved', subscription_id = ? WHERE id = ?", (subscription_id, checkout_id))
                conn.commit()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="El usuario ya tiene una suscripción vigente.") from exc
        return {"checkout_id": checkout_id, "subscription_id": subscription_id, "status": "active"}

    if session["provider"] != "local":
        raise HTTPException(status_code=501, detail="External payment provider is not configured yet")

    existing = rows(
        """
        SELECT id, status
        FROM subscriptions
        WHERE customer_id = ?
          AND status IN ('pending', 'active', 'grace_period', 'suspended')
        LIMIT 1
        """,
        (customer_id,),
    )
    if existing:
        raise HTTPException(status_code=409, detail="El usuario ya tiene una suscripción vigente.")

    subscription_id = f"sub-{uuid4().hex[:12]}"
    period_start = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    period_end = add_subscription_period(period_start, session["interval"])
    try:
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO subscriptions
                    (id, customer_id, plan_id, status, provider, amount_cents, currency, interval,
                     auto_renew, cancel_at_period_end, current_period_start, current_period_end)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    subscription_id,
                    session["customer_id"],
                    session["plan_id"],
                    "active",
                    session["provider"],
                    session["amount_cents"],
                    session["currency"],
                    session["interval"],
                    1,
                    0,
                    period_start,
                    period_end,
                ),
            )
            conn.execute(
                "UPDATE checkout_sessions SET status = ?, subscription_id = ? WHERE id = ?",
                ("approved", subscription_id, checkout_id),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="El usuario ya tiene una suscripción vigente.") from exc
    return {"checkout_id": checkout_id, "subscription_id": subscription_id, "status": "active"}


@app.post("/subscriptions", status_code=409)
def direct_subscription_creation(_: SubscriptionCreate) -> None:
    raise HTTPException(status_code=409, detail="Subscriptions must be created through the payment checkout")


@app.patch("/subscriptions/{subscription_id}/status")
def update_subscription_status(subscription_id: str, payload: SubscriptionStatusUpdate) -> dict:
    with connection() as conn:
        result = conn.execute(
            "UPDATE subscriptions SET status = ? WHERE id = ?",
            (payload.status, subscription_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Subscription not found")
        conn.commit()
    return {"id": subscription_id, "status": payload.status}


@app.post("/subscriptions/{subscription_id}/cancel")
def cancel_subscription(subscription_id: str) -> dict:
    subscription = rows(
        "SELECT provider, provider_subscription_id FROM subscriptions WHERE id = ? AND status IN ('active', 'grace_period', 'suspended')",
        (subscription_id,),
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found or already scheduled for cancellation")
    if subscription[0]["provider"] == "paypal" and subscription[0]["provider_subscription_id"]:
        try:
            paypal_cancel_subscription(subscription[0]["provider_subscription_id"], "Cancelación solicitada por el usuario")
        except (PayPalConfigurationError, PayPalAPIError) as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    with connection() as conn:
        result = conn.execute(
            """
            UPDATE subscriptions
            SET auto_renew = 0, cancel_at_period_end = 1
            WHERE id = ? AND status IN ('active', 'grace_period', 'suspended')
            """,
            (subscription_id,),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Subscription not found or already scheduled for cancellation")
        conn.commit()
    return rows(
        "SELECT id, status, auto_renew, cancel_at_period_end, current_period_end FROM subscriptions WHERE id = ?",
        (subscription_id,),
    )[0]


@app.post("/subscriptions/{subscription_id}/accept-price-change")
def accept_price_change(subscription_id: str) -> dict:
    subscription = rows(
        """
        SELECT subscriptions.id, subscriptions.plan_id, subscriptions.status,
               subscriptions.amount_cents, plans.amount_cents AS current_amount_cents,
               plans.currency, plans.interval
        FROM subscriptions
        JOIN plans ON plans.id = subscriptions.plan_id
        WHERE subscriptions.id = ?
        """,
        (subscription_id,),
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    current = subscription[0]
    if current["status"] not in {"active", "grace_period", "suspended"}:
        raise HTTPException(status_code=409, detail="Subscription is not renewable")
    if current["amount_cents"] == current["current_amount_cents"]:
        raise HTTPException(status_code=409, detail="There is no pending price change")

    with connection() as conn:
        conn.execute(
            """
            UPDATE subscriptions
            SET amount_cents = ?, currency = ?, interval = ?,
                auto_renew = 1, cancel_at_period_end = 0
            WHERE id = ?
            """,
            (
                current["current_amount_cents"],
                current["currency"],
                current["interval"],
                subscription_id,
            ),
        )
        conn.execute(
            "UPDATE notifications SET status = 'read' WHERE subscription_id = ? AND type = 'plan_price_change'",
            (subscription_id,),
        )
        conn.commit()
    return {
        "id": subscription_id,
        "status": current["status"],
        "auto_renew": True,
        "amount_cents": current["current_amount_cents"],
    }


@app.post("/webhooks/paypal")
def paypal_webhook_placeholder(_: dict) -> dict[str, str]:
    """Development placeholder; production must verify PayPal signatures."""
    return {"received": "true", "environment": settings.app_env.value}


@app.get("/checkout/paypal/return", response_class=HTMLResponse)
def paypal_return(checkout_id: str = Query(min_length=1)) -> HTMLResponse:
    safe_checkout_id = escape(checkout_id)
    return HTMLResponse(
        f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>PayPal aprobado</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="font-family:system-ui;max-width:620px;margin:48px auto;padding:0 20px;color:#0f172a">
        <h1>Autorización recibida</h1><p>PayPal ha devuelto el checkout <strong>{safe_checkout_id}</strong>.</p>
        <p>Vuelve a Subscription System. La aplicación validará automáticamente el resultado con PayPal.</p>
        </body></html>"""
    )


@app.get("/checkout/paypal/cancel", response_class=HTMLResponse)
def paypal_cancel(checkout_id: str = Query(min_length=1)) -> HTMLResponse:
    # PayPal redirects here when the buyer cancels before approval. Persist that
    # outcome as well as showing the confirmation page; otherwise the app would
    # keep rendering the same pending checkout after the user returns.
    with connection() as conn:
        conn.execute(
            """
            UPDATE checkout_sessions
            SET status = 'cancelled'
            WHERE id = ?
              AND provider = 'paypal'
              AND status IN ('created', 'approval_pending')
            """,
            (checkout_id,),
        )
        conn.commit()
    safe_checkout_id = escape(checkout_id)
    return HTMLResponse(
        f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>PayPal cancelado</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="font-family:system-ui;max-width:620px;margin:48px auto;padding:0 20px;color:#0f172a">
        <h1>Checkout cancelado</h1><p>No se ha activado ninguna suscripción para el checkout <strong>{safe_checkout_id}</strong>.</p>
        <p>Puedes cerrar esta ventana y volver a la aplicación.</p>
        </body></html>"""
    )
