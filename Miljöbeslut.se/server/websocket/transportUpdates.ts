/**
 * WebSocket handler för transport-uppdateringar
 * Broadcasting transport status-ändringar till anslutna admin-klienter
 */

import { WebSocket } from 'ws';
import { prisma } from '../../db.server';

interface TransportMessage {
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

// Track active WebSocket connections for transport updates
const transportConnections = new Set<WebSocket>();

/**
 * Handle transport WebSocket connection
 */
export const handleTransportConnection = (ws: WebSocket) => {
  transportConnections.add(ws);
  console.log(`[TransportWS] Client connected. Total: ${transportConnections.size}`);

  // Send initial data
  sendInitialTransportData(ws);

  // Handle message
  ws.on('message', (data: string) => {
    try {
      const message = JSON.parse(data);
      if (message.type === 'subscribe' && message.bookingId) {
        // Subscribe to specific booking updates
        console.log(`[TransportWS] Client subscribed to booking ${message.bookingId}`);
      }
    } catch (err) {
      console.error('[TransportWS] Invalid message:', err);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    transportConnections.delete(ws);
    console.log(`[TransportWS] Client disconnected. Total: ${transportConnections.size}`);
  });

  ws.on('error', (error) => {
    console.error('[TransportWS] Connection error:', error);
  });
};

/**
 * Send initial transport data to new client
 */
export const sendInitialTransportData = async (ws: WebSocket) => {
  try {
    const bookings = await prisma.transportBooking.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    const payload = JSON.stringify({
      type: 'initial-data',
      bookings,
      timestamp: new Date().toISOString(),
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  } catch (error) {
    console.error('[TransportWS] Error fetching initial data:', error);
  }
};

/**
 * Broadcast transport update to all clients
 */
export const broadcastTransportUpdate = (message: TransportMessage) => {
  const payload = JSON.stringify(message);

  transportConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });

  console.log(`[TransportWS] Broadcasted update to ${transportConnections.size} clients`);
};

/**
 * Update transport status and broadcast to clients
 */
export const updateTransportStatus = async (bookingId: string, newStatus: string) => {
  try {
    // Update database
    const booking = await prisma.transportBooking.update({
      where: { id: bookingId },
      data: { status: newStatus },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    // Broadcast to all clients
    const message: TransportMessage = {
      type: 'transport-update',
      bookingId,
      updates: {
        status: booking.status,
        lastUpdate: booking.updatedAt.toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    broadcastTransportUpdate(message);
  } catch (error) {
    console.error('[TransportWS] Error updating status:', error);
  }
};
