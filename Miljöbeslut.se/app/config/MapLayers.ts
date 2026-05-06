/**
 * MAP CONFIGURATION & STYLES (Refactored for MVT/Raster)
 */

export type LayerSourceType = "mvt" | "raster" | "geojson" | "wms";

export interface MapLayerConfig {
  id: string;
  label: string;
  type: LayerSourceType;
  endpoint?: string; 
  url?: string;      
  emptyMessage?: string;
  minzoom?: number;
  maxzoom?: number;
  isQueryable?: boolean;
  style?: any;
}

export const MAP_LAYERS: Record<string, MapLayerConfig> = {
  // --- MVT LAYERS (High Performance) ---
  sgu_jordarter: {
    id: "sgu.jordarter",
    label: "SGU Jordarter",
    type: "mvt",
    url: "/api/tiles/sgu/jordarter25k_100k/{z}/{x}/{y}.pbf",
    minzoom: 6,
    maxzoom: 16,
    isQueryable: true,
  },
  sgu_berggrund: {
    id: "sgu.berggrund",
    label: "SGU Berggrund",
    type: "mvt",
    url: "/api/tiles/sgu/berggrund50k_250k/{z}/{x}/{y}.pbf",
    minzoom: 5,
    maxzoom: 15,
  },
  nvr_naturreservat: {
    id: "nvr.naturreservat",
    label: "Naturreservat",
    type: "mvt",
    url: "/api/tiles/staging/nr_polygon/{z}/{x}/{y}.pbf",
    minzoom: 5,
    maxzoom: 18,
  },
  nvr_vmi: {
    id: "nvr.vmi",
    label: "Våtmarksinventering (VMI)",
    type: "mvt",
    url: "/api/tiles/staging/vmi_ytor/{z}/{x}/{y}.pbf",
    minzoom: 8,
    maxzoom: 18,
  },
  smhi_svar: {
    id: "smhi.svar_2022",
    label: "SVAR Avrinningsområden",
    type: "mvt",
    url: "/api/tiles/staging/svar2022_delavrinningsomraden/{z}/{x}/{y}.pbf",
    minzoom: 6,
    maxzoom: 16,
  },
  lantmateriet_fastighet: {
    id: "lantmateriet.fastighet",
    label: "Fastighetsgränser",
    type: "mvt",
    url: "/api/tiles/lantmateriet/fastighetsinformation/{z}/{x}/{y}.pbf",
    minzoom: 12,
    maxzoom: 18,
  },

  // --- RASTER LAYERS ---
  nvr_marktacke_2023: {
    id: "nvr.marktacke_2023",
    label: "Marktäcke (NMD 2023)",
    type: "raster",
    url: "/api/tiles/raster/staging/nmd2023bas_v2_1/{z}/{x}/{y}.png",
    isQueryable: true,
  },
  lantmateriet_hojd: {
    id: "lantmateriet.hojd",
    label: "Höjdmodell 1m (GSD)",
    type: "raster",
    url: "/api/tiles/raster/lantmateriet/hojd_1m/{z}/{x}/{y}.png",
    isQueryable: true,
  },

  // --- LEGACY/WMS ---
  sgu_brunnar: {
    id: "sgu-wells-wms",
    label: "Brunnar (WMS)",
    type: "wms",
  }
};
