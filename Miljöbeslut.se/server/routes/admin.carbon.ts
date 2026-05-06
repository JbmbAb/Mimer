/**
 * Carbon & Environmental Metrics API Routes
 * Endpoints för CO₂-beräkningar och risk-bedömning
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import { getProjectForCarbonView, getProjectEnvironmentalOnly } from '../modules/platform/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function asFiniteNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function riskStatus(score: number, threshold: number, highWhenAbove = true): 'low' | 'medium' | 'high' {
  if (highWhenAbove) {
    if (score >= threshold) return 'high';
    if (score >= threshold * 0.7) return 'medium';
    return 'low';
  }
  if (score >= threshold) return 'high';
  if (score >= threshold * 0.7) return 'medium';
  return 'low';
}

/**
 * GET /api/projects/:projectId/carbon
 * Returns carbon metrics and risk assessment for project
 */
router.get('/api/projects/:projectId/carbon', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);

    if (!projectId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID required',
      });
      return;
    }

    // Fetch project
    const project = await getProjectForCarbonView(projectId);

    if (!project) {
      res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
      return;
    }

    const carbonResult =
      project.environmentalScore == null
        ? null
        : {
            totalKgCo2e: project.environmentalScore * 100,
            quality: 'CALCULATED' as const,
            method: 'DATABASE' as const,
            breakdown: {
              transport: project.environmentalScore * 0.6,
              storage: project.environmentalScore * 0.3,
              other: project.environmentalScore * 0.1,
            },
          };

    const esgRating =
      carbonResult && project.complianceScore != null
        ? {
            overall: carbonResult.totalKgCo2e < 5000 ? 'A' : 'B',
            environmental: project.environmentalScore > 75 ? 'A' : 'B',
            social: null,
            governance: null,
            carbonReady: carbonResult.totalKgCo2e < 5000,
            complianceScore: project.complianceScore,
            loanEligible: project.complianceScore >= 75 && carbonResult.totalKgCo2e < 5000,
          }
        : null;

    // Risk metrics
    const riskMetrics = [
      project.regulatoryRiskScore == null
        ? null
        : {
            name: 'Regulatorisk Risk',
            score: project.regulatoryRiskScore,
            threshold: 50,
            status: riskStatus(project.regulatoryRiskScore, 50),
            lastUpdated: new Date().toISOString(),
          },
      project.environmentalScore == null
        ? null
        : {
            name: 'Miljöpåverkan',
            score: project.environmentalScore,
            threshold: 75,
            status: riskStatus(project.environmentalScore, 75),
            lastUpdated: new Date().toISOString(),
          },
      project.complianceScore == null
        ? null
        : {
            name: 'Finansiell Hälsa',
            score: project.complianceScore,
            threshold: 75,
            status: riskStatus(project.complianceScore, 75, false),
            lastUpdated: new Date().toISOString(),
          },
    ].filter(Boolean);

    res.json({
      ok: true,
      carbonResult,
      esgRating,
      riskMetrics,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Carbon] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/projects/:projectId/carbon/calculate
 * Calculate carbon footprint for project based on transport & materials
 */
router.post('/api/projects/:projectId/carbon/calculate', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);
    const { carbonInput } = req.body;

    if (!projectId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID required',
      });
      return;
    }

    // Fetch project
    const project = await getProjectEnvironmentalOnly(projectId);

    if (!project) {
      res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
      return;
    }

    const tons = Math.max(0, asFiniteNumber(carbonInput?.tons));
    const distanceKm = Math.max(0, asFiniteNumber(carbonInput?.distanceKm));
    const emissionFactor = Math.max(
      0,
      asFiniteNumber(carbonInput?.emissionFactorKgCo2ePerTonKm || carbonInput?.emissionFactor),
    );
    const transport = tons * distanceKm * emissionFactor;
    const material = Math.max(0, asFiniteNumber(carbonInput?.materialKgCo2e));
    const storage = Math.max(0, asFiniteNumber(carbonInput?.storageKgCo2e));
    const other = Math.max(0, asFiniteNumber(carbonInput?.otherKgCo2e));

    const result = {
      totalKgCo2e: transport + material + storage + other,
      quality: 'CALCULATED' as const,
      method: 'FORMULA' as const,
      breakdown: {
        transport,
        material,
        storage,
        other,
      },
    };

    res.json({
      ok: true,
      result,
      riskMetrics: [],
    });
  } catch (error: unknown) {
    console.error('[Carbon Calculate] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
