import { Prisma, PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

const GROUND_COLLECTION_URL =
  'https://api.sgu.se/oppnadata/jordarter1miljon/ogc/features/v1/collections/grundlager/items';
const LANDSLIDE_COLLECTION_URL =
  'https://api.sgu.se/oppnadata/jordskred-raviner/ogc/features/v1/collections/jordskred-raviner/items';
const DEFAULT_PAGE_SIZE = 1000;

type ImportTarget = 'ground' | 'landslide' | 'both';

type CliOptions = {
  target: ImportTarget;
  stageOnly: boolean;
  pageSize: number;
  limit: number | null;
};

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type GeoJsonFeature = {
  id?: string | number;
  geometry: GeoJsonGeometry | null;
  properties?: Record<string, unknown>;
};

type FeatureCollectionResponse = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
  numberMatched?: number;
  numberReturned?: number;
  links?: Array<{
    rel?: string;
    href?: string;
  }>;
};

type GroundImportRow = {
  sourceKey: string;
  sourceObjectId: number | null;
  layerCode: number | null;
  layerLabel: string | null;
  mappingName: string | null;
  mapType: number | null;
  symbol: number | null;
  areaSqm: number | null;
  lengthM: number | null;
  rawProperties: string;
  geometryJson: string;
};

type LandslideImportRow = {
  sourceKey: string;
  sourceObjectId: number | null;
  featureCode: number | null;
  featureLabel: string | null;
  symbol: number | null;
  lengthM: number | null;
  rawProperties: string;
  geometryJson: string;
};

type TableCountSummary = {
  groundStage: string;
  groundEnv: string;
  landslideStage: string;
  landslideEnv: string;
};

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    target: 'both',
    stageOnly: false,
    pageSize: DEFAULT_PAGE_SIZE,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--ground-only':
        options.target = 'ground';
        break;
      case '--landslide-only':
        options.target = 'landslide';
        break;
      case '--stage-only':
        options.stageOnly = true;
        break;
      case '--page-size': {
        const raw = argv[index + 1];
        if (!raw) {
          throw new Error('--page-size requires a value');
        }
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) {
          throw new Error('--page-size must be an integer between 1 and 10000');
        }
        options.pageSize = parsed;
        index += 1;
        break;
      }
      case '--limit': {
        const raw = argv[index + 1];
        if (!raw) {
          throw new Error('--limit requires a value');
        }
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = parsed;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) => (typeof currentValue === 'bigint' ? currentValue.toString() : currentValue),
    2,
  );
}

