CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  network text NOT NULL,
  network_passphrase_hash text NOT NULL,
  filters jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('STARTING', 'ACTIVE', 'PAUSED', 'GAP_DETECTED', 'ERROR')),
  last_cursor text,
  last_ingested_ledger bigint,
  last_seen_latest_ledger bigint,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  network_passphrase_hash text NOT NULL,
  stellar_event_id text NOT NULL,
  ledger_sequence bigint NOT NULL,
  ledger_closed_at timestamptz,
  contract_id text,
  event_type text NOT NULL,
  topic_raw jsonb NOT NULL,
  value_raw text NOT NULL,
  normalized jsonb,
  transaction_hash text,
  paging_token text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_passphrase_hash, stellar_event_id)
);

CREATE INDEX IF NOT EXISTS events_ledger_sequence_idx ON events (ledger_sequence);

CREATE TABLE IF NOT EXISTS subscription_events (
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, event_id)
);

CREATE TABLE IF NOT EXISTS destinations (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret_env text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('PENDING', 'IN_FLIGHT', 'DELIVERED', 'RETRY_WAIT', 'DEAD')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  last_status_code integer,
  last_error_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (destination_id, event_id)
);

CREATE INDEX IF NOT EXISTS deliveries_work_idx ON deliveries (state, next_attempt_at);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id uuid PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  status_code integer,
  error_class text,
  latency_ms integer NOT NULL,
  UNIQUE (delivery_id, attempt_number)
);

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
