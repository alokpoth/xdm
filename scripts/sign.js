const { execFileSync } = require('child_process');
const fs = require('fs');

exports.default = async function sign(configuration) {
  const filePath = configuration.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  const psScript = `
    $cert = Get-Item "Cert:\\CurrentUser\\My\\0E178C57ACDCC365A317CED4AAE07E9B577D38DA" -ErrorAction SilentlyContinue
    if (-not $cert) {
      $cert = Get-ChildItem Cert:\\CurrentUser\\My -CodeSigningCert | Where-Object { $_.Subject -match 'Zihan Fakir' -and $_.Subject -match 'zihan.uk' } | Select-Object -First 1
    }
    if (-not $cert) {
      $cert = Get-ChildItem Cert:\\CurrentUser\\My -CodeSigningCert | Select-Object -First 1
    }
    if (-not $cert) {
      Write-Host "[win.sign] No code signing certificate found; skipping."
      exit 0
    }
    $f = '${filePath.replace(/'/g, "''")}'
    $sig = $null
    try {
      $sig = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -TimestampServer "http://timestamp.digicert.com" -HashAlgorithm SHA256 -ErrorAction SilentlyContinue
    } catch {}
    if (-not $sig -or $sig.Status -ne 'Valid') {
      $sig = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -HashAlgorithm SHA256
    }
    Write-Host "[win.sign] Signed $(Split-Path $f -Leaf): $($sig.Status)"
  `;

  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
      stdio: 'inherit'
    });
  } catch (err) {
    console.warn(`[win.sign] Warning signing ${filePath}:`, err.message);
  }
};
