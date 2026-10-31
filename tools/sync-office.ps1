<#
    Office desktop sync.

    Run this on the OFFICE DESKTOP. It does two things, in this order:

      1. Downloads the latest code from GitHub (changes made on the laptop).
      2. Exports this machine's database and uploads it to GitHub.

    The office desktop owns the DATA. The laptop owns the CODE. Nothing here
    ever imports a database, so the live office data can never be overwritten
    by an older copy from the laptop.

    Double-click "Sync Office Data.bat" in the project folder to run it.
#>

# ---------------------------------------------------------------------------
# Settings - change these only if the setup moves
# ---------------------------------------------------------------------------
$MysqlBin    = 'C:\xampp\mysql\bin'
$Database    = 'hisabkitab'
$DbUser      = 'root'
$DbPassword  = ''                     # XAMPP default is a blank password
$Branch      = 'main'
$DumpRelPath = 'db\hisabkitab.sql'    # where the export lands inside the repo

# Tables to leave out of the export. Add a name here if a large table does not
# need to travel to the laptop, e.g. 'transaction_bak_20260702'.
$ExcludeTables = @()

# The repo is wherever this script lives, so the folder can be moved freely.
$RepoPath = Split-Path $PSScriptRoot -Parent

# ---------------------------------------------------------------------------
# Nothing below here needs editing
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$LogPath = Join-Path $PSScriptRoot 'last-sync.log'
"=== Sync started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content -Path $LogPath -Encoding utf8

function Write-Log {
    param([string]$Text)
    Add-Content -Path $LogPath -Value $Text -Encoding utf8
}

function Say {
    param([string]$Text, [string]$Colour = 'Gray')
    Write-Host $Text -ForegroundColor $Colour
    Write-Log $Text
}

function Step {
    param([string]$Text)
    Write-Host ''
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Log ">> $Text"
}

# Prints a plain-English problem and stops. Nothing is pushed on failure.
function Stop-WithProblem {
    param([string]$Problem, [string]$WhatToDo)
    Write-Host ''
    Write-Host '  ---------------------------------------------------------' -ForegroundColor Red
    Write-Host '   COULD NOT FINISH' -ForegroundColor Red
    Write-Host '  ---------------------------------------------------------' -ForegroundColor Red
    Write-Host ''
    Write-Host "   $Problem" -ForegroundColor Yellow
    Write-Host ''
    Write-Host "   What to do: $WhatToDo" -ForegroundColor White
    Write-Host ''
    Write-Host "   Details were saved to:" -ForegroundColor DarkGray
    Write-Host "   $LogPath" -ForegroundColor DarkGray
    Write-Log "FAILED: $Problem"
    Write-Log "ADVICE: $WhatToDo"
    Write-Host ''
    Read-Host '   Press Enter to close'
    exit 1
}

# Runs a command and returns its exit code plus combined output.
function Run {
    param([string]$Exe, [string[]]$Arguments)
    Write-Log "RUN: $Exe $($Arguments -join ' ')"
    $output = & $Exe @Arguments 2>&1 | Out-String
    $code = $LASTEXITCODE
    if ($output.Trim()) { Write-Log $output.Trim() }
    return [pscustomobject]@{ Code = $code; Output = $output }
}

# Credentials shared by every mysql call below.
function Get-DbArgs {
    $a = @("--user=$DbUser")
    if ($DbPassword -ne '') { $a += "--password=$DbPassword" }
    $a += '--host=127.0.0.1'
    return $a
}

Clear-Host
Write-Host ''
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   HISAB - OFFICE DESKTOP SYNC' -ForegroundColor Green
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   1. Downloads the latest program changes' -ForegroundColor Gray
Write-Host '   2. Uploads a fresh copy of the database' -ForegroundColor Gray

# --- 1. Check everything is in place -----------------------------------------
Step 'Checking this computer...'

if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
    Stop-WithProblem "The project folder at $RepoPath is not set up for GitHub." `
        'Ask Deepak - the sync folder may have been moved out of the project.'
}
Set-Location $RepoPath

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Stop-WithProblem 'Git is not installed on this computer.' `
        'Ask Deepak to install Git for Windows.'
}

$mysql = Join-Path $MysqlBin 'mysql.exe'
$mysqldump = Join-Path $MysqlBin 'mysqldump.exe'
$mysqladmin = Join-Path $MysqlBin 'mysqladmin.exe'
if (-not (Test-Path $mysqldump)) {
    Stop-WithProblem "MySQL was not found at $MysqlBin." `
        'Ask Deepak - XAMPP may be installed somewhere else.'
}

# The most common problem by far: XAMPP was never started.
$pingArgs = @("--user=$DbUser")
if ($DbPassword -ne '') { $pingArgs += "--password=$DbPassword" }
$pingArgs += @('--connect-timeout=5', 'ping')
$ping = Run $mysqladmin $pingArgs
if ($ping.Code -ne 0) {
    Stop-WithProblem 'The database is not running, so there is nothing to export.' `
        'Open the XAMPP Control Panel, click Start next to MySQL, wait for it to turn green, then run this again.'
}
Say '   Everything looks fine.' 'Green'

