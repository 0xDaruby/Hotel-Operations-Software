@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  exit /b 1
)

node "%~dp0setup-main-build.cjs"
exit /b %errorlevel%
