$ErrorActionPreference = "Stop"

$scriptDir = "C:\Users\jimmy\Desktop\MiljoBeslut_Produktdata\03_Databas_PostGIS\docker"
cd $scriptDir

$logFile = "master_import.log"
"Starting Master Import Pipeline at $(Get-Date)" | Out-File $logFile -Append

$tasks = @(
    @{ Schema="sgu"; Source="D:\MiljoBeslut_Produktdata_Sources\Geodata\jordarter25k-100k" },
    @{ Schema="staging"; Source="D:\MiljoBeslut_Produktdata_Sources\Pipeline_Storage\storage\extracted" },
    @{ Schema="lantmateriet"; Source="D:\MiljoBeslut_Produktdata_Sources\Kartor\Fastighetsinformation Nedladdning" }
)

foreach ($task in $tasks) {
    "Starting import for Schema: $($task.Schema), Source: $($task.Source) at $(Get-Date)" | Out-File $logFile -Append
    try {
        .\IMPORT_PIPELINE_V2.ps1 -TargetSchema $task.Schema -SourceDir $task.Source *>&1 | Out-File $logFile -Append
        "Successfully completed Schema: $($task.Schema) at $(Get-Date)" | Out-File $logFile -Append
    } catch {
        "ERROR during import for Schema: $($task.Schema): $_ at $(Get-Date)" | Out-File $logFile -Append
    }
}

"Master Import Pipeline finished at $(Get-Date)" | Out-File $logFile -Append
