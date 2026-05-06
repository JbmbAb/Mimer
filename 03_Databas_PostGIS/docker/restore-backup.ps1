$ErrorActionPreference = "Stop"

$container = "miljobeslut-postgis-live"
$db = "miljobeslut"
$user = "miljobeslut"
$backup = Join-Path $PSScriptRoot "..\backups\backup_pre_migration.pg16.fixed.sql"
if (-not (Test-Path $backup)) {
  $backup = Join-Path $PSScriptRoot "..\backups\backup_pre_migration.sql"
}
$backup = (Resolve-Path $backup).Path

docker ps --filter "name=$container" --format "{{.Names}}" | Select-String -SimpleMatch $container | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Docker-container '$container' kor inte."
}

docker exec $container psql -U $user -d postgres -v ON_ERROR_STOP=1 -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres LOGIN SUPERUSER; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miljobeslut') THEN CREATE ROLE miljobeslut LOGIN; END IF; END `$`$;"

docker cp $backup "${container}:/tmp/backup_pre_migration_restore.sql"
docker exec $container psql -U $user -d $db -v ON_ERROR_STOP=1 -f /tmp/backup_pre_migration_restore.sql

docker exec $container psql -U $user -d $db -Atc "select schemaname || '.' || tablename from pg_tables where schemaname in ('env','core','stage','hydro') or (schemaname='public' and tablename not in ('spatial_ref_sys')) order by 1;"
