@echo off
cd /d "%~dp0"
node scripts\planner.mjs open
if errorlevel 1 pause