async function ensurePipelineTables(): Promise<void> {
  const scriptPath = fileURLToPath(new URL('../db/create_sgu_layers_pipeline.sql', import.meta.url));
  const sql = await readFile(scriptPath, 'utf8');
  const statements = sql
    .split(';')
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE stage.sgu_ground_layer_raw
    ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 3006);
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE stage.sgu_landslide_feature_raw
    ADD COLUMN IF NOT EXISTS geom geometry(MultiLineString, 3006);
  `);
}

async function getDatabaseContext() {
  const [context] = await prisma.$queryRawUnsafe<Array<{ db: string; schema: string }>>(
    'SELECT current_database() AS db, current_schema() AS schema',
  );
  return context;
}

async function fetchCollectionPage(baseUrl: string, pageSize: number, startIndex: number): Promise<FeatureCollectionResponse> {
  const url = new URL(baseUrl);
  url.searchParams.set('limit', String(pageSize));
  url.searchParams.set('startIndex', String(startIndex));

  const response = await fetch(url, {
    headers: {
      Accept: 'application/geo+json,application/json',
      'User-Agent': 'Miljobeslut-SGU-Importer/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`SGU request failed (${response.status}) for ${url.toString()}`);
  }

  return (await response.json()) as FeatureCollectionResponse;
}

function mapGroundRows(features: GeoJsonFeature[]): GroundImportRow[] {
  return features
    .filter((feature) => feature.geometry)
    .map((feature) => {
      const properties = feature.properties ?? {};
      const sourceKey = asNullableString(feature.id) ?? asNullableString(properties.objectid);
      if (!sourceKey) {
        throw new Error('Ground feature is missing both id and objectid');
      }

      return {
        sourceKey,
        sourceObjectId: asNullableNumber(properties.objectid),
        layerCode: asNullableNumber(properties.jg2),
        layerLabel: asNullableString(properties.jg2_tx),
        mappingName: asNullableString(properties.kartering),
        mapType: asNullableNumber(properties.karttyp),
        symbol: asNullableNumber(properties.symbol),
        areaSqm: asNullableNumber(properties.geom_area),
        lengthM: asNullableNumber(properties.geom_length),
        rawProperties: JSON.stringify(properties),
        geometryJson: JSON.stringify(feature.geometry),
      };
    });
}

function mapLandslideRows(features: GeoJsonFeature[]): LandslideImportRow[] {
  return features
    .filter((feature) => feature.geometry)
    .map((feature) => {
      const properties = feature.properties ?? {};
      const sourceKey = asNullableString(feature.id) ?? asNullableString(properties.objectid);
      if (!sourceKey) {
        throw new Error('Landslide feature is missing both id and objectid');
      }

      return {
        sourceKey,
        sourceObjectId: asNullableNumber(properties.objectid),
        featureCode: asNullableNumber(properties.sl),
        featureLabel: asNullableString(properties.sl_tx),
        symbol: asNullableNumber(properties.symbol),
        lengthM: asNullableNumber(properties.geom_length),
        rawProperties: JSON.stringify(properties),
        geometryJson: JSON.stringify(feature.geometry),
      };
    });
}

async function upsertGroundRows(rows: GroundImportRow[], stageOnly: boolean): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const stageValues = rows.map((row) => Prisma.sql`
    (
      ${row.sourceKey},
      ${row.sourceObjectId},
      ${row.layerCode},
      ${row.layerLabel},
      ${row.mappingName},
      ${row.mapType},
      ${row.symbol},
      ${row.areaSqm},
      ${row.lengthM},
      ${row.rawProperties}::jsonb,
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryJson}), 4326), 3006))
    )
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO stage.sgu_ground_layer_raw (
      source_key,
      source_object_id,
      layer_code,
      layer_label,
      mapping_name,
      map_type,
      symbol,
      area_sqm,
      length_m,
      raw_properties,
      geom
    )
    VALUES ${Prisma.join(stageValues)}
    ON CONFLICT (source_key) DO UPDATE SET
      source_object_id = EXCLUDED.source_object_id,
      layer_code = EXCLUDED.layer_code,
      layer_label = EXCLUDED.layer_label,
      mapping_name = EXCLUDED.mapping_name,
      map_type = EXCLUDED.map_type,
      symbol = EXCLUDED.symbol,
      area_sqm = EXCLUDED.area_sqm,
      length_m = EXCLUDED.length_m,
      raw_properties = EXCLUDED.raw_properties,
      geom = EXCLUDED.geom,
      imported_at = now()
  `);

  if (stageOnly) {
    return;
  }

  const envValues = rows.map((row) => Prisma.sql`
    (
      ${row.sourceKey},
      ${row.sourceObjectId},
      ${row.layerCode},
      ${row.layerLabel},
      ${row.mappingName},
      ${row.mapType},
      ${row.symbol},
      ${row.areaSqm},
      ${row.lengthM},
      ${row.rawProperties}::jsonb,
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryJson}), 4326), 3006))
    )
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO env.sgu_ground_layer (
      source_key,
      source_object_id,
      layer_code,
      layer_label,
      mapping_name,
      map_type,
      symbol,
      area_sqm,
      length_m,
      raw_properties,
      geom
    )
    VALUES ${Prisma.join(envValues)}
    ON CONFLICT (source_key) DO UPDATE SET
      source_object_id = EXCLUDED.source_object_id,
      layer_code = EXCLUDED.layer_code,
      layer_label = EXCLUDED.layer_label,
      mapping_name = EXCLUDED.mapping_name,
      map_type = EXCLUDED.map_type,
      symbol = EXCLUDED.symbol,
      area_sqm = EXCLUDED.area_sqm,
      length_m = EXCLUDED.length_m,
      raw_properties = EXCLUDED.raw_properties,
      geom = EXCLUDED.geom,
      imported_at = now()
  `);
}

async function upsertLandslideRows(rows: LandslideImportRow[], stageOnly: boolean): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const stageValues = rows.map((row) => Prisma.sql`
    (
      ${row.sourceKey},
      ${row.sourceObjectId},
      ${row.featureCode},
      ${row.featureLabel},
      ${row.symbol},
      ${row.lengthM},
      ${row.rawProperties}::jsonb,
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryJson}), 4326), 3006))
    )
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO stage.sgu_landslide_feature_raw (
      source_key,
      source_object_id,
      feature_code,
      feature_label,
      symbol,
      length_m,
      raw_properties,
      geom
    )
    VALUES ${Prisma.join(stageValues)}
    ON CONFLICT (source_key) DO UPDATE SET
      source_object_id = EXCLUDED.source_object_id,
      feature_code = EXCLUDED.feature_code,
      feature_label = EXCLUDED.feature_label,
      symbol = EXCLUDED.symbol,
      length_m = EXCLUDED.length_m,
      raw_properties = EXCLUDED.raw_properties,
      geom = EXCLUDED.geom,
      imported_at = now()
  `);

  if (stageOnly) {
    return;
  }

  const envValues = rows.map((row) => Prisma.sql`
    (
      ${row.sourceKey},
      ${row.sourceObjectId},
      ${row.featureCode},
      ${row.featureLabel},
      ${row.symbol},
      ${row.lengthM},
      ${row.rawProperties}::jsonb,
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${row.geometryJson}), 4326), 3006))
    )
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO env.sgu_landslide_feature (
      source_key,
      source_object_id,
      feature_code,
      feature_label,
      symbol,
      length_m,
      raw_properties,
      geom
    )
    VALUES ${Prisma.join(envValues)}
    ON CONFLICT (source_key) DO UPDATE SET
      source_object_id = EXCLUDED.source_object_id,
      feature_code = EXCLUDED.feature_code,
      feature_label = EXCLUDED.feature_label,
      symbol = EXCLUDED.symbol,
      length_m = EXCLUDED.length_m,
      raw_properties = EXCLUDED.raw_properties,
      geom = EXCLUDED.geom,
      imported_at = now()
  `);
}

async function importGroundLayer(options: CliOptions): Promise<void> {
  let imported = 0;
  let startIndex = 0;

  while (true) {
    const remaining = options.limit === null ? options.pageSize : Math.min(options.pageSize, options.limit - imported);
    if (remaining <= 0) {
      break;
    }

    const page = await fetchCollectionPage(GROUND_COLLECTION_URL, remaining, startIndex);
    const rows = mapGroundRows(page.features);
    await upsertGroundRows(rows, options.stageOnly);
    imported += rows.length;
    console.log(`[ground] imported ${imported}/${page.numberMatched ?? '?'} features`);

    if (page.features.length < remaining || rows.length === 0) {
      break;
    }

    startIndex += page.features.length;
  }
}

async function importLandslideLayer(options: CliOptions): Promise<void> {
  let imported = 0;
  let startIndex = 0;

  while (true) {
    const remaining = options.limit === null ? options.pageSize : Math.min(options.pageSize, options.limit - imported);
    if (remaining <= 0) {
      break;
    }

    const page = await fetchCollectionPage(LANDSLIDE_COLLECTION_URL, remaining, startIndex);
    const rows = mapLandslideRows(page.features);
    await upsertLandslideRows(rows, options.stageOnly);
    imported += rows.length;
    console.log(`[landslide] imported ${imported}/${page.numberMatched ?? '?'} features`);

    if (page.features.length < remaining || rows.length === 0) {
      break;
    }

    startIndex += page.features.length;
  }
}

async function getTableSummary(): Promise<TableCountSummary> {
  const [counts] = await prisma.$queryRawUnsafe<
    Array<{
      ground_stage: bigint;
      ground_env: bigint;
      landslide_stage: bigint;
      landslide_env: bigint;
    }>
  >(`
    SELECT
      (SELECT count(*) FROM stage.sgu_ground_layer_raw) AS ground_stage,
      (SELECT count(*) FROM env.sgu_ground_layer) AS ground_env,
      (SELECT count(*) FROM stage.sgu_landslide_feature_raw) AS landslide_stage,
      (SELECT count(*) FROM env.sgu_landslide_feature) AS landslide_env
  `);

  return {
    groundStage: counts.ground_stage.toString(),
    groundEnv: counts.ground_env.toString(),
    landslideStage: counts.landslide_stage.toString(),
    landslideEnv: counts.landslide_env.toString(),
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  await ensurePipelineTables();
  const db = await getDatabaseContext();

  console.log(`Target database: ${db.db} (schema context: ${db.schema})`);
  console.log(
    `Mode: target=${options.target}, stageOnly=${options.stageOnly}, pageSize=${options.pageSize}, limit=${options.limit ?? 'none'}`,
  );

  if (options.target === 'ground' || options.target === 'both') {
    await importGroundLayer(options);
  }

  if (options.target === 'landslide' || options.target === 'both') {
    await importLandslideLayer(options);
  }

  const summary = await getTableSummary();
  console.log('Import summary:');
  console.log(stringifyWithBigInt(summary));
}

main()
  .catch((error) => {
    console.error('SGU import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
