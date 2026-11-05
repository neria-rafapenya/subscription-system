"""Small PayPal Billing Subscriptions client.

The mobile/web client never receives these credentials. In development they may
come from the local environment; in AWS they are read from one Secrets Manager
secret per environment.
"""

from __future__ import annotations

import base64
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .config import AppEnvironment, get_settings


class PayPalConfigurationError(RuntimeError):
    pass


class PayPalAPIError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class PayPalSettings:
    client_id: str
    client_secret: str
    basic_plan_id: str
    premium_plan_id: str
    base_url: str
    return_url: str
    cancel_url: str


_token_cache: dict[str, Any] = {}


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi
    except ImportError as exc:  # pragma: no cover - dependency installation issue
        raise PayPalConfigurationError("Falta certifi para validar los certificados SSL de PayPal") from exc
    return ssl.create_default_context(cafile=certifi.where())


def _load_secret_values() -> dict[str, Any]:
    settings = get_settings()
    secret_name = settings.paypal_secret_name or settings.secrets_manager_secret_name
    if not settings.secrets_manager_enabled or not secret_name:
        return {}
    try:
        import boto3
    except ImportError as exc:  # pragma: no cover - only used by AWS environments
        raise PayPalConfigurationError("Falta boto3 para leer PayPal desde Secrets Manager") from exc

    try:
        response = boto3.client("secretsmanager", region_name=settings.aws_region).get_secret_value(
            SecretId=secret_name
        )
        raw = response.get("SecretString", "{}")
        decoded = json.loads(raw)
        paypal = decoded.get("paypal", decoded)
        return paypal if isinstance(paypal, dict) else {}
    except Exception as exc:  # pragma: no cover - provider/network dependent
        raise PayPalConfigurationError(f"No se pudo leer el secreto de PayPal '{secret_name}'") from exc


def _value(name: str, secret: dict[str, Any], default: str | None = None) -> str | None:
    settings = get_settings()
    env_value = os.getenv(name)
    if env_value:
        return env_value
    local_value = settings.local_env_values.get(name)
    if local_value:
        return local_value
    secret_name = name.removeprefix("PAYPAL_").lower()
    return secret.get(secret_name, default)


def paypal_settings() -> PayPalSettings:
    settings = get_settings()
    secret = _load_secret_values()
    client_id = _value("PAYPAL_CLIENT_ID", secret)
    client_secret = _value("PAYPAL_CLIENT_SECRET", secret)
    basic_plan_id = _value("PAYPAL_BASIC_PLAN_ID", secret)
    premium_plan_id = _value("PAYPAL_PREMIUM_PLAN_ID", secret)
    missing = [
        name
        for name, value in (
            ("PAYPAL_CLIENT_ID", client_id),
            ("PAYPAL_CLIENT_SECRET", client_secret),
            ("PAYPAL_BASIC_PLAN_ID", basic_plan_id),
            ("PAYPAL_PREMIUM_PLAN_ID", premium_plan_id),
        )
        if not value
    ]
    if missing:
        raise PayPalConfigurationError(f"Falta configuración de PayPal: {', '.join(missing)}")
    default_base_url = "https://api-m.paypal.com" if settings.app_env == AppEnvironment.PRODUCTION else "https://api-m.sandbox.paypal.com"
    base_url = _value("PAYPAL_BASE_URL", secret, default_base_url) or default_base_url
    if settings.secrets_manager_enabled and settings.app_env == AppEnvironment.PRODUCTION and "sandbox.paypal.com" in base_url:
        raise PayPalConfigurationError("Production requiere la API real de PayPal, no Sandbox")
    return PayPalSettings(
        client_id=str(client_id),
        client_secret=str(client_secret),
        basic_plan_id=str(basic_plan_id),
        premium_plan_id=str(premium_plan_id),
        base_url=base_url,
        return_url=_value("PAYPAL_RETURN_URL", secret, "http://127.0.0.1:8000/checkout/paypal/return") or "http://127.0.0.1:8000/checkout/paypal/return",
        cancel_url=_value("PAYPAL_CANCEL_URL", secret, "http://127.0.0.1:8000/checkout/paypal/cancel") or "http://127.0.0.1:8000/checkout/paypal/cancel",
    )


def _request(method: str, path: str, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    config = paypal_settings()
    request_body = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        f"{config.base_url.rstrip('/')}{path}",
        data=request_body,
        method=method,
        headers={"Accept": "application/json", "Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=20, context=_ssl_context()) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            issues = "; ".join(
                f"{item.get('issue')}: {item.get('description')}"
                for item in parsed.get("details", [])
                if item.get("issue") or item.get("description")
            )
            message = issues or parsed.get("message") or parsed.get("name") or detail
            debug_id = parsed.get("debug_id")
            if debug_id:
                message = f"{message} (debug_id: {debug_id})"
        except json.JSONDecodeError:
            message = detail
        raise PayPalAPIError(f"PayPal: {message}", exc.code) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise PayPalAPIError(f"No se pudo conectar con PayPal: {exc}") from exc


def _access_token() -> str:
    now = time.time()
    cached = _token_cache.get("token")
    if cached and _token_cache.get("expires_at", 0) > now + 60:
        return str(cached)
    config = paypal_settings()
    credentials = base64.b64encode(f"{config.client_id}:{config.client_secret}".encode("utf-8")).decode("ascii")
    body = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode("ascii")
    request = urllib.request.Request(
        f"{config.base_url.rstrip('/')}/v1/oauth2/token",
        data=body,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {credentials}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20, context=_ssl_context()) as response:
            token = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise PayPalAPIError(f"PayPal no ha aceptado las credenciales (HTTP {exc.code}): {detail}", exc.code) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise PayPalAPIError(f"No se pudo conectar con PayPal: {exc}") from exc
    _token_cache.update(token=token["access_token"], expires_at=now + int(token.get("expires_in", 300)))
    return str(token["access_token"])


def _authorized_request(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    request_id = f"subscription-system-{int(time.time() * 1000)}"
    return _request(
        method,
        path,
        body,
        headers={"Authorization": f"Bearer {_access_token()}", "Prefer": "return=representation", "PayPal-Request-Id": request_id},
    )


def plan_id_for_tier(tier: str) -> str:
    config = paypal_settings()
    if tier == "premium":
        return config.premium_plan_id
    return config.basic_plan_id


def create_subscription(*, tier: str, checkout_id: str, name: str, email: str) -> tuple[str, str | None]:
    payload = {
        "plan_id": plan_id_for_tier(tier),
        "custom_id": checkout_id,
        "application_context": {
            "brand_name": "Subscription System",
            "locale": "es-ES",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "SUBSCRIBE_NOW",
            "payment_method": {"payer_selected": "PAYPAL", "payee_preferred": "IMMEDIATE_PAYMENT_REQUIRED"},
        },
    }
    response = _authorized_request("POST", "/v1/billing/subscriptions", payload)
    subscription_id = response.get("id")
    if not subscription_id:
        raise PayPalAPIError("PayPal no ha devuelto el identificador de suscripción")
    approval_url = next((link.get("href") for link in response.get("links", []) if link.get("rel") == "approve"), None)
    return str(subscription_id), approval_url


def get_subscription(subscription_id: str) -> dict[str, Any]:
    return _authorized_request("GET", f"/v1/billing/subscriptions/{urllib.parse.quote(subscription_id, safe='')}")


def cancel_subscription(subscription_id: str, reason: str) -> None:
    _authorized_request(
        "POST",
        f"/v1/billing/subscriptions/{urllib.parse.quote(subscription_id, safe='')}/cancel",
        {"reason": reason},
    )
