"""Models agents may use: approved OpenAI models plus locally installed Ollama models."""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from collections.abc import Iterable

import httpx

import learn_crewai
from app.core.config import Settings
from app.schemas.agents import ModelOption

log = logging.getLogger(__name__)

OLLAMA_PREFIX = "ollama/"
_OLLAMA_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,70}$")
# Ollama also lists embedding models, which cannot drive an agent.
_EMBEDDING_HINTS = ("embed", "bge-", "minilm")
_CACHE_SECONDS = 10.0


def is_ollama(model: str) -> bool:
    return model.startswith(OLLAMA_PREFIX)


class ModelCatalog:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._lock = threading.Lock()
        self._cached: tuple[float, list[str] | None] | None = None

    @property
    def default_model(self) -> str:
        return os.getenv("OPENAI_MODEL", learn_crewai.DEFAULT_MODEL)

    @property
    def ollama_base_url(self) -> str | None:
        return self.settings.ollama_base_url.rstrip("/") or None

    def ollama_models(self) -> list[str] | None:
        """Installed chat models, or None when Ollama is disabled or not reachable."""
        if not self.ollama_base_url:
            return None
        with self._lock:
            if self._cached and time.monotonic() - self._cached[0] < _CACHE_SECONDS:
                return self._cached[1]
        try:
            resp = httpx.get(f"{self.ollama_base_url}/api/tags", timeout=1.5)
            resp.raise_for_status()
            names = sorted(
                m["name"] for m in resp.json().get("models", [])
                if not any(h in m["name"].lower() for h in _EMBEDDING_HINTS)
            )
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            log.debug("Ollama not available at %s: %s", self.ollama_base_url, exc)
            names = None
        with self._lock:
            self._cached = (time.monotonic(), names)
        return names

    def options(self) -> list[ModelOption]:
        has_key = bool(os.getenv("OPENAI_API_KEY"))
        out = [
            ModelOption(
                id=m, label=m, provider="openai", available=has_key,
                unavailable_reason=None if has_key else "OPENAI_API_KEY is not set",
            )
            for m in self.settings.allowed_models
        ]
        for name in self.ollama_models() or []:
            out.append(ModelOption(id=OLLAMA_PREFIX + name, label=name, provider="ollama", available=True))
        return out

    def validate(self, model: str | None) -> str | None:
        """Problem with a configured model name, or None if it may be saved."""
        if not model:
            return None
        if is_ollama(model):
            if not self.ollama_base_url:
                return "Local Ollama models are disabled on the backend"
            if not _OLLAMA_NAME.match(model[len(OLLAMA_PREFIX):]):
                return f"Model '{model}' is not a valid Ollama model name"
            return None
        if model not in self.settings.allowed_models:
            return f"Model '{model}' is not in the approved list"
        return None

    def readiness_problems(self, models: Iterable[str]) -> list[str]:
        """Why a run using these models cannot start right now."""
        models = set(models)
        problems: list[str] = []
        if any(not is_ollama(m) for m in models) and not os.getenv("OPENAI_API_KEY"):
            problems.append("OPENAI_API_KEY is not configured on the backend")
        local = sorted(m[len(OLLAMA_PREFIX):] for m in models if is_ollama(m))
        if local:
            installed = self.ollama_models()
            if installed is None:
                problems.append(f"Ollama is not reachable at {self.ollama_base_url}; start it with 'ollama serve'")
            else:
                problems += [
                    f"Ollama model '{name}' is not installed; run 'ollama pull {name}'"
                    for name in local if name not in installed
                ]
        return problems
