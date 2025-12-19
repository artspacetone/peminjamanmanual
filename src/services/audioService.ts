// Audio Service untuk Stock Opname App
// Menggunakan Web Audio API tanpa file eksternal

let audioContext: AudioContext | null = null
let isAudioInitialized = false
let masterGainNode: GainNode | null = null
let volume = 0.5

/**
 * Initialize audio context (must be called after user interaction)
 */
export const initializeAudio = (): boolean => {
  if (isAudioInitialized && audioContext?.state !== 'closed') {
    return true
  }

  try {
    // Create audio context
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    // Create master gain node for volume control
    masterGainNode = audioContext.createGain()
    masterGainNode.gain.value = volume
    masterGainNode.connect(audioContext.destination)
    
    isAudioInitialized = true
    
    // Resume audio context (required by browser autoplay policies)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(console.warn)
    }
    
    return true
  } catch (error) {
    console.warn('Web Audio API not supported:', error)
    return false
  }
}

/**
 * Set master volume (0.0 to 1.0)
 */
export const setMasterVolume = (newVolume: number): void => {
  volume = Math.max(0, Math.min(1, newVolume))
  if (masterGainNode) {
    masterGainNode.gain.value = volume
  }
}

/**
 * Get current volume
 */
export const getMasterVolume = (): number => {
  return volume
}

/**
 * Test audio system (call on button click)
 */
export const testAudio = (): void => {
  if (!initializeAudio()) {
    console.warn('Audio initialization failed')
    return
  }
  
  // Play test sequence
  setTimeout(() => playBeep('SUCCESS'), 100)
  setTimeout(() => playBeep('WARNING'), 500)
  setTimeout(() => playBeep('ERROR'), 900)
  setTimeout(() => playBeep('SCAN'), 1300)
}

/**
 * Play beep sound based on type
 */
export const playBeep = (type: 'SUCCESS' | 'ERROR' | 'WARNING' | 'SCAN' = 'SUCCESS'): void => {
  // Try to initialize audio if not already
  if (!initializeAudio() || !audioContext || !masterGainNode) {
    // Fallback to vibration
    fallbackVibration(type)
    return
  }

  // Ensure audio context is running
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {
      fallbackVibration(type)
      return
    })
  }

  try {
    switch (type) {
      case 'SUCCESS':
        playSuccessBeep()
        break
      case 'ERROR':
        playErrorBeep()
        break
      case 'WARNING':
        playWarningBeep()
        break
      case 'SCAN':
        playScanBeep()
        break
    }
  } catch (error) {
    console.warn('Audio playback failed:', error)
    fallbackVibration(type)
  }
}

/**
 * Success beep - High pitch "Ting!" (800Hz → 1200Hz)
 */
const playSuccessBeep = (): void => {
  if (!audioContext || !masterGainNode) return

  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(masterGainNode)
  
  // Success sound: uplifting high pitch
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(800, now)
  oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1)
  
  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(0.4 * volume, now + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  
  oscillator.start(now)
  oscillator.stop(now + 0.15)
}

/**
 * Error beep - Low harsh "Buzz!" (150Hz → 80Hz)
 */
const playErrorBeep = (): void => {
  if (!audioContext || !masterGainNode) return

  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(masterGainNode)
  
  // Error sound: low harsh tone
  oscillator.type = 'sawtooth'
  oscillator.frequency.setValueAtTime(150, now)
  oscillator.frequency.linearRampToValueAtTime(80, now + 0.3)
  
  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(0.5 * volume, now + 0.05)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  
  oscillator.start(now)
  oscillator.stop(now + 0.3)
}

/**
 * Warning beep - Double beep (500Hz) with pause
 */
const playWarningBeep = (): void => {
  if (!audioContext || !masterGainNode) return

  const now = audioContext.currentTime
  
  // First beep
  const oscillator1 = audioContext.createOscillator()
  const gainNode1 = audioContext.createGain()
  
  oscillator1.connect(gainNode1)
  gainNode1.connect(masterGainNode)
  
  oscillator1.type = 'square'
  oscillator1.frequency.setValueAtTime(500, now)
  
  gainNode1.gain.setValueAtTime(0, now)
  gainNode1.gain.linearRampToValueAtTime(0.4 * volume, now + 0.05)
  gainNode1.gain.linearRampToValueAtTime(0, now + 0.15)
  
  oscillator1.start(now)
  oscillator1.stop(now + 0.15)
  
  // Second beep after delay
  setTimeout(() => {
    if (!audioContext || !masterGainNode) return
    
    const oscillator2 = audioContext.createOscillator()
    const gainNode2 = audioContext.createGain()
    
    oscillator2.connect(gainNode2)
    gainNode2.connect(masterGainNode)
    
    oscillator2.type = 'square'
    oscillator2.frequency.setValueAtTime(500, audioContext.currentTime)
    
    gainNode2.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode2.gain.linearRampToValueAtTime(0.4 * volume, audioContext.currentTime + 0.05)
    gainNode2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15)
    
    oscillator2.start(audioContext.currentTime)
    oscillator2.stop(audioContext.currentTime + 0.15)
  }, 200)
}

