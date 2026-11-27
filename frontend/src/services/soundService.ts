/**
 * Tactical Audio Synthesizer and Web Notification Engine for IBVAP.
 * Uses the Web Audio API to synthesize tactical alarms, chimes, and sirens
 * without requiring external sound file dependencies or network requests.
 */

class SoundService {
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8; // 0.0 to 1.0
  private sirenInterval: any = null;
  private sirenActive: boolean = false;
  private desktopNotificationsEnabled: boolean = false;
  private listeners: Set<() => void> = new Set();

  constructor() {
    // Load preferences from localStorage
    try {
      const savedMute = localStorage.getItem('ibvap_sound_muted');
      if (savedMute !== null) {
        this.isMuted = savedMute === 'true';
      }
      const savedVol = localStorage.getItem('ibvap_sound_volume');
      if (savedVol !== null) {
        this.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
      }
      const savedDesktop = localStorage.getItem('ibvap_desktop_notifications');
      if (savedDesktop !== null) {
        this.desktopNotificationsEnabled = savedDesktop === 'true';
      }
    } catch {
      // Ignore storage errors
    }

    // Attempt to unlock AudioContext on first user interaction
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.initContext();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    return this.audioCtx;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      localStorage.setItem('ibvap_sound_muted', String(muted));
    } catch {}
    if (muted && this.sirenActive) {
      this.stopSiren();
    }
    this.notify();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('ibvap_sound_volume', String(this.volume));
    } catch {}
    this.notify();
  }

  public isSirenOn(): boolean {
    return this.sirenActive;
  }

  public getDesktopNotifications(): boolean {
    return this.desktopNotificationsEnabled;
  }

  public async setDesktopNotifications(enabled: boolean): Promise<boolean> {
    if (enabled && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          this.desktopNotificationsEnabled = false;
          try {
            localStorage.setItem('ibvap_desktop_notifications', 'false');
          } catch {}
          this.notify();
          return false;
        }
      }
    }
    this.desktopNotificationsEnabled = enabled;
    try {
      localStorage.setItem('ibvap_desktop_notifications', String(enabled));
    } catch {}
    this.notify();
    return enabled;
  }

  public playTone(freq: number, type: OscillatorType, duration: number, startGain = 1.0, endGain = 0.001) {
    if (this.isMuted || this.volume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const targetGain = startGain * this.volume;
      gain.gain.setValueAtTime(targetGain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endGain * this.volume), ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio synthesis warning:', e);
    }
  }

  /**
   * Tactical Critical Threat Alert: Discreet, non-looping dual-tone chime (sine wave)
   * High-contrast tactical alert that does NOT loop or disrupt the operator.
   */
  public playCriticalAlertTone() {
    if (this.isMuted) return;
    this.playTone(660, 'sine', 0.15, 0.4, 0.05);
    setTimeout(() => {
      if (!this.isMuted) {
        this.playTone(880, 'sine', 0.22, 0.45, 0.01);
      }
    }, 120);
  }

  /**
   * Compatibility alias that plays the clean alert tone without looping
   */
  public playCriticalSiren(_autoStopSeconds?: number) {
    this.playCriticalAlertTone();
  }

  public stopSiren() {
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.sirenActive) {
      this.sirenActive = false;
      this.notify();
    }
  }

  /**
   * Warning Electronic Ping: Double ascending electronic chime (587Hz -> 880Hz)
   */
  public playWarningChime() {
    if (this.isMuted) return;
    this.playTone(587.33, 'sine', 0.12, 0.4, 0.05);
    setTimeout(() => {
      if (!this.isMuted) {
        this.playTone(880.0, 'sine', 0.2, 0.5, 0.01);
      }
    }, 130);
  }

  /**
   * Informational Ping: Soft tactical sonar blip (440Hz)
   */
  public playInfoPing() {
    if (this.isMuted) return;
    this.playTone(440, 'triangle', 0.16, 0.25, 0.01);
  }

  /**
   * Alert Acknowledged: Short high-tech confirmation arpeggio (523Hz -> 659Hz -> 784Hz)
   */
  public playAcknowledgeChime() {
    if (this.isMuted) return;
    this.playTone(523.25, 'sine', 0.08, 0.3, 0.05);
    setTimeout(() => {
      this.playTone(659.25, 'sine', 0.08, 0.3, 0.05);
      setTimeout(() => {
        this.playTone(783.99, 'sine', 0.14, 0.35, 0.01);
      }, 70);
    }, 70);
  }

  /**
   * Alert Resolved: Resolution tone (soft major chord)
   */
  public playResolvedChime() {
    if (this.isMuted) return;
    this.playTone(659.25, 'triangle', 0.2, 0.25, 0.01);
    this.playTone(783.99, 'sine', 0.25, 0.25, 0.01);
  }

  /**
   * Trigger the appropriate sound based on alert severity
   */
  public playAlertSound(sev: 'high' | 'med' | 'low') {
    if (sev === 'high') {
      this.playCriticalAlertTone();
    } else if (sev === 'med') {
      this.playWarningChime();
    } else {
      this.playInfoPing();
    }
  }

  /**
   * Test audio cues for operator calibration
   */
  public testSound(sev: 'high' | 'med' | 'low') {
    if (sev === 'high') {
      this.playCriticalAlertTone();
    } else if (sev === 'med') {
      this.playWarningChime();
    } else {
      this.playInfoPing();
    }
  }

  /**
   * Dispatches an OS native desktop notification if permitted and tab is unfocused.
   */
  public dispatchDesktopNotification(title: string, options: NotificationOptions) {
    if (!this.desktopNotificationsEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notif = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options.tag || 'ibvap-alert',
        ...options,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      // Auto close after 8 seconds
      setTimeout(() => notif.close(), 8000);
    } catch (e) {
      console.warn('Desktop notification error:', e);
    }
  }
}

export const soundService = new SoundService();
