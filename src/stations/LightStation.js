import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProceduralTextures } from '../engine/ProceduralTextures.js';

export class LightStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    this.mode = 'reflection'; // 'reflection' | 'refraction' | 'shadow'

    // Mode A: Laser & Mirror Puzzle state
    // Default angles bounce near the baffles/target so students rotate mirrors slightly to hit the sensor!
    this.mirrorAngles = [36, 52, -38]; // degrees around Y
    this.sensorHit = false;
    this.wasSensorHit = false;
    this.reflectionAnnotations = []; // [{ worldPos, incDeg, refDeg }]
    this.draggingMirrorIdx = -1;

    // Mode B: Refraction Chamber state
    this.waterLevel = 0.72; // 0.35 -> 0.9
    this.pencilOffset = 0.0; // -0.25 -> 0.25
    this.prismAngle = 14; // degrees
    this.showRefractionGuide = true;

    // Mode C: Shadow Lab state
    this.blockMaterial = 'opaque'; // 'opaque' | 'translucent' | 'transparent'
    this.lightDistance = 0.55; // 0 (close to block = huge shadow) -> 1 (far = crisp smaller shadow)
    this.lightLateral = 0.0; // -0.3 -> 0.3
    this.draggingLight = false;

    this.interactables = [];

    this._buildOpticalBreadboard();
    this._buildModeReflection();
    this._buildModeRefraction();
    this._buildModeShadow();
    this.setMode('reflection');
  }

  _buildOpticalBreadboard() {
    const boardTex = ProceduralTextures.getOpticalBreadboardTexture();
    const board = new THREE.Mesh(
      new RoundedBoxGeometry(3.12, 0.032, 1.48, 3, 0.008),
      new THREE.MeshStandardMaterial({
        map: boardTex,
        roughness: 0.42,
        metalness: 0.65
      })
    );
    board.position.y = 0.016;
    board.receiveShadow = true;
    this.root.add(board);
  }

  // =========================================================================
  // MODE A: LASER & MIRROR REFLECTION PUZZLE
  // =========================================================================
  _buildModeReflection() {
    this.reflectionGroup = new THREE.Group();
    this.reflectionGroup.position.y = 0.032;
    this.root.add(this.reflectionGroup);

    const brushed = ProceduralTextures.getBrushedMetalBump();
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      bumpMap: brushed,
      bumpScale: 0.004,
      roughness: 0.3,
      metalness: 0.85
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.25,
      metalness: 0.9
    });

    // HeNe Laser Emitter at (-1.22, 0.16, 0.36) firing +X
    this.laserOrigin = new THREE.Vector2(-1.05, 0.36);
    this.laserDir = new THREE.Vector2(1, 0);

    const laserGroup = new THREE.Group();
    laserGroup.position.set(-1.22, 0, 0.36);
    this.reflectionGroup.add(laserGroup);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.12, 20), mountMat);
    pedestal.position.y = 0.06;
    laserGroup.add(pedestal);

    const barrel = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.09, 0.1, 3, 0.014), mountMat);
    barrel.position.y = 0.16;
    barrel.castShadow = true;
    laserGroup.add(barrel);

    const aperture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.03, 16),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: new THREE.Color(0x22d3ee),
        emissiveIntensity: 2.2
      })
    );
    aperture.rotation.z = Math.PI / 2;
    aperture.position.set(0.175, 0.16, 0);
    laserGroup.add(aperture);

    // Opaque Optical Baffles (Obstacles students must bounce around!)
    this.obstacles = [
      { x: -0.48, z: 0.28, w: 0.07, d: 0.54 },
      { x: 0.24, z: 0.12, w: 0.07, d: 0.54 }
    ];
    const baffleMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.4
    });
    this.obstacles.forEach((ob) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(ob.w, 0.28, ob.d, 2, 0.008), baffleMat);
      mesh.position.set(ob.x, 0.14, ob.z);
      mesh.castShadow = true;
      this.reflectionGroup.add(mesh);

      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(ob.w + 0.004, 0.016, ob.d + 0.004),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b })
      );
      stripe.position.set(ob.x, 0.26, ob.z);
      this.reflectionGroup.add(stripe);
    });

    // 3 Rotatable Front-Surface Gimbal Mirrors
    // Placed so angles [45, -45, 45] route cleanly around both baffles straight into the target!
    const mirrorCoords = [
      { x: -0.82, z: 0.36 },
      { x: -0.82, z: -0.44 },
      { x: 0.88, z: -0.44 }
    ];
    this.mirrors = [];

    const glassMirrorMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.03,
      metalness: 0.99
    });

    mirrorCoords.forEach((mc, idx) => {
      const mGroup = new THREE.Group();
      mGroup.position.set(mc.x, 0, mc.z);
      this.reflectionGroup.add(mGroup);

      const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.025, 28), brassMat);
      baseRing.position.y = 0.0125;
      baseRing.userData = { mirrorIdx: idx };
      mGroup.add(baseRing);

      const gimbal = new THREE.Group();
      gimbal.position.y = 0.16;
      mGroup.add(gimbal);

      const backing = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.19, 0.018, 2, 0.004), mountMat);
      backing.castShadow = true;
      backing.userData = { mirrorIdx: idx };
      gimbal.add(backing);

      const reflectiveFace = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.17), glassMirrorMat);
      reflectiveFace.position.z = 0.011;
      reflectiveFace.userData = { mirrorIdx: idx };
      gimbal.add(reflectiveFace);

      const reflectiveBack = reflectiveFace.clone();
      reflectiveBack.rotation.y = Math.PI;
      reflectiveBack.position.z = -0.011;
      reflectiveBack.userData = { mirrorIdx: idx };
      gimbal.add(reflectiveBack);

      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 18), brassMat);
      knob.position.y = 0.115;
      knob.userData = { mirrorIdx: idx };
      gimbal.add(knob);

      this.interactables.push(baseRing, backing, reflectiveFace, reflectiveBack, knob);
      this.mirrors.push({ group: mGroup, gimbal, x: mc.x, z: mc.z, halfWidth: 0.13 });
    });

    // Light Sensor Target Dome at (0.88, 0.16, 0.34)
    this.sensorTarget = { x: 0.88, z: 0.34, radius: 0.095 };
    const sensorGroup = new THREE.Group();
    sensorGroup.position.set(this.sensorTarget.x, 0, this.sensorTarget.z);
    this.reflectionGroup.add(sensorGroup);

    const sensorStand = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.12, 24), mountMat);
    sensorStand.position.y = 0.06;
    sensorGroup.add(sensorStand);

    this.sensorDomeMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: new THREE.Color(0x10b981),
      emissiveIntensity: 0.08,
      roughness: 0.2,
      metalness: 0.2
    });
    const sensorDome = new THREE.Mesh(new THREE.SphereGeometry(0.078, 28, 28), this.sensorDomeMat);
    sensorDome.position.y = 0.16;
    sensorGroup.add(sensorDome);

    this.sensorPointLight = new THREE.PointLight(0x10b981, 0, 1.6);
    this.sensorPointLight.position.set(this.sensorTarget.x, 0.26, this.sensorTarget.z);
    this.reflectionGroup.add(this.sensorPointLight);

    // Dynamic Laser Ray Segments + Dashed Normal Lines pool
    this.beamGroup = new THREE.Group();
    this.reflectionGroup.add(this.beamGroup);
    this._updateReflectionRays();
  }

  _updateReflectionRays() {
    while (this.beamGroup.children.length) {
      const c = this.beamGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    this.reflectionAnnotations = [];

    // Apply mirror rotations
    this.mirrors.forEach((m, i) => {
      m.gimbal.rotation.y = THREE.MathUtils.degToRad(this.mirrorAngles[i]);
    });

    const beamCoreMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    const beamGlowMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.48
    });
    const normalLineMat = new THREE.LineDashedMaterial({
      color: 0xfacc15,
      dashSize: 0.03,
      gapSize: 0.02
    });

    let origin = this.laserOrigin.clone();
    let dir = this.laserDir.clone().normalize();
    let hitSensor = false;

    for (let bounce = 0; bounce < 5; bounce++) {
      let bestT = 3.2;
      let hitType = 'end';
      let hitNormal = null;
      let hitMirrorIndex = -1;

      // 1. Check mirror intersections in 2D (x, z)
      this.mirrors.forEach((m, idx) => {
        if (idx === this._lastMirrorHit && bounce > 0) return;
        const rad = THREE.MathUtils.degToRad(this.mirrorAngles[idx]);
        // Mirror plane tangent in XZ when rotation.y = rad: local X=(cos rad, -sin rad)
        const tx = Math.cos(rad);
        const tz = -Math.sin(rad);
        const p1 = new THREE.Vector2(m.x - tx * m.halfWidth, m.z - tz * m.halfWidth);
        const p2 = new THREE.Vector2(m.x + tx * m.halfWidth, m.z + tz * m.halfWidth);

        const res = this._raySegmentIntersect(origin, dir, p1, p2);
        if (res && res.t > 0.015 && res.t < bestT) {
          bestT = res.t;
          hitType = 'mirror';
          hitMirrorIndex = idx;
          let n = new THREE.Vector2(-tz, tx).normalize();
          if (n.dot(dir) > 0) n.negate();
          hitNormal = n;
        }
      });

      // 2. Check obstacle AABB intersections
      this.obstacles.forEach((ob) => {
        const t = this._rayBoxIntersect(origin, dir, ob.x - ob.w / 2, ob.z - ob.d / 2, ob.x + ob.w / 2, ob.z + ob.d / 2);
        if (t !== null && t > 0.01 && t < bestT) {
          bestT = t;
          hitType = 'obstacle';
        }
      });

      // 3. Check Sensor Target circle intersection
      const tSensor = this._rayCircleIntersect(origin, dir, this.sensorTarget.x, this.sensorTarget.z, this.sensorTarget.radius);
      if (tSensor !== null && tSensor > 0.01 && tSensor < bestT) {
        bestT = tSensor;
        hitType = 'sensor';
      }

      // Clamp inside optical breadboard bounds
      const endPt = origin.clone().addScaledVector(dir, bestT);
      if (Math.abs(endPt.x) > 1.52 || Math.abs(endPt.y) > 0.7) {
        const tx = dir.x > 0 ? (1.52 - origin.x) / dir.x : dir.x < 0 ? (-1.52 - origin.x) / dir.x : 99;
        const tz = dir.y > 0 ? (0.7 - origin.y) / dir.y : dir.y < 0 ? (-0.7 - origin.y) / dir.y : 99;
        const tBound = Math.max(0.02, Math.min(bestT, tx, tz));
        if (tBound < bestT) {
          bestT = tBound;
          hitType = 'wall';
          endPt.copy(origin).addScaledVector(dir, bestT);
        }
      }

      // Draw volumetric laser cylinder from origin to endPt at y = 0.16
      this._addBeamSegment(this.beamGroup, origin, endPt, 0.16, beamCoreMat, beamGlowMat);

      // Glowing laser spot at hit point
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 12), beamCoreMat);
      spot.position.set(endPt.x, 0.16, endPt.y);
      this.beamGroup.add(spot);

      if (hitType === 'sensor') {
        hitSensor = true;
        break;
      }

      if (hitType === 'mirror' && hitNormal) {
        this._lastMirrorHit = hitMirrorIndex;
        // Draw dashed Normal Line perpendicular to mirror surface
        const nEnd = endPt.clone().addScaledVector(hitNormal, 0.24);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(endPt.x, 0.162, endPt.y),
          new THREE.Vector3(nEnd.x, 0.162, nEnd.y)
        ]);
        const nLine = new THREE.Line(lineGeo, normalLineMat);
        nLine.computeLineDistances();
        this.beamGroup.add(nLine);

        // Compute Angle of Incidence (= Angle of Reflection!)
        const cosTheta = Math.min(1, Math.max(-1, -dir.dot(hitNormal)));
        const angleDeg = Math.round(THREE.MathUtils.radToDeg(Math.acos(cosTheta)));

        const worldAnchor = new THREE.Vector3(endPt.x, 0.34, endPt.y);
        this.reflectionGroup.localToWorld(worldAnchor);
        this.reflectionAnnotations.push({
          mirrorNumber: hitMirrorIndex + 1,
          worldPos: worldAnchor,
          angleDeg
        });

        // Reflect ray: r = d - 2(d·n)n
        dir = dir.clone().sub(hitNormal.clone().multiplyScalar(2 * dir.dot(hitNormal))).normalize();
        origin = endPt;
      } else {
        break;
      }
    }
    this._lastMirrorHit = -1;

    this.sensorHit = hitSensor;
    this.sensorDomeMat.emissiveIntensity = hitSensor ? 2.4 : 0.08;
    this.sensorDomeMat.color.setHex(hitSensor ? 0x34d399 : 0x334155);
    this.sensorPointLight.intensity = hitSensor ? 2.2 : 0;

    if (hitSensor && !this.wasSensorHit && this.isActive) {
      this.audio.playSensorSuccess();
    }
    this.wasSensorHit = hitSensor;
  }

  _addBeamSegment(parent, pA, pB, y, coreMat, glowMat) {
    const dx = pB.x - pA.x;
    const dz = pB.y - pA.y;
    const len = Math.hypot(dx, dz);
    if (len < 0.005) return;
    const midX = (pA.x + pB.x) / 2;
    const midZ = (pA.y + pB.y) / 2;
    const angle = Math.atan2(dx, dz);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, len, 10), coreMat);
    core.rotation.x = Math.PI / 2;
    core.rotation.z = -angle;
    // Simpler exact orientation using quaternion from +Y to direction:
    const dir3 = new THREE.Vector3(dx, 0, dz).normalize();
    core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir3);
    core.position.set(midX, y, midZ);
    parent.add(core);

    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, len, 12), glowMat);
    glow.quaternion.copy(core.quaternion);
    glow.position.copy(core.position);
    parent.add(glow);
  }

  _raySegmentIntersect(ro, rd, a, b) {
    const v1 = ro.clone().sub(a);
    const v2 = b.clone().sub(a);
    const v3 = new THREE.Vector2(-rd.y, rd.x);
    const dot = v2.dot(v3);
    if (Math.abs(dot) < 1e-6) return null;
    const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
    const t2 = v1.dot(v3) / dot;
    if (t1 >= 0 && t2 >= 0 && t2 <= 1) return { t: t1 };
    return null;
  }

  _rayBoxIntersect(ro, rd, minX, minZ, maxX, maxZ) {
    const invX = rd.x !== 0 ? 1 / rd.x : 1e9;
    const invZ = rd.y !== 0 ? 1 / rd.y : 1e9;
    const t1 = (minX - ro.x) * invX;
    const t2 = (maxX - ro.x) * invX;
    const t3 = (minZ - ro.y) * invZ;
    const t4 = (maxZ - ro.y) * invZ;
    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
    const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
    if (tmax < 0 || tmin > tmax) return null;
    return tmin >= 0 ? tmin : tmax;
  }

  _rayCircleIntersect(ro, rd, cx, cz, r) {
    const ocX = ro.x - cx;
    const ocZ = ro.y - cz;
    const b = ocX * rd.x + ocZ * rd.y;
    const c = ocX * ocX + ocZ * ocZ - r * r;
    const h = b * b - c;
    if (h < 0) return null;
    const t = -b - Math.sqrt(h);
    return t >= 0 ? t : null;
  }

  // =========================================================================
  // MODE B: REFRACTION CHAMBER (BEAKER + BENT PENCIL & PRISM RAINBOW)
  // =========================================================================
  _buildModeRefraction() {
    this.refractionGroup = new THREE.Group();
    this.refractionGroup.position.y = 0.032;
    this.root.add(this.refractionGroup);

    // --- Apparatus 1: Borosilicate Glass Beaker with Water & Pencil (Left) ---
    const beakerStage = new THREE.Group();
    beakerStage.position.set(-0.68, 0, 0.06);
    this.refractionGroup.add(beakerStage);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.024, 32),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 })
    );
    pad.position.y = 0.012;
    beakerStage.add(pad);

    // Outer Borosilicate Glass Cylinder + Bottom Disk + Pour Spout Rim
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.32,
      roughness: 0.05,
      metalness: 0.05,
      ior: 1.5,
      reflectivity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const beakerH = 0.46;
    const beakerR = 0.19;
    const beakerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(beakerR, beakerR, beakerH, 48, 1, true),
      glassMat
    );
    beakerWall.position.y = 0.028 + beakerH / 2;
    beakerStage.add(beakerWall);

    const beakerLip = new THREE.Mesh(new THREE.TorusGeometry(beakerR, 0.008, 12, 48), glassMat);
    beakerLip.rotation.x = Math.PI / 2;
    beakerLip.position.y = 0.028 + beakerH;
    beakerStage.add(beakerLip);

    // Graduation white tick marks along front of beaker
    const tickMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.75 });
    for (let i = 1; i <= 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.005), tickMat);
      tick.position.set(0, 0.05 + i * 0.09, beakerR + 0.002);
      beakerStage.add(tick);
    }

    // Water volume inside beaker
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.42,
      roughness: 0.06,
      ior: 1.333,
      depthWrite: false
    });
    this.waterMesh = new THREE.Mesh(new THREE.CylinderGeometry(beakerR - 0.008, beakerR - 0.008, 1, 40), waterMat);
    beakerStage.add(this.waterMesh);

    this.meniscusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.001, beakerR - 0.007, 40),
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.65,
        roughness: 0.08,
        side: THREE.DoubleSide
      })
    );
    this.meniscusRing.rotation.x = -Math.PI / 2;
    beakerStage.add(this.meniscusRing);

    // Split Pencil (Upper Air Portion + Submerged Refracted/Magnified Portion!)
    // Why split at exact water surface plane? Because in real life n_water = 1.33 bends light rays at the air-water boundary, shifting & magnifying the submerged shaft!
    this.pencilUpperGroup = new THREE.Group();
    this.pencilLowerGroup = new THREE.Group();
    beakerStage.add(this.pencilUpperGroup);
    beakerStage.add(this.pencilLowerGroup);

    this.clipPlaneAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    this.clipPlaneBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.3);

    this._populatePencilMesh(this.pencilUpperGroup, [this.clipPlaneAbove]);
    this._populatePencilMesh(this.pencilLowerGroup, [this.clipPlaneBelow]);

    // --- Apparatus 2: Equilateral Optical Prism & Rainbow Dispersion (Right) ---
    this.prismStage = new THREE.Group();
    this.prismStage.position.set(0.48, 0, 0.04);
    this.refractionGroup.add(this.prismStage);

    const mountMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.8
    });

    // White Light Collimator Emitter
    const emitter = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.1, 0.1, 3, 0.012), mountMat);
    emitter.position.set(-0.56, 0.18, 0.08);
    this.prismStage.add(emitter);

    // Turntable & Crystal Flint-Glass Triangular Prism
    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 32), mountMat);
    turntable.position.set(0, 0.02, 0);
    this.prismStage.add(turntable);

    const prismGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.52,
      roughness: 0.03,
      metalness: 0.08,
      ior: 1.62,
      reflectivity: 1.0,
      clearcoat: 1.0
    });
    this.prismMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 3), prismGlassMat);
    this.prismMesh.position.set(0, 0.18, 0);
    this.prismMesh.userData = { action: 'nudgePrism' };
    this.prismStage.add(this.prismMesh);
    this.interactables.push(this.prismMesh);

    // Glowing prism wireframe edges for ultra-crisp optical geometry readability
    const prismEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.prismMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.65 })
    );
    this.prismMesh.add(prismEdges);

    // Curved Observation Projection Screen on the right
    const screenMesh = new THREE.Mesh(
      new RoundedBoxGeometry(0.035, 0.46, 0.68, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85, metalness: 0.02 })
    );
    screenMesh.position.set(0.68, 0.24, -0.04);
    screenMesh.castShadow = true;
    this.prismStage.add(screenMesh);

    this.prismBeamsGroup = new THREE.Group();
    this.prismStage.add(this.prismBeamsGroup);

    this._updateRefractionScene();
  }

  _populatePencilMesh(group, clippingPlanes) {
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.38,
      clippingPlanes
    });
    const woodConeMat = new THREE.MeshStandardMaterial({
      color: 0xd6a87c,
      roughness: 0.6,
      clippingPlanes
    });
    const graphiteMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.4,
      clippingPlanes
    });
    const ferruleMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.25,
      metalness: 0.88,
      clippingPlanes
    });
    const eraserMat = new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      roughness: 0.75,
      clippingPlanes
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.46, 6), yellowMat);
    group.add(shaft);

    const woodTip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 16), woodConeMat);
    woodTip.rotation.x = Math.PI;
    woodTip.position.y = -0.257;
    group.add(woodTip);

    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.02, 12), graphiteMat);
    lead.rotation.x = Math.PI;
    lead.position.y = -0.278;
    group.add(lead);

    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.032, 18), ferruleMat);
    ferrule.position.y = 0.245;
    group.add(ferrule);

    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 18), eraserMat);
    eraser.position.y = 0.276;
    group.add(eraser);
  }

  _updateRefractionScene() {
    // Update water height & clipping planes
    const waterH = 0.42 * this.waterLevel;
    this.waterMesh.scale.y = waterH;
    this.waterMesh.position.y = 0.028 + waterH / 2;
    const surfaceLocalY = 0.028 + waterH;
    this.meniscusRing.position.y = surfaceLocalY + 0.001;

    // Update world-space clipping plane constants dynamically in update()
    this._waterSurfaceLocalY = surfaceLocalY;

    // Position upper pencil vs submerged refracted/magnified lower pencil
    const tilt = -0.44;
    const baseX = this.pencilOffset * 0.14;
    this.pencilUpperGroup.position.set(baseX, 0.31, 0);
    this.pencilUpperGroup.rotation.z = tilt;

    // Apparent lateral refraction shift + magnification under n=1.333 water!
    this.pencilLowerGroup.position.set(baseX + 0.034, 0.322, 0.012);
    this.pencilLowerGroup.rotation.z = tilt + 0.09;
    this.pencilLowerGroup.scale.set(1.18, 1.04, 1.18);

    // Update Prism & 7-Band Rainbow Spectrum Dispersion
    this.prismMesh.rotation.y = THREE.MathUtils.degToRad(this.prismAngle);
    while (this.prismBeamsGroup.children.length) {
      const c = this.prismBeamsGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }

    // Incoming pure white beam
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const whiteGlow = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.45 });
    this._add3DBeam(
      this.prismBeamsGroup,
      new THREE.Vector3(-0.42, 0.18, 0.08),
      new THREE.Vector3(-0.07, 0.18, 0.02),
      0.007,
      whiteMat,
      whiteGlow
    );

    // Internal dispersing beam inside prism
    this._add3DBeam(
      this.prismBeamsGroup,
      new THREE.Vector3(-0.07, 0.18, 0.02),
      new THREE.Vector3(0.075, 0.175, -0.01),
      0.011,
      whiteMat,
      whiteGlow
    );

    // 7 ROYGBIV Dispersed Wavelengths bending at increasing angles (Violet bends most, Red bends least!)
    const spectrum = [
      { hex: 0xef4444, spreadZ: 0.16, spreadY: 0.055 },  // Red (longest wavelength, bends least)
      { hex: 0xf97316, spreadZ: 0.10, spreadY: 0.036 },  // Orange
      { hex: 0xfacc15, spreadZ: 0.04, spreadY: 0.018 },  // Yellow
      { hex: 0x22c55e, spreadZ: -0.02, spreadY: 0.0 },   // Green
      { hex: 0x38bdf8, spreadZ: -0.08, spreadY: -0.02 }, // Blue
      { hex: 0x6366f1, spreadZ: -0.14, spreadY: -0.04 }, // Indigo
      { hex: 0xa855f7, spreadZ: -0.20, spreadY: -0.06 }  // Violet (shortest wavelength, bends most)
    ];

    const angleFactor = 1 + (this.prismAngle - 14) * 0.018;
    const exitOrigin = new THREE.Vector3(0.075, 0.175, -0.01);

    spectrum.forEach((band) => {
      const mat = new THREE.MeshBasicMaterial({ color: band.hex, transparent: true, opacity: 0.92 });
      const glow = new THREE.MeshBasicMaterial({ color: band.hex, transparent: true, opacity: 0.32 });
      const target = new THREE.Vector3(
        0.66,
        0.22 + band.spreadY * angleFactor,
        -0.04 + band.spreadZ * angleFactor
      );
      this._add3DBeam(this.prismBeamsGroup, exitOrigin, target, 0.0065, mat, glow);

      // Glowing projected color band on the observation screen!
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(0.065, 0.052),
        new THREE.MeshBasicMaterial({ color: band.hex, transparent: true, opacity: 0.88 })
      );
      patch.rotation.y = -Math.PI / 2;
      patch.position.set(0.661, target.y, target.z);
      this.prismBeamsGroup.add(patch);
    });
  }

  _add3DBeam(parent, a, b, radius, coreMat, glowMat) {
    const delta = new THREE.Vector3().subVectors(b, a);
    const len = delta.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());

    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), coreMat);
    core.quaternion.copy(quat);
    core.position.copy(mid);
    parent.add(core);

    const glow = new THREE.Mesh(new THREE.CylinderGeometry(radius * 2.3, radius * 2.3, len, 10), glowMat);
    glow.quaternion.copy(quat);
    glow.position.copy(mid);
    parent.add(glow);
  }

  // =========================================================================
  // MODE C: SHADOW LAB (OPAQUE, TRANSLUCENT, TRANSPARENT)
  // =========================================================================
  _buildModeShadow() {
    this.shadowGroup = new THREE.Group();
    this.shadowGroup.position.y = 0.032;
    this.root.add(this.shadowGroup);

    const railMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.82
    });

    // Linear guide rail for movable spotlight
    const rail = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.022, 0.09, 2, 0.004), railMat);
    rail.position.set(-0.78, 0.011, 0);
    this.shadowGroup.add(rail);

    // Movable LED Torch Housing
    this.torchGroup = new THREE.Group();
    this.shadowGroup.add(this.torchGroup);

    const carriage = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.04, 0.14, 2, 0.006), railMat);
    carriage.position.y = 0.03;
    carriage.userData = { action: 'dragShadowTorch' };
    this.torchGroup.add(carriage);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.22, 14), railMat);
    post.position.y = 0.14;
    post.userData = { action: 'dragShadowTorch' };
    this.torchGroup.add(post);

    const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.062, 0.16, 24), railMat);
    lampHead.rotation.z = -Math.PI / 2;
    lampHead.position.y = 0.25;
    lampHead.userData = { action: 'dragShadowTorch' };
    this.torchGroup.add(lampHead);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.056, 24),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    lens.rotation.y = Math.PI / 2;
    lens.position.set(0.081, 0.25, 0);
    this.torchGroup.add(lens);

    this.interactables.push(carriage, post, lampHead);

    // Volumetric Light Cone
    this.lightConeMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.8, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfef9c3,
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.lightConeMesh.rotation.z = Math.PI / 2;
    this.shadowGroup.add(this.lightConeMesh);

    // Material Test Pedestal at x = 0.05
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 24), railMat);
    pedestal.position.set(0.05, 0.04, 0);
    this.shadowGroup.add(pedestal);

    const walnut = ProceduralTextures.getWoodTexture('walnut');
    this.shadowMaterials = {
      opaque: new THREE.MeshStandardMaterial({
        map: walnut.map,
        bumpMap: walnut.bumpMap,
        bumpScale: 0.01,
        roughness: 0.48,
        metalness: 0.05
      }),
      translucent: new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.68,
        roughness: 0.58,
        transmission: 0.45,
        ior: 1.48
      }),
      transparent: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.03,
        transmission: 0.92,
        ior: 1.52
      })
    };

    this.testBlockMesh = new THREE.Mesh(
      new RoundedBoxGeometry(0.12, 0.34, 0.28, 3, 0.01),
      this.shadowMaterials.opaque
    );
    this.testBlockMesh.position.set(0.05, 0.25, 0);
    this.testBlockMesh.userData = { action: 'cycleShadowBlock' };
    this.shadowGroup.add(this.testBlockMesh);
    this.interactables.push(this.testBlockMesh);

    // Dynamic Canvas Observation Screen at x = 1.08 showing exact physics shadow / transmission!
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 512;
    this.screenCanvas.height = 384;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;

    const screenFrame = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.72, 0.98, 3, 0.008), railMat);
    screenFrame.position.set(1.1, 0.36, 0);
    this.shadowGroup.add(screenFrame);

    const screenFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.66),
      new THREE.MeshBasicMaterial({ map: this.screenTex })
    );
    screenFace.rotation.y = -Math.PI / 2;
    screenFace.position.set(1.078, 0.36, 0);
    this.shadowGroup.add(screenFace);

    this._updateShadowScene();
  }

  _updateShadowScene() {
    // Torch X from -1.25 (far) to -0.45 (close to block at +0.05)
    const torchX = -0.48 - this.lightDistance * 0.76;
    const torchZ = this.lightLateral * 0.28;
    this.torchGroup.position.set(torchX, 0, torchZ);

    const distToScreen = 1.08 - torchX;
    this.lightConeMesh.scale.set(1, distToScreen / 1.8, 1);
    this.lightConeMesh.position.set(torchX + distToScreen / 2, 0.25, torchZ * 0.5);

    this.testBlockMesh.material = this.shadowMaterials[this.blockMaterial];

    // Paint physically accurate screen illumination + umbra/penumbra/refraction rim
    const ctx = this.screenCanvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 384);

    // Warm bright spotlight circle on screen
    const spotGrad = ctx.createRadialGradient(256, 210, 20, 256, 210, 250);
    spotGrad.addColorStop(0, '#fefce8');
    spotGrad.addColorStop(0.75, '#e2e8f0');
    spotGrad.addColorStop(1, '#334155');
    ctx.fillStyle = spotGrad;
    ctx.fillRect(0, 0, 512, 384);

    // Shadow magnification = (screenX - torchX) / (blockX - torchX)
    const dObj = Math.max(0.28, 0.05 - torchX);
    const mag = distToScreen / dObj;
    const wPx = 82 * mag;
    const hPx = 112 * mag;
    // Lateral offset shifts shadow opposite to torchZ
    const cx = 256 + (torchZ / dObj) * 180;
    const cy = 228;

    ctx.save();
    if (this.blockMaterial === 'opaque') {
      // Crisp dark umbra (0% light passes through opaque walnut!)
      ctx.filter = 'blur(5px)';
      ctx.fillStyle = 'rgba(12, 18, 28, 0.94)';
      ctx.fillRect(cx - wPx / 2, cy - hPx / 2, wPx, hPx);
    } else if (this.blockMaterial === 'translucent') {
      // Frosted glass scatters rays: blurry soft partial shadow + diffuse glow center
      ctx.filter = 'blur(18px)';
      ctx.fillStyle = 'rgba(51, 65, 85, 0.52)';
      ctx.fillRect(cx - wPx / 2, cy - hPx / 2, wPx, hPx);
    } else {
      // Transparent clear glass: ~95% light passes straight through, subtle refractive caustic outline!
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - wPx / 2, cy - hPx / 2, wPx, hPx);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(cx - wPx / 2 + 6, cy - hPx / 2 + 6, wPx - 12, hPx - 12);
    }
    ctx.restore();

    this.screenTex.needsUpdate = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.reflectionGroup.visible = mode === 'reflection';
    this.refractionGroup.visible = mode === 'refraction';
    this.shadowGroup.visible = mode === 'shadow';
  }

  autoSolveMirrors() {
    this.mirrorAngles = [45, 45, -45];
    this._updateReflectionRays();
  }

  onPointerDown(hit, raycaster) {
    if (this.mode === 'reflection' && hit?.object?.userData?.mirrorIdx !== undefined) {
      this.draggingMirrorIdx = hit.object.userData.mirrorIdx;
      this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
      return true;
    }
    if (this.mode === 'refraction' && hit?.object?.userData?.action === 'nudgePrism') {
      this.prismAngle = ((this.prismAngle + 10 + 40) % 80) - 40;
      this._updateRefractionScene();
      this.audio.playClick(840, 0.18);
      return true;
    }
    if (this.mode === 'shadow') {
      const act = hit?.object?.userData?.action;
      if (act === 'cycleShadowBlock') {
        const order = ['opaque', 'translucent', 'transparent'];
        this.blockMaterial = order[(order.indexOf(this.blockMaterial) + 1) % 3];
        this._updateShadowScene();
        this.audio.playClick(720, 0.22);
        return true;
      }
      if (act === 'dragShadowTorch') {
        this.draggingLight = true;
        this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
        return true;
      }
    }
    return false;
  }

  onPointerMove(raycaster) {
    if (this.draggingMirrorIdx >= 0 && this._dragPlane) {
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(this._dragPlane, pt)) {
        const local = this.reflectionGroup.worldToLocal(pt.clone());
        const m = this.mirrors[this.draggingMirrorIdx];
        const angle = Math.atan2(local.x - m.x, local.z - m.z);
        this.mirrorAngles[this.draggingMirrorIdx] = Math.round(
          Math.max(-85, Math.min(85, THREE.MathUtils.radToDeg(angle)))
        );
        this._updateReflectionRays();
      }
      return true;
    }
    if (this.draggingLight && this._dragPlane) {
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(this._dragPlane, pt)) {
        const local = this.shadowGroup.worldToLocal(pt.clone());
        this.lightDistance = Math.max(0, Math.min(1, (-0.48 - local.x) / 0.76));
        this.lightLateral = Math.max(-1, Math.min(1, local.z / 0.28));
        this._updateShadowScene();
      }
      return true;
    }
    return false;
  }

  onPointerUp() {
    this.draggingMirrorIdx = -1;
    this.draggingLight = false;
  }

  setActive(active) {
    this.isActive = active;
  }

  reset() {
    this.mirrorAngles = [36, 52, -38];
    this.wasSensorHit = false;
    this.waterLevel = 0.72;
    this.pencilOffset = 0;
    this.prismAngle = 14;
    this.blockMaterial = 'opaque';
    this.lightDistance = 0.55;
    this.lightLateral = 0;
    this._updateReflectionRays();
    this._updateRefractionScene();
    this._updateShadowScene();
  }

  getCameraLocalPreset() {
    if (this.mode === 'refraction') {
      return {
        pos: new THREE.Vector3(-0.08, 0.92, 1.48),
        target: new THREE.Vector3(-0.08, 0.26, 0.04)
      };
    }
    if (this.mode === 'shadow') {
      return {
        pos: new THREE.Vector3(-0.05, 1.05, 1.62),
        target: new THREE.Vector3(0.15, 0.32, 0.0)
      };
    }
    return {
      pos: new THREE.Vector3(0.0, 1.42, 1.55),
      target: new THREE.Vector3(-0.05, 0.16, 0.0)
    };
  }

  update() {
    // Keep world-space clipping planes synced to exact water meniscus height
    if (this.mode === 'refraction' && this._waterSurfaceLocalY !== undefined) {
      const worldPt = new THREE.Vector3(0, this._waterSurfaceLocalY, 0);
      this.refractionGroup.localToWorld(worldPt);
      this.clipPlaneAbove.set(new THREE.Vector3(0, 1, 0), -worldPt.y);
      this.clipPlaneBelow.set(new THREE.Vector3(0, -1, 0), worldPt.y);
    }
  }
}
