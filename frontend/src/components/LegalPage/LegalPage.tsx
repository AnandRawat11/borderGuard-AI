import React from 'react';

type LegalType = 'privacy' | 'terms';

export const LegalPage: React.FC<{ type: LegalType }> = ({ type }) => {
  const privacy = type === 'privacy';
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-canvas text-txt-primary">
      <article className="max-w-[800px] mx-auto bg-surface border border-border-default rounded-2xl p-6 md:p-8 text-xs text-txt-muted shadow-xs leading-relaxed space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-txt-primary mb-1">
            {privacy ? 'Privacy Protocol & Data Governance' : 'Security Charter & Operational Terms'}
          </h1>
          <div className="text-[11px] text-txt-muted font-mono">IBVAP Platform Documentation &middot; Updated October 2026</div>
        </div>

        {privacy ? (
          <>
            <h2 className="text-sm font-bold font-display text-txt-primary mb-1 pt-2">Data Handled &amp; Privacy Protections</h2>
            <p>
              The platform processes CCTV frame streams, bounding-box tracklets, incident evidence snapshots, and cryptographic audit records. Unapproved facial recognition and license plate detections are automatically redacted using on-device masking prior to evidence persistence or preview generation.
            </p>
            <h2 className="text-sm font-bold font-display text-txt-primary mb-1 pt-2">Local Edge &amp; Browser Processing</h2>
            <p>
              Real-time video inference executes on edge devices and client browsers. Camera permissions are strictly user-consented and can be revoked or disconnected at any moment from the Surveillance Monitor.
            </p>
            <h2 className="text-sm font-bold font-display text-txt-primary mb-1 pt-2">Inquiries &amp; Compliance</h2>
            <p>
              For governance questions regarding forensic data retention and legal holds, contact <a className="text-[#0b8d8b] hover:underline" href="mailto:governance@ibvap.gov.in">governance@ibvap.gov.in</a>.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-sm font-bold font-display text-txt-primary mb-1 pt-2">Pilot Operational Scope</h2>
            <p>
              IBVAP is an evaluated border video analytics pilot. Simulated benchmark events and generated synthetic feeds are distinctly labelled as non-operational intelligence to preserve tactical integrity.
            </p>
            <h2 className="text-sm font-bold font-display text-txt-primary mb-1 pt-2">Cryptographic Evidence &amp; Audit Logs</h2>
            <p>
              All incident triage states, role transitions, and export actions are appended to a SHA-256 hash-chain ledger. Tampering with persistence records is detected via automated cryptographic verification.
            </p>
            <h2 className="text-sm font-bold font-display text-txt-primary mb-1 pt-2">Authorized Operation</h2>
            <p>
              Deployment and administrative access are restricted to credentialed defense operators, sector supervisors, and system administrators.
            </p>
          </>
        )}
      </article>
    </div>
  );
};
