import React from 'react';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DashboardHome } from './components/Dashboard/DashboardHome';
import { LiveMonitor } from './components/LiveMonitor/LiveMonitor';
import { CameraGrid } from './components/CameraGrid/CameraGrid';
import { AlertsLog } from './components/AlertsLog/AlertsLog';
import { Analytics } from './components/Analytics/Analytics';
import { AiPipeline } from './components/AiPipeline/AiPipeline';
import { CameraConfig } from './components/CameraConfig/CameraConfig';
import { WatchlistPage } from './components/Watchlist/WatchlistPage';
import { FeatureControlsPage } from './components/FeatureControls/FeatureControlsPage';
import { EvidenceModal } from './components/Modals/EvidenceModal';
import { FullscreenModal } from './components/Modals/FullscreenModal';
import { Contact } from './components/Contact/Contact';
import { LegalPage } from './components/LegalPage/LegalPage';
import { NotFound } from './components/NotFound/NotFound';
import { Toast } from './components/Toast/Toast';
import { PatrolModal } from './components/Modals/PatrolModal';
import { EmergencyAlertBanner } from './components/EmergencyBanner/EmergencyAlertBanner';
import { AIInvestigation } from './components/AIInvestigation/AIInvestigation';
import { AIBriefing } from './components/AIBriefing/AIBriefing';
import { DashboardSettings } from './components/DashboardSettings/DashboardSettings';

export const App: React.FC = () => {
  const { currentPage, notice, dismissNotice, activePatrolAlert, closePatrolModal, updateAlertState } = useApp();

  React.useEffect(() => {
    const titles: Record<string, string> = {
      dashboard: 'Command Overview',
      monitor: 'Live Sentry Monitor',
      camgrid: 'Camera Matrix Grid',
      alerts: 'Threats & Forensic Log',
      analytics: 'Deep Video Analytics',
      models: 'AI Inference Pipeline',
      'cam-config': 'Sensor Calibration',
      watchlist: 'Watchlist References',
      features: 'Feature Controls',
      contact: 'Tactical Support',
      privacy: 'Privacy Protocol',
      terms: 'Security Charter',
      'not-found': 'Page Not Found',
      'ai-investigation': 'AI Incident Investigation',
      'ai-briefing': 'AI Surveillance Briefing',
      'dashboard-settings': 'Dashboard Settings',
    };
    document.title = `${titles[currentPage] || 'IBVAP'} | Tactical Defense Platform`;
  }, [currentPage]);

  return (
    <div className="flex h-screen w-screen overflow-hidden relative bg-canvas text-txt-primary font-sans transition-colors duration-150">
      {/* Main Command Console Shell */}
      <div className="flex w-full h-full relative z-1">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar />
          <EmergencyAlertBanner />

          {/* Core Page Routing */}
          <main className="flex-1 flex overflow-hidden min-h-0 min-w-0 bg-canvas">
            {currentPage === 'dashboard' && <DashboardHome />}
            {currentPage === 'monitor' && <LiveMonitor />}
            {currentPage === 'camgrid' && <CameraGrid />}
            {currentPage === 'alerts' && <AlertsLog />}
            {currentPage === 'analytics' && <Analytics />}
            {currentPage === 'models' && <AiPipeline />}
            {currentPage === 'cam-config' && <CameraConfig />}
            {currentPage === 'watchlist' && <WatchlistPage />}
            {currentPage === 'features' && <FeatureControlsPage />}
            {currentPage === 'contact' && <Contact />}
            {(currentPage === 'privacy' || currentPage === 'terms') && <LegalPage type={currentPage} />}
            {currentPage === 'not-found' && <NotFound />}
            {currentPage === 'ai-investigation' && <AIInvestigation />}
            {currentPage === 'ai-briefing' && <AIBriefing />}
            {currentPage === 'dashboard-settings' && <DashboardSettings />}
          </main>
        </div>
      </div>

      {/* Mobile Tactical Dispatch Modal */}
      {activePatrolAlert && (
        <PatrolModal
          alert={activePatrolAlert}
          onClose={closePatrolModal}
          onAcknowledge={(alertId) => updateAlertState(alertId, 'acknowledged')}
        />
      )}

      {/* Forensic Evidence Lightbox Modal */}
      <EvidenceModal />

      {/* Fullscreen Sentry Video Overlay */}
      <FullscreenModal />

      {/* Tactical Notice Toast */}
      {notice && <Toast notice={notice} onDismiss={dismissNotice} />}
    </div>
  );
};
