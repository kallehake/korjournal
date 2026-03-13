-- Energiförbrukning per resa (BYD SOC-baserad)
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS soc_start_pct  INTEGER,   -- Laddnivå vid resstart (0-100)
  ADD COLUMN IF NOT EXISTS soc_end_pct    INTEGER,   -- Laddnivå vid resslut  (0-100)
  ADD COLUMN IF NOT EXISTS energy_kwh     NUMERIC(6,2); -- Förbrukad energi (kWh), beräknad av pollern
