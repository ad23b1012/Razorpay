import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.razorpay_client import razorpay_service
from app.core.database import engine, Base, AsyncSessionLocal, ensure_schema_current
from app.data.seed_data import seed_database_if_empty, seed_experiment_history
from app.api import catalog, checkout, agent, growth, policies, audit, simulation, protocol, agent_commerce
from app.api.policies import load_policy_into_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("razoragent")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager: initialize DB tables and seed data on startup."""
    logger.info("Initializing RazorAgent Database schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await ensure_schema_current(conn)

    async with AsyncSessionLocal() as session:
        await seed_database_if_empty(session)
        await seed_experiment_history(session)
        # Restore the merchant's saved bounds, so what the console shows is what
        # the engine actually enforces.
        await load_policy_into_engine(session)

    logger.info(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} ready!")
    logger.info(f"CORS allowlist: {settings.cors_origin_list}")
    yield
    logger.info("Shutting down RazorAgent...")
    await engine.dispose()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Production-grade AI Growth & Agentic Commerce Engine for Razorpay Test Mode Rails",
    lifespan=lifespan
)

# CORS. Credentials stay off: this API authenticates nothing by cookie, and
# leaving them on is what makes a permissive origin list dangerous.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "X-Razorpay-Signature", "X-Razorpay-Event-Id"],
)

# Mount Routers
app.include_router(protocol.router)
app.include_router(catalog.router)
app.include_router(checkout.router)
app.include_router(agent.router)
app.include_router(agent_commerce.router)
app.include_router(growth.router)
app.include_router(policies.router)
app.include_router(audit.router)
app.include_router(simulation.router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "track": "Track 01: AI Growth & Agentic Commerce",
        "docs_url": "/docs",
        "agent_catalog_url": "/agent/v1/catalog",
        "agent_discovery_url": "/.well-known/agent-commerce.json"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "razorpay_mode": razorpay_service.mode,
        "gemini_active": bool(settings.GEMINI_API_KEY),
        "db": "supabase_postgres" if settings.SUPABASE_DATABASE_URL else "local_sqlite_async"
    }
