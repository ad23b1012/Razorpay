import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

logger = logging.getLogger("razoragent.db")

# Determine active database URL (Supabase Postgres or local SQLite)
db_url = settings.SUPABASE_DATABASE_URL or settings.DATABASE_URL

# Fix SQLAlchemy async prefix if Supabase url is standard postgresql://
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

# Configure engine with pooling for production or sqlite options for local dev
is_sqlite = db_url.startswith("sqlite")

engine_kwargs = {"echo": False}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # High-throughput connection pooling for Supabase / PostgreSQL
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 40,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    })

engine = create_async_engine(db_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for providing asynchronous database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _column_ddl_type(column) -> str:
    """Renders a column's type for an ALTER TABLE on the active dialect."""
    return column.type.compile(dialect=engine.dialect)


async def ensure_schema_current(conn) -> None:
    """
    Adds columns that the models declare but an existing database is missing.

    `create_all` builds new tables but never alters existing ones, so a database
    created before a column was added keeps working right up until the first
    INSERT that mentions it. This walks the declared schema and issues additive
    `ALTER TABLE ... ADD COLUMN` for anything absent.

    Deliberately additive only: nothing here drops or retypes a column, so it can
    never destroy data. A production deployment would use Alembic; this keeps a
    developer's existing razoragent.db working across a schema change without
    asking them to delete it.
    """
    from sqlalchemy import inspect, text

    def _inspect(sync_conn):
        inspector = inspect(sync_conn)
        return {
            name: {
                "columns": {col["name"] for col in inspector.get_columns(name)},
                "indexes": {idx["name"] for idx in inspector.get_indexes(name)},
            }
            for name in inspector.get_table_names()
        }

    existing = await conn.run_sync(_inspect)

    for table in Base.metadata.sorted_tables:
        state = existing.get(table.name)
        if state is None:
            continue  # create_all handles brand-new tables.

        present = state["columns"]

        for column in table.columns:
            if column.name in present:
                continue

            ddl = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {_column_ddl_type(column)}"

            # A new column on populated rows needs a default the database can apply.
            default = column.default.arg if column.default is not None and not callable(column.default.arg) else None
            if default is not None:
                # TRUE/FALSE rather than 1/0: PostgreSQL rejects integer literals for
                # a boolean column, and SQLite accepts the keywords too.
                literal = "TRUE" if default is True else "FALSE" if default is False else repr(default)
                ddl += f" DEFAULT {literal}"

            logger.info(f"Schema migration: adding {table.name}.{column.name}")
            await conn.execute(text(ddl))

        # `create_all` only builds indexes alongside a new table, and SQLite
        # cannot attach UNIQUE to an ADD COLUMN. Without this pass a migrated
        # database would quietly lose the uniqueness the audit chain depends on
        # to stop two writers claiming the same sequence number.
        for index in table.indexes:
            if index.name in state["indexes"]:
                continue

            columns = ", ".join(col.name for col in index.columns)
            unique = "UNIQUE " if index.unique else ""
            logger.info(f"Schema migration: creating index {index.name} on {table.name}")
            await conn.execute(text(
                f"CREATE {unique}INDEX IF NOT EXISTS {index.name} ON {table.name} ({columns})"
            ))
