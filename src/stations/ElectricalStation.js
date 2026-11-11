import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProceduralTextures } from '../engine/ProceduralTextures.js';

export class ElectricalStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    /**
     * Interactive Circuit Loop Topology:
     * - Power Bay (Left): 9V Battery
     * - Bottom Track: Knife Switch + Removable Snap Wire 1
     * - Top & Right Output Bays:
     *    slotBulb   -> 'bulb' | 'wire' | null
     *    slotBuzzer -> 'buzzer' | 'wire' | null
     *    slotMotor  -> 'motor' | 'wire' | null
     * - Connecting Snap Wires: wireLeft, wireTopRight, wireBottomRight (true = snapped in, false = in tray!)
     */
    this.switchClosed = false;
    this.wiresInstalled = [true, true, true]; // 3 magnetic snap-wire segments
    this.bays = {
      bulb: true,   // Light Bulb installed on circuit track (false = sitting in Component Tray)
      buzzer: true, // Electric Buzzer installed
      motor: true   // DC Motor + Propeller installed
    };

    this.circuitClosed = false;
    this.openReason = 'Knife Switch is OPEN';
    this.propellerSpeed = 0;
    this.electrons = [];

    // 3D Drag-and-Drop state
    this.draggingItem = null; // { kind: 'device' | 'wire', key, mesh, homeTrayPos, slotPos }
    this.interactables = [];

    this._buildWoodenCircuitBench();
    this._evaluateCircuit();
  }

  _buildWoodenCircuitBench() {
    const walnut = ProceduralTextures.getWoodTexture('walnut');
    const maple = ProceduralTextures.getWoodTexture('maple');
    const brushed = ProceduralTextures.getBrushedMetalBump();

    const woodBoardMat = new THREE.MeshStandardMaterial({
      map: walnut.map,
      bumpMap: walnut.bumpMap,
      bumpScale: 0.008,
      roughness: 0.38,
      metalness: 0.04
    });
    const trayWoodMat = new THREE.MeshStandardMaterial({
      map: maple.map,
      bumpMap: maple.bumpMap,
      bumpScale: 0.007,
      roughness: 0.42,
      metalness: 0.04
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.22,
      metalness: 0.92
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.24,
      metalness: 0.9
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      bumpMap: brushed,
      bumpScale: 0.004,
      roughness: 0.22,
      metalness: 0.92
    });
    const darkInsulatorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.15
    });

    // 1. Main Wooden Circuit Test Board (Right/Center) + Component Tray (Left)
    const board = new THREE.Mesh(new RoundedBoxGeometry(2.14, 0.036, 1.38, 4, 0.012), woodBoardMat);
    board.position.set(0.38, 0.018, 0);
    board.receiveShadow = true;
    this.root.add(board);

    const tray = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.042, 1.38, 4, 0.012), trayWoodMat);
    tray.position.set(-1.14, 0.021, 0);
    tray.receiveShadow = true;
    this.root.add(tray);

    // Recessed magnetic track groove rectangle on wooden board:
    // Loop rectangle corners in root coords: x ∈ [-0.42, +1.18], z ∈ [-0.46, +0.46]
    const loopMinX = -0.42;
    const loopMaxX = 1.18;
    const loopMinZ = -0.46;
    const loopMaxZ = 0.46;
    const trackY = 0.042;

    const grooveMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.55
    });

    // Recessed track channels
    const horizLen = loopMaxX - loopMinX;
    const vertLen = loopMaxZ - loopMinZ;
    [loopMinZ, loopMaxZ].forEach((z) => {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(horizLen + 0.06, 0.01, 0.055), grooveMat);
      ch.position.set((loopMinX + loopMaxX) / 2, 0.038, z);
      this.root.add(ch);
    });
    [loopMinX, loopMaxX].forEach((x) => {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.01, vertLen + 0.06), grooveMat);
      ch.position.set(x, 0.038, (loopMinZ + loopMaxZ) / 2);
      this.root.add(ch);
    });

    // Brass Binding Posts around the loop
    const postCoords = [
      [loopMinX, loopMinZ],
      [0.02, loopMinZ],
      [0.34, loopMinZ],
      [0.74, loopMinZ],
      [loopMaxX, loopMinZ],
      [loopMaxX, -0.14],
      [loopMaxX, 0.18],
      [loopMaxX, loopMaxZ],
      [0.62, loopMaxZ],
      [0.12, loopMaxZ],
      [-0.12, loopMaxZ],
      [loopMinX, loopMaxZ]
    ];
    postCoords.forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.038, 16), brassMat);
      post.position.set(px, 0.055, pz);
      this.root.add(post);
    });

    // Fixed Copper Conductive Rails connecting between binding posts
    const addFixedCopperBar = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.022), copperMat);
      bar.position.set((x1 + x2) / 2, 0.046, (z1 + z2) / 2);
      bar.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      this.root.add(bar);
    };
    addFixedCopperBar(loopMinX, loopMinZ, -0.02, loopMinZ);
    addFixedCopperBar(0.34, loopMinZ, 0.72, loopMinZ);
    addFixedCopperBar(loopMaxX, loopMinZ, loopMaxX, -0.16);
    addFixedCopperBar(loopMaxX, 0.18, loopMaxX, loopMaxZ);
    addFixedCopperBar(loopMaxX, loopMaxZ, 0.64, loopMaxZ);
    addFixedCopperBar(loopMinX, loopMaxZ, loopMinX, 0.22);
    addFixedCopperBar(loopMinX, -0.22, loopMinX, loopMinZ);

    // --- 2. 9V Alkaline Battery on Left Track (x = -0.42, z = 0) ---
    const batGroup = new THREE.Group();
    batGroup.position.set(loopMinX, 0.04, 0);
    this.root.add(batGroup);

    const batBody = new THREE.Mesh(
      new RoundedBoxGeometry(0.15, 0.11, 0.25, 3, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.6 })
    );
    batBody.position.y = 0.055;
    batBody.castShadow = true;
    batGroup.add(batBody);

    const batCopperTop = new THREE.Mesh(
      new RoundedBoxGeometry(0.148, 0.108, 0.11, 3, 0.012),
      copperMat
    );
    batCopperTop.position.set(0, 0.056, -0.09);
    batGroup.add(batCopperTop);

    // + and - Snap Terminals
    [-0.17, 0.17].forEach((tz) => {
      const term = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.03, 16), steelMat);
      term.rotation.x = Math.PI / 2;
      term.position.set(0, 0.056, tz);
      batGroup.add(term);
    });

    // --- 3. Interactive Copper Knife Switch on Front Track (x = 0.38, z = +0.46) ---
    const switchGroup = new THREE.Group();
    switchGroup.position.set(0.38, 0.04, loopMaxZ);
    this.root.add(switchGroup);

    const switchBase = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.025, 0.13, 2, 0.006), darkInsulatorMat);
    switchBase.position.y = 0.0125;
    switchBase.userData = { action: 'toggleSwitch' };
    switchGroup.add(switchBase);

    const hingePost = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.065, 0.032), brassMat);
    hingePost.position.set(0.11, 0.045, 0);
    hingePost.userData = { action: 'toggleSwitch' };
    switchGroup.add(hingePost);

    const jawClip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.058, 0.038), brassMat);
    jawClip.position.set(-0.11, 0.042, 0);
    jawClip.userData = { action: 'toggleSwitch' };
    switchGroup.add(jawClip);

    this.knifeBladePivot = new THREE.Group();
    this.knifeBladePivot.position.set(0.11, 0.065, 0);
    switchGroup.add(this.knifeBladePivot);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.02), copperMat);
    blade.position.set(-0.11, 0, 0);
    blade.castShadow = true;
    blade.userData = { action: 'toggleSwitch' };
    this.knifeBladePivot.add(blade);

    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.028, 0.036, 3, 0.008), darkInsulatorMat);
    grip.position.set(-0.24, 0.012, 0);
    grip.userData = { action: 'toggleSwitch' };
    this.knifeBladePivot.add(grip);

    this.interactables.push(switchBase, hingePost, jawClip, blade, grip);

    // --- 4. Three Drag-and-Drop Snap Connecting Wires ---
    this.wireObjects = [];
    const wireSpecs = [
      {
        idx: 0,
        label: 'Snap Wire A',
        slotPos: new THREE.Vector3(-0.02, 0.06, loopMaxZ),
        trayPos: new THREE.Vector3(-1.14, 0.06, 0.44),
        len: 0.34,
        rotY: 0,
        color: 0x06b6d4
      },
      {
        idx: 1,
        label: 'Snap Wire B',
        slotPos: new THREE.Vector3(-0.28, 0.06, loopMaxZ),
        trayPos: new THREE.Vector3(-1.14, 0.06, 0.28),
        len: 0.24,
        rotY: 0,
        color: 0x06b6d4
      },
      {
        idx: 2,
        label: 'Snap Wire C',
        slotPos: new THREE.Vector3(0.96, 0.06, loopMinZ),
        trayPos: new THREE.Vector3(-1.14, 0.06, 0.12),
        len: 0.36,
        rotY: 0,
        color: 0x06b6d4
      }
    ];

    wireSpecs.forEach((ws) => {
      const g = new THREE.Group();
      const jacket = new THREE.Mesh(
        new RoundedBoxGeometry(ws.len, 0.028, 0.044, 3, 0.01),
        new THREE.MeshStandardMaterial({ color: ws.color, roughness: 0.32, metalness: 0.2 })
      );
      jacket.castShadow = true;
      jacket.userData = { dragKind: 'wire', wireIdx: ws.idx };
      g.add(jacket);

      [-ws.len / 2 + 0.02, ws.len / 2 - 0.02].forEach((cx) => {
        const snapCap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.034, 14), copperMat);
        snapCap.position.x = cx;
        snapCap.userData = { dragKind: 'wire', wireIdx: ws.idx };
        g.add(snapCap);
        this.interactables.push(snapCap);
      });

      this.interactables.push(jacket);
      g.position.copy(ws.slotPos);
      this.root.add(g);
      this.wireObjects.push({ group: g, spec: ws });
    });

    // --- 5. Three Energy Output Devices (Light Bulb, Electric Buzzer, DC Motor Propeller) ---
    // Each can be dragged between the circuit track and the Component Tray!
    this.deviceObjects = {};

    // (A) Incandescent Light Bulb (Light + Thermal Energy) at (0.18, 0.04, -0.46)
    const bulbGroup = new THREE.Group();
    const bulbBase = new THREE.Mesh(
      new RoundedBoxGeometry(0.28, 0.03, 0.14, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    bulbBase.position.y = 0.015;
    bulbBase.userData = { dragKind: 'device', devKey: 'bulb' };
    bulbGroup.add(bulbBase);

    const screwSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.055, 20), brassMat);
    screwSocket.position.y = 0.055;
    screwSocket.userData = { dragKind: 'device', devKey: 'bulb' };
    bulbGroup.add(screwSocket);

    this.filamentMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      emissive: new THREE.Color(0xfef08a),
      emissiveIntensity: 0,
      roughness: 0.3
    });
    const filament = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 10, 24, Math.PI * 1.3), this.filamentMat);
    filament.position.y = 0.135;
    bulbGroup.add(filament);

    this.bulbGlobeMat = new THREE.MeshPhysicalMaterial({
      color: 0xfefce8,
      emissive: new THREE.Color(0xfacc15),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.38,
      roughness: 0.05,
      ior: 1.5
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.068, 28, 28), this.bulbGlobeMat);
    globe.position.y = 0.145;
    globe.userData = { dragKind: 'device', devKey: 'bulb' };
    bulbGroup.add(globe);

    this.bulbPointLight = new THREE.PointLight(0xfde047, 0, 1.8);
    this.bulbPointLight.position.y = 0.18;
    bulbGroup.add(this.bulbPointLight);

    this.interactables.push(bulbBase, screwSocket, globe);
    this.root.add(bulbGroup);
    this.deviceObjects.bulb = {
      group: bulbGroup,
      slotPos: new THREE.Vector3(0.18, 0.04, loopMinZ),
      trayPos: new THREE.Vector3(-1.14, 0.042, -0.44)
    };

    // (B) Piezo / Electromagnetic Buzzer (Sound Energy) at (0.54, 0.04, -0.46)
    const buzzerGroup = new THREE.Group();
    const buzPlate = new THREE.Mesh(
      new RoundedBoxGeometry(0.26, 0.028, 0.14, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 })
    );
    buzPlate.position.y = 0.014;
    buzPlate.userData = { dragKind: 'device', devKey: 'buzzer' };
    buzzerGroup.add(buzPlate);

    const buzCan = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.075, 24), darkInsulatorMat);
    buzCan.position.y = 0.062;
    buzCan.castShadow = true;
    buzCan.userData = { dragKind: 'device', devKey: 'buzzer' };
    buzzerGroup.add(buzCan);

    this.buzzerDiaphragm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 20), steelMat);
    this.buzzerDiaphragm.position.y = 0.102;
    this.buzzerDiaphragm.userData = { dragKind: 'device', devKey: 'buzzer' };
    buzzerGroup.add(this.buzzerDiaphragm);

    this.buzzerWaveMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    this.buzzerWaveRing = new THREE.Mesh(new THREE.RingGeometry(0.065, 0.08, 32), this.buzzerWaveMat);
    this.buzzerWaveRing.rotation.x = -Math.PI / 2;
    this.buzzerWaveRing.position.y = 0.12;
    buzzerGroup.add(this.buzzerWaveRing);

    this.interactables.push(buzPlate, buzCan, this.buzzerDiaphragm);
    this.root.add(buzzerGroup);
    this.deviceObjects.buzzer = {
      group: buzzerGroup,
      slotPos: new THREE.Vector3(0.54, 0.04, loopMinZ),
      trayPos: new THREE.Vector3(-1.14, 0.042, -0.16)
    };

    // (C) DC Electric Motor with 3-Blade Propeller (Mechanical Energy) at (1.18, 0.04, 0.02)
    const motorGroup = new THREE.Group();
    const motorBase = new THREE.Mesh(
      new RoundedBoxGeometry(0.15, 0.028, 0.32, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38 })
    );
    motorBase.position.y = 0.014;
    motorBase.userData = { dragKind: 'device', devKey: 'motor' };
    motorGroup.add(motorBase);

    const cradle = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.12, 0.09, 2, 0.008), darkInsulatorMat);
    cradle.position.y = 0.08;
    cradle.userData = { dragKind: 'device', devKey: 'motor' };
    motorGroup.add(cradle);

    const motorCan = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.13, 24), steelMat);
    motorCan.rotation.z = Math.PI / 2;
    motorCan.position.y = 0.145;
    motorCan.castShadow = true;
    motorCan.userData = { dragKind: 'device', devKey: 'motor' };
    motorGroup.add(motorCan);

    // Spinning Hub & 3 Aerodynamic Fan Blades
    this.propellerHub = new THREE.Group();
    this.propellerHub.position.set(-0.085, 0.145, 0);
    motorGroup.add(this.propellerHub);

    const spinnerCone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.036, 16), brassMat);
    spinnerCone.rotation.z = Math.PI / 2;
    spinnerCone.position.x = -0.014;
    this.propellerHub.add(spinnerCone);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      roughness: 0.22,
      metalness: 0.25
    });
    for (let b = 0; b < 3; b++) {
      const bPivot = new THREE.Group();
      bPivot.rotation.x = (b / 3) * Math.PI * 2;
      const fanBlade = new THREE.Mesh(new RoundedBoxGeometry(0.008, 0.13, 0.032, 2, 0.004), bladeMat);
      fanBlade.position.y = 0.072;
      fanBlade.rotation.y = 0.28;
      fanBlade.userData = { dragKind: 'device', devKey: 'motor' };
      bPivot.add(fanBlade);
      this.propellerHub.add(bPivot);
      this.interactables.push(fanBlade);
    }

    this.interactables.push(motorBase, cradle, motorCan);
    this.root.add(motorGroup);
    this.deviceObjects.motor = {
      group: motorGroup,
      slotPos: new THREE.Vector3(loopMaxX, 0.04, 0.02),
      trayPos: new THREE.Vector3(-1.14, 0.042, -0.44) // offset dynamically below
    };
    this.deviceObjects.bulb.trayPos.set(-1.14, 0.042, -0.48);
    this.deviceObjects.buzzer.trayPos.set(-1.14, 0.042, -0.22);
    this.deviceObjects.motor.trayPos.set(-1.14, 0.042, -0.02);

    // --- 6. Closed-Loop Electron Flow Path & 30 Glowing Electron Spheres ---
    this.electronCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(loopMinX, 0.068, -0.2),
        new THREE.Vector3(loopMinX, 0.068, loopMinZ),
        new THREE.Vector3(loopMaxX, 0.068, loopMinZ),
        new THREE.Vector3(loopMaxX, 0.068, loopMaxZ),
        new THREE.Vector3(loopMinX, 0.068, loopMaxZ),
        new THREE.Vector3(loopMinX, 0.068, 0.2)
      ],
      true,
      'catmullrom',
      0.08
    );

    const eGeo = new THREE.SphereGeometry(0.013, 12, 12);
    for (let i = 0; i < 30; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0
      });
      const mesh = new THREE.Mesh(eGeo, mat);
      this.root.add(mesh);
      this.electrons.push({ mesh, mat, u: i / 30 });
    }

    this._syncPositionsToState();
  }

  _syncPositionsToState() {
    this.wireObjects.forEach((w, idx) => {
      w.group.position.copy(this.wiresInstalled[idx] ? w.spec.slotPos : w.spec.trayPos);
    });
    Object.keys(this.deviceObjects).forEach((key) => {
      const d = this.deviceObjects[key];
      d.group.position.copy(this.bays[key] ? d.slotPos : d.trayPos);
    });
  }

  _evaluateCircuit() {
    const missingWires = this.wiresInstalled.some((v) => !v);
    const missingDevices = !this.bays.bulb || !this.bays.buzzer || !this.bays.motor;

    if (!this.switchClosed) {
      this.circuitClosed = false;
      this.openReason = 'OPEN CIRCUIT — Close the Copper Knife Switch to complete the loop!';
    } else if (missingWires) {
      this.circuitClosed = false;
      this.openReason = 'OPEN CIRCUIT — A connecting snap-wire is removed (air gap)!';
    } else if (missingDevices) {
      this.circuitClosed = false;
      this.openReason = 'OPEN CIRCUIT — Snap all components from the tray into the loop bays!';
    } else {
      this.circuitClosed = true;
      this.openReason = 'CLOSED CIRCUIT — Current flowing! Producing Light, Heat, Sound & Motion!';
    }

    if (this.isActive) {
      this.audio.updateCircuitOutputs({
        buzzerActive: this.circuitClosed && this.bays.buzzer,
        motorActive: this.circuitClosed && this.bays.motor
      });
    } else {
      this.audio.updateCircuitOutputs({ buzzerActive: false, motorActive: false });
    }
  }

  toggleKnifeSwitch() {
    this.switchClosed = !this.switchClosed;
    this.audio.playClick(this.switchClosed ? 920 : 520, 0.32);
    this._evaluateCircuit();
  }

  toggleWire(idx) {
    this.wiresInstalled[idx] = !this.wiresInstalled[idx];
    this._syncPositionsToState();
    this.audio.playClick(780, 0.24);
    this._evaluateCircuit();
  }

  toggleDevice(key) {
    this.bays[key] = !this.bays[key];
    this._syncPositionsToState();
    this.audio.playClick(740, 0.25);
    this._evaluateCircuit();
  }

  onPointerDown(hit) {
    const ud = hit?.object?.userData;
    if (!ud) return false;

    if (ud.action === 'toggleSwitch') {
      this.toggleKnifeSwitch();
      return true;
    }

    if (ud.dragKind === 'wire') {
      const w = this.wireObjects[ud.wireIdx];
      this.draggingItem = {
        kind: 'wire',
        idx: ud.wireIdx,
        group: w.group,
        slotPos: w.spec.slotPos,
        trayPos: w.spec.trayPos,
        moved: false
      };
      this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
      return true;
    }

    if (ud.dragKind === 'device') {
      const d = this.deviceObjects[ud.devKey];
      this.draggingItem = {
        kind: 'device',
        key: ud.devKey,
        group: d.group,
        slotPos: d.slotPos,
        trayPos: d.trayPos,
        moved: false
      };
      this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
      return true;
    }
    return false;
  }

  onPointerMove(raycaster) {
    if (!this.draggingItem || !this._dragPlane) return false;
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(this._dragPlane, pt)) {
      const local = this.root.worldToLocal(pt.clone());
      this.draggingItem.moved = true;
      this.draggingItem.group.position.set(
        Math.max(-1.45, Math.min(1.38, local.x)),
        0.14,
        Math.max(-0.62, Math.min(0.62, local.z))
      );
    }
    return true;
  }

  onPointerUp() {
    if (!this.draggingItem) return;
    const item = this.draggingItem;
    this.draggingItem = null;

    if (!item.moved) {
      // Crisp Smartboard click toggles between Tray and Magnetic Snap Track!
      if (item.kind === 'wire') this.toggleWire(item.idx);
      else this.toggleDevice(item.key);
      return;
    }

    // Snap to whichever target (Circuit Track Bay vs Component Tray) is closer!
    const distSlot = item.group.position.distanceTo(item.slotPos);
    const distTray = item.group.position.distanceTo(item.trayPos);
    const snapIn = distSlot <= distTray + 0.18;

    if (item.kind === 'wire') {
      this.wiresInstalled[item.idx] = snapIn;
    } else {
      this.bays[item.key] = snapIn;
    }
    this._syncPositionsToState();
    this.audio.playClick(snapIn ? 960 : 540, 0.28);
    this._evaluateCircuit();
  }

  setActive(active) {
    this.isActive = active;
    this._evaluateCircuit();
  }

  reset() {
    this.switchClosed = false;
    this.wiresInstalled = [true, true, true];
    this.bays = { bulb: true, buzzer: true, motor: true };
    this.propellerSpeed = 0;
    this._syncPositionsToState();
    this._evaluateCircuit();
  }

  getCameraLocalPreset() {
    return {
      pos: new THREE.Vector3(0.05, 1.32, 1.52),
      target: new THREE.Vector3(0.08, 0.12, 0.0)
    };
  }

  update(dt, elapsed) {
    // 1. Knife Switch Copper Blade Pivot (0 = closed flat, -0.78 rad = open lifted)
    const targetAngle = this.switchClosed ? 0 : -0.78;
    this.knifeBladePivot.rotation.z += (targetAngle - this.knifeBladePivot.rotation.z) * Math.min(1, dt * 14);

    // 2. Electron Flow Dots + Multi-Form Energy Outputs
    if (this.circuitClosed) {
      for (const e of this.electrons) {
        e.u = (e.u + dt * 0.26) % 1;
        e.mesh.position.copy(this.electronCurve.getPointAt(e.u));
        e.mat.opacity = 0.95;
      }

      // Light Bulb -> Light + Heat!
      this.filamentMat.emissiveIntensity = 3.2;
      this.bulbGlobeMat.emissiveIntensity = 1.4;
      this.bulbPointLight.intensity = 2.2;

      // Buzzer -> Sound vibration!
      this.buzzerDiaphragm.position.y = 0.102 + Math.sin(elapsed * 90) * 0.003;
      const wPhase = (elapsed * 2.4) % 1;
      this.buzzerWaveRing.scale.setScalar(0.8 + wPhase * 2.4);
      this.buzzerWaveMat.opacity = (1 - wPhase) * 0.65;

      // Motor Propeller -> Mechanical motion!
      this.propellerSpeed = Math.min(26, this.propellerSpeed + dt * 28);
    } else {
      for (const e of this.electrons) {
        e.mat.opacity *= Math.pow(0.05, dt);
      }
      this.filamentMat.emissiveIntensity = 0;
      this.bulbGlobeMat.emissiveIntensity = 0;
      this.bulbPointLight.intensity = 0;
      this.buzzerDiaphragm.position.y = 0.102;
      this.buzzerWaveMat.opacity = 0;
      this.propellerSpeed = Math.max(0, this.propellerSpeed - dt * 14);
    }

    this.propellerHub.rotation.x += this.propellerSpeed * dt;
  }
}
