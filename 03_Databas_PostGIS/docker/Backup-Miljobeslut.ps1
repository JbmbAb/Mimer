$ErrorActionPreference = "Stop"
$container = "miljobeslut-postgis-live"
$db = "miljobeslut"
$user = "miljobeslut"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupRoot = Join-Path $here "..\backups"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpName = "miljobeslut_${ts}.dump"
$dumpContainer = "/tmp/$dumpName"
$dumpHost = Join-Path $backupRoot $dumpName

$names = @(docker ps --filter "name=$container" --format "{{.Names}}")
if ($names -notcontains $container) {
  throw "Docker-container '$container' kors inte."
}

Write-Host "Skapar custom-format dump i container..."
docker exec $container pg_dump -U $user -Fc -d $db -f $dumpContainer
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump misslyckades."
}

Write-Host "Kopierar till $dumpHost"
docker cp "${container}:${dumpContainer}" $dumpHost
docker exec $container rm -f $dumpContainer
Write-Host "Klar: $dumpHost"
