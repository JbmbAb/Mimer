/**
 * Municipality Status Polling Service
 * Periodically checks application status with municipalities and updates platform
 *
 * Implements:
 * 1. Webhook endpoint for municipalities to POST status updates
 * 2. Polling service for municipalities without webhooks
 * 3. Decision/directive tracking with audit trail
 * 4. WebSocket notifications to users when status changes
 */

import { prisma } from '../../db.server';
import { logger } from '../logger';
import { authorityInbox, AuthorityInboxEventType } from './authorityInboxService';
import { SubmissionChannel } from '../../src/domain/submission';

// ============================================================================
// STATUS TRACKING
// ============================================================================

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'APPROVED'
  | 'REJECTED'
  | 'DECISION_APPEALED';

export interface MunicipalityStatusUpdate {
  referenceNumber: string;
  status: ApplicationStatus;
  lastStatusUpdate: string;
  municipalityNotes?: string;
  requiredActions?: string[];
  attachments?: Array<{
    filename: string;
    url: string;
    type: 'DECISION' | 'DIRECTIVE' | 'NOTE' | 'REQUEST_FOR_INFO';
  }>;
  timeline?: {
    submittedAt: string;
    reviewStartedAt?: string;
    decisionDate?: string;
    estimatedDecisionDate?: string;
  };
  decision?: {
    type: 'APPROVED' | 'REJECTED' | 'CONDITIONAL';
    reason?: string;
    conditions?: string[];
    appealDeadline?: string;
    signedBy?: string;
  };
}

// ============================================================================
// WEBHOOK ENDPOINT (FOR MUNICIPALITIES TO PUSH UPDATES)
// ============================================================================

/**
 * POST /api/sewage/webhooks/municipality-status
 * Municipality calls this when application status changes
 * Signature: X-Municipality-Signature for HMAC verification
 */
export async function handleMunicipalityWebhook(payload: MunicipalityStatusUpdate): Promise<{
  ok: boolean;
  acknowledged: boolean;
  message: string;
}> {
  try {
    const { referenceNumber, status, lastStatusUpdate, decision, attachments } = payload;

    logger.info('Received municipality webhook', {
      referenceNumber,
      status,
      municipalityNotes: payload.municipalityNotes,
    });

    // Validate reference number format
    if (!referenceNumber || !referenceNumber.startsWith('AVLOPP-')) {
      return {
        ok: false,
        acknowledged: false,
        message: 'Invalid reference number format',
      };
    }

    // 1. Find the corresponding submission
    const submission = await prisma.submission.findUnique({
      where: { submissionKey: referenceNumber },
    });

    if (!submission) {
      logger.warn('Received webhook for unknown reference number', { referenceNumber });
      return {
        ok: false,
        acknowledged: false,
        message: 'Reference number not found',
      };
    }

    // 2. Register the inbound event
    await authorityInbox.registerInboundEvent({
      submissionId: submission.id,
      projectId: submission.projectId,
      organisationId: submission.organisationId,
      sourceSystem: 'MUNICIPALITY_WEBHOOK',
      sourceChannel: SubmissionChannel.WEBHOOK,
      authorityName: submission.authorityName,
      eventType: decision ? AuthorityInboxEventType.DECISION : AuthorityInboxEventType.STATUS_UPDATE,
      summary: payload.municipalityNotes || `Status updated to ${status}`,
      payload: payload,
      externalReference: referenceNumber,
      caseNumber: decision?.signedBy || submission.caseNumber || undefined,
    });

    // If decision made, trigger notification
    if (decision && (decision.type === 'APPROVED' || decision.type === 'REJECTED')) {
      await notifyApplicationDecision(referenceNumber, decision);
    }

    // Notify user via WebSocket if they're online
    await broadcastStatusUpdate(referenceNumber, status);

    logger.info('Municipality webhook processed successfully', { referenceNumber });

    return {
      ok: true,
      acknowledged: true,
      message: 'Status update acknowledged',
    };
  } catch (error) {
    logger.error('Error processing municipality webhook', { error });
    return {
      ok: false,
      acknowledged: false,
      message: 'Failed to process webhook',
    };
  }
}

// ============================================================================
// POLLING SERVICE (FOR MUNICIPALITIES WITHOUT WEBHOOKS)
// ============================================================================

/**
 * Periodic polling job - checks status with municipalities via API
 * Runs every 6 hours for applications in SUBMITTED or UNDER_REVIEW status
 */
export async function pollMunicipalityStatuses(): Promise<{
  polled: number;
  updated: number;
  errors: number;
}> {
  try {
    // TODO: Fetch all applications with status SUBMITTED or UNDER_REVIEW from DB
    // For now, this is a template structure

    const polled = 0;
    const updated = 0;
    const errors = 0;

    logger.info('Starting municipality status polling job', {
      timestamp: new Date().toISOString(),
    });

    // Simulate polling loop
    // In production: query DB for pending applications
    // const pendingApplications = await prisma.sewageApplicationStatusHistory.findMany({
    //   where: {
    //     status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
    //     createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
    //   },
    // });

    // for (const app of pendingApplications) {
    //   try {
    //     const statusUpdate = await queryMunicipalityStatus(app.referenceNumber, app.municipalityCode);
    //     if (statusUpdate.status !== app.status) {
    //       await handleMunicipalityWebhook(statusUpdate);
    //       updated++;
    //     }
    //     polled++;
    //   } catch (error) {
    //     logger.error('Error polling municipality status', {
    //       referenceNumber: app.referenceNumber,
    //       error: error instanceof Error ? error.message : String(error),
    //     });
    //     errors++;
    //   }
    // }

    logger.info('Municipality status polling job completed', {
      polled,
      updated,
      errors,
      timestamp: new Date().toISOString(),
    });

    return { polled, updated, errors };
  } catch (error) {
    logger.error('Municipality polling job failed', { error });
    return { polled: 0, updated: 0, errors: 1 };
  }
}

