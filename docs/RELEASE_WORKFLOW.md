# Release Workflow Guide

This document describes the complete process for releasing new versions of Reviewer 2.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Semantic Versioning](#semantic-versioning)
- [Release Process](#release-process)
- [Verifying Releases](#verifying-releases)
- [Rollback Procedure](#rollback-procedure)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Prerequisites

Before creating a release, ensure:

1. **GitHub repository is set up:**
   - Public repository exists
   - GitHub Actions enabled
   - Secrets configured (WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD, MAC_CSC_LINK, MAC_CSC_KEY_PASSWORD)

2. **Code signing certificates generated:**
   - Windows: Run `scripts/generate-certificates-win.ps1`
   - macOS: Run `scripts/generate-certificates-mac.sh`
   - Certificates uploaded to GitHub Secrets

3. **All tests passing:**
   ```bash
   npm test
   ```

4. **Local build successful:**
   ```bash
   npm run rebuild
   npm run build
   ```

5. **Changes committed and pushed:**
   ```bash
   git status  # Should show clean working tree
   ```

## Semantic Versioning

Reviewer 2 follows [Semantic Versioning](https://semver.org/) (SemVer):

**Format:** `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

### Version Increment Rules

**PATCH** version (`1.0.0` → `1.0.1`):
- Bug fixes
- Performance improvements
- Documentation updates
- Minor UI tweaks
- Security patches

**Examples:**
- Fix crash when opening large PDFs
- Improve annotation rendering performance
- Fix typo in error message

**MINOR** version (`1.0.0` → `1.1.0`):
- New features (backward compatible)
- New functionality
- Significant enhancements to existing features
- Deprecations (with backward compatibility)

**Examples:**
- Add export to CSV format
- Add keyboard shortcuts for annotations
- Add bulk annotation editing

**MAJOR** version (`1.0.0` → `2.0.0`):
- Breaking changes
- Database schema changes (requiring migration)
- Removed features
- Complete UI redesign
- Incompatible API changes

**Examples:**
- Change database structure (old annotations incompatible)
- Remove deprecated features
- Complete rewrite of annotation system

### Pre-release Versions

For alpha/beta releases:
- `1.0.0-alpha.1` - Alpha release
- `1.0.0-beta.1` - Beta release
- `1.0.0-rc.1` - Release candidate

## Release Process

### Step 1: Update Version Number

Edit `package.json`:

```json
{
  "version": "1.0.2"
}
```

**Important:** Only update the version number, do not modify other fields unless necessary.

### Step 2: Update Changelog (Optional but Recommended)

If you maintain a `CHANGELOG.md`, update it:

```markdown
## [1.0.2] - 2026-02-11

### Fixed
- Fixed crash when highlighting text across multiple pages
- Improved PDF rendering performance on retina displays

### Changed
- Updated PDF.js to v4.9.155
```

### Step 3: Commit Version Bump

```bash
git add package.json CHANGELOG.md  # Add CHANGELOG.md if it exists
git commit -m "Bump version to 1.0.2"
```

**Commit message format:**
- Use imperative mood: "Bump version" not "Bumped version"
- Include full version number

### Step 4: Create Git Tag

```bash
git tag -a v1.0.2 -m "Release version 1.0.2"
```

**Tag naming:**
- Always prefix with `v` (e.g., `v1.0.2`, not `1.0.2`)
- Use annotated tags (`-a`) not lightweight tags
- Include descriptive message (`-m`)

**For more detailed tag messages:**
```bash
git tag -a v1.0.2 -m "Release version 1.0.2

- Fixed text highlighting crash
- Improved performance
- Updated dependencies"
```

### Step 5: Push Changes and Tag

```bash
# Push commit to main branch
git push origin main

# Push tag (this triggers GitHub Actions)
git push origin v1.0.2
```

**Important:** Push the tag **after** pushing the commit to ensure the tag references the correct commit.

**Alternative (push everything at once):**
```bash
git push origin main --tags
```

### Step 6: Monitor GitHub Actions

1. Go to GitHub repository → **Actions** tab
2. Find workflow: "Build and Release"
3. Click on the running workflow
4. Monitor the three jobs:
   - `build-windows` (~10-15 minutes)
   - `build-macos` (~10-15 minutes)
   - `create-release` (~2-3 minutes, runs after builds complete)

**What to watch for:**
- ✅ Green checkmarks = success
- ❌ Red X = failure (see [Troubleshooting](#troubleshooting))
- ⚪ Gray circle = queued/in progress

### Step 7: Verify Release

Once workflow completes:

1. **Go to Releases page:**
   - Navigate to: `https://github.com/YOUR_USERNAME/reviewer/releases`
   - Verify new release appears at top

2. **Check release artifacts:**
   - `Reviewer-2-Setup-*.exe` (Windows installer)
   - `Reviewer-2-*.dmg` (macOS disk image)
   - `Reviewer-2-*.zip` (macOS zip archive)
   - `latest.yml` (Windows auto-update metadata)
   - `latest-mac.yml` (macOS auto-update metadata)

3. **Verify metadata files:**
   ```bash
   # Download latest.yml and check contents
   curl -L https://github.com/YOUR_USERNAME/reviewer/releases/download/v1.0.2/latest.yml
   ```

   Should contain:
   ```yaml
   version: 1.0.2
   files:
     - url: Reviewer-2-Setup-1.0.2.exe
       sha512: [hash]
       size: [bytes]
   path: Reviewer-2-Setup-1.0.2.exe
   sha512: [hash]
   releaseDate: 2026-02-11T...
   ```

### Step 8: Test Installation

**Windows:**
1. Download `Reviewer-2-Setup-*.exe`
2. Run installer
3. Handle SmartScreen warning ("More info" → "Run anyway")
4. Verify app launches
5. Check version in app (if displayed)

**macOS:**
1. Download `Reviewer-2-*.dmg`
2. Open DMG and drag to Applications
3. Right-click → Open (first launch only)
4. Verify app launches
5. Check version

### Step 9: Test Auto-Update (Optional)

1. Install previous version (e.g., `v1.0.1`)
2. Launch app
3. Wait 3 seconds for update check
4. Verify update notification appears
5. Click "Download Update"
6. Verify progress bar shows download
7. Quit app and verify auto-install
8. Relaunch and verify version updated

**Note:** Auto-update on macOS requires Apple notarization (paid Apple Developer account). With self-signed certificates, users must download manually.

## Verifying Releases

### Checksum Verification

Verify file integrity using SHA-256 checksums:

**Windows (PowerShell):**
```powershell
Get-FileHash "Reviewer-2-Setup-1.0.2.exe" -Algorithm SHA256
```

**macOS/Linux:**
```bash
shasum -a 256 Reviewer-2-1.0.2.dmg
```

Compare output with checksums in release notes or `latest.yml`.

### Signature Verification

**Windows:**
```powershell
# Using signtool (Windows SDK required)
signtool verify /pa "Reviewer-2-Setup-1.0.2.exe"
```

Expected output:
```
Successfully verified: Reviewer-2-Setup-1.0.2.exe
```

**macOS:**
```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Reviewer 2.app"
```

Expected output:
```
/Applications/Reviewer 2.app: valid on disk
/Applications/Reviewer 2.app: satisfies its Designated Requirement
```

### Smoke Testing

After installation, perform basic functionality tests:

1. **Launch app** - Verify app opens without errors
2. **Open PDF** - Load a sample PDF document
3. **Create annotation** - Highlight text and add comment
4. **Filter annotations** - Test category filtering
5. **Export annotations** - Export to JSON/Markdown
6. **Close and reopen** - Verify data persists

## Rollback Procedure

If a release has critical issues:

### 1. Delete GitHub Release

**Via GitHub UI:**
1. Go to Releases page
2. Click on the problematic release
3. Click "Delete" button
4. Confirm deletion

**Via GitHub CLI:**
```bash
gh release delete v1.0.2 --yes
```

### 2. Delete Git Tag

```bash
# Delete local tag
git tag -d v1.0.2

# Delete remote tag
git push origin :refs/tags/v1.0.2
```

### 3. Revert Commit (if needed)

```bash
git revert HEAD
git push origin main
```

### 4. Notify Users

**Important:** Users who already downloaded the problematic version must:
- Uninstall the app
- Download and install the previous stable version manually
- Auto-update will **not** downgrade automatically

**Communication:**
- Post announcement in GitHub Discussions
- Update README with warning
- Create issue explaining the problem

### 5. Fix and Re-release

1. Fix the critical issue
2. Test thoroughly
3. Follow release process again with new patch version (e.g., `v1.0.3`)

## Troubleshooting

### Build Failures

**Problem:** `build-windows` or `build-macos` job fails

**Common Causes:**
1. **Native module rebuild failed**
   - Check Node.js version (must be 20)
   - Verify `better-sqlite3` compatible with Electron version

2. **Code signing failed**
   - Verify certificates uploaded to GitHub Secrets
   - Check certificate password is correct
   - Ensure certificate not expired

3. **Out of memory**
   - Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`

**Debugging:**
1. Click on failed job in GitHub Actions
2. Expand failed step
3. Read error messages
4. Fix issue locally
5. Create new tag (e.g., `v1.0.2-hotfix.1`)

### Release Creation Failed

**Problem:** `create-release` job fails

**Common Causes:**
1. **Missing artifacts** - Build jobs must complete successfully first
2. **Insufficient permissions** - Check GitHub Actions permissions
3. **Release already exists** - Delete existing release and retry

**Solution:**
```bash
# Delete release and tag
gh release delete v1.0.2 --yes
git tag -d v1.0.2
git push origin :refs/tags/v1.0.2

# Recreate tag and push
git tag -a v1.0.2 -m "Release version 1.0.2"
git push origin v1.0.2
```

### Auto-Update Not Working

**Problem:** Users not receiving update notifications

**Possible Causes:**
1. **Missing metadata files** - Check `latest.yml` and `latest-mac.yml` exist in release
2. **Wrong feed URL** - Verify `main.js` has correct GitHub owner/repo
3. **App in dev mode** - Auto-update disabled with `--dev` flag
4. **macOS notarization** - Auto-update requires notarization (not available with self-signed)

**Verify metadata file:**
```bash
curl -L https://github.com/YOUR_USERNAME/reviewer/releases/latest/download/latest.yml
```

## Best Practices

### Before Releasing

1. **Test locally:**
   ```bash
   npm test
   npm run build
   ```

2. **Test installation:**
   - Build and install locally
   - Run through smoke tests

3. **Review changes:**
   ```bash
   git log v1.0.1..HEAD --oneline
   ```

4. **Check for breaking changes:**
   - Database schema changes?
   - API changes?
   - Removed features?

### During Release

1. **Monitor GitHub Actions:**
   - Don't walk away until builds complete
   - Check for warnings or errors

2. **Verify artifacts:**
   - Download and test each platform
   - Check file sizes (should be ~150-200MB)

3. **Update documentation:**
   - Update README if needed
   - Update landing page version

### After Release

1. **Announce release:**
   - Post in GitHub Discussions
   - Update social media (if applicable)
   - Notify beta testers

2. **Monitor issues:**
   - Watch for new bug reports
   - Respond quickly to critical issues

3. **Plan next release:**
   - Create milestone for next version
   - Triage issues

### Release Frequency

**Recommended cadence:**
- **Patch releases:** As needed (critical bugs, security fixes)
- **Minor releases:** Every 2-4 weeks (new features)
- **Major releases:** Every 6-12 months (major changes)

**Exception:** Release immediately for:
- Security vulnerabilities
- Critical data loss bugs
- Crash bugs affecting >10% of users

## Version Management

### Hotfix Releases

For urgent fixes to production:

1. Create hotfix branch from tag:
   ```bash
   git checkout -b hotfix/1.0.2 v1.0.1
   ```

2. Make minimal fix
3. Bump patch version: `1.0.1` → `1.0.2`
4. Commit and tag
5. Push and create release
6. Merge hotfix back to main:
   ```bash
   git checkout main
   git merge hotfix/1.0.2
   git push origin main
   ```

### Pre-release Versions

For testing before stable release:

1. Tag with pre-release suffix:
   ```bash
   git tag -a v1.1.0-beta.1 -m "Beta release for v1.1.0"
   git push origin v1.1.0-beta.1
   ```

2. GitHub will mark as "Pre-release"
3. Users can opt-in to beta updates

## Release Checklist

Use this checklist for every release:

```markdown
- [ ] All tests passing locally
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated (if exists)
- [ ] Changes committed
- [ ] Git tag created (format: v1.0.2)
- [ ] Changes and tag pushed
- [ ] GitHub Actions workflow started
- [ ] build-windows completed successfully
- [ ] build-macos completed successfully
- [ ] create-release completed successfully
- [ ] Release visible on GitHub
- [ ] All artifacts present (.exe, .dmg, .zip, .yml)
- [ ] Windows installer tested
- [ ] macOS installer tested
- [ ] Auto-update tested (Windows only)
- [ ] Landing page version updated
- [ ] Release announced (if applicable)
```

## Additional Resources

- [Semantic Versioning](https://semver.org/)
- [GitHub Releases Documentation](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)

## Support

For questions or issues with the release process:
- Open an issue: https://github.com/YOUR_USERNAME/reviewer/issues
- Check TROUBLESHOOTING.md
- Review GitHub Actions logs
