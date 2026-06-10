@echo off
REM One-click start: Local Postgres + Redis + Backend + Frontend
REM Optional: pass Windows service names if auto-detection doesn't find them.
REM Example:
REM   start-system-with-db.bat -PostgresServiceName postgresql-x64-16 -RedisServiceName MemuraiDeveloper
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\start-system.ps1" -WithDb %*
pause
