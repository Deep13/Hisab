-- Payments made to a labour
--
-- Recorded in the day book as a debit, against the labour they were paid to,
-- and carried onto a Labour line in the monthly Profit & Loss.
--
-- `daily_khata`.`client` is deliberately not reused for this. Both columns are
-- names, but every client query is guarded only by category, so one stray
-- query joining that column to the client master would quietly pick labour up.
-- A column of its own cannot be mistaken.
--
-- Run this once on the OFFICE DESKTOP. The laptop picks the change up through
-- the normal database sync, since the export carries the schema with it.
--
--   "C:\xampp\mysql\bin\mysql.exe" -u root hisabkitab < sql\migrate_labour_payment.sql
--
-- Safe to run twice: each step is skipped if it has already been applied.

SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'daily_khata'
      AND COLUMN_NAME = 'labour'
);
SET @sql := IF(@col = 0,
    'ALTER TABLE `daily_khata` ADD COLUMN `labour` VARCHAR(30) DEFAULT NULL AFTER `client`',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'daily_khata'
      AND INDEX_NAME = 'idx_khata_labour'
);
SET @sql := IF(@idx = 0,
    'ALTER TABLE `daily_khata` ADD KEY `idx_khata_labour` (`labour`, `entry_date`)',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The Profit & Loss line these payments total onto.
SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'profit_loss'
      AND COLUMN_NAME = 'labour'
);
SET @sql := IF(@col = 0,
    'ALTER TABLE `profit_loss` ADD COLUMN `labour` DECIMAL(12,2) DEFAULT 0.00 AFTER `munshi`',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
