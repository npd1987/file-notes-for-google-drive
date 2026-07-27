# Push the gating rules live.
#
# This is the only script in the project that changes what already-installed
# copies do, with no Chrome Web Store review in the way. It is therefore
# deliberately noisy: it shows the diff, warns on a live paywall, asks before
# pushing, and re-fetches the published URL afterwards to prove it landed.
#
#   .\admin\publish.ps1 -WhatIf     # show the diff, change nothing
#   .\admin\publish.ps1             # publish
#
# The config lives ALONE on the `config` branch of the extension's repo, sharing
# no history with `main`. raw.githubusercontent serves whatever that branch
# holds, live and unreviewed, so keeping it off `main` is what stops an ordinary
# code push from changing the paywall for every install.
#
# No setup needed. The working clone is created on first run.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Source = (Join-Path $PSScriptRoot 'gating.json'),
    [string]$WorkPath = (Join-Path $HOME '.file-notes-config'),
    [string]$Repo = 'https://github.com/npd1987/file-notes-for-google-drive.git',
    [string]$Branch = 'config',
    [string]$FileName = 'gating.json'
)

$ErrorActionPreference = 'Stop'

$RawUrl = "https://raw.githubusercontent.com/npd1987/file-notes-for-google-drive/$Branch/$FileName"

if (-not (Test-Path $Source)) {
    throw "No config at $Source. Export one from admin\config-editor.html first."
}

# Parse before pushing. A trailing comma here would leave every install falling
# back to the built-in defaults, silently, for as long as it took to notice.
try {
    $config = Get-Content $Source -Raw | ConvertFrom-Json
} catch {
    throw "$Source is not valid JSON: $($_.Exception.Message)"
}

# checkoutUrl is an override, not a requirement: empty means ExtensionPay. A
# non-https one is silently discarded by the extension, so catch it here instead.
if ($config.checkoutUrl -and -not $config.checkoutUrl.StartsWith('https://')) {
    throw "checkoutUrl must be https. Got: $($config.checkoutUrl)"
}

Write-Host "`nPublishing to $RawUrl" -ForegroundColor Cyan
Write-Host "  charging enabled : $($config.gateEnabled)"
Write-Host "  free accounts    : $($config.freeAccountLimit)"
Write-Host "  price label      : $($config.priceLabel)"
Write-Host "  checkout         : $(if ($config.checkoutUrl) { $config.checkoutUrl } else { 'ExtensionPay' })"

if ($config.gateEnabled) {
    Write-Warning "LIVE PAYWALL: real money. Everyone past $($config.freeAccountLimit) account(s) will be asked to pay."
}

# Clone on first run; otherwise hard-reset onto the remote so a half-finished
# edit from a previous session can never ride along with this one.
if (-not (Test-Path (Join-Path $WorkPath '.git'))) {
    Write-Host "`nCreating working clone at $WorkPath" -ForegroundColor Cyan
    git clone --quiet --branch $Branch --single-branch $Repo $WorkPath
    if ($LASTEXITCODE -ne 0) { throw "Clone failed. Is gh authenticated? Try: gh auth status" }
} else {
    git -C $WorkPath fetch --quiet origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "Fetch failed. Is gh authenticated? Try: gh auth status" }
    git -C $WorkPath reset --quiet --hard "origin/$Branch"
}

$target = Join-Path $WorkPath $FileName

if (Test-Path $target) {
    Write-Host "`nChanges:" -ForegroundColor Cyan
    $diff = Compare-Object (Get-Content $target) (Get-Content $Source)
    if ($diff) {
        $diff | Format-Table -AutoSize | Out-String | Write-Host
    } else {
        Write-Host '  (identical, nothing to publish)'
        return
    }
}

if ($PSCmdlet.ShouldProcess($RawUrl, 'commit and push')) {
    Copy-Item $Source $target -Force
    git -C $WorkPath add $FileName
    # Identity per-command rather than written to global config, and the noreply
    # address keeps a real email out of a public repo's history.
    git -C $WorkPath -c user.name="npd1987" -c user.email="npd1987@users.noreply.github.com" `
        commit --quiet -m "Gating: limit $($config.freeAccountLimit), enabled $($config.gateEnabled)"
    git -C $WorkPath push --quiet origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }

    # Prove it landed rather than assuming. raw.githubusercontent has a short CDN
    # cache, so a stale read here is possible and worth seeing rather than
    # trusting the push output alone.
    Write-Host "`nVerifying published file..." -ForegroundColor Cyan
    try {
        $live = Invoke-RestMethod -Uri "$RawUrl`?t=$([guid]::NewGuid())" -Headers @{ 'Cache-Control' = 'no-cache' }
        if ($live.gateEnabled -eq $config.gateEnabled -and $live.freeAccountLimit -eq $config.freeAccountLimit) {
            Write-Host "Published and confirmed live." -ForegroundColor Green
        } else {
            Write-Warning "Pushed, but the URL still serves older values. GitHub's CDN caches for a few minutes; re-check shortly."
        }
    } catch {
        Write-Warning "Pushed, but could not read $RawUrl back: $($_.Exception.Message)"
    }

    Write-Host "Installs pick this up within 24 hours, or immediately on browser restart."
}
