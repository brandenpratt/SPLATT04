/**
 * Every sound is synthesised at runtime with Web Audio. No files, no network,
 * no licensing questions — and the prototype works offline.
 */

type SoundName = 'splat' | 'thump' | 'boost' | 'buzzer' | 'click' | 'tag' | 'splatted' | 'unlock';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowd: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed = new Map<SoundName, number>();
  enabled = true;

  /** Browsers require a user gesture before audio can start. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.5 : 0;
    if (!enabled) this.stopCrowd();
  }

  private makeNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Filtered noise, looped quietly — reads as a crowd without a single sample file. */
  startCrowd(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.crowd || !this.enabled) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 760;
    bandpass.Q.value = 0.6;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    source.connect(bandpass).connect(gain).connect(this.master);
    source.start();
    gain.gain.linearRampToValueAtTime(0.035, this.ctx.currentTime + 2);
    this.crowd = { source, gain };
  }

  stopCrowd(): void {
    if (!this.crowd) return;
    try {
      this.crowd.source.stop();
    } catch {
      // Already stopped.
    }
    this.crowd = null;
  }

  play(name: SoundName, volume = 1): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    // Rate-limit: a Compressor firing at 95ms would otherwise stack into mush.
    const now = this.ctx.currentTime;
    const minGap = name === 'splat' ? 0.05 : 0.02;
    if (now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'splat':
        this.wetPop(now, volume);
        break;
      case 'thump':
        this.vinylThump(now, volume);
        break;
      case 'boost':
        this.boostWhine(now, volume);
        break;
      case 'buzzer':
        this.buzzer(now, volume);
        break;
      case 'click':
        this.click(now, volume);
        break;
      case 'tag':
        this.tone(now, 880, 0.12, 'square', volume * 0.28);
        this.tone(now + 0.07, 1320, 0.1, 'square', volume * 0.22);
        break;
      case 'splatted':
        this.wetPop(now, volume * 1.4);
        this.tone(now + 0.02, 180, 0.28, 'sawtooth', volume * 0.2);
        break;
      case 'unlock':
        this.tone(now, 523, 0.1, 'triangle', volume * 0.25);
        this.tone(now + 0.09, 659, 0.1, 'triangle', volume * 0.25);
        this.tone(now + 0.18, 784, 0.18, 'triangle', volume * 0.25);
        break;
    }
  }

  /** Short noise burst through a falling lowpass: a wet paint pop. */
  private wetPop(at: number, volume: number): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, at);
    filter.frequency.exponentialRampToValueAtTime(320, at + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32 * volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(at);
    source.stop(at + 0.18);
  }

  private vinylThump(at: number, volume: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3 * volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.22);
  }

  private boostWhine(at: number, volume: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, at);
    osc.frequency.exponentialRampToValueAtTime(1180, at + 0.22);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(0.16 * volume, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.32);
  }

  private buzzer(at: number, volume: number): void {
    if (!this.ctx || !this.master) return;
    for (const [index, freq] of [196, 185].entries()) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.14 * volume, at + index * 0.001);
      gain.gain.setValueAtTime(0.14 * volume, at + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.72);
      osc.connect(gain).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.74);
    }
  }

  private click(at: number, volume: number): void {
    this.tone(at, 1400, 0.035, 'square', volume * 0.14);
  }

  private tone(
    at: number,
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

export const audio = new AudioEngine();

export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Unsupported or blocked; haptics are strictly optional.
    }
  }
}
