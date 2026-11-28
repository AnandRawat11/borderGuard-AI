import React from 'react';
import { useApp } from '../../context/AppContext';

export const NotFound: React.FC = () => {
  const { goToPage } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center bg-transparent text-txt-primary">
      <div className="spatial-glass max-w-[420px] p-8">
        <div className="font-mono text-5xl leading-none font-extrabold text-status-danger mb-3">404</div>
        <h1 className="text-base font-bold font-display text-txt-primary mb-5">Command View Not Found</h1>
        <button
          onClick={() => goToPage('dashboard')}
          className="px-5 py-2.5 rounded-[10px] brand-button text-white text-xs font-bold transition-all cursor-pointer"
        >
          Return to Overview
        </button>
      </div>
    </div>
  );
};
