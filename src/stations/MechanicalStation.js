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

    // Apparatus A: Roller Coaster Track state
    this.releaseHeightNorm = 0.88; // 0.35 -> 1.0 (controls start position/height on lift hill)
    this.cartMass = 4.0; // kg (1.0 -> 10.0)
    this.frictionEnabled = false;
    this.coasterRunning = false;

    // Real-time Energy Telemetry (Joules)
    this.energyStats = {
      pe: 0,
      ke: 0,
      thermal: 0,
      total: 1,
      speed: 0
    };

    // Apparatus B: Ramp Collision Test state
    this.ballType = 'steel'; // 'steel' (5.0 kg) | 'tennis' (0.25 kg)
    this.rampHeightNorm = 0.78; // 0.25 -> 1.0
    this.rampRunning = false;
    this.maxPinScatterCm = 0;
    this.impactKE = 0;

    this.interactables = [];

    this._buildRollerCoaster();
    this._buildRampCollision();
    this._resetCartToStart();
    this._resetRampScene();
  }

  // =========================================================================
  // APPARATUS A: 3D TUBULAR STEEL ROLLER COASTER (REAR HALF OF BENCH)
  // =========================================================================
  _buildRollerCoaster() {
    this.coasterGroup = new THREE.Group();
    this.coasterGroup.position.set(0, 0, -0.32);
    this.root.add(this.coasterGroup);

    // Parameterized Coaster Spline with Lift Hill -> Valley -> 360° Vertical Clothoid Loop -> Camelback Hill -> Brake Run
    const pts = [];
    // 1. Steep Lift Hill Peak & First Drop (x: -1.42 -> -0.46)
    pts.push(new THREE.Vector3(-1.44, 0.74, 0.0));
    pts.push(new THREE.Vector3(-1.26, 0.68, 0.0));
    pts.push(new THREE.Vector3(-0.96, 0.42, 0.0));
    pts.push(new THREE.Vector3(-0.66, 0.14, 0.0));
    pts.push(new THREE.Vector3(-0.36, 0.09, 0.015));

    // 2. 360° Vertical Clothoid Loop-the-Loop centered around x = -0.08, radius = 0.21 (crest at y = 0.51)
    const loopCx = -0.08;
    const loopCy = 0.30;
    const loopR = 0.21;
    for (let i = 0; i <= 12; i++) {
      const theta = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const lx = loopCx + Math.cos(theta) * loopR * 0.92;
      const ly = loopCy + Math.sin(theta) * loopR;
      const lz = -0.03 + (i / 12) * 0.07; // helical offset so rails pass cleanly beside each other!
      pts.push(new THREE.Vector3(lx, ly, lz));
    }

    // 3. Post-loop valley -> Camelback Hill (crest y = 0.34) -> Cushioned Brake Run
    pts.push(new THREE.Vector3(0.26, 0.10, 0.04));
    pts.push(new THREE.Vector3(0.58, 0.34, 0.02));
    pts.push(new THREE.Vector3(0.92, 0.12, 0.0));
    pts.push(new THREE.Vector3(1.22, 0.11, 0.0));
    pts.push(new THREE.Vector3(1.44, 0.12, 0.0));

    this.coasterCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    this.trackLength = this.coasterCurve.getLength();
    this.minTrackY = 0.09;

    // Build Twin Tubular Steel Rails + Spine + Support Columns
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.26,
      metalness: 0.78
    });
    const spineMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.82
    });

    const spineGeo = new THREE.TubeGeometry(this.coasterCurve, 220, 0.012, 8, false);
    const spineMesh = new THREE.Mesh(spineGeo, spineMat);
    spineMesh.castShadow = true;
    this.coasterGroup.add(spineMesh);

    // Offset twin rails + crossties
    const leftPts = [];
    const rightPts = [];
    const samples = 180;
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
        this.coasterGroup.add(tie);
      }
    }

    const leftCurve = new THREE.CatmullRomCurve3(leftPts);
    const rightCurve = new THREE.CatmullRomCurve3(rightPts);
    this.coasterGroup.add(new THREE.Mesh(new THREE.TubeGeometry(leftCurve, 180, 0.0065, 8, false), railMat));
    this.coasterGroup.add(new THREE.Mesh(new THREE.TubeGeometry(rightCurve, 180, 0.0065, 8, false), railMat));

    // Support Stanchion Columns anchored to baseplate
    const supportUs = [0.01, 0.09, 0.18, 0.36, 0.50, 0.72, 0.82, 0.92, 0.99];
    supportUs.forEach((u) => {
      const p = this.coasterCurve.getPointAt(u);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, p.y, 10), spineMat);
      col.position.set(p.x, p.y / 2, p.z - 0.035);
      col.castShadow = true;
      this.coasterGroup.add(col);
    });

    // End brake bumper
    const bumper = new THREE.Mesh(
      new RoundedBoxGeometry(0.05, 0.07, 0.11, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
    );
    bumper.position.set(1.45, 0.14, 0);
    this.coasterGroup.add(bumper);

    // 3D Test Coaster Cart
    this.cartGroup = new THREE.Group();
    this.coasterGroup.add(this.cartGroup);

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.18,
      metalness: 0.82
    });
    const cartBody = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.048, 0.084, 3, 0.012), chassisMat);
    cartBody.position.y = 0.036;
    cartBody.castShadow = true;
    cartBody.userData = { action: 'launchCoaster' };
    this.cartGroup.add(cartBody);

    // Weighted brass mass block inside cart (scales visually with Cart Mass slider!)
    this.massBlock = new THREE.Mesh(
      new RoundedBoxGeometry(0.065, 0.036, 0.056, 2, 0.006),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.9 })
    );
    this.massBlock.position.y = 0.065;
    this.massBlock.userData = { action: 'launchCoaster' };
    this.cartGroup.add(this.massBlock);

    // 4 Road Wheels
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

    this.interactables.push(cartBody, this.massBlock);
  }

  // =========================================================================
  // APPARATUS B: INCLINED RAMP COLLISION TEST (FRONT LANE OF BENCH)
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

    // Flat Runway Lane from x = -1.42 to +1.42
    const runway = new THREE.Mesh(new RoundedBoxGeometry(2.88, 0.024, 0.44, 3, 0.006), laneMat);
    runway.position.y = 0.012;
    runway.receiveShadow = true;
    this.rampGroup.add(runway);

    // Side guardrails along collision zone so scattered pins stay on the bench
    [-0.215, 0.215].forEach((gz) => {
      const guard = new THREE.Mesh(new RoundedBoxGeometry(2.88, 0.055, 0.016, 2, 0.004), railMat);
      guard.position.set(0, 0.04, gz);
      this.rampGroup.add(guard);
    });

    const endStop = new THREE.Mesh(new RoundedBoxGeometry(0.025, 0.09, 0.44, 2, 0.004), railMat);
    endStop.position.set(1.43, 0.05, 0);
    this.rampGroup.add(endStop);

    // Distance Ruler Stripes along runway beyond pin line (x = 0.25 -> 1.35)
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 });
    for (let i = 1; i <= 5; i++) {
      const sx = 0.25 + i * 0.22;
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.38), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.025, 0);
      this.rampGroup.add(stripe);
    }

    // Inclined Hardwood Ramp hinged at bottom x = -0.35, y = 0.024, extending left to x = -1.32
    this.rampPivot = new THREE.Group();
    this.rampPivot.position.set(-0.35, 0.024, 0);
    this.rampGroup.add(this.rampPivot);

    this.rampLen = 1.02;
    const plank = new THREE.Mesh(new RoundedBoxGeometry(this.rampLen, 0.022, 0.26, 2, 0.005), woodMat);
    plank.position.set(-this.rampLen / 2, 0.011, 0);
    plank.castShadow = true;
    plank.receiveShadow = true;
    this.rampPivot.add(plank);

    // Adjustable Vertical Support Jack under left end of ramp
    this.rampSupportPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1, 14), railMat);
    this.rampSupportPost.position.set(-1.26, 0.2, 0);
    this.rampGroup.add(this.rampSupportPost);

    // Rolling Test Ball (switches between 5.0kg Mirror-Steel Bowling Ball & 0.25kg Felt Tennis Ball)
    this.steelBallMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.08,
      metalness: 0.96
    });
    this.tennisBallMat = new THREE.MeshStandardMaterial({
      color: 0xa3e635,
      roughness: 0.86,
      metalness: 0.02
    });

    this.rampBall = new THREE.Mesh(new THREE.SphereGeometry(0.052, 28, 28), this.steelBallMat);
    this.rampBall.castShadow = true;
    this.rampBall.userData = { action: 'launchRampBall' };
    this.rampGroup.add(this.rampBall);
    this.interactables.push(this.rampBall);

    // 6 Target Pins arranged in a 3-row triangle starting at x = 0.25
    this.pins = [];
    const pinCoords = [
      [0.25, 0.0],
      [0.35, -0.055],
      [0.35, 0.055],
      [0.45, -0.11],
      [0.45, 0.0],
      [0.45, 0.11]
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

  _resetCartToStart() {
    this.coasterRunning = false;
    // Map releaseHeightNorm (0.35..1.0) along initial lift hill drop (u = 0.14 down to 0.01)
    this.cartU = 0.155 - this.releaseHeightNorm * 0.145;
    this.cartDir = 1; // +1 forward, -1 backward if stalled!
    this.cartSpeed = 0.12;
    this.thermalLossJ = 0;

    const scaleM = 0.65 + (this.cartMass / 10) * 0.65;
    this.massBlock.scale.set(scaleM, scaleM, scaleM);

    const startPt = this.coasterCurve.getPointAt(this.cartU);
    const h0 = Math.max(0, startPt.y - this.minTrackY) * 10; // scaled meters for crisp 5th-grade Joule numbers
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
    this.audio.playClick(680, 0.25);
  }

  _resetRampScene() {
    this.rampRunning = false;
    this.rampCollided = false;

    const angle = 0.12 + this.rampHeightNorm * 0.34; // radians incline
    this.rampPivot.rotation.z = -angle;

    const leftEndH = 0.024 + Math.sin(angle) * 0.91;
    this.rampSupportPost.scale.y = Math.max(0.05, leftEndH);
    this.rampSupportPost.position.y = leftEndH / 2;

    const isSteel = this.ballType === 'steel';
    this.ballRadius = isSteel ? 0.052 : 0.041;
    this.rampBall.scale.setScalar(isSteel ? 1.0 : 0.8);
    this.rampBall.material = isSteel ? this.steelBallMat : this.tennisBallMat;

    // Place ball near top of incline
    this.ballRampDist = 0.08; // 0 at top (-rampLen), rampLen at bottom pivot
    this.ballLinearVel = 0;
    this.ballRunwayX = -0.35;
    this.ballRunwayZ = 0;
    this.ballVz = 0;
    this._updateRampBallPosition();

    this.pins.forEach((p) => {
      p.pos.set(p.homeX, 0.024, p.homeZ);
      p.vel.set(0, 0, 0);
      p.rotVel.set(0, 0, 0);
      p.knocked = false;
      p.group.position.copy(p.pos);
      p.group.rotation.set(0, 0, 0);
    });
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
    this.rampRunning = true;
    this.audio.playClick(540, 0.24);
  }

  onPointerDown(hit) {
    const act = hit?.object?.userData?.action;
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

  onPointerMove() {}
  onPointerUp() {}

  setActive(active) {
    this.isActive = active;
  }

  reset() {
    this.releaseHeightNorm = 0.88;
    this.cartMass = 4.0;
    this.frictionEnabled = false;
    this.ballType = 'steel';
    this.rampHeightNorm = 0.78;
    this.maxPinScatterCm = 0;
    this.impactKE = 0;
    this._resetCartToStart();
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
      pos: new THREE.Vector3(0.0, 1.05, 1.52),
      target: new THREE.Vector3(0.0, 0.34, -0.32)
    };
  }

  update(dt) {
    // 1. Roller Coaster Physics (Conservation of Mechanical Energy + Optional Friction)
    if (this.coasterRunning) {
      const pt = this.coasterCurve.getPointAt(this.cartU);
      const hMeters = Math.max(0, pt.y - this.minTrackY) * 10;
      const pe = this.cartMass * 9.81 * hMeters;
      let availKE = this.initialEnergyJ - pe - this.thermalLossJ;

      if (availKE <= 0.15) {
        // Cart ran out of kinetic energy on an uphill slope! Reverse direction down the slope!
        const tan = this.coasterCurve.getTangentAt(this.cartU);
        this.cartDir = tan.y > 0 ? -1 : 1;
        availKE = 0.35;
        if (Math.abs(tan.y) < 0.04 || this.thermalLossJ > this.initialEnergyJ * 0.92) {
          this.coasterRunning = false;
        }
      }

      const vPhysical = Math.sqrt((2 * Math.max(0, availKE)) / this.cartMass); // m/s
      const ds = Math.max(0.18, vPhysical * 0.19) * dt;
      this.cartU += (this.cartDir * ds) / this.trackLength;

      if (this.frictionEnabled) {
        this.thermalLossJ = Math.min(
          this.initialEnergyJ,
          this.thermalLossJ + this.cartMass * 9.81 * ds * 0.85
        );
      }

      if (this.cartU >= 0.985) {
        this.cartU = 0.985;
        this.coasterRunning = false;
        this.audio.playClick(420, 0.25);
      } else if (this.cartU <= 0.01) {
        this.cartU = 0.01;
        this.cartDir = 1;
      }

      this._positionCartAtU(this.cartU);
      const nextPt = this.coasterCurve.getPointAt(this.cartU);
      this._computeEnergyStats(
        Math.max(0, nextPt.y - this.minTrackY) * 10,
        this.coasterRunning ? vPhysical : 0
      );
    }

    // 2. Inclined Ramp & Multi-Pin Collision Physics
    if (this.rampRunning) {
      const angle = -this.rampPivot.rotation.z;
      const mass = this.ballType === 'steel' ? 5.0 : 0.25;

      if (this.ballRampDist < this.rampLen) {
        // Solid sphere rolling down incline: a = (5/7) g sin(theta)
        const accel = (5 / 7) * 9.81 * Math.sin(angle) * 0.55;
        this.ballLinearVel += accel * dt;
        this.ballRampDist += this.ballLinearVel * dt;
        this.rampBall.rotation.z -= (this.ballLinearVel / this.ballRadius) * dt;
        if (this.ballRampDist >= this.rampLen) {
          this.ballRunwayX = -0.35;
          this.impactKE = Number((0.5 * mass * Math.pow(this.ballLinearVel * 2.2, 2)).toFixed(1));
        }
      } else {
        // Rolling along flat runway toward pins
        this.ballRunwayX += this.ballLinearVel * dt;
        this.ballRunwayZ += this.ballVz * dt;
        this.ballLinearVel *= Math.pow(0.72, dt);
        this.rampBall.rotation.z -= (this.ballLinearVel / this.ballRadius) * dt;

        // Sphere-to-Pin Momentum Transfer!
        const pinMass = 0.42;
        let hitCount = 0;
        for (const p of this.pins) {
          const dx = p.pos.x - this.ballRunwayX;
          const dz = p.pos.z - this.ballRunwayZ;
          const dist = Math.hypot(dx, dz);
          if (!p.knocked && dist < this.ballRadius + 0.032) {
            p.knocked = true;
            hitCount++;
            const nx = dx / Math.max(0.001, dist);
            const nz = (dz + (Math.random() - 0.5) * 0.025) / Math.max(0.001, dist);

            // Elastic momentum transfer: 2 * m_ball / (m_ball + m_pin) * v_ball
            const transfer = ((1.85 * mass) / (mass + pinMass)) * this.ballLinearVel;
            p.vel.set(nx * transfer * 1.35, 0.03 + transfer * 0.22, nz * transfer * 1.15);
            p.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, -transfer * 8);

            // Ball slows/rebounds depending on mass ratio! (Light tennis ball bounces back off heavy pins!)
            const ballFactor = (mass - pinMass) / (mass + pinMass);
            this.ballLinearVel *= Math.max(-0.35, ballFactor);
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

      // Integrate knocked pins & compute max scatter distance in cm
      let anyMoving = Math.abs(this.ballLinearVel) > 0.02;
      for (const p of this.pins) {
        if (!p.knocked) continue;
        p.vel.y -= 9.81 * dt;
        p.pos.addScaledVector(p.vel, dt);

        if (p.pos.y <= 0.042) {
          p.pos.y = 0.042;
          p.vel.y = Math.abs(p.vel.y) * 0.25;
          p.vel.x *= Math.pow(0.18, dt);
          p.vel.z *= Math.pow(0.18, dt);
          p.rotVel.multiplyScalar(Math.pow(0.22, dt));
        }
        if (p.pos.x > 1.38) { p.pos.x = 1.38; p.vel.x *= -0.35; }
        if (Math.abs(p.pos.z) > 0.185) {
          p.pos.z = Math.sign(p.pos.z) * 0.185;
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

      if (!anyMoving && this.ballRampDist >= this.rampLen) {
        this.rampRunning = false;
      }
    }
  }
}
