from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent

# learn_crewai.py lives in the repository root and stays there.
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# CrewAI may otherwise ask an interactive tracing question on a background thread.
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="WORKPLACE_",
        env_file=(str(ROOT_DIR / ".env"), str(BACKEND_DIR / ".env")),
        extra="ignore",
    )

    data_dir: Path = ROOT_DIR / "data"
    runs_dir: Path = ROOT_DIR / "runs"
    database_url: str | None = None
    legacy_report_path: Path | None = ROOT_DIR / "report.md"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    allowed_models: list[str] = Field(
        default_factory=lambda: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]
    )
    max_custom_participants: int = 5

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.data_dir / 'workplace.db').as_posix()}"

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.runs_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
