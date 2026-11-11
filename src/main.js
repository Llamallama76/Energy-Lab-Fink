import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { FLORIDA_STANDARDS, STATIONS_META } from './data/standardsData.js';
import { AudioEngine } from './engine/AudioEngine.js';
import { LabEnvironment, BENCH_TOP_Y } from './engine/LabEnvironment.js';

import { SoundStation } from './stations/SoundStation.js';
import { LightStation } from './stations/LightStation.js';
import { ThermalStation } from './stations/ThermalStation.js';
import { MechanicalStation } from './stations/MechanicalStation.js';
import { ChemicalStation } from './stations/ChemicalStation.js';
import { ElectricalStation } from './stations/ElectricalStation.js';

class OmniEnergyLabApp {
  constructor() {
    this.canvas = document.getElementById('lab-canvas');
    this.overlayContainer = document.getElementById('overlay-markers');
    this.audio = new AudioEngine();

    this.activeStationId = 'overview';
    this.stations = new Map();
    this.liveMetricUpdaters = null;

    // Camera tweening state
    this.camTween = {
      active: false,
      elapsed: 0,
      duration: 1.15,
      startPos: new THREE.Vector3(),
      endPos: new THREE.Vector3(),
      startTarget: new THREE.Vector3(),
      endTarget: new THREE.Vector3()
    };

    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    this.isDragging3D = false;

    this._initRendererAndScene();
    this._initLighting();
    this._initStations();
    this._initPointerInteraction();
    this._initHUD();
    this._populateStandardsModal();

    window.addEventListener('resize', () => this._onResize());
    this.clock = new THREE.Clock();
    this._animate();
  }

