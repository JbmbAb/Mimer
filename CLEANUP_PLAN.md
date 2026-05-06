# Inventory & PostGIS Cleanup Plan

## Current Status (Inventory)
- **Total Workspace (C:):** ~192 GB
- **Redundant Export (D:):** ~237 GB (`D:\MiljoBeslut_Produktdata_Export`)
- **Other Large Data (D:):** ~44 GB (`D:\GIS-Utbildning`)
- **Geodata Source Mess:** Data is scattered across:
  - `C:\...\Geodata\MiljoBeslut_ExternDisk` (~50 GB)
  - `C:\...\Geodata\MiljoBeslut_Archive` (~15 GB)
  - `C:\...\Geodata\jordarter25k-100k` (~7 GB)
  - `C:\...\Kartor` (~26 GB)
- **Database Bloat:**
  - `pgdata_live`: ~5 GB
  - `pgdata_live_CORRUPT`: ~4 GB
  - Total tables: 87 (mostly automated names in `public` schema)

## Proposed Cleanup ("Göra rent hus")

### Phase 1: Space Recovery
1. **Delete Redundant Export:** Remove `D:\MiljoBeslut_Produktdata_Export` (Freeing 237 GB).
2. **Delete Corrupt DB:** Remove `C:\...\03_Databas_PostGIS\docker\pgdata_live_CORRUPT_20260504_042742`.
3. **Consolidate Sources:** Move all canonical source files to `D:\MiljoBeslut_Produktdata_Sources` to free up space on C:.

### Phase 2: PostGIS Architecture
1. **Schema Separation:**
   - `app`: Application data (User, Project, etc.)
   - `sgu`: Geological data (soil types, bedrock)
   - `lantmateriet`: Property boundaries, topography
   - `smhi`: Water (HYPE, SVAR), climate
   - `msb`: Risk and safety data
   - `sgi`: Stability and geotechnical data
2. **CRS Normalization:** All data will be projected to **EPSG:3006** (SWEREF99 TM) or **EPSG:3857** for web compatibility.

### Phase 3: Controlled Import
1. **Master Ingest Script:** A new PowerShell script `Invoke-MiljobeslutIngest.ps1` that:
   - Uses `docker exec` to run `ogr2ogr` and `raster2pgsql`.
   - Maps source folders to the correct schema.
   - Cleans table names (lowercase, no special characters).
   - Adds spatial indexes automatically.
   - Is idempotent (can be re-run without duplicating data).

## Implementation Steps
1. [ ] Create `CLEANUP_EXPORTS.ps1` to safely remove redundant data.
2. [ ] Create `SETUP_POSTGIS_SCHEMAS.sql` to initialize the database structure.
3. [ ] Create `IMPORT_PIPELINE_V2.ps1` with schema mapping logic.
4. [ ] Run a trial import of a small dataset.
5. [ ] Full import.

---
**Do you want me to proceed with creating these scripts and starting the cleanup?**
