# PowerShell script to generate self-signed code signing certificate for Windows
# Run as Administrator: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
# Then: .\scripts\generate-certificates-win.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Reviewer 2 - Windows Certificate Generator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Prompt for certificate password
Write-Host "Enter a password for the certificate (min 8 characters):" -ForegroundColor Yellow
$password = Read-Host -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

if ($passwordPlain.Length -lt 8) {
    Write-Host "ERROR: Password must be at least 8 characters long" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Creating self-signed certificate..." -ForegroundColor Green

# Create self-signed certificate for code signing
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=Reviewer2, O=Reviewer2, C=US" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5) `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256

Write-Host "Certificate created with thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
Write-Host ""

# Ensure build/certs directory exists
$certsDir = "$PSScriptRoot\..\build\certs"
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir -Force | Out-Null
}

# Export certificate to PFX file
$certPath = "$certsDir\certificate.pfx"
Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $password | Out-Null

Write-Host "Certificate exported to: $certPath" -ForegroundColor Green
Write-Host ""

# Generate base64 for GitHub Secret
Write-Host "Generating base64 encoded certificate for GitHub Secret..." -ForegroundColor Yellow
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($certPath))

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Secrets Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to your GitHub repository" -ForegroundColor Yellow
Write-Host "2. Navigate to: Settings → Secrets and variables → Actions" -ForegroundColor Yellow
Write-Host "3. Click 'New repository secret'" -ForegroundColor Yellow
Write-Host ""
Write-Host "Create the following secrets:" -ForegroundColor White
Write-Host ""
Write-Host "Secret Name: WIN_CSC_LINK" -ForegroundColor Cyan
Write-Host "The base64 certificate has been copied to your clipboard!" -ForegroundColor Green
Write-Host "(If not, it's also saved to: $certsDir\certificate.pfx.base64)" -ForegroundColor Yellow

# Save base64 to file and copy to clipboard
$base64Path = "$certsDir\certificate.pfx.base64"
$base64 | Out-File -FilePath $base64Path -Encoding ASCII -NoNewline
$base64 | Set-Clipboard

Write-Host ""
Write-Host "Secret Name: WIN_CSC_KEY_PASSWORD" -ForegroundColor Cyan
Write-Host "Secret Value: $passwordPlain" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "IMPORTANT SECURITY NOTES" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ Certificate saved to: $certPath" -ForegroundColor Green
Write-Host "✗ NEVER commit this file to Git!" -ForegroundColor Red
Write-Host "✓ .gitignore already excludes *.pfx files" -ForegroundColor Green
Write-Host "✓ Only store base64 version in GitHub Secrets (encrypted)" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "User Experience Notes" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠ Users will see 'Windows protected your PC' warning" -ForegroundColor Yellow
Write-Host "⚠ They must click 'More info' → 'Run anyway'" -ForegroundColor Yellow
Write-Host "⚠ This is normal for self-signed certificates" -ForegroundColor Yellow
Write-Host ""
Write-Host "For production use, consider purchasing a commercial certificate:" -ForegroundColor White
Write-Host "- Sectigo/DigiCert: ~`$200-300/year" -ForegroundColor White
Write-Host "- Benefits: No warnings, instant trust, professional appearance" -ForegroundColor White
Write-Host ""
Write-Host "Certificate generation complete!" -ForegroundColor Green
