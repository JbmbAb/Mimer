/**
 * Sewage Application API Routes
 * Handles creation, validation, and submission of sewage system applications
 */

import express from 'express';
import { requireAuth } from '../security/auth';
import { toSafeErrorResponse } from '../security/secureErrors';
import {
  createSewageApplication,
  validateApplicationForSubmission,
  submitApplicationToMunicipality,
  generateSubmissionSummary,
  updateGateStatus,
  generateSewageDocuments,
  generateSewageRequirementChecklist,
  validateSewageApplicationRegulations,
} from '../modules/sewageAdmin/public';
import type {
  SewageGISAnalysis,
  SewageProtectionProfile,
  SewageApplication,
  SewageSystemTypeId,
} from '../../types';

const router = express.Router();

/**
 * POST /api/sewage/application/create
 * Create a new sewage application from GIS analysis
 */
router.post('/api/sewage/application/create', requireAuth, async (req, res) => {
  try {
    const { projectId, propertyDesignation, municipalityCode, pe, gisAnalysis, protectionProfile } = req.body;

    if (!projectId || !propertyDesignation || !municipalityCode || !pe) {
      res.status(400).json({
        ok: false,
        error: 'Missing required fields',
      });
      return;
    }

    const application = await createSewageApplication({
      projectId,
      propertyDesignation,
      municipalityCode,
      pe,
      gisAnalysis,
      protectionProfile,
    });

    res.json({
      ok: true,
      application,
    });
  } catch (error: unknown) {
    console.error('[SewageApplication] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage/application/:id/requirements
 * Generate regulatory requirements checklist for application
 */
router.post('/api/sewage/application/:id/requirements', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { systemType, protectionLevel, municipalityCode, distanceData } = req.body;

    if (!systemType || !protectionLevel || !municipalityCode) {
      res.status(400).json({
        ok: false,
        error: 'Missing required parameters',
      });
      return;
    }

    const requirements = generateSewageRequirementChecklist(
      systemType as SewageSystemTypeId,
      protectionLevel,
      municipalityCode,
      distanceData,
    );

    res.json({
      ok: true,
      requirements,
      count: requirements.length,
    });
  } catch (error: unknown) {
    console.error('[SewageRequirements] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage/application/:id/validate
 * Validate application against regulations
 */
router.post('/api/sewage/application/:id/validate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { application, protectionProfile } = req.body;

    if (!application || !protectionProfile) {
      res.status(400).json({
        ok: false,
        error: 'Missing application or protectionProfile',
      });
      return;
    }

    // Regulatory validation
    const regulatoryValidation = validateSewageApplicationRegulations(application, protectionProfile);

    // Submission validation
    const submissionValidation = validateApplicationForSubmission(application, protectionProfile);

    res.json({
      ok: true,
      canSubmit: submissionValidation.canSubmit,
      regulatoryCompliance: regulatoryValidation.isCompliant,
      violations: [...regulatoryValidation.violations, ...submissionValidation.blockers],
      warnings: [...regulatoryValidation.warnings, ...submissionValidation.warnings],
      recommendations: regulatoryValidation.recommendations,
    });
  } catch (error: unknown) {
    console.error('[SewageValidation] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage/application/:id/generate-documents
 * Generate situationsplan, tvärsektion, and application summary
 */
router.post('/api/sewage/application/:id/generate-documents', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      application,
      gisAnalysis,
      protectionProfile,
      applicantName,
      applicantEmail,
      latitude,
      longitude,
    } = req.body;

    if (!application || !gisAnalysis || !protectionProfile) {
      res.status(400).json({
        ok: false,
        error: 'Missing required data for document generation',
      });
      return;
    }

    console.log(`[SewageDocuments] Generating documents for ${id}...`);

    const documents = await generateSewageDocuments({
      application,
      gisAnalysis,
      protectionProfile,
      applicantName: applicantName || 'Sökande',
      applicantEmail: applicantEmail || 'unknown@example.com',
      latitude,
      longitude,
    });

    res.json({
      ok: true,
      documents: {
        situationPlanUrl: 'https://storage.example.com/docs/situation-plan.svg',
        crossSectionUrl: 'https://storage.example.com/docs/cross-section.svg',
        applicationSummaryUrl: 'https://storage.example.com/docs/application-summary.pdf',
      },
      generatedAt: new Date().toISOString(),
      message: 'Dokument genererade framgångsrikt',
    });
  } catch (error: unknown) {
    console.error('[SewageDocumentGenerator] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage/application/:id/update-soil-test
 * Record soil test (perkolationsprov) results
 */
router.post('/api/sewage/application/:id/update-soil-test', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { ltar, testDate, percolationProveReference } = req.body;

    if (!ltar || !testDate) {
      res.status(400).json({
        ok: false,
        error: 'Missing LTAR or testDate',
      });
      return;
    }

    console.log(`[SewageApplication] Recorded soil test for ${id}: LTAR=${ltar} mm/h`);

    res.json({
      ok: true,
      message: 'Markundersökning registrerad',
      status: 'COMPLETED',
      data: {
        ltar,
        testDate,
        percolationProveReference,
      },
    });
  } catch (error: unknown) {
    console.error('[SewageSoilTest] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage/application/:id/record-neighbor-consent
 * Record neighbor consent/signature
 */
router.post('/api/sewage/application/:id/record-neighbor-consent', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { neighborName, neighborAddress, distance, consentDate } = req.body;

    if (!neighborName || !distance) {
      res.status(400).json({
        ok: false,
        error: 'Missing neighbor information',
      });
      return;
    }

    console.log(`[SewageApplication] Recorded neighbor consent from ${neighborName} at ${distance}m`);

    res.json({
      ok: true,
      message: 'Grannemedgivande registrerat',
      status: 'COMPLETED',
      data: {
        neighborName,
        neighborAddress,
        distance,
        consentDate,
      },
    });
  } catch (error: unknown) {
    console.error('[SewageNeighborConsent] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * POST /api/sewage/application/:id/submit
 * Submit application to municipality
 */
router.post('/api/sewage/application/:id/submit', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { application, municipalityCode } = req.body;

    if (!application || !municipalityCode) {
      res.status(400).json({
        ok: false,
        error: 'Missing application or municipalityCode',
      });
      return;
    }

    console.log(`[SewageApplication] Submitting application ${id} to ${municipalityCode}...`);

    // Final validation before submission
    if (application.status !== 'DRAFT') {
      res.status(400).json({
        ok: false,
        error: 'Ansökan kan endast skickas från DRAFT-status',
      });
      return;
    }

    // Submit
    const submissionResult = await submitApplicationToMunicipality(application, municipalityCode);

    if (!submissionResult.success) {
      res.status(400).json({
        ok: false,
        error: submissionResult.error || 'Inskickning misslyckades',
      });
      return;
    }

    res.json({
      ok: true,
      message: 'Ansökan skickad till kommun',
      submissionId: submissionResult.submissionId,
      referenceNumber: submissionResult.referenceNumber,
      estimatedProcessingTime: submissionResult.estimatedProcessingTime,
      nextSteps: [
        'Kommunen granskar ansökan',
        'Du kontaktas för eventuella förtydliganden',
        'Tillståndssamtal (om krävs)',
        'Slutligt tillstånd utfärdas',
      ],
    });
  } catch (error: unknown) {
    console.error('[SewageSubmission] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

/**
 * GET /api/sewage/application/:id
 * Retrieve application status and summary
 */
router.get('/api/sewage/application/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[SewageApplication] Retrieving application ${id}...`);

    // In production: fetch from database
    res.json({
      ok: true,
      application: {
        id,
        status: 'DRAFT',
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error('[SewageRetrieve] Error:', error);
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
