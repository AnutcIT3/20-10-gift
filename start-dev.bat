@echo off
setlocal
title 20-10 Gift Launcher

set "ROOT=%~dp0"
set "BACKEND=%ROOT%20-10be"
set "FRONTEND=%ROOT%20-10fe"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "%BACKEND%\package.json" (
  echo [ERROR] Backend folder was not found: %BACKEND%
  pause
  exit /b 1
)

if not exist "%FRONTEND%\package.json" (
  echo [ERROR] Frontend folder was not found: %FRONTEND%
  pause
  exit /b 1
)

if not exist "%BACKEND%\.env" (
  echo First-time configuration is required. Starting setup-local.bat...
  call "%ROOT%setup-local.bat"
  if errorlevel 1 exit /b 1
)

if not exist "%BACKEND%\node_modules" (
  echo Installing backend dependencies...
  pushd "%BACKEND%"
  call npm install --no-audit --no-fund
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

if not exist "%FRONTEND%\node_modules" (
  echo Installing frontend dependencies...
  pushd "%FRONTEND%"
  call npm install --no-audit --no-fund
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

echo Starting backend at http://localhost:5001 ...
start "20-10 Gift Backend" cmd /k "cd /d ""%BACKEND%"" && npm run dev"

echo Starting frontend at http://localhost:5173 ...
start "20-10 Gift Frontend" cmd /k "cd /d ""%FRONTEND%"" && npm run dev"

echo Waiting for the development servers...
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Both servers were launched in separate windows.
echo Close those two windows or press Ctrl+C in each one to stop the project.
timeout /t 3 /nobreak >nul
endlocal
