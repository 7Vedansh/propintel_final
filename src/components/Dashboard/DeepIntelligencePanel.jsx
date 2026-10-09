import React from 'react';
import VisualEvidenceSection from './VisualEvidenceSection';
import LocalityIntelligenceSection from './LocalityIntelligenceSection';
import AIUnderwriterSummarySection from './AIUnderwriterSummarySection';
import CollapsibleSection from '../ui/CollapsibleSection';
import { cleanText } from '../ui/DashboardPrimitives';

export default function DeepIntelligencePanel({
  data,
  packet,
  setPacket,
  packetMetadata,
  setPacketMetadata,
  scanStatus,
  setScanStatus,
  modelResults,
  setModelResults,
  modelUsed,
  setModelUsed,
  onVisualEvidenceChange,
  propertyCoordinates,
  underwriterSummary,
  isUnderwriterSummaryLoading,
  underwriterSummaryEnhancement
}) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Visual Evidence & GPS Intelligence */}
      <CollapsibleSection
        title="Visual Evidence & GPS Intelligence"
        icon="satellite_alt"
        eyebrow="Metadata Anti-Spoofing"
        badge={data.visualEvidence?.packetStatus === 'complete' ? 'Verified' : 'Pending'}
        badgeTone={data.visualEvidence?.packetStatus === 'complete' ? 'emerald' : 'amber'}
        defaultExpanded={true}
      >
        <VisualEvidenceSection
          packet={packet}
          setPacket={setPacket}
          packetMetadata={packetMetadata}
          setPacketMetadata={setPacketMetadata}
          scanStatus={scanStatus}
          setScanStatus={setScanStatus}
          modelResults={modelResults}
          setModelResults={setModelResults}
          modelUsed={modelUsed}
          setModelUsed={setModelUsed}
          onChange={onVisualEvidenceChange}
          propertyCoordinates={propertyCoordinates}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Hyperlocal Event Intelligence"
        icon="public"
        eyebrow="Spatial Querying"
        badge={`${data.localityIntelligence?.acceptedEvents || 0} Events`}
        badgeTone="indigo"
        defaultExpanded={true}
      >
        <LocalityIntelligenceSection localityIntelligence={data.localityIntelligence} />
      </CollapsibleSection>

      <AIUnderwriterSummarySection 
        summaryResponse={underwriterSummary}
        isLoading={isUnderwriterSummaryLoading}
        enhancementState={underwriterSummaryEnhancement}
      />

    </div>
  );
}
