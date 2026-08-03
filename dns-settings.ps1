param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Fix', 'Reset')]
    [string]$Action,

    [string]$HostName
)

$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    $arguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`"",
        '-Action', $Action
    )
    if ($HostName) {
        $arguments += @('-HostName', $HostName)
    }

    try {
        $elevated = Start-Process `
            -FilePath 'powershell.exe' `
            -ArgumentList $arguments `
            -Verb RunAs `
            -Wait `
            -PassThru
        exit $elevated.ExitCode
    } catch {
        Write-Host "[DNS] Khong co quyen Administrator hoac UAC da bi huy." -ForegroundColor Red
        exit 1
    }
}

try {
    $activeConnections = @(
        Get-NetIPConfiguration |
            Where-Object {
                $_.NetAdapter.Status -eq 'Up' -and
                ($null -ne $_.IPv4DefaultGateway -or $null -ne $_.IPv6DefaultGateway)
            }
    )

    if ($activeConnections.Count -eq 0) {
        throw 'Khong tim thay ket noi mang dang hoat dong co default gateway.'
    }

    foreach ($connection in $activeConnections) {
        if ($Action -eq 'Fix') {
            $servers = @(
                '1.1.1.1',
                '1.0.0.1',
                '2606:4700:4700::1111',
                '2606:4700:4700::1001'
            )
            Set-DnsClientServerAddress `
                -InterfaceIndex $connection.InterfaceIndex `
                -ServerAddresses $servers
            Write-Host "[DNS] $($connection.InterfaceAlias): da doi sang Cloudflare DNS." -ForegroundColor Green
        } else {
            Set-DnsClientServerAddress `
                -InterfaceIndex $connection.InterfaceIndex `
                -ResetServerAddresses
            Write-Host "[DNS] $($connection.InterfaceAlias): da khoi phuc DNS tu dong (DHCP)." -ForegroundColor Green
        }
    }

    Clear-DnsClientCache

    if ($Action -eq 'Fix' -and $HostName) {
        $resolved = Resolve-DnsName `
            -Name $HostName `
            -Type A `
            -DnsOnly `
            -ErrorAction Stop
        if (@($resolved | Where-Object { $_.IPAddress }).Count -eq 0) {
            throw "DNS moi chua phan giai duoc $HostName."
        }
        Write-Host "[DNS] Da phan giai duoc $HostName." -ForegroundColor Green
    }

    exit 0
} catch {
    Write-Host "[DNS] Loi: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
