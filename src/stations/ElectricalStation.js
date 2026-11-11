import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Station 6: Store-Bought Modular "Snap-Grid" Electronics Pegboard Kit (SC.5.P.10.4)
 *
 * - Pegboard starts COMPLETELY EMPTY so students design and build their own circuits freely!
 * - 7 columns (1–7) × 5 rows (A–E) = 35 metallic snap posts.
 * - Plane-based peg snapping ensures wires and loads ALWAYS connect smoothly onto Battery (+)/(–)
 *   and existing component terminals without ever getting blocked by 3D part housings!
 * - Placed pieces can be selected, rotated 90° in-place AFTER placement (via click, Right-Click,
 *   'T'/'R' key, or "Turn Placed Piece" button), and easily cut/deleted via Delete/Backspace/X key or Cut button!
 */

export const SNAP_PART_CATALOG = [
  { type: 'wire2', label: '2-Snap Wire', icon: '➖', span: 2, color: 0x0284c7, category: 'wire' },
  { type: 'wire3', label: '3-Snap Wire', icon: '━━', span: 3, color: 0x0369a1, category: 'wire' },
  { type: 'battery', label: 'Battery Pack', icon: '🔋', span: 2, color: 0x1e293b, category: 'source' },
  { type: 'switch', label: 'Switch (ON/OFF)', icon: '🎛️', span: 2, color: 0x16a34a, category: 'switch' },
  { type: 'light_white', label: 'White Light', icon: '💡', span: 2, color: 0xf8fafc, category: 'load' },
  { type: 'light_red', label: 'Red Light', icon: '🔴', span: 2, color: 0xef4444, category: 'load' },
  { type: 'light_blue', label: 'Blue Light', icon: '🔵', span: 2, color: 0x3b82f6, category: 'load' },
  { type: 'fan', label: 'Motor Fan', icon: '🌀', span: 2, color: 0xeab308, category: 'load' },
  { type: 'siren', label: 'Alarm Siren', icon: '🚨', span: 2, color: 0xdc2626, category: 'load' }
];

export class ElectricalStation {
  constructor(surfaceGroup, audio) {
    this.root = new THREE.Group();
    surfaceGroup.add(this.root);
    this.audio = audio;
    this.isActive = false;

    this.cols = 7;
    this.rows = 5;
    this.pitch = 0.22; // 22 cm spacing in scene units for big, Smartboard-friendly snap pegs!
    this.gridOriginX = 0.36;
    this.gridOriginZ = 0.02;

    // Build & Edit tool state
    // Tools: any part type from SNAP_PART_CATALOG, 'select' (Select / Turn placed pieces), or 'remove' (Cut / Delete)
    this.selectedTool = 'battery';
    this.orientation = 0; // 0 = +col (Right), 1 = +row (Down), 2 = -col (Left), 3 = -row (Up)
    this.hoverPeg = null; // { r, c }
    this.selectedPartId = null; // Currently highlighted placed piece on the board (for Turn / Cut!)

    // Placed parts on the pegboard (starts 100% EMPTY per teacher specification!)
    this.placedParts = [];
    this.nextPartId = 1;

    // Circuit solver results
    this.circuitClosed = false;
    this.shortCircuit = false;
    this.activeOutputs = [];
    this.energizedSegments = [];
    this.statusMessage =
      'Board is ready! Pick Battery, Wires, Switch & any Load (Lights, Fan, or Siren) and click pegs to snap them in!';

    this.interactables = [];
    this.placedMeshesGroup = new THREE.Group();
    this.selectionHighlightGroup = new THREE.Group();
    this.electronGroup = new THREE.Group();
    this.electronBeads = [];

    this._buildPegboardAndOrganizer();
    this._buildPreviewGhost();
    this._buildSelectionHighlight();
    this._buildElectronPool();
    this._solveCircuitGraph();
  }

  pegToLocal(r, c) {
    const x = this.gridOriginX + (c - (this.cols - 1) / 2) * this.pitch;
    const z = this.gridOriginZ + (r - (this.rows - 1) / 2) * this.pitch;
    return new THREE.Vector3(x, 0.055, z);
  }

