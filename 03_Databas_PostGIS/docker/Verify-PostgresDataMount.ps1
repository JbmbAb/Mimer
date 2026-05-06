$ErrorActionPreference = "Stop"
# Verifierar att Docker ser full NTFS-yta pa bind mount (inte ~100 MB "falsk" volym).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pgdata = Join-Path $here "pgdata_live"
if (-not (Test-Path $pgdata)) {
  throw "Saknas: $pgdata"
}
Write-Host "Testar mount: $pgdata"
docker run --rm -v "${pgdata}:/data:rw" alpine:3.20 sh -c "df -h /data; echo '---'; dd if=/dev/zero of=/data/.miljobeslut_mount_check bs=1M count=64 conv=fsync 2>&1; rm -f /data/.miljobeslut_mount_check; echo OK"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
