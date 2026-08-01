-- Notices printed on client invoices (Tagada Slip -> Print Invoices).
-- A notice with no rows in `notice_client` is global and prints on every
-- invoice; otherwise it prints only on the invoices of the listed clients.

CREATE TABLE IF NOT EXISTS `notice` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `notice` text NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `createdOn` date NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Master switch. When `enabled` is 0 no notice is printed at all, whatever the
-- individual notices say. Single row, pinned to id 1.
CREATE TABLE IF NOT EXISTS `notice_setting` (
  `id` tinyint(1) NOT NULL DEFAULT 1,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `notice_setting` (`id`, `enabled`) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS `notice_client` (
  `notice_id` int(11) NOT NULL,
  `client` varchar(30) NOT NULL,
  PRIMARY KEY (`notice_id`, `client`),
  CONSTRAINT `fk_notice_client_notice` FOREIGN KEY (`notice_id`)
    REFERENCES `notice` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
