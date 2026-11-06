"""Contrato de agenda para el módulo de Gestoría.

La aplicación no conoce el ERP del cliente. El módulo trabaja contra este
contrato y, mientras no exista una integración corporativa, utiliza una agenda
local determinista para la demo. El adaptador corporativo podrá sustituirse sin
cambiar las rutas ni la aplicación móvil.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Protocol


class SchedulerAdapter(Protocol):
    provider_name: str

    def available_slots(
        self,
        start_date: date,
        end_date: date,
        advisor_id: str | None,
        occupied: set[str],
    ) -> list[dict[str, str]]: ...

    def is_available(self, scheduled_at: str, advisor_id: str, occupied: set[str]) -> bool: ...


class LocalSchedulerAdapter:
    provider_name = "local-demo"

    def available_slots(
        self,
        start_date: date,
        end_date: date,
        advisor_id: str | None,
        occupied: set[str],
    ) -> list[dict[str, str]]:
        slots: list[dict[str, str]] = []
        current = max(start_date, date.today())
        now = datetime.now(timezone.utc)
        while current <= end_date:
            if current.weekday() < 5:
                for hour in range(9, 17):
                    for minute in (0, 30):
                        value = datetime.combine(current, time(hour, minute), tzinfo=timezone.utc).isoformat()
                        if value not in occupied and datetime.fromisoformat(value) > now:
                            slots.append({"scheduled_at": value, "advisor_id": advisor_id or "", "provider": self.provider_name})
            current += timedelta(days=1)
        return slots

    def is_available(self, scheduled_at: str, advisor_id: str, occupied: set[str]) -> bool:
        parsed = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        normalized = parsed.astimezone(timezone.utc).isoformat()
        if normalized in occupied or parsed.weekday() >= 5 or parsed.hour < 9 or parsed.hour >= 17 or parsed.minute not in (0, 30):
            return False
        return parsed > datetime.now(timezone.utc)


class CorporateSchedulerAdapter:
    provider_name = "corporate"

    def available_slots(self, start_date: date, end_date: date, advisor_id: str | None, occupied: set[str]) -> list[dict[str, str]]:
        raise RuntimeError("El adaptador del ERP corporativo todavía no está configurado")

    def is_available(self, scheduled_at: str, advisor_id: str, occupied: set[str]) -> bool:
        raise RuntimeError("El adaptador del ERP corporativo todavía no está configurado")


def get_scheduler(provider: str) -> SchedulerAdapter:
    if provider == "corporate":
        return CorporateSchedulerAdapter()
    return LocalSchedulerAdapter()
