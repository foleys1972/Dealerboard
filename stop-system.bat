@echo off
REM Quick wrapper for stop-system.ps1
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\stop-system.ps1" %*
pause

