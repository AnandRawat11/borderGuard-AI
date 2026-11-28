import React from 'react';

/**
 * Fixed Level-1 spatial canvas layer rendered behind the entire application.
 * Uses pure CSS radial lighting and subtle 3D-style frosted orbs so pointer events
 * and video decoding never contend with WebGL contexts.
 */
export const SpatialBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="spatial-background fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
    >
      {/* Subtle architectural concentric orbital reticle in top-right ambient margin */}
      <svg
        className="spatial-reticle hidden lg:block"
        viewBox="0 0 600 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="300" cy="300" r="240" stroke="currentColor" strokeWidth="1" strokeDasharray="3 7" />
        <circle cx="300" cy="300" r="175" stroke="currentColor" strokeWidth="0.75" />
        <circle cx="300" cy="300" r="108" stroke="currentColor" strokeWidth="0.75" strokeOpacity="0.6" />
      </svg>

      {/* Primary floating pearlescent orb (upper-right ambient canvas) */}
      <div className="spatial-orb spatial-orb-primary hidden md:block" />

      {/* Secondary soft ice-blue orb (bottom-left ambient balance) */}
      <div className="spatial-orb spatial-orb-secondary hidden lg:block" />
    </div>
  );
};
