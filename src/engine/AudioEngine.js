/**
 * Pure Web Audio API Physics & Laboratory Sound Synthesizer
 * Zero external audio assets — synthesizes tuning forks, speakers, switches,
 * thermal coils, toaster chimes, coaster rails, collisions, engines, and buzzers.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.muted = false;
    this.noiseBuffer = null;

    // Continuous station sound loops
    this.loops = {
      subwoofer: null,
      buzzer: null,
      motor: null,
      bunsen: null,
      engine: null
    };
    this.lastEnginePulse = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 20;
      this.compressor.ratio.value = 6;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.72;
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
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.04);
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
    try {
      if (loop.gain && this.ctx) {
        loop.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      }
      setTimeout(() => {
        try {
          loop.nodes.forEach((n) => {
            if (n.stop) n.stop();
            if (n.disconnect) n.disconnect();
          });
        } catch (_) {}
      }, 90);
    } catch (_) {}
    this.loops[name] = null;
  }

  playClick(pitch = 950, strength = 0.22) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    // White-noise crisp transient + short resonant body
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = pitch * 1.6;
      filter.Q.value = 3.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(strength * 0.7, now);
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
    gain.gain.setValueAtTime(strength * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  /**
   * Station 1A: Tuning Fork strike (pure fundamental sine + metallic clang mode)
   */
  playTuningFork(frequency = 440, forceNormalized = 0.7) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const amp = Math.max(0.08, Math.min(1, forceNormalized));

    // Fundamental pure tone
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(frequency, now);
    g1.gain.setValueAtTime(0.001, now);
    g1.gain.linearRampToValueAtTime(0.42 * amp, now + 0.012);
    g1.gain.exponentialRampToValueAtTime(0.0008, now + 3.4);
    osc1.connect(g1);
    g1.connect(this.compressor);
    osc1.start(now);
    osc1.stop(now + 3.5);

    // Metallic clang overtone (~6.27x fundamental, decays rapidly like real steel fork)
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(Math.min(7500, frequency * 6.27), now);
    g2.gain.setValueAtTime(0.18 * amp, now);
    g2.gain.exponentialRampToValueAtTime(0.0005, now + 0.24);
    osc2.connect(g2);
    g2.connect(this.compressor);
    osc2.start(now);
    osc2.stop(now + 0.26);

    // Rubber mallet thud
    this.playClick(320, 0.25 * amp);
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
    g.gain.setValueAtTime(0.28 * Math.min(1, intensity), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    osc.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.036);
  }

  /**
   * Station 1B: Continuous subwoofer bass cone hum
   */
  updateSubwoofer(volumeNorm = 0, freq = 55) {
    if (volumeNorm <= 0.02 || this.muted) {
      this._stopLoop('subwoofer');
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.loops.subwoofer) {
      const osc = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      oscSub.type = 'triangle';
      osc.frequency.value = freq;
      oscSub.frequency.value = freq * 2;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.18;
      gain.gain.value = 0.001;
      osc.connect(gain);
      oscSub.connect(subGain);
      subGain.connect(gain);
      gain.connect(this.compressor);
      osc.start();
      oscSub.start();
      this.loops.subwoofer = { osc, oscSub, gain, nodes: [osc, oscSub, subGain, gain] };
    }
    const loop = this.loops.subwoofer;
    loop.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
    loop.oscSub.frequency.setTargetAtTime(freq * 2, ctx.currentTime, 0.05);
    loop.gain.gain.setTargetAtTime(0.28 * volumeNorm, ctx.currentTime, 0.06);
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
      g.gain.linearRampToValueAtTime(0.16, now + idx * 0.07 + 0.02);
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
    this.loops.bunsen.gain.gain.setTargetAtTime(0.11 * intensity, ctx.currentTime, 0.08);
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
      g.gain.setValueAtTime(i === 0 ? 0.24 : 0.1, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.85);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  /**
   * Station 4: Pin collision scatter sound
   */
  playPinScatter(energyNorm = 0.6, count = 5) {
    const ctx = this.ensureContext();
    if (!ctx || this.muted) return;
    const strength = Math.max(0.15, Math.min(1, energyNorm));
    for (let i = 0; i < count; i++) {
      const delay = i * (0.025 + Math.random() * 0.035);
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const base = 360 + Math.random() * 420;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 0.45, now + 0.075);
      g.gain.setValueAtTime(0.24 * strength * (1 - i * 0.11), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.09);
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
      g.gain.setValueAtTime(0.13, now + idx * 0.055);
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

    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Station 6: Electric Buzzer & DC Motor loops
   */
  updateCircuitOutputs({ buzzerActive = false, motorActive = false }) {
    if (!buzzerActive || this.muted) {
      this._stopLoop('buzzer');
    } else {
      const ctx = this.ensureContext();
      if (ctx && !this.loops.buzzer) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 235;
        filter.type = 'bandpass';
        filter.frequency.value = 920;
        filter.Q.value = 2.4;
        gain.gain.value = 0.001;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);
        osc.start();
        gain.gain.setTargetAtTime(0.12, ctx.currentTime, 0.04);
        this.loops.buzzer = { gain, nodes: [osc, filter, gain] };
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
        osc.frequency.value = 118;
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(this.compressor);
        osc.start();
        gain.gain.setTargetAtTime(0.055, ctx.currentTime, 0.08);
        this.loops.motor = { gain, nodes: [osc, gain] };
      }
    }
  }
}
