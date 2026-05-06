import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import { buildMigrationReadinessReport } from '../modules/migration/public';

const router = express.Router();

router.get('/api/admin/migration/readiness', requireAuth, rateLimitByUser(10, 60_000), async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'ADMIN') {
      res.status(403).json({ ok: false, error: 'Admin role required' });
      return;
    }
    const report = buildMigrationReadinessReport();
    res.json({ ok: true, report });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
