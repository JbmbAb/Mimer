import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../logger';

const prisma = new PrismaClient();

export interface LocalGeoFeature {
  designation: string;
  source: 'local_db';
  geometry: unknown;
  boundaries: unknown;
}

/**
 * Kontrollerar om vi har lokal fastighetsgeometri från Lantmäteriet inkopierad i databasen.
 * Den letar i det isolerade `env`-schemat.
 */
export async function tryFetchLocalPropertyGeometry(designation: string): Promise<LocalGeoFeature | null> {
  try {
    const rawParts = designation.split(/\s+/);
    if (rawParts.length < 2) return null;

    const label = rawParts[rawParts.length - 1];
    const tract = rawParts[rawParts.length - 2];
    const muni = rawParts.slice(0, rawParts.length - 2).join(' ');

    const municipalityCondition = muni ? Prisma.sql`AND kommunnamn = ${muni.toUpperCase()}` : Prisma.empty;

    // Uppslag mot env.registerenhetsomradesytor (PostGIS)
    // ST_AsGeoJSON konverterar PostGIS geometri till frontend-vänligt GeoJSON
    const result = await prisma.$queryRaw<any[]>`
      SELECT 
        etikett, 
        kommunnamn, 
        trakt, 
        ST_AsGeoJSON(geom)::json AS geometry
      FROM env.registerenhetsomradesytor
      WHERE etikett = ${label}
        AND trakt = ${tract.toUpperCase()}
        ${municipalityCondition}
      LIMIT 1;
    `;

    if (result && result.length > 0) {
      logger.info(`Hybrid Fallback: Hittade ${designation} LOKALT i databasen (0ms)!`);
      const row = result[0];
      return {
        designation: `${row.kommunnamn} ${row.trakt} ${row.etikett}`,
        source: 'local_db',
        geometry: row.geometry,
        boundaries: {
          type: 'Feature',
          properties: { etikett: row.etikett, trakt: row.trakt, kommunnamn: row.kommunnamn },
          geometry: row.geometry,
        },
      };
    }

    return null; // Hittades inte lokalt, returnera null så vi gör en live_fetch()
  } catch (err) {
    logger.warn(
      'Kunde inte fråga lokal databas efter fastighet (tabell/schemat kanske inte existerar än):',
      err,
    );
    return null;
  }
}

/**
 * Kontrollerar om vi har SGU Jordarts-data (sgu_jordart) överlappande med angiven box
 */
export async function tryFetchLocalSguData(_bboxPolygonGeoJson: string): Promise<any | null> {
  // Här lägger vi in PostGIS "ST_Intersects" för jordartskartan efter importen
  return null;
}
