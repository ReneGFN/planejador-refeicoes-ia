-- Recibos técnicos de reserva: não guardam pedidos, fotos, cookies ou IP puro.
CREATE TABLE usage_reservations (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK(operation IN ('ingress', 'session', 'generation', 'vision')),
  buckets_json TEXT NOT NULL CHECK(json_valid(buckets_json) AND json_type(buckets_json) = 'array'),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved', 'succeeded', 'failed')),
  expires_at TEXT NOT NULL
);
CREATE INDEX reservations_expiry ON usage_reservations(expires_at);
CREATE INDEX usage_expiry ON usage_buckets(expires_at);

-- Verificação e incremento pertencem à MESMA instrução/transação SQLite.
CREATE TRIGGER reserve_usage_check BEFORE INSERT ON usage_reservations
BEGIN
  SELECT RAISE(ABORT, 'RF_DUPLICATE_REQUEST')
    WHERE EXISTS (SELECT 1 FROM usage_reservations WHERE id = NEW.id);
  SELECT RAISE(ABORT, 'RF_QUOTA_EXCEEDED') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.buckets_json) AS candidate
    LEFT JOIN usage_buckets AS used
      ON used.scope = json_extract(candidate.value, '$.scope')
      AND used.bucket_key = json_extract(candidate.value, '$.key')
      AND used.day_utc = json_extract(candidate.value, '$.window')
    WHERE COALESCE(used.requests, 0) + 1 > json_extract(candidate.value, '$.requestsLimit')
      OR COALESCE(used.reserved_tokens, 0) + json_extract(candidate.value, '$.tokens')
         > json_extract(candidate.value, '$.tokensLimit')
  );
END;

CREATE TRIGGER reserve_usage_increment AFTER INSERT ON usage_reservations
BEGIN
  INSERT INTO usage_buckets (scope, bucket_key, day_utc, requests, reserved_tokens, expires_at)
    SELECT json_extract(value, '$.scope'), json_extract(value, '$.key'),
      json_extract(value, '$.window'), 1, json_extract(value, '$.tokens'),
      json_extract(value, '$.expiresAt') FROM json_each(NEW.buckets_json) WHERE true
    ON CONFLICT(scope, bucket_key, day_utc) DO UPDATE SET
      requests = requests + 1,
      reserved_tokens = reserved_tokens + excluded.reserved_tokens;
END;
