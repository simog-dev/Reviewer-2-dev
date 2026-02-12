# Code Signing Guide

This document explains code signing for Reviewer 2, including self-signed certificates (free) and commercial certificates (paid).

## Table of Contents

- [Why Code Signing?](#why-code-signing)
- [Self-Signed vs Commercial](#self-signed-vs-commercial)
- [Windows Code Signing](#windows-code-signing)
- [macOS Code Signing](#macos-code-signing)
- [Linux Code Signing](#linux-code-signing)
- [GitHub Secrets Configuration](#github-secrets-configuration)
- [Verifying Signatures](#verifying-signatures)
- [User Experience](#user-experience)
- [Upgrading to Commercial Certificates](#upgrading-to-commercial-certificates)
- [Troubleshooting](#troubleshooting)

## Why Code Signing?

Code signing serves three primary purposes:

1. **Identity Verification:** Proves the app comes from a verified developer
2. **Integrity Check:** Ensures the app hasn't been tampered with since signing
3. **User Trust:** Reduces or eliminates security warnings during installation

**Without code signing:**
- Windows: "Unknown Publisher" warnings, may be blocked entirely
- macOS: "Unidentified Developer" warnings, app won't open by default
- Auto-update: Will not work reliably on either platform

## Self-Signed vs Commercial

### Self-Signed Certificates (Free)

**Pros:**
- ✅ Free
- ✅ Quick setup (5-10 minutes)
- ✅ Good for testing and initial distribution
- ✅ Works with electron-builder
- ✅ No recurring costs

**Cons:**
- ❌ Windows SmartScreen warnings ("Windows protected your PC")
- ❌ macOS Gatekeeper warnings ("Unidentified Developer")
- ❌ No auto-update on macOS (requires notarization)
- ❌ Users must take extra steps to install
- ❌ Less professional appearance

**Best for:**
- Personal projects
- Open source distribution with technical users
- Testing and development
- Pre-launch phase

### Commercial Certificates (Paid)

**Pros:**
- ✅ No security warnings (after trust is established)
- ✅ Professional appearance
- ✅ Auto-update works fully on both platforms
- ✅ Instant user trust
- ✅ Better for commercial distribution

**Cons:**
- ❌ Costs $99-500/year
- ❌ Requires verification (2-7 days for Windows)
- ❌ Annual renewal required
- ❌ macOS requires Apple Developer account ($99/year)

**Best for:**
- Commercial applications
- Wide public distribution
- Professional/enterprise users
- Revenue-generating apps

## Windows Code Signing

### Option 1: Self-Signed Certificate (Free)

Our project includes a PowerShell script that automates self-signed certificate creation.

#### Prerequisites

- Windows 10/11
- PowerShell 5.1 or later
- Administrator privileges

#### Generate Certificate

1. **Open PowerShell as Administrator:**
   - Right-click PowerShell → "Run as Administrator"

2. **Run the certificate generation script:**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
   cd C:\path\to\reviewer
   .\scripts\generate-certificates-win.ps1
   ```

3. **Enter certificate password:**
   - Choose a strong password (min 8 characters)
   - Save this password securely - you'll need it for GitHub Secrets

4. **Certificate created:**
   - Location: `build/certs/certificate.pfx`
   - Base64 version copied to clipboard
   - Valid for 5 years

#### What the Script Does

1. Creates self-signed code signing certificate using `New-SelfSignedCertificate`
2. Subject: `CN=Reviewer2, O=Reviewer2, C=US`
3. Exports to PFX format with password protection
4. Generates base64 encoding for GitHub Secrets
5. Installs certificate in Windows certificate store

#### Manual Certificate Creation (Alternative)

If the script doesn't work:

```powershell
# Create certificate
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=Reviewer2, O=Reviewer2, C=US" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5)

# Export to PFX
$password = ConvertTo-SecureString -String "YourPassword123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert `
    -FilePath "build\certs\certificate.pfx" `
    -Password $password

# Generate base64 for GitHub Secret
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("build\certs\certificate.pfx"))
$base64 | Set-Clipboard
```

#### User Experience with Self-Signed (Windows)

**Installation Process:**
1. User downloads `Reviewer-2-Setup-*.exe`
2. Runs installer
3. **Windows SmartScreen appears:** "Windows protected your PC"
4. User must click "More info" → "Run anyway"
5. Installation proceeds normally

**Why SmartScreen Triggers:**
- Certificate not from trusted CA
- App doesn't have enough "reputation"
- Microsoft tracks installation count

**Building Reputation:**
- After 5-10 installations globally, warnings may reduce
- Can take weeks to build reputation
- Reputation tied to certificate and domain

### Option 2: Commercial Certificate (Paid)

#### Purchase Certificate

**Recommended Providers:**
- **DigiCert** (~$500/year) - Most trusted, instant validation
- **Sectigo** (~$200/year) - Good balance of price/trust
- **Certum** (~$150/year) - Budget option, longer validation

**What you need:**
- Business entity (LLC, Corporation) OR
- Individual identity verification (passport, driver's license)
- Email verification
- Phone verification

#### Setup Process

1. **Purchase certificate:**
   - Choose "Code Signing Certificate"
   - Complete verification (2-7 business days)
   - Receive certificate file (.pfx or .p12)

2. **Install certificate:**
   ```powershell
   # Import PFX
   Import-PfxCertificate -FilePath "certificate.pfx" `
       -CertStoreLocation "Cert:\CurrentUser\My" `
       -Password (ConvertTo-SecureString -String "password" -AsPlainText -Force)
   ```

3. **Update package.json:**
   ```json
   {
     "build": {
       "win": {
         "certificateSubjectName": "Your Company Name, Inc."
       }
     }
   }
   ```

4. **Add to GitHub Secrets:**
   - Same process as self-signed
   - Base64 encode the commercial certificate
   - Add as `WIN_CSC_LINK`

#### Extended Validation (EV) Certificates

**Higher tier:** $300-500/year

**Benefits:**
- **Instant SmartScreen reputation**
- No warnings from day one
- Higher trust level
- Required for kernel drivers

**Drawbacks:**
- Requires hardware token (USB stick)
- More expensive
- Longer validation process
- Token must be present for signing

**For most apps:** Standard certificate is sufficient. EV is overkill unless distributing to enterprise.

## macOS Code Signing

### Option 1: Self-Signed Certificate (Free)

Our project includes a Bash script for self-signed certificate generation.

#### Prerequisites

- macOS 10.15 or later
- Terminal access
- OpenSSL (pre-installed on macOS)

#### Generate Certificate

1. **Open Terminal**

2. **Run the certificate generation script:**
   ```bash
   cd /path/to/reviewer
   chmod +x scripts/generate-certificates-mac.sh
   ./scripts/generate-certificates-mac.sh
   ```

3. **Enter certificate password:**
   - Choose a strong password (min 8 characters)
   - Save this password for GitHub Secrets

4. **Certificate created:**
   - Location: `build/certs/certificate.p12`
   - Base64 version copied to clipboard
   - Valid for 5 years
   - Installed in temporary keychain

#### What the Script Does

1. Creates temporary keychain (`reviewer2-build.keychain`)
2. Generates RSA key pair (2048-bit)
3. Creates self-signed certificate using OpenSSL
4. Exports to PKCS12 (.p12) format
5. Imports to keychain with codesign access
6. Generates base64 for GitHub Secrets

#### Manual Certificate Creation (Alternative)

```bash
# Generate private key
openssl genrsa -out certificate.key 2048

# Create certificate request
openssl req -new -key certificate.key \
    -out certificate.csr \
    -subj "/CN=Reviewer2 Developer/O=Reviewer2/C=US"

# Self-sign certificate (5 years)
openssl x509 -req -days 1825 \
    -in certificate.csr \
    -signkey certificate.key \
    -out certificate.crt

# Export to PKCS12
openssl pkcs12 -export \
    -out certificate.p12 \
    -inkey certificate.key \
    -in certificate.crt \
    -password pass:YourPassword123

# Generate base64
base64 -i certificate.p12 | pbcopy
```

#### User Experience with Self-Signed (macOS)

**First Launch:**
1. User downloads `Reviewer-2-*.dmg`
2. Opens DMG and drags app to Applications
3. Double-clicks app
4. **Gatekeeper blocks:** "App cannot be opened because it is from an unidentified developer"
5. User must **right-click → Open** (or use workaround below)
6. Click "Open" in confirmation dialog
7. App launches

**Subsequent Launches:**
- Normal double-click works
- Gatekeeper remembers user approval

**Workaround (Power Users):**
```bash
xattr -cr "/Applications/Reviewer 2.app"
```

This removes the quarantine flag, allowing normal launch.

#### Limitations

**Auto-Update Does NOT Work:**
- Self-signed apps cannot auto-update on macOS
- Requires Apple notarization (paid Apple Developer account)
- Users must manually download new versions

### Option 2: Apple Developer Certificate (Paid)

#### Prerequisites

1. **Apple Developer Account:** $99/year
   - Sign up: https://developer.apple.com/programs/

2. **Mac with Xcode installed**

3. **App-specific password** for notarization

#### Setup Process

1. **Join Apple Developer Program:**
   - Sign up at developer.apple.com
   - Pay $99/year
   - Wait for approval (1-2 days)

2. **Create Developer ID Certificate:**
   ```bash
   # Open Xcode
   # Xcode → Preferences → Accounts
   # Click "+" → Add Apple ID
   # Click "Manage Certificates"
   # Click "+" → "Developer ID Application"
   ```

   Or use command line:
   ```bash
   # Request certificate
   security create-keypair -a your.appleid@example.com

   # Download from developer.apple.com
   # Install by double-clicking
   ```

3. **Update package.json:**
   ```json
   {
     "build": {
       "mac": {
         "identity": "Developer ID Application: Your Name (TEAM_ID)"
       }
     }
   }
   ```

4. **Export certificate for GitHub:**
   ```bash
   # Export from Keychain Access
   # File → Export Items
   # Save as .p12 with password

   # Base64 encode
   base64 -i certificate.p12 | pbcopy
   ```

#### Notarization

**Required for auto-update on macOS.**

1. **Create app-specific password:**
   - Go to appleid.apple.com
   - Sign in → Security → App-Specific Passwords
   - Generate password for "electron-builder"

2. **Add to GitHub Secrets:**
   - `APPLE_ID` - Your Apple ID email
   - `APPLE_ID_PASSWORD` - App-specific password
   - `APPLE_TEAM_ID` - Your team ID (from developer account)

3. **Update workflow:**
   ```yaml
   - name: Build and notarize macOS
     env:
       APPLE_ID: ${{ secrets.APPLE_ID }}
       APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
       APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
     run: npm run build:mac
   ```

4. **electron-builder handles notarization automatically**

**Notarization Process:**
- App uploaded to Apple servers (~5-30 minutes)
- Apple scans for malware
- Returns "notarization ticket"
- Ticket stapled to app
- Gatekeeper allows launch without warnings

## Linux Code Signing

**Good news:** Linux does not require code signing for distribution.

**AppImage:**
- No signing required
- Users can verify with checksums
- PGP signatures optional but rarely used

**Deb packages:**
- Can be signed with GPG
- Not required for installation
- Useful for package repositories

**Snap/Flatpak:**
- Signature handled by store (snapcraft.io, flathub.org)

## GitHub Secrets Configuration

All secrets are stored encrypted in GitHub.

### Navigate to Secrets

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions**
4. Click **New repository secret**

### Required Secrets

#### Windows

**Secret Name:** `WIN_CSC_LINK`
- **Value:** Base64-encoded certificate (.pfx file)
- **How to get:** Run `generate-certificates-win.ps1` script
- **Never commit** the actual .pfx file!

**Secret Name:** `WIN_CSC_KEY_PASSWORD`
- **Value:** Password you used when creating the certificate
- **Plain text password** (GitHub encrypts it)

#### macOS

**Secret Name:** `MAC_CSC_LINK`
- **Value:** Base64-encoded certificate (.p12 file)
- **How to get:** Run `generate-certificates-mac.sh` script
- **Never commit** the actual .p12 file!

**Secret Name:** `MAC_CSC_KEY_PASSWORD`
- **Value:** Password you used when creating the certificate
- **Plain text password**

#### Optional (Apple Developer)

**Secret Name:** `APPLE_ID`
- **Value:** Your Apple ID email
- **Required for:** Notarization

**Secret Name:** `APPLE_ID_PASSWORD`
- **Value:** App-specific password from appleid.apple.com
- **Required for:** Notarization

**Secret Name:** `APPLE_TEAM_ID`
- **Value:** Team ID from Apple Developer account (10 characters)
- **Required for:** Notarization

### Security Best Practices

- ✅ **NEVER** commit certificates to Git
- ✅ Add `*.pfx`, `*.p12`, `build/certs/` to `.gitignore`
- ✅ Use strong passwords (min 12 characters)
- ✅ Rotate certificates before expiration
- ✅ Store backup of certificates securely (password manager, encrypted drive)
- ❌ **NEVER** share certificate passwords in plaintext
- ❌ **NEVER** push certificates to public repositories

## Verifying Signatures

### Windows

**Check if file is signed:**
```powershell
Get-AuthenticodeSignature "Reviewer-2-Setup-*.exe"
```

**Expected output:**
```
SignerCertificate      : [Certificate details]
TimeStamperCertificate :
Status                 : Valid
```

**Detailed verification:**
```powershell
signtool verify /pa "Reviewer-2-Setup-*.exe"
```

**View signature in UI:**
- Right-click .exe → Properties → Digital Signatures tab

### macOS

**Check if app is signed:**
```bash
codesign -dv "/Applications/Reviewer 2.app"
```

**Expected output:**
```
Executable=/Applications/Reviewer 2.app/Contents/MacOS/Reviewer2
Identifier=com.reviewer2.app
Format=app bundle with Mach-O universal (x86_64 arm64)
CodeDirectory v=20500 size=... flags=0x10000(runtime) hashes=...
Signature size=...
Signed Time=...
```

**Verify signature validity:**
```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Reviewer 2.app"
```

**Expected output:**
```
/Applications/Reviewer 2.app: valid on disk
/Applications/Reviewer 2.app: satisfies its Designated Requirement
```

**Check notarization (Apple Developer only):**
```bash
spctl -a -vv "/Applications/Reviewer 2.app"
```

## User Experience

### Windows Experience Comparison

**Self-Signed:**
1. Download .exe
2. Run installer
3. **SmartScreen warning:** "Windows protected your PC"
4. Click "More info"
5. Click "Run anyway"
6. Installation proceeds

**Commercial Certificate:**
1. Download .exe
2. Run installer
3. **No warnings** (after reputation built)
4. Installation proceeds

### macOS Experience Comparison

**Self-Signed:**
1. Download .dmg
2. Open and drag to Applications
3. Double-click app
4. **Gatekeeper warning:** "Cannot be opened"
5. Right-click → Open
6. Click "Open" button
7. App launches

**Apple Developer:**
1. Download .dmg
2. Open and drag to Applications
3. Double-click app
4. **No warnings**
5. App launches immediately

## Upgrading to Commercial Certificates

### When to Upgrade

Consider upgrading when:
- ✅ 50+ active users
- ✅ Generating revenue
- ✅ Enterprise customers
- ✅ Professional/commercial distribution
- ✅ Want zero-friction installation
- ✅ Need auto-update on macOS

### Migration Process

1. **Purchase certificates** (see above)
2. **Install certificates locally**
3. **Test signing locally:**
   ```bash
   npm run build
   # Install and verify
   ```
4. **Update GitHub Secrets:**
   - Replace `WIN_CSC_LINK` with commercial cert
   - Replace `MAC_CSC_LINK` with Apple Developer cert
   - Add Apple notarization secrets (if applicable)
5. **Create new release:**
   ```bash
   git tag -a v1.1.0 -m "First release with commercial signing"
   git push origin v1.1.0
   ```
6. **Verify no warnings during installation**
7. **Test auto-update flow**

### Cost Summary

**Free (Self-Signed):**
- $0/year
- Manual user workarounds required

**Windows Only (Commercial):**
- $150-500/year
- Zero Windows warnings
- macOS still has warnings

**Full Commercial (Windows + macOS):**
- $250-600/year total
  - Windows: $150-500/year
  - macOS: $99/year (Apple Developer)
- Zero warnings on both platforms
- Auto-update fully supported

## Troubleshooting

### Windows Issues

**Problem:** "Certificate not found" during build

**Solution:**
```powershell
# Check certificate is in store
Get-ChildItem Cert:\CurrentUser\My | Where-Object {$_.Subject -like "*Reviewer2*"}

# Re-import if missing
Import-PfxCertificate -FilePath "build\certs\certificate.pfx" `
    -CertStoreLocation "Cert:\CurrentUser\My"
```

**Problem:** "SignTool Error: No certificates were found"

**Solution:**
- Verify `CSC_LINK` path is correct
- Check `CSC_KEY_PASSWORD` is set
- Ensure certificate hasn't expired

**Problem:** SmartScreen still triggers after many installs

**Solution:**
- Building reputation takes time (weeks/months)
- Consider upgrading to commercial certificate
- Or Extended Validation (EV) certificate for instant reputation

### macOS Issues

**Problem:** "codesign failed with exit code 1"

**Solution:**
```bash
# Check keychain is unlocked
security unlock-keychain reviewer2-build.keychain

# List available identities
security find-identity -v -p codesigning

# Verify certificate is valid
openssl x509 -in build/certs/certificate.crt -noout -dates
```

**Problem:** "No identity found" during build

**Solution:**
- Ensure certificate imported to keychain
- Unlock keychain before building
- Check certificate hasn't expired

**Problem:** Auto-update not working on macOS

**Expected:** Self-signed certificates do not support auto-update on macOS. This requires:
1. Apple Developer account ($99/year)
2. Notarization
3. Valid Developer ID certificate

**Workaround:** Users must download updates manually from GitHub Releases.

### GitHub Actions Issues

**Problem:** Certificate decode fails in workflow

**Solution:**
- Verify base64 string is complete (no truncation)
- Check for line breaks in base64 (remove them)
- Re-encode and update secret:
  ```powershell
  # Windows
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Set-Clipboard

  # macOS
  base64 -i certificate.p12 | pbcopy
  ```

## Additional Resources

- [Microsoft Code Signing Docs](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
- [Apple Developer Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Sectigo Code Signing](https://sectigo.com/ssl-certificates-tls/code-signing)
- [DigiCert Code Signing](https://www.digicert.com/signing/code-signing-certificates)

## Support

For code signing issues:
- Check TROUBLESHOOTING.md
- Review GitHub Actions logs
- Open issue: https://github.com/YOUR_USERNAME/reviewer/issues
