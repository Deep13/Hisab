<#
    Laptop sync.

    Run this on the LAPTOP. It does two things, in this order:

      1. Downloads the latest code and the latest database from GitHub.
      2. Replaces this laptop's database with the office copy.

    The office desktop owns the DATA, so this script only ever receives it.
    Your own code changes are never touched: anything uncommitted is set aside
    and put back, and nothing is ever committed or pushed for you.

    Before replacing anything it saves this laptop's current database to the
    backups folder. If the import fails it puts that copy straight back.

    Double-click "Sync Laptop.bat" in the project folder to run it.
#>

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
$MysqlBin    = 'C:\xampp\mysql\bin'
$Database    = 'hisabkitab'
$DbUser      = 'root'
$DbPassword  = ''                     # XAMPP default is a blank password
$Branch      = 'main'
$DumpRelPath = 'db\hisabkitab.sql'    # the office export, as it arrives
$BackupDir   = 'backups'              # local safety copies, never uploaded
$KeepBackups = 10

# The repo is wherever this script lives, so the folder can be moved freely.
$RepoPath = Split-Path $PSScriptRoot -Parent

# ---------------------------------------------------------------------------
# Nothing below here needs editing
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$LogPath = Join-Path $PSScriptRoot 'last-sync.log'
"=== Laptop sync started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content -Path $LogPath -Encoding utf8

function Write-Log { param([string]$Text) Add-Content -Path $LogPath -Value $Text -Encoding utf8 }

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
    Write-Host "   Details: $LogPath" -ForegroundColor DarkGray
    Write-Log "FAILED: $Problem"
    Write-Host ''
    Read-Host '   Press Enter to close'
    exit 1
}

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

# Feeds a .sql file into the mysql client. Start-Process redirects the file
# directly, which is both fast and safe for a 9 MB dump - piping it through
# PowerShell would be slow and could mangle the encoding.
function Import-SqlFile {
    param([string]$SqlPath, [string]$TargetDb)
    $errFile = Join-Path $env:TEMP "hisab-import-err-$PID.txt"
    $argList = (Get-DbArgs) + @('--default-character-set=utf8mb4', $TargetDb)
    $proc = Start-Process -FilePath (Join-Path $MysqlBin 'mysql.exe') `
        -ArgumentList $argList -RedirectStandardInput $SqlPath `
        -RedirectStandardError $errFile -NoNewWindow -Wait -PassThru
    $stderr = ''
    if (Test-Path $errFile) {
        $stderr = (Get-Content $errFile -Raw)
        Remove-Item $errFile -Force -ErrorAction SilentlyContinue
    }
    if ($stderr.Trim()) { Write-Log $stderr.Trim() }
    return [pscustomobject]@{ Code = $proc.ExitCode; Error = $stderr }
}

Clear-Host
Write-Host ''
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   HISAB - LAPTOP SYNC' -ForegroundColor Green
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   1. Downloads the latest code and database' -ForegroundColor Gray
Write-Host '   2. Replaces this laptop database with the office copy' -ForegroundColor Gray

# --- 1. Checks ----------------------------------------------------------------
Step 'Checking this computer...'

if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
    Stop-WithProblem "$RepoPath is not a git checkout." `
        'Keep tools\sync-laptop.ps1 inside the project folder - the script works out the repo from its own location.'
}
Set-Location $RepoPath

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Stop-WithProblem 'Git is not installed on this computer.' 'Install Git for Windows.'
}

$mysqldump  = Join-Path $MysqlBin 'mysqldump.exe'
$mysql      = Join-Path $MysqlBin 'mysql.exe'
$mysqladmin = Join-Path $MysqlBin 'mysqladmin.exe'
foreach ($exe in @($mysqldump, $mysql, $mysqladmin)) {
    if (-not (Test-Path $exe)) {
        Stop-WithProblem "MySQL was not found at $MysqlBin." `
            'Edit $MysqlBin at the top of tools\sync-laptop.ps1 to match where XAMPP is installed here.'
    }
}

