/**
 * useTransportWebSocket – Subscribe to real-time transport updates
 * Connects to ws://server/transport/updates
 */

import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';

interface TransportUpdate {
  type: 'transport-update';
  bookingId: string;
  updates: {
    status: string;
    location?: { lat: number; lng: number };
    speedKmh?: number;
    lastUpdate: string;
  };
  timestamp: string;
}

interface InitialData {
  type: 'initial-data';
  bookings: Array<{
    id: string;
    status: string;
    updatedAt: string;
  }>;
  timestamp: string;
}

export const useTransportWebSocket = () => {
  const queryClient = useQueryClient();

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/transport/updates`;

  const { isConnected } = useWebSocket(wsUrl, {
    onMessage: (data: TransportUpdate | InitialData) => {
      if (data.type === 'transport-update') {
        // Update React Query cache with new transport status
        queryClient.setQueryData(['transport-bookings'], (oldData: any) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            bookings: oldData.bookings.map((booking: any) =>
              booking.id === (data as TransportUpdate).bookingId
                ? {
                    ...booking,
                    status: (data as TransportUpdate).updates.status,
                    updatedAt: (data as TransportUpdate).updates.lastUpdate,
                  }
                : booking,
            ),
          };
        });

        console.log('[TransportWebSocket] Updated booking:', (data as TransportUpdate).bookingId);
      } else if (data.type === 'initial-data') {
        console.log(
          '[TransportWebSocket] Received initial data:',
          (data as InitialData).bookings.length,
          'bookings',
        );
      }
    },
    onError: (error) => {
      console.error('[TransportWebSocket] Error:', error);
    },
    reconnect: true,
    maxReconnectAttempts: 5,
  });

  return { isConnected };
};
