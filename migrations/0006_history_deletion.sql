-- Versão técnica: uma gravação antiga não pode repor dados após exclusão confirmada.
ALTER TABLE visitors ADD COLUMN history_revision INTEGER NOT NULL DEFAULT 0
  CHECK(history_revision >= 0 AND history_revision <= 9007199254740991);

-- Sem conteúdo alimentar. Reenvio da exclusão não apaga dados cadastrados depois dela.
CREATE TABLE history_deletions (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(visitor_id, action_key)
);
CREATE INDEX history_deletions_expiry ON history_deletions(expires_at);
