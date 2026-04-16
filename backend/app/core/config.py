import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Demand Forecast Platform"
    api_prefix: str = "/api"
    environment: str = "dev"

    # Default to local SQLite so single-service managed deploys can start without
    # requiring a pre-provisioned Postgres instance. Production can override
    # with DATABASE_URL (e.g. Neon/Render Postgres).
    database_url: str = "sqlite:///./forecast.db"
    # Keep as string to avoid pydantic-settings JSON parsing errors for comma-separated env values.
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    upload_dir: Path = Path("/app/data/uploads")
    random_seed: int = 42

    default_metric: str = "smape"
    default_horizon: int = 14
    max_horizon: int = 180
    max_tune_trials: int = 50

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str | None) -> str | None:
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        if normalized.startswith("postgres://"):
            # Many cloud providers export postgres:// while SQLAlchemy with psycopg
            # expects postgresql+psycopg://.
            return f"postgresql+psycopg://{normalized[len('postgres://') :]}"

        if normalized.startswith("postgresql://"):
            return f"postgresql+psycopg://{normalized[len('postgresql://') :]}"

        return normalized

    def cors_origins_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if not raw:
            return []

        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass

        return [item.strip() for item in raw.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings
