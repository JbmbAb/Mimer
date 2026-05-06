import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({
  fetchMunicipalityContext: vi.fn(),
}));

import MapView from '../../components/MapView';
import { DecisionType, type Permit, type Receiver } from '../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

const basePermit: Permit = {
  id: '1',
  filename: 'permit.pdf',
  checksum: 'abc',
  received_date: '2024-01-01',
  property_id: 'PROP-1',
  municipality: 'Stockholm',
  waste_codes: '19 12 12',
  decision_type: DecisionType.BIFALL,
  full_text: 'text',
  processed_at: '2024-01-02',
};

const baseReceiver: Receiver = {
  id: 'R1',
  name: 'Mottagare AB',
  type: 'RECYCLING',
  lat: 59.3,
  lng: 18.0,
  allowedCodes: [],
  isHazardousAllowed: false,
};

function buildLeafletMock() {
  const mockLayer = {
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    clearLayers: vi.fn().mockReturnThis(),
    getLayers: vi.fn().mockReturnValue([]),
    addLayer: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
    getBounds: vi.fn().mockReturnValue(null),
    setStyle: vi.fn().mockReturnThis(),
  };
  const mockMarker = {
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
  };
  const mockMap = {
    setView: vi.fn().mockReturnThis(),
    getBounds: vi.fn().mockReturnValue({
      toBBoxString: vi.fn().mockReturnValue('17,59,19,60'),
    }),
    removeLayer: vi.fn(),
    hasLayer: vi.fn().mockReturnValue(false),
    addLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    eachLayer: vi.fn(),
    invalidateSize: vi.fn(),
    createPane: vi.fn(),
  };
  return {
    map: vi.fn().mockReturnValue(mockMap),
    control: { zoom: vi.fn().mockReturnValue({ addTo: vi.fn() }) },
    tileLayer: Object.assign(vi.fn().mockReturnValue(mockLayer), {
      wms: vi.fn().mockReturnValue(mockLayer),
    }),
    geoJSON: vi.fn().mockReturnValue(mockLayer),
    popup: vi.fn().mockReturnValue({
      setLatLng: vi.fn().mockReturnThis(),
      setContent: vi.fn().mockReturnThis(),
      openOn: vi.fn().mockReturnThis(),
    }),
    divIcon: vi.fn().mockReturnValue({}),
    marker: vi.fn().mockReturnValue(mockMarker),
    layerGroup: vi.fn().mockReturnValue(mockLayer),
    circleMarker: vi.fn().mockReturnValue(mockMarker),
    _mockMap: mockMap,
  };
}

function renderMapView(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('MapView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset window.L between tests
    (window as unknown as Record<string, unknown>).L = undefined;
  });

  // ── No Leaflet runtime ──────────────────────────────────────────────────────

  it('shows Leaflet missing notice when window.L is absent', () => {
    renderMapView(<MapView />);
    expect(screen.getByText(/Leaflet saknas i runtime/i)).toBeInTheDocument();
  });

  it('renders the layer control panel', () => {
    renderMapView(<MapView />);
    expect(screen.getByText(/Myndighetslager/i)).toBeInTheDocument();
  });

  it('renders grundkarta base-layer controls when Leaflet is available', () => {
    const mockL = buildLeafletMock();
    (window as unknown as Record<string, unknown>).L = mockL;
    renderMapView(<MapView />);
    expect(screen.getByText(/Grundkarta/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^OSM$/i })).toBeInTheDocument();
  });

  it('configures OSM, topo and ortho base layers when Leaflet is available', () => {
    const mockL = buildLeafletMock();
    (window as unknown as Record<string, unknown>).L = mockL;
    renderMapView(<MapView />);
    expect(mockL.tileLayer).toHaveBeenCalledWith('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(mockL.tileLayer.wms).toHaveBeenCalledWith(
      'https://api.lantmateriet.se/open/topowebb-ccby/v1/wms',
      expect.objectContaining({ layers: 'topowebb' }),
    );
    expect(mockL.tileLayer.wms).toHaveBeenCalledWith(
      'https://api.lantmateriet.se/open/ortofoto-ccby/v1/wms',
      expect.objectContaining({ layers: expect.stringContaining('Ortofoto') }),
    );
  }, 15000);

  it('renders property boundary overlay label', () => {
    renderMapView(<MapView />);
    expect(screen.getByText(/Fastighetsgränser/i)).toBeInTheDocument();
  });

  it('renders some overlay layer labels', () => {
    renderMapView(<MapView />);
    expect(screen.getByText(/SGU grundlager/i)).toBeInTheDocument();
    expect(screen.getByText(/Skyddad natur/i)).toBeInTheDocument();
    expect(screen.getByText(/Oversvamningsrisk/i)).toBeInTheDocument();
  });

  it('renders without crashing with permits and receivers', () => {
    renderMapView(<MapView permits={[basePermit]} receivers={[baseReceiver]} />);
    expect(screen.getByText(/Myndighetslager/i)).toBeInTheDocument();
  });

  // ── With Leaflet mock ───────────────────────────────────────────────────────

  it('initialises Leaflet map when window.L is available', () => {
    const mockL = buildLeafletMock();
    (window as unknown as Record<string, unknown>).L = mockL;
    renderMapView(<MapView />);
    expect(mockL.map).toHaveBeenCalledTimes(1);
  });

  it('adds the OSM tile layer by default', () => {
    const mockL = buildLeafletMock();
    (window as unknown as Record<string, unknown>).L = mockL;
    renderMapView(<MapView />);
    expect(mockL.tileLayer).toHaveBeenCalledWith('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(mockL.tileLayer().addTo).toHaveBeenCalled();
  });

  it('toggles overlay layer when clicked with Leaflet mock', async () => {
    const user = userEvent.setup({ delay: null });
    const mockL = buildLeafletMock();
    (window as unknown as Record<string, unknown>).L = mockL;
    renderMapView(<MapView />);
    await user.click(screen.getByRole('button', { name: /Skyddad natur/i }));
    const overlayButton = screen.getByRole('button', { name: /Skyddad natur/i });
    expect(overlayButton.className).toContain('bg-slate-900');
  });
});
