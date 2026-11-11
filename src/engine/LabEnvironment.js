import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { ProceduralTextures } from './ProceduralTextures.js';
import { STATIONS_META } from '../data/standardsData.js';

export const BENCH_LAYOUT = [
  { id: 'sound', pos: new THREE.Vector3(-6.3, 0, 2.5), rotY: 0.24 },
  { id: 'light', pos: new THREE.Vector3(0.0, 0, 3.0), rotY: 0.0 },
  { id: 'thermal', pos: new THREE.Vector3(6.3, 0, 2.5), rotY: -0.24 },
  { id: 'mechanical', pos: new THREE.Vector3(-6.8, 0, -3.4), rotY: 0.16 },
  { id: 'chemical', pos: new THREE.Vector3(0.0, 0, -3.9), rotY: 0.0 },
  { id: 'electrical', pos: new THREE.Vector3(6.8, 0, -3.4), rotY: -0.16 }
];

export const BENCH_TOP_Y = 0.92;

export class LabEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.benchAnchors = new Map(); // stationId -> { benchGroup, surfaceGroup, ringMat, signMesh }
    this.clickableBenchTargets = [];

    this._buildFloorAndReflector();
    this._buildRoomArchitecture();
    this._buildCeilingRings();
    this._buildWorkbenches();
  }

  _buildFloorAndReflector() {
    const floorW = 29;
    const floorD = 22;

    // Real-time planar floor reflection underneath semi-translucent porcelain tiles
    const reflectorGeo = new THREE.PlaneGeometry(floorW, floorD);
    const reflector = new Reflector(reflectorGeo, {
      clipBias: 0.003,
      textureWidth: Math.min(1024, window.innerWidth),
      textureHeight: Math.min(1024, window.innerHeight),
      color: 0x334155
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.004;
    this.root.add(reflector);
    this.reflector = reflector;

    const floorTex = ProceduralTextures.getLabFloorTextures();
    const tileMat = new THREE.MeshStandardMaterial({
      map: floorTex.map,
      bumpMap: floorTex.bumpMap,
      bumpScale: 0.012,
      roughnessMap: floorTex.roughnessMap,
      roughness: 0.26,
      metalness: 0.18,
      transparent: true,
      opacity: 0.84
    });

    const tileFloor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), tileMat);
    tileFloor.rotation.x = -Math.PI / 2;
    tileFloor.position.y = 0;
    tileFloor.receiveShadow = true;
    this.root.add(tileFloor);
  }

  _buildRoomArchitecture() {
    const brushedBump = ProceduralTextures.getBrushedMetalBump();
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x111824,
      roughness: 0.78,
      metalness: 0.12
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x243044,
      bumpMap: brushedBump,
      bumpScale: 0.005,
      roughness: 0.35,
      metalness: 0.75
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x0b1019,
      roughness: 0.9,
      metalness: 0.08
    });

    // Back wall (z = -9.5), Left wall (x = -14.2), Right wall (x = 14.2), Front distant wall (z = 10.8)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(29, 5.8), wallMat);
    backWall.position.set(0, 2.9, -9.5);
    backWall.receiveShadow = true;
    this.root.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(29, 5.8), wallMat);
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(0, 2.9, 10.8);
    this.root.add(frontWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.8), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-14.2, 2.9, 0.6);
    this.root.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.8), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(14.2, 2.9, 0.6);
    this.root.add(rightWall);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(29, 22), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5.75, 0.6);
    this.root.add(ceiling);

    // Architectural ceiling structural beams
    for (let z = -6.5; z <= 7.5; z += 3.5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.18, 0.26), trimMat);
      beam.position.set(0, 5.64, z);
      this.root.add(beam);
    }

    // Left Wall Tall Florida Daylight Lab Windows with architectural mullions
    const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xdbeafe });
    const windowFrameMat = trimMat;
    [-4.8, 0.4, 5.6].forEach((wz) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.2, 3.6), windowFrameMat);
      frame.position.set(-14.12, 3.0, wz);
      this.root.add(frame);

      const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.9), windowGlowMat);
      pane.rotation.y = Math.PI / 2;
      pane.position.set(-14.03, 3.0, wz);
      this.root.add(pane);

      // Horizontal blind louvers for realistic depth
      for (let ly = 1.75; ly <= 4.25; ly += 0.35) {
        const louver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 3.32), windowFrameMat);
        louver.position.set(-14.0, ly, wz);
        louver.rotation.z = 0.22;
        this.root.add(louver);
      }
    });

    // Back Wall Florida Grade 5 NGSSS Standards Posters in Sleek Frames
    const posters = [
      {
        x: -7.6,
        code: 'SC.5.P.10.1',
        heading: 'Basic Forms of Energy',
        accent: '#22d3ee',
        bullets: [
          'Light: Travels in straight rays; reflects, refracts & absorbs.',
          'Sound: Produced by vibrating objects.',
          'Thermal: Particle motion & heat transfer.',
          'Mechanical, Chemical & Electrical forms.'
        ]
      },
      {
        x: 0.0,
        code: 'SC.5.P.10.2',
        heading: 'Energy Causes Motion & Change',
        accent: '#34d399',
        bullets: [
          'Vibrating tuning forks launch a ping-pong ball.',
          'Adding heat melts solids into liquids and gases.',
          'Greater mass or height transfers stronger impact motion.'
        ]
      },
      {
        x: 7.6,
        code: 'SC.5.P.10.4',
        heading: 'Energy Transformations',
        accent: '#f59e0b',
        bullets: [
          'Closed circuits allow electrical energy to flow.',
          'Electricity → Light, Heat, Sound & Motion.',
          'Chemical food & fuel → Mechanical & Electrical.'
        ]
      }
    ];

    posters.forEach((p) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.95, 0.08), trimMat);
      frame.position.set(p.x, 3.15, -9.44);
      this.root.add(frame);

      const tex = ProceduralTextures.createFloridaPosterTexture(p.code, p.heading, p.bullets, p.accent);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(2.08, 2.78),
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.35,
          metalness: 0.05,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: tex,
          emissiveIntensity: 0.22
        })
      );
      art.position.set(p.x, 3.15, -9.39);
      this.root.add(art);
    });

    // Rear Laboratory Base Cabinetry along back wall beneath posters
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x1a2434,
      roughness: 0.42,
      metalness: 0.55
    });
    const counterMat = new THREE.MeshStandardMaterial({
      color: 0x0d121a,
      roughness: 0.25,
      metalness: 0.2
    });
    const rearCab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.92, 0.78), cabMat);
    rearCab.position.set(0, 0.46, -9.05);
    rearCab.castShadow = true;
    rearCab.receiveShadow = true;
    this.root.add(rearCab);

    const rearTop = new THREE.Mesh(new THREE.BoxGeometry(22.2, 0.06, 0.84), counterMat);
    rearTop.position.set(0, 0.95, -9.05);
    this.root.add(rearTop);

    // Baseboard trim around perimeter
    const baseBoard = new THREE.Mesh(new THREE.BoxGeometry(28.5, 0.14, 0.06), trimMat);
    baseBoard.position.set(0, 0.07, -9.46);
    this.root.add(baseBoard);
  }

  _buildCeilingRings() {
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.32,
      metalness: 0.82
    });
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x475569 });

    // Central hero double ring
    this._createSuspendedRing(new THREE.Vector3(0, 4.75, -0.4), 2.35, 0xe0f2fe, housingMat, cableMat, 1.4);

    // Dedicated ceiling LED ring above each of the 6 stations
    BENCH_LAYOUT.forEach((b, idx) => {
      const meta = STATIONS_META[idx];
      const ringMat = this._createSuspendedRing(
        new THREE.Vector3(b.pos.x, 4.45, b.pos.z),
        1.42,
        meta.accent,
        housingMat,
        cableMat,
        1.15
      );
      b.ringMat = ringMat;
    });
  }

  _createSuspendedRing(pos, radius, glowHex, housingMat, cableMat, intensity = 1.2) {
    const group = new THREE.Group();
    group.position.copy(pos);

    const upperHousing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.048, 16, 64), housingMat);
    upperHousing.rotation.x = Math.PI / 2;
    upperHousing.position.y = 0.03;
    group.add(upperHousing);

    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(glowHex),
      emissiveIntensity: intensity,
      roughness: 0.2
    });
    const lowerDiffuser = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.036, 14, 64), ledMat);
    lowerDiffuser.rotation.x = Math.PI / 2;
    group.add(lowerDiffuser);

    // 3 suspension aircraft cables up to ceiling
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const h = 5.75 - pos.y;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, h, 6), cableMat);
      wire.position.set(Math.cos(a) * radius * 0.88, h / 2 + 0.03, Math.sin(a) * radius * 0.88);
      group.add(wire);
    }

    this.root.add(group);
    return ledMat;
  }

  _buildWorkbenches() {
    const brushedBump = ProceduralTextures.getBrushedMetalBump();
    const maple = ProceduralTextures.getWoodTexture('maple');

    const legMat = new THREE.MeshStandardMaterial({
      color: 0x283548,
      bumpMap: brushedBump,
      bumpScale: 0.006,
      roughness: 0.34,
      metalness: 0.82
    });
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f17,
      roughness: 0.85,
      metalness: 0.1
    });
    const phenolicTopMat = new THREE.MeshStandardMaterial({
      color: 0x1c2533,
      roughness: 0.32,
      metalness: 0.16
    });
    const woodEdgeMat = new THREE.MeshStandardMaterial({
      map: maple.map,
      bumpMap: maple.bumpMap,
      bumpScale: 0.008,
      roughness: 0.38,
      metalness: 0.06
    });

    const topGeo = new RoundedBoxGeometry(3.46, 0.075, 1.82, 4, 0.018);
    const trimGeo = new RoundedBoxGeometry(3.5, 0.04, 1.86, 3, 0.012);
    const legGeo = new THREE.CylinderGeometry(0.045, 0.045, BENCH_TOP_Y - 0.06, 16);
    const footGeo = new THREE.CylinderGeometry(0.062, 0.068, 0.04, 16);

    BENCH_LAYOUT.forEach((layout, idx) => {
      const meta = STATIONS_META[idx];
      const benchGroup = new THREE.Group();
      benchGroup.position.copy(layout.pos);
      benchGroup.rotation.y = layout.rotY;
      this.root.add(benchGroup);

      // Phenolic resin heavy countertop + warm maple edge band
      const topMesh = new THREE.Mesh(topGeo, phenolicTopMat);
      topMesh.position.y = BENCH_TOP_Y - 0.0375;
      topMesh.castShadow = true;
      topMesh.receiveShadow = true;
      topMesh.userData.stationBenchId = meta.id;
      benchGroup.add(topMesh);

      const trimMesh = new THREE.Mesh(trimGeo, woodEdgeMat);
      trimMesh.position.y = BENCH_TOP_Y - 0.062;
      benchGroup.add(trimMesh);

      // 4 tubular steel legs + rubber leveling feet
      const lx = 1.54;
      const lz = 0.74;
      [
        [-lx, -lz],
        [lx, -lz],
        [-lx, lz],
        [lx, lz]
      ].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x, (BENCH_TOP_Y - 0.06) / 2, z);
        leg.castShadow = true;
        benchGroup.add(leg);

        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(x, 0.02, z);
        benchGroup.add(foot);
      });

      // Lower steel H-stretcher frame
      const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, lx * 2, 12), legMat);
      crossBar.rotation.z = Math.PI / 2;
      crossBar.position.set(0, 0.24, 0);
      benchGroup.add(crossBar);

      [-lx, lx].forEach((x) => {
        const sideBar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, lz * 2, 12), legMat);
        sideBar.rotation.x = Math.PI / 2;
        sideBar.position.set(x, 0.24, 0);
        benchGroup.add(sideBar);
      });

      // Rear aluminum gantry riser & Station Identification Sign Plaque
      const gantryL = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 12), legMat);
      gantryL.position.set(-1.35, BENCH_TOP_Y + 0.52, -0.82);
      benchGroup.add(gantryL);

      const gantryR = gantryL.clone();
      gantryR.position.x = 1.35;
      benchGroup.add(gantryR);

      const signTex = ProceduralTextures.createStationSignTexture(meta);
      const signHousing = new THREE.Mesh(new RoundedBoxGeometry(2.84, 0.42, 0.05, 3, 0.012), legMat);
      signHousing.position.set(0, BENCH_TOP_Y + 0.96, -0.82);
      signHousing.userData.stationBenchId = meta.id;
      benchGroup.add(signHousing);

      const signFace = new THREE.Mesh(
        new THREE.PlaneGeometry(2.76, 0.37),
        new THREE.MeshStandardMaterial({
          map: signTex,
          roughness: 0.28,
          metalness: 0.1,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: signTex,
          emissiveIntensity: 0.34
        })
      );
      signFace.position.set(0, BENCH_TOP_Y + 0.96, -0.792);
      signFace.userData.stationBenchId = meta.id;
      benchGroup.add(signFace);

      //Glowing accent edge strip along front lip of bench
      const frontAccentMat = new THREE.MeshStandardMaterial({
        color: meta.accent,
        emissive: new THREE.Color(meta.accent),
        emissiveIntensity: 0.65,
        roughness: 0.2
      });
      const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(3.36, 0.012, 0.014), frontAccentMat);
      frontStrip.position.set(0, BENCH_TOP_Y - 0.02, 0.912);
      benchGroup.add(frontStrip);

      // Dedicated coordinate anchor right at the benchtop surface (y = BENCH_TOP_Y)
      const surfaceGroup = new THREE.Group();
      surfaceGroup.position.set(0, BENCH_TOP_Y, 0);
      benchGroup.add(surfaceGroup);

      this.clickableBenchTargets.push(topMesh, signHousing, signFace);
      this.benchAnchors.set(meta.id, {
        benchGroup,
        surfaceGroup,
        ringMat: layout.ringMat,
        frontAccentMat,
        meta
      });
    });
  }

  highlightStation(activeId) {
    this.benchAnchors.forEach((entry, id) => {
      const isFocused = !activeId || id === activeId;
      if (entry.ringMat) {
        entry.ringMat.emissiveIntensity = id === activeId ? 1.75 : isFocused ? 1.15 : 0.45;
      }
      if (entry.frontAccentMat) {
        entry.frontAccentMat.emissiveIntensity = id === activeId ? 1.35 : 0.55;
      }
    });
  }
}
