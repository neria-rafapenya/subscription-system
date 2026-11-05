import hashlib
import hmac
import os
import secrets


PASSWORD_ITERATIONS = 210_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def create_local_access_token(customer_id: str) -> str:
    secret = os.getenv("LOCAL_AUTH_SECRET", "development-only-local-auth-secret").encode("utf-8")
    signature = hmac.new(secret, customer_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"local.{customer_id}.{signature}"


def customer_id_from_local_access_token(token: str | None) -> str | None:
    if not token or not token.startswith("local."):
        return None
    try:
        _, customer_id, signature = token.split(".", 2)
    except ValueError:
        return None
    secret = os.getenv("LOCAL_AUTH_SECRET", "development-only-local-auth-secret").encode("utf-8")
    expected = hmac.new(secret, customer_id.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    return customer_id


def hash_recovery_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
