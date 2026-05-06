import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import {
  createCaseSnapshot,
  exportFromSnapshot,
  getExportManifest,
  listCaseSnapshots,
} from '../modules/evidence/public';

const router = express.Router();

router.post(
  '/api/admin/evidence/snapshots/case/:requirementCaseId',
  requireAuth,
  rateLimitByUser(20, 60_000),
  async (req, res) => {
    try {
      if (!req.authUser || req.authUser.role !== 'ADMIN') {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const requirementCaseId = String(req.params.requirementCaseId || '').trim();
      const snapshotType = String(req.body?.snapshotType || 'EXPORT').trim();
      const { snapshotId } = await createCaseSnapshot({
        requirementCaseId,
        organisationId: req.authUser.organisationId,
        createdBy: req.authUser.id,
        snapshotType: snapshotType as any,
      });
      res.json({ ok: true, snapshotId });
    } catch (error: unknown) {
      res.status(400).json(toSafeErrorResponse(error));
    }
  },
);

router.get(
  '/api/admin/evidence/snapshots/case/:requirementCaseId',
  requireAuth,
  rateLimitByUser(60, 60_000),
  async (req, res) => {
    try {
      if (!req.authUser || req.authUser.role !== 'ADMIN') {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const requirementCaseId = String(req.params.requirementCaseId || '').trim();
      const rows = await listCaseSnapshots({
        requirementCaseId,
        organisationId: req.authUser.organisationId,
      });
      res.json({ ok: true, snapshots: rows });
    } catch (error: unknown) {
      res.status(400).json(toSafeErrorResponse(error));
    }
  },
);

router.post(
  '/api/admin/evidence/exports/snapshot/:snapshotId',
  requireAuth,
  rateLimitByUser(20, 60_000),
  async (req, res) => {
    try {
      if (!req.authUser || req.authUser.role !== 'ADMIN') {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const snapshotId = String(req.params.snapshotId || '').trim();
      const format = String(req.body?.format || 'ZIP').trim();
      const { exportId } = await exportFromSnapshot({
        snapshotId,
        organisationId: req.authUser.organisationId,
        createdBy: req.authUser.id,
        format: format as any,
      });
      res.json({ ok: true, exportId });
    } catch (error: unknown) {
      res.status(400).json(toSafeErrorResponse(error));
    }
  },
);

router.get(
  '/api/admin/evidence/exports/:exportId/manifest',
  requireAuth,
  rateLimitByUser(60, 60_000),
  async (req, res) => {
    try {
      if (!req.authUser || req.authUser.role !== 'ADMIN') {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const exportId = String(req.params.exportId || '').trim();
      const manifest = await getExportManifest({ exportId, organisationId: req.authUser.organisationId });
      res.json({ ok: true, exportId, manifest });
    } catch (error: unknown) {
      res.status(400).json(toSafeErrorResponse(error));
    }
  },
);

export default router;
