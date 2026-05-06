import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, LatLngBoundsExpression } from 'leaflet';
import type { Feature } from 'geojson';
import { fetchPropertyInfo } from '../src/ui/api-client/geo.client';
import {
  getSguGroundLayerStyle,
  POSTGIS_NVR_STYLE,
  POSTGIS_PROPERTY_STYLE,
  POSTGIS_LAKES_STYLE,
  POSTGIS_STREAMS_STYLE,
  TOPO10_BUILDINGS_STYLE,
  TOPO10_MARK_STYLE,
  TOPO10_VATTEN_STYLE,
  WATER_PROTECTION_STYLE,
} from './project/MapConfig';

type GeodataLayerKey =
  | 'soil'
  | 'wells'
  | 'lakes'
  | 'streams'
  | 'topoWater'
  | 'topoBuildings'
  | 'topoMark'
  | 'waterProtection'
  | 'protectedNature'
  | 'property';

type FeatureCollectionJson = {
  type: 'FeatureCollection';
  features: unknown[];
};

const GEODATA_LAYERS: ReadonlyArray<{
  key: GeodataLayerKey;
  path: string;
  label: string;
  kind: 'polygon' | 'line' | 'points';
  /** Extra query string e.g. limit for wells */
  querySuffix?: string;
}> = [
  { key: 'soil', path: 'soil', label: 'Jord & berggrund (SGU)', kind: 'polygon' },
  { key: 'topoMark', path: 'topo-mark', label: 'Markanvändning (Topo 10)', kind: 'polygon' },
  { key: 'waterProtection', path: 'water-protection', label: 'Vattenskydd', kind: 'polygon' },
  { key: 'protectedNature', path: 'protected-nature', label: 'Skyddad natur (NVR)', kind: 'polygon' },
  { key: 'lakes', path: 'lakes', label: 'Sjöar', kind: 'polygon' },
  { key: 'topoWater', path: 'topo-water', label: 'Ytvatten (Topo 10)', kind: 'polygon' },
  { key: 'streams', path: 'streams', label: 'Vattendrag', kind: 'line' },
  { key: 'property', path: 'property', label: 'Fastighetsgränser', kind: 'line' },
  { key: 'topoBuildings', path: 'topo-buildings', label: 'Byggnader (Topo 10)', kind: 'polygon' },
  {
    key: 'wells',
    path: 'wells',
    label: 'Brunnar (SGU)',
    kind: 'points',
    querySuffix: '&limit=2000',
  },
];

const EMPTY_FC: FeatureCollectionJson = { type: 'FeatureCollection', features: [] };

function bboxFromCenter(lat: number, lng: number, delta = 0.02): string {
  return [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
}

function BboxSync({ onBbox }: { onBbox: (bbox: string) => void }) {
  const map = useMap();
  const emit = useCallback(() => {
    const b = map.getBounds();
    const w = b.getWest();
    const s = b.getSouth();
    const e = b.getEast();
    const n = b.getNorth();
    if (![w, s, e, n].every(Number.isFinite)) return;
    if (Math.abs(e - w) < 1e-6 || Math.abs(n - s) < 1e-6) return;
    onBbox(`${w},${s},${e},${n}`);
  }, [map, onBbox]);

  useMapEvents({ moveend: emit, zoomend: emit });
  useEffect(() => {
    emit();
  }, [emit]);
  return null;
}

function FitBoundsRequest({
  target,
}: {
  target: { seq: number; bounds: LatLngBoundsExpression } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.fitBounds(target.bounds, { padding: [28, 28], maxZoom: 16 });
  }, [map, target]);
  return null;
}

function wellPointToLayer(feature: Feature, latlng: LatLng) {
  void feature;
  return L.circleMarker(latlng, {
    radius: 6,
    color: '#c2410c',
    weight: 2,
    opacity: 1,
    fillColor: '#fb923c',
    fillOpacity: 0.92,
  });
}

