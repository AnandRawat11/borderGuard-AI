import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { SpatialOverlay } from './Spatial/MotionPrimitives';

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
    register,
    logout
  } = useApp();

  const [timeStr, setTimeStr] = useState<string>('--:--:--');
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginBusy, setLoginBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
    setAuthError(null);
    try {
      await login(loginUsername.trim(), loginPassword);
      setLoginPassword('');
      setAuthError(null);
      setProfileOpen(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Invalid credentials');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginUsername.trim() || !loginPassword) return;
    setLoginBusy(true);
    setAuthError(null);
    try {
      await register(loginUsername.trim(), loginPassword, loginEmail.trim() || undefined);
      setLoginPassword('');
      setLoginEmail('');
      setAuthError(null);
      setAuthMode('signin');
      setProfileOpen(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Registration failed');
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <header className="h-[68px] shrink-0 topbar spatial-glass-nav text-txt-primary flex items-center px-2 sm:px-4 lg:px-7 gap-1 sm:gap-2 lg:gap-5 select-none z-30 relative border-b border-border-default">
      {/* Mobile Drawer Button */}
      <button
        onClick={toggleMobileMenu}
        className="md:hidden p-1.5 rounded-[10px] text-txt-secondary hover:text-primary hover:bg-primary-surface/70 transition-colors cursor-pointer"
        aria-label="Open mobile navigation"
      >
        <i className="ti ti-menu-2 text-xl" />
      </button>

      {/* Desktop Sidebar Rail Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="hidden md:flex p-1.5 rounded-[10px] text-txt-secondary hover:text-primary hover:bg-primary-surface/70 transition-colors cursor-pointer shrink-0"
        title={sidebarCollapsed ? "Expand sidebar rail" : "Collapse sidebar rail"}
        aria-label={sidebarCollapsed ? "Expand sidebar rail" : "Collapse sidebar rail"}
      >
        <i className={`ti ${sidebarCollapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'} text-lg`} />
      </button>

      {/* Brand Logo & Name */}
      <div
        onClick={() => goToPage('dashboard')}
        className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 lg:min-w-[210px] cursor-pointer"
      >
        <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center font-black text-sm text-primary-text bg-primary brand-mark font-display shrink-0">
          IB
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-[15px] tracking-wider leading-none text-txt-primary font-display">
            IBVAP
          </div>
          <div className="brand-caption text-[9px] tracking-[0.11em] uppercase text-txt-muted font-semibold mt-1 leading-none">
            INTELLIGENT BORDER VIDEO ANALYTICS
          </div>
        </div>
      </div>

      {/* Center Spacer */}
      <div className="flex-1" />

      {/* Right Controls */}
      <div className="flex items-center gap-0.5 sm:gap-1 lg:gap-2.5 shrink-0">
        {/* Live Clock */}
        <div className="hidden xl:block font-mono text-xs font-semibold text-txt-secondary bg-surface/65 border border-border-default px-2.5 py-1 rounded-[10px] tabular-nums">
          {timeStr} <span className="text-[10px] text-txt-muted">IST</span>
        </div>

        {/* Armed / Standby Toggle */}
        <button
          onClick={toggleArmed}
          aria-label={armed ? "Disarm system" : "Arm system"}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-[10px] text-xs font-bold transition-all border ${
            armed
              ? 'bg-status-success-surface/90 text-status-success border-status-success-border'
              : 'bg-status-warning-surface/90 text-status-warning border-status-warning-border'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${armed ? 'bg-online' : 'bg-amber-400'}`} />
          <span>{armed ? 'Armed' : 'Standby'}</span>
        </button>

        {/* Quick Demo Threat Trigger */}
        {demoMode && (
          <button
            onClick={triggerWeaponDemo}
            className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-[10px] bg-status-danger-surface/90 hover:bg-status-danger-surface text-status-danger border border-status-danger-border text-xs font-bold transition-all cursor-pointer"
            title="Simulate immediate boundary weapon breach (or press 'K')"
          >
            <i className="ti ti-shield-exclamation text-sm" />
            <span>Demo [K]</span>
          </button>
        )}

        {/* Sound Toggle */}
        <button
          onClick={toggleSound}
          className={`p-2 rounded-[10px] hover:bg-primary-surface/70 transition-colors cursor-pointer ${
            soundEnabled ? 'text-primary' : 'text-txt-muted'
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
            className="relative p-2 rounded-[10px] hover:bg-primary-surface/70 text-txt-secondary hover:text-primary transition-colors"
            aria-label={`Notifications: ${unreviewedAlerts.length} unread`}
          >
            <i className="ti ti-bell text-base" />
            {criticalCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-surface" />
            )}
          </button>

          {notificationsOpen && (
            <SpatialOverlay className="ui-popover spatial-glass-overlay absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-6.5rem)] py-2 z-50 text-xs text-txt-primary">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
                <span className="font-bold text-txt-primary">Threat Notifications</span>
                <span className="text-[10px] text-txt-muted font-mono">{unreviewedAlerts.length} Unresolved</span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
                {unreviewedAlerts.length === 0 ? (
                  <div className="p-4 text-center text-txt-muted text-xs">
                    No unresolved alerts.
                  </div>
                ) : (
                  unreviewedAlerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className="p-3 hover:bg-primary-surface/45 transition-colors flex flex-col gap-1">
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
            </SpatialOverlay>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-[10px] hover:bg-primary-surface/70 text-txt-secondary hover:text-primary transition-colors"
          title={theme === 'light' ? 'Switch to Dark Mode (Charcoal)' : 'Switch to Light Mode'}
          aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'} text-base`} />
        </button>

        {/* Officer Profile Avatar */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(prev => !prev)}
            className="w-[34px] h-[34px] rounded-full bg-primary-surface/90 border border-primary-border text-primary flex items-center justify-center font-extrabold text-xs cursor-pointer hover:ring-2 hover:ring-primary-border transition-all"
            aria-label="Officer Profile & Role Menu"
          >
            {currentUser?.username?.[0]?.toUpperCase() || 'OP'}
          </button>

          {profileOpen && (
            <SpatialOverlay className="ui-popover spatial-glass-overlay absolute right-0 top-full mt-2 w-64 py-1.5 z-50 text-xs text-txt-primary">
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
                          className={`w-full px-3 py-1.5 text-left capitalize flex items-center justify-between hover:bg-primary-surface/45 transition-colors ${
                            currentUser.role === role ? 'font-bold text-primary' : 'text-txt-secondary'
                          }`}
                        >
                          <span>{role}</span>
                          {currentUser.role === role && <span className="text-primary font-bold"><i className="ti ti-check" aria-hidden="true" /></span>}
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
                    className="w-full border-t border-border-subtle mt-1 px-3 py-2 text-left font-semibold text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-950/30"
                  >
                    Sign out
                  </button>
                </>
              ) : authMode === 'signin' ? (
                <form onSubmit={handleLogin} className="p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-txt-primary">Sign in to IBVAP</div>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setAuthError(null);
                      }}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Create account
                    </button>
                  </div>
                  <input
                    value={loginUsername}
                    onChange={event => {
                      setLoginUsername(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    autoComplete="username"
                    placeholder="Username or email"
                    className="h-9 rounded-[10px] border border-border-default bg-surface/85 px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-primary-border"
                  />
                  <input
                    value={loginPassword}
                    onChange={event => {
                      setLoginPassword(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    className="h-9 rounded-[10px] border border-border-default bg-surface/85 px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-primary-border"
                  />
                  {authError && (
                    <div role="alert" className="text-[11px] font-medium text-rose-600 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/70 rounded-[8px] px-2.5 py-1.5">
                      {authError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loginBusy || !loginUsername.trim() || !loginPassword}
                    className="h-9 rounded-[10px] brand-button text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loginBusy ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-txt-primary">Create account</div>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setAuthError(null);
                      }}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </div>
                  <input
                    value={loginUsername}
                    onChange={event => {
                      setLoginUsername(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    autoComplete="username"
                    placeholder="Username"
                    className="h-9 rounded-[10px] border border-border-default bg-surface/85 px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-primary-border"
                  />
                  <input
                    value={loginEmail}
                    onChange={event => {
                      setLoginEmail(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    type="email"
                    autoComplete="email"
                    placeholder="Email (optional)"
                    className="h-9 rounded-[10px] border border-border-default bg-surface/85 px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-primary-border"
                  />
                  <input
                    value={loginPassword}
                    onChange={event => {
                      setLoginPassword(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Password (min 6 chars)"
                    className="h-9 rounded-[10px] border border-border-default bg-surface/85 px-2.5 text-xs text-txt-primary outline-none focus:ring-2 focus:ring-primary-border"
                  />
                  {authError && (
                    <div role="alert" className="text-[11px] font-medium text-rose-600 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/70 rounded-[8px] px-2.5 py-1.5">
                      {authError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loginBusy || !loginUsername.trim() || loginPassword.length < 6}
                    className="h-9 rounded-[10px] brand-button text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loginBusy ? 'Creating account…' : 'Create account'}
                  </button>
                </form>
              )}
            </SpatialOverlay>
          )}
        </div>

      </div>
    </header>
  );
};