# --- 2. Download the latest code ---------------------------------------------
Step 'Downloading the latest program changes...'

$fetch = Run 'git.exe' @('fetch', 'origin', $Branch)
if ($fetch.Code -ne 0) {
    Stop-WithProblem 'Could not reach GitHub. The internet may be down.' `
        'Check that this computer can open a website, then run this again.'
}

# The export is rewritten every run, so a leftover edit to it is not a real
# change and must not block the download.
$dumpFull = Join-Path $RepoPath $DumpRelPath
if (Test-Path $dumpFull) { Run 'git.exe' @('checkout', '--', $DumpRelPath) | Out-Null }

# Anything else changed on this machine is put aside, then restored after the
# download, so a stray edit here is never silently thrown away.
$dirty = (Run 'git.exe' @('status', '--porcelain')).Output.Trim()
$stashed = $false
if ($dirty) {
    Say '   Setting aside some other changes on this computer...' 'DarkYellow'
    $stash = Run 'git.exe' @('stash', 'push', '-u', '-m', 'office-sync-autostash')
    if ($stash.Code -eq 0) { $stashed = $true }
}

$pull = Run 'git.exe' @('pull', '--rebase', 'origin', $Branch)
if ($pull.Code -ne 0) {
    Run 'git.exe' @('rebase', '--abort') | Out-Null
    if ($stashed) { Run 'git.exe' @('stash', 'pop') | Out-Null }
    Stop-WithProblem 'The latest changes could not be merged automatically.' `
        'Call Deepak - this one needs to be sorted out by hand. Nothing has been lost.'
}

