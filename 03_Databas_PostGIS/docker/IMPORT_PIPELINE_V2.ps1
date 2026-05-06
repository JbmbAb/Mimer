# Master Import Pipeline for Miljobeslut V3.1
# Usage: .\IMPORT_PIPELINE_V2.ps1 -TargetSchema sgu -SourceDir "D:\MiljoBeslut_Produktdata_Sources\Geodata\jordarter"

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("sgu", "lantmateriet", "smhi", "msb", "sgi", "app", "staging", "core", "hydro")]
    [string]$TargetSchema,

    [Parameter(Mandatory=$true)]
    [string]$SourceDir,

    [string]$DbName = "miljobeslut",
    [string]$DbUser = "miljobeslut"
)

$logFile = "import_success.log"
if (!(Test-Path $logFile)) { New-Item $logFile -ItemType File }
$successList = Get-Content $logFile

$extensions = @("*.gpkg", "*.shp", "*.geojson", "*.tif", "*.tiff")
$files = Get-ChildItem -Path $SourceDir -Recurse -Include $extensions -File

Write-Host "--- Miljobeslut Ingest V3.1 (Robust) ---" -ForegroundColor Cyan
Write-Host "Target Schema: $TargetSchema"
Write-Host "Source: $SourceDir"
Write-Host "Status: Tracking success in $logFile"
Write-Host "-----------------------------"

foreach ($file in $files) {
    if ($successList -contains $file.FullName) {
        Write-Host "Skipping (already imported): $($file.Name)" -ForegroundColor Gray
        continue
    }

    $tableName = ($file.BaseName -replace '[^a-zA-Z0-9_]', '_').ToLower()
    if ($tableName.Length -gt 60) { $tableName = $tableName.Substring(0, 60) }
    
    $fullTableName = "$TargetSchema.$tableName"
    $ext = $file.Extension.ToLower()

    # Map host path to container path
    $containerPath = $file.FullName.Replace("D:\MiljoBeslut_Produktdata_Sources\", "/data_sources/").Replace("\", "/")

    Write-Host "Importing: $($file.Name) -> $fullTableName" -ForegroundColor Yellow

    $cmd = ""
    if ($ext -match '\.(tif|tiff)$') {
        # Raster Import with Tiling (-t 256x256)
        $cmd = "raster2pgsql -I -C -M -t 256x256 -s 3006 '$containerPath' $fullTableName | psql -U $DbUser -d $DbName"
    } else {
        # Vector Import (ogr2ogr)
        $cmd = "ogr2ogr -f PostgreSQL PG:'dbname=$DbName user=$DbUser' '$containerPath' -nln $fullTableName -overwrite -t_srs EPSG:3006"
    }

    # Run command and check exit code
    docker exec miljobeslut-postgis-live bash -c "$cmd"
    if ($LASTEXITCODE -eq 0) {
        Add-Content -Path $logFile -Value $file.FullName
        Write-Host "[OK] Success" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Failed to import $($file.Name). Exit Code: $LASTEXITCODE" -ForegroundColor Red
    }
}

Write-Host "--- Import Cycle Complete ---" -ForegroundColor Cyan
