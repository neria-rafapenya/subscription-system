"""Contrato de integración de información persistente con el ERP del cliente.

La demo usa un adaptador local que registra la relación entre el identificador
interno y un identificador externo estable. El adaptador corporativo se podrá
implementar cuando conozcamos la API, autenticación y modelo del ERP.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol


class ErpAdapter(Protocol):
    provider_name: str

    def sync(self, entity_type: str, entity_id: str, payload: dict[str, Any]) -> dict[str, str]: ...


class LocalErpAdapter:
    provider_name = "local-demo"

    def sync(self, entity_type: str, entity_id: str, payload: dict[str, Any]) -> dict[str, str]:
        return {
            "external_id": f"local:{entity_type}:{entity_id}",
            "sync_status": "synced",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
        }


class CorporateErpAdapter:
    provider_name = "corporate"

    def sync(self, entity_type: str, entity_id: str, payload: dict[str, Any]) -> dict[str, str]:
        raise RuntimeError("La integración con el ERP corporativo todavía no está configurada")


def get_erp_adapter(provider: str) -> ErpAdapter:
    if provider == "corporate":
        return CorporateErpAdapter()
    return LocalErpAdapter()
