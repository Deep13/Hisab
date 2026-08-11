-- Electricity: a sub-module of Expenses.
--
-- One row per connection/meter, and one bill per meter per month. The monthly
-- bill total feeds the Electric Bill line when the P&L for that month is
-- generated, so it never has to be typed twice.

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

-- One bill per meter per month; re-saving the same period overwrites it
-- rather than adding a second bill.
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
