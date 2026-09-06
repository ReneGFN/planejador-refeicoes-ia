PRAGMA foreign_keys = ON;

-- Apenas estrutura. Não há receitas preparadas ou dados pessoais neste arquivo.
CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE preferences (
  visitor_id TEXT PRIMARY KEY REFERENCES visitors(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX plans_visitor_created ON plans(visitor_id, created_at);

-- Confirmar consumo é diferente de gerar um plano.
CREATE TABLE meal_logs (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  eaten_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE INDEX meal_logs_visitor_date ON meal_logs(visitor_id, eaten_at);

-- Contadores técnicos com expiração; nunca guardar IP puro.
CREATE TABLE usage_buckets (
  scope TEXT NOT NULL CHECK(scope IN ('visitor', 'network', 'global')),
  bucket_key TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0 CHECK(requests >= 0),
  reserved_tokens INTEGER NOT NULL DEFAULT 0 CHECK(reserved_tokens >= 0),
  expires_at TEXT NOT NULL,
  PRIMARY KEY(scope, bucket_key, day_utc)
);
