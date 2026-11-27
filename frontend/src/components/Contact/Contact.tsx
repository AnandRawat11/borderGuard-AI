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
    <div className="flex-1 overflow-y-auto p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-5 bg-canvas text-txt-primary">
      <div className="max-w-[840px] mx-auto space-y-5">
        <div>
          <div className="text-[11px] text-[#708197] dark:text-slate-400 mb-1 flex items-center gap-1.5 font-medium">
            <span>Operations</span>
            <span>/</span>
            <span className="text-[#0b8d8b] font-bold">Tactical Support</span>
          </div>
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            Contact &amp; Operations Support
          </h1>
          <p className="text-xs md:text-[13px] text-txt-muted mt-1 m-0">
            Connect with the engineering and border deployment team for pilot inquiries and telemetry integration.
          </p>
        </div>

        <div className="grid md:grid-cols-[0.85fr_1.15fr] gap-5">
          <section className="bg-surface border border-border-default rounded-2xl p-5 h-fit shadow-xs space-y-3">
            <h2 className="text-xs font-bold font-display text-txt-primary uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-1.5 h-3.5 rounded-full bg-[#0b8d8b]" />
              Operations Desk
            </h2>
            <a className="flex items-center gap-2.5 text-xs text-[#0b8d8b] hover:underline font-semibold" href="mailto:ops@ibvap.gov.in">
              <i className="ti ti-mail text-sm" /> ops@ibvap.gov.in
            </a>
            <a className="flex items-center gap-2.5 text-xs text-[#0b8d8b] hover:underline font-semibold" href="tel:+911800123456">
              <i className="ti ti-phone text-sm" /> +91 1800 123 456
            </a>
            <div className="pt-3 border-t border-border-default text-xs text-txt-muted leading-relaxed">
              Command Headquarters: Border Operations Center, BOP Sector Alpha, Western Command.
            </div>
          </section>

          <form onSubmit={submit} className="bg-surface border border-border-default rounded-2xl p-5 space-y-3.5 shadow-xs">
            <h2 className="text-xs font-bold font-display text-txt-primary uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-3.5 rounded-full bg-[#5277d7]" />
              Transmit Dispatch Note
            </h2>
            {sent ? (
              <div className="p-4 rounded-xl bg-[#eaf7ef] border border-emerald-500/30 text-xs text-[#25855c] font-semibold">
                ✓ Transmission recorded. The engineering response unit will review your request.
              </div>
            ) : (
              <>
                <input
                  required
                  name="name"
                  placeholder="Your Operator Name / Call Sign"
                  aria-label="Your name"
                  className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl px-3.5 py-2 text-xs text-txt-primary outline-none focus:border-[#0b8d8b]"
                />
                <input
                  required
                  type="email"
                  name="email"
                  placeholder="Operational Email Address"
                  aria-label="Email address"
                  className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl px-3.5 py-2 text-xs text-txt-primary outline-none focus:border-[#0b8d8b]"
                />
                <textarea
                  required
                  name="message"
                  placeholder="Deployment inquiry or incident feedback..."
                  aria-label="Message"
                  rows={4}
                  className="w-full bg-[#fbfcfd] dark:bg-[#14283d] border border-border-default rounded-xl px-3.5 py-2 text-xs text-txt-primary outline-none focus:border-[#0b8d8b] resize-y"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
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
