import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { FLORIDA_STANDARDS, STATIONS_META } from './data/standardsData.js';
import { AudioEngine } from './engine/AudioEngine.js';
import { LabEnvironment, BENCH_TOP_Y } from './engine/LabEnvironment.js';

import { SoundStation } from './stations/SoundStation.js';
import { LightStation } from './stations/LightStation.js';
import { ThermalStation } from './stations/ThermalStation.js';
import { MechanicalStation } from './stations/MechanicalStation.js';
import { ChemicalStation } from './stations/ChemicalStation.js';
import { ElectricalStation, SNAP_PART_CATALOG } from './stations/ElectricalStation.js';

class OmniEnergyLabApp {
  constructor() {
    this.canvas = document.getElementById('lab-canvas');
    this.overlayContainer = document.getElementById('overlay-markers');
    this.audio = new AudioEngine();

    this.activeStationId = 'overview';
    this.stations = new Map();
    this.liveMetricUpdaters = null;
    this._syncControlsFn = null;

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
    // Crisp direct WebGL2 hardware-MSAA rendering — ZERO fog and ZERO bloom haze!
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b12);
    // Intentionally NO scene.fog so every station and distant classroom wall is crystal-clear!

    // Restrained studio metallic specular reflection without milky ambient washout
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv, 0.03).texture;
    this.scene.environmentIntensity = 0.25;
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
  }

  _initLighting() {
    // High-contrast, clean studio/laboratory lighting with crisp shadows and zero atmospheric haze
    const hemi = new THREE.HemisphereLight(0xf1f5f9, 0x0f172a, 0.52);
    this.scene.add(hemi);

    // Crisp key directional sunlight from left laboratory windows
    const sunKey = new THREE.DirectionalLight(0xffffff, 1.65);
    sunKey.position.set(-10, 12, 6.5);
    sunKey.castShadow = true;
    sunKey.shadow.mapSize.set(2048, 2048);
    sunKey.shadow.camera.near = 1;
    sunKey.shadow.camera.far = 34;
    sunKey.shadow.camera.left = -12;
    sunKey.shadow.camera.right = 12;
    sunKey.shadow.camera.top = 10;
    sunKey.shadow.camera.bottom = -10;
    sunKey.shadow.bias = -0.0003;
    this.scene.add(sunKey);

    // Subtle cool counter-rim directional light for sharp edge separation on 3D instruments
    const rimFill = new THREE.DirectionalLight(0xe0f2fe, 0.55);
    rimFill.position.set(10, 8, -7);
    this.scene.add(rimFill);

    // Dedicated Active Workbench Overhead Spotlight for razor-sharp close-up apparatus visibility
    this.benchSpot = new THREE.SpotLight(0xffffff, 2.9, 10, Math.PI * 0.36, 0.35, 0.85);
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

    // Dynamic angle callouts pool for LightStation Mode A (supports all 4 mirrors + retro bounce)
    this.angleCalloutEls = Array.from({ length: 5 }, () => {
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
      if (e.button !== 0) return; // Right-click is handled by contextmenu for in-place piece rotation
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
        if (activeStation) {
          const hits =
            activeStation.interactables.length > 0
              ? this.raycaster.intersectObjects(activeStation.interactables, false)
              : [];

          // Electrical pegboard uses plane-based peg detection so wires ALWAYS connect even over placed parts!
          if (this.activeStationId === 'electrical') {
            const handled = activeStation.onPointerDown(hits[0] || null, this.raycaster);
            if (handled) {
              this._syncStationControlsValues();
              return;
            }
          } else if (hits.length > 0) {
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

    // Right-clicking any placed piece on the Electrical pegboard turns it 90° in-place!
    this.canvas.addEventListener('contextmenu', (e) => {
      if (this.activeStationId !== 'electrical') return;
      e.preventDefault();
      this.audio.ensureContext();
      updateNDC(e);
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      const st = this.stations.get('electrical');
      if (st && typeof st.onRightClick === 'function') {
        if (st.onRightClick(this.raycaster)) {
          this._syncStationControlsValues();
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

      // Hover cursor affordance + Snap-Circuits pegboard plane ghost preview
      if (this.activeStationId !== 'overview') {
        const st = this.stations.get(this.activeStationId);
        if (st) {
          const hits =
            st.interactables.length > 0
              ? this.raycaster.intersectObjects(st.interactables, false)
              : [];
          let overPeg = false;
          if (this.activeStationId === 'electrical' && typeof st.onHoverRay === 'function') {
            overPeg = st.onHoverRay(this.raycaster);
          }
          this.canvas.style.cursor = hits.length > 0 || overPeg ? 'pointer' : 'grab';
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

    // Keyboard shortcuts on Station 6:
    // - Delete / Backspace / X: Cut & remove selected or hovered piece
    // - T: Turn already-placed piece 90° on the board
    // - R: Rotate new-part placement orientation (or turn selected piece if in Select mode)
    // - Escape: Switch to Select / Turn Placed Piece mode
    window.addEventListener('keydown', (e) => {
      if (this.activeStationId !== 'electrical') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const st = this.stations.get('electrical');
      if (!st) return;

      if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        this.audio.ensureContext();
        if (st.deleteSelectedOrHoveredPart()) {
          this._syncStationControlsValues();
        }
      } else if (e.key === 't' || e.key === 'T') {
        this.audio.ensureContext();
        if (st.rotatePlacedPart()) {
          this._syncStationControlsValues();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        this.audio.ensureContext();
        if (st.selectedTool === 'select' || (!st.hoverPeg && st.selectedPartId !== null)) {
          st.rotatePlacedPart();
        } else {
          st.rotateOrientation();
        }
        this._syncStationControlsValues();
      } else if (e.key === 'Escape') {
        st.selectTool('select');
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

  // --- Station 1: Sound Energy HUD (Air-Gap Wave Motion + Deep Bass Subwoofer) ---
  _buildSoundHUD(box, st) {
    const gapLabelText = (cm) =>
      cm < 0.4 ? '0 cm (Touching Prong)' : `${cm} cm (Air Sound Waves!)`;

    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'fork' ? 'active' : ''}" data-mode="fork" type="button">A: Tuning Fork</button>
        <button class="submode-btn ${st.mode === 'speaker' ? 'active' : ''}" data-mode="speaker" type="button">B: Deep Bass Cone</button>
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
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Ping-Pong Ball Air Gap</span>
            <span id="lbl-ball-gap" class="slider-val">${gapLabelText(st.ballGapCm)}</span>
          </div>
          <input id="rng-ball-gap" type="range" min="0" max="8" step="1" value="${Math.round(st.ballGapCm)}" />
        </div>
        <div class="btn-grid-3">
          <button id="btn-strike-fork" class="action-btn" type="button">🔔 Strike</button>
          <button id="btn-gap-touch" class="chip-btn ${st.ballContact ? 'active' : ''}" type="button">0 cm Touch</button>
          <button id="btn-gap-air" class="chip-btn ${!st.ballContact ? 'active' : ''}" type="button">3 cm Air Wave</button>
        </div>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Pitch / Frequency</span>
            <span id="met-fork-hz" class="metric-value">${st.getFrequency()} Hz</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Peak Ball Swing</span>
            <span id="met-ball-kick" class="metric-value">${st.maxKickDeg}°</span>
          </div>
        </div>
      </div>

      <div id="sound-speaker-panel" class="control-group ${st.mode !== 'speaker' ? 'hidden' : ''}">
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Subwoofer Bass Volume</span>
            <span id="lbl-spk-vol" class="slider-val">${Math.round(st.speakerVolume * 100)}%</span>
          </div>
          <input id="rng-spk-vol" type="range" min="0" max="100" value="${Math.round(st.speakerVolume * 100)}" />
        </div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Deep Bass Frequency</span>
            <span id="lbl-spk-freq" class="slider-val">${st.speakerFreq} Hz</span>
          </div>
          <input id="rng-spk-freq" type="range" min="35" max="90" value="${st.speakerFreq}" />
        </div>
        <div class="status-banner ok">
          🔊 Turn up Volume to hear the deep bass rumble and watch sound vibrations launch the sprinkles!
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
    const rngGap = box.querySelector('#rng-ball-gap');

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
    rngGap?.addEventListener('input', () => {
      st.setBallGapCm(Number(rngGap.value));
      box.querySelector('#lbl-ball-gap').textContent = gapLabelText(st.ballGapCm);
      box.querySelector('#btn-gap-touch')?.classList.toggle('active', st.ballContact);
      box.querySelector('#btn-gap-air')?.classList.toggle('active', !st.ballContact);
    });

    box.querySelector('#btn-strike-fork')?.addEventListener('click', () => {
      st.maxKickDeg = 0;
      st.strikeFork();
    });
    box.querySelector('#btn-gap-touch')?.addEventListener('click', () => {
      st.setBallGapCm(0);
      this._renderStationControls('sound');
    });
    box.querySelector('#btn-gap-air')?.addEventListener('click', () => {
      st.setBallGapCm(3);
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

  // --- Station 2: Light Energy HUD (4 Mirrors + 0° Bounce-Back + 4 Shadow Shapes) ---
  _buildLightHUD(box, st) {
    const shapeNames = {
      block: 'Wood Block',
      star: '5-Point Star',
      circle: 'Circle Disc',
      puppet: 'Silly Cartoon Puppet'
    };

    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'reflection' ? 'active' : ''}" data-mode="reflection" type="button">A: 4-Mirror Laser</button>
        <button class="submode-btn ${st.mode === 'refraction' ? 'active' : ''}" data-mode="refraction" type="button">B: Refraction</button>
        <button class="submode-btn ${st.mode === 'shadow' ? 'active' : ''}" data-mode="shadow" type="button">C: Shadow Lab</button>
      </div>

      <div class="control-group ${st.mode !== 'reflection' ? 'hidden' : ''}">
        <div id="laser-target-banner" class="status-banner ${st.sensorHit || st.retroHit ? 'ok' : 'warn'}">
          ${this._getLaserBannerText(st)}
        </div>
        ${[0, 1, 2, 3]
          .map(
            (i) => `
          <div class="slider-row">
            <div class="slider-label-line">
              <span>Mirror ${i + 1} Angle</span>
              <span id="lbl-m-${i}" class="slider-val">${st.mirrorAngles[i]}°</span>
            </div>
            <input id="rng-m-${i}" type="range" min="-95" max="95" value="${st.mirrorAngles[i]}" />
          </div>`
          )
          .join('')}
        <div class="btn-grid-2">
          <button id="btn-align-mirrors" class="action-btn amber" type="button">✨ Align 4 Mirrors</button>
          <button id="btn-retro-bounce" class="action-btn" type="button">↔ 0° Straight Back</button>
        </div>
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
        <div class="slider-label-line">
          <span>Object Shape (Click 3D Object or Pick)</span>
          <span id="lbl-shadow-shape" class="slider-val">${shapeNames[st.shadowShape] || st.shadowShape}</span>
        </div>
        <div class="btn-grid-4">
          <button class="chip-btn ${st.shadowShape === 'block' ? 'active' : ''}" data-shape="block" type="button">🟫 Block</button>
          <button class="chip-btn ${st.shadowShape === 'star' ? 'active' : ''}" data-shape="star" type="button">⭐ Star</button>
          <button class="chip-btn ${st.shadowShape === 'circle' ? 'active' : ''}" data-shape="circle" type="button">⚪ Circle</button>
          <button class="chip-btn ${st.shadowShape === 'puppet' ? 'active' : ''}" data-shape="puppet" type="button">🤪 Puppet</button>
        </div>

        <div class="slider-label-line">
          <span>Test Material (Side Panel Control)</span>
          <span id="lbl-shadow-mat" class="slider-val">${st.blockMaterial.toUpperCase()}</span>
        </div>
        <div class="btn-grid-3">
          <button class="chip-btn ${st.blockMaterial === 'opaque' ? 'active' : ''}" data-mat="opaque" type="button">Opaque</button>
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

    [0, 1, 2, 3].forEach((i) => {
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

    box.querySelector('#btn-retro-bounce')?.addEventListener('click', () => {
      st.demoStraightBackReflection();
      this.audio.playClick(880, 0.22);
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

    box.querySelectorAll('[data-shape]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.shadowShape = btn.dataset.shape;
        st._updateShadowScene();
        this.audio.playClick(760, 0.22);
        this._renderStationControls('light');
      });
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
      [0, 1, 2, 3].forEach((i) => {
        const r = box.querySelector(`#rng-m-${i}`);
        const l = box.querySelector(`#lbl-m-${i}`);
        if (r) r.value = st.mirrorAngles[i];
        if (l) l.textContent = `${st.mirrorAngles[i]}°`;
      });
      this._refreshLaserBanner(box, st);
      if (st.mode === 'refraction') {
        const lp = box.querySelector('#lbl-prism');
        if (rPrism) rPrism.value = st.prismAngle;
        if (lp) lp.textContent = `${st.prismAngle}°`;
      }
      if (st.mode === 'shadow') {
        if (rDist) rDist.value = Math.round(st.lightDistance * 100);
        const ld = box.querySelector('#lbl-torch-dist');
        if (ld) ld.textContent = `${Math.round(40 + st.lightDistance * 60)} cm`;
        if (rLat) rLat.value = Math.round(st.lightLateral * 100);

        // Immediately sync shape & material indicators when clicking the 3D test object!
        const shapeLbl = box.querySelector('#lbl-shadow-shape');
        if (shapeLbl) shapeLbl.textContent = shapeNames[st.shadowShape] || st.shadowShape;
        box.querySelectorAll('[data-shape]').forEach((b) => {
          b.classList.toggle('active', b.dataset.shape === st.shadowShape);
        });
        const matLbl = box.querySelector('#lbl-shadow-mat');
        if (matLbl) matLbl.textContent = st.blockMaterial.toUpperCase();
        box.querySelectorAll('[data-mat]').forEach((b) => {
          b.classList.toggle('active', b.dataset.mat === st.blockMaterial);
        });
      }
    };
  }

  _getLaserBannerText(st) {
    if (st.retroHit) {
      return '↔ Straight-On (0°)! Light hits perpendicular to Mirror 1 and reflects directly back!';
    }
    if (st.sensorHit) {
      return '🎯 All 4 Mirrors Aligned! Target Hit (Angle of Incidence = Angle of Reflection)!';
    }
    return 'Rotate the 4 mirrors (in 3D or below) to steer the laser into the green target!';
  }

  _refreshLaserBanner(box, st) {
    const banner = box.querySelector('#laser-target-banner');
    if (!banner) return;
    banner.className = `status-banner ${st.sensorHit || st.retroHit ? 'ok' : 'warn'}`;
    banner.textContent = this._getLaserBannerText(st);
  }

  // --- Station 3: Thermal Energy HUD (Exact Water Benchmark Presets: 0°C/32°F, 24°C/75°F, 100°C/212°F) ---
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
          <input id="rng-temp" type="range" min="-20" max="120" value="${st.temperatureC}" />
        </div>
        <div class="slider-label-line"><span>Water Phase Benchmark Jump Points:</span></div>
        <div class="btn-grid-3">
          <button class="chip-btn ${st.temperatureC === 0 ? 'active' : ''}" data-preset="0" type="button">Solid<br/>0°C / 32°F</button>
          <button class="chip-btn ${st.temperatureC === 24 ? 'active' : ''}" data-preset="24" type="button">Liquid<br/>24°C / 75°F</button>
          <button class="chip-btn ${st.temperatureC === 100 ? 'active' : ''}" data-preset="100" type="button">Gas<br/>100°C / 212°F</button>
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
            <span id="met-coil-state" class="metric-value">Standby</span>
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
      box.querySelectorAll('[data-preset]').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.preset) === st.temperatureC);
      });
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

  // --- Station 4: Mechanical Energy HUD (Draggable Lift Tower + 0/1/2 Loops + 6-Pin Scatter) ---
  _buildMechanicalHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'coaster' ? 'active' : ''}" data-mode="coaster" type="button">A: Roller Coaster</button>
        <button class="submode-btn ${st.mode === 'ramp' ? 'active' : ''}" data-mode="ramp" type="button">B: Ramp Collision</button>
      </div>

      <div class="control-group ${st.mode !== 'coaster' ? 'hidden' : ''}">
        <div id="coaster-status-banner" class="status-banner">${st.coasterStatus}</div>
        <div class="slider-row">
          <div class="slider-label-line">
            <span>Starting Hill Height (Drag 3D Tower)</span>
            <span id="lbl-coaster-h" class="slider-val">${st.startHeightCm} cm</span>
          </div>
          <input id="rng-coaster-h" type="range" min="24" max="84" value="${st.startHeightCm}" />
        </div>
        <div class="slider-label-line"><span>Loop Challenge (Add or Remove Loops):</span></div>
        <div class="btn-grid-3">
          <button class="chip-btn ${st.loopCount === 0 ? 'active' : ''}" data-loops="0" type="button">0 Loops</button>
          <button class="chip-btn ${st.loopCount === 1 ? 'active' : ''}" data-loops="1" type="button">1 Loop</button>
          <button class="chip-btn ${st.loopCount === 2 ? 'active' : ''}" data-loops="2" type="button">2 Loops</button>
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
            <span id="lbl-ramp-h" class="slider-val">${st.getRampHeightCm()} cm</span>
          </div>
          <input id="rng-ramp-h" type="range" min="0" max="100" value="${Math.round(st.rampHeightNorm * 100)}" />
        </div>
        <div class="btn-grid-3">
          <button class="chip-btn ${st.rampHeightNorm <= 0.15 ? 'active' : ''}" data-ramp-preset="5" type="button">Low (8 cm)</button>
          <button class="chip-btn ${st.rampHeightNorm > 0.15 && st.rampHeightNorm < 0.75 ? 'active' : ''}" data-ramp-preset="42" type="button">Med (23 cm)</button>
          <button class="chip-btn ${st.rampHeightNorm >= 0.75 ? 'active' : ''}" data-ramp-preset="100" type="button">High (46 cm)</button>
        </div>
        <button id="btn-launch-ramp" class="action-btn amber" type="button">🎳 Release Ball Down Ramp</button>
        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Pins Scattered</span>
            <span id="met-pins-hit" class="metric-value">${st.pinsKnockedCount} / 6 (${st.maxPinScatterCm} cm)</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Impact Energy</span>
            <span id="met-impact-ke" class="metric-value">${st.impactKE} J</span>
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
      st.setStartHeightCm(Number(rH.value));
      box.querySelector('#lbl-coaster-h').textContent = `${st.startHeightCm} cm`;
    });

    box.querySelectorAll('[data-loops]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.setLoopCount(Number(btn.dataset.loops));
        this.audio.playClick(740, 0.2);
        this._renderStationControls('mechanical');
      });
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
      box.querySelector('#lbl-ramp-h').textContent = `${st.getRampHeightCm()} cm`;
      box.querySelectorAll('[data-ramp-preset]').forEach((b) => {
        const p = Number(b.dataset.rampPreset) / 100;
        b.classList.toggle('active', Math.abs(p - st.rampHeightNorm) < 0.08);
      });
      st._resetRampScene();
    });
    box.querySelectorAll('[data-ramp-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.rampHeightNorm = Number(btn.dataset.rampPreset) / 100;
        st._resetRampScene();
        this.audio.playClick(680, 0.2);
        this._renderStationControls('mechanical');
      });
    });
    box.querySelector('#btn-launch-ramp')?.addEventListener('click', () => st.launchRampBall());

    this._syncControlsFn = () => {
      if (rH) rH.value = st.startHeightCm;
      const lh = box.querySelector('#lbl-coaster-h');
      if (lh) lh.textContent = `${st.startHeightCm} cm`;
    };

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
      const statusEl = box.querySelector('#coaster-status-banner');
      if (statusEl) {
        statusEl.textContent = st.coasterStatus;
        statusEl.className = `status-banner ${
          st.coasterStatus.startsWith('🏁')
            ? 'ok'
            : st.coasterStatus.startsWith('⚠️')
            ? 'warn'
            : ''
        }`;
      }
      const keEl = box.querySelector('#met-impact-ke');
      if (keEl) {
        keEl.textContent = `${st.impactKE} J`;
        box.querySelector('#met-pins-hit').textContent = `${st.pinsKnockedCount} / 6 (${st.maxPinScatterCm} cm)`;
      }
    };
  }

  // --- Station 5: Chemical Energy HUD (Tire Dynamo Generator + House Windows & 8 Streetlights) ---
  _buildChemicalHUD(box, st) {
    box.innerHTML = `
      <div class="submode-tabs">
        <button class="submode-btn ${st.mode === 'town' ? 'active' : ''}" data-mode="town" type="button">A: Bike &amp; Tiny Town</button>
        <button class="submode-btn ${st.mode === 'engine' ? 'active' : ''}" data-mode="engine" type="button">B: Car Engine</button>
      </div>

      <div class="control-group ${st.mode !== 'town' ? 'hidden' : ''}">
        <div class="slider-label-line"><span>Feed Chemical Energy (Food) to Cyclist</span></div>
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
            <span class="metric-label">Tire Dynamo Output</span>
            <span id="met-watts" class="metric-value">0 W</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Houses &amp; Streetlights</span>
            <span id="met-town-state" class="metric-value">Dark</span>
          </div>
        </div>
        <div class="status-banner">
          Chain: <strong>Food</strong> (Chemical) → <strong>Tire</strong> (Mechanical) → <strong>Dynamo</strong> (Electrical) → <strong>Windows &amp; Streetlights</strong>
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
        box.querySelector('#met-town-state').textContent = st.powerOutputW > 12 ? 'Lit Brightly!' : 'Dark';
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

  // --- Station 6: Snap-Grid Circuit Builder Kit HUD (Empty Pegboard + Full Modular Parts Kit!) ---
  _buildElectricalHUD(box, st) {
    const oriLabels = ['0° ↔ Right', '90° ↓ Down', '180° ← Left', '270° ↑ Up'];
    const switches = st.placedParts.filter((p) => p.type === 'switch');
    const hasSwitch = switches.length > 0;
    const anySwitchClosed = switches.some((s) => s.isClosed);
    const selPart = st.getSelectedPlacedPart();

    const bannerClass = st.shortCircuit ? 'danger' : st.circuitClosed ? 'ok' : 'warn';

    box.innerHTML = `
      <div class="control-group">
        <div id="circuit-status-banner" class="status-banner ${bannerClass}">
          ${st.statusMessage}
        </div>

        <div class="btn-grid-2">
          <button id="btn-flip-switch" class="action-btn ${anySwitchClosed ? '' : 'amber'}" type="button">
            ${
              !hasSwitch
                ? '🎛️ Snap a Switch First'
                : anySwitchClosed
                ? '⚡ Switch: ON (Click OFF)'
                : '⚡ Switch: OFF (Click ON)'
            }
          </button>
          <button id="btn-rotate-part" class="chip-btn" type="button" title="Keyboard shortcut: R">
            ↻ New Dir: ${oriLabels[st.orientation]} (R)
          </button>
        </div>

        <div class="slider-label-line">
          <span>Selected Piece: <strong>${selPart ? selPart.label : 'None'}</strong></span>
          <span style="font-size:10.5px;color:#94a3b8">Right-Click = Turn · Del = Cut</span>
        </div>
        <div class="btn-grid-2">
          <button id="btn-turn-placed" class="chip-btn" type="button" ${!selPart ? 'disabled' : ''} title="Turn selected placed piece 90° on the board (Shortcut: T or Right-Click)">
            ↻ Turn Placed (T)
          </button>
          <button id="btn-cut-placed" class="chip-btn danger-tool" type="button" ${!selPart ? 'disabled' : ''} title="Cut / Delete selected piece (Shortcut: Delete, Backspace, or X)">
            ✂️ Cut Piece (Del)
          </button>
        </div>

        <div class="slider-label-line">
          <span>1. Pick a Part (or Tool) → 2. Click Any Peg:</span>
        </div>
        <div class="parts-palette-grid">
          ${SNAP_PART_CATALOG.map(
            (item) => `
            <button
              class="chip-btn compact ${st.selectedTool === item.type ? 'active' : ''}"
              data-tool="${item.type}"
              type="button"
            >
              <span>${item.icon}</span>
              <span>${item.label}</span>
            </button>`
          ).join('')}
          <button
            class="chip-btn compact ${st.selectedTool === 'select' ? 'active' : ''}"
            data-tool="select"
            type="button"
            title="Click any placed piece on the board to select & rotate it 90°"
          >
            <span>👆</span>
            <span>Select / Turn</span>
          </button>
          <button
            class="chip-btn compact danger-tool ${st.selectedTool === 'remove' ? 'active' : ''}"
            data-tool="remove"
            type="button"
            title="Click any placed piece on the board to cut/remove it"
          >
            <span>✂️</span>
            <span>Cut Mode</span>
          </button>
        </div>

        <div class="telemetry-grid">
          <div class="metric-box">
            <span class="metric-label">Parts on Board</span>
            <span class="metric-value">${st.placedParts.length} snapped</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Active Loads</span>
            <span class="metric-value" style="font-size:12px">${
              st.activeOutputs.length > 0 ? st.activeOutputs.join(', ') : 'None'
            }</span>
          </div>
        </div>

        <div class="btn-grid-2">
          <button id="btn-demo-circuit" class="chip-btn" type="button">📐 Example Loop</button>
          <button id="btn-clear-board" class="chip-btn" type="button">🧹 Clear Pegboard</button>
        </div>
      </div>
    `;

    box.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.selectTool(btn.dataset.tool);
        this.audio.playClick(760, 0.18);
        this._renderStationControls('electrical');
      });
    });

    box.querySelector('#btn-rotate-part')?.addEventListener('click', () => {
      st.rotateOrientation();
      this._renderStationControls('electrical');
    });

    box.querySelector('#btn-turn-placed')?.addEventListener('click', () => {
      if (st.rotatePlacedPart()) {
        this._renderStationControls('electrical');
      }
    });

    box.querySelector('#btn-cut-placed')?.addEventListener('click', () => {
      if (st.deleteSelectedOrHoveredPart()) {
        this._renderStationControls('electrical');
      }
    });

    box.querySelector('#btn-flip-switch')?.addEventListener('click', () => {
      if (!hasSwitch) {
        st.selectTool('switch');
        this.audio.playClick(640, 0.2);
      } else {
        st.toggleAllSwitches();
      }
      this._renderStationControls('electrical');
    });

    box.querySelector('#btn-demo-circuit')?.addEventListener('click', () => {
      st.loadStarterExample();
      this._renderStationControls('electrical');
    });

    box.querySelector('#btn-clear-board')?.addEventListener('click', () => {
      this.audio.playClick(480, 0.22);
      st.clearBoard();
      this._renderStationControls('electrical');
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

    // 2. Light Station Mode A Reflection Angle Readouts (4 Mirrors + 0° Straight-Back!)
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
      el.classList.toggle('retro', Boolean(ann.isStraightBack));
      el.textContent = ann.isStraightBack
        ? `M${ann.mirrorNumber}: θᵢ 0° = θᵣ 0° (Straight Back!)`
        : `M${ann.mirrorNumber}: θᵢ ${ann.angleDeg}° = θᵣ ${ann.angleDeg}°`;
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

    // Direct crisp hardware-antialiased render (no bloom blur, no fog haze!)
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.omniEnergyLab = new OmniEnergyLabApp();
});
