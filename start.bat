@echo off
cd /d "%~dp0"
call npm.cmd install
if errorlevel 1 goto failed
node server.js
if not errorlevel 1 exit /b 0
:failed
pause
exit /b 1