/**
 * Scan beep - Short click for camera scanning (1000Hz quick)
 */
const playScanBeep = (): void => {
  if (!audioContext || !masterGainNode) return

  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(masterGainNode)
  
  // Quick scan sound
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(1000, now)
  
  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(0.3 * volume, now + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
  
  oscillator.start(now)
  oscillator.stop(now + 0.05)
}

/**
 * Play continuous scanning sound (for camera preview)
 */
export const playScanningSound = (duration: number = 1000): void => {
  if (!initializeAudio() || !audioContext || !masterGainNode) return

  const now = audioContext.currentTime
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(masterGainNode)
  
  // Scanning sound: soft pulse
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(300, now)
  
  // Create pulse effect
  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(0.2 * volume, now + 0.05)
  
  // Stop after duration
  setTimeout(() => {
    if (audioContext && gainNode) {
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1)
      oscillator.stop(audioContext.currentTime + 0.1)
    }
  }, duration)
  
  oscillator.start(now)
}

/**
 * Stop all audio
 */
export const stopAllAudio = (): void => {
  if (audioContext) {
    audioContext.close().then(() => {
      audioContext = null
      masterGainNode = null
      isAudioInitialized = false
    }).catch(console.warn)
  }
}

/**
 * Fallback vibration for devices without audio support
 */
const fallbackVibration = (type: 'SUCCESS' | 'ERROR' | 'WARNING' | 'SCAN'): void => {
  if (!navigator.vibrate) return
  
  switch (type) {
    case 'SUCCESS':
      navigator.vibrate([100, 50, 100])
      break
    case 'ERROR':
      navigator.vibrate([300, 100, 300, 100, 300])
      break
    case 'WARNING':
      navigator.vibrate([200, 100, 200])
      break
    case 'SCAN':
      navigator.vibrate(50)
      break
  }
}

/**
 * Check audio support
 */
export const isAudioSupported = (): boolean => {
  return !!(window.AudioContext || (window as any).webkitAudioContext)
}

/**
 * Check vibration support
 */
export const isVibrationSupported = (): boolean => {
  return !!navigator.vibrate
}

/**
 * Audio presets for different scenarios
 */
export const AudioPresets = {
  // Inventory scan sounds
  ITEM_FOUND: () => playBeep('SUCCESS'),
  ITEM_NOT_FOUND: () => playBeep('ERROR'),
  ITEM_DUPLICATE: () => playBeep('WARNING'),
  CAMERA_SCAN_START: () => playBeep('SCAN'),
  CAMERA_SCAN_SUCCESS: () => playBeep('SUCCESS'),
  
  // UI feedback sounds
  BUTTON_CLICK: () => {
    if (!initializeAudio() || !audioContext || !masterGainNode) return
    
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(masterGainNode)
    
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(400, now)
    
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.2 * volume, now + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    
    oscillator.start(now)
    oscillator.stop(now + 0.1)
  },
  
  // Upload/export sounds
  UPLOAD_START: () => playScanningSound(500),
  UPLOAD_COMPLETE: () => playBeep('SUCCESS'),
  EXPORT_COMPLETE: () => {
    if (!initializeAudio() || !audioContext) return
    
    // Triple success beep
    setTimeout(() => playBeep('SUCCESS'), 0)
    setTimeout(() => playBeep('SUCCESS'), 150)
    setTimeout(() => playBeep('SUCCESS'), 300)
  }
}

/**
 * Initialize audio on first user interaction
 */
export const setupAudioOnFirstInteraction = (): void => {
  const initAudio = () => {
    initializeAudio()
    
    // Play a silent sound to warm up audio context
    if (audioContext && masterGainNode) {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(masterGainNode)
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.001)
    }
    
    // Remove event listeners after initialization
    document.removeEventListener('click', initAudio)
    document.removeEventListener('keydown', initAudio)
    document.removeEventListener('touchstart', initAudio)
  }
  
  // Add event listeners for first interaction
  if (!isAudioInitialized) {
    document.addEventListener('click', initAudio, { once: true })
    document.addEventListener('keydown', initAudio, { once: true })
    document.addEventListener('touchstart', initAudio, { once: true })
  }
}

// Auto-initialize audio on module load (but wait for user interaction)
setupAudioOnFirstInteraction()

export default {
  initializeAudio,
  setMasterVolume,
  getMasterVolume,
  playBeep,
  testAudio,
  playScanningSound,
  stopAllAudio,
  isAudioSupported,
  isVibrationSupported,
  AudioPresets,
  setupAudioOnFirstInteraction
}