if ($stashed) {
    $pop = Run 'git.exe' @('stash', 'pop')
    if ($pop.Code -ne 0) {
        Stop-WithProblem 'The changes set aside on this computer clash with the new ones.' `
            'Call Deepak - nothing has been lost, it just needs sorting out by hand.'
    }
}
Say '   Program is up to date.' 'Green'

# --- 3. Apply any database changes that came with the code --------------------
#
# Code and schema used to travel on separate rails: this script pulled new code
# but never the database changes it needed, so the office could be running new
# code against an old schema until someone remembered to run SQL by hand. That
# gap caused real trouble, so it is closed here.
#
# Only files named migrate_*.sql or repair_*.sql are ever run, and each is run
# once. That allowlist matters: sql\ also holds full database dumps, and running
# one of those would wipe everything.
Step 'Applying any new database changes...'

$sqlDir = Join-Path $RepoPath 'sql'
$applied = @()

$conn = Run $mysql ((Get-DbArgs) + @('-e', @"
CREATE TABLE IF NOT EXISTS ``schema_migrations`` (
  ``filename`` VARCHAR(190) NOT NULL,
  ``applied_on`` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (``filename``)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"@))
if ($conn.Code -ne 0) {
    Stop-WithProblem 'Could not prepare the database for its changes.' `
        'Nothing has been changed. Show Deepak the log named at the bottom of this window.'
}

$done = @{}
$rows = Run $mysql ((Get-DbArgs) + @('--batch', '--skip-column-names', '-e',
    'SELECT filename FROM `schema_migrations`'))
foreach ($line in ($rows.Output -split "`r?`n")) {
    if ($line.Trim()) { $done[$line.Trim()] = $true }
}

$pending = Get-ChildItem -Path $sqlDir -Filter '*.sql' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(migrate|repair)_' -and -not $done.ContainsKey($_.Name) } |
    Sort-Object Name

if ($pending.Count -gt 0) {
    # A copy of the database before anything is altered, so a change that goes
    # wrong is never the end of the story.
    $safeDir = Join-Path $RepoPath 'backups'
    if (-not (Test-Path $safeDir)) { New-Item -ItemType Directory -Path $safeDir -Force | Out-Null }
    $safeFile = Join-Path $safeDir ("office-before-changes-" + (Get-Date -Format 'yyyy-MM-dd_HHmmss') + '.sql')
    $safe = Run $mysqldump ((Get-DbArgs) + @(
        '--single-transaction', '--routines', '--default-character-set=utf8mb4',
        '--skip-extended-insert', '--result-file', $safeFile, $Database))
    if ($safe.Code -ne 0) {
        Stop-WithProblem 'Could not back up the database before changing it, so nothing was changed.' `
            'Show Deepak the log named at the bottom of this window.'
    }
    Say "   Saved a copy first: backups\$(Split-Path $safeFile -Leaf)" 'DarkGray'

    foreach ($file in $pending) {
        $run = Run 'cmd.exe' @('/c', "`"$mysql`" $((Get-DbArgs) -join ' ') $Database < `"$($file.FullName)`"")
        if ($run.Code -ne 0) {
            # Stopping here matters: exporting a half-changed database would
            # push the mess to the laptop as well.
            Stop-WithProblem "The database change $($file.Name) did not apply, so nothing was uploaded." `
                "Show Deepak the log named at the bottom of this window. A copy of the database before the change is in backups\$(Split-Path $safeFile -Leaf)."
        }
        $esc = $file.Name.Replace("'", "''")
        Run $mysql ((Get-DbArgs) + @('-e',
            "INSERT IGNORE INTO ``schema_migrations`` (``filename``) VALUES ('$esc')")) | Out-Null
        $applied += $file.Name
        Say "   Applied $($file.Name)" 'Green'
    }
} else {
    Say '   Nothing new to apply.' 'Green'
}

# --- 4. Export the database ---------------------------------------------------
Step 'Exporting the database (this can take a minute)...'

$dumpDir = Split-Path $dumpFull -Parent
if (-not (Test-Path $dumpDir)) { New-Item -ItemType Directory -Path $dumpDir -Force | Out-Null }

# Written to a temporary file first. A half-finished export must never replace
# the good copy, and must never reach GitHub.
$tempDump = Join-Path $env:TEMP "hisab-dump-$PID.sql"
$dumpArgs = @("--user=$DbUser")
if ($DbPassword -ne '') { $dumpArgs += "--password=$DbPassword" }
$dumpArgs += @(
    '--host=127.0.0.1',
    '--single-transaction',       # does not lock the tables while staff work
    '--routines',
    '--default-character-set=utf8mb4',
    '--skip-extended-insert',     # one row per line, so GitHub stores only the changes
    '--order-by-primary',         # stable row order, so the file barely changes
    '--result-file', $tempDump
)
foreach ($t in $ExcludeTables) { $dumpArgs += "--ignore-table=$Database.$t" }
$dumpArgs += $Database

$dump = Run $mysqldump $dumpArgs
if ($dump.Code -ne 0) {
    if (Test-Path $tempDump) { Remove-Item $tempDump -Force }
    Stop-WithProblem 'The database export failed.' `
        'Make sure MySQL is still running in XAMPP, then run this again.'
}

# mysqldump writes this marker on its last line only when it finished cleanly.
$tail = Get-Content $tempDump -Tail 3 -ErrorAction SilentlyContinue
if (-not ($tail -join "`n").Contains('Dump completed')) {
    Remove-Item $tempDump -Force
    Stop-WithProblem 'The database export came out incomplete, so it was thrown away.' `
        'Run this again. If it keeps happening, call Deepak.'
}

$sizeMb = [math]::Round((Get-Item $tempDump).Length / 1MB, 1)
Move-Item -Path $tempDump -Destination $dumpFull -Force
Say "   Exported $sizeMb MB." 'Green'

# --- 4. Upload it -------------------------------------------------------------
Step 'Uploading the database...'

Run 'git.exe' @('add', '--', $DumpRelPath) | Out-Null

$staged = (Run 'git.exe' @('diff', '--cached', '--name-only')).Output.Trim()
if (-not $staged) {
    Write-Host ''
    Write-Host '  =========================================================' -ForegroundColor Green
    Write-Host '   ALL DONE' -ForegroundColor Green
    Write-Host '  =========================================================' -ForegroundColor Green
    Write-Host '   The program is up to date.' -ForegroundColor Gray
    Write-Host '   The database has not changed since last time,' -ForegroundColor Gray
    Write-Host '   so there was nothing new to upload.' -ForegroundColor Gray
    Write-Host ''
    Read-Host '   Press Enter to close'
    exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$commit = Run 'git.exe' @('commit', '-m', "Office data export $stamp")
if ($commit.Code -ne 0) {
    Stop-WithProblem 'The database could not be saved for upload.' `
        'Call Deepak and show him the log file named at the bottom of this window.'
}

$push = Run 'git.exe' @('push', 'origin', $Branch)
if ($push.Code -ne 0) {
    # Almost always means the laptop pushed something in the meantime.
    Say '   Someone else uploaded first - merging and trying once more...' 'DarkYellow'
    $retry = Run 'git.exe' @('pull', '--rebase', 'origin', $Branch)
    if ($retry.Code -ne 0) {
        Run 'git.exe' @('rebase', '--abort') | Out-Null
        Stop-WithProblem 'Could not merge the other changes automatically.' `
            'Call Deepak. Your export is saved on this computer, nothing is lost.'
    }
    $push = Run 'git.exe' @('push', 'origin', $Branch)
    if ($push.Code -ne 0) {
        Stop-WithProblem 'The upload to GitHub failed.' `
            'Check the internet connection and run this again. If it still fails, call Deepak - your export is saved on this computer.'
    }
}

# Warn rather than silently ignore, so real work is never lost unnoticed.
$leftover = (Run 'git.exe' @('status', '--porcelain')).Output.Trim()

Write-Host ''
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   ALL DONE' -ForegroundColor Green
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   The program is up to date.' -ForegroundColor Gray
Write-Host "   The database ($sizeMb MB) has been uploaded." -ForegroundColor Gray
if ($leftover) {
    Write-Host ''
    Write-Host '   Note: some other files on this computer have been' -ForegroundColor Yellow
    Write-Host '   changed and were NOT uploaded. Mention this to Deepak.' -ForegroundColor Yellow
}
Write-Host ''
Read-Host '   Press Enter to close'
exit 0
