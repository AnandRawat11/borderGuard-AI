import React, { useState, useEffect } from 'react';
import {
  getAgent37Settings,
  saveAgent37Key,
  deleteAgent37Key,
  Agent37KeyStatus,
} from '../../services/agent37';
import { useApp } from '../../context/AppContext';

export const DashboardSettings: React.FC = () => {
  const { currentUser, showNotice } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const [keyStatus, setKeyStatus] = useState<Agent37KeyStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetchStatus();
  }, [isAdmin]);

  async function fetchStatus() {
    setLoadingStatus(true);
    try {
      const s = await getAgent37Settings(currentUser?.accessToken);
      setKeyStatus(s);
      if (s?.base_url) setBaseUrl(s.base_url);
      if (s?.model) setModelName(s.model);
    } catch (e: any) {
      setKeyStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  // Real-time key type detection
  const detectedType = (() => {
    const k = apiKey.trim();
    if (!k) return null;
    if (k.startsWith('sk_live_')) {
      return {
        id: 'agent37',
        name: 'Agent37 Cloud',
        badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
        icon: 'ti-sparkles',
        note: 'Keys from agent37.com/dashboard/cloud/api-keys',
      };
    }
    if (k.startsWith('AIza')) {
      return {
        id: 'gemini',
        name: 'Google Gemini',
        badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
        icon: 'ti-brand-google',
        note: 'Direct Gemini API key from Google AI Studio',
      };
    }
    if (k.startsWith('mock_') || k.startsWith('test_') || k.toLowerCase().includes('demo')) {
      return {
        id: 'demo',
        name: 'Local Demo / Simulation',
        badge: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
        icon: 'ti-device-desktop',
        note: 'Built-in offline tactical intelligence engine',
      };
    }
    if (k.startsWith('sk-')) {
      return {
        id: 'openai',
        name: 'OpenAI Compatible',
        badge: 'bg-teal-500/15 text-teal-400 border border-teal-500/30',
        icon: 'ti-cpu',
        note: 'OpenAI compatible chat completions endpoint',
      };
    }
    return {
      id: 'custom',
      name: 'Custom Provider',
      badge: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
      icon: 'ti-key',
      note: 'Configured with custom endpoint or model',
    };
  })();

  async function handleSave() {
    if (!apiKey.trim()) {
      setSaveError('Please enter an API key.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveAgent37Key(apiKey.trim(), baseUrl.trim(), modelName.trim(), currentUser?.accessToken);
      setSaveSuccess(true);
      setApiKey('');
      showNotice('success', 'AI Intelligence API key saved and validated successfully.');
      fetchStatus();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save API key.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove the AI Intelligence API key? AI features will be disabled.')) return;
    setDeleting(true);
    try {
      await deleteAgent37Key(currentUser?.accessToken);
      setKeyStatus({ configured: false, masked_key: null });
      setBaseUrl('');
      setModelName('');
      showNotice('success', 'AI API key removed.');
    } catch (e: any) {
      showNotice('error', e.message || 'Failed to remove key.');
    } finally {
      setDeleting(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
        <div className="spatial-glass-nav border-b border-border-default px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <i className="ti ti-settings text-primary text-lg" aria-hidden="true" />
              <h1 className="text-[15px] font-bold font-display text-txt-primary">Dashboard Settings</h1>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border-default bg-surface/70 text-[11px] font-semibold text-txt-muted">
              <i className="ti ti-lock text-xs" />
              Administrator access required
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="spatial-glass px-8 py-7 text-center max-w-sm">
            <i className="ti ti-lock text-status-danger text-2xl block mx-auto mb-2.5" aria-hidden="true" />
            <div className="text-[14px] font-bold text-txt-primary mb-1">Access Restricted</div>
            <div className="text-[12px] text-txt-muted">Administrator role required to manage settings.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      {/* Header */}
      <div className="spatial-glass-nav border-b border-border-default px-6 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <i className="ti ti-settings text-primary text-lg" aria-hidden="true" />
          <h1 className="text-[15px] font-bold font-display text-txt-primary tracking-tight">Dashboard Settings</h1>
          <span className="ml-auto text-[10px] font-bold text-primary bg-primary-surface px-3 py-1 rounded-full border border-primary-border/70">
            ADMIN ONLY
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-[1100px] w-full mx-auto">
        <div className="spatial-glass overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center gap-2.5">
            <i className="ti ti-brain text-primary text-base" aria-hidden="true" />
            <div className="text-[13px] font-bold font-display text-txt-primary">AI Intelligence Configuration</div>
            <div className="ml-auto">
              {loadingStatus ? (
                <span className="text-[11px] text-txt-muted flex items-center gap-1.5">
                  <i className="ti ti-loader-2 animate-spin text-[10px]" />
                  Checking…
                </span>
              ) : keyStatus?.configured ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-status-success-surface px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  CONFIGURED
                  {keyStatus.provider && (
                    <span className="text-[10px] uppercase opacity-80 ml-1">
                      ({keyStatus.provider})
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-status-warning bg-status-warning-surface px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  NOT SET
                </span>
              )}
            </div>
          </div>

          <div className="p-5 space-y-5 bg-surface/45">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <a
                href="https://www.agent37.com/dashboard/cloud/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-3 bg-surface/75 border border-border-default hover:border-emerald-500/50 rounded-[10px] transition-all"
              >
                <div className="flex items-center gap-2">
                  <i className="ti ti-sparkles text-sm text-emerald-500" aria-hidden="true" />
                  <span className="text-[12px] font-bold text-txt-primary group-hover:text-emerald-600 transition-colors">
                    Agent37 Cloud
                  </span>
                  <code className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono ml-auto">sk_live_...</code>
                  <i className="ti ti-arrow-up-right text-[11px] text-txt-muted group-hover:text-emerald-500" />
                </div>
              </a>

              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-3 bg-surface/75 border border-border-default hover:border-primary-border rounded-[10px] transition-all"
              >
                <div className="flex items-center gap-2">
                  <i className="ti ti-brand-google text-sm text-blue-500" aria-hidden="true" />
                  <span className="text-[12px] font-bold text-txt-primary group-hover:text-primary transition-colors">
                    Google Gemini
                  </span>
                  <code className="text-[10px] text-blue-600 dark:text-blue-400 font-mono ml-auto">AIzaSy...</code>
                  <i className="ti ti-arrow-up-right text-[11px] text-txt-muted group-hover:text-primary" />
                </div>
              </a>

              <button
                type="button"
                onClick={() => {
                  setApiKey('agent37-demo-key');
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                className="text-left group p-3 bg-surface/75 border border-border-default hover:border-primary-border rounded-[10px] transition-all"
              >
                <div className="flex items-center gap-2">
                  <i className="ti ti-bolt text-sm text-primary" aria-hidden="true" />
                  <span className="text-[12px] font-bold text-txt-primary group-hover:text-primary transition-colors">
                    Offline Demo Key
                  </span>
                  <span className="ml-auto text-[9px] font-bold text-primary bg-primary-surface px-1.5 py-0.5 rounded">
                    FILL
                  </span>
                </div>
              </button>
            </div>

            {/* Current key display */}
            {keyStatus?.configured && (
              <div className="flex items-center gap-3 p-3.5 bg-surface/75 rounded-[10px] border border-border-subtle">
                <i className="ti ti-key text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-txt-muted">Active Key</span>
                    {keyStatus.provider && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary-surface text-primary uppercase">
                        {keyStatus.provider}
                      </span>
                    )}
                    {keyStatus.model && (
                      <span className="text-[10px] text-txt-muted font-mono">
                        model: {keyStatus.model}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-mono text-txt-primary truncate">
                    {keyStatus.masked_key || '••••••••••••'}
                  </div>
                  {keyStatus.base_url && (
                    <div className="text-[10px] text-txt-muted font-mono truncate mt-0.5">
                      Endpoint: {keyStatus.base_url}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors shrink-0"
                  id="settings-delete-key-btn"
                >
                  {deleting ? <i className="ti ti-loader-2 animate-spin" /> : <i className="ti ti-trash" />}
                  Remove
                </button>
              </div>
            )}

            {/* Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-txt-secondary">
                  {keyStatus?.configured ? 'Replace API Key' : 'Enter API Key'}
                </label>
                {detectedType && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${detectedType.badge}`}>
                    <i className={`ti ${detectedType.icon}`} />
                    Detected: {detectedType.name}
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setSaveError(null); setSaveSuccess(false); }}
                  placeholder="Paste sk_live_... (Agent37) or AIzaSy... (Gemini)"
                  className="w-full bg-surface/85 border border-border-default rounded-[10px] px-4 py-2.5 pr-10 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-primary-border transition font-mono"
                  id="settings-agent37-key-input"
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                  type="button"
                  tabIndex={-1}
                >
                  <i className={`ti ${showKey ? 'ti-eye-off' : 'ti-eye'} text-sm`} />
                </button>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="text-[11px] text-txt-muted hover:text-txt-secondary flex items-center gap-1 font-medium transition-colors"
              >
                <i className={`ti ti-chevron-${showAdvanced ? 'up' : 'down'} text-[10px]`} />
                {showAdvanced ? 'Hide Custom Endpoint & Model Settings' : 'Custom Endpoint or Model (Optional)'}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3.5 bg-surface/65 rounded-[10px] border border-border-subtle space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-txt-secondary block mb-1">
                      Custom Base URL / Instance URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={e => setBaseUrl(e.target.value)}
                      placeholder="e.g. https://api.agent37.com or https://instance.agent37.app/v1"
                      className="w-full bg-surface/90 border border-border-default rounded-[10px] px-3 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-muted font-mono focus:outline-none focus:ring-1 focus:ring-primary-border"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-txt-secondary block mb-1">
                      Model Override
                    </label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={e => setModelName(e.target.value)}
                      placeholder="e.g. gemini-1.5-flash, gemini-2.0-flash, or agent37-tactical"
                      className="w-full bg-surface/90 border border-border-default rounded-[10px] px-3 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-muted font-mono focus:outline-none focus:ring-1 focus:ring-primary-border"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Feedback */}
            {saveError && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3.5 text-[12px] text-red-400">
                <i className="ti ti-alert-circle mt-0.5 shrink-0" />
                <span className="break-all">{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 text-[12px] text-emerald-400">
                <i className="ti ti-circle-check shrink-0" />
                <span>API key saved and validated successfully.</span>
              </div>
            )}

            {/* Save Button */}
            <button
              id="settings-save-key-btn"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-[13px] transition-all ${
                saving || !apiKey.trim()
                  ? 'ui-disabled'
                  : 'brand-button hover:-translate-y-0.5'
              }`}
            >
              {saving ? (
                <>
                  <i className="ti ti-loader-2 animate-spin" />
                  Validating & saving…
                </>
              ) : (
                <>
                  <i className="ti ti-device-floppy" />
                  {keyStatus?.configured ? 'Update AI Configuration' : 'Save AI Configuration'}
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-txt-muted px-1">
          <i className="ti ti-shield-lock text-emerald-500 shrink-0" aria-hidden="true" />
          <span>Keys encrypted at rest (AES-256-GCM). AI outputs are advisory; supervisor review required.</span>
        </div>
      </div>
    </div>
  );
};
