@echo off
rem Double-click starter for Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt / Node.js is missing.
  echo Bitte die LTS-Version installieren / please install the LTS version:
  echo    https://nodejs.org
  echo.
  pause
  exit /b 1
)

node .\bin\gws-connect.mjs %*
echo.
pause
