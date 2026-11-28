import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { PageId } from '../types';
import { SPATIAL_SPRING } from './Spatial/MotionPrimitives';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
  count?: number;
  isLive?: boolean;
  adminOnly?: boolean;
  filterType?: string;
}

export const Sidebar: React.FC = () => {
  const {
    currentPage,
    goToPage,
    alerts,
    currentUser,
    mobileMenuOpen,
    closeMobileMenu,
    showNotice,
    sidebarCollapsed,
    toggleSidebar
  } = useApp();

  const criticalCount = alerts.filter(a => a.sev === 'high' && !a.reviewed).length;
  const evidenceCount = alerts.filter(a => Boolean(a.snapshot || a.evidenceHash || a.reviewed)).length;
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  const surveillanceNav: NavItem[] = [
    { id: 'monitor', label: 'Live monitor', icon: 'ti-video', isLive: true },
    { id: 'camgrid', label: 'Camera feeds', icon: 'ti-device-cctv' },
    { id: 'alerts', label: 'Alert feed', icon: 'ti-bell-ringing', count: criticalCount },
  ];

  const workspaceNav: NavItem[] = [
    { id: 'dashboard', label: 'Overview', icon: 'ti-layout-dashboard' },
    { id: 'vault', label: 'Evidence vault', icon: 'ti-archive', count: evidenceCount },
    { id: 'analytics', label: 'Event timeline', icon: 'ti-history' },
  ];

  const systemNav: NavItem[] = [
    { id: 'models', label: 'Audit & access', icon: 'ti-shield-lock' },
    { id: 'watchlist', label: 'Watchlist references', icon: 'ti-fingerprint' },
    { id: 'features', label: 'Feature controls', icon: 'ti-adjustments-horizontal' },
    { id: 'cam-config', label: 'Settings', icon: 'ti-settings', adminOnly: false },
    { id: 'dashboard-settings', label: 'Dashboard config', icon: 'ti-adjustments', adminOnly: true },
  ];

  const intelligenceNav: NavItem[] = [
    { id: 'ai-investigation', label: 'Incident investigation', icon: 'ti-brain' },
    { id: 'ai-briefing', label: 'Surveillance briefing', icon: 'ti-file-report' },
  ];

  const renderSectionHeader = (title: string) =>
    (!sidebarCollapsed || mobileMenuOpen) ? (
      <div className="px-3 pb-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-txt-muted/85">
        {title}
      </div>
    ) : (
      <div className="w-5 h-[1px] bg-border-default/60 mx-auto my-2" />
    );

  const renderNavItem = (item: NavItem, textSizeClass: string, badgeStyle: 'warn' | 'neutral' | 'ai' = 'neutral') => {
    const isRestricted = Boolean(item.adminOnly && !isAdmin);
    const isActive = currentPage === item.id;
    const isExpanded = !sidebarCollapsed || mobileMenuOpen;

    return (
      <button
        key={item.id + item.label}
        onClick={() => {
          if (isRestricted) {
            showNotice('error', 'Administrator permission required.');
            return;
          }
          goToPage(item.id);
        }}
        title={item.label}
        aria-label={item.label}
        className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left transition-colors ${
          !isExpanded ? 'justify-center px-1.5' : ''
        } ${
          isRestricted
            ? 'opacity-40 cursor-not-allowed text-txt-secondary'
            : isActive
            ? 'text-primary font-semibold'
            : 'text-txt-secondary hover:bg-primary-surface/55 hover:text-primary'
        }`}
      >
        {isActive && !isRestricted && (
          <motion.span
            layoutId="sidebar-active-pill"
            transition={SPATIAL_SPRING}
            aria-hidden="true"
            className="absolute inset-0 rounded-[10px] bg-primary-surface/95 border border-primary-border/80 shadow-xs pointer-events-none"
          />
        )}

        <div className="relative z-[1] shrink-0 w-5 h-5 flex items-center justify-center">
          <i className={`ti ${item.icon} nav-icon text-[17px] leading-none`} aria-hidden="true" />
          {!isExpanded && item.isLive && (
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-surface" />
          )}
          {!isExpanded && (item.count ?? 0) > 0 && !item.isLive && (
            <span
              className={`absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-white font-bold text-[8px] flex items-center justify-center ring-2 ring-surface ${
                badgeStyle === 'warn' ? 'bg-amber-500' : 'bg-primary text-primary-text'
              }`}
            >
              {item.count}
            </span>
          )}
        </div>

        {isExpanded && (
          <span className={`relative z-[1] flex-1 ${textSizeClass} truncate`}>
            {item.label}
          </span>
        )}

        {isExpanded && item.isLive && (
          <span className="relative z-[1] ml-auto bg-status-danger-surface/90 text-status-danger border border-status-danger-border font-bold text-[9px] px-2 py-0.5 rounded-full tracking-wider">
            LIVE
          </span>
        )}

        {isExpanded && !item.isLive && item.count !== undefined && (
          <span
            className={`relative z-[1] ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
              isActive
                ? 'bg-surface text-primary'
                : 'bg-surface/75 text-txt-muted border border-border-subtle'
            }`}
          >
            {item.count}
          </span>
        )}

        {isExpanded && badgeStyle === 'ai' && isActive && (
          <span className="relative z-[1] ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-surface text-primary uppercase tracking-wider">
            AI
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[90] bg-slate-950/25 backdrop-blur-sm md:hidden transition-opacity"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Navigation Sidebar"
        className={`spatial-glass-nav fixed inset-y-0 left-0 z-[100] border-r border-border-default flex flex-col overflow-hidden select-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:static ${
          sidebarCollapsed ? 'md:w-16 md:min-w-[64px]' : 'md:w-[240px] md:min-w-[240px]'
        } ${mobileMenuOpen ? 'translate-x-0 w-[240px] shadow-elevated' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className={`h-11 border-b border-border-subtle flex items-center px-3 shrink-0 ${
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        }`}>
          {(!sidebarCollapsed || mobileMenuOpen) ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-online shrink-0" />
              <span className="text-[10px] font-bold text-txt-muted uppercase tracking-[0.14em] truncate">Sentry Rail</span>
            </div>
          ) : null}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            title={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            className="hidden md:flex p-1.5 rounded-lg text-txt-muted hover:text-primary hover:bg-primary-surface/70 transition-colors cursor-pointer"
          >
            <i className={`ti ${sidebarCollapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'} text-sm`} />
          </button>
        </div>

        <div className="flex-1 py-3 px-2.5 overflow-y-auto space-y-4">
          <div>
            {renderSectionHeader('SURVEILLANCE')}
            <div className="space-y-0.5">
              {surveillanceNav.map(item => renderNavItem(item, 'text-[13px]', 'warn'))}
            </div>
          </div>

          <div>
            {renderSectionHeader('WORKSPACE')}
            <div className="space-y-0.5">
              {workspaceNav.map(item => renderNavItem(item, 'text-[12.5px]', 'neutral'))}
            </div>
          </div>

          <div>
            {renderSectionHeader('SYSTEM')}
            <div className="space-y-0.5">
              {systemNav.map(item => renderNavItem(item, 'text-[12.5px]', 'neutral'))}
            </div>
          </div>

          <div>
            {renderSectionHeader('INTELLIGENCE')}
            <div className="space-y-0.5">
              {intelligenceNav.map(item => renderNavItem(item, 'text-[12.5px]', 'ai'))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
