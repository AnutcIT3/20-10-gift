param(
    [Parameter(Mandatory = $true)]
    [string]$CloudflaredPath,

    [Parameter(Mandatory = $true)]
    [string]$BackendDir,

    [int]$Port = 5001,

    [switch]$CleanExistingTunnels,

    [switch]$RestartExistingBackend,

    [string]$DnsSettingsScript,

    [switch]$SkipDnsRepair
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

function Test-PublicUrlReady {
    param([string]$Url)

    try {
        $ready = Invoke-RestMethod `
            -Uri "$Url/api/ready" `
            -TimeoutSec 5
        if ($ready.status -ne 'ready') {
            return $false
        }

        $root = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $Url `
            -TimeoutSec 5
        return $root.StatusCode -eq 200 -and $root.Content.Contains('id="root"')
    } catch {
        return $false
    }
}

function Get-PublicDnsAddresses {
    param(
        [string]$Url,
        [string]$Server
    )

    try {
        $hostName = ([Uri]$Url).Host
        $records = Resolve-DnsName `
            -Name $hostName `
            -Server $Server `
            -Type A `
            -ErrorAction Stop
        return @($records | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress -Unique)
    } catch {
        return @()
    }
}

function Test-DefaultDnsReady {
    param([string]$Url)

    try {
        $hostName = ([Uri]$Url).Host
        $records = Resolve-DnsName `
            -Name $hostName `
            -Type A `
            -DnsOnly `
            -ErrorAction Stop
        return @($records | Where-Object { $_.IPAddress }).Count -gt 0
    } catch {
        return $false
    }
}

function Test-PublicUrlViaAddress {
    param(
        [string]$Url,
        [string]$Address
    )

    $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
    if (-not $curl) {
        return $false
    }

    try {
        $hostName = ([Uri]$Url).Host
        $output = & $curl.Source `
            '--silent' `
            '--show-error' `
            '--fail' `
            '--connect-timeout' '3' `
            '--max-time' '6' `
            '--resolve' "${hostName}:443:${Address}" `
            "$Url/api/ready" 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $false
        }

        $ready = ($output | Out-String) | ConvertFrom-Json
        return $ready.status -eq 'ready'
    } catch {
        return $false
    }
}

function Invoke-DnsRepair {
    param(
        [string]$ScriptPath,
        [string]$HostName
    )

    if (-not $ScriptPath -or -not (Test-Path -LiteralPath $ScriptPath)) {
        return $false
    }

    Write-Host ""
    Write-Host "DNS cua mang dang dung khong thay ten mien moi, trong khi Cloudflare DNS thay binh thuong." -ForegroundColor Yellow
    $answer = Read-Host "Doi DNS cua ket noi dang dung sang 1.1.1.1? Can bam Yes o cua so UAC [Y/N]"
    if ($answer -notmatch '^(y|yes|c|co)$') {
        return $false
    }

    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $ScriptPath `
        -Action Fix `
        -HostName $HostName
    return $LASTEXITCODE -eq 0
}

