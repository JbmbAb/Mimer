import http from 'http';
import { startSearchWorker } from './services/searchWorker';
import { loadEnvFile } from './loadEnv';
import { logger } from './logger';
import { createApp } from './createApp';
import { initializeWebSocketServer } from './websocket';
import { captureException } from './sentry';
import { runGdprMaintenanceJob } from './services/gdprComplianceService';
import { startMunicipalityStatusPolling } from './services/municipalityStatusPolling';
import { startDomstolScheduler } from './services/domstolRssSchedulerService';
import { warnProductionDevFlags } from './warnProductionDevFlags';

loadEnvFile();
loadEnvFile('.env.local', { includePrefixes: ['BANKID_'] });
warnProductionDevFlags();

const app = createApp();
const port = Number(process.env.PORT || 8787);

// Create HTTP server for WebSocket support
const server = http.createServer(app);
initializeWebSocketServer(server);

// In-process GDPR cron — sätt GDPR_CRON_IN_PROCESS=false när Cloud Scheduler anropar
// POST /api/internal/background/gdpr-maintenance med X-Internal-Token.
const gdprInProcess = process.env.GDPR_CRON_IN_PROCESS !== 'false';
if (gdprInProcess) {
  const MAINTENANCE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  setInterval(async () => {
    try {
      logger.info('Starting daily GDPR maintenance job...');
      const result = await runGdprMaintenanceJob();
      logger.info('GDPR maintenance job completed', result);
    } catch (error) {
      logger.error('GDPR maintenance job failed', { error: String(error) });
    }
  }, MAINTENANCE_INTERVAL);

  setTimeout(async () => {
    try {
      await runGdprMaintenanceJob();
    } catch (error) {
      logger.error('Initial GDPR maintenance job failed', { error: String(error) });
      captureException(error, { context: 'initial-gdpr-maintenance' });
    }
  }, 5000);
} else {
  logger.info('GDPR in-process cron disabled; use /api/internal/background/gdpr-maintenance');
}

if (process.env.SEARCH_WORKER_ENABLED !== 'false') {
  const pollMs = Math.max(500, Number(process.env.SEARCH_WORKER_POLL_MS || 2500));
  const maxJobs = Math.max(1, Number(process.env.SEARCH_WORKER_MAX_JOBS || 3));
  startSearchWorker(pollMs, maxJobs);
}

// Start municipality status polling (every 6 hours)
const MUNICIPALITY_POLL_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
startMunicipalityStatusPolling(MUNICIPALITY_POLL_INTERVAL);

// Domstols-RSS-ingest (default aktiverad; styrs av DOMSTOL_RSS_ENABLED).
// Intervall via DOMSTOL_RSS_INTERVAL_MS (default 4h i schedulerservice).
if (process.env.DOMSTOL_RSS_ENABLED !== 'false') {
  try {
    startDomstolScheduler();
  } catch (err) {
    logger.error('Failed to start domstol-rss scheduler', { error: String(err) });
    captureException(err, { context: 'domstol-rss-scheduler-start' });
  }
}

server.listen(port, () => {
  logger.info('Miljöbeslut backend started with WebSocket support', { port });
});
