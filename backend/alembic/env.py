from logging.config import fileConfig

from sqlalchemy import create_engine, pool, text
from alembic import context

from app.config import settings
from app.database import Base

import app.models  # noqa: ensures all models are imported

config = context.config

# `%` is special in alembic.ini values (configparser interpolation); passwords are URL-quoted
# and so can contain `%XX`. Escape it for the ini-backed (offline) path.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Session-level advisory lock so concurrent `alembic upgrade head` runs (e.g. backend and the
# CI pre-step starting together) serialize; the second one then finds nothing left to do.
MIGRATION_LOCK_ID = 724001

# Fail fast instead of hanging forever behind a long-running query holding a table lock.
LOCK_TIMEOUT_MS = 10_000


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Built directly (not via the ini file) so the real URL never goes through interpolation.
    connectable = create_engine(
        settings.DATABASE_URL_SYNC,
        poolclass=pool.NullPool,
        connect_args={"options": f"-c lock_timeout={LOCK_TIMEOUT_MS}"},
    )

    # The lock lives on its own AUTOCOMMIT connection so it never leaves the migration
    # connection in an implicit transaction (which would stop alembic from committing).
    with connectable.connect() as lock_conn:
        lock_conn = lock_conn.execution_options(isolation_level="AUTOCOMMIT")
        lock_conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": MIGRATION_LOCK_ID})
        try:
            with connectable.connect() as connection:
                context.configure(
                    connection=connection,
                    target_metadata=target_metadata,
                    # Revisions are hand-written; the ORM uses unbounded String against the
                    # SQL VARCHAR(n) columns, so type comparison would only produce noise.
                    compare_type=False,
                )
                with context.begin_transaction():
                    context.run_migrations()
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": MIGRATION_LOCK_ID})


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
