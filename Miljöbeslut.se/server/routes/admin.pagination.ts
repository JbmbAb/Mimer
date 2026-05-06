/**
 * Admin API - Pagination endpoints
 * Provides paginated data for admin modules
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import {
  countProjectsForOrganisation,
  listProjectsPageForOrganisation,
  countTransportBookings,
  listTransportBookingsPage,
} from '../modules/platform/public';

const router = express.Router();

function parsePage(raw: unknown): number {
  const n = parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

function parseLimit(raw: unknown, max = 100, defaultVal = 10): number {
  const n = parseInt(String(raw ?? String(defaultVal)), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : defaultVal;
}

/**
 * GET /api/admin/projects?page=1&limit=10
 * Returns paginated list of projects
 */
router.get('/api/admin/projects', requireAuth, rateLimitByUser(40, 60_000), async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      res.status(403).json({ ok: false, error: 'Admin role required' });
      return;
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const skip = (page - 1) * limit;

    const total = await countProjectsForOrganisation(req.authUser.organisationId);

    const projects = await listProjectsPageForOrganisation({
      organisationId: req.authUser.organisationId,
      skip,
      take: limit,
    });

    res.json({
      ok: true,
      projects,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + limit < total,
    });
  } catch (error: unknown) {
    console.error('[Admin Pagination] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * GET /api/transport/bookings?page=1&limit=10
 * Returns paginated list of transport bookings
 */
router.get('/api/transport/bookings', requireAuth, rateLimitByUser(60, 60_000), async (req, res) => {
  try {
    if (!req.authUser) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const skip = (page - 1) * limit;

    const total = await countTransportBookings();

    const bookings = await listTransportBookingsPage({ skip, take: limit });

    res.json({
      ok: true,
      bookings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + limit < total,
    });
  } catch (error: unknown) {
    console.error('[Transport Pagination] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
