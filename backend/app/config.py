import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field, ConfigDict

# Resolved from this file rather than the working directory, so the backend picks
# up the same .env whether it is started from the repo root or from backend/.
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# Both locations are honoured because .env.example ships at the repo root while
# the server is normally started from backend/. A file in backend/ wins.
ENV_FILES = (REPO_ROOT / ".env", BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=ENV_FILES, extra="allow")

    APP_NAME: str = "RazorAgent — AI Growth & Agentic Commerce Engine"
    APP_VERSION: str = "1.0.0"
    ENV: str = "development"
    DEBUG: bool = True
    
    # Razorpay Credentials (Free Developer Test Mode)
    RAZORPAY_KEY_ID: str = Field(default="rzp_test_demo12345678", validation_alias="RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET: str = Field(default="demo_secret_key_abcdef", validation_alias="RAZORPAY_KEY_SECRET")
    RAZORPAY_WEBHOOK_SECRET: str = Field(default="demo_webhook_secret_123", validation_alias="RAZORPAY_WEBHOOK_SECRET")
    RAZORPAY_MOCK_MODE: bool = Field(default=True, validation_alias="RAZORPAY_MOCK_MODE")

    # LLM / AI Configuration (Google Gemini)
    GEMINI_API_KEY: Optional[str] = Field(default=None, validation_alias="GEMINI_API_KEY")
    GEMINI_MODEL: str = "gemini-2.0-flash"
    
    # Database Configuration (Supabase PostgreSQL or local SQLite fallback)
    SUPABASE_DATABASE_URL: Optional[str] = Field(default=None, validation_alias="SUPABASE_DATABASE_URL")
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./razoragent.db",
        validation_alias="DATABASE_URL"
    )

    # Merchant Default Guardrails ("THE BAR")
    MAX_GLOBAL_DISCOUNT_PERCENT: float = 20.0
    DEFAULT_OFFER_DISCOUNT_PERCENT: float = 12.0
    DAILY_CAMPAIGN_BUDGET_INR: float = 50000.0
    APPROVAL_GATE_THRESHOLD_INR: float = 5000.0
    MIN_CART_VALUE_FOR_OFFER_INR: float = 1500.0

    # CORS. A comma-separated allowlist, e.g.
    #   CORS_ORIGINS=https://razoragent.vercel.app,http://localhost:5173
    # The previous default included "*", which combined with credentialled
    # requests would let any site on the internet drive this API against a
    # signed-in merchant. Deployments name their frontend explicitly.
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
        validation_alias="CORS_ORIGINS",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()
