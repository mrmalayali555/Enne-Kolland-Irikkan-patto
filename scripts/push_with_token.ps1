<#
PowerShell helper to push current branch to a GitHub repo using a short-lived token.
Usage (run locally, do NOT share the token):

$env:GHTOKEN = "ghp_..."    # set your token in this PowerShell session
.
./scripts/push_with_token.ps1 -RepoUrl "https://github.com/mrmalayali555/Kadathi-vidano.git" -Branch main

The script will use the token only for the single push command and will not write the token to disk.
After pushing, revoke the token in GitHub settings.
#>
param(
  [Parameter(Mandatory=$true)][string]$RepoUrl,
  [string]$Branch = "main"
)

if (-not $env:GHTOKEN) {
  Write-Error "Environment variable GHTOKEN not set. Set it in this session: `$env:GHTOKEN='ghp_...'<enter>"
  exit 2
}

$token = $env:GHTOKEN.Trim()
# Construct push URL with token embedded (not saved to git config)
# Note: token will be visible in process list while running this command on some systems.
$pushUrl = $RepoUrl -replace '^https://', "https://$token@"

try {
  Write-Host "Pushing current branch to $RepoUrl (remote push via temporary token) ..."
  git rev-parse --abbrev-ref HEAD
  $branchLocal = (git rev-parse --abbrev-ref HEAD).Trim()
  if (-not $branchLocal) { $branchLocal = $Branch }

  & git push $pushUrl $branchLocal:$Branch --set-upstream
  if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE)" }
  Write-Host "Push completed successfully. Remember to revoke the token in GitHub."]
} catch {
  Write-Error "Push failed: $_"
  exit 3
}
