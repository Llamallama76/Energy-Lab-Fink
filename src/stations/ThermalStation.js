import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProceduralTextures } from '../engine/ProceduralTextures.js';

export class ThermalStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    this.mode = 'chamber'; // 'chamber' | 'toaster'

    // Apparatus A: Molecular Motion Chamber state
    this.temperatureC = 22; // -30°C (Solid) -> +150°C (Gas)
    this.molecules = [];

    // Apparatus B: Kitchen Toaster state
    this.darknessSetting = 3; // 1 -> 5
    this.isToasting = false;
    this.toastTimer = 0;
    this.toastDuration = 5.5;
    this.toastLevel = 0; // 0 (fresh white bread) -> 1 (golden brown toast)
    this.carriageDrop = 0; // 0 (up) -> 1 (down inside slots)
    this.coilGlow = 0;
    this.popBounceVel = 0;
    this.steamParticles = [];

    this.interactables = [];

    this._buildMolecularChamber();
    this._buildKitchenToaster();
  }

  getTemperatureF() {
    return Math.round((this.temperatureC * 9) / 5 + 32);
  }

  getPhaseState() {
    if (this.temperatureC <= 0) return 'SOLID';
    if (this.temperatureC < 100) return 'LIQUID';
    return 'GAS';
  }

  // =========================================================================
  // APPARATUS A: MOLECULAR MOTION CHAMBER + BUNSEN / ICE + THERMOMETER
  // =========================================================================
  _buildMolecularChamber() {
    this.chamberGroup = new THREE.Group();
    this.chamberGroup.position.set(-0.68, 0, 0.04);
    this.root.add(this.chamberGroup);

    const brushed = ProceduralTextures.getBrushedMetalBump();
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      bumpMap: brushed,
      bumpScale: 0.004,
      roughness: 0.25,
      metalness: 0.88
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.78
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.28,
      metalness: 0.88
    });

    // Base plate & 4 Steel Tripod/Corner Legs elevating chamber at y = 0.24
    const basePlate = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.025, 0.62, 3, 0.008), darkMetalMat);
    basePlate.position.y = 0.0125;
    basePlate.receiveShadow = true;
    this.chamberGroup.add(basePlate);

    const standY = 0.24;
    const cubeSize = 0.48;
    this.cubeHalf = cubeSize / 2 - 0.028;

    [
      [-0.22, -0.22],
      [0.22, -0.22],
      [-0.22, 0.22],
      [0.22, 0.22]
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, standY, 14), steelMat);
      leg.position.set(lx, standY / 2, lz);
      leg.castShadow = true;
      this.chamberGroup.add(leg);
    });

    // Bottom thermal conduction plate & top cap frame
    const hotPlate = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.026, 0.52, 3, 0.006), darkMetalMat);
    hotPlate.position.y = standY;
    this.chamberGroup.add(hotPlate);

    const topFrame = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.026, 0.52, 3, 0.006), darkMetalMat);
    topFrame.position.y = standY + cubeSize + 0.016;
    this.chamberGroup.add(topFrame);

    // 4 Corner Stanchion Rods around glass cube
    [
      [-0.245, -0.245],
      [0.245, -0.245],
      [-0.245, 0.245],
      [0.245, 0.245]
    ].forEach(([cx, cz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, cubeSize, 12), steelMat);
      post.position.set(cx, standY + cubeSize / 2 + 0.008, cz);
      this.chamberGroup.add(post);
    });

    // Reinforced Clear Containment Glass Cube
    const glassCube = new THREE.Mesh(
      new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize),
      new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.24,
        roughness: 0.06,
        metalness: 0.05,
        ior: 1.5,
        depthWrite: false
      })
    );
    this.chamberCenterY = standY + cubeSize / 2 + 0.008;
    glassCube.position.y = this.chamberCenterY;
    this.chamberGroup.add(glassCube);

    // Brass Bunsen Burner underneath chamber
    const burnerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.022, 24), brassMat);
    burnerBase.position.y = 0.032;
    this.chamberGroup.add(burnerBase);

    const burnerTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.11, 18), brassMat);
    burnerTube.position.y = 0.095;
    this.chamberGroup.add(burnerTube);

    // Multi-layered Bunsen Flame (outer amber + inner cyan core)
    this.flameGroup = new THREE.Group();
    this.flameGroup.position.y = 0.155;
    this.chamberGroup.add(this.flameGroup);

    this.outerFlameMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.0
    });
    const outerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.11, 20), this.outerFlameMat);
    outerFlame.position.y = 0.045;
    this.flameGroup.add(outerFlame);

    this.innerFlameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0
    });
    const innerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 16), this.innerFlameMat);
    innerFlame.position.y = 0.028;
    this.flameGroup.add(innerFlame);

    this.burnerLight = new THREE.PointLight(0xf97316, 0, 1.2);
    this.burnerLight.position.set(0, 0.2, 0);
    this.chamberGroup.add(this.burnerLight);

    // Cryo Ice Block (visible when cooling below 15°C)
    this.iceBlockMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0,
      roughness: 0.18,
      transmission: 0.65
    });
    this.iceBlockMesh = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.11, 0.28, 3, 0.018), this.iceBlockMat);
    this.iceBlockMesh.position.set(0, 0.165, 0);
    this.chamberGroup.add(this.iceBlockMesh);

    // 3D Vertical Glass Thermometer mounted on right stanchion (x = 0.34)
    const thermoGroup = new THREE.Group();
    thermoGroup.position.set(0.35, standY + 0.02, 0.12);
    this.chamberGroup.add(thermoGroup);

    const thermoBacking = new THREE.Mesh(
      new RoundedBoxGeometry(0.075, 0.52, 0.018, 2, 0.006),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
    );
    thermoBacking.position.y = 0.24;
    thermoGroup.add(thermoBacking);

    // Graduation ticks on thermometer backing
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    for (let t = 0; t <= 10; t++) {
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(t % 5 === 0 ? 0.032 : 0.018, 0.004, 0.004),
        tickMat
      );
      tick.position.set(-0.016, 0.06 + t * 0.038, 0.01);
      thermoGroup.add(tick);
    }

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: new THREE.Color(0xdc2626),
      emissiveIntensity: 0.55,
      roughness: 0.2
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 20), redMat);
    bulb.position.set(0.01, 0.03, 0.014);
    thermoGroup.add(bulb);

    this.thermoColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 14), redMat);
    this.thermoColumn.position.set(0.01, 0.05, 0.014);
    thermoGroup.add(this.thermoColumn);

    // 64 Glossy 3D Molecular Spheres (4 x 4 x 4 lattice)
    const sphereGeo = new THREE.SphereGeometry(0.021, 18, 18);
    this.moleculeContainer = new THREE.Group();
    this.moleculeContainer.position.y = this.chamberCenterY;
    this.chamberGroup.add(this.moleculeContainer);

    let idx = 0;
    for (let ix = 0; ix < 4; ix++) {
      for (let iy = 0; iy < 4; iy++) {
        for (let iz = 0; iz < 4; iz++) {
          const lx = (ix - 1.5) * 0.056;
          const ly = -this.cubeHalf + 0.038 + iy * 0.052;
          const lz = (iz - 1.5) * 0.056;

          const mat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            roughness: 0.2,
            metalness: 0.25
          });
          const mesh = new THREE.Mesh(sphereGeo, mat);
          mesh.position.set(lx, ly, lz);
          this.moleculeContainer.add(mesh);

          const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          this.molecules.push({
            mesh,
            mat,
            latticePos: new THREE.Vector3(lx, ly, lz),
            pos: new THREE.Vector3(lx, ly, lz),
            vel: dir.multiplyScalar(0.35),
            phase: idx * 0.73
          });
          idx++;
        }
      }
    }
  }

  // =========================================================================
  // APPARATUS B: MIRROR-CHROME KITCHEN TOASTER DEMO
  // =========================================================================
  _buildKitchenToaster() {
    this.toasterGroup = new THREE.Group();
    this.toasterGroup.position.set(0.68, 0, 0.05);
    this.root.add(this.toasterGroup);

    const brushed = ProceduralTextures.getBrushedMetalBump();
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      bumpMap: brushed,
      bumpScale: 0.002,
      roughness: 0.09,
      metalness: 0.96
    });
    const bakeliteMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.55,
      metalness: 0.12
    });

    // Bakelite heat-insulated base plinth & feet
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.04, 0.36, 4, 0.012), bakeliteMat);
    base.position.y = 0.022;
    base.castShadow = true;
    this.toasterGroup.add(base);

    // Mirror-Chrome Toaster Outer Shell (constructed around open top 2 bread slots so you can peer right inside at the glowing coils!)
    // Left wall, Center divider, Right wall, Front wall, Back wall
    const h = 0.31;
    const cy = 0.04 + h / 2;

    const frontWall = new THREE.Mesh(new RoundedBoxGeometry(0.54, h, 0.045, 4, 0.015), chromeMat);
    frontWall.position.set(0, cy, 0.155);
    frontWall.castShadow = true;
    this.toasterGroup.add(frontWall);

    const backWall = new THREE.Mesh(new RoundedBoxGeometry(0.54, h, 0.045, 4, 0.015), chromeMat);
    backWall.position.set(0, cy, -0.155);
    backWall.castShadow = true;
    this.toasterGroup.add(backWall);

    const leftWall = new THREE.Mesh(new RoundedBoxGeometry(0.075, h, 0.34, 4, 0.015), chromeMat);
    leftWall.position.set(-0.232, cy, 0);
    leftWall.castShadow = true;
    this.toasterGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new RoundedBoxGeometry(0.075, h, 0.34, 4, 0.015), chromeMat);
    rightWall.position.set(0.232, cy, 0);
    rightWall.castShadow = true;
    this.toasterGroup.add(rightWall);

    const centerDivider = new THREE.Mesh(new RoundedBoxGeometry(0.055, h - 0.01, 0.29, 3, 0.01), chromeMat);
    centerDivider.position.set(0, cy - 0.005, 0);
    this.toasterGroup.add(centerDivider);

    // Internal Nichrome Heating Coils (4 glowing grids lining both bread slots!)
    this.coilMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: new THREE.Color(0xff4500),
      emissiveIntensity: 0.0,
      roughness: 0.4,
      metalness: 0.7
    });

    [-0.185, -0.036, 0.036, 0.185].forEach((wx) => {
      for (let ry = 0.09; ry <= 0.31; ry += 0.042) {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.24, 8), this.coilMat);
        wire.rotation.x = Math.PI / 2;
        wire.position.set(wx, ry, 0);
        this.toasterGroup.add(wire);
      }
    });

    this.toasterSlotLight = new THREE.PointLight(0xff5500, 0, 0.9);
    this.toasterSlotLight.position.set(0, 0.32, 0);
    this.toasterGroup.add(this.toasterSlotLight);

    // Vertical lever guide slot on right end (+X) & Interactive Push-Down Lever
    const slotTrack = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.19, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x030712 })
    );
    slotTrack.position.set(0.271, 0.21, 0);
    this.toasterGroup.add(slotTrack);

    this.leverGroup = new THREE.Group();
    this.leverGroup.position.set(0.295, 0.29, 0);
    this.toasterGroup.add(this.leverGroup);

    const leverStem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.022), chromeMat);
    leverStem.userData = { action: 'pressToasterLever' };
    this.leverGroup.add(leverStem);

    const leverKnob = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.032, 0.068, 3, 0.01), bakeliteMat);
    leverKnob.position.x = 0.032;
    leverKnob.userData = { action: 'pressToasterLever' };
    this.leverGroup.add(leverKnob);

    // Darkness Dial on Front Chrome Face
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.024, 24), bakeliteMat);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 0.11, 0.182);
    this.toasterGroup.add(dial);

    // Dynamic Bread Texture & Two 3D Sandwich Bread Slices on Spring Carriage
    this.breadDynamic = ProceduralTextures.createDynamicBreadTexture();
    const crumbMat = new THREE.MeshStandardMaterial({
      map: this.breadDynamic.texture,
      roughness: 0.85,
      metalness: 0.0
    });
    this.crustMat = new THREE.MeshStandardMaterial({
      color: 0xb4692c,
      roughness: 0.78,
      metalness: 0.0
    });

    this.breadCarriage = new THREE.Group();
    this.breadCarriage.position.y = 0.34;
    this.toasterGroup.add(this.breadCarriage);

    [-0.11, 0.11].forEach((bx) => {
      const slice = this._createBreadSlice(crumbMat, this.crustMat);
      slice.position.set(bx, 0, 0);
      slice.userData = { action: 'pressToasterLever' };
      this.breadCarriage.add(slice);
      this.interactables.push(...slice.children);
    });

    this.interactables.push(leverStem, leverKnob);

    // Rising Thermal Steam / Heat Wisps above slots
    const wispGeo = new THREE.SphereGeometry(0.018, 10, 10);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfef3c7,
        transparent: true,
        opacity: 0
      });
      const mesh = new THREE.Mesh(wispGeo, mat);
      this.toasterGroup.add(mesh);
      this.steamParticles.push({
        mesh,
        mat,
        phase: i / 14,
        slotX: i % 2 === 0 ? -0.11 : 0.11,
        zOff: (Math.random() - 0.5) * 0.16
      });
    }
  }

  _createBreadSlice(crumbMat, crustMat) {
    const g = new THREE.Group();
    // Main rectangular slice body + rounded top loaf crown
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.032, 0.18, 0.21, 3, 0.008), [
      crumbMat, // +x face
      crumbMat, // -x face
      crustMat, // top
      crustMat, // bottom
      crustMat, // front
      crustMat  // back
    ]);
    body.castShadow = true;
    g.add(body);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.031, 24, 1, false, 0, Math.PI), [
      crustMat,
      crumbMat,
      crumbMat
    ]);
    crown.rotation.z = Math.PI / 2;
    crown.rotation.y = Math.PI / 2;
    crown.position.y = 0.088;
    crown.scale.set(1, 1, 0.36);
    g.add(crown);

    return g;
  }

  pushToasterLever() {
    if (this.isToasting) return;
    // If already fully toasted, start a fresh batch of bread so student can observe change repeatedly!
    if (this.toastLevel > 0.75) {
      this.toastLevel = 0;
      this.breadDynamic.updateToast(0);
      this.crustMat.color.setHex(0xb4692c);
    }
    this.isToasting = true;
    this.toastTimer = 0;
    this.toastDuration = 2.8 + this.darknessSetting * 0.9;
    this.audio.playClick(520, 0.35);
  }

  onPointerDown(hit) {
    const act = hit?.object?.userData?.action;
    if (act === 'pressToasterLever') {
      this.mode = 'toaster';
      this.pushToasterLever();
      return true;
    }
    return false;
  }

  onPointerMove() {}
  onPointerUp() {}

  setActive(active) {
    this.isActive = active;
    if (!active) {
      this.audio.updateBunsenHiss(0);
    }
  }

  reset() {
    this.temperatureC = 22;
    this.darknessSetting = 3;
    this.isToasting = false;
    this.toastTimer = 0;
    this.toastLevel = 0;
    this.carriageDrop = 0;
    this.coilGlow = 0;
    this.popBounceVel = 0;
    this.breadDynamic.updateToast(0);
    this.crustMat.color.setHex(0xb4692c);
    this.audio.updateBunsenHiss(0);

    this.molecules.forEach((m) => {
      m.pos.copy(m.latticePos);
      m.mesh.position.copy(m.latticePos);
    });
  }

  getCameraLocalPreset() {
    if (this.mode === 'toaster') {
      return {
        pos: new THREE.Vector3(0.68, 0.96, 1.32),
        target: new THREE.Vector3(0.68, 0.28, 0.05)
      };
    }
    return {
      pos: new THREE.Vector3(-0.62, 0.98, 1.42),
      target: new THREE.Vector3(-0.62, 0.44, 0.04)
    };
  }

  update(dt, elapsed) {
    // 1. Update Thermometer, Bunsen Flame & Cryo Ice Block
    const tempNorm = (this.temperatureC + 30) / 180; // 0 at -30C, 1 at +150C
    const colH = Math.max(0.03, 0.03 + tempNorm * 0.38);
    this.thermoColumn.scale.y = colH;
    this.thermoColumn.position.y = 0.035 + colH / 2;

    if (this.temperatureC > 32) {
      const heat = Math.min(1, (this.temperatureC - 32) / 118);
      const flicker = 0.92 + Math.sin(elapsed * 29) * 0.08;
      this.outerFlameMat.opacity = (0.45 + heat * 0.45) * flicker;
      this.innerFlameMat.opacity = (0.55 + heat * 0.4) * flicker;
      this.flameGroup.scale.set(0.85 + heat * 0.35, (0.7 + heat * 0.75) * flicker, 0.85 + heat * 0.35);
      this.burnerLight.intensity = heat * 1.6 * flicker;
      this.iceBlockMat.opacity = 0;
      if (this.isActive && this.mode === 'chamber') {
        this.audio.updateBunsenHiss(heat);
      } else {
        this.audio.updateBunsenHiss(0);
      }
    } else {
      this.outerFlameMat.opacity = 0;
      this.innerFlameMat.opacity = 0;
      this.burnerLight.intensity = 0;
      this.audio.updateBunsenHiss(0);
      const cold = Math.max(0, (18 - this.temperatureC) / 48);
      this.iceBlockMat.opacity = cold * 0.82;
    }

    // 2. Update 64 3D Molecules (Solid Lattice -> Sliding Liquid -> Colliding Gas)
    const phase = this.getPhaseState();
    const b = this.cubeHalf;
    const molColor = new THREE.Color().setHSL(0.56 - tempNorm * 0.52, 0.88, 0.56);

    if (phase === 'SOLID') {
      // Tight lattice vibrating in place; amplitude grows slightly as it nears 0°C
      const vibAmp = 0.002 + Math.max(0, (this.temperatureC + 30) / 30) * 0.007;
      for (const m of this.molecules) {
        m.pos.x = m.latticePos.x + Math.sin(elapsed * 28 + m.phase) * vibAmp;
        m.pos.y = m.latticePos.y + Math.cos(elapsed * 31 + m.phase * 1.3) * vibAmp;
        m.pos.z = m.latticePos.z + Math.sin(elapsed * 25 + m.phase * 0.7) * vibAmp;
        m.mesh.position.copy(m.pos);
        m.mat.color.copy(molColor);
      }
    } else if (phase === 'LIQUID') {
      // Liquid pool in lower 42% of cube, sliding past each other with soft repulsion
      const liqNorm = this.temperatureC / 100;
      const speed = 0.18 + liqNorm * 0.48;
      const topLimit = -b + 0.17 + liqNorm * 0.05;

      for (let i = 0; i < this.molecules.length; i++) {
        const m = this.molecules[i];
        m.vel.y -= 1.8 * dt;
        m.vel.x += (Math.random() - 0.5) * speed * 4 * dt;
        m.vel.z += (Math.random() - 0.5) * speed * 4 * dt;
        m.vel.y += (Math.random() - 0.46) * speed * 3 * dt;

        // Soft neighbor separation so molecules don't clump
        for (let j = i + 1; j < this.molecules.length; j++) {
          const n = this.molecules[j];
          const dx = m.pos.x - n.pos.x;
          const dy = m.pos.y - n.pos.y;
          const dz = m.pos.z - n.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.0021 && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (0.046 - d) * 14 * dt;
            m.vel.x += (dx / d) * push;
            m.vel.y += (dy / d) * push;
            m.vel.z += (dz / d) * push;
            n.vel.x -= (dx / d) * push;
            n.vel.y -= (dy / d) * push;
            n.vel.z -= (dz / d) * push;
          }
        }

        m.vel.clampLength(0.05, speed);
        m.pos.addScaledVector(m.vel, dt);

        if (m.pos.x < -b) { m.pos.x = -b; m.vel.x = Math.abs(m.vel.x); }
        if (m.pos.x > b) { m.pos.x = b; m.vel.x = -Math.abs(m.vel.x); }
        if (m.pos.z < -b) { m.pos.z = -b; m.vel.z = Math.abs(m.vel.z); }
        if (m.pos.z > b) { m.pos.z = b; m.vel.z = -Math.abs(m.vel.z); }
        if (m.pos.y < -b) { m.pos.y = -b; m.vel.y = Math.abs(m.vel.y) * 0.7; }
        if (m.pos.y > topLimit) { m.pos.y = topLimit; m.vel.y = -Math.abs(m.vel.y) * 0.6; }

        m.mesh.position.copy(m.pos);
        m.mat.color.copy(molColor);
      }
    } else {
      // GAS: Rapid elastic collisions filling the entire sealed cube!
      const gasSpeed = 0.95 + ((this.temperatureC - 100) / 50) * 1.25;
      for (const m of this.molecules) {
        if (m.vel.lengthSq() < 0.01) {
          m.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5);
        }
        m.vel.normalize().multiplyScalar(gasSpeed);
        m.pos.addScaledVector(m.vel, dt);

        if (m.pos.x < -b) { m.pos.x = -b; m.vel.x = Math.abs(m.vel.x); }
        if (m.pos.x > b) { m.pos.x = b; m.vel.x = -Math.abs(m.vel.x); }
        if (m.pos.y < -b) { m.pos.y = -b; m.vel.y = Math.abs(m.vel.y); }
        if (m.pos.y > b) { m.pos.y = b; m.vel.y = -Math.abs(m.vel.y); }
        if (m.pos.z < -b) { m.pos.z = -b; m.vel.z = Math.abs(m.vel.z); }
        if (m.pos.z > b) { m.pos.z = b; m.vel.z = -Math.abs(m.vel.z); }

        m.mesh.position.copy(m.pos);
        m.mat.color.copy(molColor);
      }
    }

    // 3. Update Kitchen Toaster Demo
    if (this.isToasting) {
      this.carriageDrop = Math.min(1, this.carriageDrop + dt * 5.5);
      this.coilGlow = Math.min(1, this.coilGlow + dt * 1.4);
      this.toastTimer += dt;

      const targetBrown = Math.min(1, this.darknessSetting * 0.2);
      const progress = Math.min(1, this.toastTimer / this.toastDuration);
      this.toastLevel = Math.max(this.toastLevel, progress * targetBrown);
      this.breadDynamic.updateToast(this.toastLevel);
      this.crustMat.color.lerpColors(
        new THREE.Color(0xb4692c),
        new THREE.Color(0x4a2208),
        this.toastLevel
      );

      if (this.toastTimer >= this.toastDuration) {
        this.isToasting = false;
        this.popBounceVel = 2.4;
        this.audio.playToasterPop();
      }
    } else {
      if (this.carriageDrop > 0 || this.popBounceVel !== 0) {
        this.carriageDrop = Math.max(0, this.carriageDrop - dt * 8.5 - this.popBounceVel * dt);
        this.popBounceVel *= 0.85;
        if (this.carriageDrop === 0) this.popBounceVel = 0;
      }
      this.coilGlow = Math.max(0, this.coilGlow - dt * 1.8);
    }

    this.leverGroup.position.y = 0.29 - this.carriageDrop * 0.14;
    this.breadCarriage.position.y = 0.34 - this.carriageDrop * 0.125;
    this.coilMat.emissiveIntensity = this.coilGlow * 2.8;
    this.toasterSlotLight.intensity = this.coilGlow * 2.2;

    // Rising thermal steam wisps when hot
    for (const s of this.steamParticles) {
      if (this.coilGlow > 0.15) {
        s.phase = (s.phase + dt * 0.55) % 1;
        s.mesh.position.set(
          s.slotX + Math.sin(elapsed * 4 + s.phase * 6) * 0.018,
          0.34 + s.phase * 0.28,
          s.zOff
        );
        s.mesh.scale.setScalar(0.6 + s.phase * 1.4);
        s.mat.opacity = (1 - s.phase) * 0.26 * this.coilGlow;
      } else {
        s.mat.opacity = 0;
      }
    }
  }
}
