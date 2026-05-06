import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/db.server";
import { getLayer } from "~/services/layerRegistry.ts";

/**
 * API Route: /api/raster/query
 * Performs a point-in-raster lookup to get cell values without downloading images.
 * Query Params: layerId, lng, lat
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const layerId = url.searchParams.get("layerId");
  const lng = parseFloat(url.searchParams.get("lng") || "");
  const lat = parseFloat(url.searchParams.get("lat") || "");

  if (!layerId || isNaN(lng) || isNaN(lat)) {
    return json({ error: "Missing required parameters: layerId, lng, lat" }, { status: 400 });
  }

  const layer = getLayer(layerId);
  if (!layer || layer.kind !== "raster") {
    return json({ error: `Layer ${layerId} not found or not a raster layer` }, { status: 404 });
  }

  try {
    /**
     * Raster Point Query
     * 1. ST_Point(lng, lat): Create point from input
     * 2. ST_Transform: Convert point to the raster's native SRID
     * 3. ST_Value: Extract pixel value at that point
     */
    const query = `
      SELECT ST_Value(
        "${layer.rasterColumn}", 
        ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), ST_SRID("${layer.rasterColumn}"))
      ) as val
      FROM "${layer.schema}"."${layer.table}"
      WHERE ST_Intersects(
        "${layer.rasterColumn}", 
        ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), ST_SRID("${layer.rasterColumn}"))
      )
      LIMIT 1;
    `;

    const result = await prisma.$queryRawUnsafe<Array<{ val: number | null }>>(
      query,
      lng,
      lat
    );

    if (!result || result.length === 0 || result[0].val === null) {
      return json({ value: null, message: "No data at this location" });
    }

    return json({
      layerId,
      value: result[0].val,
      coordinates: { lng, lat }
    });

  } catch (error) {
    console.error(`Raster query error for ${layerId}:`, error);
    return json({ error: "Failed to query raster data", details: String(error) }, { status: 500 });
  }
}
