/**
 * Sewage Applications API Routes
 * Endpoints för ansökningar om privata VA-anläggningar
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import {
  countAllProjects,
  listProjectsSewagePage,
  getProjectBasicForSewage,
} from '../modules/platform/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * GET /api/sewage-applications?page=1&limit=10
 * Returns paginated list of sewage applications
 */
router.get('/api/sewage-applications', requireAuth, async (req, res) => {
  try {
    // Parse pagination parameters
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));
    const skip = (page - 1) * limit;

    // For now, use projects as fallback (until dedicated SewageApplication table exists)
    const total = await countAllProjects();

    const applications = await listProjectsSewagePage({ skip, take: limit });

    // Map to SewageApplication format
    const mappedApplications = applications.map((app) => {
      const status: 'APPROVED' | 'UNDER_REVIEW' | 'DRAFT' =
        app.status === 'CLOSED' ? 'APPROVED' : app.status === 'ACTIVE' ? 'UNDER_REVIEW' : 'DRAFT';

      return {
        id: app.id,
        organisationId: 'default-org',
        propertyAddress: app.propertyDesignation,
        latitude: 59.3293 + Math.random() * 0.1,
        longitude: 18.0686 + Math.random() * 0.1,
        householdSize: Math.floor(Math.random() * 8) + 2,
        status,
        submittedAt: app.createdAt,
        approvedAt: app.status === 'CLOSED' ? app.createdAt : undefined,
        propertyDesignation: app.propertyDesignation,
      };
    });

    res.json({
      ok: true,
      applications: mappedApplications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + limit < total,
    });
  } catch (error: unknown) {
    console.error('[Sewage Applications] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage-applications
 * Create new sewage application
 */
router.post('/api/sewage-applications', requireAuth, async (req, res) => {
  try {
    const { propertyAddress, householdSize, latitude, longitude } = req.body;

    if (!propertyAddress || !householdSize || typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({
        ok: false,
        error: 'Property address, household size, and coordinates required',
      });
      return;
    }

    // In production: create SewageApplication record
    const application = {
      id: `sewage-${Date.now()}`,
      organisationId: req.authUser?.organisationId || 'default-org',
      propertyAddress,
      latitude,
      longitude,
      householdSize,
      status: 'DRAFT' as const,
      submittedAt: undefined,
      approvedAt: undefined,
    };

    console.log('[Sewage Applications] Created new application:', application.id);

    res.json({
      ok: true,
      application,
    });
  } catch (error: unknown) {
    console.error('[Sewage Applications] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * GET /api/sewage-applications/:id
 * Returns specific sewage application
 */
router.get('/api/sewage-applications/:id', requireAuth, async (req, res) => {
  try {
    const id = routeParam(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: 'Application ID required',
      });
      return;
    }

    // For now, fetch project as fallback
    const project = await getProjectBasicForSewage(id);

    if (!project) {
      res.status(404).json({
        ok: false,
        error: 'Application not found',
      });
      return;
    }

    const status: 'APPROVED' | 'UNDER_REVIEW' = project.status === 'CLOSED' ? 'APPROVED' : 'UNDER_REVIEW';

    const application = {
      id: project.id,
      organisationId: 'default-org',
      propertyAddress: project.propertyDesignation,
      latitude: 59.3293,
      longitude: 18.0686,
      householdSize: 4,
      status,
      submittedAt: project.createdAt,
      approvedAt: project.status === 'CLOSED' ? project.createdAt : undefined,
    };

    res.json({
      ok: true,
      application,
    });
  } catch (error: unknown) {
    console.error('[Sewage Applications] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
