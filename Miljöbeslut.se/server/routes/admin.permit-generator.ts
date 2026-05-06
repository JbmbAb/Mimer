/**
 * Permit Application Generator API Route
 * Generates comprehensive permit applications using AI + geodata + SNI registry
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import { generatePermitApplication, type PermitApplicationRequest } from '../modules/generators/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * POST /api/projects/:projectId/permit/generate
 * Generate permit application using AI analysis
 */
router.post('/api/projects/:projectId/permit/generate', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);

    if (!projectId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID required',
      });
      return;
    }

    const { propertyDesignation, sniCode, sniDescription, description, budget, latitude, longitude } =
      req.body;

    if (!propertyDesignation || !sniCode || !description) {
      res.status(400).json({
        ok: false,
        error: 'Missing required fields: propertyDesignation, sniCode, description',
      });
      return;
    }

    console.log(`[PermitApplicationGenerator] Generating application for project ${projectId}...`);

    const applicationRequest: PermitApplicationRequest = {
      projectId,
      propertyDesignation,
      sniCode,
      sniDescription,
      description,
      budget: budget != null && budget !== '' ? Number(budget) : undefined,
      latitude: latitude != null && latitude !== '' ? Number(latitude) : undefined,
      longitude: longitude != null && longitude !== '' ? Number(longitude) : undefined,
    };

    const generatedApplication = await generatePermitApplication(applicationRequest);

    res.json({
      ok: true,
      application: generatedApplication,
    });
  } catch (error: unknown) {
    console.error('[PermitApplicationGenerator] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
