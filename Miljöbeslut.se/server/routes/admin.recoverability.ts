import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import { enqueueSearchJob } from '../modules/search/public';
import { listDocumentIdsForProject } from '../modules/recoverability/public';

const router = express.Router();

router.post(
  '/api/admin/recoverability/reindex/project/:projectId',
  requireAuth,
  rateLimitByUser(10, 60_000),
  async (req, res) => {
    try {
      if (!req.authUser || req.authUser.role !== 'ADMIN') {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const projectId = String(req.params.projectId || '').trim();
      if (!projectId) {
        res.status(400).json({ ok: false, error: 'projectId required' });
        return;
      }

      const docIds = await listDocumentIdsForProject({
        projectId,
        organisationId: req.authUser.organisationId,
        take: 5000,
      });

      const jobs = await Promise.all(
        docIds.map((documentId) =>
          enqueueSearchJob({
            type: 'EMBED_DOC',
            projectId,
            payload: { documentId, projectId, organisationId: req.authUser!.organisationId },
          }),
        ),
      );

      res.json({ ok: true, projectId, enqueued: jobs.length });
    } catch (error: unknown) {
      res.status(400).json(toSafeErrorResponse(error));
    }
  },
);

export default router;
