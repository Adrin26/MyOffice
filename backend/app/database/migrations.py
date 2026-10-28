"""Minimal, ordered schema migrations.

Each migration runs exactly once and is recorded in `schema_version`.
Append new migrations to MIGRATIONS; never edit an applied one.
"""
from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import Connection, inspect, select

from app.core.time import utcnow_iso
from app.database.models import Base, SchemaVersion
from app.database.session import Database

log = logging.getLogger(__name__)


def _v1_initial(conn: Connection) -> None:
    Base.metadata.create_all(conn)


MIGRATIONS: list[tuple[int, Callable[[Connection], None]]] = [
    (1, _v1_initial),
]


def run_migrations(db: Database) -> int:
    with db.engine.begin() as conn:
        if not inspect(conn).has_table(SchemaVersion.__tablename__):
            SchemaVersion.__table__.create(conn)
        applied = set(conn.execute(select(SchemaVersion.version)).scalars())
        for version, migrate in MIGRATIONS:
            if version in applied:
                continue
            log.info("Applying schema migration v%s", version)
            migrate(conn)
            conn.execute(
                SchemaVersion.__table__.insert().values(version=version, applied_at=utcnow_iso())
            )
            applied.add(version)
    return max(applied) if applied else 0
