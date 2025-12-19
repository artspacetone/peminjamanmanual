// services/audioService.ts

class AudioService {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      // Create audio context on user interaction
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
        this.isInitialized = true;
        console.log('✅ Audio service initialized');
      }
    } catch (error) {
      console.warn('⚠️ Audio context not supported:', error);
    }
  }

  // Play beep sound
  playBeep(frequency = 800, duration = 200, type: OscillatorType = 'sine') {
    if (!this.audioContext || !this.isInitialized) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration / 1000);
    } catch (error) {
      console.warn('Beep play failed:', error);
    }
  }

  // Play error sound
  playError() {
    this.playBeep(400, 300, 'sawtooth');
    setTimeout(() => this.playBeep(300, 300, 'sawtooth'), 100);
  }

  // Play success sound
  playSuccess() {
    this.playBeep(800, 100);
    setTimeout(() => this.playBeep(1000, 100), 50);
    setTimeout(() => this.playBeep(1200, 200), 100);
  }

  // Play warning sound
  playWarning() {
    this.playBeep(600, 150);
    setTimeout(() => this.playBeep(600, 150), 200);
  }

  // Play scan sound
  playScan() {
    this.playBeep(1000, 100, 'square');
  }

  // Play upload sound
  playUpload() {
    this.playBeep(500, 100);
    setTimeout(() => this.playBeep(700, 100), 50);
    setTimeout(() => this.playBeep(900, 100), 100);
  }

  // Play complete sound
  playComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      setTimeout(() => this.playBeep(freq, 150), index * 100);
    });
  }

  // Test all sounds
  test() {
    console.log('🔊 Testing audio...');
    setTimeout(() => this.playScan(), 0);
    setTimeout(() => this.playSuccess(), 300);
    setTimeout(() => this.playError(), 600);
    setTimeout(() => this.playWarning(), 900);
    setTimeout(() => this.playUpload(), 1200);
    setTimeout(() => this.playComplete(), 1500);
  }
}

// Pre-defined audio presets
export const AudioPresets = {
  // Scan related
  ITEM_FOUND: () => {
    const audio = new AudioService();
    audio.playSuccess();
  },
  
  ITEM_NOT_FOUND: () => {
    const audio = new AudioService();
    audio.playError();
  },
  
  ITEM_DUPLICATE: () => {
    const audio = new AudioService();
    audio.playWarning();
  },
  
  CAMERA_SCAN_START: () => {
    const audio = new AudioService();
    audio.playBeep(300, 100);
  },
  
  CAMERA_SCAN_SUCCESS: () => {
    const audio = new AudioService();
    audio.playScan();
  },
  
  // Upload related
  UPLOAD_START: () => {
    const audio = new AudioService();
    audio.playUpload();
  },
  
  UPLOAD_COMPLETE: () => {
    const audio = new AudioService();
    audio.playComplete();
  },
  
  // Export related
  EXPORT_COMPLETE: () => {
    const audio = new AudioService();
    audio.playSuccess();
  },
  
  // Button clicks
  BUTTON_CLICK: () => {
    const audio = new AudioService();
    audio.playBeep(600, 50);
  },
  
  // System notifications
  NOTIFICATION: () => {
    const audio = new AudioService();
    audio.playBeep(800, 200);
  },
  
  // Test all sounds
  TEST_ALL: () => {
    const audio = new AudioService();
    audio.test();
  }
};

// Initialize audio on first user interaction
export const setupAudioOnFirstInteraction = () => {
  const initAudio = () => {
    new AudioService(); // Initialize service
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
    document.removeEventListener('touchstart', initAudio);
  };

  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });
  document.addEventListener('touchstart', initAudio, { once: true });

  console.log('🎵 Audio service ready - waiting for user interaction');
};

// Export singleton instance
export const audioService = new AudioService();
export default AudioPresets;