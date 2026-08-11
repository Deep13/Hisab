-- ===========================================================================
--  Hisab - structure update for Expenses > Electricity
--  Run against the `hisabkitab` database (phpMyAdmin -> SQL tab -> Go).
-- ===========================================================================
--
--  SAFE TO RUN ON A LIVE DATABASE, AND SAFE TO RUN TWICE.
--
--  Structure only. There is no DROP, no DELETE, no UPDATE and no TRUNCATE in
--  this file, so not a single existing row is read, changed or removed.
--
--  It handles both cases on its own:
--    * tables missing entirely      -> creates them
--    * tables created by an earlier
--      version without `nickname`   -> adds just that column
--
--  Adding a column with a DEFAULT does not rewrite existing values: rows that
--  already exist simply get an empty nickname, which you can fill in later
--  from Expenses > Electricity > Meters > Edit.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Meters (one row per connection)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `electricity_meter` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_id` varchar(40) NOT NULL,
  `meter_number` varchar(40) NOT NULL,
  `consumer_name` varchar(100) NOT NULL,
  `nickname` varchar(60) NOT NULL DEFAULT '',
  -- 'Factory' or 'Chowbaga'
  `cc` varchar(30) NOT NULL DEFAULT '',
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_on` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_electricity_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ---------------------------------------------------------------------------
-- 2. Add `nickname` if the table already existed without it
-- ---------------------------------------------------------------------------
--
-- A plain ALTER would fail with "duplicate column" when the column is already
-- there, aborting the rest of the script, so this checks first.

SET @has_nickname := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'electricity_meter'
    AND column_name = 'nickname'
);

SET @stmt := IF(@has_nickname = 0,
  'ALTER TABLE `electricity_meter` ADD COLUMN `nickname` varchar(60) NOT NULL DEFAULT '''' AFTER `consumer_name`',
  'DO 0'
);

PREPARE hisab_stmt FROM @stmt;
EXECUTE hisab_stmt;
DEALLOCATE PREPARE hisab_stmt;


-- ---------------------------------------------------------------------------
-- 3. Monthly bills (one bill per meter per month)
-- ---------------------------------------------------------------------------
--
-- The unique key on (meter_id, year, month) is what makes re-saving the same
-- period replace the bill instead of adding a duplicate. The month's total
-- feeds the Electric Bill line when the P&L for that month is generated.

CREATE TABLE IF NOT EXISTS `electricity_bill` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `meter_id` int(11) NOT NULL,
  `month` int(2) NOT NULL,
  `year` int(4) NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_on` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bill_meter_period` (`meter_id`, `year`, `month`),
  KEY `idx_bill_period` (`year`, `month`),
  CONSTRAINT `fk_bill_meter` FOREIGN KEY (`meter_id`)
    REFERENCES `electricity_meter` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ---------------------------------------------------------------------------
-- OPTIONAL - not run by default
-- ---------------------------------------------------------------------------
--
-- If an earlier version created `electricity_bill` with `units` and `note`,
-- those columns are now unused. The app never reads or writes them, so they
-- are harmless and are left in place. Only if you want them gone, run these
-- two lines by hand. This DOES destroy whatever is in those two columns:
--
--   ALTER TABLE `electricity_bill` DROP COLUMN `units`;
--   ALTER TABLE `electricity_bill` DROP COLUMN `note`;


-- ---------------------------------------------------------------------------
-- Done. Verify with:
--   SHOW COLUMNS FROM `electricity_meter`;
--   SHOW COLUMNS FROM `electricity_bill`;
--   SELECT COUNT(*) FROM `electricity_meter`;
-- ---------------------------------------------------------------------------
