# scripts/release.ps1
# Release Sherpa: build installer, sync public repo, push to GitHub + GitVerse, create GitHub Release.
#
# Usage:
#   $env:SHERPA_DEV_BUILD=1; .\scripts\release.ps1
#
# Optional env vars:
#   GITHUB_TOKEN  -- skip interactive prompt
#   SKIP_BUILD    -- set to 1 to skip dist:win (use existing installer)

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SHERPA_UI     = "C:\Projects\sherpa-ui"
$SHERPA_PUBLIC = "C:\Projects\sherpa-public"
$GITHUB_REPO   = "Fa1qon/sherpa"

function Step($msg) { Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "   FAIL: $msg" -ForegroundColor Red; exit 1 }

# -- 0. GitHub token ----------------------------------------------------------

Step "GitHub token"
if (-not $env:GITHUB_TOKEN) {
    $env:GITHUB_TOKEN = Read-Host "Enter GitHub personal access token (repo scope)"
}
if (-not $env:GITHUB_TOKEN) { Fail "GITHUB_TOKEN is required" }
Ok "token set"

# -- 1. Read version ----------------------------------------------------------

Step "Reading version from package.json"
$pkg     = Get-Content "$SHERPA_UI\package.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$tag     = "v$version"
Ok "version = $version   tag = $tag"

# -- 2. Build installer -------------------------------------------------------

$installer = "$SHERPA_UI\out\Sherpa-$version-win-x64.exe"

if ($env:SKIP_BUILD -eq "1" -and (Test-Path $installer)) {
    Step "Skipping build (SKIP_BUILD=1), using existing installer"
    Ok $installer
} else {
    Step "Building Windows installer"
    Push-Location $SHERPA_UI
    $env:SHERPA_DEV_BUILD = "1"
    npm run dist:win
    if ($LASTEXITCODE -ne 0) { Fail "dist:win failed" }
    npm run rebuild:dev | Out-Null
    Pop-Location
    Ok "Build complete"
}

if (-not (Test-Path $installer)) { Fail "Installer not found: $installer" }
$sha256 = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLower()
$sizeMB = [math]::Round((Get-Item $installer).Length / 1MB, 1)
Ok "File: $([System.IO.Path]::GetFileName($installer))  ($sizeMB MB)"
Ok "SHA256: $sha256"

# -- 3. Sync public repo ------------------------------------------------------

Step "Syncing files to sherpa-public"
robocopy $SHERPA_UI $SHERPA_PUBLIC /E /NP /NFL /NDL `
    /XD .git .claude .sherpa-build .superpowers .sherpa out dist dist-electron node_modules undefined .playwright-cache playwright-report test-results `
    /XF CLAUDE.md BUILD_LOG.md sherpa_read_tmp.db sherpa_read_tmp.db-shm sherpa_read_tmp.db-wal "free-icon-mountain-4135890.png" "free-icon-mountain-4135908.png" "free-icon-mountain-9140319.png" "free-icon-mountain-9140335.png" | Out-Null

foreach ($p in @("$SHERPA_PUBLIC\docs\superpowers", "$SHERPA_PUBLIC\docs\feature-backlog.md", "$SHERPA_PUBLIC\docs\chat-ui-mockup.html")) {
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
Ok "Sync done"

# -- 4. Commit in public repo -------------------------------------------------

Step "Committing in sherpa-public"
Push-Location $SHERPA_PUBLIC
git add .
$dirty = git status --porcelain
if ($dirty) {
    git commit -m "release: $tag"
    Ok "Committed"
} else {
    Ok "Nothing new to commit"
}
Pop-Location

# -- 5. Push ------------------------------------------------------------------

Step "Pushing to GitHub"
Push-Location $SHERPA_PUBLIC
git push origin master
if ($LASTEXITCODE -ne 0) { Fail "Push to GitHub failed" }
Ok "GitHub pushed"

Step "Pushing to GitVerse"
git push gitverse master
if ($LASTEXITCODE -ne 0) { Fail "Push to GitVerse failed" }
Ok "GitVerse pushed"
Pop-Location

# -- 6. Create GitHub Release -------------------------------------------------

Step "Creating GitHub Release $tag"

$releaseBody = "## Sherpa $version`n`n### Installation`nDownload ``Sherpa-$version-win-x64.exe`` and run the installer.`n`n**Requirements:** Windows 10/11 x64, [Claude Code](https://claude.ai/code)`n`n### SHA-256`n``````````Sherpa-$version-win-x64.exe  $sha256``````````"

$releasePayload = @{
    tag_name         = $tag
    target_commitish = "master"
    name             = "Sherpa $version"
    body             = $releaseBody
    draft            = $false
    prerelease       = $false
} | ConvertTo-Json -Depth 5

$headers = @{
    Authorization  = "token $env:GITHUB_TOKEN"
    Accept         = "application/vnd.github+json"
    "Content-Type" = "application/json"
}

$release = $null
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_REPO/releases" -Method POST -Headers $headers -Body $releasePayload
    Ok "Release created: $($release.html_url)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 422) {
        Write-Host "   NOTE: Release $tag already exists, fetching it" -ForegroundColor Yellow
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$tag" -Headers $headers
        Ok "Using existing release: $($release.html_url)"
    } else {
        Fail "Failed to create release: $($_.Exception.Message)"
    }
}

# -- 7. Upload installer ------------------------------------------------------

Step "Uploading installer to GitHub Release"
$assetName = [System.IO.Path]::GetFileName($installer)
$uploadUrl = $release.upload_url -replace '\{.*\}', "?name=$assetName"

$uploadHeaders = @{
    Authorization  = "token $env:GITHUB_TOKEN"
    Accept         = "application/vnd.github+json"
    "Content-Type" = "application/octet-stream"
}

$bytes = [System.IO.File]::ReadAllBytes($installer)
try {
    $asset = Invoke-RestMethod -Uri $uploadUrl -Method POST -Headers $uploadHeaders -Body $bytes
    Ok "Uploaded: $($asset.browser_download_url)"
} catch {
    Fail "Failed to upload installer: $($_.Exception.Message)"
}

# -- Done ---------------------------------------------------------------------

Write-Host ""
Write-Host "Released: Sherpa $version" -ForegroundColor Green
Write-Host "GitHub:   https://github.com/$GITHUB_REPO/releases/tag/$tag" -ForegroundColor Green
Write-Host "GitVerse: https://gitverse.ru/fa1qon/sherpa" -ForegroundColor Green
