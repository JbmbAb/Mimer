/**
 * Green Check Generator API Route
 * Generates comprehensive ESG/regulatory assessment for banks per EU standards
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import { generateGreenCheck, type GreenCheckRequest } from '../modules/generators/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * POST /api/green-check/generate
 * Generate ESG/regulatory assessment using AI analysis
 */
router.post('/api/green-check/generate', requireAuth, async (req, res) => {
  try {
    const {
      organizationNumber,
      organizationName,
      projectDescription,
      investmentAmount,
      sector,
      latitude,
      longitude,
    } = req.body;

    if (!organizationNumber || !projectDescription) {
      res.status(400).json({
        ok: false,
        error: 'Missing required fields: organizationNumber, projectDescription',
      });
      return;
    }

    console.log(`[GreenCheckGenerator] Generating assessment for org ${organizationNumber}...`);

    const assessmentRequest: GreenCheckRequest = {
      organizationNumber,
      organizationName,
      projectDescription,
      investmentAmount:
        investmentAmount != null && investmentAmount !== '' ? Number(investmentAmount) : undefined,
      sector,
      latitude: latitude != null && latitude !== '' ? Number(latitude) : undefined,
      longitude: longitude != null && longitude !== '' ? Number(longitude) : undefined,
    };

    const generatedAssessment = await generateGreenCheck(assessmentRequest);

    res.json({
      ok: true,
      assessment: generatedAssessment,
    });
  } catch (error: unknown) {
    console.error('[GreenCheckGenerator] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
