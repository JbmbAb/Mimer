import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchDynamicLayer, fetchSpatialAudit } from '../api-client/geo.client';

export function useSpatialAudit() {
  return useMutation({
    mutationFn: (vars: { lat: number; lng: number }) => fetchSpatialAudit(vars.lat, vars.lng),
  });
}

export function useDynamicLayer(layerKey: string, endpoint: string, bbox: string | null) {
  return useQuery({
    queryKey: ['geoLayer', layerKey, bbox],
    queryFn: () => fetchDynamicLayer(endpoint, bbox!),
    enabled: !!bbox && !!layerKey,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
