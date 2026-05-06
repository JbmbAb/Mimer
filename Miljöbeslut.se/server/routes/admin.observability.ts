import express from 'express';
import { requireAuth } from '../security/auth';
import { rateLimitByUser } from '../security/rateLimit';
import { snapshotMetrics } from '../observability/metrics';

const router = express.Router();

router.get('/api/admin/observability/metrics', requireAuth, rateLimitByUser(20, 60_000), async (req, res) => {
  if (!req.authUser || req.authUser.role !== 'ADMIN') {
    res.status(403).json({ ok: false, error: 'Admin role required' });
    return;
  }
  res.json({ ok: true, metrics: snapshotMetrics(), at: new Date().toISOString() });
});

export default router;
