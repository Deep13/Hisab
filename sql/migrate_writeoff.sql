-- Client write-off / less
--
-- Records money a client was let off: the account is settled, but no cash
-- changed hands. Stored as its own direction rather than another credit
-- category, because the cash figures in process.php are worked out by
-- comparing `direction` to the literal string 'credit'. Keeping write-offs
-- outside that value means they can never quietly inflate the cash book.
--
-- Run this once on the OFFICE DESKTOP. The laptop picks the change up through
-- the normal database sync, since the export carries the schema with it.
--
--   "C:\xampp\mysql\bin\mysql.exe" -u root hisabkitab < sql\migrate_writeoff.sql
--
-- Safe to run twice: each step is skipped if it has already been applied.

-- 'writeoff' is 8 characters and the column only held 6.
ALTER TABLE `daily_khata` MODIFY `direction` VARCHAR(10) NOT NULL;

-- Ties a write-off row to the payment it was entered with, so editing or
-- deleting the payment carries its write-off along. Matching on client and
-- date instead would break the moment one client pays twice in a day.
SET @col := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'daily_khata'
      AND COLUMN_NAME = 'parent_id'
);
SET @sql := IF(@col = 0,
    'ALTER TABLE `daily_khata` ADD COLUMN `parent_id` INT NULL DEFAULT NULL AFTER `id`',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'daily_khata'
      AND INDEX_NAME = 'idx_khata_parent'
);
SET @sql := IF(@idx = 0,
    'ALTER TABLE `daily_khata` ADD KEY `idx_khata_parent` (`parent_id`)',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
