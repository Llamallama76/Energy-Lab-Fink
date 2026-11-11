import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProceduralTextures } from '../engine/ProceduralTextures.js';

export class SoundStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    // Default state
    this.mode = 'fork'; // 'fork' | 'speaker'
    this.forkSize = 0.55; // 0.0 (small/high pitch 780Hz) -> 1.0 (large/low pitch 220Hz)
    this.strikeForce = 0.75; // 0.1 -> 1.0
    this.ballContact = true; // whether ball stand is positioned touching prong
    this.forkVibration = 0; // current decaying amplitude
    this.malletAnim = 0;

    // Pendulum state (angle rad from vertical, + swings right away from prong)
    this.ballAngle = 0;
    this.ballVel = 0;
    this.maxKickDeg = 0;

    // Speaker state
    this.speakerVolume = 0.0; // 0 -> 1
    this.speakerFreq = 52; // Hz
    this.coneDisplacement = 0;
    this.particles = [];

    this.interactables = [];
    this._buildTuningForkApparatus();
    this._buildSpeakerApparatus();
    this._applyForkSize();
  }

  getFrequency() {
    // Smaller fork = higher frequency (220 Hz to 780 Hz)
    return Math.round(780 - this.forkSize * 560);
  }

  _buildTuningForkApparatus() {
    this.forkGroup = new THREE.Group();
    this.forkGroup.position.set(-0.72, 0, 0.05);
    this.root.add(this.forkGroup);

    const oak = ProceduralTextures.getWoodTexture('oak');
    const brushed = ProceduralTextures.getBrushedMetalBump();

    // Wooden Acoustic Resonance Sounding Box
    const woodMat = new THREE.MeshStandardMaterial({
      map: oak.map,
      bumpMap: oak.bumpMap,
      bumpScale: 0.008,
      roughness: 0.36,
      metalness: 0.05
    });
    const darkCavMat = new THREE.MeshBasicMaterial({ color: 0x06080c });

    const resBox = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.17, 0.24, 3, 0.012), woodMat);
    resBox.position.set(-0.14, 0.095, 0);
    resBox.castShadow = true;
    resBox.receiveShadow = true;
    this.forkGroup.add(resBox);

    // Rubber isolation feet under sounding box
    const footMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    [-0.3, 0.02].forEach((fx) => {
      [-0.08, 0.08].forEach((fz) => {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.014, 12), footMat);
        f.position.set(fx, 0.007, fz);
        this.forkGroup.add(f);
      });
    });

    // Hollow open chamber mouth on right side of resonance box
    const cavity = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), darkCavMat);
    cavity.rotation.y = Math.PI / 2;
    cavity.position.set(0.071, 0.095, 0);
    this.forkGroup.add(cavity);

    // Machined Chrome Tuning Fork assembly
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      bumpMap: brushed,
      bumpScale: 0.004,
      roughness: 0.14,
      metalness: 0.96
    });

    this.forkAssembly = new THREE.Group();
    this.forkAssembly.position.set(-0.14, 0.18, 0);
    this.forkGroup.add(this.forkAssembly);

    // Stem + Brass Mounting Collar
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.24,
      metalness: 0.88
    });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.028, 20), brassMat);
    collar.position.y = 0.014;
    this.forkAssembly.add(collar);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 16), steelMat);
    stem.position.y = 0.065;
    stem.castShadow = true;
    stem.userData.action = 'strikeFork';
    this.forkAssembly.add(stem);

    // U-bend base
    const uBend = new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.013, 14, 28, Math.PI),
      steelMat
    );
    uBend.rotation.z = Math.PI;
    uBend.position.y = 0.175;
    uBend.castShadow = true;
    uBend.userData.action = 'strikeFork';
    this.forkAssembly.add(uBend);

    // Left & Right Prongs (pivoted at base of U so they flex realistically!)
    this.prongLeftPivot = new THREE.Group();
    this.prongLeftPivot.position.set(-0.058, 0.175, 0);
    this.forkAssembly.add(this.prongLeftPivot);

    this.prongRightPivot = new THREE.Group();
    this.prongRightPivot.position.set(0.058, 0.175, 0);
    this.forkAssembly.add(this.prongRightPivot);

    const prongGeo = new RoundedBoxGeometry(0.022, 0.34, 0.026, 3, 0.005);
    this.prongLeftMesh = new THREE.Mesh(prongGeo, steelMat);
    this.prongLeftMesh.position.y = 0.17;
    this.prongLeftMesh.castShadow = true;
    this.prongLeftMesh.userData.action = 'strikeFork';
    this.prongLeftPivot.add(this.prongLeftMesh);

    this.prongRightMesh = new THREE.Mesh(prongGeo, steelMat);
    this.prongRightMesh.position.y = 0.17;
    this.prongRightMesh.castShadow = true;
    this.prongRightMesh.userData.action = 'strikeFork';
    this.prongRightPivot.add(this.prongRightMesh);

    // Rubber Striker Mallet mounted beside fork
    this.malletPivot = new THREE.Group();
    this.malletPivot.position.set(-0.38, 0.24, 0.06);
    this.forkGroup.add(this.malletPivot);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.24, 12), woodMat);
    handle.position.set(0.08, 0.09, 0);
    handle.rotation.z = -0.55;
    handle.userData.action = 'strikeFork';
    this.malletPivot.add(handle);

    const rubberHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.65, metalness: 0.08 })
    );
    rubberHead.position.set(0.145, 0.19, 0);
    rubberHead.userData.action = 'strikeFork';
    this.malletPivot.add(rubberHead);

    // Acoustic Sound Wave Rings (translucent cyan shock rings)
    this.waveRings = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.094, 40), mat);
      ring.position.set(-0.14, 0.48, 0);
      this.forkGroup.add(ring);
      this.waveRings.push({ mesh: ring, mat, phase: i * 0.33 });
    }

    // Lab Support Stand + Suspended Ping-Pong Ball Pendulum
    this.standGroup = new THREE.Group();
    this.standGroup.position.set(0.32, 0, 0);
    this.forkGroup.add(this.standGroup);

    const castIronMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.65
    });
    const standBase = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.026, 0.22, 3, 0.006), castIronMat);
    standBase.position.y = 0.013;
    standBase.castShadow = true;
    this.standGroup.add(standBase);

    const verticalRod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.72, 14), steelMat);
    verticalRod.position.set(0.08, 0.37, 0);
    verticalRod.castShadow = true;
    this.standGroup.add(verticalRod);

    const clampBoss = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.045, 0.045, 2, 0.006), brassMat);
    clampBoss.position.set(0.08, 0.69, 0);
    this.standGroup.add(clampBoss);

    // Horizontal overhang arm holding pendulum pivot directly above right prong's outer edge
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.48, 12), steelMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-0.14, 0.69, 0);
    this.standGroup.add(arm);

    this.pendulumPivot = new THREE.Group();
    // Right prong outer edge in forkGroup space is at x = -0.14 + 0.058 + 0.011 = -0.071.
    // Ping-pong ball radius = 0.026 -> ball center rests at x = -0.044 when touching!
    // Since standGroup is at x = 0.32, local x = -0.044 - 0.32 = -0.364.
    this.pendulumPivot.position.set(-0.363, 0.69, 0);
    this.standGroup.add(this.pendulumPivot);

    this.stringLen = 0.24;
    const thread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0018, this.stringLen, 8),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    );
    thread.position.y = -this.stringLen / 2;
    this.pendulumPivot.add(thread);

    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.34,
      metalness: 0.04
    });
    this.pingPongBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, 28, 28), ballMat);
    this.pingPongBall.position.y = -this.stringLen;
    this.pingPongBall.castShadow = true;
    this.pingPongBall.userData.action = 'toggleBallContact';

    // White seam stripe around ping-pong ball for visual spin/clarity
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.0262, 0.0016, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    seam.rotation.x = Math.PI / 2;
    this.pingPongBall.add(seam);
    this.pendulumPivot.add(this.pingPongBall);

    this.interactables.push(
      stem,
      uBend,
      this.prongLeftMesh,
      this.prongRightMesh,
      handle,
      rubberHead,
      this.pingPongBall
    );
  }

  _buildSpeakerApparatus() {
    this.speakerGroup = new THREE.Group();
    this.speakerGroup.position.set(0.76, 0, 0.04);
    this.root.add(this.speakerGroup);

    const brushed = ProceduralTextures.getBrushedMetalBump();
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x151d2a,
      roughness: 0.42,
      metalness: 0.35
    });
    const trimRingMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      bumpMap: brushed,
      bumpScale: 0.004,
      roughness: 0.22,
      metalness: 0.9
    });
    const rubberSurroundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.72,
      metalness: 0.08
    });
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.48,
      metalness: 0.28,
      side: THREE.DoubleSide
    });

    // Subwoofer cabinet box
    const cabinet = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.32, 0.72, 4, 0.022), cabinetMat);
    cabinet.position.y = 0.16;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.speakerGroup.add(cabinet);

    // Front volume indicator LED bar on cabinet
    this.speakerLedMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: new THREE.Color(0x22d3ee),
      emissiveIntensity: 0.25
    });
    const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.018, 0.012), this.speakerLedMat);
    ledStrip.position.set(0, 0.07, 0.362);
    this.speakerGroup.add(ledStrip);

    // Brushed aluminum basket flange
    const flange = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.026, 16, 48), trimRingMat);
    flange.rotation.x = Math.PI / 2;
    flange.position.y = 0.326;
    this.speakerGroup.add(flange);

    // Clear acrylic containment rim so bouncing sprinkles stay cleanly visible over the speaker!
    const acrylicWall = new THREE.Mesh(
      new THREE.CylinderGeometry(0.29, 0.29, 0.24, 48, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.22,
        roughness: 0.08,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
    );
    acrylicWall.position.y = 0.44;
    this.speakerGroup.add(acrylicWall);

    // Moving Speaker Diaphragm Assembly
    this.coneAssembly = new THREE.Group();
    this.coneAssembly.position.y = 0.31;
    this.speakerGroup.add(this.coneAssembly);

    const surround = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.028, 16, 48), rubberSurroundMat);
    surround.rotation.x = Math.PI / 2;
    surround.position.y = 0.01;
    this.coneAssembly.add(surround);

    // Inverted conical membrane (open top cylinder tapering down to center voice coil)
    const diaphragm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.245, 0.065, 0.095, 48, 1, true),
      coneMat
    );
    diaphragm.position.y = -0.036;
    diaphragm.userData.action = 'pulseSpeaker';
    this.coneAssembly.add(diaphragm);

    const dustCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.072, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
      rubberSurroundMat
    );
    dustCap.position.y = -0.082;
    dustCap.userData.action = 'pulseSpeaker';
    this.coneAssembly.add(dustCap);

    this.interactables.push(diaphragm, dustCap);

    // 56 Colorful 3D Polymer Sprinkle Beads inside the subwoofer cone
    const colors = [0x22d3ee, 0xf59e0b, 0x34d399, 0xf43f5e, 0xfacc15, 0x38bdf8];
    const beadGeo = new THREE.CapsuleGeometry(0.0085, 0.012, 6, 10);

    for (let i = 0; i < 56; i++) {
      const angle = Math.random() * Math.PI * 2;
      const rad = 0.025 + Math.sqrt(Math.random()) * 0.195;
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        roughness: 0.25,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(beadGeo, mat);
      mesh.castShadow = true;
      const px = Math.cos(angle) * rad;
      const pz = Math.sin(angle) * rad;
      const restY = this._getConeSurfaceY(rad, 0);
      mesh.position.set(px, restY, pz);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.speakerGroup.add(mesh);

      this.particles.push({
        mesh,
        x: px,
        z: pz,
        y: restY,
        vx: 0,
        vy: 0,
        vz: 0,
        spinX: (Math.random() - 0.5) * 8,
        spinZ: (Math.random() - 0.5) * 8
      });
    }
  }

  _getConeSurfaceY(r, coneOffset) {
    // Matches cone geometry inside speakerGroup coordinates
    const clampedR = Math.min(0.24, r);
    if (clampedR < 0.068) {
      return 0.255 + Math.sqrt(Math.max(0, 0.072 * 0.072 - clampedR * clampedR)) * 0.35 + coneOffset;
    }
    const t = (clampedR - 0.065) / (0.245 - 0.065);
    return 0.238 + t * 0.082 + coneOffset;
  }

  _applyForkSize() {
    // Prong height scales smoothly between 0.58x (high pitch) and 1.18x (low pitch)
    const scaleY = 0.58 + this.forkSize * 0.62;
    this.prongLeftPivot.scale.y = scaleY;
    this.prongRightPivot.scale.y = scaleY;

    // Keep suspended ping-pong ball aligned with upper third of right prong!
    const prongTipWorldHeight = 0.18 + 0.175 + 0.34 * scaleY * 0.78;
    const pivotY = prongTipWorldHeight + this.stringLen;
    this.pendulumPivot.position.y = pivotY;
    this.pendulumPivot.position.x = this.ballContact ? -0.363 : -0.255;
  }

  strikeFork() {
    this.malletAnim = 1.0;
    this.forkVibration = this.strikeForce;
    this.audio.playTuningFork(this.getFrequency(), this.strikeForce);
  }

  onPointerDown(hit) {
    const action = hit?.object?.userData?.action;
    if (action === 'strikeFork') {
      this.mode = 'fork';
      this.strikeFork();
      return true;
    }
    if (action === 'toggleBallContact') {
      this.ballContact = !this.ballContact;
      this._applyForkSize();
      this.audio.playClick(760, 0.2);
      return true;
    }
    if (action === 'pulseSpeaker') {
      this.mode = 'speaker';
      this.speakerVolume = this.speakerVolume > 0.15 ? 0 : 0.75;
      this.audio.updateSubwoofer(this.speakerVolume, this.speakerFreq);
      return true;
    }
    return false;
  }

  onPointerMove() {}
  onPointerUp() {}

  setActive(active) {
    this.isActive = active;
    if (!active) {
      this.audio.updateSubwoofer(0, this.speakerFreq);
    } else if (this.mode === 'speaker' && this.speakerVolume > 0.02) {
      this.audio.updateSubwoofer(this.speakerVolume, this.speakerFreq);
    }
  }

  reset() {
    this.forkSize = 0.55;
    this.strikeForce = 0.75;
    this.ballContact = true;
    this.forkVibration = 0;
    this.ballAngle = 0;
    this.ballVel = 0;
    this.maxKickDeg = 0;
    this.speakerVolume = 0;
    this.speakerFreq = 52;
    this.audio.updateSubwoofer(0, 52);
    this._applyForkSize();
    this.particles.forEach((p) => {
      const r = Math.hypot(p.x, p.z);
      p.y = this._getConeSurfaceY(r, 0);
      p.vx = p.vy = p.vz = 0;
      p.mesh.position.set(p.x, p.y, p.z);
    });
  }

  getCameraLocalPreset() {
    if (this.mode === 'speaker') {
      return {
        pos: new THREE.Vector3(0.76, 1.02, 1.48),
        target: new THREE.Vector3(0.76, 0.36, 0.04)
      };
    }
    return {
      pos: new THREE.Vector3(-0.62, 1.05, 1.52),
      target: new THREE.Vector3(-0.62, 0.42, 0.05)
    };
  }

  update(dt, elapsed) {
    // 1. Mallet strike swing animation
    if (this.malletAnim > 0) {
      this.malletAnim = Math.max(0, this.malletAnim - dt * 6.5);
      const swing = Math.sin(this.malletAnim * Math.PI) * 0.42;
      this.malletPivot.rotation.z = -swing;
    } else {
      this.malletPivot.rotation.z = 0;
    }

    // 2. Tuning fork oscillation + acoustic rings
    if (this.forkVibration > 0.002) {
      this.forkVibration *= Math.pow(0.42, dt);
      const visualFreq = 26 + (1 - this.forkSize) * 28;
      const flex = Math.sin(elapsed * visualFreq * Math.PI * 2) * 0.068 * this.forkVibration;
      this.prongLeftPivot.rotation.z = flex;
      this.prongRightPivot.rotation.z = -flex;

      this.waveRings.forEach((w) => {
        w.phase = (w.phase + dt * (1.2 + (1 - this.forkSize) * 0.9)) % 1;
        const s = 0.5 + w.phase * 3.8;
        w.mesh.scale.setScalar(s);
        w.mat.opacity = (1 - w.phase) * 0.45 * this.forkVibration;
      });
    } else {
      this.forkVibration = 0;
      this.prongLeftPivot.rotation.z = 0;
      this.prongRightPivot.rotation.z = 0;
      this.waveRings.forEach((w) => {
        w.mat.opacity = 0;
      });
    }

    // 3. Ping-Pong Ball Pendulum & Vibrating Prong Momentum Transfer
    const gOverL = 9.81 / this.stringLen;
    this.ballVel -= gOverL * Math.sin(this.ballAngle) * dt;
    this.ballVel *= Math.pow(0.32, dt); // air damping
    this.ballAngle += this.ballVel * dt;

    // Contact plane with right prong when ballContact is enabled
    if (this.ballContact && this.ballAngle <= 0.015) {
      if (this.forkVibration > 0.03) {
        // Violent acoustic kick proportional to fork amplitude (volume)!
        const kickImpulse = 2.6 + this.forkVibration * 6.8;
        this.ballAngle = 0.02;
        this.ballVel = Math.max(Math.abs(this.ballVel) * 0.5, kickImpulse);
        this.audio.playPingPongBounce(this.forkVibration);
      } else if (this.ballAngle < 0) {
        this.ballAngle = 0;
        this.ballVel = Math.abs(this.ballVel) * 0.45;
      }
    }

    this.ballAngle = Math.max(-0.6, Math.min(1.32, this.ballAngle));
    const deg = Math.round((Math.max(0, this.ballAngle) * 180) / Math.PI);
    if (deg > this.maxKickDeg) this.maxKickDeg = deg;
    this.pendulumPivot.rotation.z = this.ballAngle;

    // 4. Subwoofer Cone & Sprinkles Ballistic Physics
    if (this.speakerVolume > 0.01) {
      const omega = this.speakerFreq * 0.55; // slowed slightly for crisp 60fps visibility
      const maxStroke = this.speakerVolume * 0.034;
      const prevDisp = this.coneDisplacement;
      this.coneDisplacement = Math.sin(elapsed * omega) * maxStroke;
      const coneVel = (this.coneDisplacement - prevDisp) / Math.max(0.008, dt);
      this.coneAssembly.position.y = 0.31 + this.coneDisplacement;
      this.speakerLedMat.emissiveIntensity = 0.4 + this.speakerVolume * 1.8;

      for (const p of this.particles) {
        p.vy -= 9.81 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        // Cylindrical acrylic wall boundary
        const rad = Math.hypot(p.x, p.z);
        if (rad > 0.255) {
          const nx = p.x / rad;
          const nz = p.z / rad;
          p.x = nx * 0.255;
          p.z = nz * 0.255;
          const dot = p.vx * nx + p.vz * nz;
          p.vx -= 1.6 * dot * nx;
          p.vz -= 1.6 * dot * nz;
        }

        const floorY = this._getConeSurfaceY(Math.min(0.24, rad), this.coneDisplacement) + 0.009;
        if (p.y <= floorY) {
          p.y = floorY;
          const launchBoost = Math.max(0, coneVel) * (1.15 + Math.random() * 0.45) + this.speakerVolume * (0.85 + Math.random() * 1.45);
          p.vy = Math.max(Math.abs(p.vy) * 0.35, launchBoost);
          p.vx += (Math.random() - 0.5) * 0.55 * this.speakerVolume;
          p.vz += (Math.random() - 0.5) * 0.55 * this.speakerVolume;
        }
        p.vx *= 0.985;
        p.vz *= 0.985;

        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.x += p.spinX * dt * this.speakerVolume;
        p.mesh.rotation.z += p.spinZ * dt * this.speakerVolume;
      }
    } else {
      this.coneDisplacement *= 0.85;
      this.coneAssembly.position.y = 0.31 + this.coneDisplacement;
      this.speakerLedMat.emissiveIntensity = 0.2;
      for (const p of this.particles) {
        const rad = Math.hypot(p.x, p.z);
        const floorY = this._getConeSurfaceY(Math.min(0.24, rad), 0) + 0.009;
        if (p.y > floorY) {
          p.vy -= 9.81 * dt;
          p.y = Math.max(floorY, p.y + p.vy * dt);
          p.mesh.position.set(p.x, p.y, p.z);
        } else {
          p.vy = 0;
        }
      }
    }
  }
}
