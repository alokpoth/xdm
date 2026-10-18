$cert = Get-Item "Cert:\CurrentUser\My\0E178C57ACDCC365A317CED4AAE07E9B577D38DA"
Export-Certificate -Cert $cert -FilePath "build\zihan-fakir.cer" -Force
certutil -addstore -user TrustedPublisher "build\zihan-fakir.cer"
Write-Host "Certificate exported and registered into user TrustedPublisher!"
