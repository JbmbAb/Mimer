/**
 * Permit Application API Routes
 * Handle saving and retrieving permit applications
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import { buildSimplePdfBuffer } from '../services/pdfExportService';
import { buildPermitDocxBuffer } from '../services/permitDocxExportService';
import { prisma } from '../db/prisma';

const router = express.Router();

function routeParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * POST /api/projects/:projectId/permit
 * Save a permit application
 */
router.post('/api/projects/:projectId/permit', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);
    const user = req.authUser!;

    if (!projectId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID required',
      });
      return;
    }

    const { application } = req.body;

    if (!application) {
      res.status(400).json({
        ok: false,
        error: 'Application data required',
      });
      return;
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organisationId: user.organisationId },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ ok: false, error: 'Projekt hittades inte' });
      return;
    }

    const generatedAtRaw = req.body?.generatedAt;
    const generatedAt =
      typeof generatedAtRaw === 'string' && generatedAtRaw.trim()
        ? new Date(generatedAtRaw)
        : null;
    const sourceTracking = Array.isArray(req.body?.sourceTracking) ? req.body.sourceTracking : [];
    const externalSourcesUsed = Array.isArray(req.body?.externalSourcesUsed)
      ? req.body.externalSourcesUsed
      : [];

    const row = await prisma.permitApplicationDraft.create({
      data: {
        projectId,
        organisationId: user.organisationId,
        application: application as object,
        generatedAt: generatedAt && !Number.isNaN(generatedAt.getTime()) ? generatedAt : null,
        sourceTracking,
        externalSourcesUsed,
      },
      select: { id: true },
    });

    res.status(201).json({ ok: true, applicationId: row.id });
  } catch (error: unknown) {
    console.error('[PermitApplication] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * GET /api/projects/:projectId/permit/:applicationId
 * Retrieve a saved permit application
 */
router.get('/api/projects/:projectId/permit/:applicationId', requireAuth, async (req, res) => {
  try {
    const projectId = routeParam(req.params.projectId);
    const applicationId = routeParam(req.params.applicationId);
    const user = req.authUser!;

    if (!projectId || !applicationId) {
      res.status(400).json({
        ok: false,
        error: 'Project ID and Application ID required',
      });
      return;
    }

    const row = await prisma.permitApplicationDraft.findFirst({
      where: {
        id: applicationId,
        projectId,
        organisationId: user.organisationId,
      },
    });

    if (!row) {
      res.status(404).json({ ok: false, error: 'Ansökan hittades inte' });
      return;
    }

    res.json({
      ok: true,
      application: row.application,
      generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
      sourceTracking: row.sourceTracking,
      externalSourcesUsed: row.externalSourcesUsed,
    });
  } catch (error: unknown) {
    console.error('[PermitApplication] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/projects/:projectId/permit/:applicationId/export
 * Export permit application as PDF/Word document
 */
router.post(
  '/api/projects/:projectId/permit/:applicationId/export',
  requireAuth,
  rateLimitByUser(20, 60_000),
  async (req, res) => {
    try {
      const projectId = routeParam(req.params.projectId);
      const applicationId = routeParam(req.params.applicationId);
      const formatRaw = String(req.body?.format ?? 'pdf').toLowerCase();

      if (!projectId || !applicationId) {
        res.status(400).json({
          ok: false,
          error: 'Project ID and Application ID required',
        });
        return;
      }

      if (!['pdf', 'docx'].includes(formatRaw)) {
        res.status(400).json({
          ok: false,
          error: 'format måste vara pdf eller docx',
        });
        return;
      }

      const documentType = String(req.body?.documentType || 'Tillståndsansökan').slice(0, 120);

      let draftText = '';
      if (typeof req.body?.draftText === 'string' && req.body.draftText.trim()) {
        draftText = req.body.draftText.trim();
      } else if (req.body?.application != null) {
        try {
          draftText = JSON.stringify(req.body.application, null, 2);
        } catch {
          draftText = String(req.body.application);
        }
      } else {
        draftText = [
          `Projekt-ID: ${projectId}`,
          `Ansöknings-ID: ${applicationId}`,
          '',
          'Automatiskt utkast. Skicka draftText (sträng) eller application (objekt) i body för fullständigare innehåll.',
          'Obs: beständig lagring av ansökan kan fortfarande saknas; exporten bygger på det som skickas i anropet.',
        ].join('\n');
      }

      if (formatRaw === 'docx') {
        const buffer = await buildPermitDocxBuffer({ documentType, draftText });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="tillstandsansokan-${encodeURIComponent(applicationId)}.docx"`,
        );
        res.send(buffer);
        return;
      }

      const buffer = await buildSimplePdfBuffer({
        title: `Miljöbeslut – ${documentType}`,
        subtitle: `Projekt ${projectId} · Ansökan ${applicationId} · ${new Date().toLocaleString('sv-SE')}`,
        body: draftText,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="tillstandsansokan-${encodeURIComponent(applicationId)}.pdf"`,
      );
      res.send(buffer);
    } catch (error: unknown) {
      console.error('[PermitApplication] Error:', error);
      res.status(400).json(toSafeErrorResponse(error));
    }
  },
);

export default router;
