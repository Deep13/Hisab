-- Machine master for the Machine Expenses screen.
-- Until now machines only existed implicitly, as DISTINCT rows of `service`,
-- which made it impossible to add a machine before its first expense.

CREATE TABLE IF NOT EXISTS `machine` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cc` varchar(30) NOT NULL,
  `machineName` varchar(30) NOT NULL,
  `type` varchar(30) NOT NULL,
  `createdOn` date NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_machine_office` (`cc`, `machineName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed the master with every machine that already appears in the expense
-- history, so no existing data is orphaned by the new screen.
INSERT IGNORE INTO `machine` (`cc`, `machineName`, `type`, `createdOn`, `active`)
SELECT `cc`, `machineName`, MIN(`type`), MIN(`servicedOn`), 1
FROM `service`
GROUP BY `cc`, `machineName`;

-- Expense lookups are always scoped to one machine.
CREATE INDEX `idx_service_machine` ON `service` (`cc`, `machineName`);
-- The report aggregates by date range.
CREATE INDEX `idx_service_serviced_on` ON `service` (`servicedOn`);
