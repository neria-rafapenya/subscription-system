"""Backend del módulo de Gestoría.

El motor común aporta autenticación de clientes, suscripciones y persistencia
local. Este archivo contiene exclusivamente las tablas, rutas y reglas de la
vertical de gestoría. El chatbot queda preparado con una respuesta simulada
para conectar más adelante un proveedor de IA.
"""

from __future__ import annotations

import secrets
import importlib.util
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field


_scheduler_spec = importlib.util.spec_from_file_location(
    "subscription_vertical_gestoria_scheduler",
    Path(__file__).with_name("scheduler.py"),
)
if _scheduler_spec is None or _scheduler_spec.loader is None:
    raise RuntimeError("No se puede cargar el adaptador de agenda de Gestoría")
_scheduler_module = importlib.util.module_from_spec(_scheduler_spec)
_scheduler_spec.loader.exec_module(_scheduler_module)
get_scheduler = _scheduler_module.get_scheduler

_erp_spec = importlib.util.spec_from_file_location(
    "subscription_vertical_gestoria_erp",
    Path(__file__).with_name("erp.py"),
)
if _erp_spec is None or _erp_spec.loader is None:
    raise RuntimeError("No se puede cargar el adaptador ERP de Gestoría")
_erp_module = importlib.util.module_from_spec(_erp_spec)
_erp_spec.loader.exec_module(_erp_module)
get_erp_adapter = _erp_module.get_erp_adapter

MAX_BASIC_DOCUMENT_SIZE = 2 * 1024 * 1024
MAX_PREMIUM_DOCUMENT_SIZE = 250 * 1024 * 1024
APPOINTMENT_STATUSES = "^(requested|confirmed|cancelled|completed)$"
NOTIFICATION_STATUSES = "^(scheduled|due|sent|cancelled)$"
MESSAGE_TYPES = "^(normal|urgent|informativo|respuesta)$"
PROCEDURE_STATUSES = "^(in_progress|waiting|completed|rejected|cancelled)$"
LABOR_REQUEST_TYPES = "^(vacaciones|alta|incidencia|nomina)$"
LABOR_REQUEST_STATUSES = "^(submitted|in_review|completed|rejected|cancelled)$"


class AppointmentCreate(BaseModel):
    advisor_id: str
    modality: str = Field(pattern="^(presencial|videollamada|telefonica)$")
    scheduled_at: str = Field(min_length=10, max_length=80)
    reason: str = Field(min_length=3, max_length=500)


class AppointmentUpdate(BaseModel):
    advisor_id: str | None = None
    modality: str | None = Field(default=None, pattern="^(presencial|videollamada|telefonica)$")
    scheduled_at: str | None = Field(default=None, min_length=10, max_length=80)
    reason: str | None = Field(default=None, min_length=3, max_length=500)
    status: str | None = Field(default=None, pattern=APPOINTMENT_STATUSES)


class BackofficeAppointmentCreate(AppointmentCreate):
    customer_id: str
    status: str = Field(default="confirmed", pattern=APPOINTMENT_STATUSES)


class ClientProfileUpdate(BaseModel):
    company_name: str | None = Field(default=None, max_length=200)
    tax_regime: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=3000)


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    category: str | None = Field(default=None, min_length=2, max_length=80)


class MessageCreate(BaseModel):
    customer_id: str | None = None
    subject: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=1, max_length=4000)
    message_type: str = Field(default="normal", pattern=MESSAGE_TYPES)
    reply_to_id: str | None = None


class MessageUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=2, max_length=160)
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    read: bool | None = None
    message_type: str | None = Field(default=None, pattern=MESSAGE_TYPES)


class NotificationCreate(BaseModel):
    customer_id: str
    appointment_id: str | None = None
    type: str = Field(min_length=2, max_length=60)
    title: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=1, max_length=4000)
    scheduled_for: str = Field(min_length=10, max_length=80)
    status: str = Field(default="scheduled", pattern=NOTIFICATION_STATUSES)


class NotificationUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=2, max_length=60)
    title: str | None = Field(default=None, min_length=2, max_length=160)
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    scheduled_for: str | None = Field(default=None, min_length=10, max_length=80)
    status: str | None = Field(default=None, pattern=NOTIFICATION_STATUSES)
    read: bool | None = None


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ProcedureCreate(BaseModel):
    customer_id: str
    title: str = Field(min_length=2, max_length=200)
    procedure_type: str = Field(min_length=2, max_length=100)
    status: str = Field(default="in_progress", pattern=PROCEDURE_STATUSES)
    progress: int = Field(default=0, ge=0, le=100)
    result: str | None = Field(default=None, max_length=4000)


class ProcedureUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    procedure_type: str | None = Field(default=None, min_length=2, max_length=100)
    status: str | None = Field(default=None, pattern=PROCEDURE_STATUSES)
    progress: int | None = Field(default=None, ge=0, le=100)
    result: str | None = Field(default=None, max_length=4000)


class LaborRequestCreate(BaseModel):
    request_type: str = Field(pattern=LABOR_REQUEST_TYPES)
    subject: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=3, max_length=4000)
    period_start: str | None = Field(default=None, max_length=40)
    period_end: str | None = Field(default=None, max_length=40)


class BackofficeLaborRequestCreate(LaborRequestCreate):
    customer_id: str


class LaborRequestUpdate(BaseModel):
    request_type: str | None = Field(default=None, pattern=LABOR_REQUEST_TYPES)
    subject: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, min_length=3, max_length=4000)
    period_start: str | None = Field(default=None, max_length=40)
    period_end: str | None = Field(default=None, max_length=40)
    status: str | None = Field(default=None, pattern=LABOR_REQUEST_STATUSES)


