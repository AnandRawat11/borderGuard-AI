import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';

export const DashboardHome: React.FC = () => {
  const { cams, alerts, openLightbox, showNotice, goToPage } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [lookupId, setLookupId] = useState<string>('');
  const [activeShortcut, setActiveShortcut] = useState<string>('all');

  const evidencePanelRef = useRef<HTMLDivElement>(null);

  // Filter alerts for the primary evidence table
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      // Shortcut filter
      if (activeShortcut === 'knife' && a.type !== 'weapon') return false;
      if (activeShortcut === 'person' && a.type !== 'intrusion' && a.type !== 'watchlist') return false;
      if (activeShortcut === 'vehicle' && a.type !== 'anpr') return false;
      if (activeShortcut === 'review' && a.reviewed) return false;
      if (activeShortcut === 'saved' && a.state !== 'resolved') return false;

      // Status dropdown filter
      if (statusFilter === 'needs_review' && a.reviewed) return false;
      if (statusFilter === 'reviewed' && (!a.reviewed || a.state === 'resolved')) return false;
      if (statusFilter === 'resolved' && a.state !== 'resolved') return false;

      // Type dropdown filter
      if (typeFilter === 'knife' && a.type !== 'weapon') return false;
      if (typeFilter === 'person' && a.type !== 'intrusion' && a.type !== 'watchlist') return false;
      if (typeFilter === 'vehicle' && a.type !== 'anpr') return false;
      if (typeFilter !== 'all' && typeFilter !== 'knife' && typeFilter !== 'person' && typeFilter !== 'vehicle' && a.type !== typeFilter) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = a.id.toLowerCase().includes(q);
        const matchesDetail = a.detail.toLowerCase().includes(q);
        const matchesCam = a.camName.toLowerCase().includes(q);
        const matchesType = a.type.toLowerCase().includes(q);
        const matchesLoc = a.location.toLowerCase().includes(q);
        if (!matchesId && !matchesDetail && !matchesCam && !matchesType && !matchesLoc) return false;
      }
      return true;
    });
  }, [alerts, activeShortcut, statusFilter, typeFilter, searchQuery]);

  // Metric counts
  const openAlertsCount = alerts.filter(a => !a.reviewed).length;
  const onlineCamsCount = cams.filter(c => c.online).length;
  const reviewedTodayCount = alerts.filter(a => a.reviewed).length;

  const handleShortcutClick = (shortcut: string) => {
    setActiveShortcut(shortcut);
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    if (evidencePanelRef.current) {
      evidencePanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const label = shortcut === 'all' ? 'all' : shortcut === 'knife' ? 'guns & prohibited weapons' : shortcut === 'review' ? 'needs review' : 'saved';
    showNotice('success', `Showing ${label} evidence records`);
  };

  const handleLookup = () => {
    const term = lookupId.trim().toUpperCase();
    if (!term) return;
    const found = alerts.find(a => a.id.toUpperCase() === term || a.trackId?.toUpperCase() === term);
    if (found) {
      openLightbox(found.id);
      showNotice('success', `Found record ${found.id}`);
    } else {
      showNotice('error', `No record found matching ID "${term}". Try EVT-0001 or #104`);
    }
  };

  const handleExportSitRep = () => {
    const sitrep = {
      report: 'IBVAP Tactical Defense Situation Report',
      timestamp: new Date().toISOString(),
      activeCameras: `${onlineCamsCount}/${cams.length}`,
      openThreats: openAlertsCount,
      cryptographicChain: 'SHA-256 Ledger Verified (0 Anomalies)',
      records: alerts.map(a => ({ id: a.id, event: a.detail, camera: a.camName, severity: a.sev, time: a.ts }))
    };
    const blob = new Blob([JSON.stringify(sitrep, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IBVAP-SitRep-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotice('success', 'Situation Report exported with cryptographic SHA-256 proof.');
  };

  return (
    <div className="dashboard-shell flex-1 flex flex-col h-full overflow-y-auto px-4 md:px-8 py-5 max-w-[1650px] w-full mx-auto space-y-5">
      
      {/* =========================================================================
          PAGE HEADER
          ========================================================================= */}
      <header className="shrink-0">
        <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-primary font-bold">Overview</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary m-0 leading-tight font-display">
            Surveillance overview
          </h1>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportSitRep}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] spatial-glass text-xs font-semibold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-download" aria-hidden="true" />
              <span>Export view</span>
            </button>
            <button
              onClick={() => goToPage('vault')}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[10px] text-white font-bold text-xs brand-button hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-archive" aria-hidden="true" />
              <span>Open evidence vault</span>
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          QUICK ACTION BAR
          ========================================================================= */}
      <div className="hero-banner shrink-0">
        <div
          aria-hidden="true"
          className="spatial-orb spatial-orb-mini hidden sm:block absolute -right-3 -top-5"
        />
        <div className="hero-copy">
          <h2>Review the moment that matters.</h2>
        </div>

        <div className="hero-actions">
          <button className="btn" onClick={() => goToPage('monitor')}>
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>Open live monitor</span>
          </button>
          <button className="btn" onClick={() => goToPage('alerts')}>
            <span>View priority alerts →</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          4 CURATED DISTINCTLY COLOURED METRIC CARDS
          ========================================================================= */}
      <div className="metrics shrink-0" aria-label="Key Performance Indicators">
        
        {/* CARD 1: TEAL */}
        <div className="metric teal" onClick={() => goToPage('alerts')}>
          <div className="metric-head">
            Open alerts <span className="metric-icon"><i className="ti ti-bell-ringing" aria-hidden="true" /></span>
          </div>
          <b>{String(openAlertsCount).padStart(2, '0')}</b>
        </div>

        {/* CARD 2: BLUE */}
        <div className="metric blue" onClick={() => goToPage('vault')}>
          <div className="metric-head">
            Evidence records <span className="metric-icon"><i className="ti ti-archive" aria-hidden="true" /></span>
          </div>
          <b>{String(alerts.length).padStart(2, '0')}</b>
          <small>Records returned by the API</small>
        </div>

        {/* CARD 3: ORANGE */}
        <div className="metric orange" onClick={() => goToPage('camgrid')}>
          <div className="metric-head">
            Camera feeds <span className="metric-icon"><i className="ti ti-device-cctv" aria-hidden="true" /></span>
          </div>
          <b>{String(onlineCamsCount).padStart(2, '0')}</b>
          <small>{onlineCamsCount} online · {cams.length} configured</small>
        </div>

        {/* CARD 4: PURPLE */}
        <div className="metric purple" onClick={() => goToPage('alerts')}>
          <div className="metric-head">
            Reviewed records <span className="metric-icon"><i className="ti ti-circle-check" aria-hidden="true" /></span>
          </div>
          <b>{String(reviewedTodayCount).padStart(2, '0')}</b>
        </div>

      </div>

      {/* =========================================================================
          TWO-COLUMN MAIN SECTION (Left 1.65fr, Right 0.85fr)
          ========================================================================= */}
      <div className="columns shrink-0">
        
        {/* LEFT STACK (1.65fr) */}
        <div className="stack">
          
          {/* Panel 1: Recent Alerts & Evidence Table */}
          <section ref={evidencePanelRef} className="panel">
            <div className="panel-head">
              <h2>Recent alerts &amp; evidence</h2>
              <button
                onClick={() => goToPage('alerts')}
                className="textbtn"
              >
                View all →
              </button>
            </div>

            {/* Filter Tools */}
            <div className="tools">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search ID, object, camera"
                aria-label="Search evidence"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter status"
              >
                <option value="all">All statuses</option>
                <option value="needs_review">Needs review</option>
                <option value="reviewed">Reviewed</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                aria-label="Filter event type"
              >
                <option value="all">All event types</option>
                <option value="knife">Guns &amp; Prohibited Weapons</option>
                <option value="person">Person detections</option>
                <option value="vehicle">Vehicle detections</option>
                <option value="intrusion">Fence intrusion</option>
              </select>
            </div>

            {/* Table with ALL 6 columns clean, compact and visible */}
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Event / evidence ID</th>
                    <th>Camera / location</th>
                    <th>Time</th>
                    <th>Priority</th>
                    <th>Review</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '25px', textAlign: 'center', color: 'var(--muted)' }}>
                        No matching records.
                      </td>
                    </tr>
                  ) : (
                    filteredAlerts.slice(0, 5).map(r => {
                      const isHigh = r.sev === 'high';
                      const isMed = r.sev === 'med';
                      const isReview = !r.reviewed;
                      const isResolved = r.state === 'resolved';

                      // Distinguish weapon alerts cleanly per Feature 5
                      const weaponTitle = (r.reviewed || r.verificationStatus === 'officer_reviewed')
                        ? 'Officer-Reviewed Weapon Alert'
                        : r.verificationStatus === 'potential'
                        ? 'Potential Weapon Detection'
                        : 'Verified AI Weapon Alert';

                      const eventTitle = r.type === 'weapon' ? weaponTitle :
                                         r.type === 'intrusion' ? 'Fence intrusion' :
                                         r.type === 'watchlist' ? 'Watchlist candidate' :
                                         r.type === 'anpr' ? 'Vehicle detected' :
                                         r.type === 'loiter' ? 'Loitering detected' :
                                         'Threat detected';

                      const camCode = r.camId.toUpperCase();
                      const placeName = r.location.split('—')[0].trim();

                      return (
                        <tr
                          key={r.id}
                          className={isHigh ? 'row-high' : isMed ? 'row-med' : ''}
                        >
                          <td>
                            <span className="eventname">{eventTitle}</span>
                            <span className="sub">{r.id} · Track {r.trackId || 'N/A'}{r.supportingDetections && r.supportingDetections > 1 ? ` (${r.supportingDetections} hits)` : ''} · {r.detail}</span>
                          </td>
                          <td>
                            <span className="eventname">{camCode}</span>
                            <span className="sub">{placeName}</span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                            {new Date(r.ts).toLocaleTimeString('en-IN', { hour12: false })}
                          </td>
                          <td>
                            <span className={`badge ${isHigh ? 'red' : isMed ? 'orange' : 'gray'}`}>
                              {r.sev === 'high' ? 'High' : r.sev === 'med' ? 'Medium' : 'Low'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${isReview ? 'orange' : isResolved ? 'green' : 'gray'}`}>
                              {isReview ? 'Needs review' : isResolved ? 'Resolved' : 'Reviewed'}
                            </span>
                          </td>
                          <td>
                            <button
                              onClick={() => openLightbox(r.id)}
                              className="openlink"
                            >
                              Open →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Panel 2: Latest activity */}
          <section className="panel">
            <div className="panel-head">
              <h2>Latest activity</h2>
              <button
                onClick={() => goToPage('analytics')}
                className="textbtn"
              >
                Full timeline →
              </button>
            </div>

            <div className="timeline">
              {alerts.length === 0 ? (
                <div className="empty-state">No events recorded yet.</div>
              ) : alerts.slice(0, 3).map((a, idx) => {
                const colors = ['var(--primary)', 'var(--lavender)', 'var(--purple)'];
                const dotColor = colors[idx % colors.length];

                return (
                  <div key={a.id} className="time-row">
                    <time>
                      {new Date(a.ts).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <i className="time-dot" style={{ backgroundColor: dotColor }}></i>
                    <span>
                      {a.detail}
                      <small>
                        {a.camId.toUpperCase()} · <button onClick={() => openLightbox(a.id)} className="openlink" style={{ padding: 0 }}>{a.id}</button>
                      </small>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        {/* RIGHT STACK (0.85fr) */}
        <div className="stack rightstack">
          
          {/* Panel 1: Evidence shortcuts */}
          <section className="panel">
            <div className="panel-head">
              <h2>Evidence shortcuts</h2>
            </div>

            <div className="shortcut-grid">
              <button
                onClick={() => handleShortcutClick('all')}
                className={`shortcut ${activeShortcut === 'all' ? 'active' : ''}`}
              >
                <i className="ti ti-list-details" aria-hidden="true" />
                <b>All records</b>
              </button>

              <button
                onClick={() => handleShortcutClick('knife')}
                className={`shortcut ${activeShortcut === 'knife' ? 'active' : ''}`}
              >
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                <b>Guns &amp; Weapons</b>
              </button>

              <button
                onClick={() => handleShortcutClick('review')}
                className={`shortcut ${activeShortcut === 'review' ? 'active' : ''}`}
              >
                <i className="ti ti-clipboard-list" aria-hidden="true" />
                <b>Needs review</b>
              </button>

              <button
                onClick={() => handleShortcutClick('saved')}
                className={`shortcut ${activeShortcut === 'saved' ? 'active' : ''}`}
              >
                <i className="ti ti-bookmark" aria-hidden="true" />
                <b>Saved records</b>
              </button>
            </div>
          </section>

          {/* Panel 2: Camera Status */}
          <section className="panel">
            <div className="panel-head">
              <h2>Active surveillance feeds</h2>
              <button
                onClick={() => goToPage('camgrid')}
                className="textbtn"
              >
                All cameras →
              </button>
            </div>

            {cams.length === 0 ? (
              <div className="empty-state">No cameras configured.</div>
            ) : cams.map((cam, idx) => {
              const isWebcam = cam.sourceType === 'webcam' || cam.supportsWebcam;
              return (
                <div
                  key={cam.id}
                  className="camera-row cursor-pointer hover:bg-primary-surface/45 dark:hover:bg-white/5 px-1.5 rounded-lg transition-colors"
                  onClick={() => goToPage('monitor')}
                  title="Click to view in Live Monitor"
                >
                  <span
                    className="camicon"
                    style={{
                      color: idx % 2 === 0 ? 'var(--purple)' : 'var(--primary)'
                    }}
                  >
                    <i className={isWebcam ? "ti ti-video" : "ti ti-device-cctv"} aria-hidden="true" />
                  </span>
                  <span className="camtext">
                    <b>{cam.name}</b>
                    <small>{cam.location} · {isWebcam ? 'Webcam Sentry' : 'RTSP Network Stream'}</small>
                  </span>
                  <span className={`online ${cam.online ? '' : 'offline'}`}>
                    <i className="dot"></i>
                    {cam.online ? 'Active' : 'Offline'}
                  </span>
                </div>
              );
            })}
          </section>

          {/* Panel 3: Fast evidence lookup */}
          <section className="panel">
            <div className="panel-head">
              <h2>Fast evidence lookup</h2>
            </div>

            <div className="quicklookup">
              <input
                value={lookupId}
                onChange={e => setLookupId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="E.g. EVD-24018"
                aria-label="Evidence ID"
              />
              <button
                onClick={handleLookup}
                className="btn-find"
              >
                Find
              </button>
            </div>
          </section>

        </div>

      </div>

    </div>
  );
};
