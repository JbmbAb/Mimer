/**
 * Project Plan Generator API Route
 * Generates comprehensive project plans using AI + geodata
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import { generateProjectPlan, type ProjectPlanRequest } from '../modules/generators/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * POST /api/projects/:projectId/plan/generate
 * Generate project plan using AI analysis
 */
router.post('/api/projects/:projectId/plan/generate', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);

    if (!projectId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID required',
      });
      return;
    }

    const { propertyId, projectType, budget, timeframe, description, latitude, longitude } = req.body;

    if (!propertyId || !projectType || !budget || !timeframe || !description) {
      res.status(400).json({
        ok: false,
        error: 'Missing required fields: propertyId, projectType, budget, timeframe, description',
      });
      return;
    }

    console.log(`[ProjectPlanGenerator] Generating plan for project ${projectId}...`);

    // Generate plan using AI + Prisma + PostGIS
    const planRequest: ProjectPlanRequest = {
      projectId,
      propertyId,
      projectType,
      budget: Number(budget),
      timeframe,
      description,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
    };

    const generatedPlan = await generateProjectPlan(planRequest);

    res.json({
      ok: true,
      plan: generatedPlan,
    });
  } catch (error: unknown) {
    console.error('[ProjectPlanGenerator] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
