@echo off
setlocal EnableExtensions
title 20-10 Gift - Data Sync

set "ROOT=%~dp0"
set "BACKEND=%ROOT%20-10be"
set "SNAPSHOT=20-10be/backups/current-data.sql"

cd /d "%ROOT%"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer is required.
  goto :failed
)

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is required.
  goto :failed
)

echo.
echo ============================================================
echo                  20-10 GIFT - DATA SYNC
echo ============================================================
echo [1] Publish this machine's data to Git
echo     Backup database, commit the snapshot, then git push.
echo.
echo [2] Update this machine's database from Git
echo     Git pull, migrate, then replace local shared data.
echo.
echo [0] Cancel
echo ============================================================
set /p "SYNC_CHOICE=Choose 0, 1, or 2: "

if "%SYNC_CHOICE%"=="1" goto :publish
if "%SYNC_CHOICE%"=="2" goto :download
if "%SYNC_CHOICE%"=="0" goto :cancelled

echo [ERROR] Invalid choice.
goto :failed

:publish
echo.
echo [1/3] Creating the shared-data snapshot...
cd /d "%BACKEND%"
call npm run backup:shared
if errorlevel 1 goto :backend_failed

echo.
echo [2/3] Committing snapshot changes...
cd /d "%ROOT%"
git add -- "%SNAPSHOT%"
if errorlevel 1 goto :git_failed

git diff --cached --quiet -- "%SNAPSHOT%"
if not errorlevel 1 (
  echo No database changes were found. Nothing needs to be published.
  goto :success
)

git commit -m "data: update shared snapshot" -- "%SNAPSHOT%"
if errorlevel 1 goto :git_failed

echo.
echo [3/3] Pushing to the configured Git remote...
git push
if errorlevel 1 (
  echo.
  echo [ERROR] The snapshot was committed locally, but git push failed.
  echo Fix Git authentication or connectivity, then run: git push
  goto :failed
)

echo.
echo Data from this machine is now available to other machines.
goto :success

:download
echo.
echo WARNING: This will replace local students, gallery, letters,
echo reactions, and view statistics with the snapshot from Git.
set /p "SYNC_CONFIRM=Type UPDATE to continue: "
if /I not "%SYNC_CONFIRM%"=="UPDATE" goto :cancelled

echo.
echo [1/3] Pulling the latest code and snapshot...
cd /d "%ROOT%"
git pull --ff-only
if errorlevel 1 (
  echo.
  echo [ERROR] git pull failed. Resolve local changes or Git conflicts first.
  goto :failed
)

echo.
echo [2/3] Applying database migrations...
cd /d "%BACKEND%"
if not exist "node_modules\" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :backend_failed
)
call npm run migrate
if errorlevel 1 goto :backend_failed

echo.
echo [3/3] Restoring shared data from the snapshot...
call npm run restore
if errorlevel 1 goto :backend_failed

echo.
echo This machine now uses the latest shared-data snapshot.
goto :success

:backend_failed
cd /d "%ROOT%"
echo.
echo [ERROR] Database synchronization failed.
echo Check MySQL and the values in 20-10be\.env.
goto :failed

:git_failed
cd /d "%ROOT%"
echo.
echo [ERROR] Git could not prepare or commit the snapshot.
goto :failed

:cancelled
echo.
echo No data was changed.
pause
exit /b 0

:success
echo.
echo Completed successfully.
pause
exit /b 0

:failed
echo.
pause
exit /b 1
