$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -match 'Zihan Fakir' } | Select-Object -First 1
if ($cert) {
    Write-Host "Found cert: $($cert.Thumbprint)"
    $cerPath = "$PSScriptRoot\zihan-fakir.cer"
    Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
    Write-Host "Exported to $cerPath"
    
    # Import into CurrentUser TrustedPublisher
    certutil -addstore -user TrustedPublisher $cerPath
    # Import into CurrentUser Root
    certutil -addstore -user Root $cerPath

    Remove-Item $cerPath -Force -ErrorAction SilentlyContinue
    Write-Host "Finished trusting certificate."
} else {
    Write-Warning "Cert not found"
}
