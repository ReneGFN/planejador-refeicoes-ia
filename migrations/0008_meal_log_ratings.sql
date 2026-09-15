-- Metadado estruturado do diário. NULL é diferente de uma nota mínima.
-- A nota não pertence ao instantâneo alimentar em data_json e expira com o registro.
ALTER TABLE meal_logs ADD COLUMN rating INTEGER
  CHECK(rating IS NULL OR (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5));
