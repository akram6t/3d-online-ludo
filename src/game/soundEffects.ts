// Procedural Viral Meme & Comedy Arcade Web Audio Synthesizer for Royal Ludo 3D

export type ViralSoundPreset =
  | 'airhorn'
  | 'bonk'
  | 'sad_trombone'
  | 'dance_groove'
  | 'six_hype';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  public viralMode: boolean = true;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Quirky cartoon bongo + springy boing dice tumble
   */
  public playDiceTumble(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    // Cartoon bongo roll + upward spring boing
    const bongoHits = [0, 0.055, 0.11, 0.165, 0.22];
    bongoHits.forEach((delay, idx) => {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const pitch = 220 + (idx % 2) * 140 + idx * 35;
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.45, now + 0.045);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    });
  }

  /**
   * Funny rubbery "Boing-Pop!" hop sound that pitches up with each step
   */
  public playPawnHop(hopIndex: number = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 280 + Math.min(hopIndex, 8) * 55;

    // Classic cartoon "boing" pitch bend
    osc.frequency.setValueAtTime(baseFreq * 0.65, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.75, now + 0.065);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, now + 0.11);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.125);
  }

  /**
   * Viral Goti Kill / Capture Sound:
   * Cartoon Slip-Whistle -> Coconut BONK -> MLG Triple Airhorn + Dramatic Bass Drop!
   */
  public playCaptureHit(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    // 1. Cartoon slip whistle + hollow coconut BONK
    this.playCartoonBonk();

    // 2. Follow up 160ms later with MLG Triple Airhorn burst!
    window.setTimeout(() => {
      this.playAirhorn();
    }, 160);
  }

  /**
   * Viral Sparkle Anime "WOW!" Chime when landing on a Safe Star or rolling a 6
   */
  public playSafeStarChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    // Sparkling upbeat pentatonic glissando + synth pop
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const now = ctx.currentTime + i * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.06, now + 0.16);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    });
  }

  /**
   * Viral Victory / Crown Home Fanfare: Stadium Horn + Funky Bass Groove
   */
  public playCrownFanfare(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    this.playDanceGroove();
  }

  /**
   * Iconic MLG Triple Airhorn ("PEW-PEW-PEWEEEEEW!")
   */
  public playAirhorn(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const blasts = [
      { delay: 0.0, dur: 0.11 },
      { delay: 0.13, dur: 0.11 },
      { delay: 0.26, dur: 0.42 },
    ];

    // Layered detuned sawtooth oscillators for authentic stadium/MLG airhorn timbre
    const detunes = [440, 466.16, 587.33];
    for (const blast of blasts) {
      const start = ctx.currentTime + blast.delay;
      detunes.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * 0.94, start);
        osc.frequency.linearRampToValueAtTime(freq, start + 0.025);

        gain.gain.setValueAtTime(0.08, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + blast.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + blast.dur + 0.01);
      });
    }
  }

  /**
   * Funny Cartoon Slide Whistle + Coconut BONK
   */
  public playCartoonBonk(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Fast slide whistle up
    const whistle = ctx.createOscillator();
    const wGain = ctx.createGain();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(340, now);
    whistle.frequency.exponentialRampToValueAtTime(1480, now + 0.11);
    wGain.gain.setValueAtTime(0.18, now);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    whistle.connect(wGain);
    wGain.connect(ctx.destination);
    whistle.start(now);
    whistle.stop(now + 0.125);

    // Hollow woody Coconut BONK at t + 0.11s
    const bonkStart = now + 0.11;
    const bonk = ctx.createOscillator();
    const bGain = ctx.createGain();
    bonk.type = 'triangle';
    bonk.frequency.setValueAtTime(620, bonkStart);
    bonk.frequency.exponentialRampToValueAtTime(145, bonkStart + 0.085);
    bGain.gain.setValueAtTime(0.35, bonkStart);
    bGain.gain.exponentialRampToValueAtTime(0.001, bonkStart + 0.095);
    bonk.connect(bGain);
    bGain.connect(ctx.destination);
    bonk.start(bonkStart);
    bonk.stop(bonkStart + 0.1);
  }

  /**
   * Comedy "Wah-Wah-Waaah" Sad Trombone for missed rolls or getting captured
   */
  public playSadTrombone(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const steps = [
      { freq: 392.0, delay: 0.0, dur: 0.18 }, // G4
      { freq: 369.99, delay: 0.2, dur: 0.18 }, // F#4
      { freq: 349.23, delay: 0.4, dur: 0.18 }, // F4
      { freq: 329.63, delay: 0.6, dur: 0.42 }, // E4 -> slide down
    ];

    steps.forEach((s, idx) => {
      const start = ctx.currentTime + s.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s.freq, start);
      if (idx === 3) {
        osc.frequency.linearRampToValueAtTime(277.18, start + s.dur);
      }

      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + s.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + s.dur + 0.01);
    });
  }

  /**
   * Upbeat Viral Funky Dance Synth Riff for 3D Dancers & Celebrations
   */
  public playDanceGroove(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    // Catchy 6-note viral funk synth melody (C5 - D#5 - F5 - F#5 - F5 - D#5 - C5)
    const pattern = [
      { f: 523.25, t: 0.0, d: 0.11 },
      { f: 622.25, t: 0.12, d: 0.11 },
      { f: 698.46, t: 0.24, d: 0.11 },
      { f: 739.99, t: 0.36, d: 0.14 },
      { f: 698.46, t: 0.52, d: 0.11 },
      { f: 622.25, t: 0.65, d: 0.11 },
      { f: 523.25, t: 0.78, d: 0.25 },
    ];

    pattern.forEach((note) => {
      const start = ctx.currentTime + note.t;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note.f, start);

      gain.gain.setValueAtTime(0.13, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.d);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + note.d + 0.01);
    });
  }

  public playTimerTick(secondsLeft: number): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    // Higher pitch on the final 2 seconds for urgency
    const baseFreq = secondsLeft <= 2 ? 987.77 : 783.99;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.065);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playPreset(preset: ViralSoundPreset): void {
    switch (preset) {
      case 'airhorn':
        this.playAirhorn();
        break;
      case 'bonk':
        this.playCartoonBonk();
        break;
      case 'sad_trombone':
        this.playSadTrombone();
        break;
      case 'dance_groove':
        this.playDanceGroove();
        break;
      case 'six_hype':
        this.playSafeStarChime();
        break;
    }
  }
}

export const soundEngine = new SoundEngine();
