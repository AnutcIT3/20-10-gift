param(
    [Parameter(Mandatory = $true)]
    [string]$CloudflaredPath,

    [Parameter(Mandatory = $true)]
    [string]$BackendDir,

    [int]$Port = 5001
)

$ErrorActionPreference = 'Stop'
$backendProcess = $null
$tunnelProcess = $null
$ownsBackend = $false
$runtimeId = "$PID-$([DateTime]::UtcNow.Ticks)"
$backendOutLog = Join-Path $env:TEMP "gift-backend-$runtimeId.out.log"
$backendErrLog = Join-Path $env:TEMP "gift-backend-$runtimeId.err.log"
$tunnelOutLog = Join-Path $env:TEMP "gift-tunnel-$runtimeId.out.log"
$tunnelErrLog = Join-Path $env:TEMP "gift-tunnel-$runtimeId.err.log"

function Test-BackendReady {
    param([int]$TargetPort)

    try {
        $ready = Invoke-RestMethod `
            -Uri "http://127.0.0.1:$TargetPort/api/ready" `
            -TimeoutSec 2
        if ($ready.status -ne 'ready') {
            return $false
        }

        $root = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri "http://127.0.0.1:$TargetPort/" `
            -TimeoutSec 2
        return $root.StatusCode -eq 200 -and $root.Content.Contains('id="root"')
    } catch {
        return $false
    }
}

function Stop-OwnedProcess {
    param([System.Diagnostics.Process]$Process)

    if ($null -ne $Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        $Process.WaitForExit(5000) | Out-Null
    }
}

try {
    if (Test-BackendReady -TargetPort $Port) {
        Write-Host "[Backend] Dang dung server production san co tren cong $Port." -ForegroundColor Green
    } else {
        $listener = Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($listener) {
            throw "Cong $Port dang bi process $($listener.OwningProcess) su dung, nhung khong phai server production san sang."
        }

        Write-Host "[Backend] Dang khoi dong production server..." -ForegroundColor Yellow
        $previousServeStatic = $env:SERVE_STATIC
        $previousNodeEnv = $env:NODE_ENV
        $previousPort = $env:PORT
        $env:SERVE_STATIC = 'true'
        $env:NODE_ENV = 'production'
        $env:PORT = "$Port"
        try {
            $backendProcess = Start-Process `
                -FilePath 'node' `
                -ArgumentList 'server.js' `
                -WorkingDirectory $BackendDir `
                -RedirectStandardOutput $backendOutLog `
                -RedirectStandardError $backendErrLog `
                -PassThru `
                -WindowStyle Hidden
            $ownsBackend = $true
        } finally {
            $env:SERVE_STATIC = $previousServeStatic
            $env:NODE_ENV = $previousNodeEnv
            $env:PORT = $previousPort
        }

        $backendReady = $false
        for ($attempt = 1; $attempt -le 30; $attempt++) {
            if ($backendProcess.HasExited) {
                $errorText = Get-Content $backendErrLog -Raw -ErrorAction SilentlyContinue
                throw "Backend dung dot ngot. $errorText"
            }
            if (Test-BackendReady -TargetPort $Port) {
                $backendReady = $true
                break
            }
            Start-Sleep -Seconds 1
        }

        if (-not $backendReady) {
            throw "Backend khong ready sau 30 giay. Log: $backendErrLog"
        }
        Write-Host "[Backend] API, database va frontend deu san sang." -ForegroundColor Green
    }

    Write-Host "[Tunnel] Dang ket noi Cloudflare Quick Tunnel..." -ForegroundColor Yellow
    $tunnelProcess = Start-Process `
        -FilePath $CloudflaredPath `
        -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port") `
        -RedirectStandardOutput $tunnelOutLog `
        -RedirectStandardError $tunnelErrLog `
        -PassThru `
        -WindowStyle Hidden

    $url = $null
    for ($attempt = 1; $attempt -le 45; $attempt++) {
        if ($tunnelProcess.HasExited) {
            $errorText = Get-Content $tunnelErrLog -Raw -ErrorAction SilentlyContinue
            throw "Cloudflare Tunnel dung dot ngot. $errorText"
        }

        $logText = Get-Content $tunnelErrLog -Raw -ErrorAction SilentlyContinue
        if ($logText -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $url = $Matches[0]
            break
        }
        Start-Sleep -Seconds 1
    }

    if (-not $url) {
        throw "Khong nhan duoc URL Cloudflare sau 45 giay. Log: $tunnelErrLog"
    }

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "  LINK PUBLIC CUA BAN:" -ForegroundColor Green
    Write-Host "  $url" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Giu cua so nay de link tiep tuc hoat dong." -ForegroundColor Yellow
    Write-Host "Nhan Ctrl+C de tat tunnel va backend." -ForegroundColor Yellow
    Start-Process $url

    while (-not $tunnelProcess.HasExited) {
        Start-Sleep -Seconds 1
    }

    if ($tunnelProcess.ExitCode -ne 0) {
        throw "Cloudflare Tunnel ket thuc voi ma loi $($tunnelProcess.ExitCode). Log: $tunnelErrLog"
    }
} catch {
    Write-Host ""
    Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Stop-OwnedProcess -Process $tunnelProcess
    if ($ownsBackend) {
        Stop-OwnedProcess -Process $backendProcess
    }
}
