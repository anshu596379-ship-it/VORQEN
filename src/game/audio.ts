import { EmoteId, WeaponId } from '../types/game';

class VorqenAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private soundEnabled = true;
  private musicEnabled = true;
  private noiseBuffer: AudioBuffer | null = null;
  private stepIdx = 0;

  private ensureContext(): AudioContext | null {
    if (!this.soundEnabled && !this.musicEnabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.55;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.masterGain);

      // Reusable white noise buffer
      const length = this.ctx.sampleRate * 1.5;
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public setConfig(soundEnabled: boolean, musicEnabled: boolean) {
    this.soundEnabled = soundEnabled;
    this.musicEnabled = musicEnabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(soundEnabled ? 0.55 : 0, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(musicEnabled && soundEnabled ? 0.15 : 0, this.ctx.currentTime, 0.05);
    }
    if (!musicEnabled) {
      this.stopLobbyMusic();
    }
  }

  public startLobbyMusic() {
    if (!this.musicEnabled || !this.soundEnabled) return;
    if (this.musicTimer !== null) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;

    const bassNotes = [55, 55, 65.41, 73.42, 55, 55, 49, 51.91]; // A1, C2, D2, G1, G#1
    const leadNotes = [220, 261.63, 329.63, 293.66, 220, 196, 246.94, 261.63];

    const playStep = () => {
      if (!this.musicEnabled || !this.soundEnabled || !this.ctx || !this.musicGain) return;
      const now = this.ctx.currentTime;
      const idx = this.stepIdx % bassNotes.length;
      this.stepIdx++;

      // Deep tactical pulse bass
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassNotes[idx], now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.38);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.44);

      // Subtle atmospheric synth shimmer every 2 beats
      if (idx % 2 === 0) {
        const pad = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        pad.type = 'triangle';
        pad.frequency.setValueAtTime(leadNotes[idx], now);
        padGain.gain.setValueAtTime(0.001, now);
        padGain.gain.linearRampToValueAtTime(0.08, now + 0.1);
        padGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        pad.connect(padGain);
        padGain.connect(this.musicGain);
        pad.start(now);
        pad.stop(now + 0.85);
      }
    };

    playStep();
    this.musicTimer = window.setInterval(playStep, 460);
  }

  public stopLobbyMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public playUiClick(pitch = 720) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.65, now + 0.055);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playWeaponFire(weaponId: WeaponId, distanceScale = 1) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, distanceScale));

    // Noise burst for gunshot crack
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const nGain = ctx.createGain();

    // Low-end thump
    const thump = ctx.createOscillator();
    const tGain = ctx.createGain();

    if (weaponId === 'm240') {
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.value = 0.8;
      nGain.gain.setValueAtTime(0.55 * vol, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      thump.type = 'sine';
      thump.frequency.setValueAtTime(160, now);
      thump.frequency.exponentialRampToValueAtTime(38, now + 0.22);
      tGain.gain.setValueAtTime(0.65 * vol, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    } else if (weaponId === 'sg12') {
      filter.frequency.setValueAtTime(950, now);
      filter.Q.value = 0.6;
      nGain.gain.setValueAtTime(0.7 * vol, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(135, now);
      thump.frequency.exponentialRampToValueAtTime(32, now + 0.2);
      tGain.gain.setValueAtTime(0.7 * vol, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    } else if (weaponId === 'xr9') {
      filter.frequency.setValueAtTime(2200, now);
      filter.Q.value = 1.2;
      nGain.gain.setValueAtTime(0.32 * vol, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      thump.type = 'square';
      thump.frequency.setValueAtTime(220, now);
      thump.frequency.exponentialRampToValueAtTime(75, now + 0.06);
      tGain.gain.setValueAtTime(0.25 * vol, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    } else {
      // vq47 or arcpistol
      filter.frequency.setValueAtTime(weaponId === 'arcpistol' ? 2500 : 1700, now);
      filter.Q.value = 1.0;
      nGain.gain.setValueAtTime(0.42 * vol, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(180, now);
      thump.frequency.exponentialRampToValueAtTime(50, now + 0.1);
      tGain.gain.setValueAtTime(0.42 * vol, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    }

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    thump.connect(tGain);
    tGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.3);
    thump.start(now);
    thump.stop(now + 0.26);
  }

  public playHitmarker(headshot: boolean, kill: boolean) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = headshot ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(headshot ? 1480 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 2100 : 620, now + 0.06);
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.075);

    if (kill) {
      const chime = ctx.createOscillator();
      const cg = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(880, now + 0.03);
      chime.frequency.setValueAtTime(1320, now + 0.09);
      cg.gain.setValueAtTime(0.24, now + 0.03);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      chime.connect(cg);
      cg.connect(this.masterGain);
      chime.start(now + 0.03);
      chime.stop(now + 0.25);
    }
  }

  public playReload() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 340 : 520, now + offset);
      g.gain.setValueAtTime(0.12, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.06);
    });
  }

  public playPickup() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.09);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playFootstep(isWater: boolean, sprinting: boolean) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = isWater ? 'bandpass' : 'lowpass';
    filter.frequency.value = isWater ? 1100 : 320;
    const g = ctx.createGain();
    const vol = sprinting ? 0.11 : 0.065;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isWater ? 0.12 : 0.06));

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.13);
  }

  public playParachuteOpen() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.52);
  }

  public playExplosion() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 0.75);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.82);
  }

  public playEmote(emoteId: EmoteId) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const seqs: Record<EmoteId, number[]> = {
      salute: [440, 554.37, 659.25],
      victory_pump: [523.25, 659.25, 783.99, 1046.5],
      groove: [329.63, 392.0, 440, 392.0, 523.25],
      backflip: [293.66, 440, 880],
      taunt_wave: [587.33, 493.88, 587.33],
      squat_flex: [220, 277.18, 329.63],
    };
    const notes = seqs[emoteId] || seqs.salute;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = emoteId === 'groove' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      g.gain.setValueAtTime(0.001, now + i * 0.08);
      g.gain.linearRampToValueAtTime(0.16, now + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.24);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.26);
    });
  }

  public playVictoryFanfare() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      g.gain.setValueAtTime(0.001, now + i * 0.11);
      g.gain.linearRampToValueAtTime(0.24, now + i * 0.11 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.55);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.6);
    });
  }
}

export const audioEngine = new VorqenAudioEngine();