  /**
   * Computes exact peg coordinates directly from the 3D camera ray intersecting the pegboard plane,
   * so existing 3D parts (Battery, Switch, Loads, Wires) NEVER block clicking or connecting onto a peg!
   */
  getPegInfoFromRay(raycaster) {
    if (!raycaster) return null;
    this.root.updateMatrixWorld(true);

    const worldNormal = new THREE.Vector3(0, 1, 0).transformDirection(this.root.matrixWorld).normalize();
    const planeOriginWorld = this.root.localToWorld(new THREE.Vector3(this.gridOriginX, 0.082, this.gridOriginZ));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(worldNormal, planeOriginWorld);

    const hitWorld = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hitWorld)) return null;

    const local = this.root.worldToLocal(hitWorld.clone());
    const floatC = (local.x - this.gridOriginX) / this.pitch + (this.cols - 1) / 2;
    const floatR = (local.z - this.gridOriginZ) / this.pitch + (this.rows - 1) / 2;

    const c = Math.round(floatC);
    const r = Math.round(floatR);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;

    const pegCenter = this.pegToLocal(r, c);
    const distToPeg = Math.hypot(local.x - pegCenter.x, local.z - pegCenter.z);
    if (distToPeg > this.pitch * 0.56) return null;

    return { r, c, distToPeg, localX: local.x, localZ: local.z };
  }

  _getSpanPegs(r, c, orientation, span) {
    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0]
    ];
    const [dr, dc] = dirs[((orientation % 4) + 4) % 4];
    const pegs = [];
    for (let i = 0; i < span; i++) {
      const nr = r + dr * i;
      const nc = c + dc * i;
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) return null;
      pegs.push({ r: nr, c: nc });
    }
    return pegs;
  }

  _buildPegboardAndOrganizer() {
    const boardW = this.cols * this.pitch + 0.24;
    const boardD = this.rows * this.pitch + 0.24;

    const baseFrame = new THREE.Mesh(
      new RoundedBoxGeometry(boardW + 0.05, 0.036, boardD + 0.05, 4, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.35 })
    );
    baseFrame.position.set(this.gridOriginX, 0.018, this.gridOriginZ);
    baseFrame.receiveShadow = true;
    this.root.add(baseFrame);

    const gridTex = this._createGridLabelTexture();
    const acrylicBoard = new THREE.Mesh(
      new RoundedBoxGeometry(boardW, 0.022, boardD, 3, 0.008),
      new THREE.MeshStandardMaterial({
        map: gridTex,
        roughness: 0.24,
        metalness: 0.1
      })
    );
    acrylicBoard.position.set(this.gridOriginX, 0.038, this.gridOriginZ);
    acrylicBoard.receiveShadow = true;
    acrylicBoard.userData = { isPegboardSurface: true };
    this.root.add(acrylicBoard);
    this.interactables.push(acrylicBoard);

    // 35 Raised Metallic Snap Pegs (7 cols × 5 rows)
    const pegBossMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.4 });
    const snapMetalMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.92 });
    const hitGeo = new THREE.CylinderGeometry(this.pitch * 0.48, this.pitch * 0.48, 0.05, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.pegToLocal(r, c);

        const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.026, 18), pegBossMat);
        boss.position.set(p.x, 0.052, p.z);
        this.root.add(boss);

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 16), snapMetalMat);
        post.position.set(p.x, 0.073, p.z);
        this.root.add(post);

        const hitTarget = new THREE.Mesh(hitGeo, hitMat);
        hitTarget.position.set(p.x, 0.075, p.z);
        hitTarget.userData = { pegR: r, pegC: c };
        this.root.add(hitTarget);
        this.interactables.push(hitTarget);
      }
    }

    // 2. Molded Store-Bought Kit Parts Organizer Box on the Left (-1.14, 0, 0.02)
    const boxGroup = new THREE.Group();
    boxGroup.position.set(-1.14, 0, 0.02);
    this.root.add(boxGroup);

    const caseTray = new THREE.Mesh(
      new RoundedBoxGeometry(0.84, 0.052, 1.38, 4, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.25 })
    );
    caseTray.position.y = 0.026;
    caseTray.receiveShadow = true;
    boxGroup.add(caseTray);

    this.trayHighlights = new Map();
    SNAP_PART_CATALOG.forEach((spec, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const tx = col === 0 ? -0.2 : 0.2;
      const tz = -0.52 + row * 0.26;

      const slotWell = new THREE.Mesh(
        new RoundedBoxGeometry(0.35, 0.016, 0.21, 2, 0.006),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
      );
      slotWell.position.set(tx, 0.054, tz);
      boxGroup.add(slotWell);

      const sample = this._createSnapModuleMesh(spec.type, 1, true);
      sample.scale.setScalar(0.68);
      sample.position.set(tx - (spec.span === 3 ? 0.1 : 0.07), 0.068, tz);
      sample.traverse((ch) => {
        if (ch.isMesh) {
          ch.userData = { traySelectType: spec.type };
          this.interactables.push(ch);
        }
      });
      boxGroup.add(sample);

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: spec.type === this.selectedTool ? 0.85 : 0.0
      });
      const selRing = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), ringMat);
      selRing.rotation.x = -Math.PI / 2;
      selRing.position.set(tx, 0.053, tz);
      boxGroup.add(selRing);
      this.trayHighlights.set(spec.type, ringMat);
    });

    this.root.add(this.placedMeshesGroup);
    this.root.add(this.selectionHighlightGroup);
    this.root.add(this.electronGroup);
  }

  _createGridLabelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#172234';
    ctx.fillRect(0, 0, 1024, 768);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 3;
    const marginX = 115;
    const marginY = 115;
    const stepX = (1024 - marginX * 2) / (this.cols - 1);
    const stepY = (768 - marginY * 2) / (this.rows - 1);

    for (let c = 0; c < this.cols; c++) {
      const x = marginX + c * stepX;
      ctx.beginPath();
      ctx.moveTo(x, marginY);
      ctx.lineTo(x, 768 - marginY);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 32px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(c + 1), x, 58);
    }

    const rowLetters = ['A', 'B', 'C', 'D', 'E'];
    for (let r = 0; r < this.rows; r++) {
      const y = marginY + r * stepY;
      ctx.beginPath();
      ctx.moveTo(marginX, y);
      ctx.lineTo(1024 - marginX, y);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 32px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(rowLetters[r], 52, y + 11);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  _buildPreviewGhost() {
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.42,
      depthTest: false
    });
    this.ghostInvalidMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.42,
      depthTest: false
    });
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.renderOrder = 10;
    this.ghostGroup.visible = false;
    this.root.add(this.ghostGroup);
  }

  _buildSelectionHighlight() {
    this.selectionOutlineMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    this.selectionHighlightGroup.visible = false;
  }

  _updateSelectionHighlight() {
    while (this.selectionHighlightGroup.children.length) {
      const c = this.selectionHighlightGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }

    const part = this.placedParts.find((p) => p.id === this.selectedPartId);
    if (!part) {
      this.selectionHighlightGroup.visible = false;
      return;
    }

    const pStart = this.pegToLocal(part.pegs[0].r, part.pegs[0].c);
    const pEnd = this.pegToLocal(part.pegs[part.pegs.length - 1].r, part.pegs[part.pegs.length - 1].c);
    const len = pStart.distanceTo(pEnd) + 0.14;
    const wid = part.type === 'battery' ? 0.19 : 0.135;

    // Crisp hollow frame around the selected piece on the pegboard
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, -wid / 2);
    shape.lineTo(len / 2, -wid / 2);
    shape.lineTo(len / 2, wid / 2);
    shape.lineTo(-len / 2, wid / 2);
    shape.closePath();

    const hole = new THREE.Path();
    const t = 0.012;
    hole.moveTo(-len / 2 + t, -wid / 2 + t);
    hole.lineTo(len / 2 - t, -wid / 2 + t);
    hole.lineTo(len / 2 - t, wid / 2 - t);
    hole.lineTo(-len / 2 + t, wid / 2 - t);
    hole.closePath();
    shape.holes.push(hole);

    const frame = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.selectionOutlineMat);
    frame.rotation.x = -Math.PI / 2;
    frame.position.lerpVectors(pStart, pEnd, 0.5);
    frame.position.y = 0.056;
    frame.rotation.z = -Math.atan2(pEnd.z - pStart.z, pEnd.x - pStart.x);
    this.selectionHighlightGroup.add(frame);
    this.selectionHighlightGroup.visible = true;
  }

  getSelectedPlacedPart() {
    return this.placedParts.find((p) => p.id === this.selectedPartId) || null;
  }

  _buildElectronPool() {
    const geo = new THREE.SphereGeometry(0.013, 10, 10);
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      this.electronGroup.add(mesh);
      this.electronBeads.push({ mesh, mat, phase: (i % 6) / 6, edgeIdx: i });
    }
  }

  /**
   * Builds an authentic 3D Snap-Circuits piece anchored at peg 0 and extending along +X across `span` pegs
   */
  _createSnapModuleMesh(type, layer = 1, isTraySample = false) {
    const spec = SNAP_PART_CATALOG.find((s) => s.type === type) || SNAP_PART_CATALOG[0];
    const group = new THREE.Group();
    const len = (spec.span - 1) * this.pitch;
    const snapMetal = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.16, metalness: 0.94 });
    const copperTrace = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 });

    const bodyW = len + 0.11;
    const bodyH = 0.028;
    const bodyD = type === 'battery' ? 0.155 : 0.105;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.32,
      metalness: 0.15
    });

    const baseStrip = new THREE.Mesh(new RoundedBoxGeometry(bodyW, bodyH, bodyD, 3, 0.012), bodyMat);
    baseStrip.position.set(len / 2, 0.016, 0);
    baseStrip.castShadow = true;
    group.add(baseStrip);

    // Metallic Snap Rivets & Top Stacking Studs at each peg position so wires visibly snap on top!
    for (let i = 0; i < spec.span; i++) {
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.034, 16), snapMetal);
      rivet.position.set(i * this.pitch, 0.018, 0);
      group.add(rivet);

      const topStud = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 14), snapMetal);
      topStud.position.set(i * this.pitch, 0.04, 0);
      group.add(topStud);
    }

    const refs = {};

    if (type === 'wire2' || type === 'wire3') {
      const trace = new THREE.Mesh(new THREE.BoxGeometry(len, 0.006, 0.018), copperTrace);
      trace.position.set(len / 2, 0.032, 0);
      group.add(trace);
    } else if (type === 'battery') {
      // Cells offset to sides so end snap studs at x=0 (+) and x=len (–) are completely unobstructed!
      const cellGeo = new THREE.CylinderGeometry(0.025, 0.025, len - 0.03, 18);
      const cellMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.6 });
      const copperEnd = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.9 });
      [-0.042, 0.042].forEach((cz) => {
        const cell = new THREE.Mesh(cellGeo, cellMat);
        cell.rotation.z = Math.PI / 2;
        cell.position.set(len / 2, 0.045, cz);
        group.add(cell);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.038, 18), copperEnd);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(0.042, 0.045, cz);
        group.add(cap);
      });

      // Clear Red (+) ring at peg 0 and Blue (–) ring at peg 1!
      const plusRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.008, 18),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      plusRing.position.set(0, 0.033, 0);
      group.add(plusRing);

      const minusRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.008, 18),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      minusRing.position.set(len, 0.033, 0);
      group.add(minusRing);
    } else if (type === 'switch') {
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.012, 0.036),
        new THREE.MeshBasicMaterial({ color: 0x052e16 })
      );
      slot.position.set(len / 2, 0.031, 0);
      group.add(slot);

      const sliderKnob = new THREE.Mesh(
        new RoundedBoxGeometry(0.044, 0.042, 0.048, 2, 0.008),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 })
      );
      sliderKnob.position.set(len / 2 - 0.022, 0.048, 0);
      group.add(sliderKnob);

      const stateDotMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const stateDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), stateDotMat);
      stateDot.position.set(len / 2, 0.034, 0.036);
      group.add(stateDot);

      refs.sliderKnob = sliderKnob;
      refs.stateDotMat = stateDotMat;
      refs.midX = len / 2;
    } else if (type.startsWith('light_')) {
      const hexMap = {
        light_white: 0xfefce8,
        light_red: 0xff2a2a,
        light_blue: 0x38bdf8
      };
      const offMap = {
        light_white: 0x475569,
        light_red: 0x450a0a,
        light_blue: 0x0c4a6e
      };
      const bezel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.05, 0.026, 20),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })
      );
      bezel.position.set(len / 2, 0.04, 0);
      group.add(bezel);

      const domeMat = new THREE.MeshBasicMaterial({ color: offMap[type] });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 24), domeMat);
      dome.position.set(len / 2, 0.072, 0);
      group.add(dome);

      let ptLight = null;
      if (!isTraySample) {
        ptLight = new THREE.PointLight(hexMap[type], 0, 1.1);
        ptLight.position.set(len / 2, 0.14, 0);
        group.add(ptLight);
      }
      refs.domeMat = domeMat;
      refs.onHex = hexMap[type];
      refs.offHex = offMap[type];
      refs.ptLight = ptLight;
    } else if (type === 'fan') {
      const motorHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.042, 0.075, 20),
        snapMetal
      );
      motorHousing.position.set(len / 2, 0.065, 0);
      group.add(motorHousing);

      const fanRotor = new THREE.Group();
      fanRotor.position.set(len / 2, 0.112, 0);
      group.add(fanRotor);

      const outerGuardRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.007, 10, 32),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 })
      );
      outerGuardRing.rotation.x = Math.PI / 2;
      fanRotor.add(outerGuardRing);

      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25 });
      for (let b = 0; b < 3; b++) {
        const bHolder = new THREE.Group();
        bHolder.rotation.y = (b / 3) * Math.PI * 2;
        const blade = new THREE.Mesh(new RoundedBoxGeometry(0.088, 0.006, 0.034, 2, 0.003), bladeMat);
        blade.position.x = 0.045;
        blade.rotation.x = 0.32;
        bHolder.add(blade);
        fanRotor.add(bHolder);
      }
      refs.fanRotor = fanRotor;
      refs.spinSpeed = 0;
    } else if (type === 'siren') {
      const hornCan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.056, 0.055, 24),
        new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.35 })
      );
      hornCan.position.set(len / 2, 0.055, 0);
      group.add(hornCan);

      const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.008, 20), snapMetal);
      grille.position.set(len / 2, 0.084, 0);
      group.add(grille);

      const waveMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const waveRing = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 28), waveMat);
      waveRing.rotation.x = -Math.PI / 2;
      waveRing.position.set(len / 2, 0.1, 0);
      group.add(waveRing);

      refs.waveRing = waveRing;
      refs.waveMat = waveMat;
    }

    group.position.y = 0.068 + (layer - 1) * 0.028;
    group.userData.refs = refs;
    return group;
  }

  selectTool(toolName) {
    this.selectedTool = toolName;
    this.trayHighlights.forEach((mat, key) => {
      mat.opacity = key === toolName ? 0.85 : 0.0;
    });
    this._updateGhostPreview();
  }

  rotateOrientation() {
    this.orientation = (this.orientation + 1) % 4;
    this.audio.playClick(840, 0.18);
    this._updateGhostPreview();
  }

  /**
   * Rotates an ALREADY-PLACED piece on the pegboard by 90° around its anchor peg!
   * Automatically skips out-of-bounds orientations near board edges so it always turns cleanly.
   */
  rotatePlacedPart(partId = this.selectedPartId) {
    const part = this.placedParts.find((p) => p.id === partId);
    if (!part) return false;

    const spec = SNAP_PART_CATALOG.find((s) => s.type === part.type);
    const span = spec ? spec.span : part.pegs.length;
    const anchor = part.pegs[0];

    let chosenOri = -1;
    let chosenPegs = null;

    // Try rotating around primary anchor peg first
    for (let step = 1; step <= 3; step++) {
      const candOri = ((part.orientation || 0) + step) % 4;
      const candPegs = this._getSpanPegs(anchor.r, anchor.c, candOri, span);
      if (candPegs) {
        chosenOri = candOri;
        chosenPegs = candPegs;
        break;
      }
    }

    // Fallback: rotate around opposite end peg if corner-locked
    if (!chosenPegs) {
      const altAnchor = part.pegs[part.pegs.length - 1];
      for (let step = 1; step <= 3; step++) {
        const candOri = ((part.orientation || 0) + step) % 4;
        const candPegs = this._getSpanPegs(altAnchor.r, altAnchor.c, candOri, span);
        if (candPegs) {
          chosenOri = candOri;
          chosenPegs = candPegs;
          break;
        }
      }
    }

    if (!chosenPegs) return false;

    // Remove any exact full-span duplicate at the new orientation (excluding self)
    const dupIdx = this.placedParts.findIndex(
      (p) => p.id !== part.id && this._isSamePegSpan(p.pegs, chosenPegs)
    );
    if (dupIdx >= 0) {
      this._removePartById(this.placedParts[dupIdx].id);
    }

    part.orientation = chosenOri;
    part.pegs = chosenPegs;
    this._repositionPlacedPartMesh(part);
    this._recomputeAllStackLayers();

    this.selectedPartId = part.id;
    this._updateSelectionHighlight();
    this.audio.playClick(860, 0.24);
    this._solveCircuitGraph();
    return true;
  }

  /**
   * Deletes/cuts the currently selected placed piece (or top-most piece under hovered peg) — bound to Delete/Backspace/X & Cut button!
   */
  deleteSelectedOrHoveredPart() {
    if (this.selectedPartId !== null) {
      const id = this.selectedPartId;
      this._removePartById(id);
      this.audio.playClick(460, 0.25);
      return true;
    }
    if (this.hoverPeg) {
      for (let i = this.placedParts.length - 1; i >= 0; i--) {
        if (this.placedParts[i].pegs.some((pg) => pg.r === this.hoverPeg.r && pg.c === this.hoverPeg.c)) {
          this._removePartById(this.placedParts[i].id);
          this.audio.playClick(460, 0.25);
          return true;
        }
      }
    }
    return false;
  }

  _isSamePegSpan(pegsA, pegsB) {
    if (pegsA.length !== pegsB.length) return false;
    const fwd =
      pegsA[0].r === pegsB[0].r &&
      pegsA[0].c === pegsB[0].c &&
      pegsA[pegsA.length - 1].r === pegsB[pegsB.length - 1].r &&
      pegsA[pegsA.length - 1].c === pegsB[pegsB.length - 1].c;
    const rev =
      pegsA[0].r === pegsB[pegsB.length - 1].r &&
      pegsA[0].c === pegsB[pegsB.length - 1].c &&
      pegsA[pegsA.length - 1].r === pegsB[0].r &&
      pegsA[pegsA.length - 1].c === pegsB[0].c;
    return fwd || rev;
  }

  _repositionPlacedPartMesh(part) {
    const p0 = this.pegToLocal(part.pegs[0].r, part.pegs[0].c);
    const pLast = this.pegToLocal(part.pegs[part.pegs.length - 1].r, part.pegs[part.pegs.length - 1].c);
    part.meshGroup.position.x = p0.x;
    part.meshGroup.position.z = p0.z;
    part.meshGroup.rotation.y = -Math.atan2(pLast.z - p0.z, pLast.x - p0.x);
  }

  _recomputeAllStackLayers() {
    const pegCounts = new Map();
    for (const part of this.placedParts) {
      let maxBelow = 0;
      for (const pg of part.pegs) {
        const key = `${pg.r},${pg.c}`;
        const cur = pegCounts.get(key) || 0;
        if (cur > maxBelow) maxBelow = cur;
      }
      const layer = Math.min(3, maxBelow + 1);
      part.meshGroup.position.y = 0.068 + (layer - 1) * 0.028;
      for (const pg of part.pegs) {
        const key = `${pg.r},${pg.c}`;
        pegCounts.set(key, layer);
      }
    }
  }

  _updateGhostPreview() {
    while (this.ghostGroup.children.length) {
      const c = this.ghostGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }

    if (!this.hoverPeg || this.selectedTool === 'remove' || this.selectedTool === 'select') {
      this.ghostGroup.visible = false;
      return;
    }

    const spec = SNAP_PART_CATALOG.find((s) => s.type === this.selectedTool);
    if (!spec) {
      this.ghostGroup.visible = false;
      return;
    }

    const pegs = this._getSpanPegs(this.hoverPeg.r, this.hoverPeg.c, this.orientation, spec.span);
    this.ghostGroup.visible = true;

    if (!pegs) {
      const p0 = this.pegToLocal(this.hoverPeg.r, this.hoverPeg.c);
      const bad = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16), this.ghostInvalidMat);
      bad.position.set(p0.x, 0.11, p0.z);
      this.ghostGroup.add(bad);
      return;
    }

    pegs.forEach((pg) => {
      const lp = this.pegToLocal(pg.r, pg.c);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.04, 18), this.ghostMat);
      ring.position.set(lp.x, 0.11, lp.z);
      this.ghostGroup.add(ring);
    });

    const pStart = this.pegToLocal(pegs[0].r, pegs[0].c);
    const pEnd = this.pegToLocal(pegs[pegs.length - 1].r, pegs[pegs.length - 1].c);
    const len = pStart.distanceTo(pEnd) + 0.09;
    const bar = new THREE.Mesh(new RoundedBoxGeometry(len, 0.026, 0.09, 2, 0.01), this.ghostMat);
    bar.position.lerpVectors(pStart, pEnd, 0.5);
    bar.position.y = 0.12;
    bar.rotation.y = -Math.atan2(pEnd.z - pStart.z, pEnd.x - pStart.x);
    this.ghostGroup.add(bar);
  }

  placePartAt(r, c) {
    const spec = SNAP_PART_CATALOG.find((s) => s.type === this.selectedTool);
    if (!spec) return false;

    // Smart auto-fit orientation if current orientation goes off the edge of the 7x5 board!
    let useOri = this.orientation;
    let pegs = this._getSpanPegs(r, c, useOri, spec.span);
    if (!pegs) {
      for (let tryStep = 1; tryStep <= 3; tryStep++) {
        const candOri = (this.orientation + tryStep) % 4;
        const candPegs = this._getSpanPegs(r, c, candOri, spec.span);
        if (candPegs) {
          useOri = candOri;
          this.orientation = candOri;
          pegs = candPegs;
          break;
        }
      }
    }

    if (!pegs) {
      this.audio.playClick(300, 0.22);
      return false;
    }

    // Only 1 Battery Pack at a time (relocates cleanly if placing a new Battery)
    if (spec.type === 'battery') {
      const existingBatIdx = this.placedParts.findIndex((p) => p.type === 'battery');
      if (existingBatIdx >= 0) {
        this._removePartById(this.placedParts[existingBatIdx].id);
      }
    }

    // Replace ONLY if an existing part spans the EXACT same pegs (both endpoints identical);
    // sharing ONE endpoint peg stacks & connects cleanly like real Snap Circuits!
    const sameFootprintIdx = this.placedParts.findIndex((p) => this._isSamePegSpan(p.pegs, pegs));
    if (sameFootprintIdx >= 0) {
      this._removePartById(this.placedParts[sameFootprintIdx].id);
    }

    const id = this.nextPartId++;
    const meshGroup = this._createSnapModuleMesh(spec.type, 1, false);

    meshGroup.traverse((ch) => {
      if (ch.isMesh) {
        ch.userData = { placedPartId: id };
        this.interactables.push(ch);
      }
    });

    this.placedMeshesGroup.add(meshGroup);

    const newPart = {
      id,
      type: spec.type,
      label: spec.label,
      orientation: useOri,
      pegs,
      isClosed: spec.type === 'switch' ? false : true,
      energizedCurrent: 0,
      meshGroup
    };

    this.placedParts.push(newPart);
    this._repositionPlacedPartMesh(newPart);
    this._recomputeAllStackLayers();

    this.selectedPartId = id;
    this._updateSelectionHighlight();
    this._updateGhostPreview();

    this.audio.playClick(960, 0.28);
    this._solveCircuitGraph();
    return true;
  }

  _removePartById(id) {
    const idx = this.placedParts.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const part = this.placedParts[idx];
    part.meshGroup.traverse((ch) => {
      if (ch.isMesh) {
        const i = this.interactables.indexOf(ch);
        if (i >= 0) this.interactables.splice(i, 1);
      }
    });
    this.placedMeshesGroup.remove(part.meshGroup);
    this.placedParts.splice(idx, 1);

    if (this.selectedPartId === id) {
      this.selectedPartId =
        this.placedParts.length > 0 ? this.placedParts[this.placedParts.length - 1].id : null;
    }
    this._recomputeAllStackLayers();
    this._updateSelectionHighlight();
    this._solveCircuitGraph();
  }

  toggleAllSwitches() {
    const switches = this.placedParts.filter((p) => p.type === 'switch');
    if (switches.length === 0) return false;
    const targetState = !switches[0].isClosed;
    switches.forEach((sw) => {
      sw.isClosed = targetState;
      this._updateSwitchVisual(sw);
    });
    this.audio.playClick(targetState ? 940 : 520, 0.3);
    this._solveCircuitGraph();
    return true;
  }

  _updateSwitchVisual(sw) {
    const refs = sw.meshGroup.userData.refs;
    if (!refs) return;
    refs.sliderKnob.position.x = refs.midX + (sw.isClosed ? 0.022 : -0.022);
    refs.stateDotMat.color.setHex(sw.isClosed ? 0x22c55e : 0xef4444);
  }

  /**
   * Real Nodal Conductance Solver across all 35 Pegs (supports Series, Parallel, Multi-Load & Short-Circuit!)
   */
  _solveCircuitGraph() {
    this.placedParts.forEach((p) => {
      p.energizedCurrent = 0;
    });
    this.circuitClosed = false;
    this.shortCircuit = false;
    this.activeOutputs = [];
    this.energizedSegments = [];

    const battery = this.placedParts.find((p) => p.type === 'battery');
    if (!battery) {
      this.statusMessage =
        this.placedParts.length === 0
          ? 'Empty Pegboard — Pick a Battery Pack, Wires, Switch & Load(s) to build your circuit!'
          : 'Add a Battery Pack (🔋) to supply electrical energy to your board!';
      this._syncAudioOutputs();
      return;
    }

    const N = this.rows * this.cols;
    const nodeIdx = (pg) => pg.r * this.cols + pg.c;
    const posNode = nodeIdx(battery.pegs[0]);
    const negNode = nodeIdx(battery.pegs[1]);

    const edges = [];
    for (const part of this.placedParts) {
      if (part.type === 'battery') continue;
      if (part.type === 'wire2' || part.type === 'wire3') {
        for (let i = 0; i < part.pegs.length - 1; i++) {
          edges.push({
            part,
            u: nodeIdx(part.pegs[i]),
            v: nodeIdx(part.pegs[i + 1]),
            pA: part.pegs[i],
            pB: part.pegs[i + 1],
            R: 0.02
          });
        }
      } else if (part.type === 'switch') {
        if (part.isClosed) {
          edges.push({
            part,
            u: nodeIdx(part.pegs[0]),
            v: nodeIdx(part.pegs[1]),
            pA: part.pegs[0],
            pB: part.pegs[1],
            R: 0.02
          });
        }
      } else {
        edges.push({
          part,
          u: nodeIdx(part.pegs[0]),
          v: nodeIdx(part.pegs[1]),
          pA: part.pegs[0],
          pB: part.pegs[1],
          R: 10.0
        });
      }
    }

    const adj = Array.from({ length: N }, () => []);
    edges.forEach((e) => {
      adj[e.u].push({ to: e.v, R: e.R });
      adj[e.v].push({ to: e.u, R: e.R });
    });

    const visited = new Array(N).fill(false);
    const queue = [posNode];
    visited[posNode] = true;
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const nxt of adj[cur]) {
        if (!visited[nxt.to]) {
          visited[nxt.to] = true;
          queue.push(nxt.to);
        }
      }
    }

    if (!visited[negNode]) {
      const hasOpenSwitch = this.placedParts.some((p) => p.type === 'switch' && !p.isClosed);
      this.statusMessage = hasOpenSwitch
        ? 'OPEN CIRCUIT — Click your green Switch (🎛️) on the board (or "Switch ON") to close the loop!'
        : 'OPEN CIRCUIT — Connect Snap Wires from Battery (+) through a Load back to Battery (–)!';
      this._syncAudioOutputs();
      return;
    }

    const shortVis = new Array(N).fill(false);
    const sQueue = [posNode];
    shortVis[posNode] = true;
    while (sQueue.length > 0) {
      const cur = sQueue.shift();
      for (const nxt of adj[cur]) {
        if (nxt.R < 1.0 && !shortVis[nxt.to]) {
          shortVis[nxt.to] = true;
          sQueue.push(nxt.to);
        }
      }
    }

    if (shortVis[negNode]) {
      this.shortCircuit = true;
      this.statusMessage =
        '⚠️ SHORT CIRCUIT! Wires connect (+) directly to (–) with no Load! Add a Light, Fan, or Siren in the path!';
      this._syncAudioOutputs();
      return;
    }

    const A = Array.from({ length: N }, () => new Array(N).fill(0));
    const B = new Array(N).fill(0);

    for (let i = 0; i < N; i++) A[i][i] = 1e-6;
    edges.forEach((e) => {
      const g = 1 / e.R;
      A[e.u][e.u] += g;
      A[e.v][e.v] += g;
      A[e.u][e.v] -= g;
      A[e.v][e.u] -= g;
    });

    for (let j = 0; j < N; j++) {
      A[posNode][j] = 0;
      A[negNode][j] = 0;
    }
    A[posNode][posNode] = 1;
    B[posNode] = 9.0;
    A[negNode][negNode] = 1;
    B[negNode] = 0.0;

    const V = this._gaussianSolve(A, B);

    const activeSet = new Set();
    edges.forEach((e) => {
      const current = (V[e.u] - V[e.v]) / e.R;
      if (Math.abs(current) > 0.04) {
        e.part.energizedCurrent = Math.max(e.part.energizedCurrent, Math.abs(current));
        const fromPeg = current > 0 ? e.pA : e.pB;
        const toPeg = current > 0 ? e.pB : e.pA;
        this.energizedSegments.push({
          start: this.pegToLocal(fromPeg.r, fromPeg.c),
          end: this.pegToLocal(toPeg.r, toPeg.c)
        });
        if (e.R >= 1.0) {
          activeSet.add(e.part.label);
        }
      }
    });

    this.activeOutputs = Array.from(activeSet);
    this.circuitClosed = this.activeOutputs.length > 0;
    this.statusMessage = this.circuitClosed
      ? `⚡ CLOSED CIRCUIT! Powering: ${this.activeOutputs.join(' + ')}`
      : 'OPEN CIRCUIT — Add a Load (Light, Fan, or Siren) and connect a complete loop!';

    this._syncAudioOutputs();
  }

  _gaussianSolve(A, B) {
    const n = B.length;
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      [B[i], B[maxRow]] = [B[maxRow], B[i]];

      const pivot = A[i][i] || 1e-9;
      for (let k = i + 1; k < n; k++) {
        const factor = A[k][i] / pivot;
        if (factor === 0) continue;
        for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
        B[k] -= factor * B[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = B[i];
      for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
      x[i] = sum / (A[i][i] || 1);
    }
    return x;
  }

  _syncAudioOutputs() {
    if (!this.isActive) {
      this.audio.updateCircuitOutputs({ sirenActive: false, motorActive: false });
      return;
    }
    const sirenOn = this.placedParts.some((p) => p.type === 'siren' && p.energizedCurrent > 0.04);
    const fanOn = this.placedParts.some((p) => p.type === 'fan' && p.energizedCurrent > 0.04);
    this.audio.updateCircuitOutputs({ sirenActive: sirenOn, motorActive: fanOn });
  }

  loadStarterExample() {
    this.clearBoard();
    const prevTool = this.selectedTool;
    const prevOri = this.orientation;

    const steps = [
      ['battery', 1, 1, 1],
      ['wire2', 2, 1, 1],
      ['switch', 1, 1, 0],
      ['wire3', 1, 2, 0],
      ['light_red', 1, 4, 1],
      ['wire2', 2, 4, 1],
      ['wire3', 3, 1, 0],
      ['wire2', 3, 3, 0]
    ];
    for (const [tool, r, c, ori] of steps) {
      this.selectedTool = tool;
      this.orientation = ori;
      this.placePartAt(r, c);
    }
    this.selectTool(prevTool);
    this.orientation = prevOri;
  }

  clearBoard() {
    while (this.placedParts.length > 0) {
      this._removePartById(this.placedParts[0].id);
    }
    this.selectedPartId = null;
    this._updateSelectionHighlight();
    this._solveCircuitGraph();
  }

  /**
   * Right-clicking any placed 3D piece rotates it 90° in-place immediately!
   */
  onRightClick(raycaster) {
    const hits = raycaster.intersectObjects(this.interactables, false);
    const partHit = hits.find((h) => h.object.userData?.placedPartId !== undefined);
    if (partHit) {
      return this.rotatePlacedPart(partHit.object.userData.placedPartId);
    }
    if (this.selectedPartId !== null) {
      return this.rotatePlacedPart(this.selectedPartId);
    }
    this.rotateOrientation();
    return true;
  }

  onPointerDown(hit, raycaster) {
    const ud = hit?.object?.userData;

    // 1. Clicking a part inside the 3D Kit Organizer selects that part for placement!
    if (ud?.traySelectType) {
      this.selectTool(ud.traySelectType);
      this.audio.playClick(780, 0.2);
      return true;
    }

    const pegInfo = this.getPegInfoFromRay(raycaster);
    const clickedPlacedId = ud?.placedPartId;
    const clickedPart =
      clickedPlacedId !== undefined ? this.placedParts.find((p) => p.id === clickedPlacedId) : null;

    // 2. Cut / Delete Tool Mode ('remove'): clicking any placed piece or peg removes it!
    if (this.selectedTool === 'remove') {
      if (clickedPart) {
        this._removePartById(clickedPart.id);
        this.audio.playClick(480, 0.25);
        return true;
      }
      if (pegInfo) {
        for (let i = this.placedParts.length - 1; i >= 0; i--) {
          if (this.placedParts[i].pegs.some((pg) => pg.r === pegInfo.r && pg.c === pegInfo.c)) {
            this._removePartById(this.placedParts[i].id);
            this.audio.playClick(480, 0.24);
            return true;
          }
        }
      }
      return false;
    }

    // 3. Select / Turn Placed Piece Mode ('select'):
    //    Clicking a Switch toggles it & selects it; clicking any other placed piece selects & rotates it 90°!
    if (this.selectedTool === 'select') {
      const targetPart =
        clickedPart ||
        (pegInfo
          ? [...this.placedParts]
              .reverse()
              .find((p) => p.pegs.some((pg) => pg.r === pegInfo.r && pg.c === pegInfo.c))
          : null);
      if (targetPart) {
        if (targetPart.type === 'switch' && (!pegInfo || pegInfo.distToPeg > 0.055)) {
          targetPart.isClosed = !targetPart.isClosed;
          this._updateSwitchVisual(targetPart);
          this.selectedPartId = targetPart.id;
          this._updateSelectionHighlight();
          this.audio.playClick(targetPart.isClosed ? 950 : 520, 0.3);
          this._solveCircuitGraph();
          return true;
        }
        this.selectedPartId = targetPart.id;
        this.rotatePlacedPart(targetPart.id);
        return true;
      }
      return false;
    }

    // 4. Active Placement Tool (wire2, wire3, battery, switch, lights, fan, siren):
    //    - Clicking the middle knob of a placed Switch always toggles it ON/OFF.
    //    - Clicking an existing Battery while holding 'battery' rotates the Battery 90° in-place.
    //    - Clicking the center body of a same-type part (or re-clicking the exact same footprint) rotates it 90° in-place.
    //    - Clicking on/near ANY peg while holding a Wire or different part ALWAYS snaps & connects onto that peg
    //      (including Battery (+) and (–) terminals and Load terminals) with zero hang-ups!
    if (clickedPart?.type === 'switch' && (!pegInfo || pegInfo.distToPeg > 0.068)) {
      clickedPart.isClosed = !clickedPart.isClosed;
      this._updateSwitchVisual(clickedPart);
      this.selectedPartId = clickedPart.id;
      this._updateSelectionHighlight();
      this.audio.playClick(clickedPart.isClosed ? 950 : 520, 0.3);
      this._solveCircuitGraph();
      return true;
    }

    if (this.selectedTool === 'battery' && clickedPart?.type === 'battery') {
      this.selectedPartId = clickedPart.id;
      this.rotatePlacedPart(clickedPart.id);
      return true;
    }

    if (
      clickedPart &&
      clickedPart.type === this.selectedTool &&
      (!pegInfo || pegInfo.distToPeg > 0.064)
    ) {
      this.selectedPartId = clickedPart.id;
      this.rotatePlacedPart(clickedPart.id);
      return true;
    }

    if (pegInfo) {
      const spec = SNAP_PART_CATALOG.find((s) => s.type === this.selectedTool);
      if (spec) {
        const candPegs = this._getSpanPegs(pegInfo.r, pegInfo.c, this.orientation, spec.span);
        if (candPegs) {
          const exactSamePart = this.placedParts.find(
            (p) => p.type === this.selectedTool && this._isSamePegSpan(p.pegs, candPegs)
          );
          if (exactSamePart) {
            this.selectedPartId = exactSamePart.id;
            this.rotatePlacedPart(exactSamePart.id);
            return true;
          }
        }
      }
      this.placePartAt(pegInfo.r, pegInfo.c);
      return true;
    }

    return false;
  }

  onHoverRay(raycaster) {
    const info = this.getPegInfoFromRay(raycaster);
    if (!info) {
      this.onHoverPeg(null, null);
      return false;
    }
    this.onHoverPeg(info.r, info.c);
    return true;
  }

  onHoverPeg(r, c) {
    if (r === null || c === null) {
      if (this.hoverPeg !== null) {
        this.hoverPeg = null;
        this.ghostGroup.visible = false;
      }
      return;
    }
    if (!this.hoverPeg || this.hoverPeg.r !== r || this.hoverPeg.c !== c) {
      this.hoverPeg = { r, c };
      this._updateGhostPreview();
    }
  }

  onPointerMove() {
    return false;
  }

  onPointerUp() {}

  setActive(active) {
    this.isActive = active;
    if (!active) this.ghostGroup.visible = false;
    this._syncAudioOutputs();
  }

  reset() {
    this.clearBoard();
    this.selectedTool = 'battery';
    this.orientation = 0;
    this.selectTool('battery');
  }

  getCameraLocalPreset() {
    return {
      pos: new THREE.Vector3(0.08, 1.48, 1.44),
      target: new THREE.Vector3(0.05, 0.08, 0.02)
    };
  }

  update(dt, elapsed) {
    for (const part of this.placedParts) {
      const powered = part.energizedCurrent > 0.04;
      const refs = part.meshGroup.userData.refs;
      if (!refs) continue;

      if (part.type.startsWith('light_')) {
        refs.domeMat.color.setHex(powered ? refs.onHex : refs.offHex);
        if (refs.ptLight) refs.ptLight.intensity = powered ? 1.8 : 0;
      } else if (part.type === 'fan') {
        refs.spinSpeed = powered
          ? Math.min(24, (refs.spinSpeed || 0) + dt * 28)
          : Math.max(0, (refs.spinSpeed || 0) - dt * 12);
        refs.fanRotor.rotation.y += refs.spinSpeed * dt;
      } else if (part.type === 'siren') {
        if (powered) {
          const ph = (elapsed * 2.6) % 1;
          refs.waveRing.scale.setScalar(0.8 + ph * 2.5);
          refs.waveMat.opacity = (1 - ph) * 0.78;
        } else {
          refs.waveMat.opacity = 0;
        }
      }
    }

    const segCount = this.energizedSegments.length;
    this.electronBeads.forEach((b, idx) => {
      if (segCount === 0) {
        b.mat.opacity = 0;
        return;
      }
      const seg = this.energizedSegments[idx % segCount];
      b.phase = (b.phase + dt * 1.65) % 1;
      b.mesh.position.lerpVectors(seg.start, seg.end, b.phase);
      b.mesh.position.y = 0.115;
      b.mat.opacity = 0.95;
    });
  }
}
