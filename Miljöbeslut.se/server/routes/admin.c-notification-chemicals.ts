/**
 * C-anmälan: kemikalieförteckning — CRUD under organisationens scope.
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import { prisma } from '../db/prisma';

const router = express.Router();

router.get('/api/admin/c-notification/chemicals', requireAuth, rateLimitByUser(60, 60_000), async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      res.status(403).json({ ok: false, error: 'Kräver ADMIN-roll' });
      return;
    }
    const user = req.authUser;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
    const rows = await prisma.cNotificationChemical.findMany({
      where: {
        organisationId: user.organisationId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    res.json({ ok: true, chemicals: rows });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.post('/api/admin/c-notification/chemicals', requireAuth, rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      res.status(403).json({ ok: false, error: 'Kräver ADMIN-roll' });
      return;
    }
    const user = req.authUser;
    const body = req.body ?? {};
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ ok: false, error: 'name krävs' });
      return;
    }
    const projectId =
      typeof body.projectId === 'string' && body.projectId.trim() ? body.projectId.trim() : null;
    if (projectId) {
      const proj = await prisma.project.findFirst({
        where: { id: projectId, organisationId: user.organisationId },
        select: { id: true },
      });
      if (!proj) {
        res.status(404).json({ ok: false, error: 'Projekt hittades inte' });
        return;
      }
    }

    const row = await prisma.cNotificationChemical.create({
      data: {
        organisationId: user.organisationId,
        projectId,
        name,
        annualConsumption:
          typeof body.annualConsumption === 'string' ? body.annualConsumption.trim() || null : null,
        storageNote: typeof body.storageNote === 'string' ? body.storageNote.trim() || null : null,
        hazardCode: typeof body.hazardCode === 'string' ? body.hazardCode.trim() || null : null,
        requiresSafetyDataSheet: Boolean(body.requiresSafetyDataSheet),
        reviewStatus: typeof body.reviewStatus === 'string' ? body.reviewStatus : 'DRAFT',
      },
    });
    res.status(201).json({ ok: true, chemical: row });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.patch('/api/admin/c-notification/chemicals/:id', requireAuth, rateLimitByUser(40, 60_000), async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      res.status(403).json({ ok: false, error: 'Kräver ADMIN-roll' });
      return;
    }
    const user = req.authUser;
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      res.status(400).json({ ok: false, error: 'id saknas' });
      return;
    }
    const existing = await prisma.cNotificationChemical.findFirst({
      where: { id, organisationId: user.organisationId },
    });
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Hittades inte' });
      return;
    }
    const body = req.body ?? {};
    const row = await prisma.cNotificationChemical.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(typeof body.annualConsumption === 'string'
          ? { annualConsumption: body.annualConsumption.trim() || null }
          : {}),
        ...(typeof body.storageNote === 'string'
          ? { storageNote: body.storageNote.trim() || null }
          : {}),
        ...(typeof body.hazardCode === 'string' ? { hazardCode: body.hazardCode.trim() || null } : {}),
        ...(typeof body.requiresSafetyDataSheet === 'boolean'
          ? { requiresSafetyDataSheet: body.requiresSafetyDataSheet }
          : {}),
        ...(typeof body.reviewStatus === 'string' ? { reviewStatus: body.reviewStatus } : {}),
        ...(typeof body.projectId === 'string'
          ? { projectId: body.projectId.trim() || null }
          : {}),
      },
    });
    res.json({ ok: true, chemical: row });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.delete('/api/admin/c-notification/chemicals/:id', requireAuth, rateLimitByUser(20, 60_000), async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      res.status(403).json({ ok: false, error: 'Kräver ADMIN-roll' });
      return;
    }
    const user = req.authUser;
    const id = String(req.params.id ?? '').trim();
    const existing = await prisma.cNotificationChemical.findFirst({
      where: { id, organisationId: user.organisationId },
    });
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Hittades inte' });
      return;
    }
    await prisma.cNotificationChemical.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
