import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageId } from '../types';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
  count?: number;
  isLive?: boolean;
  adminOnly?: boolean;
  filterType?: string;
  accentColor?: string;
  softBg?: string;
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
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  // SURVEILLANCE section – highest priority, always visible at top
  const surveillanceNav: NavItem[] = [
    { id: 'monitor', label: 'Live monitor', icon: 'ti-video', isLive: true, accentColor: 'var(--red)', softBg: 'var(--red-soft)' },
    { id: 'camgrid', label: 'Camera feeds', icon: 'ti-layout-grid', accentColor: 'var(--teal)', softBg: 'var(--teal-soft)' },
    { id: 'alerts', label: 'Alert feed', icon: 'ti-bell-ringing', count: criticalCount, accentColor: 'var(--orange)', softBg: 'var(--orange-soft)' },
  ];

  // WORKSPACE section – overview, evidence, analytics
  const workspaceNav: NavItem[] = [
    { id: 'dashboard', label: 'Overview', icon: 'ti-home', accentColor: 'var(--teal)', softBg: 'var(--teal-soft)' },
    { id: 'alerts', label: 'Evidence vault', icon: 'ti-archive', count: alerts.length, accentColor: 'var(--blue)', softBg: 'var(--blue-soft)' },
    { id: 'analytics', label: 'Event timeline', icon: 'ti-history', accentColor: 'var(--purple)', softBg: 'var(--purple-soft)' },
  ];

  // SYSTEM section – audit, settings
  const systemNav: NavItem[] = [
    { id: 'models', label: 'Audit & access', icon: 'ti-shield-lock', accentColor: 'var(--purple)', softBg: 'var(--purple-soft)' },
    { id: 'watchlist', label: 'Watchlist references', icon: 'ti-fingerprint', accentColor: 'var(--cyan)', softBg: 'var(--teal-soft)' },
    { id: 'features', label: 'Feature controls', icon: 'ti-adjustments-horizontal', accentColor: 'var(--teal)', softBg: 'var(--teal-soft)' },
    { id: 'cam-config', label: 'Settings', icon: 'ti-settings', adminOnly: false, accentColor: 'var(--blue)', softBg: 'var(--blue-soft)' },
    { id: 'dashboard-settings', label: 'Dashboard config', icon: 'ti-tool', adminOnly: true, accentColor: 'var(--blue)', softBg: 'var(--blue-soft)' },
  ];

  // INTELLIGENCE section – Agent37 AI features
  const intelligenceNav: NavItem[] = [
    { id: 'ai-investigation', label: 'Incident investigation', icon: 'ti-brain', accentColor: '#8b5cf6', softBg: 'rgba(139,92,246,0.12)' },
    { id: 'ai-briefing', label: 'Surveillance briefing', icon: 'ti-file-report', accentColor: '#0ea5e9', softBg: 'rgba(14,165,233,0.12)' },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Shell */}
      <aside
        aria-label="Navigation Sidebar"
        className={`fixed inset-y-0 left-0 z-[100] bg-surface border-r border-border-default flex flex-col overflow-hidden select-none transition-all duration-200 md:static ${
          sidebarCollapsed ? 'md:w-16 md:min-w-[64px]' : 'md:w-[240px] md:min-w-[240px]'
        } ${mobileMenuOpen ? 'translate-x-0 w-[240px] shadow-2xl' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Top Header / Collapse Rail Toggle */}
        <div className={`h-11 border-b border-border-default/60 flex items-center px-3 shrink-0 ${
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        }`}>
          {(!sidebarCollapsed || mobileMenuOpen) ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-extrabold text-txt-muted uppercase tracking-widest truncate">Sentry Rail</span>
            </div>
          ) : null}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
            title={sidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
            className="hidden md:flex p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <i className={`ti ${sidebarCollapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'} text-sm`} />
          </button>
        </div>

        <div className="flex-1 py-3 px-2 overflow-y-auto space-y-4">
          
          {/* Section 1: SURVEILLANCE (top priority) */}
          <div>
            {(!sidebarCollapsed || mobileMenuOpen) ? (
              <div className="px-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-widest text-[#9aa7b5]">
                SURVEILLANCE
              </div>
            ) : (
              <div className="w-5 h-[1px] bg-border-default/50 mx-auto my-1.5" />
            )}
            <div className="space-y-0.5">
              {surveillanceNav.map(item => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id + item.label}
                    onClick={() => goToPage(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all ${
                      sidebarCollapsed && !mobileMenuOpen ? 'justify-center px-1' : ''
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-teal-500/15 to-blue-500/10 text-primary font-bold shadow-xs'
                        : 'text-[#55697e] dark:text-slate-300 hover:bg-[#f3f7fa] dark:hover:bg-white/5 hover:translate-x-0.5'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 transition-transform shadow-xs"
                        style={{
                          backgroundColor: isActive ? 'var(--teal)' : item.softBg,
                          color: isActive ? '#ffffff' : item.accentColor
                        }}
                      >
                        <i className={`ti ${item.icon}`} />
                      </span>
                      {sidebarCollapsed && !mobileMenuOpen && item.isLive && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-surface animate-pulse" />
                      )}
                      {sidebarCollapsed && !mobileMenuOpen && (item.count ?? 0) > 0 && !item.isLive && (
                        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-amber-500 text-white font-black text-[8px] flex items-center justify-center ring-2 ring-surface">
                          {item.count}
                        </span>
                      )}
                    </div>

                    {(!sidebarCollapsed || mobileMenuOpen) && (
                      <span className="flex-1 text-[13px] truncate">
                        {item.label}
                      </span>
                    )}

                    {(!sidebarCollapsed || mobileMenuOpen) && (
                      item.isLive ? (
                        <span className="ml-auto bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-extrabold text-[9px] px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                          LIVE
                        </span>
                      ) : item.count !== undefined ? (
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          {item.count}
                        </span>
                      ) : null
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: WORKSPACE */}
          <div>
            {(!sidebarCollapsed || mobileMenuOpen) ? (
              <div className="px-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-widest text-[#9aa7b5]">
                WORKSPACE
              </div>
            ) : (
              <div className="w-5 h-[1px] bg-border-default/50 mx-auto my-1.5" />
            )}
            <div className="space-y-0.5">
              {workspaceNav.map(item => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id + item.label}
                    onClick={() => goToPage(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all ${
                      sidebarCollapsed && !mobileMenuOpen ? 'justify-center px-1' : ''
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-teal-500/15 to-blue-500/10 text-primary font-bold shadow-xs'
                        : 'text-[#55697e] dark:text-slate-300 hover:bg-[#f3f7fa] dark:hover:bg-white/5 hover:translate-x-0.5'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0 shadow-xs"
                        style={{
                          backgroundColor: isActive ? 'var(--teal)' : item.softBg,
                          color: isActive ? '#ffffff' : item.accentColor
                        }}
                      >
                        <i className={`ti ${item.icon}`} />
                      </span>
                      {sidebarCollapsed && !mobileMenuOpen && (item.count ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-teal-600 text-white font-black text-[8px] flex items-center justify-center ring-2 ring-surface">
                          {item.count}
                        </span>
                      )}
                    </div>
                    {(!sidebarCollapsed || mobileMenuOpen) && (
                      <span className="flex-1 text-[12px] truncate">
                        {item.label}
                      </span>
                    )}
                    {(!sidebarCollapsed || mobileMenuOpen) && item.count !== undefined && (
                      <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: SYSTEM */}
          <div>
            {(!sidebarCollapsed || mobileMenuOpen) ? (
              <div className="px-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-widest text-[#9aa7b5]">
                SYSTEM
              </div>
            ) : (
              <div className="w-5 h-[1px] bg-border-default/50 mx-auto my-1.5" />
            )}
            <div className="space-y-0.5">
              {systemNav.map(item => {
                const isRestricted = item.adminOnly && !isAdmin;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id + item.label}
                    onClick={() => {
                      if (isRestricted) {
                        showNotice('error', 'Administrator role required for Sensor Calibration.');
                        return;
                      }
                      goToPage(item.id);
                    }}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all ${
                      sidebarCollapsed && !mobileMenuOpen ? 'justify-center px-1' : ''
                    } ${
                      isRestricted
                        ? 'opacity-40 cursor-not-allowed'
                        : isActive
                        ? 'bg-gradient-to-r from-teal-500/15 to-blue-500/10 text-primary font-bold shadow-xs'
                        : 'text-[#55697e] dark:text-slate-300 hover:bg-[#f3f7fa] dark:hover:bg-white/5 hover:translate-x-0.5'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0 shadow-xs"
                      style={{
                        backgroundColor: isActive ? 'var(--teal)' : item.softBg,
                        color: isActive ? '#ffffff' : item.accentColor
                      }}
                    >
                      <i className={`ti ${item.icon}`} />
                    </span>
                    {(!sidebarCollapsed || mobileMenuOpen) && (
                      <span className="flex-1 text-[12px] truncate">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: INTELLIGENCE (Agent37) */}
          <div>
            {(!sidebarCollapsed || mobileMenuOpen) ? (
              <div className="px-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-widest" style={{ color: '#8b5cf6' }}>
                INTELLIGENCE
              </div>
            ) : (
              <div className="w-5 h-[1px] bg-border-default/50 mx-auto my-1.5" />
            )}
            <div className="space-y-0.5">
              {intelligenceNav.map(item => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id + item.label}
                    onClick={() => goToPage(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all ${
                      sidebarCollapsed && !mobileMenuOpen ? 'justify-center px-1' : ''
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-violet-500/15 to-blue-500/10 text-primary font-bold shadow-xs'
                        : 'text-[#55697e] dark:text-slate-300 hover:bg-[#f3f7fa] dark:hover:bg-white/5 hover:translate-x-0.5'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0 shadow-xs"
                      style={{
                        backgroundColor: isActive ? item.accentColor : item.softBg,
                        color: isActive ? '#ffffff' : item.accentColor
                      }}
                    >
                      <i className={`ti ${item.icon}`} />
                    </span>
                    {(!sidebarCollapsed || mobileMenuOpen) && (
                      <span className="flex-1 text-[12px] truncate">
                        {item.label}
                      </span>
                    )}
                    {(!sidebarCollapsed || mobileMenuOpen) && isActive && (
                      <span className="ml-auto text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 uppercase tracking-wider">
                        AI
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Sidebar Footer & Collapse Button */}
        <div className="p-2.5 border-t border-border-default bg-surface-subtle flex items-center justify-between text-[11px] text-[#94a1ae]">
          {(!sidebarCollapsed || mobileMenuOpen) && (
            <div className="text-[10px] text-[#94a1ae] leading-tight overflow-hidden pr-1">
              <span className="font-bold text-txt-primary block truncate">IBVAP defense suite</span>
              <div className="text-[9.5px] text-txt-muted truncate">Verified forensic audit</div>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-muted hover:text-txt-primary transition-colors mx-auto md:ml-auto cursor-pointer"
          >
            <i className={`ti ${sidebarCollapsed ? 'ti-chevron-right' : 'ti-chevron-left'} text-sm`} />
          </button>
        </div>
      </aside>
    </>
  );
};
