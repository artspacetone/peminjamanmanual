// Service Audio Synthesizer (Tanpa file mp3, pasti bunyi)
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

export const playBeep = (type: 'SUCCESS' | 'ERROR' | 'WARNING') => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (type === 'SUCCESS') {
    // Nada Tinggi "Ting!"
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } 
  else if (type === 'ERROR') {
    // Nada Rendah Kasar "Buzz!"
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  }
  else if (type === 'WARNING') {
    // Nada Double Beep
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.15);
    
    // Beep kedua
    setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.15);
    }, 200);
  }
};