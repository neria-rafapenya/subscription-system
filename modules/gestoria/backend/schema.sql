CREATE TABLE IF NOT EXISTS gestoria_advisors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gestoria_client_profiles (
    customer_id TEXT PRIMARY KEY,
    company_name TEXT,
    tax_regime TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS gestoria_documents (
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

CREATE TABLE IF NOT EXISTS gestoria_appointments (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    advisor_id TEXT NOT NULL,
    modality TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    scheduled_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(advisor_id) REFERENCES gestoria_advisors(id)
);

CREATE TABLE IF NOT EXISTS gestoria_messages (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'normal',
    reply_to_id TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS gestoria_notifications (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    appointment_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    read_at TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(appointment_id) REFERENCES gestoria_appointments(id)
);

CREATE TABLE IF NOT EXISTS gestoria_chat_sessions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS gestoria_chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES gestoria_chat_sessions(id)
);

CREATE TABLE IF NOT EXISTS gestoria_audit_events (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gestoria_procedures (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    procedure_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    progress INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    erp_external_id TEXT,
    erp_sync_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS gestoria_labor_requests (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    status TEXT NOT NULL DEFAULT 'submitted',
    erp_external_id TEXT,
    erp_sync_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS gestoria_erp_links (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    external_id TEXT,
    provider TEXT NOT NULL,
    sync_status TEXT NOT NULL,
    last_synced_at TEXT,
    last_error TEXT,
    PRIMARY KEY(entity_type, entity_id)
);
