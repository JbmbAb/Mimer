import express from 'express';
import secureApiRouter from './secureApi.express';
import geminiRouter from './geminiApi.express';
import geminiDbRouter from './geminiDbApi.express';
import coreRouter from './coreApi.express';
import gisRouter from './routes/gis.routes';
import geodataRouter from './routes/geodata.routes';
import geoRouter from './routes/geo.routes';
import legalRouter from './routes/legal.routes';
import documentRouter from './routes/document.routes';
import requirementsRouter from './routes/requirements.routes';
import classificationReviewRouter from './routes/classification-review.routes';
import adminPaginationRouter from './routes/admin.pagination';
import adminProjectPlanRouter from './routes/admin.project-plan';
import adminProjectPlanGeneratorRouter from './routes/admin.project-plan-generator';
import adminLogisticsGeneratorRouter from './routes/admin.logistics-generator';
import adminPermitGeneratorRouter from './routes/admin.permit-generator';
import adminPermitApplicationRouter from './routes/admin.permit-application';
import adminGreenCheckGeneratorRouter from './routes/admin.green-check-generator';
import adminCarbonRouter from './routes/admin.carbon';
import adminSewageRouter from './routes/admin.sewage';
import sewageDocumentRouter from './routes/sewage.routes';
import adminMigrationReadinessRouter from './routes/admin.migration-readiness';
import adminObservabilityRouter from './routes/admin.observability';
import adminRecoverabilityRouter from './routes/admin.recoverability';
import adminEvidenceRouter from './routes/admin.evidence';
import adminCNotificationChemicalsRouter from './routes/admin.c-notification-chemicals';
import pdfExportRouter from './routes/pdf-export.routes';
import { traceMiddleware } from './observability/trace';
import { propertyLookupRouter } from './integrations/propertyLookup';
import { initializeSentry } from './sentry';
import { logger } from './logger';
import { csrfProtection } from './security/csrf';
import internalBackgroundRouter from './routes/internal.background.routes';
import { getReadinessPayload } from './services/readinessService';

export function createApp() {
  const app = express();

  // Initialize Sentry error tracking
  initializeSentry(app);
  // Trace ID across all routes (AI→audit→submission)
  app.use(traceMiddleware());

  const corsAllowList = String(process.env.CORS_ALLOW_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowAnyCorsOrigin = corsAllowList.includes('*');

  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const allowOrigin = origin && (allowAnyCorsOrigin || corsAllowList.includes(origin));

    if (allowOrigin) {
      res.header('Access-Control-Allow-Origin', allowAnyCorsOrigin ? '*' : origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  /**
   * GET /health — liveness (processen svarar). Använd för lastbalanserare
   * som bara ska se att containern lever. Ingen DB-query.
   */
  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      liveness: 'up',
      service: 'miljobeslut-secure-backend',
      version: process.env.npm_package_version ?? 'unknown',
      ts: new Date().toISOString(),
    });
  });

  /**
   * GET /ready — readiness: databas, Vertex-konfiguration, object storage-läge.
   * 503 när DB inte svarar (resten är diagnostik).
   */
  app.get('/ready', async (_req, res) => {
    try {
      const payload = await getReadinessPayload();
      res.status(payload.ok ? 200 : 503).json({
        ...payload,
        service: 'miljobeslut-secure-backend',
        version: process.env.npm_package_version ?? 'unknown',
        ts: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Readiness check failed', { err: String(err) });
      res.status(503).json({
        ok: false,
        service: 'miljobeslut-secure-backend',
        error: 'readiness_internal_error',
        ts: new Date().toISOString(),
      });
    }
  });

  app.use(internalBackgroundRouter);

  // Aktivera CSRF-skydd för alla efterföljande rutter (muterande anrop valideras)
  app.use(csrfProtection);

  // Endpoint för klienten (Remix/React) att hämta sin tilldelade CSRF-token
  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: res.locals.csrfToken });
  });

  app.use(coreRouter);
  app.use(documentRouter);
  app.use(requirementsRouter);
  app.use(classificationReviewRouter);
  app.use(adminPaginationRouter);
  app.use(adminProjectPlanRouter);
  app.use(adminProjectPlanGeneratorRouter);
  app.use(adminLogisticsGeneratorRouter);
  app.use(adminPermitGeneratorRouter);
  app.use(adminPermitApplicationRouter);
  app.use(adminGreenCheckGeneratorRouter);
  app.use(adminCarbonRouter);
  app.use(adminSewageRouter);
  app.use(adminMigrationReadinessRouter);
  app.use(adminObservabilityRouter);
  app.use(adminRecoverabilityRouter);
  app.use(adminEvidenceRouter);
  app.use(adminCNotificationChemicalsRouter);
  app.use(pdfExportRouter);
  app.use(sewageDocumentRouter);
  app.use(propertyLookupRouter);

  // ROUTE MOUNT ORDER (viktigt):
  // gisRouter, geoRouter och legalRouter monteras FÖRE secureApiRouter.
  // secureApi.express.ts är en stor legacy-fil som innehåller historiska
  // dubletter av flera GIS- och legal-endpoints. Genom att montera de
  // konsoliderade router-filerna först vinner deras handlers, och de
  // dubletterade handlers i secureApi blir onåbar dead code tills vi
  // hinner flytta ut dem permanent.
  app.use(gisRouter);
  app.use(geodataRouter);
  app.use(geoRouter);
  app.use(legalRouter);
  app.use(secureApiRouter);
  app.use(geminiRouter);
  app.use(geminiDbRouter);

  return app;
}