$ping = Run $mysqladmin ((Get-DbArgs) + @('--connect-timeout=5', 'ping'))
if ($ping.Code -ne 0) {
    Stop-WithProblem 'MySQL is not running, so the database cannot be replaced.' `
        'Start MySQL in the XAMPP Control Panel, then run this again.'
}
Say '   Everything looks fine.' 'Green'

# --- 2. Download --------------------------------------------------------------
Step 'Downloading the latest code and database...'

if ((Run 'git.exe' @('fetch', 'origin', $Branch)).Code -ne 0) {
    Stop-WithProblem 'Could not reach GitHub.' 'Check the internet connection and run this again.'
}

# Your own unfinished code work is set aside and restored, never discarded.
$dirty = (Run 'git.exe' @('status', '--porcelain')).Output.Trim()
$stashed = $false
if ($dirty) {
    Say '   Setting your uncommitted changes aside...' 'DarkYellow'
    if ((Run 'git.exe' @('stash', 'push', '-u', '-m', 'laptop-sync-autostash')).Code -eq 0) { $stashed = $true }
}

$pull = Run 'git.exe' @('pull', '--rebase', 'origin', $Branch)
if ($pull.Code -ne 0) {
    Run 'git.exe' @('rebase', '--abort') | Out-Null
    if ($stashed) { Run 'git.exe' @('stash', 'pop') | Out-Null }
    Stop-WithProblem 'The latest changes could not be merged automatically.' `
        'Sort the conflict out by hand. Your work is safe - nothing was committed or discarded.'
}