  _initRendererAndScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090d16);
    this.scene.fog = new THREE.FogExp2(0x090d16, 0.018);

    // Procedural HDR Studio/Laboratory Environment Reflections via PMREMGenerator
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environmentIntensity = 0.72;
    roomEnv.dispose();
    pmrem.dispose();

    // Camera & Smooth OrbitControls
    this.overviewCamPos = new THREE.Vector3(0, 6.8, 12.6);
    this.overviewTarget = new THREE.Vector3(0, 1.15, -0.5);

    this.camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.08,
      80
    );
    this.camera.position.copy(this.overviewCamPos);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(this.overviewTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 0.55;
    this.controls.maxDistance = 21;
    this.controls.update();

    // WebGL2 Multisampled Post-Processing Pipeline (RenderPass + UnrealBloomPass + OutputPass)
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.HalfFloatType,
      samples: 4
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.34, // subtle photorealistic halation on lasers, coils, filaments & LED rings
      0.42,
      0.86
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  _initLighting() {
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.65);
    this.scene.add(hemi);

    // Warm Florida Sunlight key directional shadow caster from left laboratory windows
    const sunKey = new THREE.DirectionalLight(0xfffbeb, 1.45);
    sunKey.position.set(-10, 11, 6);
    sunKey.castShadow = true;
    sunKey.shadow.mapSize.set(2048, 2048);
    sunKey.shadow.camera.near = 1;
    sunKey.shadow.camera.far = 32;
    sunKey.shadow.camera.left = -12;
    sunKey.shadow.camera.right = 12;
    sunKey.shadow.camera.top = 10;
    sunKey.shadow.camera.bottom = -10;
    sunKey.shadow.bias = -0.0004;
    this.scene.add(sunKey);

    // Dedicated Active Workbench Overhead Spotlight for crisp close-up apparatus shadows & speculars
    this.benchSpot = new THREE.SpotLight(0xf8fafc, 2.6, 9, Math.PI * 0.34, 0.45, 1.0);
    this.benchSpot.position.set(0, 4.4, 3.0);
    this.benchSpot.castShadow = true;
    this.benchSpot.shadow.mapSize.set(1024, 1024);
    this.benchSpot.shadow.bias = -0.0002;
    this.scene.add(this.benchSpot);
    this.scene.add(this.benchSpot.target);
  }

  _initStations() {
    this.labEnv = new LabEnvironment(this.scene);

    const builders = {
      sound: SoundStation,
      light: LightStation,
      thermal: ThermalStation,
      mechanical: MechanicalStation,
      chemical: ChemicalStation,
      electrical: ElectricalStation
    };

    STATIONS_META.forEach((meta) => {
      const anchor = this.labEnv.benchAnchors.get(meta.id);
      const Cls = builders[meta.id];
      const instance = new Cls(anchor.surfaceGroup, this.audio);
      this.stations.set(meta.id, instance);
    });

    // Build floating Overview Station Pins
    this.benchPins = [];
    STATIONS_META.forEach((meta) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bench-pin';
      btn.innerHTML = `<span class="bench-pin-num">0${meta.number}</span><span>${meta.shortLabel} Energy</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.ensureContext();
        this.audio.playClick(820, 0.18);
        this.navigateTo(meta.id);
      });
      this.overlayContainer.appendChild(btn);

      const anchor = this.labEnv.benchAnchors.get(meta.id);
      const worldPin = new THREE.Vector3(0, BENCH_TOP_Y + 1.24, -0.78);
      anchor.benchGroup.updateMatrixWorld(true);
      anchor.benchGroup.localToWorld(worldPin);
      this.benchPins.push({ id: meta.id, el: btn, worldPos: worldPin });
    });

    // Dynamic angle callouts pool for LightStation Mode A
    this.angleCalloutEls = Array.from({ length: 4 }, () => {
      const div = document.createElement('div');
      div.className = 'angle-callout hidden';
      this.overlayContainer.appendChild(div);
      return div;
    });
  }

  _initPointerInteraction() {
    const updateNDC = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.ensureContext();
      updateNDC(e);
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);

      // In Overview mode, clicking any 3D workbench or station sign zooms straight to that station!
      if (this.activeStationId === 'overview') {
        const hits = this.raycaster.intersectObjects(this.labEnv.clickableBenchTargets, false);
        if (hits.length > 0 && hits[0].object.userData.stationBenchId) {
          this.audio.playClick(820, 0.2);
          this.navigateTo(hits[0].object.userData.stationBenchId);
          return;
        }
      } else {
        const activeStation = this.stations.get(this.activeStationId);
        if (activeStation && activeStation.interactables.length > 0) {
          const hits = this.raycaster.intersectObjects(activeStation.interactables, false);
          if (hits.length > 0) {
            const handled = activeStation.onPointerDown(hits[0], this.raycaster);
            if (handled) {
              this.isDragging3D = true;
              this.controls.enabled = false;
              this._syncStationControlsValues();
              return;
            }
          }
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      updateNDC(e);
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);

      if (this.isDragging3D && this.activeStationId !== 'overview') {
        const st = this.stations.get(this.activeStationId);
        if (st && st.onPointerMove(this.raycaster)) {
          this._syncStationControlsValues();
        }
        return;
      }

      // Hover cursor affordance over interactive 3D apparatus parts
      if (this.activeStationId !== 'overview') {
        const st = this.stations.get(this.activeStationId);
        if (st && st.interactables.length > 0) {
          const hits = this.raycaster.intersectObjects(st.interactables, false);
          this.canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
        }
      } else {
        const hits = this.raycaster.intersectObjects(this.labEnv.clickableBenchTargets, false);
        this.canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
      }
    });

    window.addEventListener('pointerup', () => {
      if (this.isDragging3D) {
        const st = this.stations.get(this.activeStationId);
        if (st) st.onPointerUp();
        this.isDragging3D = false;
        this.controls.enabled = true;
        this._syncStationControlsValues();
      }
    });
  }

  _initHUD() {
    // Top Navigation Tabs
    document.querySelectorAll('#station-tabs .nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.ensureContext();
        this.audio.playClick(780, 0.16);
        this.navigateTo(btn.dataset.station);
      });
    });

    // Audio Mute Toggle
    const audioBtn = document.getElementById('btn-audio-toggle');
    const audioLabel = document.getElementById('audio-status-label');
    audioBtn.addEventListener('click', () => {
      this.audio.ensureContext();
      const muted = this.audio.toggleMute();
      audioLabel.textContent = muted ? 'Audio: OFF' : 'Audio: ON';
      audioBtn.classList.toggle('audio-active', !muted);
    });

    // Standards Modal
    const modal = document.getElementById('standards-modal');
    document.getElementById('btn-standards-modal').addEventListener('click', () => {
      modal.classList.remove('hidden');
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    // Minimize/Expand Station Dock
    const dock = document.getElementById('station-hud');
    const glyph = document.getElementById('collapse-glyph');
    document.getElementById('btn-collapse-hud').addEventListener('click', () => {
      const min = dock.classList.toggle('minimized');
      glyph.textContent = min ? '+' : '–';
    });

    // How to Investigate Drawer Toggle
    const howtoBtn = document.getElementById('btn-toggle-howto');
    const howtoList = document.getElementById('howto-list');
    const chevron = document.getElementById('howto-chevron');
    howtoBtn.addEventListener('click', () => {
      const hidden = howtoList.classList.toggle('hidden');
      howtoBtn.setAttribute('aria-expanded', String(!hidden));
      chevron.textContent = hidden ? '▾' : '▴';
    });

    // Florida Benchmark Insight Toggle
    const insightBtn = document.getElementById('btn-toggle-insight');
    const insightBody = document.getElementById('science-insight-text');
    insightBtn.addEventListener('click', () => {
      insightBody.classList.toggle('hidden');
    });

    // Reset Apparatus Button
    document.getElementById('btn-reset-station').addEventListener('click', () => {
      const st = this.stations.get(this.activeStationId);
      if (st) {
        this.audio.playClick(520, 0.25);
        st.reset();
        this._renderStationControls(this.activeStationId);
        this._focusStationCamera(this.activeStationId, 0.75);
      }
    });
  }

  _populateStandardsModal() {
    const container = document.getElementById('standards-modal-content');
    container.innerHTML = Object.values(FLORIDA_STANDARDS)
      .map(
        (s) => `
        <div class="standard-item">
          <h3>${s.code} — ${s.title}</h3>
          <p><strong>${s.strand}:</strong> ${s.description}</p>
        </div>`
      )
      .join('');
  }

  navigateTo(stationId) {
    this.activeStationId = stationId;

    // Update top tab highlight
    document.querySelectorAll('#station-tabs .nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.station === stationId);
    });

    // Notify stations so continuous audio loops only play on active station
    this.audio.stopAllLoops();
    this.stations.forEach((st, id) => st.setActive(id === stationId));
    this.labEnv.highlightStation(stationId === 'overview' ? null : stationId);

    const overviewCard = document.getElementById('overview-hud');
    const stationDock = document.getElementById('station-hud');

    if (stationId === 'overview') {
      overviewCard.classList.remove('hidden');
      stationDock.classList.add('hidden');
      this.liveMetricUpdaters = null;
      this._startCameraTween(this.overviewCamPos, this.overviewTarget, 1.2);
      return;
    }

    overviewCard.classList.add('hidden');
    stationDock.classList.remove('hidden', 'minimized');
    document.getElementById('collapse-glyph').textContent = '–';

    const meta = STATIONS_META.find((m) => m.id === stationId);
    if (meta) {
      document.getElementById('hud-benchmarks').innerHTML = meta.benchmarks
        .map(
          (code) =>
            `<span class="benchmark-pill" title="${FLORIDA_STANDARDS[code]?.description || ''}">${code}</span>`
        )
        .join('');
      document.getElementById('hud-station-title').textContent = `Station ${meta.number}: ${meta.title}`;
      document.getElementById('hud-station-subtitle').textContent = meta.benchmarkSummary;

      document.getElementById('howto-list').innerHTML = meta.howToSteps
        .map((step) => `<li>${step}</li>`)
        .join('');

      document.getElementById('inquiry-list').innerHTML = meta.inquiries
        .map((q) => `<li>${q}</li>`)
        .join('');

      const insightBody = document.getElementById('science-insight-text');
      insightBody.textContent = meta.scienceNote;
      insightBody.classList.add('hidden');
    }

    this._renderStationControls(stationId);
    this._focusStationCamera(stationId, 1.15);
  }

  _focusStationCamera(stationId, duration = 0.95) {
    const anchor = this.labEnv.benchAnchors.get(stationId);
    const st = this.stations.get(stationId);
    if (!anchor || !st) return;

    anchor.surfaceGroup.updateMatrixWorld(true);
    const preset = st.getCameraLocalPreset();

    // Offset target slightly +X on wide screens so right-side dock never overlaps centered 3D apparatus!
    const hudShiftX = window.innerWidth > 960 ? 0.24 : 0.0;
    const localCam = preset.pos.clone().add(new THREE.Vector3(hudShiftX, 0, 0));
    const localTarget = preset.target.clone().add(new THREE.Vector3(hudShiftX, 0, 0));

    const worldCam = anchor.surfaceGroup.localToWorld(localCam);
    const worldTarget = anchor.surfaceGroup.localToWorld(localTarget);

    // Aim overhead bench spotlight right onto this workbench
    const benchCenter = anchor.surfaceGroup.localToWorld(new THREE.Vector3(0, 0.2, 0));
    this.benchSpot.position.set(benchCenter.x, 4.35, benchCenter.z + 0.6);
    this.benchSpot.target.position.copy(benchCenter);
    this.benchSpot.target.updateMatrixWorld();

    this._startCameraTween(worldCam, worldTarget, duration);
  }

  _startCameraTween(endPos, endTarget, duration = 1.1) {
    this.camTween.startPos.copy(this.camera.position);
    this.camTween.endPos.copy(endPos);
    this.camTween.startTarget.copy(this.controls.target);
    this.camTween.endTarget.copy(endTarget);
    this.camTween.elapsed = 0;
    this.camTween.duration = duration;
    this.camTween.active = true;
  }

  // =========================================================================
  // DYNAMIC STATION CONTROLS & TELEMETRY BUILDERS (ALL 6 STATIONS)
  // =========================================================================
  _renderStationControls(stationId) {
    const box = document.getElementById('station-controls-container');
    box.innerHTML = '';
    this.liveMetricUpdaters = null;
    this._syncControlsFn = null;

    const st = this.stations.get(stationId);
    if (!st) return;

    if (stationId === 'sound') this._buildSoundHUD(box, st);
    else if (stationId === 'light') this._buildLightHUD(box, st);
    else if (stationId === 'thermal') this._buildThermalHUD(box, st);
    else if (stationId === 'mechanical') this._buildMechanicalHUD(box, st);
    else if (stationId === 'chemical') this._buildChemicalHUD(box, st);
    else if (stationId === 'electrical') this._buildElectricalHUD(box, st);
  }

  _syncStationControlsValues() {
    if (this._syncControlsFn) this._syncControlsFn();
  }

  // --- Station 1: Sound Energy HUD ---
  _buildSoundHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'fork' ? 'active' : ''}" data-mode="fork" type="button">A: Tuning Fork</button>
        <button class="submode-btn ${st.mode === 'speaker' ? 'active' : ''}" data-mode="speaker" type="button">B: Speaker Cone</button>
      </div>
      <div id="sound-fork-panel" class="control-group ${st.mode !== 'fork' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Fork Size (Controls Pitch)</span>
            <span id="lbl-fork-freq" class="slider-val">${st.getFrequency()} Hz</span>
          </div>
          <input id="rng-fork-size" type="range" min="0" max="100" value="${Math.round(st.forkSize * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Strike Force (Controls Volume)</span>
            <span id="lbl-strike-force" class="slider-val">${Math.round(st.strikeForce * 100)}%</span>
          </div>
          <input id="rng-strike-force" type="range" min="15" max="100" value="${Math.round(st.strikeForce * 100)}" />
        </div>
        <div class="btn-grid-2">
          <button id="btn-strike-fork" class="action-btn" type="button">🔔 Strike Fork</button>
          <button id="btn-ball-touch" class="chip-btn ${st.ballContact ? 'active' : ''}" type="button">
            ${st.ballContact ? 'Ball: Touching Prong' : 'Ball: Pulled Away'}
          </button>
        </div>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Pitch / Frequency</span>
            <span id="met-fork-hz" class="metric-value">${st.getFrequency()} Hz</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Peak Ball Kick</span>
            <span id="met-ball-kick" class="metric-value">${st.maxKickDeg}°</span>
          </div>
        </div>
      </div>

      <div id="sound-speaker-panel" class="control-group ${st.mode !== 'speaker' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Subwoofer Volume Knob</span>
            <span id="lbl-spk-vol" class="slider-val">${Math.round(st.speakerVolume * 100)}%</span>
          </div>
          <input id="rng-spk-vol" type="range" min="0" max="100" value="${Math.round(st.speakerVolume * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Bass Tone Frequency</span>
            <span id="lbl-spk-freq" class="slider-val">${st.speakerFreq} Hz</span>
          </div>
          <input id="rng-spk-freq" type="range" min="35" max="90" value="${st.speakerFreq}" />
        </div>
      </div>
    `;

    box.querySelectorAll('.submode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        st.mode = b.dataset.mode;
        if (st.mode !== 'speaker') this.audio.updateSubwoofer(0, st.speakerFreq);
        else this.audio.updateSubwoofer(st.speakerVolume, st.speakerFreq);
        this._renderStationControls('sound');
        this._focusStationCamera('sound', 0.75);
      });
    });

    const rngSize = box.querySelector('#rng-fork-size');
    const rngForce = box.querySelector('#rng-strike-force');
    rngSize?.addEventListener('input', () => {
      st.forkSize = Number(rngSize.value) / 100;
      st._applyForkSize();
      box.querySelector('#lbl-fork-freq').textContent = `${st.getFrequency()} Hz`;
      box.querySelector('#met-fork-hz').textContent = `${st.getFrequency()} Hz`;
    });
    rngForce?.addEventListener('input', () => {
      st.strikeForce = Number(rngForce.value) / 100;
      box.querySelector('#lbl-strike-force').textContent = `${rngForce.value}%`;
    });
    box.querySelector('#btn-strike-fork')?.addEventListener('click', () => {
      st.maxKickDeg = 0;
      st.strikeFork();
    });
    box.querySelector('#btn-ball-touch')?.addEventListener('click', () => {
      st.ballContact = !st.ballContact;
      st._applyForkSize();
      this._renderStationControls('sound');
    });

    const rngVol = box.querySelector('#rng-spk-vol');
    const rngSpkF = box.querySelector('#rng-spk-freq');
    rngVol?.addEventListener('input', () => {
      st.speakerVolume = Number(rngVol.value) / 100;
      box.querySelector('#lbl-spk-vol').textContent = `${rngVol.value}%`;
      this.audio.updateSubwoofer(st.speakerVolume, st.speakerFreq);
    });
    rngSpkF?.addEventListener('input', () => {
      st.speakerFreq = Number(rngSpkF.value);
      box.querySelector('#lbl-spk-freq').textContent = `${st.speakerFreq} Hz`;
      this.audio.updateSubwoofer(st.speakerVolume, st.speakerFreq);
    });

    this.liveMetricUpdaters = () => {
      const kickEl = box.querySelector('#met-ball-kick');
      if (kickEl) kickEl.textContent = `${st.maxKickDeg}°`;
    };
    this._syncControlsFn = () => this._renderStationControls('sound');
  }

  // --- Station 2: Light Energy HUD ---
  _buildLightHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'reflection' ? 'active' : ''}" data-mode="reflection" type="button">A: Reflection</button>
        <button class="submode-btn ${st.mode === 'refraction' ? 'active' : ''}" data-mode="refraction" type="button">B: Refraction</button>
        <button class="submode-btn ${st.mode === 'shadow' ? 'active' : ''}" data-mode="shadow" type="button">C: Shadow Lab</button>
      </div>

      <div class="control-group ${st.mode !== 'reflection' ? 'hidden' : ''}">
        <div id="laser-target-banner" class="status-banner ${st.sensorHit ? 'ok' : 'warn'}">
          ${st.sensorHit ? '🎯 Target Hit! Angle of Incidence = Angle of Reflection!' : 'Rotate the 3 mirrors (in 3D or below) to hit the green sensor!'}
        </div>
        ${[0, 1, 2]
          .map(
            (i) => `
          <div class="slider-row">
            <div class="slider-label-line">
              <span>Mirror ${i + 1} Angle</span>
              <span id="lbl-m-${i}" class="slider-val">${st.mirrorAngles[i]}°</span>
            </div>
            <input id="rng-m-${i}" type="range" min="-85" max="85" value="${st.mirrorAngles[i]}" />
          </div>`
          )
          .join('')}
        <button id="btn-align-mirrors" class="action-btn amber" type="button">✨ Align Laser to Target (45° Law)</button>
      </div>

      <div class="control-group ${st.mode !== 'refraction' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Beaker Water Level (n = 1.33)</span>
            <span id="lbl-water" class="slider-val">${Math.round(st.waterLevel * 400)} mL</span>
          </div>
          <input id="rng-water" type="range" min="35" max="90" value="${Math.round(st.waterLevel * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Slide Pencil Position</span>
            <span class="slider-val">Inspect Shift</span>
          </div>
          <input id="rng-pencil" type="range" min="-100" max="100" value="${Math.round(st.pencilOffset * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Optical Prism Incidence Angle</span>
            <span id="lbl-prism" class="slider-val">${st.prismAngle}°</span>
          </div>
          <input id="rng-prism" type="range" min="-35" max="45" value="${st.prismAngle}" />
        </div>
      </div>

      <div class="control-group ${st.mode !== 'shadow' ? 'hidden' : ''}">
        <div class="slider-label-line"><span>Test Block Material</span></div>
        <div class="btn-grid-3">
          <button class="chip-btn ${st.blockMaterial === 'opaque' ? 'active' : ''}" data-mat="opaque" type="button">Opaque (Wood)</button>
          <button class="chip-btn ${st.blockMaterial === 'translucent' ? 'active' : ''}" data-mat="translucent" type="button">Translucent</button>
          <button class="chip-btn ${st.blockMaterial === 'transparent' ? 'active' : ''}" data-mat="transparent" type="button">Transparent</button>
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Spotlight Distance (Drag Torch in 3D)</span>
            <span id="lbl-torch-dist" class="slider-val">${Math.round(40 + st.lightDistance * 60)} cm</span>
          </div>
          <input id="rng-torch-dist" type="range" min="0" max="100" value="${Math.round(st.lightDistance * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Spotlight Side Angle</span>
            <span class="slider-val">Pan Beam</span>
          </div>
          <input id="rng-torch-lat" type="range" min="-100" max="100" value="${Math.round(st.lightLateral * 100)}" />
        </div>
      </div>
    `;

    box.querySelectorAll('.submode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        st.setMode(b.dataset.mode);
        this._renderStationControls('light');
        this._focusStationCamera('light', 0.75);
      });
    });

    [0, 1, 2].forEach((i) => {
      const r = box.querySelector(`#rng-m-${i}`);
      r?.addEventListener('input', () => {
        st.mirrorAngles[i] = Number(r.value);
        box.querySelector(`#lbl-m-${i}`).textContent = `${r.value}°`;
        st._updateReflectionRays();
        this._refreshLaserBanner(box, st);
      });
    });

    box.querySelector('#btn-align-mirrors')?.addEventListener('click', () => {
      st.autoSolveMirrors();
      this._renderStationControls('light');
    });

    const rWater = box.querySelector('#rng-water');
    rWater?.addEventListener('input', () => {
      st.waterLevel = Number(rWater.value) / 100;
      box.querySelector('#lbl-water').textContent = `${Math.round(st.waterLevel * 400)} mL`;
      st._updateRefractionScene();
    });
    const rPencil = box.querySelector('#rng-pencil');
    rPencil?.addEventListener('input', () => {
      st.pencilOffset = Number(rPencil.value) / 100;
      st._updateRefractionScene();
    });
    const rPrism = box.querySelector('#rng-prism');
    rPrism?.addEventListener('input', () => {
      st.prismAngle = Number(rPrism.value);
      box.querySelector('#lbl-prism').textContent = `${st.prismAngle}°`;
      st._updateRefractionScene();
    });

    box.querySelectorAll('[data-mat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.blockMaterial = btn.dataset.mat;
        st._updateShadowScene();
        this.audio.playClick(740, 0.2);
        this._renderStationControls('light');
      });
    });

    const rDist = box.querySelector('#rng-torch-dist');
    rDist?.addEventListener('input', () => {
      st.lightDistance = Number(rDist.value) / 100;
      box.querySelector('#lbl-torch-dist').textContent = `${Math.round(40 + st.lightDistance * 60)} cm`;
      st._updateShadowScene();
    });
    const rLat = box.querySelector('#rng-torch-lat');
    rLat?.addEventListener('input', () => {
      st.lightLateral = Number(rLat.value) / 100;
      st._updateShadowScene();
    });

    this._syncControlsFn = () => {
      [0, 1, 2].forEach((i) => {
        const r = box.querySelector(`#rng-m-${i}`);
        const l = box.querySelector(`#lbl-m-${i}`);
        if (r) r.value = st.mirrorAngles[i];
        if (l) l.textContent = `${st.mirrorAngles[i]}°`;
      });
      this._refreshLaserBanner(box, st);
      if (st.mode === 'shadow') {
        if (rDist) rDist.value = Math.round(st.lightDistance * 100);
        if (rLat) rLat.value = Math.round(st.lightLateral * 100);
      }
    };
  }

  _refreshLaserBanner(box, st) {
    const banner = box.querySelector('#laser-target-banner');
    if (!banner) return;
    banner.className = `status-banner ${st.sensorHit ? 'ok' : 'warn'}`;
    banner.textContent = st.sensorHit
      ? '🎯 Target Hit! Angle of Incidence = Angle of Reflection!'
      : 'Rotate the 3 mirrors (in 3D or below) to hit the green sensor!';
  }

  // --- Station 3: Thermal Energy HUD ---
  _buildThermalHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'chamber' ? 'active' : ''}" data-mode="chamber" type="button">A: Phase Chamber</button>
        <button class="submode-btn ${st.mode === 'toaster' ? 'active' : ''}" data-mode="toaster" type="button">B: Kitchen Toaster</button>
      </div>

      <div class="control-group ${st.mode !== 'chamber' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>❄️ Cool (Ice) ↔ 🔥 Heat (Bunsen Flame)</span>
            <span id="lbl-temp-c" class="slider-val">${st.temperatureC}°C / ${st.getTemperatureF()}°F</span>
          </div>
          <input id="rng-temp" type="range" min="-30" max="150" value="${st.temperatureC}" />
        </div>
        <div class="btn-grid-3">
          <button class="chip-btn" data-preset="-22" type="button">Solid (-22°C)</button>
          <button class="chip-btn" data-preset="35" type="button">Liquid (35°C)</button>
          <button class="chip-btn" data-preset="135" type="button">Gas (135°C)</button>
        </div>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Thermometer</span>
            <span id="met-thermo" class="metric-value">${st.temperatureC}°C (${st.getTemperatureF()}°F)</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">State of Matter</span>
            <span id="met-phase" class="metric-value">${st.getPhaseState()}</span>
          </div>
        </div>
      </div>

      <div class="control-group ${st.mode !== 'toaster' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Toast Darkness Dial (1–5)</span>
            <span id="lbl-darkness" class="slider-val">Level ${st.darknessSetting}</span>
          </div>
          <input id="rng-darkness" type="range" min="1" max="5" step="1" value="${st.darknessSetting}" />
        </div>
        <button id="btn-push-toaster" class="action-btn amber" type="button">
          🍞 Push Down Toaster Lever
        </button>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Nichrome Coils</span>
            <span id="met-coil-state" class="metric-value">Cool</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Bread Browning</span>
            <span id="met-toast-pct" class="metric-value">${Math.round(st.toastLevel * 100)}%</span>
          </div>
        </div>
      </div>
    `;

    box.querySelectorAll('.submode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        st.mode = b.dataset.mode;
        this._renderStationControls('thermal');
        this._focusStationCamera('thermal', 0.75);
      });
    });

    const rngTemp = box.querySelector('#rng-temp');
    const syncTempLabels = () => {
      const txt = `${st.temperatureC}°C / ${st.getTemperatureF()}°F`;
      const l1 = box.querySelector('#lbl-temp-c');
      const l2 = box.querySelector('#met-thermo');
      const lp = box.querySelector('#met-phase');
      if (l1) l1.textContent = txt;
      if (l2) l2.textContent = `${st.temperatureC}°C (${st.getTemperatureF()}°F)`;
      if (lp) lp.textContent = st.getPhaseState();
    };
    rngTemp?.addEventListener('input', () => {
      st.temperatureC = Number(rngTemp.value);
      syncTempLabels();
    });
    box.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.temperatureC = Number(btn.dataset.preset);
        if (rngTemp) rngTemp.value = st.temperatureC;
        syncTempLabels();
        this.audio.playClick(700, 0.2);
      });
    });

    const rngDark = box.querySelector('#rng-darkness');
    rngDark?.addEventListener('input', () => {
      st.darknessSetting = Number(rngDark.value);
      box.querySelector('#lbl-darkness').textContent = `Level ${st.darknessSetting}`;
    });
    box.querySelector('#btn-push-toaster')?.addEventListener('click', () => {
      st.pushToasterLever();
    });

    this.liveMetricUpdaters = () => {
      const coilEl = box.querySelector('#met-coil-state');
      const pctEl = box.querySelector('#met-toast-pct');
      if (coilEl) coilEl.textContent = st.isToasting ? 'Glowing 650°C' : 'Standby';
      if (pctEl) pctEl.textContent = `${Math.round(st.toastLevel * 100)}%`;
    };
  }

  // --- Station 4: Mechanical Energy HUD ---
  _buildMechanicalHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'coaster' ? 'active' : ''}" data-mode="coaster" type="button">A: Roller Coaster</button>
        <button class="submode-btn ${st.mode === 'ramp' ? 'active' : ''}" data-mode="ramp" type="button">B: Ramp Collision</button>
      </div>

      <div class="control-group ${st.mode !== 'coaster' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Release Height</span>
            <span id="lbl-coaster-h" class="slider-val">${Math.round(st.releaseHeightNorm * 100)}%</span>
          </div>
          <input id="rng-coaster-h" type="range" min="35" max="100" value="${Math.round(st.releaseHeightNorm * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Cart Mass</span>
            <span id="lbl-cart-mass" class="slider-val">${st.cartMass.toFixed(1)} kg</span>
          </div>
          <input id="rng-cart-mass" type="range" min="10" max="100" step="5" value="${Math.round(st.cartMass * 10)}" />
        </div>
        <div class="btn-grid-2">
          <button id="btn-launch-coaster" class="action-btn" type="button">🎢 Launch Cart</button>
          <button id="btn-friction-toggle" class="chip-btn ${st.frictionEnabled ? 'active' : ''}" type="button">
            Friction: ${st.frictionEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div class="energy-bars">
          <div class="bar-row">
            <div class="slider-label-line">
              <span>Potential Energy (PE)</span>
              <span id="val-pe" class="slider-val">0 J</span>
            </div>
            <div class="bar-track"><div id="bar-pe" class="bar-fill" style="background:#38bdf8"></div></div>
          </div>
          <div class="bar-row">
            <div class="slider-label-line">
              <span>Kinetic Energy (KE)</span>
              <span id="val-ke" class="slider-val">0 J</span>
            </div>
            <div class="bar-track"><div id="bar-ke" class="bar-fill" style="background:#34d399"></div></div>
          </div>
          <div class="bar-row">
            <div class="slider-label-line">
              <span>Thermal Friction Loss</span>
              <span id="val-th" class="slider-val">0 J</span>
            </div>
            <div class="bar-track"><div id="bar-th" class="bar-fill" style="background:#fb923c"></div></div>
          </div>
        </div>
      </div>

      <div class="control-group ${st.mode !== 'ramp' ? 'hidden' : ''}">
        <div class="slider-label-line"><span>Select Sphere Mass &amp; Material</span></div>
        <div class="btn-grid-2">
          <button class="chip-btn ${st.ballType === 'steel' ? 'active' : ''}" data-ball="steel" type="button">
            Steel Ball (5.0 kg)
          </button>
          <button class="chip-btn ${st.ballType === 'tennis' ? 'active' : ''}" data-ball="tennis" type="button">
            Tennis Ball (0.25 kg)
          </button>
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Ramp Release Height</span>
            <span id="lbl-ramp-h" class="slider-val">${Math.round(15 + st.rampHeightNorm * 35)} cm</span>
          </div>
          <input id="rng-ramp-h" type="range" min="25" max="100" value="${Math.round(st.rampHeightNorm * 100)}" />
        </div>
        <button id="btn-launch-ramp" class="action-btn amber" type="button">🎳 Release Ball Down Ramp</button>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Impact Energy</span>
            <span id="met-impact-ke" class="metric-value">${st.impactKE} J</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Max Pin Scatter</span>
            <span id="met-pin-dist" class="metric-value">${st.maxPinScatterCm} cm</span>
          </div>
        </div>
      </div>
    `;

    box.querySelectorAll('.submode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        st.mode = b.dataset.mode;
        this._renderStationControls('mechanical');
        this._focusStationCamera('mechanical', 0.75);
      });
    });

    const rH = box.querySelector('#rng-coaster-h');
    rH?.addEventListener('input', () => {
      st.releaseHeightNorm = Number(rH.value) / 100;
      box.querySelector('#lbl-coaster-h').textContent = `${rH.value}%`;
      st._resetCartToStart();
    });
    const rM = box.querySelector('#rng-cart-mass');
    rM?.addEventListener('input', () => {
      st.cartMass = Number(rM.value) / 10;
      box.querySelector('#lbl-cart-mass').textContent = `${st.cartMass.toFixed(1)} kg`;
      st._resetCartToStart();
    });
    box.querySelector('#btn-launch-coaster')?.addEventListener('click', () => st.launchCoaster());
    box.querySelector('#btn-friction-toggle')?.addEventListener('click', () => {
      st.frictionEnabled = !st.frictionEnabled;
      this._renderStationControls('mechanical');
    });

    box.querySelectorAll('[data-ball]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.ballType = btn.dataset.ball;
        st._resetRampScene();
        this.audio.playClick(660, 0.2);
        this._renderStationControls('mechanical');
      });
    });
    const rRamp = box.querySelector('#rng-ramp-h');
    rRamp?.addEventListener('input', () => {
      st.rampHeightNorm = Number(rRamp.value) / 100;
      box.querySelector('#lbl-ramp-h').textContent = `${Math.round(15 + st.rampHeightNorm * 35)} cm`;
      st._resetRampScene();
    });
    box.querySelector('#btn-launch-ramp')?.addEventListener('click', () => st.launchRampBall());

    this.liveMetricUpdaters = () => {
      const e = st.energyStats;
      const tot = Math.max(1, e.total);
      const barPE = box.querySelector('#bar-pe');
      if (barPE) {
        barPE.style.width = `${Math.min(100, (e.pe / tot) * 100)}%`;
        box.querySelector('#bar-ke').style.width = `${Math.min(100, (e.ke / tot) * 100)}%`;
        box.querySelector('#bar-th').style.width = `${Math.min(100, (e.thermal / tot) * 100)}%`;
        box.querySelector('#val-pe').textContent = `${e.pe} J`;
        box.querySelector('#val-ke').textContent = `${e.ke} J`;
        box.querySelector('#val-th').textContent = `${e.thermal} J`;
      }
      const keEl = box.querySelector('#met-impact-ke');
      if (keEl) {
        keEl.textContent = `${st.impactKE} J`;
        box.querySelector('#met-pin-dist').textContent = `${st.maxPinScatterCm} cm`;
      }
    };
  }

  // --- Station 5: Chemical Energy HUD ---
  _buildChemicalHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'town' ? 'active' : ''}" data-mode="town" type="button">A: Bike &amp; Tiny Town</button>
        <button class="submode-btn ${st.mode === 'engine' ? 'active' : ''}" data-mode="engine" type="button">B: Car Engine</button>
      </div>

      <div class="control-group ${st.mode !== 'town' ? 'hidden' : ''}">
        <div class="slider-label-line"><span>Feed Chemical Energy (Food Calories) to Cyclist</span></div>
        <div class="btn-grid-3">
          <button class="action-btn" data-food="apple" type="button">🍎 Apple</button>
          <button class="action-btn" data-food="banana" type="button">🍌 Banana</button>
          <button class="action-btn amber" data-food="bar" type="button">🍫 Energy Bar</button>
        </div>
        <div class="bar-row">
          <div class="slider-label-line">
            <span>Chemical Stamina Stored</span>
            <span id="val-stamina" class="slider-val">0%</span>
          </div>
          <div class="bar-track"><div id="bar-stamina" class="bar-fill" style="background:#facc15"></div></div>
        </div>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Generator Output</span>
            <span id="met-watts" class="metric-value">0 W</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Town Lights</span>
            <span id="met-town-state" class="metric-value">Dark</span>
          </div>
        </div>
        <div class="status-banner">
          Chain: <strong>Chemical</strong> (Food) → <strong>Mechanical</strong> (Pedals) → <strong>Electrical</strong> → <strong>Light</strong>
        </div>
      </div>

      <div class="control-group ${st.mode !== 'engine' ? 'hidden' : ''}">
        <div class="btn-grid-2">
          <button id="btn-pump-gas" class="action-btn amber" type="button">⛽ Pump Gasoline</button>
          <button id="btn-ignition" class="action-btn" type="button">
            🔑 Ignition: ${st.ignitionOn ? 'ON' : 'OFF'}
          </button>
        </div>
        <div class="bar-row">
          <div class="slider-label-line">
            <span>Fuel Tank (Stored Chemical Energy)</span>
            <span id="val-fuel" class="slider-val">${Math.round(st.fuelLevel * 100)}%</span>
          </div>
          <div class="bar-track"><div id="bar-fuel" class="bar-fill" style="background:#f59e0b"></div></div>
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Engine Throttle</span>
            <span id="lbl-rpm" class="slider-val">${Math.round(st.engineRPM)} RPM</span>
          </div>
          <input id="rng-throttle" type="range" min="20" max="100" value="${Math.round(st.throttleNorm * 100)}" />
        </div>
      </div>
    `;

    box.querySelectorAll('.submode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        st.mode = b.dataset.mode;
        this._renderStationControls('chemical');
        this._focusStationCamera('chemical', 0.75);
      });
    });

    box.querySelectorAll('[data-food]').forEach((btn) => {
      btn.addEventListener('click', () => st.feedCyclist(btn.dataset.food));
    });

    box.querySelector('#btn-pump-gas')?.addEventListener('click', () => st.pumpGasoline());
    box.querySelector('#btn-ignition')?.addEventListener('click', () => {
      st.toggleIgnition();
      this._renderStationControls('chemical');
    });
    const rThrot = box.querySelector('#rng-throttle');
    rThrot?.addEventListener('input', () => {
      st.throttleNorm = Number(rThrot.value) / 100;
    });

    this.liveMetricUpdaters = () => {
      const sBar = box.querySelector('#bar-stamina');
      if (sBar) {
        const pct = Math.round(st.stamina * 100);
        sBar.style.width = `${pct}%`;
        box.querySelector('#val-stamina').textContent = `${pct}%`;
        box.querySelector('#met-watts').textContent = `${st.powerOutputW} W`;
        box.querySelector('#met-town-state').textContent = st.powerOutputW > 18 ? 'Lit Brightly!' : 'Off';
      }
      const fBar = box.querySelector('#bar-fuel');
      if (fBar) {
        const fpct = Math.round(st.fuelLevel * 100);
        fBar.style.width = `${fpct}%`;
        box.querySelector('#val-fuel').textContent = `${fpct}%`;
        box.querySelector('#lbl-rpm').textContent = `${Math.round(st.engineRPM)} RPM`;
        const igBtn = box.querySelector('#btn-ignition');
        if (igBtn) igBtn.textContent = `🔑 Ignition: ${st.ignitionOn ? 'RUNNING' : 'OFF'}`;
      }
    };
    this._syncControlsFn = () => this._renderStationControls('chemical');
  }

  // --- Station 6: Electrical Circuit Bench HUD ---
  _buildElectricalHUD(box, st) {
    box.innerHTML = `
      <div class="control-group">
        <div id="circuit-status-banner" class="status-banner ${st.circuitClosed ? 'ok' : 'warn'}">
          ${st.openReason}
        </div>
        <button id="btn-knife-switch" class="action-btn ${st.switchClosed ? '' : 'amber'}" type="button">
          ⚡ ${st.switchClosed ? 'Open Copper Knife Switch' : 'Close Copper Knife Switch'}
        </button>

        <div class="slider-label-line"><span>Drag Components in 3D or Click to Snap In / Out:</span></div>
        <div class="btn-grid-3">
          <button class="chip-btn ${st.bays.bulb ? 'active' : ''}" data-dev="bulb" type="button">
            💡 Bulb (${st.bays.bulb ? 'In' : 'Tray'})
          </button>
          <button class="chip-btn ${st.bays.buzzer ? 'active' : ''}" data-dev="buzzer" type="button">
            🔊 Buzzer (${st.bays.buzzer ? 'In' : 'Tray'})
          </button>
          <button class="chip-btn ${st.bays.motor ? 'active' : ''}" data-dev="motor" type="button">
            🌀 Motor (${st.bays.motor ? 'In' : 'Tray'})
          </button>
        </div>
        <div class="btn-grid-3">
          ${[0, 1, 2]
            .map(
              (idx) => `
            <button class="chip-btn ${st.wiresInstalled[idx] ? 'active' : ''}" data-wire="${idx}" type="button">
              🔌 Wire ${idx + 1} (${st.wiresInstalled[idx] ? 'In' : 'Out'})
            </button>`
            )
            .join('')}
        </div>

        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Bulb Output</span>
            <span class="metric-value">${st.circuitClosed ? 'Light + Heat' : 'Off'}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Buzzer &amp; Motor</span>
            <span class="metric-value">${st.circuitClosed ? 'Sound + Motion' : 'Off'}</span>
          </div>
        </div>
      </div>
    `;

    box.querySelector('#btn-knife-switch')?.addEventListener('click', () => {
      st.toggleKnifeSwitch();
      this._renderStationControls('electrical');
    });

    box.querySelectorAll('[data-dev]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.toggleDevice(btn.dataset.dev);
        this._renderStationControls('electrical');
      });
    });

    box.querySelectorAll('[data-wire]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.toggleWire(Number(btn.dataset.wire));
        this._renderStationControls('electrical');
      });
    });

    this._syncControlsFn = () => this._renderStationControls('electrical');
  }

  // =========================================================================
  // 3D-TO-2D SCREEN PROJECTION FOR FLOATING PINS & MIRROR ANGLE READOUTS
  // =========================================================================
  _updateProjectedOverlays() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isOverview = this.activeStationId === 'overview';

    // 1. Overview Bench Pins
    this.benchPins.forEach((pin) => {
      if (!isOverview) {
        pin.el.classList.add('hidden');
        return;
      }
      const p = pin.worldPos.clone().project(this.camera);
      if (p.z > 1) {
        pin.el.classList.add('hidden');
        return;
      }
      pin.el.classList.remove('hidden');
      pin.el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      pin.el.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    });

    // 2. Light Station Mode A Reflection Angle Readouts (θᵢ = θᵣ)
    const lightSt = this.stations.get('light');
    const showAngles =
      this.activeStationId === 'light' && lightSt && lightSt.mode === 'reflection' && !this.camTween.active;

    this.angleCalloutEls.forEach((el, idx) => {
      if (!showAngles || idx >= lightSt.reflectionAnnotations.length) {
        el.classList.add('hidden');
        return;
      }
      const ann = lightSt.reflectionAnnotations[idx];
      const p = ann.worldPos.clone().project(this.camera);
      if (p.z > 1) {
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      el.textContent = `M${ann.mirrorNumber}: θᵢ ${ann.angleDeg}° = θᵣ ${ann.angleDeg}°`;
      el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    });
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;

    // Smooth Quintic Ease-In-Out Camera Interpolation
    if (this.camTween.active) {
      this.camTween.elapsed += dt;
      const rawT = Math.min(1, this.camTween.elapsed / this.camTween.duration);
      const ease = rawT < 0.5 ? 16 * Math.pow(rawT, 5) : 1 - Math.pow(-2 * rawT + 2, 5) / 2;

      this.camera.position.lerpVectors(this.camTween.startPos, this.camTween.endPos, ease);
      this.controls.target.lerpVectors(this.camTween.startTarget, this.camTween.endTarget, ease);
      if (rawT >= 1) this.camTween.active = false;
    }

    this.controls.update();

    // Update all 6 stations (so subtle animations remain alive even in classroom Overview!)
    this.stations.forEach((st) => st.update(dt, elapsed));

    if (this.liveMetricUpdaters) this.liveMetricUpdaters();
    this._updateProjectedOverlays();

    this.composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.omniEnergyLab = new OmniEnergyLabApp();
});
