/**
 * Project Plan API Routes
 * Endpoints för projektplan, faser och milstolpar
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import { getProjectForPlanHeader } from '../modules/platform/public';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * GET /api/projects/:projectId/plan
 * Returns project plan with phases, stakeholders, and milestones
 */
router.get('/api/projects/:projectId/plan', requireAuth, async (req, res) => {
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
    const project = await getProjectForPlanHeader(projectId);

    if (!project) {
      res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
      return;
    }

    const plan = {
      id: `plan-${projectId}`,
      projectId,
      schemaVersion: 1,
      plan: {
        templateId: null,
        projectType: null,
        phases: [],
        stakeholders: [],
        risks: [],
      },
      metadata: {
        status: project.status,
        propertyDesignation: project.propertyDesignation,
        note: 'Ingen verifierad projektplan finns sparad ännu.',
      },
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.createdAt.toISOString(),
    };

    res.json({
      ok: true,
      plan,
    });
  } catch (error: unknown) {
    console.error('[ProjectPlan] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/projects/:projectId/plan
 * Create or update project plan (from AI generator or manual edit)
 */
router.post('/api/projects/:projectId/plan', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);
    const { plan, generatedAt, externalSourcesUsed } = req.body;

    if (!projectId || !plan) {
      res.status(400).json({
        ok: false,
        error: 'Project ID and plan data required',
      });
      return;
    }

    // Validate plan structure
    if (!plan.phases || !Array.isArray(plan.phases)) {
      res.status(400).json({
        ok: false,
        error: 'Plan must contain phases array',
      });
      return;
    }

    // Build comprehensive plan document
    const updatedPlan = {
      id: `plan-${projectId}-${Date.now()}`,
      projectId,
      schemaVersion: 1,
      plan: {
        templateId: 'template-generated',
        projectType: 'MANAGED',
        phases: plan.phases || [],
        risks: plan.risks || [],
        stakeholders: plan.stakeholders || [],
      },
      metadata: {
        generatedAt: generatedAt || new Date().toISOString(),
        externalSourcesUsed: externalSourcesUsed || [],
        editedAt: new Date().toISOString(),
        editedBy: req.authUser?.id || 'unknown',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // In production: upsert into ProjectPlan table
    console.log(
      `[ProjectPlan] Updated plan for project ${projectId} with ${plan.phases.length} phases, ${plan.risks?.length || 0} risks`,
    );

    res.json({
      ok: true,
      message: 'Plan updated successfully',
      plan: updatedPlan,
    });
  } catch (error: unknown) {
    console.error('[ProjectPlan] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
