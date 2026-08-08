import type { Db } from './db'

// A tiny forward-only migration runner: an ordered array of {name, sql}. Each runs once,
// recorded in _broker_migrations. No ORM (spec §1.2). Idempotent — safe to call on every boot.

type Migration = { name: string, sql: string }

const MIGRATIONS: Migration[] = [
    {
        name: '001_license_tables',
        sql: `
            CREATE TABLE IF NOT EXISTS license_key (
                id text PRIMARY KEY,
                key_hash text NOT NULL UNIQUE,
                key_prefix text NOT NULL,
                status text NOT NULL,
                key_type text NOT NULL,
                email text NOT NULL,
                company_name text,
                goal text,
                issued_at timestamptz NOT NULL,
                first_activated_at timestamptz,
                expires_at timestamptz,
                grace_days integer NOT NULL DEFAULT 3,
                entitlements jsonb NOT NULL,
                numeric_limits jsonb,
                notes text,
                created_by text,
                created timestamptz NOT NULL DEFAULT now(),
                updated timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_license_key_email ON license_key (email);
            CREATE INDEX IF NOT EXISTS idx_license_key_status ON license_key (status);
            CREATE INDEX IF NOT EXISTS idx_license_key_expires_at ON license_key (expires_at);

            CREATE TABLE IF NOT EXISTS license_activation (
                id text PRIMARY KEY,
                license_key_id text NOT NULL REFERENCES license_key(id) ON DELETE CASCADE,
                platform_id text NOT NULL,
                instance_hint text,
                product_version text,
                first_seen timestamptz NOT NULL DEFAULT now(),
                last_seen timestamptz NOT NULL DEFAULT now(),
                UNIQUE (license_key_id, platform_id)
            );
            CREATE INDEX IF NOT EXISTS idx_license_activation_key ON license_activation (license_key_id);

            CREATE TABLE IF NOT EXISTS license_event (
                id text PRIMARY KEY,
                license_key_id text NOT NULL,
                event_type text NOT NULL,
                actor text NOT NULL,
                detail jsonb,
                created timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_license_event_key_created ON license_event (license_key_id, created);

            CREATE TABLE IF NOT EXISTS trial_request (
                id text PRIMARY KEY,
                email text NOT NULL,
                company_name text,
                goal text,
                requested_entitlements jsonb,
                status text NOT NULL,
                license_key_id text,
                created timestamptz NOT NULL DEFAULT now(),
                updated timestamptz NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_trial_request_pending_email
                ON trial_request (email) WHERE status = 'PENDING';
        `,
    },
]

export async function runMigrations(db: Db): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS _broker_migrations (
            name text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        );
    `)
    const applied = await db.query<{ name: string }>('SELECT name FROM _broker_migrations')
    const appliedNames = new Set(applied.rows.map((r) => r.name))
    for (const migration of MIGRATIONS) {
        if (appliedNames.has(migration.name)) {
            continue
        }
        await db.query(migration.sql)
        await db.query('INSERT INTO _broker_migrations (name) VALUES ($1)', [migration.name])
    }
}
