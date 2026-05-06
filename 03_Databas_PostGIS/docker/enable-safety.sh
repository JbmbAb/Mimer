#!/bin/bash
# Recovery script - restart with safety enabled

echo "Switching to PRODUCTION MODE (safe)..."
docker exec miljobeslut-postgis-live psql -U miljobeslut -d miljobeslut << EOF
ALTER SYSTEM SET fsync = on;
ALTER SYSTEM SET synchronous_commit = on;
SELECT pg_reload_conf();
EOF

docker exec miljobeslut-postgis-live pg_ctl reload -D /var/lib/postgresql/data
echo "✓ Production safety enabled"
