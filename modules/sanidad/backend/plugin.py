"""Backend extension for the Sanidad module.

The common API only supplies infrastructure and authentication. All tables,
routes, storage conventions and business rules in this file belong to the
sector module.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field


MAX_DOCUMENT_SIZE = 20 * 1024 * 1024


class AppointmentCreate(BaseModel):
    doctor_id: str
    modality: str = Field(pattern="^(presencial|videollamada|telefonica)$")
    scheduled_at: str = Field(min_length=10, max_length=80)
    reason: str = Field(min_length=3, max_length=500)


class PatientProfileUpdate(BaseModel):
    birth_date: str | None = Field(default=None, max_length=20)
    allergies: str | None = Field(default=None, max_length=2000)
    conditions: str | None = Field(default=None, max_length=2000)
    medications: str | None = Field(default=None, max_length=2000)
    emergency_contact: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=3000)


class MessageCreate(BaseModel):
    subject: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=1, max_length=4000)


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ReportCreate(BaseModel):
    customer_id: str
    doctor_id: str | None = None
    title: str = Field(min_length=2, max_length=200)
    report_type: str = Field(min_length=2, max_length=80)
    content: str = Field(min_length=1, max_length=12000)
    issued_at: str = Field(min_length=10, max_length=80)


def register(app, context):
    connection = context["connection"]
    authenticated_customer_id = context["authenticated_customer_id"]
    settings = context["settings"]
    router = APIRouter(prefix="/modules/sanidad", tags=["sanidad"])
    schema_path = Path(__file__).with_name("schema.sql")

    with connection() as conn:
        conn.executescript(schema_path.read_text(encoding="utf-8"))
        conn.executemany(
            "INSERT OR IGNORE INTO sanidad_doctors (id, name, specialty) VALUES (?, ?, ?)",
            [
                ("doctor-garcia", "Dra. Elena García", "Medicina general"),
                ("doctor-martin", "Dr. Javier Martín", "Cardiología"),
                ("doctor-sanchez", "Dra. Laura Sánchez", "Dermatología"),
            ],
        )
        conn.commit()

    def now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def normalize_datetime(value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="La fecha indicada no es válida") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()

    def rows(query: str, params: tuple = ()) -> list[dict]:
        with connection() as conn:
            return [dict(row) for row in conn.execute(query, params).fetchall()]

    def ensure_profile(conn, customer_id: str) -> None:
        conn.execute("INSERT OR IGNORE INTO sanidad_patient_profiles (customer_id) VALUES (?)", (customer_id,))

    def customer_id_from_header(authorization: str | None) -> str:
        return authenticated_customer_id(authorization)

    def require_subscription(customer_id: str, minimum_tier: str = "basic") -> None:
        active = rows(
            """
            SELECT plans.tier FROM subscriptions
            JOIN plans ON plans.id = subscriptions.plan_id
            WHERE subscriptions.customer_id = ?
              AND subscriptions.status IN ('active', 'grace_period')
            ORDER BY CASE plans.tier WHEN 'premium' THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (customer_id,),
        )
        if not active:
            raise HTTPException(status_code=403, detail="Necesitas una suscripción activa para acceder a Sanidad")
        if minimum_tier == "premium" and active[0]["tier"] != "premium":
            raise HTTPException(status_code=403, detail="Esta función requiere el plan Premium")

    def require_backoffice(token: str | None) -> None:
        expected = settings.backoffice_admin_token
        if not expected or not token or not secrets.compare_digest(token, expected):
            raise HTTPException(status_code=403, detail="Se requiere un token de administrador sanitario")

    def mark_due_notifications(conn) -> None:
        conn.execute(
            "UPDATE sanidad_notifications SET status = 'due' WHERE status = 'scheduled' AND scheduled_for <= ?",
            (now(),),
        )

    def document_with_url(item: dict) -> dict:
        item["url"] = f"/media/{item['storage_key']}"
        return item

    def save_document(customer_id: str, upload: UploadFile) -> tuple[str, str, str, int]:
        if not upload.filename:
            raise HTTPException(status_code=422, detail="El archivo no tiene nombre")
        content = upload.file.read(MAX_DOCUMENT_SIZE + 1)
        if len(content) > MAX_DOCUMENT_SIZE:
            raise HTTPException(status_code=413, detail="El documento supera el límite de 20 MB")
        filename = Path(upload.filename).name
        suffix = Path(filename).suffix.lower() or ".bin"
        key = f"sanidad/documents/{customer_id}/{uuid4().hex}{suffix}"
        target = settings.file_storage_path / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return key, filename, upload.content_type or "application/octet-stream", len(content)

    def schedule_appointment_notifications(conn, customer_id: str, appointment_id: str, scheduled_at: str) -> None:
        appointment_time = datetime.fromisoformat(scheduled_at)
        for reminder_type, offset, title, body in (
            ("48h", timedelta(hours=48), "Recordatorio de cita", "Tu cita sanitaria es dentro de 48 horas."),
            ("2h", timedelta(hours=2), "Cita próxima", "Tu cita sanitaria comienza aproximadamente en 2 horas."),
        ):
            conn.execute(
                """
                INSERT INTO sanidad_notifications
                    (id, customer_id, appointment_id, type, title, body, scheduled_for)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (f"notification-{uuid4().hex[:16]}", customer_id, appointment_id, reminder_type, title, body, (appointment_time - offset).isoformat()),
            )

    @router.get("/doctors")
    def doctors() -> list[dict]:
        return rows("SELECT id, name, specialty FROM sanidad_doctors WHERE active = 1 ORDER BY name")

    @router.get("/profile/me")
    def patient_profile(authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        with connection() as conn:
            ensure_profile(conn, customer_id)
            conn.commit()
            return dict(conn.execute("SELECT * FROM sanidad_patient_profiles WHERE customer_id = ?", (customer_id,)).fetchone())

    @router.patch("/profile/me")
    def update_patient_profile(payload: PatientProfileUpdate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        values = payload.model_dump()
        with connection() as conn:
            ensure_profile(conn, customer_id)
            conn.execute(
                """
                UPDATE sanidad_patient_profiles
                SET birth_date = ?, allergies = ?, conditions = ?, medications = ?,
                    emergency_contact = ?, notes = ?, updated_at = ?
                WHERE customer_id = ?
                """,
                (*[values[key] for key in ("birth_date", "allergies", "conditions", "medications", "emergency_contact", "notes")], now(), customer_id),
            )
            conn.commit()
            return dict(conn.execute("SELECT * FROM sanidad_patient_profiles WHERE customer_id = ?", (customer_id,)).fetchone())

    @router.get("/documents/me")
    def my_documents(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return [document_with_url(item) for item in rows("SELECT * FROM sanidad_documents WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,))]

    @router.post("/documents", status_code=201)
    def upload_document(
        title: str = Form(..., min_length=2, max_length=200),
        category: str = Form("general", min_length=2, max_length=80),
        document: UploadFile = File(...),
        authorization: str | None = Header(default=None),
    ) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        storage_key, filename, content_type, size_bytes = save_document(customer_id, document)
        item = (f"document-{uuid4().hex[:16]}", customer_id, title.strip(), category.strip(), filename, content_type, size_bytes, storage_key, customer_id)
        with connection() as conn:
            conn.execute("INSERT INTO sanidad_documents (id, customer_id, title, category, filename, content_type, size_bytes, storage_key, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", item)
            conn.execute("INSERT INTO sanidad_audit_events (id, customer_id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)", (f"audit-{uuid4().hex[:16]}", customer_id, customer_id, "upload", "document", item[0]))
            conn.commit()
        return document_with_url(dict(zip(("id", "customer_id", "title", "category", "filename", "content_type", "size_bytes", "storage_key", "uploaded_by"), item)))

    @router.get("/appointments/me")
    def my_appointments(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return rows("SELECT appointments.*, doctors.name AS doctor_name, doctors.specialty FROM sanidad_appointments appointments JOIN sanidad_doctors doctors ON doctors.id = appointments.doctor_id WHERE appointments.customer_id = ? ORDER BY appointments.scheduled_at", (customer_id,))

    @router.post("/appointments", status_code=201)
    def create_appointment(payload: AppointmentCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        scheduled_at = normalize_datetime(payload.scheduled_at)
        with connection() as conn:
            doctor = conn.execute("SELECT id, name, specialty FROM sanidad_doctors WHERE id = ? AND active = 1", (payload.doctor_id,)).fetchone()
            if not doctor:
                raise HTTPException(status_code=404, detail="Médico no encontrado")
            appointment_id = f"appointment-{uuid4().hex[:16]}"
            conn.execute("INSERT INTO sanidad_appointments (id, customer_id, doctor_id, modality, scheduled_at, reason) VALUES (?, ?, ?, ?, ?, ?)", (appointment_id, customer_id, payload.doctor_id, payload.modality, scheduled_at, payload.reason.strip()))
            schedule_appointment_notifications(conn, customer_id, appointment_id, scheduled_at)
            conn.commit()
        return {"id": appointment_id, "status": "requested", "scheduled_at": scheduled_at, "doctor_name": doctor["name"], "specialty": doctor["specialty"]}

    @router.get("/reports/me")
    def my_reports(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return rows("SELECT reports.*, doctors.name AS doctor_name, doctors.specialty FROM sanidad_reports reports LEFT JOIN sanidad_doctors doctors ON doctors.id = reports.doctor_id WHERE reports.customer_id = ? ORDER BY reports.issued_at DESC", (customer_id,))

    @router.get("/messages/me")
    def my_messages(authorization: str | None = Header(default=None)) -> list[dict]:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        return rows("SELECT * FROM sanidad_messages WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,))

    @router.post("/messages", status_code=201)
    def create_message(payload: MessageCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id)
        message = (f"message-{uuid4().hex[:16]}", customer_id, "patient", payload.subject.strip(), payload.body.strip())
        with connection() as conn:
            conn.execute("INSERT INTO sanidad_messages (id, customer_id, sender_type, subject, body) VALUES (?, ?, ?, ?, ?)", message)
            conn.commit()
        return dict(zip(("id", "customer_id", "sender_type", "subject", "body"), message))

    @router.post("/chat/sessions", status_code=201)
    def create_chat_session(authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        session = (f"chat-{uuid4().hex[:16]}", customer_id)
        with connection() as conn:
            conn.execute("INSERT INTO sanidad_chat_sessions (id, customer_id) VALUES (?, ?)", session)
            conn.commit()
        return {"id": session[0], "customer_id": customer_id, "status": "open", "messages": []}

    @router.get("/chat/sessions/{session_id}")
    def chat_session(session_id: str, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        sessions = rows("SELECT * FROM sanidad_chat_sessions WHERE id = ? AND customer_id = ?", (session_id, customer_id))
        if not sessions:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        sessions[0]["messages"] = rows("SELECT * FROM sanidad_chat_messages WHERE session_id = ? ORDER BY created_at", (session_id,))
        return sessions[0]

    @router.post("/chat/sessions/{session_id}/messages", status_code=201)
    def add_chat_message(session_id: str, payload: ChatMessageCreate, authorization: str | None = Header(default=None)) -> dict:
        customer_id = customer_id_from_header(authorization)
        require_subscription(customer_id, "premium")
        if not rows("SELECT id FROM sanidad_chat_sessions WHERE id = ? AND customer_id = ?", (session_id, customer_id)):
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        response = "Este asistente está en modo demostración. Próximamente se conectará a un proveedor de IA y no sustituye la valoración de un profesional sanitario."
        with connection() as conn:
            conn.execute("INSERT INTO sanidad_chat_messages (id, session_id, author, body) VALUES (?, ?, 'user', ?)", (f"chat-message-{uuid4().hex[:16]}", session_id, payload.body.strip()))
            conn.execute("INSERT INTO sanidad_chat_messages (id, session_id, author, body) VALUES (?, ?, 'assistant', ?)", (f"chat-message-{uuid4().hex[:16]}", session_id, response))
            conn.commit()
        return {"session_id": session_id, "answer": response, "provider": "mock"}

    @router.get("/backoffice/overview")
    def backoffice_overview(x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            mark_due_notifications(conn)
            overview = {
                "patients": conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
                "documents": conn.execute("SELECT COUNT(*) FROM sanidad_documents").fetchone()[0],
                "appointments": conn.execute("SELECT COUNT(*) FROM sanidad_appointments WHERE status NOT IN ('cancelled', 'completed')").fetchone()[0],
                "reports": conn.execute("SELECT COUNT(*) FROM sanidad_reports").fetchone()[0],
                "due_notifications": conn.execute("SELECT COUNT(*) FROM sanidad_notifications WHERE status = 'due'").fetchone()[0],
                "unread_messages": conn.execute("SELECT COUNT(*) FROM sanidad_messages WHERE read_at IS NULL").fetchone()[0],
            }
            conn.commit()
        return overview

    @router.get("/backoffice/patients")
    def backoffice_patients(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("""
            SELECT customers.id, customers.name, customers.email, customers.created_at,
                   profiles.birth_date, profiles.allergies, profiles.conditions,
                   (SELECT COUNT(*) FROM sanidad_documents WHERE customer_id = customers.id) AS document_count,
                   (SELECT COUNT(*) FROM sanidad_appointments WHERE customer_id = customers.id) AS appointment_count,
                   (SELECT COUNT(*) FROM sanidad_reports WHERE customer_id = customers.id) AS report_count,
                   (SELECT COUNT(*) FROM sanidad_messages WHERE customer_id = customers.id AND read_at IS NULL) AS unread_message_count
            FROM customers LEFT JOIN sanidad_patient_profiles profiles ON profiles.customer_id = customers.id
            ORDER BY customers.name
        """)

    @router.get("/backoffice/patients/{customer_id}")
    def backoffice_patient_detail(customer_id: str, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        patients = rows("SELECT id, name, email, cognito_sub, created_at, billing_address, tax_id FROM customers WHERE id = ?", (customer_id,))
        if not patients:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        with connection() as conn:
            ensure_profile(conn, customer_id)
            mark_due_notifications(conn)
            profile = dict(conn.execute("SELECT * FROM sanidad_patient_profiles WHERE customer_id = ?", (customer_id,)).fetchone())
            conn.commit()
        return {
            "patient": patients[0],
            "profile": profile,
            "documents": [document_with_url(item) for item in rows("SELECT * FROM sanidad_documents WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,))],
            "appointments": rows("SELECT appointments.*, doctors.name AS doctor_name, doctors.specialty FROM sanidad_appointments appointments JOIN sanidad_doctors doctors ON doctors.id = appointments.doctor_id WHERE appointments.customer_id = ? ORDER BY appointments.scheduled_at DESC", (customer_id,)),
            "reports": rows("SELECT reports.*, doctors.name AS doctor_name FROM sanidad_reports reports LEFT JOIN sanidad_doctors doctors ON doctors.id = reports.doctor_id WHERE reports.customer_id = ? ORDER BY reports.issued_at DESC", (customer_id,)),
            "messages": rows("SELECT * FROM sanidad_messages WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)),
            "notifications": rows("SELECT * FROM sanidad_notifications WHERE customer_id = ? ORDER BY scheduled_for DESC", (customer_id,)),
            "chat_sessions": rows("SELECT * FROM sanidad_chat_sessions WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)),
        }

    @router.get("/backoffice/appointments")
    def backoffice_appointments(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return rows("""
            SELECT appointments.*, customers.name AS customer_name, customers.email AS customer_email,
                   doctors.name AS doctor_name, doctors.specialty
            FROM sanidad_appointments appointments
            JOIN customers ON customers.id = appointments.customer_id
            JOIN sanidad_doctors doctors ON doctors.id = appointments.doctor_id
            ORDER BY appointments.scheduled_at
        """)

    @router.get("/backoffice/documents")
    def backoffice_documents(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        return [document_with_url(item) for item in rows("SELECT documents.*, customers.name AS customer_name, customers.email AS customer_email FROM sanidad_documents documents JOIN customers ON customers.id = documents.customer_id ORDER BY documents.created_at DESC")]

    @router.get("/backoffice/notifications")
    def backoffice_notifications(x_backoffice_token: str | None = Header(default=None)) -> list[dict]:
        require_backoffice(x_backoffice_token)
        with connection() as conn:
            mark_due_notifications(conn)
            items = [dict(row) for row in conn.execute("SELECT notifications.*, customers.name AS customer_name FROM sanidad_notifications notifications JOIN customers ON customers.id = notifications.customer_id ORDER BY scheduled_for").fetchall()]
            conn.commit()
        return items

    @router.post("/backoffice/reports", status_code=201)
    def backoffice_create_report(payload: ReportCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not rows("SELECT id FROM customers WHERE id = ?", (payload.customer_id,)):
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        report = (f"report-{uuid4().hex[:16]}", payload.customer_id, payload.doctor_id, payload.title.strip(), payload.report_type.strip(), payload.content.strip(), normalize_datetime(payload.issued_at))
        with connection() as conn:
            conn.execute("INSERT INTO sanidad_reports (id, customer_id, doctor_id, title, report_type, content, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?)", report)
            conn.execute("INSERT INTO sanidad_messages (id, customer_id, sender_type, subject, body) VALUES (?, ?, 'clinic', ?, ?)", (f"message-{uuid4().hex[:16]}", payload.customer_id, "Nuevo informe disponible", payload.title.strip()))
            conn.commit()
        return dict(zip(("id", "customer_id", "doctor_id", "title", "report_type", "content", "issued_at"), report))

    @router.post("/backoffice/patients/{customer_id}/messages", status_code=201)
    def backoffice_send_message(customer_id: str, payload: MessageCreate, x_backoffice_token: str | None = Header(default=None)) -> dict:
        require_backoffice(x_backoffice_token)
        if not rows("SELECT id FROM customers WHERE id = ?", (customer_id,)):
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        message = (f"message-{uuid4().hex[:16]}", customer_id, "clinic", payload.subject.strip(), payload.body.strip())
        with connection() as conn:
            conn.execute("INSERT INTO sanidad_messages (id, customer_id, sender_type, subject, body) VALUES (?, ?, ?, ?, ?)", message)
            conn.commit()
        return dict(zip(("id", "customer_id", "sender_type", "subject", "body"), message))

    app.include_router(router)
