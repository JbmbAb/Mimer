/**
 * Sewage Portal View
 * Main module for private sewage system applications
 * Workflow: Property → GIS Analysis → System Selection → Validation → Submission
 */

import React, { useState } from 'react';
import { MapPin, CheckCircle, AlertCircle, FileText, Send } from 'lucide-react';
import type { SewageApplication, SewageGISAnalysis, SewageProtectionProfile } from '../../../../types';
import '../module-common.css';
import './sewage-portal.css';
import { useSewageAnalysis } from '../../hooks/useSewageAnalysis';
import SewageSystemSelector from './SewageSystemSelector';
import SewageRequirementChecklist from './SewageRequirementChecklist';
import SewageMapView from './SewageMapView';
import SewageApplicationSummary from './SewageApplicationSummary';
import { LoadingSpinner, ErrorAlert } from '../../shared';

type SewageStep =
  | 'property'
  | 'analysis'
  | 'systemSelection'
  | 'requirements'
  | 'documents'
  | 'submission'
  | 'confirmation';

const SewagePortalView: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<SewageStep>('property');
  const [propertyDesignation, setPropertyDesignation] = useState('');
  const [municipalityCode, setMunicipalityCode] = useState('');
  const [pe, setPe] = useState(8);
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);

  const [analysis, setAnalysis] = useState<SewageGISAnalysis | null>(null);
  const [protectionProfile, setProtectionProfile] = useState<SewageProtectionProfile | null>(null);
  const [application, setApplication] = useState<SewageApplication | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);

  const [dismissedError, setDismissedError] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [isGeneratingDocuments, setIsGeneratingDocuments] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  // Mutation for GIS analysis
  const {
    mutate: analyzeProperty,
    isPending: isAnalyzing,
    error: analysisError,
  } = useSewageAnalysis({
    onSuccess: (data) => {
      setAnalysis(data.analysis);
      setProtectionProfile(data.protectionProfile);
      setCurrentStep('systemSelection');
    },
  });

  const handleStartAnalysis = () => {
    if (!propertyDesignation || !municipalityCode || pe < 1 || pe > 200) {
      alert('Fyll i alla obligatoriska fält (PE: 1-200)');
      return;
    }

    analyzeProperty({
      propertyDesignation,
      municipalityCode,
      latitude,
      longitude,
      pe,
    });
    setCurrentStep('analysis');
  };

  const handleSystemSelected = (systemId: string) => {
    setSelectedSystemId(systemId);
    if (application) {
      setApplication({
        ...application,
        selectedSystemType: systemId as any,
      });
    }
    setCurrentStep('requirements');
  };

  const handleGenerateDocuments = async () => {
    if (!application || !protectionProfile || !analysis) {
      setDocumentError('Saknade uppgifter för dokumentgenerering');
      return;
    }

    setIsGeneratingDocuments(true);
    setDocumentError(null);

    try {
      const response = await fetch('/api/sewage/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application,
          protectionProfile,
          analysis,
        }),
      });

      if (!response.ok) {
        throw new Error('Fel vid dokumentgenerering');
      }

      const data = await response.json();

      // Update application with generated documents
      setApplication({
        ...application,
        situationPlan: {
          generatedDate: data.generatedAt,
          url: data.situationPlanDataUrl,
        },
        crossSection: {
          generatedDate: data.generatedAt,
          url: data.crossSectionDataUrl,
        },
      });

      setCurrentStep('submission');
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Okänt fel');
    } finally {
      setIsGeneratingDocuments(false);
    }
  };

  const handleSubmitApplication = (submittedReferenceNumber: string) => {
    setReferenceNumber(submittedReferenceNumber);
    setCurrentStep('confirmation');
  };

  const progressSteps = [
    { id: 'property', label: 'Fastighet', icon: MapPin },
    { id: 'analysis', label: 'GIS-analys', icon: MapPin },
    { id: 'systemSelection', label: 'Systemval', icon: CheckCircle },
    { id: 'requirements', label: 'Krav', icon: AlertCircle },
    { id: 'documents', label: 'Dokument', icon: FileText },
    { id: 'submission', label: 'Inskickning', icon: Send },
  ];

  return (
    <div className="module-container sewage-portal-view">
      {/* Progress Indicator */}
      <div className="sewage-progress-bar">
        {progressSteps.map((step, idx) => {
          const Icon = step.icon;
          const isCurrent = currentStep === step.id;
          const isDone =
            (step.id === 'property' && currentStep !== 'property') ||
            (step.id === 'analysis' &&
              ['systemSelection', 'requirements', 'documents', 'submission'].includes(currentStep)) ||
            (step.id === 'systemSelection' &&
              ['requirements', 'documents', 'submission'].includes(currentStep));

          return (
            <div
              key={step.id}
              className={`sewage-progress-step ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
            >
              <div className={`sewage-progress-icon ${isCurrent ? 'active' : isDone ? 'done' : ''}`}>
                <Icon size={16} />
              </div>
              <span className="sewage-progress-label">{step.label}</span>
              {idx < progressSteps.length - 1 && <div className="sewage-progress-connector" />}
            </div>
          );
        })}
      </div>

      {/* Error Handling */}
      {analysisError && !dismissedError && (
        <ErrorAlert
          message={`GIS-analys misslyckades: ${analysisError.message}`}
          severity="error"
          onDismiss={() => setDismissedError(true)}
        />
      )}

      {/* Step 1: Property Information */}
      {currentStep === 'property' && (
        <div className="sewage-step-container">
          <div className="module-header">
            <h1 className="module-title">Börja här: Fastighetsuppgifter</h1>
            <p className="module-subtitle">
              Ange fastighetsbeteckning och antal personer som systemet ska dimensioneras för (1-200 PE)
            </p>
          </div>

          <form
            className="sewage-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleStartAnalysis();
            }}
          >
            <div className="sewage-form-group">
              <label htmlFor="propertyDesignation">Fastighetsbeteckning *</label>
              <input
                id="propertyDesignation"
                type="text"
                placeholder="t.ex. 1234-567-890"
                value={propertyDesignation}
                onChange={(e) => setPropertyDesignation(e.target.value)}
                required
              />
            </div>

            <div className="sewage-form-row">
              <div className="sewage-form-group">
                <label htmlFor="municipalityCode">Kommun *</label>
                <select
                  id="municipalityCode"
                  value={municipalityCode}
                  onChange={(e) => setMunicipalityCode(e.target.value)}
                  required
                >
                  <option value="">Välj kommun</option>
                  <option value="0180">Stockholm</option>
                  <option value="0184">Västerås</option>
                  <option value="0580">Göteborg</option>
                  <option value="1280">Malmö</option>
                  <option value="3100">Uppsala</option>
                  {/* Add more municipalities */}
                </select>
              </div>

              <div className="sewage-form-group">
                <label htmlFor="pe">Person Equivalents (PE) *</label>
                <div className="sewage-pe-input">
                  <input
                    id="pe"
                    type="number"
                    min="1"
                    max="200"
                    value={pe}
                    onChange={(e) => setPe(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                    required
                  />
                  <span className="sewage-pe-helper">1-200 personer</span>
                </div>
              </div>
            </div>

            <div className="sewage-form-group">
              <label>Lägg till geografiska koordinater (valfritt)</label>
              <div className="sewage-form-row">
                <input
                  type="number"
                  placeholder="Latitud"
                  value={latitude || ''}
                  onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                  step="0.0001"
                />
                <input
                  type="number"
                  placeholder="Longitud"
                  value={longitude || ''}
                  onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                  step="0.0001"
                />
              </div>
            </div>

            <button
              type="submit"
              className="sewage-button sewage-button-primary"
              onClick={handleStartAnalysis}
            >
              Starta GIS-analys
            </button>
          </form>

          <div className="sewage-info-box">
            <AlertCircle size={18} />
            <div>
              <strong>Vad är PE?</strong>
              <p>Person Equivalents (PE) motsvarar belastningen från en person per dag. Vanligtvis:</p>
              <ul>
                <li>1 person = 1 PE</li>
                <li>Vila på 8 PE för en genomsnittlig villa med 4 personer</li>
                <li>Maximal stöd upp till 200 PE för större installations</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: GIS Analysis */}
      {currentStep === 'analysis' && (
        <div className="sewage-step-container">
          {isAnalyzing ? (
            <LoadingSpinner message="Analyserar GIS-data från SGU, Lantmäteriet och Naturvårdsverket..." />
          ) : analysis && protectionProfile ? (
            <>
              <div className="module-header">
                <h1 className="module-title">GIS-Analys Genomförd</h1>
                <p className="module-subtitle">Resultatet baseras på:</p>
              </div>

              <div className="sewage-analysis-results">
                <div className="sewage-result-card">
                  <h3>📍 Läge & Avstånd</h3>
                  <p>Närmaste brunn: {analysis.sguBrunnarData.nearestOwnWell?.distance || 0}m (krav: 50m)</p>
                  <p>Avstånd till tomtgräns: {protectionProfile.distanceToPropertyLine}m (krav: 4.5m)</p>
                </div>

                <div className="sewage-result-card">
                  <h3>🌍 Miljöstatus</h3>
                  <p>
                    Skyddsnivå:{' '}
                    {protectionProfile.protectionLevel === 'HIGH'
                      ? '🔴 Högt skyddad område'
                      : '🟢 Normal skyddsnivå'}
                  </p>
                  <p>Risk-poäng: {analysis.overallRiskScore}/100</p>
                </div>

                <div className="sewage-result-card">
                  <h3>🏗️ Jordbeskaffenhet</h3>
                  <p>Jordtyp: {protectionProfile.soilProfile.soilType}</p>
                  <p>Infiltrationskapacitet: {protectionProfile.soilProfile.infiltrationCapacity}</p>
                </div>
              </div>

              <SewageMapView analysis={analysis} protectionProfile={protectionProfile} />

              <button
                className="sewage-button sewage-button-primary"
                onClick={() => setCurrentStep('systemSelection')}
              >
                Nästa: Välj avloppsystem
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Step 3: System Selection */}
      {currentStep === 'systemSelection' && analysis && protectionProfile && (
        <div className="sewage-step-container">
          <SewageSystemSelector
            selectedSystem={selectedSystemId as any}
            recommendedSystems={analysis.recommendedSystems}
            blockedSystems={analysis.blockedSystems}
            protectionLevel={protectionProfile.protectionLevel}
            pe={pe}
            onSelect={handleSystemSelected}
          />
        </div>
      )}

      {/* Step 4: Requirements & Gates */}
      {currentStep === 'requirements' && analysis && protectionProfile && selectedSystemId && (
        <div className="sewage-step-container">
          <SewageRequirementChecklist
            systemType={selectedSystemId}
            protectionLevel={protectionProfile.protectionLevel}
            municipalityCode={municipalityCode}
            distanceData={{
              toWell: protectionProfile.nearestWell.distance,
              toPropertyLine: protectionProfile.distanceToPropertyLine,
            }}
            onCompleted={() => setCurrentStep('documents')}
          />
        </div>
      )}

      {/* Step 5: Documents */}
      {currentStep === 'documents' && (
        <div className="sewage-step-container">
          <div className="module-header">
            <h1 className="module-title">Dokumentgenerering</h1>
            <p className="module-subtitle">Situationsplan, tvärsektion och ansökningssammanfattning</p>
          </div>

          {isGeneratingDocuments ? (
            <LoadingSpinner message="Genererar situationsplan och tvärsektion..." />
          ) : documentError ? (
            <ErrorAlert
              message={`Dokumentgenerering misslyckades: ${documentError}`}
              severity="error"
              onDismiss={() => setDocumentError(null)}
            />
          ) : (
            <button className="sewage-button sewage-button-primary" onClick={handleGenerateDocuments}>
              Generera Dokument
            </button>
          )}
        </div>
      )}

      {/* Step 6: Submission */}
      {currentStep === 'submission' && application && protectionProfile && (
        <div className="sewage-step-container">
          <SewageApplicationSummary
            application={application}
            protectionProfile={protectionProfile}
            municipalityCode={municipalityCode}
            onSubmit={handleSubmitApplication}
          />
        </div>
      )}

      {/* Step 7: Confirmation */}
      {currentStep === 'confirmation' && (
        <div className="sewage-step-container">
          <div className="sewage-confirmation">
            <CheckCircle size={64} color="#4CAF50" />
            <h2>Ansökan skickad!</h2>
            <p>Din ansökan har skickats till kommunen.</p>
            <p className="sewage-reference">
              Referensnummer:{' '}
              {referenceNumber || localStorage.getItem('sewage-application-ref') || 'Läser...'}
            </p>
            <p className="sewage-timeline">Beräknad handläggningstid: 6-8 veckor</p>

            <button className="sewage-button sewage-button-primary">Tillbaka till startsidan</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SewagePortalView;
