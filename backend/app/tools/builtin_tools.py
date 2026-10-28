"""Small, audited tools that UI-created agents may use.

These are the only tools reachable from agent configuration. Users choose them
by key; they can never supply code, import paths or commands.
"""
from __future__ import annotations

import ast
import ipaddress
import operator
import os
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

MAX_FETCH_BYTES = 300_000
MAX_TOOL_OUTPUT = 8_000


class _CalcInput(BaseModel):
    expression: str = Field(..., description="Arithmetic expression, e.g. (1200 * 0.05) / 12")


_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
    ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def safe_eval(expression: str) -> float:
    if len(expression) > 200:
        raise ValueError("Expression too long")

    def ev(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 10:
                raise ValueError("Exponent too large")
            return _OPS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        raise ValueError("Only numbers and + - * / // % ** are allowed")

    return ev(ast.parse(expression, mode="eval"))


class CalculatorTool(BaseTool):
    name: str = "calculator"
    description: str = "Evaluate a basic arithmetic expression and return the numeric result."
    args_schema: type[BaseModel] = _CalcInput

    def _run(self, expression: str) -> str:
        try:
            return str(safe_eval(expression))
        except Exception as exc:  # returned to the agent, not raised
            return f"Error: {exc}"


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip and data.strip():
            self.parts.append(data.strip())


def _is_public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            return False
    return True


class _FetchInput(BaseModel):
    url: str = Field(..., description="Public http(s) URL to read")


class FetchWebpageTool(BaseTool):
    name: str = "fetch_webpage"
    description: str = "Download a public web page and return its readable text (truncated)."
    args_schema: type[BaseModel] = _FetchInput

    def _run(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return "Error: only public http(s) URLs are allowed"
        if not _is_public_host(parsed.hostname):
            return "Error: private, local or unresolvable hosts are not allowed"
        try:
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                resp = client.get(url, headers={"User-Agent": "CrewAI-Workplace/0.1"})
        except httpx.HTTPError as exc:
            return f"Error: request failed ({type(exc).__name__})"
        if resp.status_code >= 400:
            return f"Error: HTTP {resp.status_code}"
        body = resp.content[:MAX_FETCH_BYTES].decode(resp.encoding or "utf-8", errors="replace")
        if "html" in resp.headers.get("content-type", ""):
            parser = _TextExtractor()
            parser.feed(body)
            body = "\n".join(parser.parts)
        body = re.sub(r"\n{3,}", "\n\n", body)
        return body[:MAX_TOOL_OUTPUT]


class _SearchInput(BaseModel):
    query: str = Field(..., description="Search query")


class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = "Search the web (Serper.dev) and return the top results with links."
    args_schema: type[BaseModel] = _SearchInput

    def _run(self, query: str) -> str:
        key = os.getenv("SERPER_API_KEY")
        if not key:
            return "Error: web search is not configured"
        try:
            resp = httpx.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": key, "Content-Type": "application/json"},
                json={"q": query[:300], "num": 8},
                timeout=15,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            return f"Error: search failed ({type(exc).__name__})"
        lines = []
        for item in resp.json().get("organic", [])[:8]:
            lines.append(f"- {item.get('title')}\n  {item.get('link')}\n  {item.get('snippet', '')}")
        return "\n".join(lines)[:MAX_TOOL_OUTPUT] or "No results."
