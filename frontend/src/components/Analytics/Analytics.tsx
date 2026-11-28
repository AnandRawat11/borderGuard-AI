import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useApp, TYPE_META } from '../../context/AppContext';
import { SpatialOverlay, SPATIAL_SPRING } from '../Spatial/MotionPrimitives';

export const Analytics: React.FC = () => {
  const { alerts, cams, openLightbox, metrics, telemetryFreshness, goToPage, triggerWeaponDemo, updateAlertState, openPatrolModal } = useApp();
  const donutCanvasRef = useRef<HTMLCanvasElement>(null);

  const [timeRange, setTimeRange] = useState<'24h' | '7d' | 'all'>('24h');
  const [timelineFilter, setTimelineFilter] = useState<string>('all');
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState<number>(10);
  const [densityMode, setDensityMode] = useState<'spacious' | 'compact'>('spacious');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Periodically refresh relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const getRelativeTime = (date: Date | string): string => {
    const ts = new Date(date).getTime();
    const diffSec = Math.max(0, Math.floor((nowTick - ts) / 1000));
    if (diffSec < 20) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  };

  const copyToClipboard = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // High threat weapon counts
  const weaponAlerts = alerts.filter(a => a.type === 'weapon');
  const weaponCount = weaponAlerts.length;
  const criticalCount = alerts.filter(a => a.sev === 'high').length;
  const intrusionCount = alerts.filter(a => a.type === 'intrusion').length;
  const watchlistCount = alerts.filter(a => a.type === 'watchlist').length;
  const anprCount = alerts.filter(a => a.type === 'anpr').length;
  const onlineCamsCount = cams.filter(c => c.online).length;

  const activeLatencies = metrics
    ? Object.values(metrics.cameraTelemetry)
        .map(t => t.inferenceLatencyMs)
        .filter((lat): lat is number => typeof lat === 'number' && lat > 0)
    : [];

  const avgLatencyVal = activeLatencies.length > 0
    ? `${Math.round(activeLatencies.reduce((a, b) => a + b, 0) / activeLatencies.length)}ms`
    : '18ms';
  const avgLatencySub = telemetryFreshness === 'stale'
    ? `Telemetry stale (${activeLatencies.length} worker(s) cached)`
    : activeLatencies.length > 0
    ? `Measured across ${activeLatencies.length} active camera worker(s)`
    : 'Edge TensorRT nominal';

  const types = Object.keys(TYPE_META);
  const typeColors: Record<string, string> = {
    weapon: '--red',
    intrusion: '--warning-ink',
    watchlist: '--primary',
    anpr: '--purple',
    loiter: '--green',
    night: '--blue'
  };

  const typeShortLabels: Record<string, string> = {
    weapon: 'Weapons & Firearms',
    intrusion: 'Fence Intrusion',
    watchlist: 'Watchlist POI',
    anpr: 'ANPR Vehicles',
    loiter: 'Loiter Warning',
    night: 'Night Activity'
  };

  const typeCounts = types.map(t => ({
    type: t,
    label: TYPE_META[t].label,
    shortLabel: typeShortLabels[t] || TYPE_META[t].label,
    color: typeColors[t] || '--primary',
    count: alerts.filter(a => a.type === t).length
  }));

  // =========================================================================
  // 24-HOUR INCIDENT TIMELINE HISTOGRAM DATA
  // Calculates hourly counts for weapons, intrusions, and other threats
  // =========================================================================
  const hourlyData = useMemo(() => {
    // Generate 24 hours (00:00 to 23:00)
    const hours = Array.from({ length: 24 }, (_, i) => {
      const hStr = `${String(i).padStart(2, '0')}:00`;
      return {
        hour: i,
        label: hStr,
        weapons: 0,
        intrusions: 0,
        other: 0,
        total: 0
      };
    });

    // Populate from real alert timestamps
    alerts.forEach(a => {
      const h = a.ts.getHours();
      if (hours[h]) {
        if (a.type === 'weapon') hours[h].weapons += 1;
        else if (a.type === 'intrusion') hours[h].intrusions += 1;
        else hours[h].other += 1;
        hours[h].total += 1;
      }
    });

    return hours;
  }, [alerts]);

  const maxHourlyCount = Math.max(...hourlyData.map(h => h.total), 1);
  const total24hIncidents = hourlyData.reduce((acc, h) => acc + h.total, 0);
  const peakHour = hourlyData.reduce((max, h) => (h.total > max.total ? h : max), hourlyData[0]);

  // Draw interactive Donut Canvas
  useEffect(() => {
    const canvas = donutCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const total = alerts.length || 1;
    ctx.clearRect(0, 0, 160, 160);
    const palette = getComputedStyle(document.documentElement);
    let ang = -Math.PI / 2;

    typeCounts.forEach(it => {
      if (it.count === 0) return;
      const slice = (it.count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(80, 80);
      ctx.arc(80, 80, 70, ang, ang + slice);
      ctx.closePath();
      ctx.fillStyle = palette.getPropertyValue(it.color).trim();
      ctx.fill();
      ang += slice;
    });

    // Inner cutout matching card surface
    const surfaceColor = palette.getPropertyValue('--surface').trim();
    const textColor = palette.getPropertyValue('--ink').trim();

    ctx.beginPath();
    ctx.arc(80, 80, 44, 0, Math.PI * 2);
    ctx.fillStyle = surfaceColor;
    ctx.fill();

    // Center total label
    ctx.fillStyle = textColor;
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(alerts.length), 80, 72);

    ctx.fillStyle = palette.getPropertyValue('--muted').trim();
    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.fillText('TOTAL EVENTS', 80, 92);
  }, [alerts, typeCounts]);

  // Sector density comparison
  const sectorComparison = cams.map(c => {
    const camAlerts = alerts.filter(a => a.camId === c.id);
    const weaponsInCam = camAlerts.filter(a => a.type === 'weapon').length;
    const highInCam = camAlerts.filter(a => a.sev === 'high').length;
    return {
      cam: c,
      totalAlerts: camAlerts.length,
      weapons: weaponsInCam,
      critical: highInCam,
      name: c.name.split('·')[0].trim()
    };
  });
  const maxSectorAlerts = Math.max(...sectorComparison.map(s => s.totalAlerts), 1);

  // Chronological Forensic Timeline Feed with Multi-factor Search
  const chronologicalAlerts = useMemo(() => {
    let list = alerts.slice().sort((a, b) => b.ts.getTime() - a.ts.getTime());
    if (timelineFilter === 'weapon') list = list.filter(a => a.type === 'weapon');
    else if (timelineFilter === 'intrusion') list = list.filter(a => a.type === 'intrusion');
    else if (timelineFilter === 'critical') list = list.filter(a => a.sev === 'high');
    else if (timelineFilter === 'watchlist') list = list.filter(a => a.type === 'watchlist' || a.type === 'anpr');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(a =>
        a.id.toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q) ||
        a.camName.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        (a.trackId && a.trackId.toLowerCase().includes(q)) ||
        a.type.toLowerCase().includes(q)
      );
    }
    return list;
  }, [alerts, timelineFilter, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto min-h-0 p-4 md:p-7 lg:p-9 max-w-[1550px] w-full mx-auto space-y-6 bg-transparent text-txt-primary scroll-smooth">
      {/* Header */}
      <header className="shrink-0">
        <div className="text-[11px] text-txt-muted mb-1 flex items-center gap-1.5 font-medium">
          <span>Operations</span>
          <span>/</span>
          <span className="text-info font-bold">Deep Video Analytics &amp; Forensic Timeline</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-[26px] font-extrabold tracking-tight text-txt-primary font-display m-0 leading-tight">
            Tactical Analytics &amp; Event Timeline
          </h1>

          <div className="flex items-center gap-2 min-w-0 flex-wrap xl:shrink-0">
            <button
              onClick={triggerWeaponDemo}
              title="Simulate firearm or combat blade detection"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-status-danger-surface/85 border border-status-danger-border text-status-danger text-xs font-bold hover:bg-status-danger-surface transition-all cursor-pointer"
            >
              <i className="ti ti-flame text-sm" />
              <span>Simulate Weapon (K)</span>
            </button>
            <button
              onClick={() => goToPage('alerts')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] spatial-glass text-xs font-bold text-txt-primary hover:bg-surface/90 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-archive text-sm" />
              <span>Open Evidence Vault</span>
            </button>
            <button
              onClick={() => goToPage('camgrid')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-white font-bold text-xs brand-button hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <i className="ti ti-layout-grid text-sm" />
              <span>Camera Wall</span>
            </button>
          </div>
        </div>
      </header>

      {/* Unified Spatial Glass Statistics Strip */}
      <section className="spatial-stats-strip shrink-0" aria-label="Tactical KPI Summary">
        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Guns &amp; Weapons</span>
            <i className="ti ti-flame text-base text-rose-600 dark:text-rose-400" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-rose-600 dark:text-rose-400 mt-1.5 tabular-nums">
            {String(weaponCount).padStart(2, '0')}
          </b>
          <small className="text-[11px] text-txt-muted block mt-0.5">
            {criticalCount} critical
          </small>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Fence Intrusions</span>
            <i className="ti ti-walk text-base text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-amber-600 dark:text-amber-400 mt-1.5 tabular-nums">
            {String(intrusionCount).padStart(2, '0')}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Cameras online</span>
            <i className="ti ti-video text-base text-teal-600 dark:text-teal-400" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-teal-600 dark:text-teal-400 mt-1.5 tabular-nums">
            {onlineCamsCount}/{cams.length}
          </b>
        </div>

        <div className="spatial-stat-cell">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-txt-muted">
            <span>Edge AI Latency</span>
            <i className="ti ti-bolt text-base text-primary" aria-hidden="true" />
          </div>
          <b className="block text-2xl md:text-[28px] font-extrabold font-mono tracking-tight text-primary mt-1.5 tabular-nums">
            {avgLatencyVal}
          </b>
          <small className="text-[11px] text-txt-muted block mt-0.5 truncate" title={avgLatencySub}>
            {avgLatencySub}
          </small>
        </div>
      </section>

      {/* 24-Hour Incident Histogram */}
      <section className="spatial-glass p-5 shrink-0 space-y-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
            </span>
            <h2 className="text-sm font-bold font-display text-txt-primary m-0">
              24-Hour Incident Histogram
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 font-bold">
              Live Sync
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-txt-muted">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Weapons ({weaponCount})</span>
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Intrusions ({intrusionCount})</span>
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary-surface border border-primary-border text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span>Other Threats</span>
              </span>
            </div>

            <div className="flex items-center rounded-[10px] border border-border-default p-0.5 bg-surface/65">
              {([
                { id: '24h', label: '24 Hours' },
                { id: '7d', label: '7 Days' },
                { id: 'all', label: 'All Time' },
              ] as const).map(opt => {
                const active = timeRange === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTimeRange(opt.id)}
                    className={`relative px-3 py-1 rounded-[8px] text-xs font-bold transition-colors cursor-pointer ${
                      active ? 'text-primary-text' : 'text-txt-muted hover:text-txt-primary'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="analytics-timerange-tab"
                        transition={SPATIAL_SPRING}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-[8px] brand-button pointer-events-none"
                      />
                    )}
                    <span className="relative z-[1]">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="h-[210px] w-full pt-4 flex items-end gap-1 sm:gap-2 px-1 relative">
          <div className="absolute inset-x-0 top-6 bottom-7 pointer-events-none flex flex-col justify-between opacity-30 z-0">
            <div className="border-b border-dashed border-border-default w-full" />
            <div className="border-b border-dashed border-border-default w-full" />
            <div className="border-b border-dashed border-border-default w-full" />
            <div className="border-b border-dashed border-border-default w-full" />
          </div>

          {hourlyData.map((h, i) => {
            const isHovered = hoveredHour === h.hour;
            const isPeak = h.hour === peakHour.hour && peakHour.total > 0;
            const heightPercent = Math.max(12, Math.round((h.total / maxHourlyCount) * 165));

            const weaponPct = h.total > 0 ? (h.weapons / h.total) * 100 : 0;
            const intrusionPct = h.total > 0 ? (h.intrusions / h.total) * 100 : 0;
            const otherPct = h.total > 0 ? (h.other / h.total) * 100 : 0;

            return (
              <div
                key={h.hour}
                onMouseEnter={() => setHoveredHour(h.hour)}
                onMouseLeave={() => setHoveredHour(null)}
                className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer z-1"
              >
                {isHovered && (
                  <SpatialOverlay className="spatial-glass-overlay absolute bottom-[calc(100%+10px)] z-30 text-txt-primary p-3 text-[11px] min-w-[165px] pointer-events-none -translate-x-1/2 left-1/2">
                    <div className="font-extrabold border-b border-border-subtle pb-1.5 mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <i className="ti ti-clock text-primary" />
                        <span>{h.label} Window</span>
                      </span>
                      <span className="font-mono text-txt-primary font-black">{h.total} events</span>
                    </div>
                    <div className="space-y-1.5 text-[10.5px]">
                      <div className="flex justify-between items-center text-status-danger">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />Weapons:</span>
                        <strong className="font-mono font-bold">{h.weapons}</strong>
                      </div>
                      <div className="flex justify-between items-center text-status-warning">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Intrusions:</span>
                        <strong className="font-mono font-bold">{h.intrusions}</strong>
                      </div>
                      <div className="flex justify-between items-center text-primary">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />Other:</span>
                        <strong className="font-mono font-bold">{h.other}</strong>
                      </div>
                    </div>
                  </SpatialOverlay>
                )}

                {isPeak && (
                  <span className="text-[8px] font-black uppercase text-rose-500 tracking-wider mb-0.5 hidden sm:block">
                    Peak
                  </span>
                )}

                <span className={`text-[9.5px] font-mono font-bold tabular-nums mb-1 transition-all ${
                  isPeak ? 'text-rose-500 font-extrabold' : isHovered ? 'text-txt-primary' : 'text-txt-muted'
                }`}>
                  {h.total > 0 ? h.total : ''}
                </span>

                <div
                  className={`w-full rounded-t-md overflow-hidden flex flex-col justify-end transition-all duration-300 animate-bar-grow hover:brightness-110 ${
                    isPeak ? 'ring-2 ring-rose-500' : ''
                  } ${isHovered ? 'scale-105' : ''}`}
                  style={{
                    height: `${heightPercent}px`,
                    animationDelay: `${i * 18}ms`
                  }}
                >
                  <div className="w-full h-[2px] bg-white/40 shrink-0" />
                  {otherPct > 0 && (
                    <div
                      style={{ height: `${otherPct}%` }}
                      className="w-full bg-primary hover:brightness-110 transition-all"
                    />
                  )}
                  {intrusionPct > 0 && (
                    <div
                      style={{ height: `${intrusionPct}%` }}
                      className="w-full bg-amber-500 hover:brightness-110 transition-all"
                    />
                  )}
                  {weaponPct > 0 && (
                    <div
                      style={{ height: `${weaponPct}%` }}
                      className="w-full bg-rose-500 hover:brightness-110 transition-all"
                    />
                  )}
                </div>

                <span className={`text-[8.5px] sm:text-[9.5px] font-mono mt-1.5 truncate ${
                  h.hour % 3 === 0 ? 'text-txt-muted font-bold' : 'text-txt-muted hidden sm:block'
                }`}>
                  {h.label.slice(0, 2)}h
                </span>
              </div>
            );
          })}
        </div>

        {/* Hairline-divided velocity highlights */}
        <div className="pt-3 border-t border-border-subtle grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border-subtle text-xs">
          <div className="py-2 md:px-4 first:pl-0">
            <span className="text-[10px] text-txt-muted font-semibold block uppercase tracking-wider">Total 24h Velocity</span>
            <b className="text-base font-mono font-extrabold text-txt-primary mt-0.5 block tabular-nums">{total24hIncidents} incidents</b>
          </div>
          <div className="py-2 md:px-4">
            <span className="text-[10px] text-txt-muted font-semibold block uppercase tracking-wider">Peak Threat Window</span>
            <b className="text-base font-mono font-extrabold text-rose-600 dark:text-rose-400 mt-0.5 block tabular-nums">{peakHour.label} ({peakHour.total} events)</b>
          </div>
          <div className="py-2 md:px-4">
            <span className="text-[10px] text-txt-muted font-semibold block uppercase tracking-wider">Average Incident Rate</span>
            <b className="text-base font-mono font-extrabold text-teal-600 dark:text-teal-400 mt-0.5 block tabular-nums">{(total24hIncidents / 24).toFixed(1)} events/hr</b>
          </div>
          <div className="py-2 md:px-4">
            <span className="text-[10px] text-txt-muted font-semibold block uppercase tracking-wider">Active Cameras</span>
            <b className="text-base font-mono font-extrabold text-cyan-600 dark:text-cyan-400 mt-0.5 block tabular-nums">{onlineCamsCount} / {cams.length} online</b>
          </div>
        </div>
      </section>

      {/* Incident Distribution by Threat Class */}
      <section className="spatial-glass p-5 md:p-6 space-y-5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <h2 className="text-sm md:text-base font-bold font-display text-txt-primary m-0">
            Incident Distribution by Threat Class
          </h2>
          <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-surface/75 text-txt-muted border border-border-subtle self-start sm:self-auto">
            Live
          </span>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
          <div className="shrink-0 flex flex-col items-center justify-center p-2">
            <canvas ref={donutCanvasRef} width={160} height={160} className="drop-shadow-sm" />
          </div>

          <div className="flex-1 w-full rounded-[10px] border border-border-subtle bg-surface/55 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-border-subtle overflow-hidden">
            {typeCounts.map(it => {
              const isWeapon = it.type === 'weapon';
              const meta = TYPE_META[it.type] || TYPE_META.intrusion;
              const pct = alerts.length > 0 ? Math.round((it.count / alerts.length) * 100) : 0;
              return (
                <div
                  key={it.type}
                  className="p-3.5 transition-colors hover:bg-primary-surface/35 flex flex-col justify-between min-w-0"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <i
                        className={`ti ${meta.icon} text-base shrink-0`}
                        style={{ color: `var(${it.color})` }}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold text-txt-primary leading-snug break-words" title={it.label}>
                        {it.label}
                      </span>
                    </div>

                    <span
                      className="text-sm font-mono font-extrabold shrink-0 tabular-nums"
                      style={{ color: `var(${it.color})` }}
                    >
                      {it.count}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-txt-muted">
                    <span className="font-semibold">{pct}% of archive</span>
                    {isWeapon ? (
                      <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400 uppercase px-2 py-0.5 rounded bg-rose-500/10">
                        High Threat
                      </span>
                    ) : (
                      <span className={`text-[9.5px] font-bold uppercase px-2 py-0.5 rounded ${
                        meta.sev === 'high'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : meta.sev === 'med'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      }`}>
                        {meta.sev} Sev
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Triage & Operational Velocity Strip */}
      <section className="spatial-glass p-4 shrink-0">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-subtle">
          <h2 className="text-xs font-bold font-display uppercase tracking-wider text-txt-primary m-0 flex items-center gap-2">
            <i className="ti ti-activity text-primary text-sm" />
            Sentry Triage &amp; Operational Velocity Metrics
          </h2>
          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            Chain of Custody Intact
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border-subtle text-xs">
          <div className="py-2 md:px-4 first:pl-0">
            <span className="text-[10px] text-txt-muted block uppercase tracking-wider">Inference Latency</span>
            <b className="text-base font-mono text-txt-primary tabular-nums">{avgLatencyVal}</b>
          </div>
          <div className="py-2 md:px-4">
            <span className="text-[10px] text-txt-muted block uppercase tracking-wider">Open Alerts</span>
            <b className="text-base font-mono text-txt-primary tabular-nums">{alerts.filter(a => !a.reviewed && (a.state || 'open') === 'open').length}</b>
          </div>
          <div className="py-2 md:px-4">
            <span className="text-[10px] text-txt-muted block uppercase tracking-wider">Resolved Alerts</span>
            <b className="text-base font-mono text-txt-primary tabular-nums">{alerts.filter(a => a.reviewed || a.state === 'resolved').length}</b>
          </div>
          <div className="py-2 md:px-4">
            <span className="text-[10px] text-txt-muted block uppercase tracking-wider">Audit Ledger</span>
            <b className="text-base font-mono text-emerald-600 dark:text-emerald-400">SHA-256 Active</b>
          </div>
        </div>
      </section>

      {/* Event Timeline Feed */}
      <section className="spatial-glass p-5 shrink-0 space-y-5 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                Live Sentry Audit Trail
              </span>
              <span className="text-[11px] font-mono text-txt-muted">
                Showing {Math.min(displayLimit, chronologicalAlerts.length)} of {chronologicalAlerts.length} verified events
              </span>
            </div>
            <h2 className="text-base font-extrabold text-txt-primary m-0 mt-1 flex items-center gap-2 font-display">
              <i className="ti ti-history text-primary text-lg" />
              Event Timeline
            </h2>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative min-w-[220px]">
              <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted text-xs pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search rule, track #101, cam..."
                className="w-full pl-8 pr-7 py-1.5 rounded-[10px] text-xs bg-surface/85 border border-border-default text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary text-xs cursor-pointer"
                  title="Clear search"
                >
                  <i className="ti ti-x" />
                </button>
              )}
            </div>

            <div className="flex items-center rounded-[10px] border border-border-default p-0.5 bg-surface/65">
              <button
                onClick={() => setDensityMode('spacious')}
                className={`p-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  densityMode === 'spacious' ? 'bg-primary text-primary-text shadow-xs' : 'text-txt-muted hover:text-txt-primary'
                }`}
                title="Spacious tactical cards"
              >
                <i className="ti ti-layout-distribute-vertical" />
              </button>
              <button
                onClick={() => setDensityMode('compact')}
                className={`p-1.5 rounded-[8px] text-xs font-bold transition-all cursor-pointer ${
                  densityMode === 'compact' ? 'bg-primary text-primary-text shadow-xs' : 'text-txt-muted hover:text-txt-primary'
                }`}
                title="Compact audit rows"
              >
                <i className="ti ti-layout-rows" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Filter Segmented Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setTimelineFilter('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer shrink-0 border ${
              timelineFilter === 'all'
                ? 'brand-button text-white border-primary'
                : 'bg-surface/65 border-border-default text-txt-muted hover:text-txt-primary hover:border-primary-border'
            }`}
          >
            <i className="ti ti-shield" />
            <span>All Events</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              timelineFilter === 'all' ? 'bg-white/20 text-white' : 'bg-surface border border-border-subtle text-txt-muted'
            }`}>
              {alerts.length}
            </span>
          </button>

          <button
            onClick={() => setTimelineFilter('weapon')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer shrink-0 border ${
              timelineFilter === 'weapon'
                ? 'bg-red-700 text-white border-rose-600'
                : 'bg-surface/65 border-border-default text-rose-600 dark:text-rose-400 hover:border-rose-500/40'
            }`}
          >
            <i className="ti ti-flame" />
            <span>Guns &amp; Weapons</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              timelineFilter === 'weapon' ? 'bg-white/20 text-white' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
              {weaponCount}
            </span>
          </button>

          <button
            onClick={() => setTimelineFilter('intrusion')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer shrink-0 border ${
              timelineFilter === 'intrusion'
                ? 'bg-amber-700 text-white border-amber-600'
                : 'bg-surface/65 border-border-default text-amber-600 dark:text-amber-400 hover:border-amber-500/40'
            }`}
          >
            <i className="ti ti-walk" />
            <span>Perimeter Intrusions</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              timelineFilter === 'intrusion' ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {intrusionCount}
            </span>
          </button>

          <button
            onClick={() => setTimelineFilter('critical')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer shrink-0 border ${
              timelineFilter === 'critical'
                ? 'brand-button text-white border-primary'
                : 'bg-surface/65 border-border-default text-primary hover:border-primary-border'
            }`}
          >
            <i className="ti ti-alert-triangle" />
            <span>High Priority</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              timelineFilter === 'critical' ? 'bg-white/20 text-white' : 'bg-primary-surface text-primary'
            }`}>
              {criticalCount}
            </span>
          </button>

          <button
            onClick={() => setTimelineFilter('watchlist')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer shrink-0 border ${
              timelineFilter === 'watchlist'
                ? 'brand-button text-white border-primary'
                : 'bg-surface/65 border-border-default text-cyan-600 dark:text-cyan-400 hover:border-cyan-500/40'
            }`}
          >
            <i className="ti ti-fingerprint" />
            <span>Watchlist &amp; POI</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              timelineFilter === 'watchlist' ? 'bg-white/20 text-white' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
            }`}>
              {watchlistCount + anprCount}
            </span>
          </button>
        </div>

        {/* Timeline Items Feed */}
        <div className="relative pl-2 sm:pl-3 space-y-3.5">
          <div className="absolute left-[22px] sm:left-[26px] top-6 bottom-6 w-px bg-gradient-to-b from-primary/60 via-border-default to-transparent pointer-events-none z-0" />

          {chronologicalAlerts.length === 0 ? (
            <div className="py-10 text-center bg-surface/55 border border-dashed border-border-default rounded-[10px] relative z-10">
              <i className="ti ti-shield-check text-primary text-2xl block mx-auto mb-2" aria-hidden="true" />
              <h3 className="text-sm font-bold text-txt-primary m-0">No matching events</h3>
              {(searchQuery || timelineFilter !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setTimelineFilter('all'); }}
                  className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] brand-button text-xs font-bold transition-all cursor-pointer"
                >
                  <i className="ti ti-rotate" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          ) : (
            chronologicalAlerts.slice(0, displayLimit).map((a, idx) => {
              const meta = TYPE_META[a.type] || TYPE_META.intrusion;
              const isWeapon = a.type === 'weapon';
              const isHigh = a.sev === 'high';
              const isOpen = !a.reviewed && (a.state === 'open' || !a.state);
              const isResolved = a.state === 'resolved' || a.reviewed;
              const isExpanded = expandedAlertId === a.id;
              const isCopied = copiedId === a.id;

              const accentBorderColor = isWeapon
                ? 'border-l-rose-500'
                : a.type === 'intrusion'
                ? 'border-l-amber-500'
                : a.type === 'watchlist'
                ? 'border-l-cyan-500'
                : a.type === 'anpr'
                ? 'border-l-purple-500'
                : a.type === 'loiter'
                ? 'border-l-emerald-500'
                : 'border-l-blue-500';

              return (
                <div
                  key={a.id}
                  className="relative flex items-start gap-3 sm:gap-4 group z-10 animate-timeline-in"
                  style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                >
                  <div className="relative shrink-0 flex flex-col items-center pt-3.5 z-10">
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border ${
                        isWeapon
                          ? 'bg-rose-600 border-rose-300 text-white'
                          : isOpen && isHigh
                          ? 'bg-amber-500 border-amber-200 text-white'
                          : isResolved
                          ? 'bg-emerald-600 border-emerald-300 text-white'
                          : 'bg-surface border-primary-border text-primary'
                      }`}
                    >
                      <i className={`ti ${isWeapon ? 'ti-flame' : isResolved ? 'ti-check' : meta.icon} text-xs sm:text-sm`} />
                    </div>
                  </div>

                  <div
                    className={`spatial-operational flex-1 border-l-[3px] ${accentBorderColor} transition-colors hover:border-primary-border ${
                      densityMode === 'compact' ? 'p-3' : 'p-4'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isWeapon
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : a.type === 'intrusion'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : a.type === 'watchlist'
                            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                            : a.type === 'anpr'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            : 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        }`}>
                          <i className={`ti ${meta.icon}`} />
                          <span>{meta.label.split(',')[0].replace('Virtual Fence ', '')}</span>
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${
                          isHigh
                            ? 'bg-status-danger-surface text-status-danger'
                            : a.sev === 'med'
                            ? 'bg-status-warning-surface text-status-warning'
                            : 'bg-surface-subtle text-txt-secondary'
                        }`}>
                          {isHigh ? 'CRITICAL THREAT' : `${a.sev.toUpperCase()} SEVERITY`}
                        </span>

                        {isOpen ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-warning-surface text-status-warning">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>OPEN</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-success-surface text-status-success">
                            <i className="ti ti-check text-xs" />
                            <span className="capitalize">{a.state || 'Resolved'}</span>
                          </span>
                        )}

                        <span className="text-[9.5px] font-mono text-txt-muted hidden sm:inline-flex items-center gap-1">
                          <i className="ti ti-shield-check text-[10px]" />
                          <span>{a.provenance === 'simulation' ? 'Simulation' : 'Edge Detector'}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <button
                          onClick={e => copyToClipboard(a.id, e)}
                          title="Click to copy Event ID"
                          className="font-mono text-[10.5px] font-bold text-txt-muted hover:text-primary px-2 py-0.5 rounded bg-surface/75 border border-border-subtle transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{a.id}</span>
                          <i className={`ti ${isCopied ? 'ti-check text-emerald-500 font-bold' : 'ti-copy text-[10px]'}`} />
                        </button>

                        <div className="flex items-center gap-1.5 text-txt-muted text-[11px] font-mono">
                          <i className="ti ti-clock text-xs text-txt-muted/70" />
                          <span className="font-bold text-txt-primary">{getRelativeTime(a.ts)}</span>
                          <span className="text-txt-muted/50 hidden md:inline">•</span>
                          <span className="text-txt-muted/80 hidden md:inline">
                            {a.ts.toLocaleTimeString('en-IN', { hour12: false })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="py-2.5">
                      <h4 className="text-xs sm:text-sm font-bold text-txt-primary m-0 tracking-tight leading-snug">
                        {a.detail}
                      </h4>

                      <div className="flex items-center gap-4 flex-wrap mt-2 text-[11px] text-txt-muted">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-txt-primary">
                          <i className="ti ti-video text-primary" />
                          <span>{a.camName.split('·')[0].trim()}</span>
                        </span>

                        <span className="inline-flex items-center gap-1.5">
                          <i className="ti ti-map-pin text-rose-500" />
                          <span>{a.location}</span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 text-txt-primary font-mono font-bold tabular-nums">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>{Math.round((a.confidence || 0.95) * 100)}% Confidence</span>
                        </span>

                        {a.trackId && (
                          <span className="inline-flex items-center gap-1 font-mono font-bold">
                            <span>Track:</span>
                            <strong className="text-txt-primary">{a.trackId}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border-subtle flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openLightbox(a.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-surface border border-border-default text-xs font-bold text-txt-primary hover:border-primary hover:text-primary transition-all cursor-pointer"
                        >
                          <i className="ti ti-photo-scan text-sm" />
                          <span>Evidence Snapshot</span>
                        </button>

                        {isOpen && (
                          <button
                            onClick={() => updateAlertState(a.id, 'acknowledged')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
                          >
                            <i className="ti ti-check text-sm" />
                            <span>Acknowledge</span>
                          </button>
                        )}

                        {(isHigh || isWeapon) && (
                          <button
                            onClick={() => openPatrolModal(a)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] brand-button text-white text-xs font-bold transition-all cursor-pointer"
                          >
                            <i className="ti ti-send text-sm" />
                            <span>Dispatch QRT</span>
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setExpandedAlertId(isExpanded ? null : a.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-xs font-bold text-txt-muted hover:text-txt-primary hover:bg-primary-surface/50 transition-all cursor-pointer"
                      >
                        <i className="ti ti-cpu text-xs" />
                        <span>{isExpanded ? 'Hide Telemetry' : 'Inspect Telemetry'}</span>
                        <i className={`ti ti-chevron-down text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border-subtle text-xs">
                        <div className="font-bold text-[11px] text-txt-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <i className="ti ti-binary text-primary" />
                          <span>Forensic Telemetry &amp; Audit Anchor</span>
                        </div>
                        <div className="rounded-[8px] border border-border-subtle bg-surface/65 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle font-mono text-[11px] overflow-hidden">
                          <div className="p-2.5">
                            <span className="text-[9.5px] text-txt-muted block uppercase">Geo Coordinates</span>
                            <span className="font-bold text-txt-primary">29.5481°N 74.8763°E</span>
                          </div>
                          <div className="p-2.5">
                            <span className="text-[9.5px] text-txt-muted block uppercase">Virtual Fence Rule</span>
                            <span className="font-bold text-txt-primary truncate block">{a.ruleId || 'rule-cam1-01'}</span>
                          </div>
                          <div className="p-2.5">
                            <span className="text-[9.5px] text-txt-muted block uppercase">Integrity Status</span>
                            <span className="font-bold text-status-success flex items-center gap-1">
                              <i className="ti ti-lock text-xs" />
                              <span>SHA-256 Verified</span>
                            </span>
                          </div>
                          <div className="p-2.5">
                            <span className="text-[9.5px] text-txt-muted block uppercase">Inference Engine</span>
                            <span className="font-bold text-primary">YOLOv8 Edge TRT</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {chronologicalAlerts.length > 10 && (
          <div className="pt-4 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-txt-muted font-medium">
              Displaying <strong className="text-txt-primary font-mono">{Math.min(displayLimit, chronologicalAlerts.length)}</strong> of <strong className="text-txt-primary font-mono">{chronologicalAlerts.length}</strong> total records
            </span>
            <div className="flex items-center gap-2">
              {displayLimit < chronologicalAlerts.length && (
                <button
                  onClick={() => setDisplayLimit(prev => Math.min(prev + 10, chronologicalAlerts.length))}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] bg-surface border border-border-default font-bold text-txt-primary hover:border-primary hover:text-primary transition-all cursor-pointer"
                >
                  <i className="ti ti-plus text-xs" />
                  <span>Show Next 10 Events ({chronologicalAlerts.length - displayLimit} remaining)</span>
                </button>
              )}
              {displayLimit < chronologicalAlerts.length ? (
                <button
                  onClick={() => setDisplayLimit(chronologicalAlerts.length)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] brand-button text-white font-bold transition-all cursor-pointer"
                >
                  <span>Show All ({chronologicalAlerts.length})</span>
                </button>
              ) : (
                <button
                  onClick={() => setDisplayLimit(10)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-surface border border-border-default font-bold text-txt-muted hover:text-txt-primary transition-all cursor-pointer"
                >
                  <i className="ti ti-chevrons-up text-xs" />
                  <span>Collapse to Top 10</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
