import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProceduralTextures } from '../engine/ProceduralTextures.js';

export class MechanicalStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    this.mode = 'coaster'; // 'coaster' | 'ramp'

    // Apparatus A: Parametric Roller Coaster (Physically Adjustable Lift Hill + 0, 1, or 2 Loops!)
    this.startHeightCm = 62; // 24 cm -> 84 cm (can be dragged vertically in 3D or via slider!)
    this.loopCount = 1; // 0 | 1 | 2 loops
    this.cartMass = 4.0; // kg (1.0 -> 10.0)
    this.frictionEnabled = false;
    this.coasterRunning = false;
    this.draggingLiftTower = false;
    this.coasterStatus = 'Ready! Drag the yellow Lift Tower in 3D (or slider), choose 0–2 Loops & Launch!';

    this.energyStats = {
      pe: 0,
      ke: 0,
      thermal: 0,
      total: 1,
      speed: 0
    };

    // Apparatus B: Ramp Collision Test state
    this.ballType = 'steel'; // 'steel' (5.0 kg) | 'tennis' (0.25 kg)
    this.rampHeightNorm = 0.78;
    this.rampRunning = false;
    this.maxPinScatterCm = 0;
    this.pinsKnockedCount = 0;
    this.impactKE = 0;

    this.coasterInteractables = [];
    this.rampInteractables = [];
    this.interactables = [];

    this._buildRollerCoasterBase();
    this._buildRampCollision();
    this._rebuildCoasterTrack();
    this._resetRampScene();
  }

  _syncInteractables() {
    this.interactables = [...this.coasterInteractables, ...this.rampInteractables];
  }

  // =========================================================================
  // APPARATUS A: DYNAMIC 3D ROLLER COASTER (DRAGGABLE LIFT TOWER + 0/1/2 LOOPS)
  // =========================================================================
  _buildRollerCoasterBase() {
    this.coasterGroup = new THREE.Group();
    this.coasterGroup.position.set(0, 0, -0.34);
    this.root.add(this.coasterGroup);

    this.trackDynamicGroup = new THREE.Group();
    this.coasterGroup.add(this.trackDynamicGroup);

    // Interactive Telescoping Hydraulic Lift-Hill Tower at x = -1.42 (Draggable up/down in 3D!)
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.82
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: new THREE.Color(0xd97706),
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.5
    });

    const towerFoot = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.025, 0.22, 2, 0.006), towerMat);
    towerFoot.position.set(-1.42, 0.0125, 0);
    this.coasterGroup.add(towerFoot);

    this.liftColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1, 16), towerMat);
    this.liftColumn.position.set(-1.42, 0.3, 0);
    this.liftColumn.userData = { action: 'dragLiftHeight' };
    this.coasterGroup.add(this.liftColumn);

    // Glowing Yellow Lift Handle Collar right under start platform (click & drag up/down!)
    this.liftHandle = new THREE.Group();
    this.liftHandle.position.set(-1.42, 0.62, 0);
    this.coasterGroup.add(this.liftHandle);

    const collar = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.052, 0.16, 3, 0.012), handleMat);
    collar.userData = { action: 'dragLiftHeight' };
    this.liftHandle.add(collar);

    const upCone = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.036, 12), handleMat);
    upCone.position.set(0, 0.052, 0.085);
    upCone.userData = { action: 'dragLiftHeight' };
    this.liftHandle.add(upCone);

    const dnCone = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.036, 12), handleMat);
    dnCone.rotation.x = Math.PI;
    dnCone.position.set(0, -0.052, 0.085);
    dnCone.userData = { action: 'dragLiftHeight' };
    this.liftHandle.add(dnCone);

    // 3D Test Coaster Cart
    this.cartGroup = new THREE.Group();
    this.coasterGroup.add(this.cartGroup);

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.2,
      metalness: 0.8
    });
    const cartBody = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.048, 0.084, 3, 0.012), chassisMat);
    cartBody.position.y = 0.036;
    cartBody.castShadow = true;
    cartBody.userData = { action: 'launchCoaster' };
    this.cartGroup.add(cartBody);

    this.massBlock = new THREE.Mesh(
      new RoundedBoxGeometry(0.065, 0.036, 0.056, 2, 0.006),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.88 })
    );
    this.massBlock.position.y = 0.065;
    this.massBlock.userData = { action: 'launchCoaster' };
    this.cartGroup.add(this.massBlock);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    [
      [-0.042, -0.038],
      [0.042, -0.038],
      [-0.042, 0.038],
      [0.042, 0.038]
    ].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 14), wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.016, wz);
      this.cartGroup.add(w);
    });

    this.coasterInteractables = [this.liftColumn, collar, upCone, dnCone, cartBody, this.massBlock];
    this._syncInteractables();
  }

  _rebuildCoasterTrack() {
    while (this.trackDynamicGroup.children.length) {
      const c = this.trackDynamicGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }

    // Scene height y in meters where 1 cm = 0.01 m above valley baseline (minTrackY = 0.09)
    this.minTrackY = 0.09;
    const startY = this.minTrackY + (this.startHeightCm / 100) * 0.88;

    // Position the physical Lift Hill Tower & Draggable Handle to match exact startY!
    this.liftColumn.scale.y = Math.max(0.1, startY);
    this.liftColumn.position.y = startY / 2;
    this.liftHandle.position.y = Math.max(0.14, startY - 0.035);

    const pts = [];
    // 1. Raised Starting Platform & Smooth First Drop
    pts.push(new THREE.Vector3(-1.44, startY, 0.0));
    pts.push(new THREE.Vector3(-1.34, startY, 0.0));
    pts.push(new THREE.Vector3(-1.04, (startY + this.minTrackY) * 0.52, 0.0));
    pts.push(new THREE.Vector3(-0.76, this.minTrackY + 0.03, 0.0));
    pts.push(new THREE.Vector3(-0.54, this.minTrackY, 0.0));

    const supportUs = [0.09, 0.2];

    if (this.loopCount === 0) {
      // 0 Loops: Fast sweeping airtime hills! (Max camelback crest = 34 cm)
      pts.push(new THREE.Vector3(-0.12, this.minTrackY + 0.34 * 0.88, 0.0));
      pts.push(new THREE.Vector3(0.32, this.minTrackY + 0.015, 0.0));
      pts.push(new THREE.Vector3(0.74, this.minTrackY + 0.22 * 0.88, 0.0));
      pts.push(new THREE.Vector3(1.12, this.minTrackY + 0.01, 0.0));
      pts.push(new THREE.Vector3(1.44, this.minTrackY + 0.015, 0.0));
      supportUs.push(0.38, 0.56, 0.75, 0.96);
    } else if (this.loopCount === 1) {
      // 1 Loop: Vertical Loop crest = 48 cm -> requires Start Height >= 50 cm (or ~60 cm with Friction ON)
      const top1 = this.minTrackY + 0.48 * 0.88;
      const r1 = (top1 - this.minTrackY) / 2;
      const cy1 = this.minTrackY + r1;
      const cx1 = -0.14;
      for (let i = 0; i <= 16; i++) {
        const th = -Math.PI / 2 + (i / 16) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            cx1 + Math.cos(th) * r1 * 0.9,
            cy1 + Math.sin(th) * r1,
            -0.03 + (i / 16) * 0.06
          )
        );
      }
      pts.push(new THREE.Vector3(0.26, this.minTrackY + 0.01, 0.03));
      pts.push(new THREE.Vector3(0.64, this.minTrackY + 0.25 * 0.88, 0.01));
      pts.push(new THREE.Vector3(1.04, this.minTrackY + 0.01, 0.0));
      pts.push(new THREE.Vector3(1.44, this.minTrackY + 0.015, 0.0));
      supportUs.push(0.45, 0.74, 0.88, 0.98);
    } else {
      // 2 Loops Challenge! Loop 1 crest = 46 cm, Giant Loop 2 crest = 62 cm -> requires Start Height >= 64 cm!
      const top1 = this.minTrackY + 0.46 * 0.88;
      const r1 = (top1 - this.minTrackY) / 2;
      const cy1 = this.minTrackY + r1;
      const cx1 = -0.24;
      for (let i = 0; i <= 16; i++) {
        const th = -Math.PI / 2 + (i / 16) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            cx1 + Math.cos(th) * r1 * 0.86,
            cy1 + Math.sin(th) * r1,
            -0.04 + (i / 16) * 0.055
          )
        );
      }

      pts.push(new THREE.Vector3(0.14, this.minTrackY + 0.008, 0.015));

      const top2 = this.minTrackY + 0.62 * 0.88;
      const r2 = (top2 - this.minTrackY) / 2;
      const cy2 = this.minTrackY + r2;
      const cx2 = 0.56;
      for (let i = 0; i <= 16; i++) {
        const th = -Math.PI / 2 + (i / 16) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            cx2 + Math.cos(th) * r2 * 0.86,
            cy2 + Math.sin(th) * r2,
            0.015 + (i / 16) * 0.055
          )
        );
      }

      pts.push(new THREE.Vector3(0.98, this.minTrackY + 0.01, 0.04));
      pts.push(new THREE.Vector3(1.24, this.minTrackY + 0.012, 0.01));
      pts.push(new THREE.Vector3(1.44, this.minTrackY + 0.015, 0.0));
      supportUs.push(0.36, 0.56, 0.74, 0.96);
    }

    // Centripetal Catmull-Rom guarantees zero spline overshoot at loop transitions!
    this.coasterCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.trackLength = this.coasterCurve.getLength();

    const railMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.28,
      metalness: 0.78
    });
    const spineMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.82
    });

    const spineMesh = new THREE.Mesh(
      new THREE.TubeGeometry(this.coasterCurve, 240, 0.011, 8, false),
      spineMat
    );
    spineMesh.castShadow = true;
    this.trackDynamicGroup.add(spineMesh);

    const leftPts = [];
    const rightPts = [];
    const samples = 200;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const p = this.coasterCurve.getPointAt(u);
      const tan = this.coasterCurve.getTangentAt(u).normalize();
      const side = new THREE.Vector3(0, 0, 1);
      const up = new THREE.Vector3().crossVectors(side, tan).normalize();
      leftPts.push(p.clone().addScaledVector(side, -0.032).addScaledVector(up, 0.012));
      rightPts.push(p.clone().addScaledVector(side, 0.032).addScaledVector(up, 0.012));

      if (i % 5 === 0) {
        const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.068, 6), spineMat);
        tie.rotation.x = Math.PI / 2;
        tie.position.copy(p).addScaledVector(up, 0.006);
        this.trackDynamicGroup.add(tie);
      }
    }

    this.trackDynamicGroup.add(
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPts), 200, 0.0065, 8, false), railMat)
    );
    this.trackDynamicGroup.add(
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPts), 200, 0.0065, 8, false), railMat)
    );

    supportUs.forEach((u) => {
      const p = this.coasterCurve.getPointAt(u);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, p.y, 10), spineMat);
      col.position.set(p.x, p.y / 2, p.z - 0.035);
      col.castShadow = true;
      this.trackDynamicGroup.add(col);
    });

    const bumper = new THREE.Mesh(
      new RoundedBoxGeometry(0.05, 0.07, 0.11, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
    );
    bumper.position.set(1.45, this.minTrackY + 0.04, 0);
    this.trackDynamicGroup.add(bumper);

    this._resetCartToStart();
  }

  // =========================================================================
  // APPARATUS B: INCLINED RAMP COLLISION TEST (FULL 6-PIN STRIKE SCATTER!)
  // =========================================================================
  _buildRampCollision() {
    this.rampGroup = new THREE.Group();
    this.rampGroup.position.set(0, 0, 0.42);
    this.root.add(this.rampGroup);

    const maple = ProceduralTextures.getWoodTexture('maple');
    const woodMat = new THREE.MeshStandardMaterial({
      map: maple.map,
      bumpMap: maple.bumpMap,
      bumpScale: 0.008,
      roughness: 0.34,
      metalness: 0.05
    });
    const laneMat = new THREE.MeshStandardMaterial({
      color: 0x16202e,
      roughness: 0.28,
      metalness: 0.22
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.8
    });

    const runway = new THREE.Mesh(new RoundedBoxGeometry(2.88, 0.024, 0.46, 3, 0.006), laneMat);
    runway.position.y = 0.012;
    runway.receiveShadow = true;
    this.rampGroup.add(runway);

    [-0.225, 0.225].forEach((gz) => {
      const guard = new THREE.Mesh(new RoundedBoxGeometry(2.88, 0.055, 0.016, 2, 0.004), railMat);
      guard.position.set(0, 0.04, gz);
      this.rampGroup.add(guard);
    });

    const endStop = new THREE.Mesh(new RoundedBoxGeometry(0.025, 0.09, 0.46, 2, 0.004), railMat);
    endStop.position.set(1.43, 0.05, 0);
    this.rampGroup.add(endStop);

    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 });
    for (let i = 1; i <= 5; i++) {
      const sx = 0.25 + i * 0.22;
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.4), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.025, 0);
      this.rampGroup.add(stripe);
    }

    this.rampPivot = new THREE.Group();
    this.rampPivot.position.set(-0.35, 0.024, 0);
    this.rampGroup.add(this.rampPivot);

    this.rampLen = 1.02;
    const plank = new THREE.Mesh(new RoundedBoxGeometry(this.rampLen, 0.022, 0.26, 2, 0.005), woodMat);
    plank.position.set(-this.rampLen / 2, 0.011, 0);
    plank.castShadow = true;
    plank.receiveShadow = true;
    this.rampPivot.add(plank);

    this.rampSupportPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1, 14), railMat);
    this.rampSupportPost.position.set(-1.26, 0.2, 0);
    this.rampGroup.add(this.rampSupportPost);

    this.steelBallMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.1,
      metalness: 0.94
    });
    this.tennisBallMat = new THREE.MeshStandardMaterial({
      color: 0xa3e635,
      roughness: 0.86,
      metalness: 0.02
    });

    this.rampBall = new THREE.Mesh(new THREE.SphereGeometry(0.054, 28, 28), this.steelBallMat);
    this.rampBall.castShadow = true;
    this.rampBall.userData = { action: 'launchRampBall' };
    this.rampGroup.add(this.rampBall);
    this.rampInteractables = [this.rampBall];
    this._syncInteractables();

    // Compact 6-Pin Bowling Triangle so heavy steel ball triggers a full 6-pin chain-reaction scatter!
    this.pins = [];
    const pinCoords = [
      [0.24, 0.0],
      [0.32, -0.042],
      [0.32, 0.042],
      [0.40, -0.082],
      [0.40, 0.0],
      [0.40, 0.082]
    ];

    const pinWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 });
    const pinStripeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });

    pinCoords.forEach(([px, pz]) => {
      const pGroup = new THREE.Group();
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.09, 18), pinWhiteMat);
      lower.position.y = 0.045;
      lower.castShadow = true;
      pGroup.add(lower);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.021, 0.04, 16), pinStripeMat);
      neck.position.y = 0.105;
      pGroup.add(neck);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.019, 18, 18), pinWhiteMat);
      head.position.y = 0.138;
      pGroup.add(head);

      this.rampGroup.add(pGroup);
      this.pins.push({
        group: pGroup,
        homeX: px,
        homeZ: pz,
        pos: new THREE.Vector3(px, 0.024, pz),
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        knocked: false
      });
    });
  }

  setStartHeightCm(cm) {
    this.startHeightCm = Math.round(Math.max(24, Math.min(84, cm)));
    this._rebuildCoasterTrack();
  }

  setLoopCount(n) {
    this.loopCount = n;
    this._rebuildCoasterTrack();
  }

  _resetCartToStart() {
    this.coasterRunning = false;
    this.cartU = 0.012;
    this.cartDir = 1;
    this.thermalLossJ = 0;

    const scaleM = 0.65 + (this.cartMass / 10) * 0.65;
    this.massBlock.scale.set(scaleM, scaleM, scaleM);

    const startPt = this.coasterCurve.getPointAt(this.cartU);
    const h0 = Math.max(0, (startPt.y - this.minTrackY) / 0.88) * 10;
    this.initialEnergyJ = this.cartMass * 9.81 * h0;
    this._positionCartAtU(this.cartU);
    this._computeEnergyStats(h0, 0);
  }

  _positionCartAtU(u) {
    const clamped = Math.max(0.005, Math.min(0.992, u));
    const pt = this.coasterCurve.getPointAt(clamped);
    const tan = this.coasterCurve.getTangentAt(clamped).normalize();
    const side = new THREE.Vector3(0, 0, 1);
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();

    const m = new THREE.Matrix4().makeBasis(tan, up, side);
    this.cartGroup.position.copy(pt);
    this.cartGroup.quaternion.setFromRotationMatrix(m);
  }

  _computeEnergyStats(heightMeters, speedVal) {
    const pe = Math.max(0, this.cartMass * 9.81 * heightMeters);
    const ke = Math.max(0, this.initialEnergyJ - pe - this.thermalLossJ);
    this.energyStats = {
      pe: Math.round(pe),
      ke: Math.round(ke),
      thermal: Math.round(this.thermalLossJ),
      total: Math.max(1, Math.round(this.initialEnergyJ)),
      speed: speedVal.toFixed(1)
    };
  }

  launchCoaster() {
    this._resetCartToStart();
    this.coasterRunning = true;
    this.coasterStatus = 'Riding rails — watch Potential vs. Kinetic Energy!';
    this.audio.playClick(680, 0.25);
  }

  _resetRampScene() {
    this.rampRunning = false;

    const angle = 0.12 + this.rampHeightNorm * 0.35;
    this.rampPivot.rotation.z = -angle;

    const leftEndH = 0.024 + Math.sin(angle) * 0.91;
    this.rampSupportPost.scale.y = Math.max(0.05, leftEndH);
    this.rampSupportPost.position.y = leftEndH / 2;

    const isSteel = this.ballType === 'steel';
    this.ballRadius = isSteel ? 0.054 : 0.041;
    this.rampBall.scale.setScalar(isSteel ? 1.0 : 0.78);
    this.rampBall.material = isSteel ? this.steelBallMat : this.tennisBallMat;

    this.ballRampDist = 0.08;
    this.ballLinearVel = 0;
    this.ballRunwayX = -0.35;
    this.ballRunwayZ = 0;
    this._updateRampBallPosition();

    this.pins.forEach((p) => {
      p.pos.set(p.homeX, 0.024, p.homeZ);
      p.vel.set(0, 0, 0);
      p.rotVel.set(0, 0, 0);
      p.knocked = false;
      p.group.position.copy(p.pos);
      p.group.rotation.set(0, 0, 0);
    });
    this.pinsKnockedCount = 0;
  }

  _updateRampBallPosition() {
    const angle = -this.rampPivot.rotation.z;
    if (this.ballRampDist < this.rampLen) {
      const distFromPivot = this.rampLen - this.ballRampDist;
      const bx = -0.35 - Math.cos(angle) * distFromPivot + Math.sin(angle) * (this.ballRadius + 0.012);
      const by = 0.024 + Math.sin(angle) * distFromPivot + Math.cos(angle) * (this.ballRadius + 0.012);
      this.rampBall.position.set(bx, by, 0);
    } else {
      this.rampBall.position.set(this.ballRunwayX, 0.024 + this.ballRadius, this.ballRunwayZ);
    }
  }

  launchRampBall() {
    this._resetRampScene();
    this.maxPinScatterCm = 0;
    this.pinsKnockedCount = 0;
    this.rampRunning = true;
    this.audio.playClick(540, 0.24);
  }

  onPointerDown(hit) {
    const act = hit?.object?.userData?.action;
    if (act === 'dragLiftHeight') {
      this.mode = 'coaster';
      this.draggingLiftTower = true;
      // Vertical plane facing camera at lift tower world position
      const worldTower = new THREE.Vector3(-1.42, 0.4, 0);
      this.coasterGroup.localToWorld(worldTower);
      this._liftDragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -worldTower.z);
      return true;
    }
    if (act === 'launchCoaster') {
      this.mode = 'coaster';
      this.launchCoaster();
      return true;
    }
    if (act === 'launchRampBall') {
      this.mode = 'ramp';
      this.launchRampBall();
      return true;
    }
    return false;
  }

  onPointerMove(raycaster) {
    if (this.draggingLiftTower && this._liftDragPlane) {
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(this._liftDragPlane, pt)) {
        const local = this.coasterGroup.worldToLocal(pt.clone());
        const cm = ((local.y - this.minTrackY) / 0.88) * 100;
        this.setStartHeightCm(cm);
      }
      return true;
    }
    return false;
  }

  onPointerUp() {
    this.draggingLiftTower = false;
  }

  setActive(active) {
    this.isActive = active;
  }

  reset() {
    this.startHeightCm = 62;
    this.loopCount = 1;
    this.cartMass = 4.0;
    this.frictionEnabled = false;
    this.coasterStatus = 'Ready! Drag the yellow Lift Tower in 3D (or slider), choose 0–2 Loops & Launch!';
    this.ballType = 'steel';
    this.rampHeightNorm = 0.78;
    this.maxPinScatterCm = 0;
    this.pinsKnockedCount = 0;
    this.impactKE = 0;
    this._rebuildCoasterTrack();
    this._resetRampScene();
  }

  getCameraLocalPreset() {
    if (this.mode === 'ramp') {
      return {
        pos: new THREE.Vector3(0.05, 0.92, 1.72),
        target: new THREE.Vector3(0.05, 0.16, 0.42)
      };
    }
    return {
      pos: new THREE.Vector3(0.0, 1.08, 1.62),
      target: new THREE.Vector3(-0.04, 0.36, -0.34)
    };
  }

  update(dt) {
    // 1. Roller Coaster Conservation of Energy + Loop Clearance Physics
    if (this.coasterRunning) {
      const pt = this.coasterCurve.getPointAt(this.cartU);
      const hScaled = Math.max(0, (pt.y - this.minTrackY) / 0.88) * 10;
      const pe = this.cartMass * 9.81 * hScaled;
      let availKE = this.initialEnergyJ - pe - this.thermalLossJ;

      if (availKE <= 0.25) {
        const tan = this.coasterCurve.getTangentAt(this.cartU);
        if (this.cartDir === 1) {
          this.coasterStatus =
            '⚠️ Stalled! Not enough starting Potential Energy to clear the crest — raise Start Height!';
          this.audio.playClick(320, 0.2);
        }
        this.cartDir = tan.y > 0 ? -1 : 1;
        availKE = 0.4;
        if (Math.abs(tan.y) < 0.045 || this.thermalLossJ > this.initialEnergyJ * 0.88) {
          this.coasterRunning = false;
        }
      }

      const vPhysical = Math.sqrt((2 * Math.max(0, availKE)) / this.cartMass);
      const ds = Math.max(0.2, vPhysical * 0.21) * dt;
      this.cartU += (this.cartDir * ds) / this.trackLength;

      if (this.frictionEnabled) {
        this.thermalLossJ = Math.min(
          this.initialEnergyJ,
          this.thermalLossJ + this.cartMass * 9.81 * ds * 0.52
        );
      }

      if (this.cartU >= 0.985) {
        this.cartU = 0.985;
        this.coasterRunning = false;
        this.coasterStatus = `🏁 Success! Cart cleared ${
          this.loopCount === 0 ? 'all hills' : `${this.loopCount} loop${this.loopCount > 1 ? 's' : ''}`
        }!`;
        this.audio.playSensorSuccess();
      } else if (this.cartU <= 0.015 && this.cartDir === -1) {
        this.cartU = 0.015;
        this.coasterRunning = false;
      }

      this._positionCartAtU(this.cartU);
      const nextPt = this.coasterCurve.getPointAt(this.cartU);
      this._computeEnergyStats(
        Math.max(0, (nextPt.y - this.minTrackY) / 0.88) * 10,
        this.coasterRunning ? vPhysical : 0
      );
    }

    // 2. Inclined Ramp & Chain-Reaction 6-Pin Scatter Physics
    if (this.rampRunning) {
      const angle = -this.rampPivot.rotation.z;
      const mass = this.ballType === 'steel' ? 5.0 : 0.25;

      if (this.ballRampDist < this.rampLen) {
        const accel = (5 / 7) * 9.81 * Math.sin(angle) * 0.62;
        this.ballLinearVel += accel * dt;
        this.ballRampDist += this.ballLinearVel * dt;
        this.rampBall.rotation.z -= (this.ballLinearVel / this.ballRadius) * dt;
        if (this.ballRampDist >= this.rampLen) {
          this.ballRunwayX = -0.35;
          this.impactKE = Number((0.5 * mass * Math.pow(this.ballLinearVel * 2.2, 2)).toFixed(1));
        }
      } else {
        this.ballRunwayX += this.ballLinearVel * dt;
        this.ballLinearVel *= Math.pow(0.76, dt);
        this.rampBall.rotation.z -= (this.ballLinearVel / this.ballRadius) * dt;

        // A. Ball-to-Pin Collisions
        const pinMass = 0.35;
        let hitCount = 0;
        for (const p of this.pins) {
          const dx = p.pos.x - this.ballRunwayX;
          const dz = p.pos.z - this.ballRunwayZ;
          const dist = Math.hypot(dx, dz);
          if (!p.knocked && dist < this.ballRadius + 0.036 && this.ballLinearVel > 0.12) {
            p.knocked = true;
            hitCount++;
            const nx = Math.max(0.45, dx / Math.max(0.001, dist));
            const spreadZ = dz === 0 ? (Math.random() - 0.5) * 0.45 : Math.sign(dz) * (0.35 + Math.random() * 0.35);
            const transfer = ((1.9 * mass) / (mass + pinMass)) * this.ballLinearVel;
            p.vel.set(nx * transfer * 1.35, 0.04 + transfer * 0.22, spreadZ * transfer * 0.85);
            p.rotVel.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12, -transfer * 9);

            // Heavy steel ball plows right through; light tennis ball loses speed / bounces!
            const retain = mass > 1 ? 0.91 : -0.22;
            this.ballLinearVel *= retain;
          }
        }

        // B. Pin-to-Pin Domino / Bowling Chain-Reaction Collisions (so back-row outer pins get blasted too!)
        for (let i = 0; i < this.pins.length; i++) {
          const a = this.pins[i];
          if (!a.knocked || a.vel.lengthSq() < 0.08) continue;
          for (let j = 0; j < this.pins.length; j++) {
            if (i === j) continue;
            const b = this.pins[j];
            if (b.knocked) continue;
            const dx = b.pos.x - a.pos.x;
            const dz = b.pos.z - a.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.068) {
              b.knocked = true;
              hitCount++;
              const spd = a.vel.length() * 0.88;
              const nx = Math.max(0.4, dx / Math.max(0.001, dist));
              const nz = (dz / Math.max(0.001, dist)) * 0.9 + (Math.random() - 0.5) * 0.25;
              b.vel.set(nx * spd, 0.04 + spd * 0.18, nz * spd);
              b.rotVel.set((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 12, -spd * 8);
              a.vel.multiplyScalar(0.75);
            }
          }
        }

        if (hitCount > 0) {
          this.audio.playPinScatter(mass > 1 ? 0.95 : 0.35, Math.min(6, hitCount + 2));
        }

        if (this.ballRunwayX > 1.36) {
          this.ballRunwayX = 1.36;
          this.ballLinearVel = 0;
        }
      }
      this._updateRampBallPosition();

      let anyMoving = Math.abs(this.ballLinearVel) > 0.025;
      let knockedTotal = 0;
      for (const p of this.pins) {
        if (!p.knocked) continue;
        knockedTotal++;
        p.vel.y -= 9.81 * dt;
        p.pos.addScaledVector(p.vel, dt);

        if (p.pos.y <= 0.042) {
          p.pos.y = 0.042;
          p.vel.y = Math.abs(p.vel.y) * 0.25;
          p.vel.x *= Math.pow(0.18, dt);
          p.vel.z *= Math.pow(0.18, dt);
          p.rotVel.multiplyScalar(Math.pow(0.22, dt));
        }
        if (p.pos.x > 1.38) {
          p.pos.x = 1.38;
          p.vel.x *= -0.35;
        }
        if (Math.abs(p.pos.z) > 0.195) {
          p.pos.z = Math.sign(p.pos.z) * 0.195;
          p.vel.z *= -0.45;
        }

        p.group.position.copy(p.pos);
        p.group.rotation.x += p.rotVel.x * dt;
        p.group.rotation.y += p.rotVel.y * dt;
        p.group.rotation.z = Math.min(Math.PI / 2, Math.abs(p.group.rotation.z + p.rotVel.z * dt)) * -1;

        const scatterCm = Math.round(Math.hypot(p.pos.x - p.homeX, p.pos.z - p.homeZ) * 100);
        if (scatterCm > this.maxPinScatterCm) this.maxPinScatterCm = scatterCm;
        if (p.vel.lengthSq() > 0.001) anyMoving = true;
      }
      this.pinsKnockedCount = knockedTotal;

      if (!anyMoving && this.ballRampDist >= this.rampLen) {
        this.rampRunning = false;
      }
    }
  }
}