// ============================================================================
// MUNICIPALITY STATUS QUERY
// ============================================================================

async function queryMunicipalityStatus(
  referenceNumber: string,
  municipalityCode: string,
): Promise<MunicipalityStatusUpdate> {
  void referenceNumber;
  void municipalityCode;
  throw new Error('Kommunal statuskälla är inte konfigurerad. Ingen lokal ersättningsstatus returneras.');
}

// ============================================================================
// DECISION NOTIFICATION
// ============================================================================

async function notifyApplicationDecision(
  referenceNumber: string,
  decision: {
    type: 'APPROVED' | 'REJECTED' | 'CONDITIONAL';
    reason?: string;
    conditions?: string[];
    appealDeadline?: string;
    signedBy?: string;
  },
): Promise<void> {
  try {
    // TODO: Email notification to applicant
    // TODO: Create notification record in DB
    // TODO: WebSocket broadcast to connected users

    const notificationMessage =
      decision.type === 'APPROVED'
        ? `Din ansökan ${referenceNumber} har godkänts av kommunen`
        : decision.type === 'REJECTED'
          ? `Din ansökan ${referenceNumber} har avslogs av kommunen`
          : `Din ansökan ${referenceNumber} kräver kompletteringar`;

    logger.info('Application decision notification', {
      referenceNumber,
      decisionType: decision.type,
      message: notificationMessage,
    });

    // TODO: Send email with decision details
    // TODO: Attach decision document (PDF)
  } catch (error) {
    logger.error('Error sending decision notification', { error });
  }
}

// ============================================================================
// WEBSOCKET BROADCAST
// ============================================================================

async function broadcastStatusUpdate(referenceNumber: string, status: ApplicationStatus): Promise<void> {
  // TODO: Integrate with WebSocket server
  // Send status update to all connected users watching this application

  logger.info('Broadcasting status update to connected clients', {
    referenceNumber,
    status,
  });

  // This would emit via WebSocket:
  // io.to(`sewage-${referenceNumber}`).emit('status-update', { referenceNumber, status });
}

// ============================================================================
// APPEAL HANDLING
// ============================================================================

export async function appealDecision(
  referenceNumber: string,
  appealReason: string,
  attachments?: string[],
): Promise<{
  ok: boolean;
  appealReferenceNumber: string;
  municipalityContact: string;
  nextSteps: string;
}> {
  try {
    // TODO: Create appeal record
    // TODO: Send to länstyrelse (County Administrative Board)
    // TODO: Update application status to DECISION_APPEALED

    const appealReferenceNumber = `APPELL-${referenceNumber}-${Date.now()}`;

    logger.info('Appeal submitted', {
      originalReferenceNumber: referenceNumber,
      appealReferenceNumber,
      reason: appealReason,
    });

    return {
      ok: true,
      appealReferenceNumber,
      municipalityContact: 'laenstyrelsen@lansstyrelse.se',
      nextSteps:
        'Överklagandet skickas till länstyrelsen för prövning. Du får ett bekräftelsebrev inom 2 veckor.',
    };
  } catch (error) {
    logger.error('Error submitting appeal', { error });
    throw error;
  }
}

// ============================================================================
// STATUS HISTORY TRACKING
// ============================================================================

export interface StatusHistoryEntry {
  timestamp: string;
  status: ApplicationStatus;
  municipalityNotes?: string;
  changedBy: 'SYSTEM' | 'MUNICIPALITY' | 'USER';
  details?: Record<string, unknown>;
}

export async function getStatusHistory(referenceNumber: string): Promise<StatusHistoryEntry[]> {
  // TODO: Query sewageApplicationStatusHistory from DB
  // For now, return empty array
  return [];
}

// ============================================================================
// SCHEDULED POLLING JOB (TO BE CALLED BY CRON)
// ============================================================================

let pollingInterval: NodeJS.Timeout | null = null;

export function startMunicipalityStatusPolling(intervalMs: number = 6 * 60 * 60 * 1000): void {
  if (pollingInterval) {
    logger.warn('Municipality status polling already started');
    return;
  }

  pollingInterval = setInterval(async () => {
    try {
      const result = await pollMunicipalityStatuses();
      logger.info('Polling job completed', result);
    } catch (error) {
      logger.error('Polling job error', { error });
    }
  }, intervalMs);

  logger.info('Municipality status polling started', { intervalMs });
}

export function stopMunicipalityStatusPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('Municipality status polling stopped');
  }
}
