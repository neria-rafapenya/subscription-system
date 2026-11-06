import os
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class AppEnvironment(StrEnum):
    DEVELOPMENT = "development"
    INTEGRATION = "integration"
    PRODUCTION = "production"


class Settings:
    def __init__(self) -> None:
        self.local_env_values: dict[str, str] = {}
        self.app_name = os.getenv("APP_NAME", "subscription-system-api")
        self.app_env = AppEnvironment(os.getenv("APP_ENV", AppEnvironment.DEVELOPMENT.value))
        self.api_host = os.getenv("API_HOST", "127.0.0.1")
        self.api_port = int(os.getenv("API_PORT", "8000"))
        self.local_database_path = os.getenv("LOCAL_DATABASE_PATH", "./data/development.sqlite3")
        self.local_file_storage_path = os.getenv("LOCAL_FILE_STORAGE_PATH", "./data/files")
        self.local_auth_enabled = os.getenv("LOCAL_AUTH_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
        self.payment_provider = os.getenv("PAYMENT_PROVIDER", "local")
        self.vertical_module = os.getenv("APP_VERTICAL_MODULE", "maintenance")
        self.backoffice_admin_token = os.getenv("BACKOFFICE_ADMIN_TOKEN", "")
        self.aws_region = os.getenv("AWS_REGION")
        self.secrets_manager_secret_name = os.getenv("SECRETS_MANAGER_SECRET_NAME")
        self.secrets_manager_enabled = os.getenv("SECRETS_MANAGER_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
        self.cognito_issuer = os.getenv("COGNITO_ISSUER")
        self.paypal_secret_name = os.getenv("PAYPAL_SECRET_NAME")

        env_file = REPOSITORY_ROOT / ".env"
        if env_file.exists():
            self._load_local_env(env_file)
        if not self.backoffice_admin_token and self.app_env == AppEnvironment.DEVELOPMENT:
            self.backoffice_admin_token = "local-backoffice-demo"

    def _load_local_env(self, env_file: Path) -> None:
        """Load simple KEY=VALUE pairs without adding a dotenv dependency."""
        values: dict[str, str] = {}
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() in os.environ:
                continue
            values[key.strip()] = value.strip().strip('"').strip("'")

        self.local_env_values = values

        self.app_name = values.get("APP_NAME", self.app_name)
        self.app_env = AppEnvironment(values.get("APP_ENV", self.app_env.value))
        self.api_host = values.get("API_HOST", self.api_host)
        self.api_port = int(values.get("API_PORT", str(self.api_port)))
        self.local_database_path = values.get("LOCAL_DATABASE_PATH", self.local_database_path)
        self.local_file_storage_path = values.get("LOCAL_FILE_STORAGE_PATH", self.local_file_storage_path)
        self.local_auth_enabled = values.get("LOCAL_AUTH_ENABLED", str(self.local_auth_enabled)).lower() in {"1", "true", "yes", "on"}
        self.payment_provider = values.get("PAYMENT_PROVIDER", self.payment_provider)
        self.vertical_module = values.get("APP_VERTICAL_MODULE", self.vertical_module)
        self.backoffice_admin_token = values.get("BACKOFFICE_ADMIN_TOKEN", self.backoffice_admin_token)
        self.aws_region = values.get("AWS_REGION", self.aws_region)
        self.secrets_manager_secret_name = values.get("SECRETS_MANAGER_SECRET_NAME", self.secrets_manager_secret_name)
        self.secrets_manager_enabled = values.get("SECRETS_MANAGER_ENABLED", str(self.secrets_manager_enabled)).lower() in {"1", "true", "yes", "on"}
        self.cognito_issuer = values.get("COGNITO_ISSUER", self.cognito_issuer)
        self.paypal_secret_name = values.get("PAYPAL_SECRET_NAME", self.paypal_secret_name)

    @property
    def database_path(self) -> Path:
        return self._resolve_project_path(self.local_database_path)

    @property
    def file_storage_path(self) -> Path:
        return self._resolve_project_path(self.local_file_storage_path)

    @staticmethod
    def _resolve_project_path(value: str) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return (REPOSITORY_ROOT / path).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
