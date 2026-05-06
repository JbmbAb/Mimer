
# Docker-baserad bulk-import av alla GIS-filer
# Använder ogr2ogr inuti PostGIS-containern

param(
  [string]$SourceDir = "C:\Users\jimmy\Desktop\MiljoBeslut_Produktdata\Geodata",
  [int]$MaxParallel = 4
)

$ErrorActionPreference = "Continue"
$jobs = @()
$imported = 0
$failed = 0
$extensions = @('*.gpkg', '*.shp', '*.geojson', '*.tif', '*.tiff')

Write-Output "Starting Docker-based bulk import..."
Write-Output "Source: $SourceDir"
Write-Output ""

# Samla alla källfiler
$files = @()
foreach ($ext in $extensions) {
  $files += Get-ChildItem -Path $SourceDir -Recurse -Filter $ext -File
}

Write-Output "Found $($files.Count) files to import"
Write-Output ""

foreach ($file in $files) {
  # Vänta på jobb-slot
  while ($jobs.Count -ge $MaxParallel) {
    $completed = $jobs | Where-Object { $_.State -ne "Running" }
    foreach ($job in $completed) {
      $output = Receive-Job -Job $job 2>&1 | Select-Object -First 5
      if ($job.State -eq "Completed") {
        $imported++
        Write-Output "[OK] $($job.Name)"
      } else {
        $failed++
        Write-Output "[FAIL] $($job.Name)"
      }
      Remove-Job -Job $job
    }
    $jobs = $jobs | Where-Object { $_.State -eq "Running" }
    Start-Sleep -Milliseconds 500
  }

  # Starta jobb - kopiera fil till container och importera
  $jobName = $file.BaseName
  $tableName = ($file.BaseName -replace '[^a-zA-Z0-9_]', '_').ToLower().Substring(0, [Math]::Min(63, ($file.BaseName -replace '[^a-zA-Z0-9_]', '_').Length))
  $ext = $file.Extension.ToLower()
  
  $job = Start-Job -Name $jobName -ArgumentList $file.FullName, $tableName, $ext -ScriptBlock {
    param($FilePath, $TableName, $FileExt)
    
    # Copy fil til container
    $containerPath = "/tmp/import_$(Get-Random).$(Split-Path $FilePath -Leaf)"
    docker cp "$FilePath" "miljobeslut-postgis-live:$containerPath" 2>&1 | Out-Null
    
    if ($FileExt -match '\.(tif|tiff)$') {
      # Raster import
      docker exec -T miljobeslut-postgis-live bash -c "raster2pgsql -I -C -M '$containerPath' public.$TableName | psql -U miljobeslut -d miljobeslut" 2>&1
    } else {
      # Vector import (gpkg, shp, geojson)
      docker exec -T miljobeslut-postgis-live bash -c "ogr2ogr -f PostgreSQL PG:'host=localhost port=5432 dbname=miljobeslut user=miljobeslut password=miljobeslut' -nln $TableName -append '$containerPath'" 2>&1
    }
    
    # Cleanup
    docker exec -T miljobeslut-postgis-live rm -f "$containerPath" 2>&1 | Out-Null
  }
  
  $jobs += $job
  Write-Output "Queued: $jobName (table: $tableName, ext: $ext)"
}

# Vänta på resterande jobb
Write-Output ""
Write-Output "Waiting for $($jobs.Count) remaining jobs..."
$jobs | Wait-Job | Out-Null

foreach ($job in $jobs) {
  $output = Receive-Job -Job $job 2>&1 | Select-Object -First 3
  if ($job.State -eq "Completed") {
    $imported++
    Write-Output "[OK] $($job.Name)"
  } else {
    $failed++
    Write-Output "[FAIL] $($job.Name): $output"
  }
  Remove-Job -Job $job
}

Write-Output ""
Write-Output "Import complete: $imported OK, $failed FAILED"

# Checka rad-antal
Write-Output ""
Write-Output "Final row count:"
docker exec miljobeslut-postgis-live psql -U miljobeslut -d miljobeslut -c "SELECT 'Totalt rader: ' || SUM(n_live_tup)::text FROM pg_stat_user_tables;"
