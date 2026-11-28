import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const Contact: React.FC = () => {
  const { showNotice } = useApp();
  const [sent, setSent] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(true);
    showNotice('success', 'Transmission recorded for the IBVAP deployment operations team.');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-transparent text-txt-primary">
      <div className="max-w-[840px] mx-auto space-y-5">
        <div>
          <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
            <span>Operations</span>
            <span>/</span>
            <span className="text-primary font-bold">Tactical Support</span>
          </div>
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            Contact &amp; Operations Support
          </h1>
        </div>

        <div className="grid md:grid-cols-[0.85fr_1.15fr] gap-5">
          <section className="spatial-glass p-5 h-fit space-y-3">
            <h2 className="text-xs font-bold font-display text-txt-primary uppercase tracking-wider pb-2.5 border-b border-border-subtle">
              Operations Desk
            </h2>
            <a className="flex items-center gap-2.5 text-xs text-primary hover:underline font-semibold" href="mailto:ops@ibvap.gov.in">
              <i className="ti ti-mail text-sm" /> ops@ibvap.gov.in
            </a>
            <a className="flex items-center gap-2.5 text-xs text-primary hover:underline font-semibold" href="tel:+911800123456">
              <i className="ti ti-phone text-sm" /> +91 1800 123 456
            </a>
            <div className="pt-3 border-t border-border-subtle text-xs text-txt-muted leading-relaxed">
              Command Headquarters: Border Operations Center, BOP Sector Alpha, Western Command.
            </div>
          </section>

          <form onSubmit={submit} className="spatial-glass p-5 space-y-3.5">
            <h2 className="text-xs font-bold font-display text-txt-primary uppercase tracking-wider pb-2.5 border-b border-border-subtle">
              Transmit Dispatch Note
            </h2>
            {sent ? (
              <div className="p-4 rounded-[10px] bg-status-success-surface border border-emerald-500/30 text-xs text-status-success font-semibold">
                <i className="ti ti-circle-check" aria-hidden="true" /> Transmission recorded. The engineering response unit will review your request.
              </div>
            ) : (
              <>
                <input
                  required
                  name="name"
                  placeholder="Your Operator Name / Call Sign"
                  aria-label="Your name"
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] px-3.5 py-2 text-xs text-txt-primary outline-none focus:border-primary"
                />
                <input
                  required
                  type="email"
                  name="email"
                  placeholder="Operational Email Address"
                  aria-label="Email address"
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] px-3.5 py-2 text-xs text-txt-primary outline-none focus:border-primary"
                />
                <textarea
                  required
                  name="message"
                  placeholder="Deployment inquiry or incident feedback..."
                  aria-label="Message"
                  rows={4}
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] px-3.5 py-2 text-xs text-txt-primary outline-none focus:border-primary resize-y"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-[10px] brand-button text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Send Transmission
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
