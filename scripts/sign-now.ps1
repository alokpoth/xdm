$cert = Get-Item "Cert:\CurrentUser\My\0E178C57ACDCC365A317CED4AAE07E9B577D38DA"
Write-Host "Using Certificate: $($cert.Subject) ($($cert.Thumbprint))"

$files = @(
    "release\XDM Turbo Setup 1.0.10.exe",
    "release\XDM Turbo 1.0.10.exe",
    "release\win-unpacked\XDM Turbo.exe"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "Signing $f ..."
        $sig = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -HashAlgorithm SHA256
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