function Test-TunnelRegistered {
    param([string]$LogPath)

    try {
        $logText = Get-Content $LogPath -Raw -ErrorAction Stop
        return $logText.Contains('Registered tunnel connection')
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

function Get-ExistingTunnelProcesses {
    param([int]$TargetPort)

    return Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*--url http://127.0.0.1:$TargetPort*" }
}

function Stop-ExistingTunnels {
    param([int]$TargetPort)

    $processes = Get-ExistingTunnelProcesses -TargetPort $TargetPort
    foreach ($process in $processes) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "[Tunnel] Da tat tunnel cu process $($process.ProcessId)." -ForegroundColor Yellow
    }
}

function Get-LanUrl {
    param([int]$TargetPort)

    try {
        $configuration = Get-NetIPConfiguration |
            Where-Object {
                $_.NetAdapter.Status -eq 'Up' -and
                $null -ne $_.IPv4DefaultGateway -and
                $null -ne $_.IPv4Address
            } |
            Select-Object -First 1
        if ($configuration) {
            return "http://$($configuration.IPv4Address.IPAddress):$TargetPort"
        }
    } catch {
        return $null
    }

    return $null
}

function Restart-ProjectBackend {
    param([int]$TargetPort)

    $listener = Get-NetTCPConnection `
        -LocalPort $TargetPort `
        -State Listen `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) {
        return
    }

    if (-not (Test-BackendReady -TargetPort $TargetPort)) {
        throw "Cong $TargetPort dang duoc su dung, nhung backend hien tai khong san sang."
    }

    $process = Get-CimInstance `
        Win32_Process `
        -Filter "ProcessId=$($listener.OwningProcess)" `
        -ErrorAction SilentlyContinue
    if (-not $process -or $process.Name -ne 'node.exe' -or $process.CommandLine -notmatch '(^|[\\/\s])server\.js([\s]|$)') {
        throw "Khong tu dong khoi dong lai process $($listener.OwningProcess) tren cong $TargetPort vi khong xac dinh duoc day la backend cua du an."
    }

    Write-Host "[Backend] Dang tat backend cu process $($process.ProcessId) de nap ma nguon moi..." -ForegroundColor Yellow
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        $stillListening = Get-NetTCPConnection `
            -LocalPort $TargetPort `
            -State Listen `
            -ErrorAction SilentlyContinue
        if (-not $stillListening) {
            return
        }
        Start-Sleep -Milliseconds 250
    }

    throw "Backend cu da dung nhung cong $TargetPort chua duoc giai phong."
}

try {
    if ($RestartExistingBackend) {
        Restart-ProjectBackend -TargetPort $Port
    }

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

    $existingTunnels = Get-ExistingTunnelProcesses -TargetPort $Port
    if ($existingTunnels.Count -gt 0 -and $CleanExistingTunnels) {
        Write-Host "[Tunnel] Dang tat $($existingTunnels.Count) Cloudflare Tunnel cu cung tro vao cong $Port..." -ForegroundColor Yellow
        Stop-ExistingTunnels -TargetPort $Port
    } elseif ($existingTunnels.Count -gt 0) {
        Write-Host "[Tunnel] Canh bao: dang co $($existingTunnels.Count) Cloudflare Tunnel cu cung tro vao cong $Port." -ForegroundColor Yellow
        Write-Host "[Tunnel] Neu link bi lan lon, hay dong cac cua so public mode cu roi chay lai." -ForegroundColor Yellow
    }

    Write-Host "[Tunnel] Dang ket noi Cloudflare Quick Tunnel..." -ForegroundColor Yellow
    $tunnelProcess = Start-Process `
        -FilePath $CloudflaredPath `
        -ArgumentList @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', "http://127.0.0.1:$Port") `
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

    Write-Host "[Tunnel] Da nhan URL. Dang kiem tra DNS va public route..." -ForegroundColor Yellow
    try {
        Clear-DnsClientCache -ErrorAction SilentlyContinue
    } catch {
        # Best effort only. Router DNS cache can still keep a fresh Quick Tunnel invisible.
    }

    $publicReady = $false
    $usedDnsBypass = $false
    $defaultDnsReady = $false
    $publicDnsAddresses = @()
    $publicCheckDeadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $publicCheckDeadline) {
        if ($tunnelProcess.HasExited) {
            $errorText = Get-Content $tunnelErrLog -Raw -ErrorAction SilentlyContinue
            throw "Cloudflare Tunnel dung dot ngot. $errorText"
        }

        if ($publicDnsAddresses.Count -eq 0) {
            $publicDnsAddresses = @(Get-PublicDnsAddresses -Url $url -Server '1.1.1.1')
            if ($publicDnsAddresses.Count -eq 0) {
                $publicDnsAddresses = @(Get-PublicDnsAddresses -Url $url -Server '8.8.8.8')
            }
        }

        $defaultDnsReady = Test-DefaultDnsReady -Url $url
        if ($defaultDnsReady -and (Test-PublicUrlReady -Url $url)) {
            $publicReady = $true
            break
        }

        if ($publicDnsAddresses.Count -gt 0 -and (Test-TunnelRegistered -LogPath $tunnelErrLog)) {
            foreach ($address in $publicDnsAddresses) {
                if (Test-PublicUrlViaAddress -Url $url -Address $address) {
                    $publicReady = $true
                    $usedDnsBypass = $true
                    break
                }
            }
            if ($publicReady) {
                break
            }
        }

        Start-Sleep -Seconds 2
    }

    if (-not $publicReady) {
        throw "Cloudflare URL khong truy cap duoc sau 30 giay: $url. Tunnel hoac route Cloudflare dang loi. Log: $tunnelErrLog"
    }

    if ($usedDnsBypass -and -not $defaultDnsReady) {
        Write-Host "[DNS] Tunnel hoat dong, nhung DNS mac dinh cua may dang tra loi sai." -ForegroundColor Yellow
        Write-Host "[DNS] Da xac minh URL truc tiep qua Cloudflare; day khong phai loi backend." -ForegroundColor Yellow

        $dnsFixed = $false
        if (-not $SkipDnsRepair) {
            $dnsFixed = Invoke-DnsRepair `
                -ScriptPath $DnsSettingsScript `
                -HostName ([Uri]$url).Host
        }
        if ($dnsFixed) {
            try {
                Clear-DnsClientCache -ErrorAction SilentlyContinue
            } catch {
                # The elevated helper already flushes the DNS cache.
            }

            for ($attempt = 1; $attempt -le 10; $attempt++) {
                if ((Test-DefaultDnsReady -Url $url) -and (Test-PublicUrlReady -Url $url)) {
                    $defaultDnsReady = $true
                    break
                }
                Start-Sleep -Seconds 1
            }

            if ($defaultDnsReady) {
                Write-Host "[DNS] Da sua DNS. May nay da truy cap duoc link public." -ForegroundColor Green
            } else {
                Write-Host "[DNS] Da doi DNS nhung Windows chua truy cap duoc link. Hay tat/bat lai Wi-Fi roi thu lai." -ForegroundColor Yellow
            }
        } else {
            Write-Host "[DNS] Khong thay doi cau hinh. Link van co the mo tren mang/Thiet bi co DNS hoat dong." -ForegroundColor Yellow
        }
    }

    $lanUrl = Get-LanUrl -TargetPort $Port
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "  LINK PUBLIC CUA BAN:" -ForegroundColor Green
    Write-Host "  $url" -ForegroundColor Cyan
    if ($lanUrl) {
        Write-Host ""
        Write-Host "  LINK CHO NGUOI CUNG WI-FI:" -ForegroundColor Green
        Write-Host "  $lanUrl" -ForegroundColor Cyan
    }
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Giu cua so nay de link tiep tuc hoat dong." -ForegroundColor Yellow
    Write-Host "Nhan Ctrl+C de tat tunnel va backend." -ForegroundColor Yellow
    try {
        Set-Clipboard -Value $url -ErrorAction SilentlyContinue
        Write-Host "Link public da duoc copy vao clipboard." -ForegroundColor Green
    } catch {
        # Clipboard is optional.
    }

    if ($defaultDnsReady) {
        Start-Process $url
    } else {
        Write-Host "Trinh duyet khong tu mo vi DNS may nay van loi. Hay dung link da copy tren thiet bi khac." -ForegroundColor Yellow
    }

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
