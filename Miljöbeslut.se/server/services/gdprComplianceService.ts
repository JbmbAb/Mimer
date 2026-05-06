import { prisma } from '../db/prisma';
import { cleanupExpiredTokenRevocations } from '../repositories/tokenRepository';

/**
 * GDPR Compliance Service
 * Handles data retention policies, user data deletion, and privacy obligations.
 */

/**
 * Marks a user's personal data for retention based on legal hold or auto-expiry.
 * Projects are retained for configured period, then marked for purge.
 */
export async function setProjectRetentionPolicy(projectId: string, retentionDays: number): Promise<void> {
  const retentionUntil = new Date();
  retentionUntil.setDate(retentionUntil.getDate() + retentionDays);

  await prisma.project.update({
    where: { id: projectId },
    data: { retentionUntil },
  });
}

/**
 * Soft-delete a user's projects that have exceeded retention period.
 * Marks them as ARCHIVED but doesn't actually delete data yet.
 * Used for compliance audits before permanent deletion.
 */
export async function archiveExpiredProjects(): Promise<number> {
  const now = new Date();

  const result = await prisma.project.updateMany({
    where: {
      status: 'CLOSED',
      retentionUntil: {
        lt: now,
      },
    },
    data: {
      status: 'ARCHIVED',
    },
  });

  return result.count;
}

/**
 * PERMANENT DELETION: Removes all project data when retention period expires.
 */
export async function permanentlyDeleteProjectData(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      documents: {
        select: { id: true, absolutePath: true },
      },
    },
  });

  if (!project) return;

  // 1. Delete all requirement related data
  await prisma.requirementCitation.deleteMany({
    where: { case: { projectId } },
  });
  await prisma.requirementRecord.deleteMany({
    where: { projectId },
  });
  await prisma.requirementCase.deleteMany({
    where: { projectId },
  });

  // 2. Delete document content and chunks
  for (const doc of project.documents) {
    await prisma.documentChunk.deleteMany({
      where: { documentId: doc.id },
    });
    await prisma.documentContent.deleteMany({
      where: { documentId: doc.id },
    });

    // Try to delete file from disk if absolutePath exists
    if (doc.absolutePath) {
      try {
        const { deleteStorageFile } = await import('./documentObjectStorage');
        await deleteStorageFile(doc.absolutePath);
      } catch (e) {
        console.warn(`Failed to delete stored file: ${doc.absolutePath}`, e);
      }
    }
  }

  // 3. Delete document records
  await prisma.documentRecord.deleteMany({
    where: { projectId },
  });

  // 4. Delete project plan state
  await prisma.projectPlanState.deleteMany({
    where: { projectId },
  });

  // 5. Delete project memberships and logs
  await prisma.projectMember.deleteMany({
    where: { projectId },
  });
  await prisma.propertyAccessLog.deleteMany({
    where: { projectId },
  });
  await prisma.searchQueryLog.deleteMany({
    where: { projectId },
  });

  // 6. Finally delete the project itself
  await prisma.project.delete({
    where: { id: projectId },
  });

  console.info(`Permanently deleted project data for project: ${projectId}`);
}

/**
 * PERMANENT DELETION: Removes all user data when user account is deleted.
 */
export async function permanentlyDeleteUserData(userId: string): Promise<{
  projectsDeleted: number;
  auditLogsAnonymized: number;
  tokensRevoked: number;
}> {
  // Get user's projects where they are the OWNER
  const ownedProjects = await prisma.projectMember.findMany({
    where: { userId, accessRole: 'OWNER' },
    select: { projectId: true },
  });

  // Delete all owned projects permanently
  for (const membership of ownedProjects) {
    await permanentlyDeleteProjectData(membership.projectId);
  }

  // ... (rest of the logic for removing memberships from other projects)
  await prisma.projectMember.deleteMany({
    where: { userId },
  });

  // DELETE: All user access logs (PII)
  await prisma.propertyAccessLog.deleteMany({
    where: { userId },
  });

  // DELETE: All user search queries (PII)
  await prisma.searchQueryLog.deleteMany({
    where: { userId },
  });

  // ANONYMIZE: Audit trail (cannot be deleted for legal reasons)
  const auditLogResult = await prisma.auditTrail.updateMany({
    where: { userId },
    data: { userId: null }, // Anonymize history
  });

  // REVOKE: All user tokens
  const tokenResult = await prisma.tokenRevocation.deleteMany({
    where: { userId },
  });

  // DELETE: User account
  await prisma.user.delete({
    where: { id: userId },
  });

  return {
    projectsDeleted: ownedProjects.length,
    auditLogsAnonymized: auditLogResult.count,
    tokensRevoked: tokenResult.count,
  };
}

/**
 * Export user's personal data in machine-readable format (GDPR Article 20).
 */
export async function exportUserPersonalData(userId: string): Promise<{
  user: any;
  projects: any[];
  accessLogs: any[];
  searchQueries: any[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organisationId: true,
      bankidId: true, // Include eID for transparency
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const projects = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        select: {
          id: true,
          propertyDesignation: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  const accessLogs = await prisma.propertyAccessLog.findMany({
    where: { userId },
    select: {
      id: true,
      propertyDesignation: true,
      purpose: true,
      timestamp: true,
      responseClass: true,
    },
  });

  const searchQueries = await prisma.searchQueryLog.findMany({
    where: { userId },
    select: {
      id: true,
      query: true,
      resultCount: true,
      createdAt: true,
    },
  });

  return {
    user,
    projects,
    accessLogs,
    searchQueries,
  };
}

/**
 * Periodic maintenance: cleanup expired tokens and old logs.
 */
export async function runGdprMaintenanceJob(): Promise<{
  tokensCleanedUp: number;
  projectsArchived: number;
  projectsPurged: number;
}> {
  // 1. Cleanup expired tokens
  const tokensCleanedUp = await cleanupExpiredTokenRevocations();

  // 2. Archive projects that passed their soft retention period
  const projectsArchived = await archiveExpiredProjects();

  // 3. PERMANENTLY PURGE projects that have been ARCHIVED and passed their final retention limit
  // Here we assume a default extra 30 days buffer for archived projects before hard delete
  const purgeThreshold = new Date();
  purgeThreshold.setDate(purgeThreshold.getDate() - 30);

  const projectsToPurge = await prisma.project.findMany({
    where: {
      status: 'ARCHIVED',
      retentionUntil: {
        lt: purgeThreshold,
      },
    },
    select: { id: true },
  });

  for (const project of projectsToPurge) {
    await permanentlyDeleteProjectData(project.id);
  }

  return {
    tokensCleanedUp,
    projectsArchived,
    projectsPurged: projectsToPurge.length,
  };
}
