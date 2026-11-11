import * as THREE from 'three';

/**
 * High-Resolution Procedural PBR Texture & Signage Generator
 * Produces realistic tile floors, brushed metals, woodgrains, optical breadboards,
 * dynamic Maillard-browning bread slices, and Florida 5th Grade NGSSS wall posters.
 */

export class ProceduralTextures {
  static cache = new Map();

  static getLabFloorTextures() {
    if (this.cache.has('labFloor')) return this.cache.get('labFloor');

    const size = 1024;
    const colorCanvas = document.createElement('canvas');
    const bumpCanvas = document.createElement('canvas');
    const roughCanvas = document.createElement('canvas');
    colorCanvas.width = bumpCanvas.width = roughCanvas.width = size;
    colorCanvas.height = bumpCanvas.height = roughCanvas.height = size;

    const cCtx = colorCanvas.getContext('2d');
    const bCtx = bumpCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');

    // Base dark slate porcelain tile
    cCtx.fillStyle = '#18202c';
    cCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#e8e8e8';
    bCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#383838';
    rCtx.fillRect(0, 0, size, size);

    const tiles = 4;
    const step = size / tiles;

    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const x = tx * step;
        const y = ty * step;
        const shade = 22 + ((tx * 7 + ty * 13) % 7);
        const grad = cCtx.createLinearGradient(x, y, x + step, y + step);
        grad.addColorStop(0, `rgb(${shade}, ${shade + 7}, ${shade + 17})`);
        grad.addColorStop(1, `rgb(${shade - 3}, ${shade + 4}, ${shade + 13})`);
        cCtx.fillStyle = grad;
        cCtx.fillRect(x + 4, y + 4, step - 8, step - 8);

        // Subtle mineral fleck texture
        for (let s = 0; s < 140; s++) {
          const sx = x + 6 + Math.random() * (step - 12);
          const sy = y + 6 + Math.random() * (step - 12);
          const alpha = 0.025 + Math.random() * 0.04;
          cCtx.fillStyle = Math.random() > 0.5 ? `rgba(180,210,245,${alpha})` : `rgba(8,12,20,${alpha})`;
          cCtx.fillRect(sx, sy, 2.2, 2.2);
          rCtx.fillStyle = `rgba(90,90,90,${alpha * 2})`;
          rCtx.fillRect(sx, sy, 3, 3);
        }
      }
    }

    // Beveled grout seams
    cCtx.strokeStyle = '#0c1118';
    cCtx.lineWidth = 6;
    bCtx.strokeStyle = '#303030';
    bCtx.lineWidth = 8;
    rCtx.strokeStyle = '#d0d0d0';
    rCtx.lineWidth = 8;

    for (let i = 0; i <= tiles; i++) {
      const p = i * step;
      [cCtx, bCtx, rCtx].forEach((ctx) => {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      });
    }

    const wrap = (canvas, srgb = false) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(9, 7);
      tex.anisotropy = 8;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const out = {
      map: wrap(colorCanvas, true),
      bumpMap: wrap(bumpCanvas, false),
      roughnessMap: wrap(roughCanvas, false)
    };
    this.cache.set('labFloor', out);
    return out;
  }

  static getWoodTexture(variant = 'maple') {
    const key = `wood_${variant}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    const bump = document.createElement('canvas');
    canvas.width = bump.width = 512;
    canvas.height = bump.height = 512;
    const ctx = canvas.getContext('2d');
    const bCtx = bump.getContext('2d');

    const palettes = {
      maple: ['#c89b67', '#b5844f', '#9c6c3b'],
      walnut: ['#593a24', '#462b19', '#331e10'],
      oak: ['#a97845', '#8f6132', '#754c24']
    };
    const pal = palettes[variant] || palettes.maple;

    ctx.fillStyle = pal[0];
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#888';
    bCtx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y++) {
      const wave = Math.sin(y * 0.045) * 6 + Math.sin(y * 0.13) * 2;
      ctx.fillStyle = y % 9 < 3 ? pal[1] : pal[0];
      ctx.globalAlpha = 0.25 + 0.18 * Math.sin((y + wave) * 0.21);
      ctx.fillRect(0, y, 512, 1.5);

      bCtx.fillStyle = y % 5 === 0 ? '#686868' : '#9a9a9a';
      bCtx.globalAlpha = 0.25;
      bCtx.fillRect(0, y, 512, 1);
    }
    ctx.globalAlpha = 1;
    bCtx.globalAlpha = 1;

    // Fine wood grain fibers
    for (let i = 0; i < 320; i++) {
      const gx = Math.random() * 512;
      const gy = Math.random() * 512;
      const len = 40 + Math.random() * 140;
      ctx.strokeStyle = pal[2];
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 0.8 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.bezierCurveTo(gx + len * 0.3, gy + 2, gx + len * 0.7, gy - 2, gx + len, gy + 0.5);
      ctx.stroke();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;

    const bumpMap = new THREE.CanvasTexture(bump);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

    const res = { map, bumpMap };
    this.cache.set(key, res);
    return res;
  }

  static getBrushedMetalBump() {
    if (this.cache.has('brushedMetal')) return this.cache.get('brushedMetal');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1800; i++) {
      const y = Math.random() * 512;
      const shade = 105 + Math.floor(Math.random() * 55);
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.cache.set('brushedMetal', tex);
    return tex;
  }

  static getOpticalBreadboardTexture() {
    if (this.cache.has('breadboard')) return this.cache.get('breadboard');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#141922';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = step / 2; x < 512; x += step) {
      for (let y = step / 2; y < 512; y += step) {
        ctx.fillStyle = '#070a0f';
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 5.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.cache.set('breadboard', tex);
    return tex;
  }

  /**
   * Dynamic Bread Crumb CanvasTexture that browns smoothly from fresh white bread (0) to golden toast (1)
   */
  static createDynamicBreadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Pre-seed porous air pockets so crumb pattern stays consistent as it browns
    const pores = Array.from({ length: 420 }, () => ({
      x: Math.random() * 256,
      y: Math.random() * 256,
      r: 1.2 + Math.random() * 4.2,
      d: Math.random()
    }));

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const updateToast = (toastAmount = 0) => {
      const t = Math.max(0, Math.min(1, toastAmount));
      // Interpolate from soft cream (#f4ead2) to golden-brown Maillard toast (#7c4318)
      const r = Math.round(244 - t * 120);
      const g = Math.round(234 - t * 164);
      const b = Math.round(210 - t * 184);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, 256, 256);

      // Center grill-wire toast sear lines when toasted
      if (t > 0.08) {
        ctx.fillStyle = `rgba(58, 24, 6, ${t * 0.42})`;
        for (let gx = 36; gx < 256; gx += 60) {
          ctx.fillRect(gx, 0, 8, 256);
        }
      }

      for (const p of pores) {
        const pr = Math.max(20, Math.round(r * (0.76 - p.d * 0.14 - t * 0.16)));
        const pg = Math.max(12, Math.round(g * (0.74 - p.d * 0.14 - t * 0.2)));
        const pb = Math.max(6, Math.round(b * (0.7 - p.d * 0.14 - t * 0.22)));
        ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      tex.needsUpdate = true;
    };

    updateToast(0);
    return { texture: tex, updateToast };
  }

  /**
   * High-DPI Station Bench Header Sign Plaque
   */
  static createStationSignTexture({ number, title, benchmarks, accent }) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0c131f';
    ctx.fillRect(0, 0, 1024, 256);

    // Subtle top/bottom accent bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 1024, 10);
    ctx.fillRect(0, 248, 1024, 8);

    // Station badge box
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(28, 34, 152, 188);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 34, 152, 188);

    ctx.fillStyle = accent;
    ctx.font = '700 30px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STATION', 104, 84);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 92px system-ui, -apple-system, sans-serif';
    ctx.fillText(`0${number}`, 104, 186);

    // Main title & Florida NGSSS benchmark tags
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 50px system-ui, -apple-system, sans-serif';
    ctx.fillText(title, 212, 114);

    ctx.fillStyle = accent;
    ctx.font = '600 30px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(`FLORIDA NGSSS: ${benchmarks.join('  •  ')}`, 212, 178);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  /**
   * High-DPI Classroom Wall Poster for Florida 5th Grade Science Standards
   */
  static createFloridaPosterTexture(code, heading, bullets, accent) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#152238');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 768, 1024);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, 724, 980);

    ctx.fillStyle = accent;
    ctx.fillRect(54, 58, 660, 88);
    ctx.fillStyle = '#09101a';
    ctx.font = '800 44px ui-monospace, monospace';
    ctx.fillText(`FL NGSSS • ${code}`, 80, 118);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 54px system-ui, sans-serif';
    this._wrapText(ctx, heading, 58, 225, 650, 64);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 34px system-ui, sans-serif';
    let y = 400;
    bullets.forEach((b) => {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(76, y - 12, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      y = this._wrapText(ctx, b, 106, y, 600, 46) + 38;
    });

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(54, 890, 660, 72);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.fillText('FLORIDA GRADE 5 SCIENCE • OMNIENERGY STEM LAB', 78, 936);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  static _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    return y;
  }
}
