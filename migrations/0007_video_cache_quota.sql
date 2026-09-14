-- Conteúdo global: nenhuma identidade, plano ou recibo de uso nesta tabela.
CREATE TABLE video_cache (
  title_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('found', 'not_found')),
  video_id TEXT, video_title TEXT, channel_id TEXT, channel_title TEXT,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > fetched_at AND expires_at <= fetched_at + 86400000),
  CHECK((status = 'found' AND video_id IS NOT NULL AND video_title IS NOT NULL
    AND channel_id IS NOT NULL AND channel_title IS NOT NULL)
    OR (status = 'not_found' AND video_id IS NULL AND video_title IS NULL
    AND channel_id IS NULL AND channel_title IS NULL))
);
CREATE INDEX video_cache_expiry ON video_cache(expires_at);

-- Coordenação temporária separada do conteúdo e dos contadores.
CREATE TABLE video_claims (
  title_key TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > started_at)
);
CREATE INDEX video_claims_expiry ON video_claims(expires_at);
CREATE TABLE video_project_blocks (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  expires_at INTEGER NOT NULL
);
CREATE TABLE video_usage_buckets (
  scope TEXT NOT NULL CHECK(scope IN ('visitor', 'network', 'global')),
  subject TEXT NOT NULL,
  window TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK(requests >= 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(scope, subject, window)
);
CREATE INDEX video_usage_expiry ON video_usage_buckets(expires_at);
-- Recibo técnico sem título alimentar; expira com a sessão autenticada.
CREATE TABLE video_usage_reservations (
  id TEXT PRIMARY KEY,
  buckets_json TEXT NOT NULL CHECK(json_valid(buckets_json)
    AND json_type(buckets_json) = 'array' AND json_array_length(buckets_json) = 6),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved', 'succeeded', 'failed')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX video_reservations_expiry ON video_usage_reservations(expires_at);

-- Cache, repetição, bloqueio e disputa são rechecados dentro do batch atômico.
CREATE TRIGGER video_claim_check BEFORE INSERT ON video_claims
BEGIN
  SELECT RAISE(ABORT, 'RF_VIDEO_REPLAY') WHERE EXISTS
    (SELECT 1 FROM video_usage_reservations WHERE id = NEW.attempt_id);
  SELECT RAISE(ABORT, 'RF_VIDEO_CACHED') WHERE EXISTS
    (SELECT 1 FROM video_cache WHERE title_key = NEW.title_key AND expires_at > NEW.started_at);
  SELECT RAISE(ABORT, 'RF_VIDEO_BLOCKED') WHERE EXISTS
    (SELECT 1 FROM video_project_blocks WHERE id = 1 AND expires_at > NEW.started_at);
  SELECT RAISE(ABORT, 'RF_VIDEO_BUSY') WHERE EXISTS
    (SELECT 1 FROM video_claims WHERE title_key = NEW.title_key AND expires_at > NEW.started_at);
END;
CREATE TRIGGER video_reservation_check BEFORE INSERT ON video_usage_reservations
BEGIN
  SELECT RAISE(ABORT, 'RF_VIDEO_REPLAY') WHERE EXISTS
    (SELECT 1 FROM video_usage_reservations WHERE id = NEW.id);
  SELECT RAISE(ABORT, 'RF_VIDEO_LIMIT') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.buckets_json) candidate
    LEFT JOIN video_usage_buckets used
      ON used.scope = json_extract(candidate.value, '$.scope')
      AND used.subject = json_extract(candidate.value, '$.subject')
      AND used.window = json_extract(candidate.value, '$.window')
    WHERE COALESCE(used.requests, 0) + 1 > json_extract(candidate.value, '$.limit')
  );
END;
CREATE TRIGGER video_reservation_increment AFTER INSERT ON video_usage_reservations
BEGIN
  INSERT INTO video_usage_buckets(scope, subject, window, requests, expires_at)
    SELECT json_extract(value, '$.scope'), json_extract(value, '$.subject'),
      json_extract(value, '$.window'), 1, json_extract(value, '$.expiresAt')
      FROM json_each(NEW.buckets_json) WHERE true
    ON CONFLICT(scope, subject, window) DO UPDATE SET requests = requests + 1;
END;
