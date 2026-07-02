-- ============================================================================
-- 2026-07-02  Correct June-2026 Softening & Milling totals + centralize rates
-- ----------------------------------------------------------------------------
-- Correct pricing (current rates):
--   Milling   : total = 90 * quantity
--   Softening : total = 400                       when quantity <= 3  (flat base)
--               total = 400 + 100 * (quantity-3)  when quantity  > 3
--
-- Scope is intentionally limited to June 2026. Older years legitimately used
-- different rates (Softening @90, Milling @80) and MUST NOT be blanket-fixed.
-- ============================================================================

-- 1) Backup the rows that will change --------------------------------------
DROP TABLE IF EXISTS transaction_bak_20260702;
CREATE TABLE transaction_bak_20260702 AS
SELECT * FROM transaction
WHERE year=2026 AND month=6 AND machineType IN ('Softening','Milling')
  AND ( (machineType='Milling'   AND total <> 90*quantity)
     OR (machineType='Softening' AND total <> IF(quantity<=3,400,400+100*(quantity-3))) );

-- 2) Correct Milling (normalize rate to 90) --------------------------------
UPDATE transaction
SET rate = 90, total = 90 * quantity
WHERE year=2026 AND month=6 AND machineType='Milling'
  AND total <> 90*quantity;

-- 3) Correct Softening (normalize rate to 100) -----------------------------
UPDATE transaction
SET rate = 100, total = IF(quantity<=3, 400, 400 + 100*(quantity-3))
WHERE year=2026 AND month=6 AND machineType='Softening'
  AND total <> IF(quantity<=3, 400, 400 + 100*(quantity-3));

-- 4) Verify (both must return 0) -------------------------------------------
-- SELECT COUNT(*) FROM transaction WHERE year=2026 AND month=6 AND machineType='Milling'   AND total <> 90*quantity;
-- SELECT COUNT(*) FROM transaction WHERE year=2026 AND month=6 AND machineType='Softening' AND total <> IF(quantity<=3,400,400+100*(quantity-3));

-- 5) Central rate configuration (single source of truth) -------------------
--    total = base                          when quantity <= free_qty
--    total = base + rate*(quantity-free_qty) otherwise
CREATE TABLE IF NOT EXISTS rate_config (
  machineType VARCHAR(50) NOT NULL PRIMARY KEY,
  rate     FLOAT NOT NULL DEFAULT 0,
  base     FLOAT NOT NULL DEFAULT 0,
  free_qty FLOAT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO rate_config (machineType, rate, base, free_qty) VALUES
  ('Softening', 100, 400, 3),
  ('Milling',    90,   0, 0)
ON DUPLICATE KEY UPDATE rate=VALUES(rate), base=VALUES(base), free_qty=VALUES(free_qty);
