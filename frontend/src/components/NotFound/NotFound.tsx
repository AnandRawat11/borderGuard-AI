import React from 'react';
import { useApp } from '../../context/AppContext';

export const NotFound: React.FC = () => {
  const { goToPage } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center bg-canvas text-txt-primary">
      <div className="max-w-[420px] bg-surface border border-border-default rounded-2xl p-8 shadow-xs">
        <div className="font-mono text-5xl leading-none font-extrabold text-[#c84f58] mb-3">404</div>
        <h1 className="text-base font-bold font-display text-txt-primary mb-1.5">Command View Not Found</h1>
        <p className="text-xs text-txt-muted mb-5 leading-relaxed">The surveillance sector or operational dashboard view you requested does not exist.</p>
        <button
          onClick={() => goToPage('dashboard')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#087f82] to-[#16a79d] hover:from-[#066e72] hover:to-[#0b968e] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          Return to Overview
        </button>
      </div>
    </div>
  );
};
