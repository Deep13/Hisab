-- Repairs that must be applied on the OFFICE DESKTOP
--
-- Data only ever flows office -> laptop: the office exports, the laptop drops
-- its database and imports that copy. So anything corrected on the laptop is
-- erased by the next sync. These corrections were made on the laptop and lost
-- that way; applying them here puts them on the machine that owns the data, so
-- they reach the laptop on their own and stay fixed.
--
--   "C:\xampp\mysql\bin\mysql.exe" -u root hisabkitab < sql\repair_office_2026-10-31.sql
--
-- Safe to run twice: every statement only matches rows still needing the fix.
-- Nothing here moves money. Run sql\migrate_labour_payment.sql as well, which
-- adds the columns the labour-payment feature needs.

-- 1. Opening-balance as-of dates
--
-- Editing one client's opening balance rewrites the whole sheet, stamping every
-- row with the date in the "Balances as at" box. On 30 October that moved 437
-- rows from 2026-08-01 to 2026-10-30. The amounts were untouched, but the date
-- is the cut-off deciding what counts as already settled - at 30 October all of
-- August, September and October billing was wrongly excluded from OD, so every
-- client's dues read far too low.
UPDATE `client_opening`
SET `as_of_date` = '2026-08-01'
WHERE `as_of_date` = '2026-10-30';

-- 2. Charbi hours truncated to whole numbers
--
-- The server cast quantity to an integer, so 4.5 hours was stored as 4. Until
-- 1 July the total still came from the browser, so these rows kept the correct
-- total and the lost half hour can be read back from it: a total exactly half
-- an hour's rate above what the stored quantity implies means the hours were
-- rounded down. Only the hours change; no total is touched.
UPDATE `transaction`
SET `quantity` = `quantity` + 0.5
WHERE `machineType` = 'Softening'
  AND `rate` = 100
  AND `dateTime` >= '2026-04-01'
  AND `total` - IF(`quantity` <= 3, 400, 400 + `rate` * (`quantity` - 3)) = `rate` * 0.5;

-- After 1 July the total was derived from the already-truncated quantity, so
-- those rows are self-consistent and the lost half hours cannot be recovered.
-- They are undercharges of 50 each and are deliberately left alone.