if ($stashed) {
    if ((Run 'git.exe' @('stash', 'pop')).Code -ne 0) {
        Stop-WithProblem 'Your changes clash with what came down from GitHub.' `
            'Resolve the conflict by hand, then run this again. Your work is still in the stash - "git stash list" will show it.'
    }
    Say '   Your changes have been put back.' 'Green'
}
Say '   Code is up to date.' 'Green'

# --- 3. Check the office export before touching anything ----------------------
Step 'Checking the office database export...'

$dumpFull = Join-Path $RepoPath $DumpRelPath
if (-not (Test-Path $dumpFull)) {
    Stop-WithProblem "No database export found at $DumpRelPath." `
        'Run "Sync Office Data" on the office desktop first, so there is an export to download.'
}

# Refuse to import a truncated file - that is how a database gets wrecked.
$tail = (Get-Content $dumpFull -Tail 3 -ErrorAction SilentlyContinue) -join "`n"
if (-not $tail.Contains('Dump completed')) {
    Stop-WithProblem 'The downloaded export looks incomplete, so it was not imported.' `
        'Run "Sync Office Data" on the office desktop again to upload a fresh copy.'
}

$dumpAge = [math]::Round(((Get-Date) - (Get-Item $dumpFull).LastWriteTime).TotalHours, 1)
$dumpMb  = [math]::Round((Get-Item $dumpFull).Length / 1MB, 1)
Say "   Export looks complete ($dumpMb MB)." 'Green'

# --- 4. Back up this laptop's database ---------------------------------------
Step 'Backing up this laptop database first...'

$backupPath = Join-Path $RepoPath $BackupDir
if (-not (Test-Path $backupPath)) { New-Item -ItemType Directory -Path $backupPath -Force | Out-Null }
$backupFile = Join-Path $backupPath ("laptop-$Database-" + (Get-Date -Format 'yyyy-MM-dd_HHmmss') + '.sql')

$backupArgs = (Get-DbArgs) + @(
    '--single-transaction', '--routines', '--default-character-set=utf8mb4',
    '--skip-extended-insert', '--order-by-primary', '--result-file', $backupFile, $Database
)
$backup = Run $mysqldump $backupArgs
$backupOk = ($backup.Code -eq 0) -and (Test-Path $backupFile) -and
            (((Get-Content $backupFile -Tail 3) -join "`n").Contains('Dump completed'))

if (-not $backupOk) {
    # A first-ever run has no database yet, which is fine. Anything else is not.
    $exists = Run $mysql ((Get-DbArgs) + @('--batch', '--skip-column-names', '-e', "SHOW DATABASES LIKE '$Database'"))
    if ($exists.Output.Trim()) {
        Stop-WithProblem 'Could not back up this laptop database, so nothing was replaced.' `
            'Nothing has changed on this laptop. Check the log and try again.'
    }
    Say '   No existing database here yet - nothing to back up.' 'DarkYellow'
    $backupOk = $false
} else {
    Say "   Saved to $BackupDir\$(Split-Path $backupFile -Leaf)" 'Green'
}

# --- 5. Replace the database --------------------------------------------------
Step 'Replacing this laptop database with the office copy...'

$recreate = Run $mysql ((Get-DbArgs) + @('-e',
    "DROP DATABASE IF EXISTS ``$Database``; CREATE DATABASE ``$Database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"))
if ($recreate.Code -ne 0) {
    Stop-WithProblem 'Could not prepare the database for import.' `
        'Nothing has been changed. Check the log and try again.'
}

$import = Import-SqlFile -SqlPath $dumpFull -TargetDb $Database
if ($import.Code -ne 0) {
    Say '   Import failed - putting your previous database back...' 'Red'
    if ($backupOk) {
        Run $mysql ((Get-DbArgs) + @('-e', "DROP DATABASE IF EXISTS ``$Database``; CREATE DATABASE ``$Database``;")) | Out-Null
        $restore = Import-SqlFile -SqlPath $backupFile -TargetDb $Database
        if ($restore.Code -eq 0) {
            Stop-WithProblem 'The office copy would not import, so your previous database was put back.' `
                'Ask for a fresh export from the office desktop. This laptop is exactly as it was.'
        }
        Stop-WithProblem 'The import failed AND the automatic restore failed.' `
            "Restore by hand from: $backupFile"
    }
    Stop-WithProblem 'The office copy would not import.' `
        'There was no earlier database here to put back. Ask for a fresh export from the office desktop.'
}

# --- 6. Show what arrived, as a sanity check ----------------------------------
$counts = Run $mysql ((Get-DbArgs) + @('--batch', '--skip-column-names', $Database, '-e',
    "SELECT (SELECT COUNT(*) FROM transaction), (SELECT COUNT(*) FROM masterclient), (SELECT COUNT(*) FROM daily_khata);"))
$parts = $counts.Output.Trim() -split "\s+"

# Keep the backups folder from growing without limit.
Get-ChildItem $backupPath -Filter '*.sql' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip $KeepBackups |
    ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

Write-Host ''
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   ALL DONE' -ForegroundColor Green
Write-Host '  =========================================================' -ForegroundColor Green
Write-Host '   Code is up to date.' -ForegroundColor Gray
Write-Host "   Database replaced with the office copy ($dumpMb MB)." -ForegroundColor Gray
if ($parts.Count -ge 3) {
    Write-Host ''
    Write-Host "   transactions : $($parts[0])" -ForegroundColor Gray
    Write-Host "   clients      : $($parts[1])" -ForegroundColor Gray
    Write-Host "   khata entries: $($parts[2])" -ForegroundColor Gray
}
Write-Host ''
Write-Host "   The office export was made $dumpAge hour(s) ago." -ForegroundColor DarkGray
if ($stashed) {
    Write-Host '   Your uncommitted code changes were put back.' -ForegroundColor Yellow
}
Write-Host '   Your code changes are never pushed by this script -' -ForegroundColor DarkGray
Write-Host '   commit and push those yourself as usual.' -ForegroundColor DarkGray
Write-Host ''
Read-Host '   Press Enter to close'
exit 0
