-- Datas técnicas não são inferidas de registros antigos; sem preenchimento retroativo inventado.
ALTER TABLE meal_logs ADD COLUMN created_at TEXT;
ALTER TABLE meal_logs ADD COLUMN updated_at TEXT;
ALTER TABLE meal_logs ADD COLUMN expires_at TEXT;

-- Recibo técnico sem conteúdo alimentar. Excluir refeição não libera a chave para recriá-la.
-- Prazo absoluto da sessão; independente dos recibos de IA de sete dias.
CREATE TABLE meal_log_mutations (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  target_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(visitor_id, action_key)
);
CREATE INDEX meal_log_mutations_expiry ON meal_log_mutations(expires_at);
