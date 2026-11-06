CREATE TABLE IF NOT EXISTS sanidad_doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sanidad_patient_profiles (
    customer_id TEXT PRIMARY KEY,
    birth_date TEXT,
    allergies TEXT,
    conditions TEXT,
    medications TEXT,
    emergency_contact TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sanidad_documents (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sanidad_appointments (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    modality TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    scheduled_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(doctor_id) REFERENCES sanidad_doctors(id)
);

CREATE TABLE IF NOT EXISTS sanidad_reports (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    doctor_id TEXT,
    title TEXT NOT NULL,
    report_type TEXT NOT NULL,
    content TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(doctor_id) REFERENCES sanidad_doctors(id)
);

CREATE TABLE IF NOT EXISTS sanidad_messages (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sanidad_notifications (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    appointment_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(appointment_id) REFERENCES sanidad_appointments(id)
);

CREATE TABLE IF NOT EXISTS sanidad_chat_sessions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sanidad_chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sanidad_chat_sessions(id)
);

CREATE TABLE IF NOT EXISTS sanidad_audit_events (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
