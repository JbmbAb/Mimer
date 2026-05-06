# Startar PostGIS med pgdata intill detta skript (...\03_Databas_PostGIS\docker\pgdata_live).
# Rekommenderat: kopiera .env.postgis.example -> .env.postgis, kor Verify-PostgresDataMount.ps1,
# och starta med docker compose i denna katalog:
#   docker compose --env-file .env.postgis up -d
# Detta skript ar docker run-motsvarigheten (anvander samma .env.postgis).

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pgdata = Join-Path $here "pgdata_live"
$envFile = Join-Path $here ".env.postgis"
if (-not (Test-Path $pgdata)) {
  throw "pgdata_live saknas: $pgdata"
}
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $here ".env.postgis.example") $envFile -Force
}

docker run -d `
  --name miljobeslut-postgis-live `
  -p 55432:5432 `
  --env-file $envFile `
  -v "${pgdata}:/var/lib/postgresql/data" `
  postgis/postgis:16-3.4
