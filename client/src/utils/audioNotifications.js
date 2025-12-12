/**
 * Audio Notification Service
 * Plays notification sounds for instant intercom events
 */

class AudioNotificationService {
  constructor() {
    this.initialized = false;
    this.audioContext = null;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ Audio notifications ready (tone-based)');
  }

  getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  playTone(frequency = 440, duration = 200, { type = 'sine', volume = 0.3 } = {}) {
    try {
      const audioContext = this.getAudioContext();
      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
      console.error('Failed to play tone:', error);
    }
  }

  async playConnectionBeep() {
    this.playTone(660, 150);
  }

  async playDisconnectionBeep() {
    this.playTone(320, 150);
  }

  async playSilenceWarning() {
    this.playTone(240, 350, { type: 'triangle' });
    setTimeout(() => this.playTone(240, 350, { type: 'triangle' }), 400);
  }

  async playAdminOverride() {
    this.playTone(820, 180);
    setTimeout(() => this.playTone(820, 180), 220);
  }

  async playPTTStart() {
    this.playTone(540, 120);
  }

  async playPTTStop() {
    this.playTone(380, 120);
  }

  vibrate(pattern = [200]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
}

export const audioNotifications = new AudioNotificationService();
audioNotifications.initialize();

