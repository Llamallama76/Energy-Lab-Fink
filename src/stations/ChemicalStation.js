import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProceduralTextures } from '../engine/ProceduralTextures.js';

export class ChemicalStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    this.mode = 'town'; // 'town' | 'engine'

    // Apparatus A: Bicycle Generator & Tiny Town state
    this.stamina = 0.0; // 0 -> 1.0 (charged by feeding chemical food calories!)
    this.pedalPhase = 0;
    this.pedalSpeed = 0; // rad/s
    this.powerOutputW = 0;
    this.lastFoodFed = 'None yet — feed the cyclist!';
    this.cablePulses = [];
    this.townWindowsMats = [];
    this.streetLampBulbs = [];

    // Apparatus B: Car Fuel & Cutaway 4-Cylinder Engine state
    this.fuelLevel = 0.55; // 0 -> 1.0
    this.ignitionOn = false;
    this.throttleNorm = 0.55; // 0.2 -> 1.0
    this.crankAngle = 0;
    this.engineRPM = 0;
    this.exhaustPlumes = [];
    this.cylinders = []; // 4 cutaway cylinder assemblies

    this.interactables = [];

    this._buildBikeAndTinyTown();
    this._buildCutawayEngine();
  }

  // =========================================================================
  // APPARATUS A: BICYCLE GENERATOR & "SUNSHINE BAY" TINY TOWN DIORAMA
  // =========================================================================
  _buildBikeAndTinyTown() {
    this.townSystemGroup = new THREE.Group();
    this.townSystemGroup.position.set(-0.56, 0, 0.02);
    this.root.add(this.townSystemGroup);

    const brushed = ProceduralTextures.getBrushedMetalBump();
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.26,
      metalness: 0.72
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      bumpMap: brushed,
      bumpScale: 0.004,
      roughness: 0.24,
      metalness: 0.88
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.25
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.25,
      metalness: 0.92
    });

    // --- 1. Stationary Dynamo Bike + Articulated Cyclist (Left side of townSystemGroup) ---
    const bikeGroup = new THREE.Group();
    bikeGroup.position.set(-0.62, 0, 0.08);
    this.townSystemGroup.add(bikeGroup);

    const bikePlatform = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.026, 0.44, 3, 0.008), darkMat);
    bikePlatform.position.y = 0.013;
    bikePlatform.receiveShadow = true;
    bikeGroup.add(bikePlatform);

    // Bike tubular steel frame triangles
    const addTube = (p1, p2, r = 0.011, mat = frameMat) => {
      const d = new THREE.Vector3().subVectors(p2, p1);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
      mesh.position.copy(p1).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      mesh.castShadow = true;
      bikeGroup.add(mesh);
      return mesh;
    };

    const bbPos = new THREE.Vector3(-0.04, 0.19, 0); // Bottom bracket (crank center)
    const seatPostTop = new THREE.Vector3(-0.17, 0.43, 0);
    const headTubeTop = new THREE.Vector3(0.16, 0.47, 0);
    const rearHub = new THREE.Vector3(-0.26, 0.19, 0);

    addTube(bbPos, seatPostTop, 0.012);
    addTube(bbPos, headTubeTop, 0.013);
    addTube(seatPostTop, headTubeTop, 0.011);
    addTube(rearHub, seatPostTop, 0.009);
    addTube(rearHub, bbPos, 0.009);
    addTube(rearHub, new THREE.Vector3(-0.26, 0.026, 0), 0.014, steelMat);
    addTube(headTubeTop, new THREE.Vector3(0.2, 0.026, 0), 0.014, steelMat);

    // Saddle & Handlebars
    const saddle = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.026, 0.065, 3, 0.01), darkMat);
    saddle.position.copy(seatPostTop).add(new THREE.Vector3(-0.01, 0.02, 0));
    bikeGroup.add(saddle);

    const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.24, 12), darkMat);
    handlebar.rotation.x = Math.PI / 2;
    handlebar.position.copy(headTubeTop).add(new THREE.Vector3(0.01, 0.035, 0));
    bikeGroup.add(handlebar);

    // Spinning Crankset & Copper Dynamo Generator Flywheel
    this.crankPivot = new THREE.Group();
    this.crankPivot.position.copy(bbPos);
    bikeGroup.add(this.crankPivot);

    const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.008, 28), steelMat);
    chainring.rotation.x = Math.PI / 2;
    chainring.position.z = 0.024;
    this.crankPivot.add(chainring);

    this.crankRadius = 0.068;
    const crankArmL = new THREE.Mesh(new THREE.BoxGeometry(this.crankRadius, 0.014, 0.008), steelMat);
    crankArmL.position.set(this.crankRadius / 2, 0, 0.042);
    this.crankPivot.add(crankArmL);

    const crankArmR = new THREE.Mesh(new THREE.BoxGeometry(this.crankRadius, 0.014, 0.008), steelMat);
    crankArmR.position.set(-this.crankRadius / 2, 0, -0.042);
    this.crankPivot.add(crankArmR);

    // Dynamo Copper Turbine mounted on rear hub
    const dynamoHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.11, 24), darkMat);
    dynamoHousing.rotation.x = Math.PI / 2;
    dynamoHousing.position.copy(rearHub);
    bikeGroup.add(dynamoHousing);

    this.dynamoRotor = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.018, 12, 24), copperMat);
    this.dynamoRotor.position.set(rearHub.x, rearHub.y, 0.062);
    bikeGroup.add(this.dynamoRotor);

    // Articulated 3D Cyclist Avatar
    const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.55 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.55 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.2 });

    this.hipOrigin = new THREE.Vector3(-0.16, 0.48, 0);
    const pelvis = new THREE.Mesh(new SphereOrCapsule(0.045, 0.04), shortsMat);
    pelvis.position.copy(this.hipOrigin);
    bikeGroup.add(pelvis);

    // Leaning torso, head, helmet, and arms gripping handlebars
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.16, 8, 16), jerseyMat);
    torso.position.set(-0.06, 0.60, 0);
    torso.rotation.z = -0.68;
    torso.castShadow = true;
    bikeGroup.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 20), skinMat);
    head.position.set(0.04, 0.72, 0);
    bikeGroup.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.054, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
      helmetMat
    );
    helmet.position.set(0.04, 0.73, 0);
    helmet.rotation.z = -0.2;
    bikeGroup.add(helmet);

    // Left & Right Arms reaching to handlebars
    [-0.08, 0.08].forEach((az) => {
      addTube(new THREE.Vector3(0.01, 0.65, az), new THREE.Vector3(0.16, 0.505, az * 1.15), 0.016, skinMat);
    });

    // Articulated Two-Bone IK Legs (Left z=+0.055, Right z=-0.055)
    this.thighLen = 0.165;
    this.shinLen = 0.165;
    this.legs = [-1, 1].map((sideSign) => {
      const z = sideSign * 0.052;
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, this.thighLen - 0.03, 6, 12), shortsMat);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, this.shinLen - 0.03, 6, 12), skinMat);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.024, 0.034, 2, 0.006), helmetMat);
      thigh.castShadow = shin.castShadow = true;
      bikeGroup.add(thigh, shin, shoe);
      return { sideSign, z, thigh, shin, shoe };
    });

    // --- 2. 3D Chemical Food Tray in front of Cyclist ---
    const trayGroup = new THREE.Group();
    trayGroup.position.set(-0.62, 0, 0.44);
    this.townSystemGroup.add(trayGroup);

    const trayPlate = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.02, 0.18, 3, 0.006), steelMat);
    trayPlate.position.y = 0.01;
    trayGroup.add(trayPlate);

    // Apple (-0.14), Banana (0), Energy Bar (+0.14)
    const apple = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.25 })
    );
    apple.position.set(-0.14, 0.052, 0);
    apple.userData = { foodType: 'apple' };
    trayGroup.add(apple);

    const banana = new THREE.Mesh(
      new THREE.TorusGeometry(0.044, 0.014, 12, 20, Math.PI * 0.85),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 })
    );
    banana.position.set(0, 0.042, 0);
    banana.rotation.x = Math.PI / 2;
    banana.userData = { foodType: 'banana' };
    trayGroup.add(banana);

    const energyBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.095, 0.024, 0.045, 2, 0.006),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.28, metalness: 0.55 })
    );
    energyBar.position.set(0.14, 0.034, 0);
    energyBar.userData = { foodType: 'bar' };
    trayGroup.add(energyBar);

    this.interactables.push(apple, banana, energyBar);

    // --- 3. "Sunshine Bay, FL" Miniature Tiny Town Diorama (Center) ---
    const diorama = new THREE.Group();
    diorama.position.set(0.32, 0, 0.02);
    this.townSystemGroup.add(diorama);

    // Turf grass base + asphalt avenue
    const turf = new THREE.Mesh(
      new RoundedBoxGeometry(0.98, 0.032, 0.88, 3, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.88 })
    );
    turf.position.y = 0.016;
    turf.receiveShadow = true;
    diorama.add(turf);

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.006, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    );
    road.position.set(0, 0.034, 0.04);
    diorama.add(road);

    // Yellow dashed centerline
    for (let rx = -0.38; rx <= 0.38; rx += 0.16) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 0.012),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(rx, 0.038, 0.04);
      diorama.add(dash);
    }

    // 4 Charming Miniature Town Buildings with Glowing Windows!
    const houses = [
      { x: -0.28, z: -0.22, w: 0.22, h: 0.16, d: 0.18, wall: 0xe2e8f0, roof: 0xbe123c },
      { x: 0.04, z: -0.23, w: 0.26, h: 0.22, d: 0.19, wall: 0xfef3c7, roof: 0x0369a1 },
      { x: 0.33, z: -0.21, w: 0.20, h: 0.15, d: 0.18, wall: 0xdbeafe, roof: 0x0f766e },
      { x: 0.24, z: 0.28, w: 0.25, h: 0.17, d: 0.17, wall: 0xf1f5f9, roof: 0xb45309 }
    ];

    houses.forEach((h) => {
      const bldg = new THREE.Group();
      bldg.position.set(h.x, 0.032, h.z);
      diorama.add(bldg);

      const walls = new THREE.Mesh(
        new RoundedBoxGeometry(h.w, h.h, h.d, 2, 0.005),
        new THREE.MeshStandardMaterial({ color: h.wall, roughness: 0.65 })
      );
      walls.position.y = h.h / 2;
      walls.castShadow = true;
      bldg.add(walls);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(h.w, h.d) * 0.76, 0.095, 4),
        new THREE.MeshStandardMaterial({ color: h.roof, roughness: 0.55 })
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = h.h + 0.046;
      roof.castShadow = true;
      bldg.add(roof);

      // Emissive Windows on front & back
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: new THREE.Color(0xfef08a),
        emissiveIntensity: 0.0,
        roughness: 0.2
      });
      this.townWindowsMats.push(winMat);

      [-0.048, 0.048].forEach((wx) => {
        const winF = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.048), winMat);
        winF.position.set(wx, h.h * 0.52, h.d / 2 + 0.002);
        bldg.add(winF);

        const winB = winF.clone();
        winB.rotation.y = Math.PI;
        winB.position.z = -h.d / 2 - 0.002;
        bldg.add(winB);
      });
    });

    // 4 Cast-Iron Streetlamps along Sunshine Bay Avenue
    [
      [-0.36, -0.08],
      [-0.08, 0.16],
      [0.18, -0.08],
      [0.38, 0.16]
    ].forEach(([lx, lz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.18, 10), darkMat);
      post.position.set(lx, 0.12, lz);
      diorama.add(post);

      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        emissive: new THREE.Color(0xfde047),
        emissiveIntensity: 0.0
      });
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 14), bulbMat);
      globe.position.set(lx, 0.215, lz);
      diorama.add(globe);
      this.streetLampBulbs.push(bulbMat);
    });

    // Miniature Florida Palm Trees!
    [
      [-0.36, 0.29],
      [-0.08, 0.31]
    ].forEach(([px, pz]) => {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.014, 0.21, 8),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
      );
      trunk.position.set(px, 0.13, pz);
      trunk.rotation.z = 0.08;
      diorama.add(trunk);

      const frondMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 });
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), frondMat);
        frond.position.set(px - 0.01, 0.235, pz);
        frond.rotation.z = 1.15;
        frond.rotation.y = (f / 5) * Math.PI * 2;
        diorama.add(frond);
      }
    });

    // Warm Town PointLight powered by cyclist generator
    this.townPointLight = new THREE.PointLight(0xfef08a, 0, 1.8);
    this.townPointLight.position.set(0.02, 0.42, 0.02);
    diorama.add(this.townPointLight);

    // Power Transmission Cable connecting Bike Dynamo (-0.88, 0.19, 0.08) -> Tiny Town (-0.16, 0.03, 0.04)
    this.cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.86, 0.18, 0.08),
      new THREE.Vector3(-0.56, 0.03, 0.12),
      new THREE.Vector3(-0.15, 0.035, 0.06)
    ]);
    const cableMesh = new THREE.Mesh(
      new THREE.TubeGeometry(this.cableCurve, 32, 0.008, 8, false),
      darkMat
    );
    this.townSystemGroup.add(cableMesh);

    const pulseGeo = new THREE.SphereGeometry(0.014, 10, 10);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(pulseGeo, mat);
      this.townSystemGroup.add(mesh);
      this.cablePulses.push({ mesh, mat, u: i / 6 });
    }

    this._updateCyclistIK(0);
  }

  _updateCyclistIK(phase) {
    this.crankPivot.rotation.z = -phase;
    const bb = new THREE.Vector2(-0.04, 0.19);
    const hip = new THREE.Vector2(this.hipOrigin.x, this.hipOrigin.y);

    this.legs.forEach((leg, idx) => {
      const a = -phase + (idx === 0 ? 0 : Math.PI);
      const foot = new THREE.Vector2(
        bb.x + Math.cos(a) * this.crankRadius,
        bb.y + Math.sin(a) * this.crankRadius
      );

      // 2D Two-Bone IK (hip -> knee -> foot, knee bends forward +X/+Y)
      const dVec = new THREE.Vector2().subVectors(foot, hip);
      const dist = Math.min(this.thighLen + this.shinLen - 0.004, dVec.length());
      const baseAngle = Math.atan2(dVec.y, dVec.x);
      const cosA = (this.thighLen * this.thighLen + dist * dist - this.shinLen * this.shinLen) / (2 * this.thighLen * dist);
      const bend = Math.acos(Math.max(-1, Math.min(1, cosA)));
      const kneeAngle = baseAngle + bend; // forward knee bend

      const knee = new THREE.Vector2(
        hip.x + Math.cos(kneeAngle) * this.thighLen,
        hip.y + Math.sin(kneeAngle) * this.thighLen
      );

      this._alignLimb(leg.thigh, hip, knee, leg.z);
      this._alignLimb(leg.shin, knee, foot, leg.z);
      leg.shoe.position.set(foot.x + 0.012, foot.y - 0.008, leg.z);
    });
  }

  _alignLimb(mesh, p1, p2, z) {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    mesh.position.set(midX, midY, z);
    mesh.rotation.set(0, 0, ang - Math.PI / 2);
  }

  // =========================================================================
  // APPARATUS B: CAR FUEL & CUTAWAY 4-CYLINDER COMBUSTION ENGINE
  // =========================================================================
  _buildCutawayEngine() {
    this.engineGroup = new THREE.Group();
    this.engineGroup.position.set(0.94, 0, 0.04);
    this.root.add(this.engineGroup);

    const brushed = ProceduralTextures.getBrushedMetalBump();
    const aluMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      bumpMap: brushed,
      bumpScale: 0.005,
      roughness: 0.26,
      metalness: 0.88
    });
    const castBlockMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.78
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.09,
      metalness: 0.96
    });

    // Engine Test Stand Base
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.06, 0.032, 0.68, 3, 0.008), castBlockMat);
    base.position.y = 0.016;
    base.receiveShadow = true;
    this.engineGroup.add(base);

    // --- 1. Translucent Fuel Tank (Left of engine block at x = -0.34) ---
    const tankGroup = new THREE.Group();
    tankGroup.position.set(-0.34, 0.032, 0);
    this.engineGroup.add(tankGroup);

    const tankGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.34, 32, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.34,
        roughness: 0.08,
        ior: 1.48,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    tankGlass.position.y = 0.19;
    tankGlass.userData = { action: 'pumpFuel' };
    tankGroup.add(tankGlass);

    const capBtm = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.024, 32), castBlockMat);
    capBtm.position.y = 0.012;
    tankGroup.add(capBtm);

    const capTop = capBtm.clone();
    capTop.position.y = 0.365;
    capTop.userData = { action: 'pumpFuel' };
    tankGroup.add(capTop);

    // Golden Gasoline Liquid Mesh inside Fuel Tank
    this.gasolineMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.102, 0.102, 1, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        emissive: new THREE.Color(0xb45309),
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.82,
        roughness: 0.1
      })
    );
    tankGroup.add(this.gasolineMesh);

    // Braided Fuel Line to Engine Rail
    const fuelLine = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.24, 10), aluMat);
    fuelLine.rotation.z = Math.PI / 2;
    fuelLine.position.set(-0.18, 0.11, 0);
    this.engineGroup.add(fuelLine);

    // Ignition Key Control Pod in front
    const keyPod = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.09, 0.12, 2, 0.01), castBlockMat);
    keyPod.position.set(-0.34, 0.075, 0.24);
    keyPod.userData = { action: 'toggleIgnition' };
    this.engineGroup.add(keyPod);

    this.keyMesh = new THREE.Mesh(
      new RoundedBoxGeometry(0.014, 0.045, 0.055, 2, 0.004),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.9 })
    );
    this.keyMesh.position.set(-0.34, 0.13, 0.24);
    this.keyMesh.userData = { action: 'toggleIgnition' };
    this.engineGroup.add(this.keyMesh);

    this.interactables.push(tankGlass, capTop, keyPod, this.keyMesh);

    // --- 2. Cutaway 4-Cylinder Engine Block (Right side at x = +0.16) ---
    const blockOrigin = new THREE.Group();
    blockOrigin.position.set(0.16, 0.032, -0.02);
    this.engineGroup.add(blockOrigin);

    // Rear Cutaway Cast Block Wall + Oil Pan + Cylinder Head
    const rearWall = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.36, 0.08, 3, 0.01), castBlockMat);
    rearWall.position.set(0, 0.22, -0.075);
    rearWall.castShadow = true;
    blockOrigin.add(rearWall);

    const headCover = new THREE.Mesh(new RoundedBoxGeometry(0.60, 0.075, 0.22, 3, 0.015), aluMat);
    headCover.position.set(0, 0.435, -0.01);
    headCover.castShadow = true;
    blockOrigin.add(headCover);

    // Rotating Crankshaft Axis at y = 0.11
    this.crankshaftGroup = new THREE.Group();
    this.crankshaftGroup.position.set(0, 0.11, 0);
    blockOrigin.add(this.crankshaftGroup);

    const mainShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.66, 16), chromeMat);
    mainShaft.rotation.z = Math.PI / 2;
    this.crankshaftGroup.add(mainShaft);

    const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.028, 28), castBlockMat);
    flywheel.rotation.z = Math.PI / 2;
    flywheel.position.x = 0.33;
    this.crankshaftGroup.add(flywheel);

    // 4 Cutaway Cylinders with Firing Order 1-3-4-2
    const phaseOffsets = [0, Math.PI, Math.PI * 3, Math.PI * 2]; // 4-stroke 720° cycle!
    this.crankThrow = 0.038;
    this.rodLength = 0.145;

    for (let i = 0; i < 4; i++) {
      const cx = -0.195 + i * 0.13;

      // Translucent cutaway glass cylinder sleeve so combustion & piston motion are 100% visible!
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.22, 24, 1, true, Math.PI * 0.15, Math.PI * 1.7),
        new THREE.MeshPhysicalMaterial({
          color: 0x94a3b8,
          transparent: true,
          opacity: 0.32,
          roughness: 0.15,
          metalness: 0.4,
          side: THREE.DoubleSide
        })
      );
      sleeve.position.set(cx, 0.29, 0);
      blockOrigin.add(sleeve);

      // Overhead Ceramic Spark Plug
      const plug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.06, 12),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 })
      );
      plug.position.set(cx, 0.485, 0);
      blockOrigin.add(plug);

      // Chrome Piston + Connecting Rod
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.056, 24), chromeMat);
      blockOrigin.add(piston);

      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.014, this.rodLength, 0.014), aluMat);
      blockOrigin.add(rod);

      // Spark Flash + Fiery Combustion Chamber Volume
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0 });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), sparkMat);
      spark.position.set(cx, 0.382, 0);
      blockOrigin.add(spark);

      const fireMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0 });
      const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.065, 18), fireMat);
      fire.position.set(cx, 0.355, 0);
      blockOrigin.add(fire);

      this.cylinders.push({
        cx,
        phaseOffset: phaseOffsets[i],
        piston,
        rod,
        sparkMat,
        fireMat,
        firedThisCycle: false
      });
    }

    // Glowing Thermal Exhaust Manifold Pipe + Rising Heat Plumes on Rear/Right
    this.exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      emissive: new THREE.Color(0xea580c),
      emissiveIntensity: 0.0,
      roughness: 0.5,
      metalness: 0.7
    });
    const manifold = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.54, 16), this.exhaustMat);
    manifold.rotation.z = Math.PI / 2;
    manifold.position.set(0.04, 0.36, -0.13);
    blockOrigin.add(manifold);

    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfdba74, transparent: true, opacity: 0 });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), mat);
      blockOrigin.add(puff);
      this.exhaustPlumes.push({ mesh: puff, mat, phase: i / 10 });
    }

    this._updateEngineKinematics(0);
    this._updateFuelTankVisual();
  }

  _updateFuelTankVisual() {
    const h = Math.max(0.008, this.fuelLevel * 0.31);
    this.gasolineMesh.scale.y = h;
    this.gasolineMesh.position.y = 0.024 + h / 2;
    this.gasolineMesh.visible = this.fuelLevel > 0.01;
  }

  _updateEngineKinematics(cycleRad) {
    this.crankshaftGroup.rotation.x = cycleRad;

    this.cylinders.forEach((cyl) => {
      // 720° 4-stroke cycle angle in [0, 4π)
      const a = ((cycleRad + cyl.phaseOffset) % (Math.PI * 4) + Math.PI * 4) % (Math.PI * 4);
      const pinY = 0.11 + Math.cos(a) * this.crankThrow;
      const pinZ = Math.sin(a) * this.crankThrow;

      // Exact slider-crank piston height
      const dy = Math.sqrt(Math.max(0.001, this.rodLength * this.rodLength - pinZ * pinZ));
      const pistonY = pinY + dy;
      cyl.piston.position.set(cyl.cx, pistonY, 0);

      // Align connecting rod from crankpin to wristpin
      cyl.rod.position.set(cyl.cx, (pinY + pistonY) / 2, pinZ / 2);
      cyl.rod.rotation.x = Math.atan2(-pinZ, pistonY - pinY);

      // Power stroke ignition right at Top Dead Center (a ∈ [0, 0.75]) when engine is running!
      if (this.ignitionOn && this.fuelLevel > 0.005 && a < 0.85) {
        const flash = 1 - a / 0.85;
        cyl.sparkMat.opacity = a < 0.25 ? 1.0 : 0.0;
        cyl.fireMat.opacity = flash * 0.85;
        if (a < 0.22 && !cyl.firedThisCycle && this.isActive && this.mode === 'engine') {
          cyl.firedThisCycle = true;
          this.audio.triggerCylinderFire(this.throttleNorm);
        }
      } else {
        cyl.sparkMat.opacity = 0;
        cyl.fireMat.opacity = 0;
        if (a > 1.2) cyl.firedThisCycle = false;
      }
    });
  }

  feedCyclist(foodType) {
    const table = {
      apple: { gain: 0.36, label: 'Crisp Apple (95 kcal Chemical Energy)' },
      banana: { gain: 0.46, label: 'Ripe Banana (110 kcal Chemical Energy)' },
      bar: { gain: 0.76, label: 'Granola Energy Bar (220 kcal Chemical Energy)' }
    };
    const item = table[foodType] || table.apple;
    this.stamina = Math.min(1.0, this.stamina + item.gain);
    this.lastFoodFed = item.label;
    this.audio.playFoodCharge();
  }

  pumpGasoline() {
    this.fuelLevel = Math.min(1.0, this.fuelLevel + 0.35);
    this._updateFuelTankVisual();
    this.audio.playClick(640, 0.22);
  }

  toggleIgnition() {
    if (!this.ignitionOn && this.fuelLevel <= 0.01) {
      this.fuelLevel = 0.45;
      this._updateFuelTankVisual();
    }
    this.ignitionOn = !this.ignitionOn;
    this.audio.playClick(this.ignitionOn ? 880 : 420, 0.28);
  }

  onPointerDown(hit) {
    const ud = hit?.object?.userData;
    if (ud?.foodType) {
      this.mode = 'town';
      this.feedCyclist(ud.foodType);
      return true;
    }
    if (ud?.action === 'pumpFuel') {
      this.mode = 'engine';
      this.pumpGasoline();
      return true;
    }
    if (ud?.action === 'toggleIgnition') {
      this.mode = 'engine';
      this.toggleIgnition();
      return true;
    }
    return false;
  }

  onPointerMove() {}
  onPointerUp() {}

  setActive(active) {
    this.isActive = active;
  }

  reset() {
    this.stamina = 0;
    this.pedalSpeed = 0;
    this.powerOutputW = 0;
    this.lastFoodFed = 'None yet — feed the cyclist!';
    this.fuelLevel = 0.55;
    this.ignitionOn = false;
    this.throttleNorm = 0.55;
    this.engineRPM = 0;
    this._updateFuelTankVisual();
    this._updateCyclistIK(0);
    this._updateEngineKinematics(0);
  }

  getCameraLocalPreset() {
    if (this.mode === 'engine') {
      return {
        pos: new THREE.Vector3(0.92, 0.88, 1.32),
        target: new THREE.Vector3(0.92, 0.28, 0.02)
      };
    }
    return {
      pos: new THREE.Vector3(-0.48, 0.98, 1.56),
      target: new THREE.Vector3(-0.48, 0.28, 0.04)
    };
  }

  update(dt, elapsed) {
    // 1. Bicycle Generator & Tiny Town Energy Transformation Chain
    if (this.stamina > 0.002) {
      this.stamina = Math.max(0, this.stamina - dt * 0.055);
      const targetSpeed = 3.2 + this.stamina * 7.5;
      this.pedalSpeed += (targetSpeed - this.pedalSpeed) * Math.min(1, dt * 5);
    } else {
      this.pedalSpeed *= Math.pow(0.15, dt);
    }

    if (this.pedalSpeed > 0.05) {
      this.pedalPhase += this.pedalSpeed * dt;
      this._updateCyclistIK(this.pedalPhase);
      this.dynamoRotor.rotation.z -= this.pedalSpeed * 3.5 * dt;
    }

    const genFactor = Math.min(1, this.pedalSpeed / 9.2);
    this.powerOutputW = Math.round(genFactor * 185);

    this.townWindowsMats.forEach((m) => {
      m.emissiveIntensity = genFactor * 1.9;
    });
    this.streetLampBulbs.forEach((m) => {
      m.emissiveIntensity = genFactor * 2.6;
    });
    this.townPointLight.intensity = genFactor * 2.2;

    for (const p of this.cablePulses) {
      if (genFactor > 0.06) {
        p.u = (p.u + dt * (0.5 + genFactor * 1.4)) % 1;
        p.mesh.position.copy(this.cableCurve.getPointAt(p.u));
        p.mat.opacity = 0.9 * genFactor;
      } else {
        p.mat.opacity = 0;
      }
    }

    // 2. Car Fuel & Cutaway 4-Cylinder Combustion Engine
    this.keyMesh.rotation.z = this.ignitionOn ? -0.55 : 0;

    if (this.ignitionOn && this.fuelLevel > 0.005) {
      this.fuelLevel = Math.max(0, this.fuelLevel - dt * (0.014 + this.throttleNorm * 0.025));
      if (this.fuelLevel <= 0.005) {
        this.ignitionOn = false;
      }
      this._updateFuelTankVisual();

      const targetRPM = 900 + this.throttleNorm * 2600;
      this.engineRPM += (targetRPM - this.engineRPM) * Math.min(1, dt * 6);
      const radPerSec = 8 + this.throttleNorm * 22;
      this.crankAngle += radPerSec * dt;
      this._updateEngineKinematics(this.crankAngle);
      this.exhaustMat.emissiveIntensity = Math.min(1.6, this.exhaustMat.emissiveIntensity + dt * 0.8);
    } else {
      this.engineRPM = Math.max(0, this.engineRPM - dt * 1800);
      this._updateEngineKinematics(this.crankAngle);
      this.exhaustMat.emissiveIntensity = Math.max(0, this.exhaustMat.emissiveIntensity - dt * 1.1);
    }

    // Rising Thermal Exhaust Heat Plumes
    const heatAlpha = Math.min(1, this.exhaustMat.emissiveIntensity);
    for (const puff of this.exhaustPlumes) {
      if (heatAlpha > 0.08) {
        puff.phase = (puff.phase + dt * (0.6 + this.throttleNorm * 0.8)) % 1;
        puff.mesh.position.set(
          0.32 + puff.phase * 0.16,
          0.36 + puff.phase * 0.28,
          -0.13 + Math.sin(elapsed * 6 + puff.phase * 8) * 0.025
        );
        puff.mesh.scale.setScalar(0.5 + puff.phase * 1.5);
        puff.mat.opacity = (1 - puff.phase) * 0.32 * heatAlpha;
      } else {
        puff.mat.opacity = 0;
      }
    }
  }
}

function SphereOrCapsule(r, l) {
  return new THREE.CapsuleGeometry(r, l, 8, 14);
}
