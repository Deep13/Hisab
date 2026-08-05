-- ===========================================================================
--  Hisab - schema update for the Notice and Daily Khata features
--  Run once against the `hisabkitab` database (phpMyAdmin -> SQL tab -> Go).
-- ===========================================================================
--
--  SAFE TO RUN ON A LIVE DATABASE, AND SAFE TO RUN TWICE.
--
--  Every statement below only ADDS things:
--    * CREATE TABLE IF NOT EXISTS  - skips a table that already exists
--    * INSERT IGNORE               - skips a seed row that already exists
--    * the index is added only after checking it is not already there
--
--  There is no DROP, no DELETE, no UPDATE and no ALTER of an existing column
--  anywhere in this file. No existing table is touched except `transaction`,
--  and that only gains an index - its rows are not read or changed.
--
--  What gets created:
--    notice, notice_client, notice_setting   - invoice notices
--    daily_khata, khata_opening, client_opening - the day book
--    one index on `transaction` to keep client balances fast
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Notices printed on client invoices
-- ---------------------------------------------------------------------------

-- A notice with no rows in `notice_client` is global and prints on every
-- invoice; otherwise it prints only on the invoices of the listed clients.
CREATE TABLE IF NOT EXISTS `notice` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `notice` text NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `createdOn` date NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Master switch. With `enabled` = 0 no notice prints at all, whatever the
-- individual notices say. Single row, pinned to id 1.
CREATE TABLE IF NOT EXISTS `notice_setting` (
  `id` tinyint(1) NOT NULL DEFAULT 1,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Keeps an existing setting untouched if this file is run again.
INSERT IGNORE INTO `notice_setting` (`id`, `enabled`) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS `notice_client` (
  `notice_id` int(11) NOT NULL,
  `client` varchar(30) NOT NULL,
  PRIMARY KEY (`notice_id`, `client`),
  CONSTRAINT `fk_notice_client_notice` FOREIGN KEY (`notice_id`)
    REFERENCES `notice` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ---------------------------------------------------------------------------
-- 2. Daily Khata (the day book)
-- ---------------------------------------------------------------------------

-- Machine expenses are deliberately NOT stored here. They stay in `service`,
-- the table the Machine Expenses module already uses, and Daily Khata reads
-- them back by `servicedOn`. One expense stays one row, so recording it in
-- either screen shows it in both and it can never be counted twice.
CREATE TABLE IF NOT EXISTS `daily_khata` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entry_date` date NOT NULL,
  -- 'credit' = money in, 'debit' = money out
  `direction` varchar(6) NOT NULL,
  -- credit: client_payment | thaktha_bhara | other
  -- debit : churi | buff_paper | mobil | bhussi | v_belt | other
  `category` varchar(30) NOT NULL,
  -- only set for category 'client_payment'
  `client` varchar(30) DEFAULT NULL,
  `note` varchar(255) NOT NULL DEFAULT '',
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_on` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_khata_date` (`entry_date`),
  KEY `idx_khata_client` (`client`, `entry_date`),
  KEY `idx_khata_cat` (`direction`, `category`, `entry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Cash in hand before the day book started. Single row, pinned to id 1. Every
-- day's balance is derived from this plus the entries since, so the
-- carry-forward is never stored per day. Left empty on purpose: enter it in
-- the app under Daily Khata -> Opening Balances.
CREATE TABLE IF NOT EXISTS `khata_opening` (
  `id` tinyint(1) NOT NULL DEFAULT 1,
  `opening_date` date NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- What each client already owed before their payments started being recorded.
-- `as_of_date` is the cut-off: anything billed before it is treated as already
-- inside `amount`, so nothing is counted twice. A client with no row here
-- simply starts at zero.
CREATE TABLE IF NOT EXISTS `client_opening` (
  `client` varchar(30) NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `as_of_date` date DEFAULT NULL,
  PRIMARY KEY (`client`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ---------------------------------------------------------------------------
-- 3. Index on `transaction` for the client-balance lookups
-- ---------------------------------------------------------------------------
--
-- Adding an index does not change any row; it only speeds up the per-client,
-- per-month sums. `transaction`.`client` is a TEXT column, so the index needs
-- a prefix length. Plain CREATE INDEX would fail if the index already exists,
-- so this checks first and does nothing when it is already present.

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'transaction'
    AND index_name = 'idx_transaction_client_period'
);

SET @stmt := IF(@idx_exists = 0,
  'ALTER TABLE `transaction` ADD INDEX `idx_transaction_client_period` (`client`(50), `year`, `month`)',
  'DO 0'
);

PREPARE hisab_stmt FROM @stmt;
EXECUTE hisab_stmt;
DEALLOCATE PREPARE hisab_stmt;


-- ---------------------------------------------------------------------------
-- Done. Verify with:
--   SHOW TABLES LIKE 'notice%';
--   SHOW TABLES LIKE '%khata%';
--   SHOW TABLES LIKE 'client_opening';
--   SHOW INDEX FROM `transaction` WHERE Key_name = 'idx_transaction_client_period';
-- ---------------------------------------------------------------------------
