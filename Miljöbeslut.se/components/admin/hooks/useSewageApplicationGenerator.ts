/**
 * useSewageApplicationGenerator Hook
 * Manages the complete sewage application workflow
 */

import { useMutation } from '@tanstack/react-query';
import type {
  SewageApplication,
  SewageGISAnalysis,
  SewageProtectionProfile,
  SewageSystemTypeId,
} from '../../../types';

export interface UseSewageApplicationGeneratorOptions {
  onSuccess?: (data: { application: SewageApplication }) => void;
  onError?: (error: Error) => void;
}

/**
 * Mutation to create sewage application
 */
export function useSewageApplicationCreate(options?: UseSewageApplicationGeneratorOptions) {
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      propertyDesignation: string;
      municipalityCode: string;
      pe: number;
      gisAnalysis: SewageGISAnalysis;
      protectionProfile: SewageProtectionProfile;
    }) => {
      const response = await fetch('/api/sewage/application/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create application');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      options?.onSuccess?.({ application: data.application });
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * Mutation to validate application
 */
export function useSewageApplicationValidate(options?: UseSewageApplicationGeneratorOptions) {
  return useMutation({
    mutationFn: async (params: {
      applicationId: string;
      application: SewageApplication;
      protectionProfile: SewageProtectionProfile;
    }) => {
      const response = await fetch(`/api/sewage/application/${params.applicationId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application: params.application,
          protectionProfile: params.protectionProfile,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Validation failed');
      }

      return await response.json();
    },
  });
}

/**
 * Mutation to generate documents
 */
export function useSewageDocumentGenerator(options?: UseSewageApplicationGeneratorOptions) {
  return useMutation({
    mutationFn: async (params: {
      applicationId: string;
      application: SewageApplication;
      gisAnalysis: SewageGISAnalysis;
      protectionProfile: SewageProtectionProfile;
      applicantName: string;
      applicantEmail: string;
      latitude: number;
      longitude: number;
    }) => {
      const response = await fetch(`/api/sewage/application/${params.applicationId}/generate-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Document generation failed');
      }

      return await response.json();
    },
  });
}

/**
 * Mutation to submit application to municipality
 */
export function useSewageApplicationSubmit(options?: UseSewageApplicationGeneratorOptions) {
  return useMutation({
    mutationFn: async (params: {
      applicationId: string;
      application: SewageApplication;
      municipalityCode: string;
    }) => {
      const response = await fetch(`/api/sewage/application/${params.applicationId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application: params.application,
          municipalityCode: params.municipalityCode,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Submission failed');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      options?.onSuccess?.({ application: data.application });
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}

/**
 * Mutation to record soil test
 */
export function useSewageSoilTestRecord(options?: UseSewageApplicationGeneratorOptions) {
  return useMutation({
    mutationFn: async (params: {
      applicationId: string;
      ltar: number;
      testDate: string;
      percolationProveReference?: string;
    }) => {
      const response = await fetch(`/api/sewage/application/${params.applicationId}/update-soil-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Soil test update failed');
      }

      return await response.json();
    },
  });
}

/**
 * Mutation to record neighbor consent
 */
export function useSewageNeighborConsent(options?: UseSewageApplicationGeneratorOptions) {
  return useMutation({
    mutationFn: async (params: {
      applicationId: string;
      neighborName: string;
      neighborAddress: string;
      distance: number;
      consentDate: string;
    }) => {
      const response = await fetch(
        `/api/sewage/application/${params.applicationId}/record-neighbor-consent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Neighbor consent recording failed');
      }

      return await response.json();
    },
  });
}