function styleForGeodataLayer(key: GeodataLayerKey, feature: Feature) {
  switch (key) {
    case 'soil':
      return getSguGroundLayerStyle(feature);
    case 'lakes':
      return POSTGIS_LAKES_STYLE;
    case 'streams':
      return POSTGIS_STREAMS_STYLE;
    case 'topoWater':
      return TOPO10_VATTEN_STYLE;
    case 'topoBuildings':
      return TOPO10_BUILDINGS_STYLE;
    case 'topoMark':
      return TOPO10_MARK_STYLE;
    case 'waterProtection':
      return WATER_PROTECTION_STYLE;
    case 'protectedNature':
      return POSTGIS_NVR_STYLE;
    case 'property':
      return POSTGIS_PROPERTY_STYLE;
    default:
      return {};
  }
}

const SAMPLE_ALTERNATIVES = [
  { id: 'A', lat: 59.33, lng: 18.06, label: 'Alternativ A' },
  { id: 'B', lat: 59.328, lng: 18.075, label: 'Alternativ B' },
  { id: 'C', lat: 59.325, lng: 18.055, label: 'Alternativ C' },
];

export const LocalizationStudyUI: React.FC = () => {
  const [bbox, setBbox] = useState<string | null>(null);
  const [layerEnabled, setLayerEnabled] = useState<Record<GeodataLayerKey, boolean>>(() =>
    GEODATA_LAYERS.reduce(
      (acc, Lyr) => {
        acc[Lyr.key] = true;
        return acc;
      },
      {} as Record<GeodataLayerKey, boolean>,
    ),
  );
  const [geoByLayer, setGeoByLayer] = useState<Partial<Record<GeodataLayerKey, FeatureCollectionJson>>>({});
  const requestGen = useRef<Partial<Record<GeodataLayerKey, number>>>({});

  const [designation, setDesignation] = useState('');
  const [propertyStatus, setPropertyStatus] = useState<string>('');
  const [mapNotice, setMapNotice] = useState('');
  const [fitTarget, setFitTarget] = useState<{ seq: number; bounds: LatLngBoundsExpression } | null>(null);

  useEffect(() => {
    if (!bbox) return;
    const ac = new AbortController();
    let anyError = false;

    const run = async () => {
      for (const layer of GEODATA_LAYERS) {
        if (!layerEnabled[layer.key]) continue;
        const next = (requestGen.current[layer.key] ?? 0) + 1;
        requestGen.current[layer.key] = next;
        const url = `/api/geodata/${layer.path}?bbox=${encodeURIComponent(bbox)}${layer.querySuffix ?? ''}`;
        try {
          const response = await fetch(url, { credentials: 'same-origin', signal: ac.signal });
          const data = (await response.json()) as FeatureCollectionJson & { error?: string };
          if (requestGen.current[layer.key] !== next) continue;
          if (!response.ok) {
            anyError = true;
            setGeoByLayer((prev) => ({ ...prev, [layer.key]: EMPTY_FC }));
            continue;
          }
          if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
            setGeoByLayer((prev) => ({ ...prev, [layer.key]: data }));
            if (data.features.length === 0) {
              /* keep quiet — empty view is normal */
            }
          } else {
            anyError = true;
            setGeoByLayer((prev) => ({ ...prev, [layer.key]: EMPTY_FC }));
          }
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          if (requestGen.current[layer.key] !== next) continue;
          anyError = true;
          setGeoByLayer((prev) => ({ ...prev, [layer.key]: EMPTY_FC }));
        }
      }
      setMapNotice(anyError ? 'Ett eller flera geodatalager kunde inte laddas.' : '');
    };

    void run();
    return () => ac.abort();
  }, [bbox, layerEnabled]);

  const onFetchProperty = async () => {
    const d = designation.trim();
    if (!d) {
      setPropertyStatus('Ange fastighetsbeteckning.');
      return;
    }
    setPropertyStatus('Hämtar…');
    try {
      const info = await fetchPropertyInfo(d);
      setPropertyStatus(`${info.designation} — ${info.municipality || 'kommun okänd'}`);
      if (info.centroid) {
        const { lat, lng } = info.centroid;
        const bb = bboxFromCenter(lat, lng, 0.015);
        const [w, s, e, n] = bb.split(',').map(Number);
        if ([w, s, e, n].every(Number.isFinite)) {
          setFitTarget((prev) => ({
            seq: (prev?.seq ?? 0) + 1,
            bounds: [
              [s, w],
              [n, e],
            ],
          }));
        }
      }
    } catch (e) {
      setPropertyStatus(e instanceof Error ? e.message : 'Uppslag misslyckades.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#111c2d] font-sans flex flex-col items-center py-12">
      <main className="w-full max-w-[1440px] px-8">
        <header className="mb-12 border-b border-[#cfdaf2] pb-8">
          <div className="flex justify-between items-end gap-8 flex-wrap">
            <div>
              <p className="text-[12px] font-bold tracking-[0.05em] uppercase text-[#565e74] mb-2">
                Myndighetsbeslut • Miljöbalken
              </p>
              <h1 className="text-5xl font-extrabold tracking-tight">Lokaliseringsutredning</h1>
              <p className="text-lg text-[#565e74] mt-4 max-w-2xl">
                Jämförande platser med GeoJSON från <code className="text-sm">/api/geodata/*</code> (samma
                PostGIS/Topo10-data som övriga kartlager) och färger i react-leaflet.
              </p>
            </div>
            <button
              type="button"
              className="bg-[#131b2e] text-[#ffffff] px-6 py-3 rounded text-sm font-bold shadow-lg hover:bg-[#0f172a] transition-all"
            >
              Exportera beslutsunderlag
            </button>
          </div>
        </header>

        <section className="flex gap-8 mb-16 h-[600px]">
          <div className="flex-1 rounded-lg overflow-hidden bg-[#f0f3ff] relative shadow-[0_12px_32px_rgba(17,28,45,0.06)] border border-[#ffffff]/50 z-0">
            <MapContainer
              center={[59.3293, 18.0686]}
              zoom={12}
              className="h-full w-full"
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <BboxSync onBbox={setBbox} />
              <FitBoundsRequest target={fitTarget} />
              {GEODATA_LAYERS.map((layer) => {
                if (!layerEnabled[layer.key]) return null;
                const data = geoByLayer[layer.key];
                if (!data?.features?.length) return null;
                if (layer.kind === 'points') {
                  return <GeoJSON key={layer.key} data={data} pointToLayer={wellPointToLayer} />;
                }
                return (
                  <GeoJSON
                    key={layer.key}
                    data={data}
                    style={(feature) =>
                      feature ? styleForGeodataLayer(layer.key, feature) : {}
                    }
                  />
                );
              })}
              {SAMPLE_ALTERNATIVES.map((s) => (
                <CircleMarker
                  key={s.id}
                  center={[s.lat, s.lng]}
                  pathOptions={{ radius: 10, color: '#131b2e', fillOpacity: 0.9 }}
                >
                  <Tooltip direction="top" permanent={false}>
                    {s.id}: {s.label}
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
            {mapNotice ? (
              <div className="absolute bottom-3 left-3 right-3 z-[500] rounded bg-white/95 border border-[#cfdaf2] px-3 py-2 text-xs text-[#565e74]">
                {mapNotice}
              </div>
            ) : null}
          </div>
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-[#ffffff] p-6 rounded-lg shadow-sm border border-[#cfdaf2]/50">
              <h3 className="font-bold text-lg mb-3">Fastighet</h3>
              <label className="block text-xs font-bold text-[#565e74] mb-1">Fastighetsbeteckning</label>
              <div className="flex gap-2">
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="flex-1 border border-[#cfdaf2] rounded px-3 py-2 text-sm"
                  placeholder="T.ex. NACKA SICKLA 1:1"
                />
                <button
                  type="button"
                  onClick={() => void onFetchProperty()}
                  className="bg-[#131b2e] text-white px-4 py-2 rounded text-sm font-bold shrink-0"
                >
                  Hämta
                </button>
              </div>
              {propertyStatus ? (
                <p className="mt-2 text-xs text-[#565e74]">{propertyStatus}</p>
              ) : null}
            </div>
            <div className="bg-[#ffffff] p-6 rounded-lg shadow-sm border border-[#cfdaf2]/50 flex-1">
              <h3 className="font-bold text-lg mb-4">Geodata-lager</h3>
              <p className="text-xs text-[#565e74] mb-3">
                Vatten: blå toner (sjöar, vattendrag, Topo10-vatten). Brunnar: orange punkter.
              </p>
              <ul className="space-y-3 text-sm text-[#565e74] font-medium">
                {GEODATA_LAYERS.map((Lyr) => (
                  <li key={Lyr.key} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={layerEnabled[Lyr.key]}
                      onChange={(e) =>
                        setLayerEnabled((prev) => ({ ...prev, [Lyr.key]: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[#131b2e]"
                    />
                    {Lyr.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Platsjämförelse</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 text-sm font-bold uppercase tracking-widest text-[#565e74]">Faktor</div>
            <div className="bg-[#131b2e] text-white p-4 rounded-t-lg font-bold text-center">Alternativ A (vald)</div>
            <div className="bg-[#f0f3ff] p-4 rounded-t-lg font-bold text-center">Alternativ B</div>
            <div className="bg-[#f0f3ff] p-4 rounded-t-lg font-bold text-center">Alternativ C</div>

            <div className="p-4 font-bold border-b border-[#cfdaf2]">Natura 2000</div>
            <div className="p-4 bg-[#ffffff] border-b border-[#cfdaf2] flex justify-center items-center">
              <span className="bg-[#85f8c4] text-[#006c4a] px-3 py-1 rounded text-xs font-bold">Utanför (&gt;2 km)</span>
            </div>
            <div className="p-4 bg-[#ffffff] border-b border-[#cfdaf2] flex justify-center items-center">
              <span className="bg-[#ffdcc3] text-[#c76c00] px-3 py-1 rounded text-xs font-bold">Nära (400 m)</span>
            </div>
            <div className="p-4 bg-[#ffffff] border-b border-[#cfdaf2] flex justify-center items-center">
              <span className="bg-[#85f8c4] text-[#006c4a] px-3 py-1 rounded text-xs font-bold">Utanför (&gt;5 km)</span>
            </div>

            <div className="p-4 font-bold border-b border-[#cfdaf2]">Geoteknisk risk</div>
            <div className="p-4 bg-[#ffffff] border-b border-[#cfdaf2] flex justify-center items-center text-sm font-medium">
              Morän (stabil)
            </div>
            <div className="p-4 bg-[#ffffff] border-b border-[#cfdaf2] flex justify-center items-center text-sm font-medium text-[#c76c00]">
              Postglacial lera
            </div>
            <div className="p-4 bg-[#ffffff] border-b border-[#cfdaf2] flex justify-center items-center text-sm font-medium">
              Urberg (stabil)
            </div>

            <div className="p-4 font-bold">Avstånd ytvatten</div>
            <div className="p-4 bg-[#ffffff] rounded-b-lg flex justify-center items-center text-sm font-medium text-[#c76c00]">
              45 meter
            </div>
            <div className="p-4 bg-[#ffffff] rounded-b-lg flex justify-center items-center text-sm font-medium text-[#006c4a]">
              850 meter
            </div>
            <div className="p-4 bg-[#ffffff] rounded-b-lg flex justify-center items-center text-sm font-medium text-[#006c4a]">
              1200 meter
            </div>
          </div>
          <p className="mt-4 text-xs text-[#565e74]">
            Tabellen är exempeldata — koppla till beräkningsmotor per alternativ i nästa iteration.
          </p>
        </section>
      </main>
    </div>
  );
};
