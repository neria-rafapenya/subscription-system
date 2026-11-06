import sqlite3
import calendar
from datetime import datetime, timezone
from typing import Any

from .config import get_settings
from .security import hash_password
from .vertical_module import seed_plans, seed_services


SCHEMA = """
CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    minimum_tier TEXT NOT NULL DEFAULT 'basic',
    image_key TEXT,
    image_filename TEXT,
    attachment_key TEXT,
    attachment_filename TEXT,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    interval TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'basic',
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    cognito_sub TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT,
    billing_address TEXT,
    tax_id TEXT,
    policies_accepted_at TEXT,
    policies_version TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_recovery_tokens (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'none',
    provider_subscription_id TEXT,
    amount_cents INTEGER,
    currency TEXT,
    interval TEXT,
    auto_renew INTEGER NOT NULL DEFAULT 1,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    current_period_start TEXT,
    current_period_end TEXT,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_checkout_id TEXT,
    approval_url TEXT,
    subscription_id TEXT,
    amount_cents INTEGER,
    currency TEXT,
    interval TEXT,
    billing_address TEXT,
    tax_id TEXT,
    policies_accepted_at TEXT,
    policies_version TEXT,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    subscription_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def connection() -> sqlite3.Connection:
    settings = get_settings()
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    ensure_legacy_columns(conn)
    seed(conn)
    if settings.app_env.value == "development":
        conn.execute(
            "UPDATE subscriptions SET status = 'active' WHERE status = 'pending' AND provider = 'local'"
        )
        conn.commit()
        process_due_local_subscriptions(conn)
    repair_duplicate_open_subscriptions(conn)
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_one_open_subscription_per_customer
        ON subscriptions(customer_id)
        WHERE status IN ('pending', 'active', 'grace_period', 'suspended')
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_email_lower
        ON customers(lower(email))
        """
    )
    conn.commit()
    return conn


def ensure_legacy_columns(conn: sqlite3.Connection) -> None:
    """Add snapshot columns when opening a database created by an earlier demo version."""
    for table, column, definition in (
        ("subscriptions", "amount_cents", "INTEGER"),
        ("subscriptions", "currency", "TEXT"),
        ("subscriptions", "interval", "TEXT"),
        ("subscriptions", "auto_renew", "INTEGER NOT NULL DEFAULT 1"),
        ("subscriptions", "cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0"),
        ("subscriptions", "current_period_start", "TEXT"),
        ("subscriptions", "current_period_end", "TEXT"),
        ("customers", "password_hash", "TEXT"),
        ("customers", "billing_address", "TEXT"),
        ("customers", "tax_id", "TEXT"),
        ("customers", "policies_accepted_at", "TEXT"),
        ("customers", "policies_version", "TEXT"),
        ("customers", "created_at", "TEXT"),
        ("services", "minimum_tier", "TEXT NOT NULL DEFAULT 'basic'"),
        ("services", "image_key", "TEXT"),
        ("services", "image_filename", "TEXT"),
        ("services", "attachment_key", "TEXT"),
        ("services", "attachment_filename", "TEXT"),
        ("plans", "tier", "TEXT NOT NULL DEFAULT 'basic'"),
        ("checkout_sessions", "amount_cents", "INTEGER"),
        ("checkout_sessions", "currency", "TEXT"),
        ("checkout_sessions", "interval", "TEXT"),
        ("checkout_sessions", "billing_address", "TEXT"),
        ("checkout_sessions", "tax_id", "TEXT"),
        ("checkout_sessions", "policies_accepted_at", "TEXT"),
        ("checkout_sessions", "policies_version", "TEXT"),
        ("notifications", "subscription_id", "TEXT"),
    ):
        existing = conn.execute(f"PRAGMA table_info({table})").fetchall()
        if column not in {row[1] for row in existing}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    conn.execute(
        """
        UPDATE subscriptions
        SET amount_cents = (SELECT amount_cents FROM plans WHERE plans.id = subscriptions.plan_id),
            currency = (SELECT currency FROM plans WHERE plans.id = subscriptions.plan_id),
            interval = (SELECT interval FROM plans WHERE plans.id = subscriptions.plan_id)
        WHERE amount_cents IS NULL
        """
    )
    conn.execute(
        """
        UPDATE subscriptions
        SET current_period_start = COALESCE(current_period_start, CURRENT_TIMESTAMP),
            current_period_end = COALESCE(current_period_end, datetime('now', '+1 month'))
        WHERE current_period_end IS NULL
        """
    )
    conn.execute(
        """
        UPDATE checkout_sessions
        SET amount_cents = (SELECT amount_cents FROM plans WHERE plans.id = checkout_sessions.plan_id),
            currency = (SELECT currency FROM plans WHERE plans.id = checkout_sessions.plan_id),
            interval = (SELECT interval FROM plans WHERE plans.id = checkout_sessions.plan_id)
        WHERE amount_cents IS NULL
        """
    )
    conn.execute("UPDATE services SET minimum_tier = 'basic' WHERE minimum_tier IS NULL OR minimum_tier = ''")
    conn.execute("UPDATE plans SET tier = CASE WHEN id = 'plan-pro' THEN 'premium' ELSE 'basic' END WHERE tier IS NULL OR tier = ''")
    conn.execute("UPDATE customers SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''")
    seeded_tiers = conn.execute(
        "SELECT value FROM app_metadata WHERE key = 'service-tier-seed-v1'"
    ).fetchone()
    if not seeded_tiers:
        conn.execute("UPDATE services SET minimum_tier = 'premium' WHERE id = 'service-emergency' AND minimum_tier = 'basic'")
        conn.execute("UPDATE plans SET tier = 'premium' WHERE id = 'plan-pro' AND tier = 'basic'")
        conn.execute(
            "INSERT INTO app_metadata (key, value) VALUES ('service-tier-seed-v1', 'applied')"
        )


