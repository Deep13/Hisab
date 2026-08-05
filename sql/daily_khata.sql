-- Daily Khata: the day-by-day cash book.
--
-- Machine expenses are deliberately NOT stored here. They live in `service`,
-- the same table the Machine Expenses module reads, and Daily Khata reads them
-- back by `servicedOn`. That keeps one expense as one row, so recording it in
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

-- The cash in hand before any Daily Khata entry existed. Single row, pinned to
-- id 1. Every day's balance is derived from this plus the entries since then,
-- so the carry-forward never has to be stored per day.
CREATE TABLE IF NOT EXISTS `khata_opening` (
  `id` tinyint(1) NOT NULL DEFAULT 1,
  `opening_date` date NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- What each client already owed before their payments started being recorded.
-- A client with no row here simply starts at zero.
CREATE TABLE IF NOT EXISTS `client_opening` (
  `client` varchar(30) NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `as_of_date` date DEFAULT NULL,
  PRIMARY KEY (`client`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Client dues are summed per month across the whole transaction history.
-- `transaction`.`client` is a TEXT column, so the index needs a prefix length.
CREATE INDEX `idx_transaction_client_period` ON `transaction` (`client`(50), `year`, `month`);
