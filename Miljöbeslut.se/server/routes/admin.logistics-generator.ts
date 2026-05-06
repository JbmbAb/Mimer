/**
 * Logistics Generator API Route
 * Generates comprehensive logistics plans using AI + depot data
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import { generateLogisticsPlan, type LogisticsGeneratorRequest } from '../modules/generators/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * POST /api/projects/:projectId/logistics/generate
 * Generate logistics plan using AI analysis
 */
router.post('/api/projects/:projectId/logistics/generate', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);

    if (!projectId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID required',
      });
      return;
    }

    const {
      wasteType,
      estimatedTons,
      sourceAddress,
      destinationAddress,
      transportMode,
      tillståndsId,
      contaminants,
    } = req.body;

    if (!wasteType || !estimatedTons || !sourceAddress || !destinationAddress || !transportMode) {
      res.status(400).json({
        ok: false,
        error:
          'Missing required fields: wasteType, estimatedTons, sourceAddress, destinationAddress, transportMode',
      });
      return;
    }

    console.log(`[LogisticsGenerator] Generating plan for project ${projectId}...`);

    const planRequest: LogisticsGeneratorRequest = {
      projectId,
      wasteType,
      estimatedTons: Number(estimatedTons),
      sourceAddress,
      destinationAddress,
      transportMode,
      tillståndsId,
      contaminants: contaminants || [],
    };

    const generatedPlan = await generateLogisticsPlan(planRequest);

    res.json({
      ok: true,
      plan: generatedPlan,
    });
  } catch (error: unknown) {
    console.error('[LogisticsGenerator] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
