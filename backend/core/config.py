from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://biletflow:biletflow@localhost:5432/biletflow"
    secret_key: str
    frontend_url: str = "http://localhost:5173"

    access_token_ttl_minutes: int = 15

    organizer_terms_version: str = "2026-10"

    media_root: str = "media"
    media_url: str = "http://localhost:8000/media"
    max_image_bytes: int = 5 * 1024 * 1024
    max_images_per_application: int = 10

    smtp_host: str = ""
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    email_from: str = "BiletFlow <no-reply@biletflow.local>"


settings = Settings()
