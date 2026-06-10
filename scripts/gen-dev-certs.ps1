# Generates the dev TLS cert/key used by the backend (HTTPS_ENABLED=true) and the
# CRA dev UI (client/.env SSL_CRT_FILE). Run once per machine — mkcert certs are
# signed by a per-machine local CA, so the committed dev-cert.pem will not be
# trusted on a different machine until you regenerate here.
#
# Usage:  pwsh scripts/gen-dev-certs.ps1 [extraHostOrIp ...]
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$mkcert = Join-Path $repo 'mkcert.exe'

# Install the local CA into the OS/browser trust store (idempotent).
& $mkcert -install

# Default SANs: loopback + this machine. Append any LAN IPs/hostnames as args.
$names = @('localhost', '127.0.0.1', '::1', $env:COMPUTERNAME) + $args | Where-Object { $_ }

Push-Location $repo
try {
    & $mkcert -cert-file dev-cert.pem -key-file dev-key.pem @names
    # scripts/ keeps its own copy for tooling that resolves certs relative to it.
    Copy-Item dev-cert.pem scripts/dev-cert.pem -Force
    Copy-Item dev-key.pem  scripts/dev-key.pem  -Force
    Write-Host "Dev certs regenerated and trusted. SANs: $($names -join ', ')"
}
finally {
    Pop-Location
}
