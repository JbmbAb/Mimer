import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DecisionType, Permit, Receiver } from '../types';
import { fetchMunicipalityContext } from '../services/geminiService';
import { useSpatialAudit } from '../src/ui/hooks/useGeoLayers';
import { MAP_LAYERS, MapLayerConfig } from '../config/MapLayers';
import {
  FLOOD_RISK_STYLE,
  getMarkCoverStyle,
  getSguCoastalErosionStyle,
  getSguGroundLayerStyle,
  getSguHighestCoastlineStyle,
  getSguLandslideStyle,
  getSguPermeabilityStyle,
  POSTGIS_LAKES_STYLE,
  POSTGIS_NVR_STYLE,
  POSTGIS_PROPERTY_STYLE,
  POSTGIS_STREAMS_STYLE,
  SGU_GROUNDWATER_BODY_STYLE,
  SGU_GROUNDWATER_MAGAZINE_STYLE,
  SGU_COASTAL_EROSION_POINT_STYLE,
  SGU_HIGHEST_COASTLINE_POINT_STYLE,
  SGU_WELL_POINT_STYLE,
  STATIC_OVERLAY_CONFIG,
  WATER_CATCHMENT_STYLE,
  WATER_PROTECTION_STYLE,
  TOPO10_BUILDINGS_STYLE,
  TOPO10_MARK_STYLE,
  TOPO10_VAG_STYLE,
  TOPO10_VATTEN_STYLE,
  TOPO10_JARNVAG_STYLE,
} from './project/MapConfig';

// Import VectorGrid dynamically or ensure it is available in runtime
// @ts-ignore
import * as L from 'leaflet';
import 'leaflet.vectorgrid';

type BaseLayerKey = 'osm' | 'topo' | 'orto' | 'local' | 'orsa_true_ortho';

type LocalBasemapConfig =
  | { kind: 'xyz'; url: string; attribution: string }
  | { kind: 'wms'; url: string; layers: string; attribution: string };

function withLantmaterietOpenSubscription(url: string): string {
  const key = String(import.meta.env.VITE_LANTMATERIET_OPEN_SUBSCRIPTION_KEY ?? '').trim();
  if (!key) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}subscription-key=${encodeURIComponent(key)}`;
}

function readLocalBasemapConfig(): LocalBasemapConfig | null {
  const attribution = String(import.meta.env.VITE_LOCAL_BASEMAP_ATTRIBUTION ?? '').trim() || 'Lokal källa';
  const xyz = String(import.meta.env.VITE_LOCAL_BASEMAP_XYZ_URL ?? '').trim();
  if (xyz) return { kind: 'xyz', url: xyz, attribution };
  const wmsUrl = String(import.meta.env.VITE_LOCAL_BASEMAP_WMS_URL ?? '').trim();
  const wmsLayers = String(import.meta.env.VITE_LOCAL_BASEMAP_WMS_LAYERS ?? '').trim();
  if (wmsUrl && wmsLayers) return { kind: 'wms', url: wmsUrl, layers: wmsLayers, attribution };
  return null;
}

function localBasemapButtonLabel(): string {
  return String(import.meta.env.VITE_LOCAL_BASEMAP_LABEL ?? '').trim() || 'Lokal grundkarta';
}

interface MapViewProps {
  permits?: Permit[];
  receivers?: Receiver[];
  onSelectPermit?: (permit: Permit) => void;
  onSelectReceiver?: (receiver: Receiver) => void;
  selectedReceiverId?: string;
  geoJsonData?: unknown;
  bufferDistance?: number;
  highlightLayer?: string;
}

const HIGHLIGHT_LAYER_ALIASES: Record<string, string> = {
  smhi_flood: 'climate_flood_risk',
  sgu_jordart: 'sgu_jordarter', // Point to new MVT layer
  sgu_brunnar: 'sgu_brunnar_postgis',
  sgu_permeability: 'sgu_genomslapplighet',
  groundwater_magazine: 'sgu_groundwater_magazine',
  groundwater_body: 'sgu_groundwater_body',
};

function isRenderableGeoJson(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  if (o.type === 'FeatureCollection') {
    return Array.isArray(o.features) && o.features.length > 0;
  }
  return (typeof o.type === 'string' && (o.type === 'Feature' || o.type === 'GeometryCollection'));
}

const PROPERTY_OVERLAY_STYLE = {
  color: '#2563eb',
  weight: 2,
  opacity: 0.95,
  fillColor: '#3b82f6',
  fillOpacity: 0.22,
};

type LayerStatus = 'loading' | 'loaded' | 'empty' | 'error' | 'not_configured';

const MapView: React.FC<MapViewProps> = ({
  permits = [],
  geoJsonData,
  bufferDistance,
  highlightLayer,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const layersRef = useRef<Record<string, any>>({});
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const bufferLayerRef = useRef<L.Circle | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayerKey>('osm');
  const [activeOverlays, setActiveOverlays] = useState<string[]>([]);
  const [overlayStatuses, setOverlayStatuses] = useState<Record<string, LayerStatus>>({});
  const [mapNotice, setMapNotice] = useState('');

  const spatialAudit = useSpatialAudit();

  const toggleOverlay = useCallback((layerKey: string) => {
    const map = mapRef.current;
    if (!map) return;

    if (activeOverlays.includes(layerKey)) {
      if (layersRef.current[layerKey]) map.removeLayer(layersRef.current[layerKey]);
      setActiveOverlays(prev => prev.filter(k => k !== layerKey));
    } else {
      // Lazy load or add layer
      if (!layersRef.current[layerKey]) {
        const config = MAP_LAYERS[layerKey];
        if (config?.type === 'mvt') {
          // @ts-ignore
          layersRef.current[layerKey] = L.vectorGrid.protobuf(config.url!, {
            interactive: config.isQueryable,
            vectorTileLayerStyles: {
              [config.id]: {
                fill: true,
                weight: 1,
                opacity: 0.7,
                color: "#92400e",
                fillColor: "#f59e0b",
              }
            }
          });
        } else if (config?.type === 'raster') {
           layersRef.current[layerKey] = L.tileLayer(config.url!, { opacity: 0.8 });
        }
      }

      if (layersRef.current[layerKey]) {
        layersRef.current[layerKey].addTo(map);
        setActiveOverlays(prev => [...prev, layerKey]);
        setOverlayStatuses(prev => ({ ...prev, [layerKey]: 'loaded' }));
      }
    }
  }, [activeOverlays]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: false, maxZoom: 18 }).setView(
      [61.115, 14.617],
      11,
    );
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Basemaps
    layersRef.current.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    // Add click handler for Raster/MVT Query
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const activeRaster = activeOverlays.find(k => MAP_LAYERS[k]?.type === 'raster');
      
      if (activeRaster) {
        const res = await fetch(`/api/raster/query?layerId=${activeRaster}&lng=${lng}&lat=${lat}`);
        const data = await res.json();
        if (data.value !== null) {
          L.popup().setLatLng(e.latlng).setContent(`Värde: ${data.value}`).openOn(map);
        }
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-[600px] rounded-3xl border border-slate-200 bg-slate-100 overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />
      
      <div className="absolute left-6 top-6 z-[1000] space-y-3">
        <div className="w-60 p-4 bg-white/95 rounded-3xl border border-slate-200 shadow-2xl backdrop-blur-md">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Lager</p>
          <div className="space-y-1.5">
            {Object.entries(MAP_LAYERS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => toggleOverlay(key)}
                className={`flex w-full items-center justify-between p-2 rounded-xl border text-[10px] font-black uppercase transition-all ${
                  activeOverlays.includes(key) ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
