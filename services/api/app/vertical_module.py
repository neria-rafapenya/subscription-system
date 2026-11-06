"""Loads the business vertical selected for this installation.

The core subscription engine deliberately consumes JSON manifests instead of
importing sector-specific Python code. A new vertical can therefore be added
under ``modules/<id>`` without changing the API, database or client core.
"""

from __future__ import annotations

import json
import importlib.util
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import REPOSITORY_ROOT, get_settings


_MODULE_ID = re.compile(r"^[a-z][a-z0-9-]{1,48}$")


def _module_directory(module_id: str) -> Path:
    if not _MODULE_ID.fullmatch(module_id):
        raise RuntimeError(f"APP_VERTICAL_MODULE no válido: {module_id!r}")
    directory = (REPOSITORY_ROOT / "modules" / module_id).resolve()
    modules_root = (REPOSITORY_ROOT / "modules").resolve()
    if modules_root not in directory.parents:
        raise RuntimeError("El módulo vertical queda fuera del directorio permitido")
    return directory


@lru_cache
def load_vertical_module() -> dict[str, Any]:
    module_id = get_settings().vertical_module.strip().lower()
    manifest_path = _module_directory(module_id) / "manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(
            f"No existe el manifiesto del módulo vertical '{module_id}'. "
            "Revisa APP_VERTICAL_MODULE y modules/<id>/manifest.json."
        )
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"El manifiesto del módulo '{module_id}' no es JSON válido") from exc
    if not isinstance(manifest, dict) or manifest.get("id") != module_id:
        raise RuntimeError(f"El manifiesto de '{module_id}' debe declarar el mismo id")
    if not isinstance(manifest.get("services"), list) or not isinstance(manifest.get("plans"), list):
        raise RuntimeError(f"El manifiesto de '{module_id}' debe incluir services y plans")
    return manifest


def vertical_module_id() -> str:
    return str(load_vertical_module()["id"])


def vertical_display_name() -> str:
    return str(load_vertical_module().get("display_name", vertical_module_id()))


def vertical_description() -> str:
    return str(load_vertical_module().get("description", ""))


def vertical_version() -> str:
    return str(load_vertical_module().get("module_version", "0.0.0"))


def service_catalog() -> dict[str, dict[str, Any]]:
    """Return the active module's presentation metadata indexed by service id."""
    return {
        str(item["id"]): dict(item)
        for item in load_vertical_module()["services"]
        if isinstance(item, dict) and item.get("id")
    }


def seed_services() -> list[tuple[str, str, str, str]]:
    return [
        (str(item["id"]), str(item["name"]), str(item["description"]), str(item.get("minimum_tier", "basic")))
        for item in load_vertical_module()["services"]
    ]


def seed_plans() -> list[tuple[str, str, str, int, str, str, str]]:
    return [
        (
            str(item["id"]),
            str(item["name"]),
            str(item["description"]),
            int(item["amount_cents"]),
            str(item.get("currency", "EUR")),
            str(item.get("interval", "month")),
            str(item.get("tier", "basic")),
        )
        for item in load_vertical_module()["plans"]
    ]


def register_vertical_backend(app: Any, context: dict[str, Any]) -> None:
    """Register the selected module's optional backend plugin.

    The core only loads a plugin from the selected module directory and never
    accepts a path supplied by a request. Modules without a plugin remain
    manifest-only modules.
    """
    manifest = load_vertical_module()
    plugin_relative_path = manifest.get("backend_plugin", "backend/plugin.py")
    if not isinstance(plugin_relative_path, str):
        raise RuntimeError("backend_plugin debe ser una ruta relativa")
    module_directory = _module_directory(vertical_module_id())
    plugin_path = (module_directory / plugin_relative_path).resolve()
    if module_directory not in plugin_path.parents or plugin_path.name != "plugin.py":
        raise RuntimeError("El plugin backend queda fuera del directorio del módulo")
    if not plugin_path.is_file():
        return
    module_name = f"subscription_vertical_{vertical_module_id()}_backend"
    spec = importlib.util.spec_from_file_location(module_name, plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"No se puede cargar el plugin backend de '{vertical_module_id()}'")
    plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plugin)
    register = getattr(plugin, "register", None)
    if not callable(register):
        raise RuntimeError(f"El plugin backend de '{vertical_module_id()}' debe exponer register(app, context)")
    register(app, context)
