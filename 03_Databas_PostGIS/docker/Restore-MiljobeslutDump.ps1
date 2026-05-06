param(
  [Parameter(Mandatory = $true)]
  [string] $DumpPath
)
$ErrorActionPreference = "Stop"
$container = "miljobeslut-postgis-live"
$user = "miljobeslut"
$db = "miljobeslut"
$resolved = (Resolve-Path -LiteralPath $DumpPath).Path
$baseName = Split-Path $resolved -Leaf
$inContainer = "/tmp/$baseName"

$names = @(docker ps --filter "name=$container" --format "{{.Names}}")
if ($names -notcontains $container) {
  throw "Docker-container '$container' kors inte."
}

Write-Host "STOPPA skrivande klienter (Prisma dev, appar). Fortsatter om 5 s..."
Start-Sleep -Seconds 5

docker cp $resolved "${container}:${inContainer}"
try {
  Write-Host "Droppar och aterskapar databasen $db fran dump (forstor nuvarande innehall)..."
  docker exec $container psql -U $user -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();"
  docker exec $container psql -U $user -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $db;"
  docker exec $container psql -U $user -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db OWNER $user;"
  docker exec $container pg_restore -U $user -d $db --no-owner --role=$user -v $inContainer
  $exit = $LASTEXITCODE
  if ($exit -ne 0 -and $exit -ne 1) {
    throw "pg_restore slutade med kod $exit (1 kan vara varningar)."
  }
}
finally {
  docker exec $container rm -f $inContainer
}
Write-Host "Aterstallning klar. Kor prisma migrate status i Miljobeslut-repot."
