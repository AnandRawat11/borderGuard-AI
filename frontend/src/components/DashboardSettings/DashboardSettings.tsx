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
      <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
        <div className="border-b border-border-default px-6 py-4 shrink-0 bg-surface">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <i className="ti ti-settings text-blue-400 text-lg" />
            </span>
            <div>
              <h1 className="text-[15px] font-bold text-txt-primary">Dashboard Settings</h1>
              <p className="text-[11px] text-txt-muted">Administrator access required</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
              <i className="ti ti-lock text-red-400 text-2xl" />
            </div>
            <div className="text-[14px] font-bold text-txt-primary mb-1">Access Restricted</div>
            <div className="text-[12px] text-txt-muted">Administrator role required to manage settings.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
      {/* Header */}
      <div className="border-b border-border-default px-6 py-4 shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <i className="ti ti-settings text-blue-400 text-lg" />
          </span>
          <div>
            <h1 className="text-[15px] font-bold text-txt-primary tracking-tight">Dashboard Settings</h1>
            <p className="text-[11px] text-txt-muted">Administrator configuration · Agent37 & Gemini AI integration</p>
          </div>
          <span className="ml-auto text-[10px] font-bold text-blue-400 bg-blue-400/10 px-3 py-1.5 rounded-full">
            ADMIN ONLY
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Agent37 API Key Card */}
        <div className="bg-surface border border-border-default rounded-2xl overflow-hidden shadow-sm">
          {/* Card Header */}
          <div className="px-5 py-4 border-b border-border-default/60 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <i className="ti ti-brain text-violet-400" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-txt-primary">AI Intelligence Configuration</div>
              <div className="text-[11px] text-txt-muted">Support for Agent37 Cloud (agent37.com) and Google Gemini (AI Studio)</div>
            </div>
            {/* Status badge */}
            <div className="ml-auto">
              {loadingStatus ? (
                <span className="text-[11px] text-txt-muted flex items-center gap-1.5">
                  <i className="ti ti-loader-2 animate-spin text-[10px]" />
                  Checking…
                </span>
              ) : keyStatus?.configured ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  CONFIGURED
                  {keyStatus.provider && (
                    <span className="text-[10px] uppercase opacity-80 ml-1">
                      ({keyStatus.provider})
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  NOT SET
                </span>
              )}
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Quick Provider Selection / Links */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Agent37 */}
              <a
                href="https://www.agent37.com/dashboard/cloud/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-3 bg-canvas border border-border-default/80 hover:border-emerald-500/40 rounded-xl transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                    <i className="ti ti-sparkles text-xs" />
                  </span>
                  <span className="text-[12px] font-bold text-txt-primary group-hover:text-emerald-400 transition-colors">
                    Agent37 Cloud
                  </span>
                  <i className="ti ti-arrow-up-right text-[11px] text-txt-muted ml-auto group-hover:text-emerald-400" />
                </div>
                <p className="text-[10px] text-txt-muted leading-tight">
                  Keys starting with <code className="text-emerald-400/90 font-mono">sk_live_...</code>
                </p>
              </a>

              {/* Gemini */}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-3 bg-canvas border border-border-default/80 hover:border-blue-500/40 rounded-xl transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-400">
                    <i className="ti ti-brand-google text-xs" />
                  </span>
                  <span className="text-[12px] font-bold text-txt-primary group-hover:text-blue-400 transition-colors">
                    Google Gemini
                  </span>
                  <i className="ti ti-arrow-up-right text-[11px] text-txt-muted ml-auto group-hover:text-blue-400" />
                </div>
                <p className="text-[10px] text-txt-muted leading-tight">
                  Keys starting with <code className="text-blue-400/90 font-mono">AIzaSy...</code>
                </p>
              </a>

              {/* Local Demo */}
              <button
                type="button"
                onClick={() => {
                  setApiKey('agent37-demo-key');
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                className="text-left group p-3 bg-canvas border border-border-default/80 hover:border-purple-500/40 rounded-xl transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center text-purple-400">
                    <i className="ti ti-bolt text-xs" />
                  </span>
                  <span className="text-[12px] font-bold text-txt-primary group-hover:text-purple-400 transition-colors">
                    Offline Demo Key
                  </span>
                  <span className="ml-auto text-[9px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                    FILL
                  </span>
                </div>
                <p className="text-[10px] text-txt-muted leading-tight">
                  Instant offline simulated tactical reports
                </p>
              </button>
            </div>

            {/* Current key display */}
            {keyStatus?.configured && (
              <div className="flex items-center gap-3 p-3.5 bg-canvas rounded-xl border border-border-default/70">
                <i className="ti ti-key text-txt-muted" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-txt-muted">Active Key</span>
                    {keyStatus.provider && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 uppercase">
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
                  className="w-full bg-canvas border border-border-default rounded-xl px-4 py-2.5 pr-10 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition font-mono"
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

              <p className="text-[11px] text-txt-muted">
                Paste your key from{' '}
                <a
                  href="https://www.agent37.com/dashboard/cloud/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline font-medium"
                >
                  agent37.com
                </a>{' '}
                or{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline font-medium"
                >
                  Google AI Studio
                </a>
                . The key is validated in real-time and stored with AES-256-GCM encryption.
              </p>
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
                <div className="mt-3 p-3.5 bg-canvas rounded-xl border border-border-default/60 space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-txt-secondary block mb-1">
                      Custom Base URL / Instance URL
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={e => setBaseUrl(e.target.value)}
                      placeholder="e.g. https://api.agent37.com or https://instance.agent37.app/v1"
                      className="w-full bg-surface border border-border-default rounded-lg px-3 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-muted font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <p className="text-[10px] text-txt-muted mt-1">
                      Leave blank to use the provider's default cloud API.
                    </p>
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
                      className="w-full bg-surface border border-border-default rounded-lg px-3 py-1.5 text-[12px] text-txt-primary placeholder:text-txt-muted font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <p className="text-[10px] text-txt-muted mt-1">
                      Leave blank to auto-negotiate the optimal supported model.
                    </p>
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
                  ? 'bg-violet-500/20 text-violet-300/50 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:-translate-y-0.5'
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

        {/* Info Card */}
        <div className="bg-surface border border-border-default rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <i className="ti ti-info-circle text-blue-400" />
            <span className="text-[12px] font-extrabold uppercase tracking-widest text-txt-muted">About Agent37 AI Features</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: 'ti-brain', color: '#8b5cf6', title: 'Incident Investigation', desc: 'Analyse individual alerts with correlated evidence, threat assessment, and tactical recommendations.' },
              { icon: 'ti-file-report', color: '#0ea5e9', title: 'Surveillance Briefing', desc: 'Generate aggregated intelligence reports covering patrol windows from 1 hour to 7 days.' },
              { icon: 'ti-shield-lock', color: '#22c55e', title: 'Encrypted Storage', desc: 'API keys are encrypted with AES-256-GCM at rest. The raw key is never returned by the API.' },
              { icon: 'ti-user-check', color: '#f59e0b', title: 'Supervisor Review', desc: 'All AI outputs are advisory. Human supervisor review is required before operational use.' },
            ].map(item => (
              <div key={item.title} className="flex gap-3 p-3 bg-canvas rounded-xl border border-border-default/60">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${item.color}20`, color: item.color }}
                >
                  <i className={`ti ${item.icon} text-sm`} />
                </div>
                <div>
                  <div className="text-[12px] font-bold text-txt-primary mb-0.5">{item.title}</div>
                  <div className="text-[11px] text-txt-muted leading-snug">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
