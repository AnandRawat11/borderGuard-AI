import React from 'react';
import { motion } from 'motion/react';

export const SPATIAL_EASE = [0.22, 1, 0.36, 1] as const;

export const SPATIAL_SPRING = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 28,
  mass: 0.8,
};

export const FAST_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 32,
  mass: 0.65,
};

interface SpatialPageShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Lightweight page reveal for operational views without live continuous video mounts.
 */
export const SpatialPageShell: React.FC<SpatialPageShellProps> = ({
  children,
  className = '',
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32, ease: SPATIAL_EASE }}
    className={className}
  >
    {children}
  </motion.div>
);

interface SpatialOverlayProps {
  children: React.ReactNode;
  className?: string;
  role?: React.AriaRole;
  id?: string;
  'aria-label'?: string;
}

/**
 * Elevated frosted overlay transition for dialogs, dropdowns, and popovers.
 */
export const SpatialOverlay: React.FC<SpatialOverlayProps> = ({
  children,
  className = '',
  role,
  id,
  'aria-label': ariaLabel,
}) => (
  <motion.div
    id={id}
    role={role}
    aria-label={ariaLabel}
    initial={{ opacity: 0, scale: 0.97, y: -4 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ duration: 0.22, ease: SPATIAL_EASE }}
    className={className}
  >
    {children}
  </motion.div>
);
