@echo off
REM ---------------------------------------------------------------
REM  Double-click this file on the LAPTOP.
REM
REM   1. Downloads the latest code and database from GitHub
REM   2. Replaces this laptop's database with the office copy
REM
REM  Your own code changes are set aside and put back, and are
REM  never committed or pushed for you.
REM
REM  Start MySQL in the XAMPP Control Panel first.
REM ---------------------------------------------------------------
title Hisab - Laptop Sync
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\sync-laptop.ps1"
if errorlevel 1 (
  echo.
  echo  The sync did not finish. See the message above.
  pause
)
