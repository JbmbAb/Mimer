
# Docker-baserad bulk-import av vektor-GIS-filer
# Hoppar över raster (tif/tiff)

param(
  [string]$SourceDir = "C:\Users\jimmy\Desktop\MiljoBeslut_Produktdata\Geodata",
  [int]$MaxParallel = 4
)

$ErrorActionPreference = "Continue"
$jobs = @()
$imported = 0
$failed = 0
$extensions = @('*.gpkg', '*.shp', '*.geojson')

Write-Output "Starting Docker-based vector import..."
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

  $jobName = $file.BaseName
  $tableName = ($file.BaseName -replace '[^a-zA-Z0-9_]', '_').ToLower().Substring(0, [Math]::Min(63, ($file.BaseName -replace '[^a-zA-Z0-9_]', '_').Length))
  
  $job = Start-Job -Name $jobName -ArgumentList $file.FullName, $tableName -ScriptBlock {
    param($FilePath, $TableName)
    
    # Copy fil til container
    $containerPath = "/tmp/import_$(Get-Random).$(Split-Path $FilePath -Leaf)"
    docker cp "$FilePath" "miljobeslut-postgis-live:$containerPath" 2>&1 | Out-Null
    
    # Vector import
    docker exec -T miljobeslut-postgis-live ogr2ogr -f PostgreSQL "PG:host=localhost port=5432 dbname=miljobeslut user=miljobeslut password=miljobeslut" -nln "$TableName" -append "$containerPath" 2>&1
    
    # Cleanup
    docker exec -T miljobeslut-postgis-live rm -f "$containerPath" 2>&1 | Out-Null
  }
  
  $jobs += $job
  Write-Output "Queued: $jobName → $tableName"
}

# Vänta på resterande jobb
Write-Output ""
Write-Output "Waiting for $($jobs.Count) jobs..."
$jobs | Wait-Job | Out-Null

foreach ($job in $jobs) {
  if ($job.State -eq "Completed") {
    $imported++
    Write-Output "[OK] $($job.Name)"
  } else {
    $failed++
    Write-Output "[FAIL] $($job.Name)"
  }
  Remove-Job -Job $job
}

Write-Output ""
Write-Output "=================="
Write-Output "Import complete: $imported OK, $failed FAILED"
Write-Output "=================="
Write-Output ""

# Checka rad-antal
Write-Output "Final row count:"
docker exec miljobeslut-postgis-live psql -U miljobeslut -d miljobeslut -c "SELECT 'Totalt rader: ' || SUM(n_live_tup)::text FROM pg_stat_user_tables;"