def seed(conn: sqlite3.Connection) -> None:
    deleted_seed_services = {
        row[0]
        for row in conn.execute(
            "SELECT key FROM app_metadata WHERE key LIKE 'deleted-service:%'"
        ).fetchall()
    }
    services = [service for service in seed_services() if f"deleted-service:{service[0]}" not in deleted_seed_services]
    conn.executemany(
        """
        INSERT INTO services (id, name, description, minimum_tier, active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            minimum_tier = excluded.minimum_tier,
            active = 1
        """,
        services,
    )
    current_service_ids = {service[0] for service in services}
    stale_ids = [
        row[0] for row in conn.execute("SELECT id FROM services WHERE active = 1").fetchall()
        if row[0] not in current_service_ids
    ]
    if stale_ids:
        conn.executemany("UPDATE services SET active = 0 WHERE id = ?", [(service_id,) for service_id in stale_ids])
    plans = seed_plans()
    conn.executemany(
        """
        INSERT INTO plans (id, name, description, amount_cents, currency, interval, tier, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            amount_cents = excluded.amount_cents,
            currency = excluded.currency,
            interval = excluded.interval,
            tier = excluded.tier,
            active = 1
        """,
        plans,
    )
    current_plan_ids = {plan[0] for plan in plans}
    stale_plan_ids = [
        row[0] for row in conn.execute("SELECT id FROM plans WHERE active = 1").fetchall()
        if row[0] not in current_plan_ids
    ]
    if stale_plan_ids:
        conn.executemany("UPDATE plans SET active = 0 WHERE id = ?", [(plan_id,) for plan_id in stale_plan_ids])
    conn.execute(
        "INSERT OR IGNORE INTO customers (id, cognito_sub, name, email) VALUES (?, ?, ?, ?)",
        ("customer-local", "local-user", "Usuario local", "demo@example.test"),
    )
    conn.execute(
        "UPDATE customers SET email = 'demo@example.test' WHERE id = 'customer-local' AND email = 'local@example.test'"
    )
    conn.execute(
        "UPDATE customers SET password_hash = ? WHERE id = 'customer-local' AND password_hash IS NULL",
        (hash_password("demo"),),
    )
    conn.commit()


def rows(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def add_subscription_period(value: str, interval: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if interval == "year":
        year = parsed.year + 1
        day = min(parsed.day, calendar.monthrange(year, parsed.month)[1])
        next_value = parsed.replace(year=year, day=day)
    else:
        month = parsed.month + 1
        year = parsed.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        day = min(parsed.day, calendar.monthrange(year, month)[1])
        next_value = parsed.replace(year=year, month=month, day=day)
    return next_value.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def process_due_local_subscriptions(conn: sqlite3.Connection) -> None:
    """Simulate local renewals; real environments will use provider webhooks."""
    now = datetime.now(timezone.utc)
    due = conn.execute(
        """
        SELECT id, customer_id, plan_id, amount_cents, currency, interval,
               auto_renew, cancel_at_period_end, current_period_end
        FROM subscriptions
        WHERE status = 'active' AND current_period_end IS NOT NULL
        """
    ).fetchall()
    for subscription in due:
        period_end = datetime.fromisoformat(subscription["current_period_end"].replace("Z", "+00:00"))
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)
        if period_end > now:
            continue

        if not subscription["auto_renew"] or subscription["cancel_at_period_end"]:
            conn.execute(
                "UPDATE subscriptions SET status = 'expired', auto_renew = 0 WHERE id = ?",
                (subscription["id"],),
            )
            continue

        plan = conn.execute(
            "SELECT amount_cents FROM plans WHERE id = ?",
            (subscription["plan_id"],),
        ).fetchone()
        if not plan or plan["amount_cents"] != subscription["amount_cents"]:
            conn.execute(
                "UPDATE subscriptions SET auto_renew = 0, cancel_at_period_end = 1 WHERE id = ?",
                (subscription["id"],),
            )
            continue

        next_end = add_subscription_period(subscription["current_period_end"], subscription["interval"])
        conn.execute(
            "UPDATE subscriptions SET current_period_start = ?, current_period_end = ?, auto_renew = 1 WHERE id = ?",
            (subscription["current_period_end"], next_end, subscription["id"]),
        )


def repair_duplicate_open_subscriptions(conn: sqlite3.Connection) -> None:
    """Keep one current subscription per customer and preserve duplicates as cancelled history."""
    duplicate_customers = conn.execute(
        """
        SELECT customer_id
        FROM subscriptions
        WHERE status IN ('pending', 'active', 'grace_period', 'suspended')
        GROUP BY customer_id
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for duplicate in duplicate_customers:
        customer_id = duplicate["customer_id"]
        keep = conn.execute(
            """
            SELECT id
            FROM subscriptions
            WHERE customer_id = ?
              AND status IN ('pending', 'active', 'grace_period', 'suspended')
            ORDER BY CASE status
                WHEN 'active' THEN 0
                WHEN 'grace_period' THEN 1
                WHEN 'suspended' THEN 2
                ELSE 3
            END, rowid
            LIMIT 1
            """,
            (customer_id,),
        ).fetchone()
        if keep:
            conn.execute(
                """
                UPDATE subscriptions
                SET status = 'cancelled'
                WHERE customer_id = ?
                  AND status IN ('pending', 'active', 'grace_period', 'suspended')
                  AND id != ?
                """,
                (customer_id, keep["id"]),
            )
