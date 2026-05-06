# Backup current optimized database
cd C:\Users\jimmy\Desktop\MiljoBeslut_Produktdata\03_Databas_PostGIS\docker

Write-Host "Creating backup..." -ForegroundColor Cyan
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
docker exec miljobeslut-postgis-live pg_dump -U miljobeslut -d miljobeslut --format=custom > "..\backups\miljobeslut_optimized_$timestamp.dump"

Write-Host "Backup created: miljobeslut_optimized_$timestamp.dump" -ForegroundColor Green
