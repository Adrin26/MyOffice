from __future__ import annotations

from typing import Any

from app.database.models import SettingRecord
from app.database.session import Database
from app.schemas.runs import AppSettings, AppSettingsUpdate


class SettingsStore:
    def __init__(self, db: Database):
        self.db = db

    def get_raw(self, key: str, default: Any = None) -> Any:
        with self.db.session() as s:
            rec = s.get(SettingRecord, key)
            return rec.value if rec else default

    def set_raw(self, key: str, value: Any) -> None:
        with self.db.session() as s:
            rec = s.get(SettingRecord, key)
            if rec is None:
                s.add(SettingRecord(key=key, value=value))
            else:
                rec.value = value

    def app_settings(self) -> AppSettings:
        stored = self.get_raw("app_settings", {}) or {}
        return AppSettings(**{**AppSettings().model_dump(), **stored})

    def update_app_settings(self, patch: AppSettingsUpdate) -> AppSettings:
        current = self.app_settings().model_dump()
        current.update(patch.model_dump(exclude_unset=True, exclude_none=True))
        settings = AppSettings(**current)
        self.set_raw("app_settings", settings.model_dump())
        return settings
