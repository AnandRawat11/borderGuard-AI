import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export const Topbar: React.FC = () => {
  const {
    goToPage,
    alerts,
    armed,
    toggleArmed,
    triggerWeaponDemo,
    currentUser,
    switchRoleDemo,
    demoMode,
    toggleMobileMenu,
    theme,
    toggleTheme,
    openLightbox,
    soundEnabled,
    toggleSound,
    sidebarCollapsed,
    toggleSidebar,
    login,
    logout
  } = useApp();

  const [timeStr, setTimeStr] = useState<string>('--:--:--');
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginBusy, setLoginBusy] = useState<boolean>(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      setTimeStr(new Date().toLocaleTimeString('en-IN', { hour12: false }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreviewedAlerts = alerts.filter(a => !a.reviewed);
  const criticalCount = unreviewedAlerts.filter(a => a.sev === 'high').length;

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginUsername.trim() || !loginPassword) return;
    setLoginBusy(true);
    try {
      await login(loginUsername.trim(), loginPassword);
      setLoginPassword('');
      setProfileOpen(false);
    } catch {
      // AppContext presents the server error through the shared notice toast.
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <header className="h-[72px] shrink-0 bg-gradient-to-r from-[#0b1e34] via-[#123256] to-[#0e4d5e] text-white flex items-center px-4 md:px-7 gap-5 select-none z-30 relative shadow-[0_5px_20px_rgba(16,37,62,0.18)]">
      {/* 2px Rainbow Glow Accent Line on Bottom */}
      <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-gradient-to-r from-[#2fd6c0] via-[#5b8def] via-[#9a7ae6] to-[#f0a640]" />

      {/* Mobile Drawer Button */}
      <button
        onClick={toggleMobileMenu}
        className="md:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        aria-label="Open mobile navigation"
      >
        <i className="ti ti-menu-2 text-xl" />
      </button>

      {/* Desktop Sidebar Rail Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="hidden md:flex p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title={sidebarCollapsed ? "Expand sidebar rail" : "Collapse sidebar rail"}
        aria-label={sidebarCollapsed ? "Expand sidebar rail" : "Collapse sidebar rail"}
      >
        <i className={`ti ${sidebarCollapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'} text-lg`} />
      </button>

      {/* Brand Logo & Name */}
      <div
        onClick={() => goToPage('dashboard')}
        className="flex items-center gap-2.5 min-w-[210px] cursor-pointer"
      >
        <div className="w-[39px] h-[39px] rounded-xl flex items-center justify-center font-black text-sm text-[#092b3d] bg-gradient-to-br from-[#2fe0c8] via-[#5b9bff] to-[#9a7ae6] shadow-[0_5px_14px_rgba(41,173,166,0.38)] shrink-0">
          IB
        </div>
        <div>
          <div className="font-extrabold text-[15px] tracking-wider leading-none text-white font-display">
            IBVAP
          </div>
          <div className="text-[9px] tracking-[0.13em] uppercase text-[#9fb3c5] font-semibold mt-1 leading-none">
            INTELLIGENT BORDER VIDEO ANALYTICS
          </div>
        </div>
      </div>

      {/* Center Spacer */}
      <div className="flex-1" />

      {/* Right Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Live Clock */}
        <div className="hidden xl:block font-mono text-xs font-semibold text-slate-200 bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg tabular-nums">
          {timeStr} <span className="text-[10px] text-cyan-200/70">IST</span>
        </div>

        {/* Armed / Standby Toggle */}
        <button
          onClick={toggleArmed}
          aria-label={armed ? "Disarm system" : "Arm system"}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
            armed
              ? 'bg-[#0b8d8b]/30 text-cyan-200 border-cyan-400/40 shadow-xs'
              : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${armed ? 'bg-cyan-300 animate-pulse' : 'bg-amber-400'}`} />
          <span>{armed ? 'Armed' : 'Standby'}</span>
        </button>

        {/* Quick Demo Threat Trigger */}
        {demoMode && (
          <button
            onClick={triggerWeaponDemo}
            className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/30 text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Simulate immediate boundary weapon breach (or press 'K')"
          >
            <i className="ti ti-shield-alert text-sm" />
            <span>Demo [K]</span>
          </button>
        )}

        {/* Sound Toggle */}
        <button
          onClick={toggleSound}
          className={`p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer ${
            soundEnabled ? 'text-teal-400' : 'text-slate-400'
          }`}
          title={soundEnabled ? 'Sound Enabled' : 'Sound Muted'}
          aria-label="Toggle Sound Alerts"
        >
          <i className={`ti ${soundEnabled ? 'ti-volume' : 'ti-volume-3'} text-base`} />
        </button>

        {/* Notifications Popover */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotificationsOpen(prev => !prev)}
            className="relative p-2 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white transition-colors"
            aria-label={`Notifications: ${unreviewedAlerts.length} unread`}
          >
            <i className="ti ti-bell text-base" />
            {criticalCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#0b1e34]" />
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border-default rounded-xl shadow-xl py-2 z-50 text-xs text-txt-primary">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
                <span className="font-bold text-txt-primary">Threat Notifications</span>
                <span className="text-[10px] text-txt-muted font-mono">{unreviewedAlerts.length} Unresolved</span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
                {unreviewedAlerts.length === 0 ? (
                  <div className="p-4 text-center text-txt-muted text-xs">
                    All perimeters secure. Zero unreviewed breaches.
                  </div>
                ) : (
                  unreviewedAlerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className="p-3 hover:bg-surface-subtle transition-colors flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold font-mono text-txt-primary">{alert.id}</span>
                        <span className="text-[10px] text-txt-muted font-mono">
                          {new Date(alert.ts).toLocaleTimeString('en-IN', { hour12: false })}
                        </span>
                      </div>
                      <div className="text-txt-secondary text-[11px] line-clamp-1">{alert.detail}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-txt-muted">{alert.camName}</span>
                        <button
                          onClick={() => {
                            openLightbox(alert.id);
                            setNotificationsOpen(false);
                          }}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          Inspect Snapshot →
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-border-subtle text-center">
                <button
                  onClick={() => {
                    goToPage('alerts');
                    setNotificationsOpen(false);
                  }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  View All Alerts
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-white/10 text-slate-200 hover:text-white transition-colors"
          title={theme === 'light' ? 'Switch to Dark Mode (Charcoal)' : 'Switch to Light Mode'}
          aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'} text-base`} />
        </button>

        {/* Officer Profile Avatar */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(prev => !prev)}
            className="w-[34px] h-[34px] rounded-full bg-[#d9eaf5] text-[#163b56] flex items-center justify-center font-extrabold text-xs shadow-inner cursor-pointer hover:ring-2 hover:ring-cyan-300 transition-all"
            aria-label="Officer Profile & Role Menu"
          >
            {currentUser?.username?.[0]?.toUpperCase() || 'OP'}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border-default rounded-xl shadow-xl py-1.5 z-50 text-xs text-txt-primary">
              {currentUser ? (
                <>
                  <div className="px-3 py-2 border-b border-border-subtle">
                    <div className="font-bold text-txt-primary">{currentUser.username}</div>
                    <div className="text-[10px] text-txt-muted uppercase font-mono mt-0.5">Role: {currentUser.role}</div>
                  </div>

                  {demoMode ? (
                    <>
                      <div className="px-3 py-1 text-[10px] font-bold text-txt-muted uppercase tracking-wider">
                        Switch demo role
                      </div>
                      {(['operator', 'supervisor', 'admin'] as const).map(role => (
                        <button
                          key={role}
                          onClick={async () => {
                            await switchRoleDemo(role);
                            setProfileOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left capitalize flex items-center justify-between hover:bg-surface-subtle transition-colors ${
                            currentUser.role === role ? 'font-bold text-primary' : 'text-txt-secondary'
                          }`}
                        >
                          <span>{role}</span>
                          {currentUser.role === role && <span className="text-primary font-bold">✓</span>}
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-txt-muted">
                      Role changes are managed by the server administrator.
                    </div>
                  )}

                  <button
                    onClick={() => {
                      logout();
                      setProfileOpen(false);
                    }}
                    className="w-full border-t border-border-subtle mt-1 px-3 py-2 text-left font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <form onSubmit={handleLogin} className="p-3 flex flex-col gap-2.5">
                  <div>
                    <div className="font-bold text-txt-primary">Sign in to IBVAP</div>
                    <div className="text-[10px] text-txt-muted mt-0.5">Use an assigned account to load protected features.</div>
                  </div>
                  <input
                    value={loginUsername}
                    onChange={event => setLoginUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Username"
                    className="h-9 rounded-lg border border-border-default bg-surface-subtle px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <input
                    value={loginPassword}
                    onChange={event => setLoginPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    className="h-9 rounded-lg border border-border-default bg-surface-subtle px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={loginBusy || !loginUsername.trim() || !loginPassword}
                    className="h-9 rounded-lg bg-gradient-to-r from-cyan-700 to-teal-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loginBusy ? 'Signing in…' : 'Sign in'}
                  </button>
                  <div className="text-[10px] leading-4 text-txt-muted">
                    Local development accounts are created by the backend runner when demo users are enabled.
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
