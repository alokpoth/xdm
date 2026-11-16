# Ensure Certificate for Zihan Fakir
$certSubject = "CN=Zihan Fakir, O=Zihan Fakir, OU=zihan.uk, C=BD"
$cert = Get-Item "Cert:\CurrentUser\My\0E178C57ACDCC365A317CED4AAE07E9B577D38DA" -ErrorAction SilentlyContinue
if (-not $cert) {
    $cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -match "CN=Zihan Fakir" -and $_.Subject -match "zihan.uk" } | Select-Object -First 1
}

if (-not $cert) {
    Write-Host "Creating trusted Code Signing Certificate for Zihan Fakir (zihan.uk)..."
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -HashAlgorithm SHA256 `
        -KeyExportPolicy Exportable `
        -NotAfter (Get-Date).AddYears(10)
    Write-Host "Certificate created with thumbprint: $($cert.Thumbprint)"
} else {
    Write-Host "Found existing Code Signing Certificate: $($cert.Thumbprint) ($($cert.Subject))"
}

# Read current version from package.json dynamically
$pkg = Get-Content -Raw -Path (Join-Path $PSScriptRoot "..\package.json") | ConvertFrom-Json
$ver = $pkg.version

# Files to sign
$filesToSign = @(
    "release\win-unpacked\XDM Turbo.exe",
    "release\win-unpacked\resources\elevate.exe",
    "release\XDM Turbo Setup $ver.exe",
    "release\XDM Turbo $ver.exe",
    "release\XDM.Turbo.Setup.$ver.exe",
    "release\XDM.Turbo.$ver.exe"
)

$timestampServer = "http://timestamp.digicert.com"

foreach ($file in $filesToSign) {
    if (Test-Path $file) {
        Write-Host "Signing $file as 'Zihan Fakir'..."
        try {
            $result = Set-AuthenticodeSignature -FilePath $file -Certificate $cert -TimestampServer $timestampServer -HashAlgorithm SHA256
            Write-Host "Status: $($result.Status) - $($result.StatusMessage)"
        } catch {
            Write-Host "Signing without timestamp fallback..."
            $result = Set-AuthenticodeSignature -FilePath $file -Certificate $cert -HashAlgorithm SHA256
            Write-Host "Status: $($result.Status) - $($result.StatusMessage)"
        }
    }
}

Write-Host "`nAuthenticode Signature check for installer:"
if (Test-Path "release\XDM Turbo Setup $ver.exe") {
    Get-AuthenticodeSignature "release\XDM Turbo Setup $ver.exe" | Format-List Path, Status, StatusMessage, SignerCertificate
}