def register(app, context):
    connection = context["connection"]
    authenticated_customer_id = context["authenticated_customer_id"]
    settings = context["settings"]
    router = APIRouter(prefix="/modules/gestoria", tags=["gestoria"])
    schema_path = Path(__file__).with_name("schema.sql")

    with connection() as conn:
        conn.executescript(schema_path.read_text(encoding="utf-8"))
        for table, column, definition in (
            ("gestoria_messages", "message_type", "TEXT NOT NULL DEFAULT 'normal'"),
            ("gestoria_messages", "reply_to_id", "TEXT"),
            ("gestoria_notifications", "read_at", "TEXT"),
        ):
            existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        conn.executemany(
            "INSERT OR IGNORE INTO gestoria_advisors (id, name, specialty) VALUES (?, ?, ?)",
            [
                ("advisor-fiscal", "Ana Martín", "Asesoría fiscal"),
                ("advisor-contable", "Javier Gómez", "Contabilidad"),
                ("advisor-laboral", "Laura Sánchez", "Gestión laboral"),
            ],
        )
        conn.commit()

    def now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def normalize_datetime(value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="La fecha indicada no es válida") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()

    def rows(query: str, params: tuple = ()) -> list[dict]:
        with connection() as conn:
            return [dict(row) for row in conn.execute(query, params).fetchall()]

    def customer_id_from_header(authorization: str | None) -> str:
        return authenticated_customer_id(authorization)

    def subscription_tier(customer_id: str) -> str | None:
        active = rows(
            """
            SELECT plans.tier FROM subscriptions
            JOIN plans ON plans.id = subscriptions.plan_id
            WHERE subscriptions.customer_id = ?
              AND subscriptions.status IN ('active', 'grace_period')
            ORDER BY CASE plans.tier WHEN 'premium' THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (customer_id,),
        )
        return active[0]["tier"] if active else None

    def require_subscription(customer_id: str, minimum_tier: str = "basic") -> str:
        tier = subscription_tier(customer_id)
        if not tier:
            raise HTTPException(status_code=403, detail="Necesitas una suscripción activa para acceder a Gestoría")
        if minimum_tier == "premium" and tier != "premium":
            raise HTTPException(status_code=403, detail="Esta función requiere el plan Premium")
        return tier

    def require_backoffice(token: str | None) -> None:
        # En desarrollo el backoffice local está ligado al servicio local y no
        # pide un token adicional. En integración/producción la ruta queda
        # protegida hasta conectar el usuario admin con Cognito/RBAC.
        if settings.app_env.value == "development":
            return
        expected = settings.backoffice_admin_token
        if not expected or not token or not secrets.compare_digest(token, expected):
            raise HTTPException(status_code=403, detail="Se requiere autenticación administrativa")

    def mark_due_notifications(conn) -> None:
        conn.execute(
            "UPDATE gestoria_notifications SET status = 'due' WHERE status = 'scheduled' AND scheduled_for <= ?",
            (now(),),
        )

    def document_with_url(item: dict) -> dict:
        item["url"] = f"/media/{item['storage_key']}"
        return item

    def delete_stored_file(key: str | None) -> None:
        if not key:
            return
        storage_root = settings.file_storage_path.resolve()
        target = (settings.file_storage_path / key).resolve()
        if storage_root not in target.parents:
            return
        target.unlink(missing_ok=True)

    def save_document(customer_id: str, upload: UploadFile, max_size: int) -> tuple[str, str, str, int]:
        if not upload.filename:
            raise HTTPException(status_code=422, detail="El archivo no tiene nombre")
        content = upload.file.read(max_size + 1)
        if len(content) > max_size:
            limit = f"{max_size // (1024 * 1024)} MB"
            raise HTTPException(status_code=413, detail=f"El documento supera el límite de {limit} para tu suscripción")
        filename = Path(upload.filename).name
        suffix = Path(filename).suffix.lower() or ".bin"
        key = f"gestoria/documents/{customer_id}/{uuid4().hex}{suffix}"
        target = settings.file_storage_path / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return key, filename, upload.content_type or "application/octet-stream", len(content)

    def schedule_appointment_notifications(conn, customer_id: str, appointment_id: str, scheduled_at: str) -> None:
        conn.execute("DELETE FROM gestoria_notifications WHERE appointment_id = ? AND type IN ('48h', '2h')", (appointment_id,))
        appointment_time = datetime.fromisoformat(scheduled_at)
        for reminder_type, offset, title, body in (
            ("48h", timedelta(hours=48), "Recordatorio de cita", "Tu cita con la gestoría es dentro de 48 horas."),
            ("2h", timedelta(hours=2), "Cita próxima", "Tu cita con la gestoría comienza aproximadamente en 2 horas."),
        ):
            conn.execute(
                "INSERT INTO gestoria_notifications (id, customer_id, appointment_id, type, title, body, scheduled_for) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"notification-{uuid4().hex[:16]}", customer_id, appointment_id, reminder_type, title, body, (appointment_time - offset).isoformat()),
            )

    def customer_exists(customer_id: str) -> bool:
        return bool(rows("SELECT id FROM customers WHERE id = ?", (customer_id,)))

    def sync_entity(entity_type: str, entity_id: str, payload: dict) -> dict[str, str]:
        """Register every persistent module entity in the ERP synchronization boundary."""
        provider = settings.gestoria_erp_provider
        try:
            result = get_erp_adapter(provider).sync(entity_type, entity_id, payload)
            last_error = None
        except RuntimeError as exc:
            result = {
                "external_id": "",
                "sync_status": "pending",
                "last_synced_at": "",
            }
            last_error = str(exc)
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO gestoria_erp_links
                    (entity_type, entity_id, external_id, provider, sync_status, last_synced_at, last_error)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(entity_type, entity_id) DO UPDATE SET
                    external_id = excluded.external_id,
                    provider = excluded.provider,
                    sync_status = excluded.sync_status,
                    last_synced_at = excluded.last_synced_at,
                    last_error = excluded.last_error
                """,
                (entity_type, entity_id, result["external_id"], provider, result["sync_status"], result["last_synced_at"] or None, last_error),
            )
            conn.commit()
        return {**result, "provider": provider}

    def sync_appointment_notifications(appointment_id: str) -> None:
        for notification in rows("SELECT * FROM gestoria_notifications WHERE appointment_id = ?", (appointment_id,)):
            sync_entity("notification", notification["id"], notification)

    def scheduler():
        try:
            return get_scheduler(settings.gestoria_scheduler_provider)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    def occupied_slots(advisor_id: str, exclude_id: str | None = None) -> set[str]:
        params: tuple = (advisor_id,)
        query = "SELECT scheduled_at FROM gestoria_appointments WHERE advisor_id = ? AND status NOT IN ('cancelled', 'completed')"
        if exclude_id:
            query += " AND id != ?"
            params = (advisor_id, exclude_id)
        return {
            normalize_datetime(item["scheduled_at"])
            for item in rows(query, params)
        }

    def ensure_available_slot(advisor_id: str, scheduled_at: str, exclude_id: str | None = None) -> None:
        if not scheduler().is_available(scheduled_at, advisor_id, occupied_slots(advisor_id, exclude_id)):
            raise HTTPException(status_code=409, detail="La fecha y hora ya no están disponibles. Selecciona otro horario")

    @router.get("/advisors")
    def advisors() -> list[dict]:
        return rows("SELECT id, name, specialty FROM gestoria_advisors WHERE active = 1 ORDER BY name")

    @router.get("/availability")
    def availability(
        start: str | None = Query(default=None),
        end: str | None = Query(default=None),
        advisor_id: str | None = Query(default=None),
        authorization: str | None = Header(default=None),
    ) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        try:
            start_date = date.fromisoformat(start) if start else date.today()
            end_date = date.fromisoformat(end) if end else start_date + timedelta(days=14)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="El intervalo de fechas no es válido") from exc
        if end_date < start_date or (end_date - start_date).days > 31:
            raise HTTPException(status_code=422, detail="El intervalo debe ser de hasta 31 días")
        if advisor_id and not rows("SELECT id FROM gestoria_advisors WHERE id = ? AND active = 1", (advisor_id,)):
            raise HTTPException(status_code=404, detail="Asesor no encontrado")
        advisor_ids = [advisor_id] if advisor_id else [item["id"] for item in rows("SELECT id FROM gestoria_advisors WHERE active = 1")]
        slots = []
        for current_advisor_id in advisor_ids:
            slots.extend(scheduler().available_slots(start_date, end_date, current_advisor_id, occupied_slots(current_advisor_id)))
        slots.sort(key=lambda item: item["scheduled_at"])
        return {"provider": scheduler().provider_name, "start": start_date.isoformat(), "end": end_date.isoformat(), "slots": slots}

    @router.get("/profile/me")
    def client_profile(authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        with connection() as conn:
            conn.execute("INSERT OR IGNORE INTO gestoria_client_profiles (customer_id) VALUES (?)", (customer_id,))
            conn.commit()
            return dict(conn.execute("SELECT * FROM gestoria_client_profiles WHERE customer_id = ?", (customer_id,)).fetchone())

    @router.get("/module-status")
    def module_status(authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        tier = require_subscription(customer_id)
        max_size = MAX_PREMIUM_DOCUMENT_SIZE if tier == "premium" else MAX_BASIC_DOCUMENT_SIZE
        return {
            "tier": tier,
            "max_document_size": max_size,
            "document_limit_label": f"{max_size // (1024 * 1024)} MB",
            "scheduler_provider": scheduler().provider_name,
            "erp_provider": settings.gestoria_erp_provider,
        }

    @router.patch("/profile/me")
    def update_client_profile(payload: ClientProfileUpdate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        values = payload.model_dump()
        with connection() as conn:
            conn.execute("INSERT OR IGNORE INTO gestoria_client_profiles (customer_id) VALUES (?)", (customer_id,))
            conn.execute("UPDATE gestoria_client_profiles SET company_name = ?, tax_regime = ?, notes = ?, updated_at = ? WHERE customer_id = ?", (values["company_name"], values["tax_regime"], values["notes"], now(), customer_id))
            conn.commit()
            profile = dict(conn.execute("SELECT * FROM gestoria_client_profiles WHERE customer_id = ?", (customer_id,)).fetchone())
        sync_entity("client_profile", customer_id, profile)
        return profile

    @router.get("/documents/me")
    def my_documents(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return [document_with_url(item) for item in rows("SELECT * FROM gestoria_documents WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,))]

    @router.post("/documents", status_code=201)
    def upload_document(title: str = Form(..., min_length=2, max_length=200), category: str = Form("general", min_length=2, max_length=80), document: UploadFile = File(...), authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        tier = require_subscription(customer_id)
        max_size = MAX_PREMIUM_DOCUMENT_SIZE if tier == "premium" else MAX_BASIC_DOCUMENT_SIZE
        storage_key, filename, content_type, size_bytes = save_document(customer_id, document, max_size)
        item = (f"document-{uuid4().hex[:16]}", customer_id, title.strip(), category.strip(), filename, content_type, size_bytes, storage_key, customer_id)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_documents (id, customer_id, title, category, filename, content_type, size_bytes, storage_key, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        document = dict(zip(("id", "customer_id", "title", "category", "filename", "content_type", "size_bytes", "storage_key", "uploaded_by"), item))
        sync_entity("document", document["id"], document)
        return document_with_url(document)

    @router.get("/procedures/me")
    def my_procedures(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return rows("SELECT procedures.*, links.external_id, links.provider AS erp_provider, links.sync_status AS erp_link_status FROM gestoria_procedures procedures LEFT JOIN gestoria_erp_links links ON links.entity_type = 'procedure' AND links.entity_id = procedures.id WHERE procedures.customer_id = ? ORDER BY procedures.updated_at DESC", (customer_id,))

    @router.get("/labor/requests/me")
    def my_labor_requests(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        return rows("SELECT requests.*, links.external_id, links.provider AS erp_provider, links.sync_status AS erp_link_status FROM gestoria_labor_requests requests LEFT JOIN gestoria_erp_links links ON links.entity_type = 'labor_request' AND links.entity_id = requests.id WHERE requests.customer_id = ? ORDER BY requests.created_at DESC", (customer_id,))

    @router.post("/labor/requests", status_code=201)
    def create_labor_request(payload: LaborRequestCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        request_id = f"labor-{uuid4().hex[:16]}"
        item = (request_id, customer_id, payload.request_type, payload.subject.strip(), payload.description.strip(), payload.period_start, payload.period_end)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_labor_requests (id, customer_id, request_type, subject, description, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync = sync_entity("labor_request", request_id, dict(zip(("id", "customer_id", "request_type", "subject", "description", "period_start", "period_end"), item)))
        with connection() as conn:
            conn.execute("UPDATE gestoria_labor_requests SET erp_external_id = ?, erp_sync_status = ?, updated_at = ? WHERE id = ?", (sync.get("external_id") or None, sync["sync_status"], now(), request_id))
            conn.commit()
        return {"id": request_id, "status": "submitted", **sync}

    @router.get("/appointments/me")
    def my_appointments(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return rows("SELECT appointments.*, advisors.name AS advisor_name, advisors.specialty FROM gestoria_appointments appointments JOIN gestoria_advisors advisors ON advisors.id = appointments.advisor_id WHERE appointments.customer_id = ? ORDER BY appointments.scheduled_at", (customer_id,))

    @router.post("/appointments", status_code=201)
    def create_appointment(payload: AppointmentCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        scheduled_at = normalize_datetime(payload.scheduled_at)
        ensure_available_slot(payload.advisor_id, scheduled_at)
        with connection() as conn:
            advisor = conn.execute("SELECT id, name, specialty FROM gestoria_advisors WHERE id = ? AND active = 1", (payload.advisor_id,)).fetchone()
            if not advisor:
                raise HTTPException(status_code=404, detail="Asesor no encontrado")
            appointment_id = f"appointment-{uuid4().hex[:16]}"
            conn.execute("INSERT INTO gestoria_appointments (id, customer_id, advisor_id, modality, scheduled_at, reason) VALUES (?, ?, ?, ?, ?, ?)", (appointment_id, customer_id, payload.advisor_id, payload.modality, scheduled_at, payload.reason.strip()))
            schedule_appointment_notifications(conn, customer_id, appointment_id, scheduled_at)
            conn.commit()
        sync_entity("appointment", appointment_id, {"id": appointment_id, "customer_id": customer_id, "advisor_id": payload.advisor_id, "modality": payload.modality, "scheduled_at": scheduled_at, "reason": payload.reason.strip(), "status": "requested"})
        sync_appointment_notifications(appointment_id)
        return {"id": appointment_id, "status": "requested", "scheduled_at": scheduled_at, "advisor_name": advisor["name"], "specialty": advisor["specialty"]}

    @router.patch("/appointments/{appointment_id}")
    def update_appointment(appointment_id: str, payload: AppointmentUpdate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        current = rows("SELECT * FROM gestoria_appointments WHERE id = ? AND customer_id = ?", (appointment_id, customer_id))
        if not current:
            raise HTTPException(status_code=404, detail="Cita no encontrada")
        item = current[0]
        values = payload.model_dump(exclude_unset=True)
        if values.get("status") not in (None, "cancelled"):
            raise HTTPException(status_code=403, detail="El usuario solo puede cancelar su cita")
        advisor_id = values.get("advisor_id", item["advisor_id"])
        scheduled_at = normalize_datetime(values.get("scheduled_at", item["scheduled_at"]))
        if values.get("status") != "cancelled":
            ensure_available_slot(advisor_id, scheduled_at, appointment_id)
        with connection() as conn:
            conn.execute("UPDATE gestoria_appointments SET advisor_id = ?, modality = ?, scheduled_at = ?, reason = ?, status = ?, updated_at = ? WHERE id = ? AND customer_id = ?", (advisor_id, values.get("modality", item["modality"]), scheduled_at, values.get("reason", item["reason"]), values.get("status", item["status"]), now(), appointment_id, customer_id))
            if values.get("status") == "cancelled":
                conn.execute("UPDATE gestoria_notifications SET status = 'cancelled' WHERE appointment_id = ?", (appointment_id,))
            else:
                schedule_appointment_notifications(conn, customer_id, appointment_id, scheduled_at)
            conn.commit()
        sync_entity("appointment", appointment_id, {**item, **values, "advisor_id": advisor_id, "scheduled_at": scheduled_at, "status": values.get("status", item["status"])})
        sync_appointment_notifications(appointment_id)
        return {"id": appointment_id, "status": values.get("status", item["status"]), "scheduled_at": scheduled_at}

    @router.post("/appointments/{appointment_id}/cancel")
    def cancel_appointment(appointment_id: str, authorization: str | None = Header(default=None)) -> dict:
        return update_appointment(appointment_id, AppointmentUpdate(status="cancelled"), authorization)

    @router.get("/messages/me")
    def my_messages(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return rows("SELECT * FROM gestoria_messages WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,))

    @router.post("/messages", status_code=201)
    def create_message(payload: MessageCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        item = (f"message-{uuid4().hex[:16]}", customer_id, "client", payload.subject.strip(), payload.body.strip(), payload.message_type, payload.reply_to_id)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_messages (id, customer_id, sender_type, subject, body, message_type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync_entity("message", item[0], dict(zip(("id", "customer_id", "sender_type", "subject", "body", "message_type", "reply_to_id"), item)))
        return dict(zip(("id", "customer_id", "sender_type", "subject", "body", "message_type", "reply_to_id"), item))

    @router.patch("/messages/{message_id}/read")
    def mark_message_read(message_id: str, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        with connection() as conn:
            result = conn.execute("UPDATE gestoria_messages SET read_at = ? WHERE id = ? AND customer_id = ?", (now(), message_id, customer_id))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Mensaje no encontrado")
            conn.commit()
        return {"id": message_id, "read_at": now()}

    @router.post("/messages/{message_id}/reply", status_code=201)
    def reply_to_message(message_id: str, payload: ChatMessageCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        original = rows("SELECT subject FROM gestoria_messages WHERE id = ? AND customer_id = ?", (message_id, customer_id))
        if not original:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")
        item = (f"message-{uuid4().hex[:16]}", customer_id, "client", f"Re: {original[0]['subject']}", payload.body.strip(), "respuesta", message_id)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_messages (id, customer_id, sender_type, subject, body, message_type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync_entity("message", item[0], dict(zip(("id", "customer_id", "sender_type", "subject", "body", "message_type", "reply_to_id"), item)))
        return dict(zip(("id", "customer_id", "sender_type", "subject", "body", "message_type", "reply_to_id"), item))

    @router.get("/notifications/me")
    def my_notifications(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        with connection() as conn:
            mark_due_notifications(conn)
            result = [dict(row) for row in conn.execute("SELECT * FROM gestoria_notifications WHERE customer_id = ? ORDER BY scheduled_for DESC", (customer_id,)).fetchall()]
            conn.commit()
        return result

    @router.patch("/notifications/{notification_id}/read")
    def mark_notification_read(notification_id: str, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        with connection() as conn:
            result = conn.execute("UPDATE gestoria_notifications SET read_at = ? WHERE id = ? AND customer_id = ?", (now(), notification_id, customer_id))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Notificación no encontrada")
            conn.commit()
        return {"id": notification_id, "read_at": now()}

    @router.post("/chat/sessions", status_code=201)
    def create_chat_session(authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        session = (f"chat-{uuid4().hex[:16]}", customer_id)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_chat_sessions (id, customer_id) VALUES (?, ?)", session)
            conn.commit()
        sync_entity("chat_session", session[0], {"id": session[0], "customer_id": customer_id, "status": "open"})
        return {"id": session[0], "customer_id": customer_id, "status": "open", "messages": []}

    @router.get("/chat/sessions/{session_id}")
    def chat_session(session_id: str, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        sessions = rows("SELECT * FROM gestoria_chat_sessions WHERE id = ? AND customer_id = ?", (session_id, customer_id))
        if not sessions:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        sessions[0]["messages"] = rows("SELECT * FROM gestoria_chat_messages WHERE session_id = ? ORDER BY created_at", (session_id,))
        return sessions[0]

    @router.post("/chat/sessions/{session_id}/messages", status_code=201)
    def add_chat_message(session_id: str, payload: ChatMessageCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        if not rows("SELECT id FROM gestoria_chat_sessions WHERE id = ? AND customer_id = ?", (session_id, customer_id)):
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        response = "Este asistente está en modo demostración. Próximamente se conectará a un proveedor de IA especializado en gestoría."
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_chat_messages (id, session_id, author, body) VALUES (?, ?, 'user', ?)", (f"chat-message-{uuid4().hex[:16]}", session_id, payload.body.strip()))
            conn.execute("INSERT INTO gestoria_chat_messages (id, session_id, author, body) VALUES (?, ?, 'assistant', ?)", (f"chat-message-{uuid4().hex[:16]}", session_id, response))
            conn.commit()
        sync_entity("chat_message", session_id, {"session_id": session_id, "body": payload.body.strip(), "response": response})
        return {"session_id": session_id, "answer": response, "provider": "mock"}

    # Backoffice de Gestoría. En desarrollo se abre directamente; fuera de
    # desarrollo se mantiene la protección administrativa del backend.
    @router.get("/backoffice/overview")
    def backoffice_overview(x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            mark_due_notifications(conn)
            result = {
                "clients": conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
                "documents": conn.execute("SELECT COUNT(*) FROM gestoria_documents").fetchone()[0],
                "appointments": conn.execute("SELECT COUNT(*) FROM gestoria_appointments WHERE status NOT IN ('cancelled', 'completed')").fetchone()[0],
                "due_notifications": conn.execute("SELECT COUNT(*) FROM gestoria_notifications WHERE status = 'due'").fetchone()[0],
                "unread_messages": conn.execute("SELECT COUNT(*) FROM gestoria_messages WHERE read_at IS NULL").fetchone()[0],
                "chat_sessions": conn.execute("SELECT COUNT(*) FROM gestoria_chat_sessions").fetchone()[0],
                "procedures": conn.execute("SELECT COUNT(*) FROM gestoria_procedures WHERE status NOT IN ('completed', 'cancelled')").fetchone()[0],
                "labor_requests": conn.execute("SELECT COUNT(*) FROM gestoria_labor_requests WHERE status NOT IN ('completed', 'cancelled')").fetchone()[0],
            }
            conn.commit()
        return result

    @router.get("/backoffice/clients")
    def backoffice_clients(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("""
            SELECT customers.id, customers.name, customers.email, customers.created_at,
                   profiles.company_name, profiles.tax_regime,
                   (SELECT COUNT(*) FROM gestoria_documents WHERE customer_id = customers.id) AS document_count,
                   (SELECT COUNT(*) FROM gestoria_appointments WHERE customer_id = customers.id) AS appointment_count,
                   (SELECT COUNT(*) FROM gestoria_messages WHERE customer_id = customers.id AND read_at IS NULL) AS unread_message_count
            FROM customers LEFT JOIN gestoria_client_profiles profiles ON profiles.customer_id = customers.id
            ORDER BY customers.name
        """)

    @router.get("/backoffice/clients/{customer_id}")
    def backoffice_client_detail(customer_id: str, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        clients = rows("SELECT id, name, email, cognito_sub, created_at, billing_address, tax_id FROM customers WHERE id = ?", (customer_id,))
        if not clients:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        with connection() as conn:
            conn.execute("INSERT OR IGNORE INTO gestoria_client_profiles (customer_id) VALUES (?)", (customer_id,))
            mark_due_notifications(conn)
            profile = dict(conn.execute("SELECT * FROM gestoria_client_profiles WHERE customer_id = ?", (customer_id,)).fetchone())
            conn.commit()
        return {
            "client": clients[0],
            "profile": profile,
            "documents": [document_with_url(item) for item in rows("SELECT * FROM gestoria_documents WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,))],
            "appointments": rows("SELECT appointments.*, advisors.name AS advisor_name, advisors.specialty FROM gestoria_appointments appointments JOIN gestoria_advisors advisors ON advisors.id = appointments.advisor_id WHERE appointments.customer_id = ? ORDER BY appointments.scheduled_at DESC", (customer_id,)),
            "messages": rows("SELECT * FROM gestoria_messages WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)),
            "notifications": rows("SELECT * FROM gestoria_notifications WHERE customer_id = ? ORDER BY scheduled_for DESC", (customer_id,)),
            "chat_sessions": rows("SELECT * FROM gestoria_chat_sessions WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)),
            "procedures": rows("SELECT procedures.*, links.external_id, links.provider AS erp_provider, links.sync_status AS erp_link_status FROM gestoria_procedures procedures LEFT JOIN gestoria_erp_links links ON links.entity_type = 'procedure' AND links.entity_id = procedures.id WHERE procedures.customer_id = ? ORDER BY procedures.updated_at DESC", (customer_id,)),
            "labor_requests": rows("SELECT requests.*, links.external_id, links.provider AS erp_provider, links.sync_status AS erp_link_status FROM gestoria_labor_requests requests LEFT JOIN gestoria_erp_links links ON links.entity_type = 'labor_request' AND links.entity_id = requests.id WHERE requests.customer_id = ? ORDER BY requests.created_at DESC", (customer_id,)),
        }

    @router.get("/backoffice/procedures")
    def backoffice_procedures(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("SELECT procedures.*, customers.name AS customer_name, customers.email AS customer_email, links.external_id, links.provider AS erp_provider, links.sync_status AS erp_link_status FROM gestoria_procedures procedures JOIN customers ON customers.id = procedures.customer_id LEFT JOIN gestoria_erp_links links ON links.entity_type = 'procedure' AND links.entity_id = procedures.id ORDER BY procedures.updated_at DESC")

    @router.post("/backoffice/procedures", status_code=201)
    def backoffice_create_procedure(payload: ProcedureCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not customer_exists(payload.customer_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        procedure_id = f"procedure-{uuid4().hex[:16]}"
        item = (procedure_id, payload.customer_id, payload.title.strip(), payload.procedure_type.strip(), payload.status, payload.progress, payload.result)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_procedures (id, customer_id, title, procedure_type, status, progress, result) VALUES (?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync = sync_entity("procedure", procedure_id, dict(zip(("id", "customer_id", "title", "procedure_type", "status", "progress", "result"), item)))
        with connection() as conn:
            conn.execute("UPDATE gestoria_procedures SET erp_external_id = ?, erp_sync_status = ?, updated_at = ? WHERE id = ?", (sync.get("external_id") or None, sync["sync_status"], now(), procedure_id))
            conn.commit()
        return {"id": procedure_id, **sync}

    @router.patch("/backoffice/procedures/{procedure_id}")
    def backoffice_update_procedure(procedure_id: str, payload: ProcedureUpdate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        current = rows("SELECT * FROM gestoria_procedures WHERE id = ?", (procedure_id,))
        if not current:
            raise HTTPException(status_code=404, detail="Trámite no encontrado")
        item = current[0]
        values = payload.model_dump(exclude_unset=True)
        updated = {**item, **values}
        with connection() as conn:
            conn.execute("UPDATE gestoria_procedures SET title = ?, procedure_type = ?, status = ?, progress = ?, result = ?, erp_sync_status = 'pending', updated_at = ? WHERE id = ?", (updated["title"], updated["procedure_type"], updated["status"], updated["progress"], updated.get("result"), now(), procedure_id))
            conn.commit()
        sync = sync_entity("procedure", procedure_id, updated)
        with connection() as conn:
            conn.execute("UPDATE gestoria_procedures SET erp_external_id = ?, erp_sync_status = ?, updated_at = ? WHERE id = ?", (sync.get("external_id") or None, sync["sync_status"], now(), procedure_id))
            conn.commit()
        return {**updated, **sync}

    @router.delete("/backoffice/procedures/{procedure_id}", status_code=204)
    def backoffice_delete_procedure(procedure_id: str, x_backoffice_token: str | None = Header(default=None)) -> Response:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            result = conn.execute("DELETE FROM gestoria_procedures WHERE id = ?", (procedure_id,))
            conn.execute("DELETE FROM gestoria_erp_links WHERE entity_type = 'procedure' AND entity_id = ?", (procedure_id,))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Trámite no encontrado")
            conn.commit()
        return Response(status_code=204)

    @router.get("/backoffice/labor/requests")
    def backoffice_labor_requests(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("SELECT requests.*, customers.name AS customer_name, customers.email AS customer_email, links.external_id, links.provider AS erp_provider, links.sync_status AS erp_link_status FROM gestoria_labor_requests requests JOIN customers ON customers.id = requests.customer_id LEFT JOIN gestoria_erp_links links ON links.entity_type = 'labor_request' AND links.entity_id = requests.id ORDER BY requests.created_at DESC")

    @router.post("/backoffice/labor/requests", status_code=201)
    def backoffice_create_labor_request(payload: BackofficeLaborRequestCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not customer_exists(payload.customer_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        request_id = f"labor-{uuid4().hex[:16]}"
        item = (request_id, payload.customer_id, payload.request_type, payload.subject.strip(), payload.description.strip(), payload.period_start, payload.period_end)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_labor_requests (id, customer_id, request_type, subject, description, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync = sync_entity("labor_request", request_id, dict(zip(("id", "customer_id", "request_type", "subject", "description", "period_start", "period_end"), item)))
        with connection() as conn:
            conn.execute("UPDATE gestoria_labor_requests SET erp_external_id = ?, erp_sync_status = ?, updated_at = ? WHERE id = ?", (sync.get("external_id") or None, sync["sync_status"], now(), request_id))
            conn.commit()
        return {"id": request_id, "status": "submitted", **sync}

    @router.patch("/backoffice/labor/requests/{request_id}")
    def backoffice_update_labor_request(request_id: str, payload: LaborRequestUpdate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        current = rows("SELECT * FROM gestoria_labor_requests WHERE id = ?", (request_id,))
        if not current:
            raise HTTPException(status_code=404, detail="Solicitud laboral no encontrada")
        item = current[0]
        values = payload.model_dump(exclude_unset=True)
        updated = {**item, **values}
        with connection() as conn:
            conn.execute("UPDATE gestoria_labor_requests SET request_type = ?, subject = ?, description = ?, period_start = ?, period_end = ?, status = ?, erp_sync_status = 'pending', updated_at = ? WHERE id = ?", (updated["request_type"], updated["subject"], updated["description"], updated.get("period_start"), updated.get("period_end"), updated["status"], now(), request_id))
            conn.commit()
        sync = sync_entity("labor_request", request_id, updated)
        with connection() as conn:
            conn.execute("UPDATE gestoria_labor_requests SET erp_external_id = ?, erp_sync_status = ?, updated_at = ? WHERE id = ?", (sync.get("external_id") or None, sync["sync_status"], now(), request_id))
            conn.commit()
        return {**updated, **sync}

    @router.delete("/backoffice/labor/requests/{request_id}", status_code=204)
    def backoffice_delete_labor_request(request_id: str, x_backoffice_token: str | None = Header(default=None)) -> Response:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            result = conn.execute("DELETE FROM gestoria_labor_requests WHERE id = ?", (request_id,))
            conn.execute("DELETE FROM gestoria_erp_links WHERE entity_type = 'labor_request' AND entity_id = ?", (request_id,))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Solicitud laboral no encontrada")
            conn.commit()
        return Response(status_code=204)

    @router.get("/backoffice/appointments")
    def backoffice_appointments(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("""
            SELECT appointments.*, customers.name AS customer_name, customers.email AS customer_email,
                   advisors.name AS advisor_name, advisors.specialty
            FROM gestoria_appointments appointments
            JOIN customers ON customers.id = appointments.customer_id
            JOIN gestoria_advisors advisors ON advisors.id = appointments.advisor_id
            ORDER BY appointments.scheduled_at
        """)

    @router.post("/backoffice/appointments", status_code=201)
    def backoffice_create_appointment(payload: BackofficeAppointmentCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        customer_id = payload.customer_id
        if not customer_exists(customer_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        scheduled_at = normalize_datetime(payload.scheduled_at)
        with connection() as conn:
            if not conn.execute("SELECT id FROM gestoria_advisors WHERE id = ? AND active = 1", (payload.advisor_id,)).fetchone():
                raise HTTPException(status_code=404, detail="Asesor no encontrado")
            appointment_id = f"appointment-{uuid4().hex[:16]}"
            conn.execute("INSERT INTO gestoria_appointments (id, customer_id, advisor_id, modality, scheduled_at, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?)", (appointment_id, customer_id, payload.advisor_id, payload.modality, scheduled_at, payload.reason.strip(), payload.status))
            schedule_appointment_notifications(conn, customer_id, appointment_id, scheduled_at)
            conn.commit()
        sync_entity("appointment", appointment_id, {"id": appointment_id, "customer_id": customer_id, "advisor_id": payload.advisor_id, "modality": payload.modality, "scheduled_at": scheduled_at, "reason": payload.reason.strip(), "status": payload.status})
        sync_appointment_notifications(appointment_id)
        return {"id": appointment_id}

    @router.patch("/backoffice/appointments/{appointment_id}")
    def backoffice_update_appointment(appointment_id: str, payload: AppointmentUpdate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        current = rows("SELECT * FROM gestoria_appointments WHERE id = ?", (appointment_id,))
        if not current:
            raise HTTPException(status_code=404, detail="Cita no encontrada")
        item = current[0]
        values = payload.model_dump(exclude_unset=True)
        advisor_id = values.get("advisor_id", item["advisor_id"])
        scheduled_at = normalize_datetime(values.get("scheduled_at", item["scheduled_at"]))
        if not rows("SELECT id FROM gestoria_advisors WHERE id = ? AND active = 1", (advisor_id,)):
            raise HTTPException(status_code=404, detail="Asesor no encontrado")
        with connection() as conn:
            conn.execute("UPDATE gestoria_appointments SET advisor_id = ?, modality = ?, scheduled_at = ?, reason = ?, status = ?, updated_at = ? WHERE id = ?", (advisor_id, values.get("modality", item["modality"]), scheduled_at, values.get("reason", item["reason"]), values.get("status", item["status"]), now(), appointment_id))
            schedule_appointment_notifications(conn, item["customer_id"], appointment_id, scheduled_at)
            conn.commit()
        sync_entity("appointment", appointment_id, {**item, **values, "advisor_id": advisor_id, "scheduled_at": scheduled_at, "status": values.get("status", item["status"])})
        sync_appointment_notifications(appointment_id)
        return {"id": appointment_id, "status": values.get("status", item["status"])}

    @router.delete("/backoffice/appointments/{appointment_id}", status_code=204)
    def backoffice_delete_appointment(appointment_id: str, x_backoffice_token: str | None = Header(default=None)) -> Response:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            conn.execute("DELETE FROM gestoria_notifications WHERE appointment_id = ?", (appointment_id,))
            conn.execute("DELETE FROM gestoria_erp_links WHERE entity_type = 'appointment' AND entity_id = ?", (appointment_id,))
            result = conn.execute("DELETE FROM gestoria_appointments WHERE id = ?", (appointment_id,))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Cita no encontrada")
            conn.commit()
        return Response(status_code=204)

    @router.get("/backoffice/documents")
    def backoffice_documents(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return [document_with_url(item) for item in rows("SELECT documents.*, customers.name AS customer_name, customers.email AS customer_email FROM gestoria_documents documents JOIN customers ON customers.id = documents.customer_id ORDER BY documents.created_at DESC")]

    @router.post("/backoffice/documents", status_code=201)
    def backoffice_upload_document(customer_id: str = Form(...), title: str = Form(..., min_length=2, max_length=200), category: str = Form("general", min_length=2, max_length=80), document: UploadFile = File(...), x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not customer_exists(customer_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        storage_key, filename, content_type, size_bytes = save_document(customer_id, document, MAX_PREMIUM_DOCUMENT_SIZE)
        item = (f"document-{uuid4().hex[:16]}", customer_id, title.strip(), category.strip(), filename, content_type, size_bytes, storage_key, "backoffice")
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_documents (id, customer_id, title, category, filename, content_type, size_bytes, storage_key, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        document = dict(zip(("id", "customer_id", "title", "category", "filename", "content_type", "size_bytes", "storage_key", "uploaded_by"), item))
        sync_entity("document", document["id"], document)
        return document_with_url(document)

    @router.patch("/backoffice/documents/{document_id}")
    def backoffice_update_document(document_id: str, payload: DocumentUpdate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        item = rows("SELECT * FROM gestoria_documents WHERE id = ?", (document_id,))
        if not item:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        values = payload.model_dump(exclude_unset=True)
        with connection() as conn:
            conn.execute("UPDATE gestoria_documents SET title = ?, category = ? WHERE id = ?", (values.get("title", item[0]["title"]), values.get("category", item[0]["category"]), document_id))
            conn.commit()
        updated = {**item[0], **values}
        sync_entity("document", document_id, updated)
        return document_with_url(updated)

    @router.delete("/backoffice/documents/{document_id}", status_code=204)
    def backoffice_delete_document(document_id: str, x_backoffice_token: str | None = Header(default=None)) -> Response:
        require_backoffice(x_backoffice_token)
        item = rows("SELECT storage_key FROM gestoria_documents WHERE id = ?", (document_id,))
        if not item:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        delete_stored_file(item[0]["storage_key"])
        with connection() as conn:
            conn.execute("DELETE FROM gestoria_documents WHERE id = ?", (document_id,))
            conn.execute("DELETE FROM gestoria_erp_links WHERE entity_type = 'document' AND entity_id = ?", (document_id,))
            conn.commit()
        return Response(status_code=204)

    @router.get("/backoffice/messages")
    def backoffice_messages(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("SELECT messages.*, customers.name AS customer_name, customers.email AS customer_email FROM gestoria_messages messages JOIN customers ON customers.id = messages.customer_id ORDER BY messages.created_at DESC")

    @router.post("/backoffice/messages", status_code=201)
    def backoffice_create_message(payload: MessageCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not payload.customer_id or not customer_exists(payload.customer_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        item = (f"message-{uuid4().hex[:16]}", payload.customer_id, "office", payload.subject.strip(), payload.body.strip(), payload.message_type, payload.reply_to_id)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_messages (id, customer_id, sender_type, subject, body, message_type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync_entity("message", item[0], dict(zip(("id", "customer_id", "sender_type", "subject", "body", "message_type", "reply_to_id"), item)))
        return dict(zip(("id", "customer_id", "sender_type", "subject", "body", "message_type", "reply_to_id"), item))

    @router.patch("/backoffice/messages/{message_id}")
    def backoffice_update_message(message_id: str, payload: MessageUpdate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        item = rows("SELECT * FROM gestoria_messages WHERE id = ?", (message_id,))
        if not item:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")
        values = payload.model_dump(exclude_unset=True)
        read_at = now() if values.get("read") else (None if values.get("read") is False else item[0]["read_at"])
        with connection() as conn:
            conn.execute("UPDATE gestoria_messages SET subject = ?, body = ?, message_type = ?, read_at = ? WHERE id = ?", (values.get("subject", item[0]["subject"]), values.get("body", item[0]["body"]), values.get("message_type", item[0].get("message_type", "normal")), read_at, message_id))
            conn.commit()
        sync_entity("message", message_id, {**item[0], **values, "read_at": read_at})
        return {**item[0], **values, "read_at": read_at, "message_type": values.get("message_type", item[0].get("message_type", "normal"))}

    @router.delete("/backoffice/messages/{message_id}", status_code=204)
    def backoffice_delete_message(message_id: str, x_backoffice_token: str | None = Header(default=None)) -> Response:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            result = conn.execute("DELETE FROM gestoria_messages WHERE id = ?", (message_id,))
            conn.execute("DELETE FROM gestoria_erp_links WHERE entity_type = 'message' AND entity_id = ?", (message_id,))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Mensaje no encontrado")
            conn.commit()
        return Response(status_code=204)

    @router.get("/backoffice/notifications")
    def backoffice_notifications(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            mark_due_notifications(conn)
            result = [dict(row) for row in conn.execute("SELECT notifications.*, customers.name AS customer_name, customers.email AS customer_email FROM gestoria_notifications notifications JOIN customers ON customers.id = notifications.customer_id ORDER BY scheduled_for").fetchall()]
            conn.commit()
        return result

    @router.post("/backoffice/notifications", status_code=201)
    def backoffice_create_notification(payload: NotificationCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not customer_exists(payload.customer_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        item = (f"notification-{uuid4().hex[:16]}", payload.customer_id, payload.appointment_id, payload.type.strip(), payload.title.strip(), payload.body.strip(), normalize_datetime(payload.scheduled_for), payload.status)
        with connection() as conn:
            conn.execute("INSERT INTO gestoria_notifications (id, customer_id, appointment_id, type, title, body, scheduled_for, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", item)
            conn.commit()
        sync_entity("notification", item[0], dict(zip(("id", "customer_id", "appointment_id", "type", "title", "body", "scheduled_for", "status"), item)))
        return dict(zip(("id", "customer_id", "appointment_id", "type", "title", "body", "scheduled_for", "status"), item))

    @router.patch("/backoffice/notifications/{notification_id}")
    def backoffice_update_notification(notification_id: str, payload: NotificationUpdate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        item = rows("SELECT * FROM gestoria_notifications WHERE id = ?", (notification_id,))
        if not item:
            raise HTTPException(status_code=404, detail="Notificación no encontrada")
        values = payload.model_dump(exclude_unset=True)
        scheduled_for = normalize_datetime(values["scheduled_for"]) if "scheduled_for" in values else item[0]["scheduled_for"]
        read_at = now() if values.get("read") else (None if values.get("read") is False else item[0].get("read_at"))
        with connection() as conn:
            conn.execute("UPDATE gestoria_notifications SET type = ?, title = ?, body = ?, scheduled_for = ?, status = ?, read_at = ? WHERE id = ?", (values.get("type", item[0]["type"]), values.get("title", item[0]["title"]), values.get("body", item[0]["body"]), scheduled_for, values.get("status", item[0]["status"]), read_at, notification_id))
            conn.commit()
        sync_entity("notification", notification_id, {**item[0], **values, "scheduled_for": scheduled_for, "read_at": read_at})
        return {**item[0], **values, "scheduled_for": scheduled_for, "read_at": read_at}

    @router.delete("/backoffice/notifications/{notification_id}", status_code=204)
    def backoffice_delete_notification(notification_id: str, x_backoffice_token: str | None = Header(default=None)) -> Response:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            result = conn.execute("DELETE FROM gestoria_notifications WHERE id = ?", (notification_id,))
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Notificación no encontrada")
            conn.commit()
        return Response(status_code=204)

    @router.get("/backoffice/chat/sessions")
    def backoffice_chat_sessions(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        sessions = rows("SELECT sessions.*, customers.name AS customer_name, customers.email AS customer_email FROM gestoria_chat_sessions sessions JOIN customers ON customers.id = sessions.customer_id ORDER BY sessions.created_at DESC")
        for session in sessions:
            session["messages"] = rows("SELECT * FROM gestoria_chat_messages WHERE session_id = ? ORDER BY created_at", (session["id"],))
        return sessions

    app.include_router(router)
