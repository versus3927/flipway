import * as THREE from 'three';

function cnv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, THREE.Texture>();

/** Мягкое свечение для спрайтов */
export function glowTex(): THREE.Texture {
  let t = cache.get('glow');
  if (t) return t;
  const [c, g] = cnv(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('glow', t);
  return t;
}

/** Тёмная панель со светящимися окнами */
export function windowsTex(base: string, lit: string, cols = 5, rows = 7): THREE.Texture {
  const key = `win${base}${lit}${cols}${rows}`;
  let t = cache.get(key);
  if (t) return t;
  const [c, g] = cnv(128, 160);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 160);
  const cw = 128 / cols, rh = 160 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = Math.random() < 0.55;
      g.fillStyle = on ? lit : 'rgba(0,0,0,0.35)';
      g.fillRect(x * cw + cw * 0.24, y * rh + rh * 0.26, cw * 0.52, rh * 0.46);
    }
  }
  t = toTex(c);
  cache.set(key, t);
  return t;
}

/** Диагональная предупреждающая разметка */
export function hazardTex(): THREE.Texture {
  let t = cache.get('haz');
  if (t) return t;
  const [c, g] = cnv(128, 128);
  g.fillStyle = '#15161c';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f7c948';
  for (let i = -128; i < 256; i += 44) {
    g.beginPath();
    g.moveTo(i, 128); g.lineTo(i + 22, 128); g.lineTo(i + 128 + 22, 0); g.lineTo(i + 128, 0);
    g.closePath(); g.fill();
  }
  t = toTex(c);
  cache.set('haz', t);
  return t;
}

/** Полосатый тент */
export function stripesTex(a: string, b: string): THREE.Texture {
  const key = `str${a}${b}`;
  let t = cache.get(key);
  if (t) return t;
  const [c, g] = cnv(128, 64);
  g.fillStyle = a; g.fillRect(0, 0, 128, 64);
  g.fillStyle = b;
  for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 64);
  t = toTex(c);
  cache.set(key, t);
  return t;
}

/** Булыжная мостовая */
export function cobbleTex(base = '#a89f8c', gap = '#7d7462'): THREE.Texture {
  const key = `cob${base}${gap}`;
  let t = cache.get(key);
  if (t) return t;
  const [c, g] = cnv(128, 128);
  g.fillStyle = gap; g.fillRect(0, 0, 128, 128);
  const s = 26;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const off = y % 2 ? s / 2 : 0;
      const l = 0.86 + Math.random() * 0.22;
      g.fillStyle = shadeHex(base, l);
      const px = ((x * s + off) % 140) - 6;
      roundRect(g, px + 2, y * s + 2, s - 4, s - 4, 6);
      g.fill();
    }
  }
  t = toTex(c);
  cache.set(key, t);
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shadeHex(hex: string, mul: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * mul);
  const gg = Math.min(255, ((n >> 8) & 255) * mul);
  const b = Math.min(255, (n & 255) * mul);
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

/** Неоновая вывеска с текстом */
export function signTex(text: string, color: string): THREE.Texture {
  const key = `sign${text}${color}`;
  let t = cache.get(key);
  if (t) return t;
  const [c, g] = cnv(256, 96);
  g.clearRect(0, 0, 256, 96);
  g.font = '900 52px "Russo One", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 128, 52);
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.85;
  g.fillText(text, 128, 52);
  t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}
