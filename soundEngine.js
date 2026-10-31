/**
 * soundEngine.js
 * Motor de Áudio Procedural Web Audio API (Zero arquivos externos)
 * Com variação orgânica de pitch (±2.5%) e tiers de Game Feel
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
  }

  vibrate(pattern = 12) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  }

  playTone({ freq = 440, type = 'sine', duration = 0.12, gain = 0.08, delay = 0, slideTo = null }) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /**
   * Tier Small: Clique sutil de filtro/UI
   */
  playClick() {
    const jitter = 0.98 + Math.random() * 0.04;
    this.playTone({ freq: 520 * jitter, type: 'triangle', duration: 0.045, gain: 0.04, slideTo: 640 * jitter });
  }

  /**
   * Tier Medium: Concluir bloco de estudo (Chime duplo ascendente)
   */
  playCheck() {
    const jitter = 0.975 + Math.random() * 0.05;
    this.vibrate(15);
    this.playTone({ freq: 523.25 * jitter, type: 'triangle', duration: 0.14, gain: 0.09, delay: 0 });
    this.playTone({ freq: 783.99 * jitter, type: 'sine', duration: 0.24, gain: 0.11, delay: 0.065 });
  }

  /**
   * Desmarcar tarefa
   */
  playUncheck() {
    this.vibrate(8);
    this.playTone({ freq: 420, type: 'sine', duration: 0.11, gain: 0.05, slideTo: 310 });
  }

  /**
   * Tier Large: Importação de Cronograma IA ou Dia 100% Concluído
   */
  playSuccessFanfare() {
    this.vibrate([18, 35, 25]);
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      this.playTone({
        freq,
        type: idx === notes.length - 1 ? 'sine' : 'triangle',
        duration: idx === notes.length - 1 ? 0.38 : 0.18,
        gain: 0.09,
        delay: idx * 0.065
      });
    });
  }
}

export const soundEngine = new SoundEngine();
