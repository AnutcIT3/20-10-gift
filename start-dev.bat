@echo off
setlocal
title 20-10 Gift Launcher

set "ROOT=%~dp0"
set "BACKEND=%ROOT%20-10be"
set "FRONTEND=%ROOT%20-10fe"
set "FACE=%ROOT%face-service"

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

rem Face ID is optional: without the Python venv the website runs exactly as before,
rem the Face ID card simply never appears. No health wait here - the frontend polls
rem /api/face/status itself while the model is still loading.
if exist "%FACE%\.venv\Scripts\python.exe" (
  echo Starting face service at http://127.0.0.1:5002 ...
  start "20-10 Gift Face Service" cmd /k "cd /d ""%FACE%"" && .venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 5002"
) else (
  echo [WARN] face-service\.venv was not found. Face ID stays hidden; the website still works.
  echo        Run setup-local.bat again with Python 3.11 installed to enable it.
)

echo Starting frontend at http://localhost:5173 ...
start "20-10 Gift Frontend" cmd /k "cd /d ""%FRONTEND%"" && npm run dev"

echo Waiting for the development servers...
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Backend, frontend and the face service (when installed) were launched in separate windows.
echo Close those windows or press Ctrl+C in each one to stop the project.
echo The face service needs a few seconds to load its model; the Face ID card appears once it is ready.
timeout /t 3 /nobreak >nul
endlocal
