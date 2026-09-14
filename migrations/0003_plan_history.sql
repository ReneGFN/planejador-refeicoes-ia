-- O plano pertence ao visitante, não ao recibo técnico que expira em sete dias.
-- Linhas antigas sem chave não são candidatas a replay; nenhuma chave é inventada.
ALTER TABLE plans ADD COLUMN generation_key TEXT;
ALTER TABLE plans ADD COLUMN expires_at TEXT;
CREATE UNIQUE INDEX plans_visitor_generation ON plans(visitor_id, generation_key);
CREATE INDEX plans_visitor_expiry ON plans(visitor_id, expires_at);
