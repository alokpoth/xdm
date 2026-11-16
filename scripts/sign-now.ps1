$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -match 'Zihan Fakir' } | Select-Object -First 1
if (-not $cert) {
    $cert = Get-Item "Cert:\CurrentUser\My\0E178C57ACDCC365A317CED4AAE07E9B577D38DA" -ErrorAction SilentlyContinue
}
if (-not $cert) {
    Write-Warning "Code signing certificate for Zihan Fakir not found in Cert:\CurrentUser\My"
    exit 0
}
Write-Host "Using Certificate: $($cert.Subject) ($($cert.Thumbprint))"

$pkg = Get-Content -Raw -Path (Join-Path $PSScriptRoot "..\package.json") | ConvertFrom-Json
$ver = $pkg.version

$files = @(
    "release\XDM Turbo Setup $ver.exe",
    "release\XDM Turbo $ver.exe",
    "release\XDM.Turbo.Setup.$ver.exe",
    "release\XDM.Turbo.$ver.exe",
    "release\win-unpacked\XDM Turbo.exe"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "Signing $f ..."
        $sig = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com"
        Write-Host "  -> Result: $($sig.Status) ($($sig.StatusMessage))"
    }
}

Write-Host "`nVerifying signatures:"
foreach ($f in $files) {
    if (Test-Path $f) {
        $sig = Get-AuthenticodeSignature $f
        Write-Host "$f => Signer: $($sig.SignerCertificate.Subject) | Status: $($sig.Status)"
    }
}
