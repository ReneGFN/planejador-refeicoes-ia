-- Validade informada pela pessoa; não confundir com prazo de acesso da sessão.
CREATE TABLE pantry_items (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity REAL CHECK(quantity IS NULL OR (quantity >= 0 AND quantity <= 100000)),
  unit TEXT,
  added_at TEXT NOT NULL,
  expires_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  UNIQUE(visitor_id, normalized_name)
);
CREATE INDEX pantry_items_visitor_expiry ON pantry_items(visitor_id, expires_at);

-- Sem conteúdo alimentar e sem FK para o produto: excluir item/diário não libera nova baixa.
CREATE TABLE pantry_mutations (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete', 'deduct')),
  target_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  applied_count INTEGER NOT NULL CHECK(applied_count >= 1),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(visitor_id, action_key)
);
CREATE UNIQUE INDEX pantry_one_deduction_per_meal ON pantry_mutations(visitor_id, target_id) WHERE operation = 'deduct';
CREATE INDEX pantry_mutations_expiry ON pantry_mutations(expires_at);
