@echo off
REM ---------------------------------------------------------------
REM  Double-click this file on the OFFICE DESKTOP.
REM
REM   1. Downloads the latest program changes from GitHub
REM   2. Uploads a fresh copy of this computer's database
REM
REM  Start MySQL in the XAMPP Control Panel first.
REM ---------------------------------------------------------------
title Hisab - Office Desktop Sync
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sync-office.ps1"
if errorlevel 1 (
  echo.
  echo  The sync did not finish. See the message above.
  pause
)
