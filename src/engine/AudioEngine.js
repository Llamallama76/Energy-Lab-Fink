/**
 * Pure Web Audio API Physics & Laboratory Sound Synthesizer
 * Zero external audio assets — synthesizes tuning forks, deep punchy bass woofers,
 * switches, thermal coils, toaster chimes, collisions, engines, buzzers, and sirens.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.muted = false;
    this.noiseBuffer = null;

    this.loops = {
      subwoofer: null,
      siren: null,
      motor: null,
      bunsen: null
    };
    this.lastEnginePulse = 0;
    this.lastSubBeat = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.88;
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this._buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _buildNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
    }
    this.noiseBuffer = buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.88, this.ctx.currentTime, 0.04);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  stopAllLoops() {
    Object.keys(this.loops).forEach((k) => this._stopLoop(k));
  }

  _stopLoop(name) {
    const loop = this.loops[name];
    if (!loop) return;
    if (loop.timer) clearInterval(loop.timer);
    try {
      if (loop.gain && this.ctx) {
        loop.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04);
      }
      setTimeout(() => {
        try {
          loop.nodes.forEach((n) => {
            if (n.stop) n.stop();
            if (n.disconnect) n.disconnect();
          });
        } catch (_) {}
      }, 80);
    } catch (_) {}
    this.loops[name] = null;
  }

  playClick(pitch = 950, strength = 0.24) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = pitch * 1.6;
      filter.Q.value = 3.0;
      const g = ctx.createGain();
      g.gain.setValueAtTime(strength * 0.75, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.compressor);
      src.start(now);
      src.stop(now + 0.032);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.42, now + 0.035);
    gain.gain.setValueAtTime(strength * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  /**
   * Station 1A: Tuning Fork strike (pure fundamental sine + metallic clang overtone)
   */
  playTuningFork(frequency = 440, forceNormalized = 0.75) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const amp = Math.max(0.1, Math.min(1, forceNormalized));

    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(frequency, now);
    g1.gain.setValueAtTime(0.001, now);
    g1.gain.linearRampToValueAtTime(0.48 * amp, now + 0.012);
    g1.gain.exponentialRampToValueAtTime(0.0008, now + 3.6);
    osc1.connect(g1);
    g1.connect(this.compressor);
    osc1.start(now);
    osc1.stop(now + 3.7);

    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(Math.min(7500, frequency * 6.27), now);
    g2.gain.setValueAtTime(0.2 * amp, now);
    g2.gain.exponentialRampToValueAtTime(0.0005, now + 0.24);
    osc2.connect(g2);
    g2.connect(this.compressor);
    osc2.start(now);
    osc2.stop(now + 0.26);

    this.playClick(320, 0.26 * amp);
  }

  playPingPongBounce(intensity = 0.6) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1950, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.028);
    g.gain.setValueAtTime(0.32 * Math.min(1, intensity), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    osc.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.036);
  }

  /**
   * Station 1B: Deep, Loud, Punchy Subwoofer Bass Synth
   * Uses fundamental + upper-bass sawtooth/triangle harmonics + resonant cabinet lowpass
   * + rhythmic bass thump LFO so it sounds unmistakably loud & bass-heavy even on classroom speakers!
   */
  updateSubwoofer(volumeNorm = 0, freq = 55) {
    if (volumeNorm <= 0.02 || this.muted) {
      this._stopLoop('subwoofer');
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.loops.subwoofer) {
      // Fundamental sub sine
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = freq;

      // Rich punchy upper-bass harmonic oscillator (audible on ALL speakers!)
      const punchOsc = ctx.createOscillator();
      punchOsc.type = 'sawtooth';
      punchOsc.frequency.value = freq * 2;

      // Third warm bass body oscillator
      const warmOsc = ctx.createOscillator();
      warmOsc.type = 'triangle';
      warmOsc.frequency.value = freq * 1.5;

      // Resonant subwoofer cabinet filter with warm 110Hz punch
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      filter.Q.value = 3.8;

      // Rhythmic bass throb LFO (3.2 Hz woofer pulse) so students clearly hear pulsing bass waves!
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 3.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.28;

      const punchGain = ctx.createGain();
      punchGain.gain.value = 0.65;

      const warmGain = ctx.createGain();
      warmGain.gain.value = 0.45;

      const masterSubGain = ctx.createGain();
      masterSubGain.gain.value = 0.001;

      subOsc.connect(filter);
      punchOsc.connect(punchGain);
      punchGain.connect(filter);
      warmOsc.connect(warmGain);
      warmGain.connect(filter);

      filter.connect(masterSubGain);
      lfo.connect(lfoGain);
      lfoGain.connect(masterSubGain.gain);

      masterSubGain.connect(this.compressor);

      subOsc.start();
      punchOsc.start();
      warmOsc.start();
      lfo.start();

      this.loops.subwoofer = {
        subOsc,
        punchOsc,
        warmOsc,
        filter,
        lfoGain,
        gain: masterSubGain,
        nodes: [subOsc, punchOsc, warmOsc, lfo, lfoGain, punchGain, warmGain, filter, masterSubGain]
      };
    }

    const loop = this.loops.subwoofer;
    const now = ctx.currentTime;
    loop.subOsc.frequency.setTargetAtTime(freq, now, 0.04);
    loop.punchOsc.frequency.setTargetAtTime(freq * 2, now, 0.04);
    loop.warmOsc.frequency.setTargetAtTime(freq * 3, now, 0.04);
    loop.filter.frequency.setTargetAtTime(180 + volumeNorm * 190, now, 0.05);
    loop.lfoGain.gain.setTargetAtTime(0.24 * volumeNorm, now, 0.05);
    loop.gain.gain.setTargetAtTime(0.68 * volumeNorm, now, 0.05);
  }

  /**
   * Station 2A: Laser sensor target lock chime
   */
  playSensorSuccess() {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      g.gain.setValueAtTime(0.001, now + idx * 0.07);
      g.gain.linearRampToValueAtTime(0.18, now + idx * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.45);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.48);
    });
  }

  /**
   * Station 3: Bunsen burner hiss & Toaster pop-up bell
   */
  updateBunsenHiss(intensity = 0) {
    if (intensity <= 0.05 || this.muted) {
      this._stopLoop('bunsen');
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    if (!this.loops.bunsen) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0.001;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);
      src.start();
      this.loops.bunsen = { gain, filter, nodes: [src, filter, gain] };
    }
    this.loops.bunsen.gain.gain.setTargetAtTime(0.12 * intensity, ctx.currentTime, 0.08);
    this.loops.bunsen.filter.frequency.setTargetAtTime(650 + intensity * 850, ctx.currentTime, 0.08);
  }

  playToasterPop() {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    this.playClick(420, 0.42);
    const now = ctx.currentTime + 0.03;
    [1318.5, 2637].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(i === 0 ? 0.26 : 0.12, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.85);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  /**
   * Station 4: Multi-pin bowling scatter sound
   */
  playPinScatter(energyNorm = 0.6, count = 5) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const strength = Math.max(0.18, Math.min(1, energyNorm));
    for (let i = 0; i < count; i++) {
      const delay = i * (0.022 + Math.random() * 0.032);
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const base = 360 + Math.random() * 440;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 0.45, now + 0.08);
      g.gain.setValueAtTime(0.26 * strength * (1 - i * 0.09), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.095);
    }
  }

  /**
   * Station 5: Food crunch & 4-Cylinder Combustion pulse
   */
  playFoodCharge() {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    this.playClick(620, 0.25);
    const now = ctx.currentTime + 0.05;
    [440, 587.33, 880].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.14, now + idx * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.18);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.2);
    });
  }

  triggerCylinderFire(rpmNorm = 0.5) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    if (now - this.lastEnginePulse < 0.045) return;
    this.lastEnginePulse = now;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    const f = 68 + rpmNorm * 65;
    osc.frequency.setValueAtTime(f * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + 0.06);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340 + rpmNorm * 280;

    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Station 6: Snap Circuits Electronic Siren (rising/falling wail) & DC Fan Motor whirr
   */
  updateCircuitOutputs({ sirenActive = false, motorActive = false }) {
    if (!sirenActive || this.muted) {
      this._stopLoop('siren');
    } else {
      const ctx = this.ensureContext();
      if (ctx && !this.loops.siren) {
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.value = 740;

        // Classic Snap Circuits U2 Alarm IC rising/falling siren sweep!
        lfo.type = 'triangle';
        lfo.frequency.value = 2.2;
        lfoGain.gain.value = 260;

        filter.type = 'lowpass';
        filter.frequency.value = 1900;

        gain.gain.value = 0.001;

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);

        osc.start();
        lfo.start();
        gain.gain.setTargetAtTime(0.15, ctx.currentTime, 0.04);
        this.loops.siren = { gain, nodes: [osc, lfo, lfoGain, filter, gain] };
      }
    }

    if (!motorActive || this.muted) {
      this._stopLoop('motor');
    } else {
      const ctx = this.ensureContext();
      if (ctx && !this.loops.motor) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 135;
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(this.compressor);
        osc.start();
        gain.gain.setTargetAtTime(0.065, ctx.currentTime, 0.08);
        this.loops.motor = { gain, nodes: [osc, gain] };
      }
    }
  }
}
