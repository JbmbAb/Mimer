# PostGIS (lokal Docker)

## Forsta gang
1. Oppna mappen `docker/` i Utforskaren.
2. Kopiera `.env.postgis.example` till `.env.postgis` (sker automatiskt om du kor `start-miljobeslut-postgis.ps1` och filen saknas).
3. Kor `Verify-PostgresDataMount.ps1` — ska klara 64 MB skrivtest. Om det fallerar: flytta `pgdata_live` till C:, eller aktivera D: under *Docker Desktop → Resources → File sharing*.
4. Starta antingen:
   - `docker compose --env-file .env.postgis up -d`, eller
   - `.\start-miljobeslut-postgis.ps1` (motsvarande `docker run`).

Anslutning: `localhost:55432`, databas och anvandare enligt `.env.postgis`.

## Backuper
- `.\Backup-Miljobeslut.ps1` — skapar `../backups/miljobeslut_YYYYMMDD_HHMMSS.dump` (pg_dump custom format).
- `.\Restore-MiljobeslutDump.ps1 -DumpPath sokvag\till\fil.dump` — **ersatter** databasen `miljobeslut`.

## Ovrigt
- `restore-backup.ps1` — SQL-fil enligt gamla flodet (kravar `../backups/backup_pre_migration*.sql`).
- **Flytta aldrig** `pgdata_live` med maskinen igang — stoppa containern forst.
- Om namnet redan ar upptaget: `docker rm -f miljobeslut-postgis-live` (endast om du vet att ingen annan behover containern).
