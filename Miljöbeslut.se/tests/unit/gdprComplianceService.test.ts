import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setProjectRetentionPolicy,
  archiveExpiredProjects,
  permanentlyDeleteProjectData,
  permanentlyDeleteUserData,
  exportUserPersonalData,
  runGdprMaintenanceJob,
} from '../../server/services/gdprComplianceService';
import { prisma } from '../../server/db/prisma';

vi.mock('../../server/repositories/tokenRepository', () => ({
  cleanupExpiredTokenRevocations: vi.fn().mockResolvedValue(3),
}));

vi.mock('../../server/db/prisma', () => ({
  prisma: {
    project: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    requirementCitation: { deleteMany: vi.fn() },
    requirementRecord: { deleteMany: vi.fn() },
    requirementCase: { deleteMany: vi.fn() },
    documentChunk: { deleteMany: vi.fn() },
    documentContent: { deleteMany: vi.fn() },
    documentRecord: { deleteMany: vi.fn() },
    projectPlanState: { deleteMany: vi.fn() },
    projectMember: { deleteMany: vi.fn(), findMany: vi.fn() },
    propertyAccessLog: { deleteMany: vi.fn(), findMany: vi.fn() },
    searchQueryLog: { deleteMany: vi.fn(), findMany: vi.fn() },
    auditTrail: { updateMany: vi.fn() },
    tokenRevocation: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

describe('GDPR Compliance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setProjectRetentionPolicy', () => {
    it('bör uppdatera projektets retentionUntil med rätt antal dagar', async () => {
      const projectId = 'test-project-123';
      const retentionDays = 30;

      await setProjectRetentionPolicy(projectId, retentionDays);

      expect(prisma.project.update).toHaveBeenCalledTimes(1);
      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: expect.objectContaining({
            retentionUntil: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('archiveExpiredProjects', () => {
    it('bör sätta status till ARCHIVED för alla projekt vars retention har löpt ut', async () => {
      // Låtsas att 5 projekt uppdaterades
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 5 });

      const count = await archiveExpiredProjects();

      expect(prisma.project.updateMany).toHaveBeenCalledTimes(1);
      expect(count).toBe(5);

      const callArgs = vi.mocked(prisma.project.updateMany).mock.calls[0][0];
      expect(callArgs.where?.status).toBe('CLOSED');
      expect(callArgs.data?.status).toBe('ARCHIVED');
    });
  });

  describe('permanentlyDeleteProjectData', () => {
    it('returnerar tidigt om projekt inte finns', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

      await permanentlyDeleteProjectData('non-existent');

      expect(prisma.project.delete).not.toHaveBeenCalled();
    });

    it('raderar alla relaterade dokument och projekt', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-del-1',
        documents: [],
      } as any);
      vi.mocked(prisma.requirementCitation.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementCase.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.documentRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectPlanState.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectMember.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.propertyAccessLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.searchQueryLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.project.delete).mockResolvedValue({} as any);

      await permanentlyDeleteProjectData('proj-del-1');

      expect(prisma.requirementCitation.deleteMany).toHaveBeenCalled();
      expect(prisma.requirementRecord.deleteMany).toHaveBeenCalled();
      expect(prisma.documentRecord.deleteMany).toHaveBeenCalled();
      expect(prisma.projectMember.deleteMany).toHaveBeenCalled();
      expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'proj-del-1' } });
    });

    it('raderar dokumentfiler och chunk-data för dokument med sökväg', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-del-2',
        documents: [
          { id: 'doc-1', absolutePath: '/storage/drafts/doc.docx' },
          { id: 'doc-2', absolutePath: null },
        ],
      } as any);
      vi.mocked(prisma.documentChunk.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.documentContent.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.requirementCitation.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementCase.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.documentRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectPlanState.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectMember.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.propertyAccessLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.searchQueryLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.project.delete).mockResolvedValue({} as any);

      await permanentlyDeleteProjectData('proj-del-2');

      expect(prisma.documentChunk.deleteMany).toHaveBeenCalledTimes(2);
      expect(prisma.documentContent.deleteMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('permanentlyDeleteUserData', () => {
    it('raderar ägda projekt och anonymiserar granskningsloggar', async () => {
      vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([{ projectId: 'proj-owned-1' }] as any);
      // For permanentlyDeleteProjectData call
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-owned-1',
        documents: [],
      } as any);
      vi.mocked(prisma.requirementCitation.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementCase.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.documentRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectPlanState.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectMember.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.propertyAccessLog.deleteMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.searchQueryLog.deleteMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.auditTrail.updateMany).mockResolvedValue({ count: 5 });
      vi.mocked(prisma.tokenRevocation.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.project.delete).mockResolvedValue({} as any);
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

      const result = await permanentlyDeleteUserData('user-del-1');

      expect(result.projectsDeleted).toBe(1);
      expect(result.auditLogsAnonymized).toBe(5);
      expect(result.tokensRevoked).toBe(1);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-del-1' } });
    });

    it('hanterar användare utan ägda projekt', async () => {
      vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as any);
      vi.mocked(prisma.projectMember.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.propertyAccessLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.searchQueryLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.auditTrail.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.tokenRevocation.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

      const result = await permanentlyDeleteUserData('user-no-projects');

      expect(result.projectsDeleted).toBe(0);
      expect(prisma.project.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('exportUserPersonalData', () => {
    it('kastar om användare inte finns', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(exportUserPersonalData('non-existent')).rejects.toThrow('User not found');
    });

    it('returnerar användardata med projekt, loggar och sökfrågor', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-export-1',
        organisationId: 'org-1',
        bankidId: '191212121212',
        role: 'USER',
        createdAt: new Date('2025-01-01'),
      } as any);
      vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
        {
          project: {
            id: 'p1',
            propertyDesignation: 'GÄVLE BRYNÄS 1:1',
            status: 'ACTIVE',
            createdAt: new Date(),
          },
        },
      ] as any);
      vi.mocked(prisma.propertyAccessLog.findMany).mockResolvedValue([
        {
          id: 'log-1',
          propertyDesignation: 'GÄVLE BRYNÄS 1:1',
          purpose: 'INQUIRY',
          timestamp: new Date(),
          responseClass: 'OK',
        },
      ] as any);
      vi.mocked(prisma.searchQueryLog.findMany).mockResolvedValue([
        { id: 'sq-1', query: 'markförorening', resultCount: 5, createdAt: new Date() },
      ] as any);

      const result = await exportUserPersonalData('user-export-1');

      expect(result.user.id).toBe('user-export-1');
      expect(result.projects).toHaveLength(1);
      expect(result.accessLogs).toHaveLength(1);
      expect(result.searchQueries).toHaveLength(1);
    });
  });

  describe('runGdprMaintenanceJob', () => {
    it('kör token-rensning, arkivering och tömning av utgångna projekt', async () => {
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.project.findMany).mockResolvedValue([{ id: 'proj-purge-1' }] as any);
      // For permanentlyDeleteProjectData
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-purge-1',
        documents: [],
      } as any);
      vi.mocked(prisma.requirementCitation.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.requirementCase.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.documentRecord.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectPlanState.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.projectMember.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.propertyAccessLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.searchQueryLog.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.project.delete).mockResolvedValue({} as any);

      const result = await runGdprMaintenanceJob();

      expect(result.tokensCleanedUp).toBe(3);
      expect(result.projectsArchived).toBe(2);
      expect(result.projectsPurged).toBe(1);
    });

    it('hanterar inga utgångna projekt att tömma', async () => {
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.project.findMany).mockResolvedValue([] as any);

      const result = await runGdprMaintenanceJob();

      expect(result.projectsPurged).toBe(0);
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });
  });
});
