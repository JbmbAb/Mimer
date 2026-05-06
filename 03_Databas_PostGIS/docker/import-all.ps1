
# Snabb bulk-import av alla GIS-filer från Geodata/
# Använder ogr2ogr för import direkt till PostGIS

param(
  [string]$SourceDir = "C:\Users\jimmy\Desktop\MiljoBeslut_Produktdata\Geodata",
  [string]$DbHost = "localhost",
  [int]$DbPort = 55432,
  [string]$DbName = "miljobeslut",
  [string]$DbUser = "miljobeslut",
  [string]$DbPass = "miljobeslut",
  [int]$MaxParallel = 4
)

$ErrorActionPreference = "Continue"
$jobs = @()
$imported = 0
$failed = 0
$extensions = @('*.gpkg', '*.shp', '*.geojson')
$connString = "PG:host=$DbHost port=$DbPort dbname=$DbName user=$DbUser password=$DbPass"

Write-Output "Starting bulk import..."
Write-Output "Source: $SourceDir"
Write-Output "Target: $connString"
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
      $output = Receive-Job -Job $job 2>&1
      if ($job.State -eq "Completed") {
        $imported++
        Write-Output "[OK] $($job.Name)"
      } else {
        $failed++
        Write-Output "[FAIL] $($job.Name): $output"
      }
      Remove-Job -Job $job
    }
    $jobs = $jobs | Where-Object { $_.State -eq "Running" }
    Start-Sleep -Milliseconds 500
  }

  # Starta jobb
  $jobName = $file.BaseName
  $tableName = ($file.BaseName -replace '[^a-zA-Z0-9_]', '_').ToLower()
  
  $job = Start-Job -Name $jobName -ArgumentList $file.FullName, $connString, $tableName -ScriptBlock {
    param($FilePath, $ConnStr, $TableName)
    ogr2ogr -f PostgreSQL "$ConnStr" "$FilePath" -nln $TableName -append -t_srs EPSG:3857 2>&1
  }
  
  $jobs += $job
  Write-Output "Queued: $jobName (table: $tableName)"
}

# Vänta på resterande jobb
Write-Output ""
Write-Output "Waiting for remaining jobs..."
$jobs | Wait-Job | Out-Null

foreach ($job in $jobs) {
  $output = Receive-Job -Job $job 2>&1
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
docker exec miljobeslut-postgis-live psql -U $DbUser -d $DbName -c "SELECT 'Totalt rader: ' || SUM(n_live_tup)::text FROM pg_stat_user_tables;"
