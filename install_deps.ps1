$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
npm install ws 2>&1
Write-Output "DONE"
