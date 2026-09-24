import * as THREE from 'three';
import { TUNNEL_H, LOCS, LocId, rand, pick } from './config';
import { glowTex, hazardTex, windowsTex, stripesTex, signTex } from './textures';

// ── Кэш геометрий ──────────────────────────────────────────────
const geos = new Map<string, THREE.BufferGeometry>();
export function boxGeo(w: number, h: number, d: number) {
  const k = `b${w}|${h}|${d}`;
  let g = geos.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); geos.set(k, g); } return g;
}
export function cylGeo(rt: number, rb: number, h: number, s = 10) {
  const k = `c${rt}|${rb}|${h}|${s}`;
  let g = geos.get(k); if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, s); geos.set(k, g); } return g;
}
export function coneGeo(r: number, h: number, s = 8) {
  const k = `k${r}|${h}|${s}`;
  let g = geos.get(k); if (!g) { g = new THREE.ConeGeometry(r, h, s); geos.set(k, g); } return g;
}
export function sphGeo(r: number, w = 10, h = 8) {
  const k = `s${r}|${w}|${h}`;
  let g = geos.get(k); if (!g) { g = new THREE.SphereGeometry(r, w, h); geos.set(k, g); } return g;
}
export function icoGeo(r: number, d = 0) {
  const k = `i${r}|${d}`;
  let g = geos.get(k); if (!g) { g = new THREE.IcosahedronGeometry(r, d); geos.set(k, g); } return g;
}
export function octGeo(r: number) {
  const k = `o${r}`;
  let g = geos.get(k); if (!g) { g = new THREE.OctahedronGeometry(r); geos.set(k, g); } return g;
}
export function torGeo(r: number, t: number) {
  const k = `t${r}|${t}`;
  let g = geos.get(k); if (!g) { g = new THREE.TorusGeometry(r, t, 6, 16); geos.set(k, g); } return g;
}
let vaseGeoCache: THREE.BufferGeometry | null = null;
export function vaseGeo() {
  if (vaseGeoCache) return vaseGeoCache;
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [[0.02, 0], [0.2, 0.02], [0.3, 0.14], [0.24, 0.45], [0.15, 0.66], [0.26, 0.82], [0.24, 0.94], [0.16, 1.0]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  vaseGeoCache = new THREE.LatheGeometry(pts, 10);
  return vaseGeoCache;
}
export function planeGeo(w: number, h: number) {
  const k = `p${w}|${h}`;
  let g = geos.get(k); if (!g) { g = new THREE.PlaneGeometry(w, h); geos.set(k, g); } return g;
}

// ── Кэш материалов ─────────────────────────────────────────────
const mats = new Map<string, THREE.Material>();
export function std(color: number, e = 0, ei = 0, rough = 0.9, metal = 0.02, flat = true): THREE.MeshStandardMaterial {
  const k = `st${color}|${e}|${ei}|${rough}|${metal}|${flat}`;
  let m = mats.get(k) as THREE.MeshStandardMaterial;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, emissive: e, emissiveIntensity: ei, roughness: rough, metalness: metal, flatShading: flat,
    });
    mats.set(k, m);
  }
  return m;
}
export function lam(color: number): THREE.MeshBasicMaterial {
  const k = `la${color}`;
  let m = mats.get(k) as THREE.MeshBasicMaterial;
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); mats.set(k, m); }
  return m;
}

export function M(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  return mesh;
}

export function sprite(color: number, scale: number, opacity = 0.85) {
  const sm = new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(sm);
  s.scale.setScalar(scale);
  return s;
}

// ── ПОЕЗД ──────────────────────────────────────────────────────
export interface TrainScheme { body: number; roof: number; stripe: number; win: number; }
export function makeTrain(len: number, s: TrainScheme): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = std(s.body, 0, 0, 0.6, 0.25);
  g.add(M(boxGeo(2.1, 2.5, len), bodyMat, 0, 1.45, 0));
  g.add(M(boxGeo(1.9, 0.34, len * 0.96), std(s.roof, 0, 0, 0.7, 0.2), 0, 2.85, 0));
  g.add(M(boxGeo(2.02, 0.62, len * 0.94), std(0x0a0c12, 0, 0, 0.8), 0, 0.42, 0));
  // светящаяся полоса
  g.add(M(boxGeo(2.14, 0.2, len * 0.9), lam(s.stripe), 0, 2.35, 0));
  // окна — эмиссивная текстура
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d16, emissive: s.win, emissiveIntensity: 1.0,
    emissiveMap: windowsTex('#05070d', '#bfe6ff', Math.max(3, Math.floor(len / 3)), 1), roughness: 0.5,
  });
  winMat.emissiveMap!.repeat.set(1, 1);
  const wl = M(planeGeo(len * 0.86, 0.62), winMat, -1.06, 1.85, 0); wl.rotation.y = -Math.PI / 2;
  const wr = M(planeGeo(len * 0.86, 0.62), winMat, 1.06, 1.85, 0); wr.rotation.y = Math.PI / 2;
  g.add(wl, wr);
  // морда (смотрит на игрока, т.е. +z)
  g.add(M(boxGeo(2.05, 2.3, 1.1), bodyMat, 0, 1.4, len / 2 + 0.5));
  g.add(M(boxGeo(1.7, 0.7, 0.12), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x9fd8ff, emissiveIntensity: 0.8, roughness: 0.3 }), 0, 2.2, len / 2 + 1.06));
  const h1 = sprite(0xfff2c0, 1.5, 0.95); h1.position.set(-0.62, 1.0, len / 2 + 1.1);
  const h2 = sprite(0xfff2c0, 1.5, 0.95); h2.position.set(0.62, 1.0, len / 2 + 1.1);
  g.add(h1, h2);
  const red = M(boxGeo(0.18, 0.18, 0.06), lam(0xff3040), 0, 1.0, len / 2 + 1.08);
  g.add(red);
  return g;
}

// ── Препятствия: ПОЛ (низкие, обходятся сальтом/прыжком) ─────
export function makeFloorObstacle(loc: LocId): THREE.Group {
  const g = new THREE.Group();
  if (loc === 'metro') {
    const haz = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7, emissive: 0xf7c948, emissiveIntensity: 0.12 });
    g.add(M(boxGeo(1.9, 0.3, 0.2), haz, 0, 0.98, 0));
    g.add(M(boxGeo(0.16, 1.0, 0.16), std(0x2a2f3d), -0.78, 0.5, 0));
    g.add(M(boxGeo(0.16, 1.0, 0.16), std(0x2a2f3d), 0.78, 0.5, 0));
    g.add(M(boxGeo(2.0, 0.08, 0.26), lam(0x22e0ff), 0, 1.18, 0));
  } else if (loc === 'canyon') {
    const rock = std(0x8a4f2c, 0, 0, 1, 0, true);
    const b1 = M(icoGeo(0.7), rock, 0, 0.55, 0); b1.scale.set(1.5, 0.95, 0.9); b1.rotation.set(0.4, 0.7, 0.2);
    const b2 = M(icoGeo(0.45), std(0x9d5c33, 0, 0, 1), -0.55, 0.35, 0.25); b2.rotation.set(1, 0.3, 0.5);
    const b3 = M(icoGeo(0.4), std(0x74401f, 0, 0, 1), 0.6, 0.3, -0.2); b3.rotation.set(0.2, 1.2, 0.9);
    g.add(b1, b2, b3);
  } else if (loc === 'ice') {
    const ice = std(0xbfeaff, 0x66d9ff, 0.35, 0.25, 0.05, true);
    const c1 = M(coneGeo(0.34, 1.35, 6), ice, -0.42, 0.67, 0.1);
    const c2 = M(coneGeo(0.28, 1.1, 6), ice, 0.3, 0.55, -0.15);
    const c3 = M(coneGeo(0.22, 0.9, 6), ice, 0.62, 0.45, 0.3);
    const c4 = M(coneGeo(0.3, 1.28, 6), ice, 0, 0.64, 0.32);
    g.add(c1, c2, c3, c4, M(boxGeo(1.9, 0.16, 1.0), std(0x9fd3e8, 0, 0, 0.4), 0, 0.08, 0));
  } else if (loc === 'pugs') {
    // Валяющиеся мопсы на коврике
    g.add(M(boxGeo(1.9, 0.08, 1.15), std(0xd94f8a, 0xff6b9d, 0.25, 0.9), 0, 0.04, 0));
    const p1 = makePug(); p1.scale.setScalar(0.85); p1.position.set(-0.42, 0.06, 0); p1.rotation.z = Math.PI / 2 * 0.9; p1.rotation.y = 0.5;
    const p2 = makePug(); p2.scale.setScalar(0.75); p2.position.set(0.48, 0.06, 0.1); p2.rotation.z = -Math.PI / 2 * 0.85; p2.rotation.y = -0.8;
    g.add(p1, p2);
  } else {
    g.add(M(boxGeo(1.9, 0.3, 0.2), std(0xb0b6c2), 0, 0.95, 0));
  }
  return g;
}

// ── Препятствия: ПОТОЛОК ───────────────────────────────────────
export function makeCeilObstacle(loc: LocId): THREE.Group {
  const g = new THREE.Group();
  const H = TUNNEL_H;
  if (loc === 'metro') {
    g.add(M(boxGeo(0.08, 1.0, 0.08), std(0x39404f), 0, H - 0.5, 0));
    g.add(M(boxGeo(1.75, 0.85, 1.35), std(0x1a2130, 0, 0, 0.6, 0.3), 0, H - 1.35, 0));
    g.add(M(boxGeo(1.79, 0.14, 1.39), lam(0xff2d95), 0, H - 0.95, 0));
    const s = sprite(0xff2d95, 0.9, 0.8); s.position.set(0, H - 1.82, 0); g.add(s);
  } else if (loc === 'canyon') {
    const rock = std(0x7a4526, 0, 0, 1);
    const c1 = M(coneGeo(0.5, 1.9, 6), rock, -0.5, H - 0.95, 0); c1.rotation.x = Math.PI;
    const c2 = M(coneGeo(0.42, 1.5, 6), rock, 0.35, H - 0.75, 0.2); c2.rotation.x = Math.PI;
    const c3 = M(coneGeo(0.36, 1.7, 6), rock, 0.7, H - 0.85, -0.3); c3.rotation.x = Math.PI;
    g.add(c1, c2, c3);
  } else if (loc === 'ice') {
    const ice = std(0xa8dcff, 0x66d9ff, 0.5, 0.3);
    const c1 = M(coneGeo(0.4, 1.9, 6), ice, -0.42, H - 0.95, 0); c1.rotation.x = Math.PI;
    const c2 = M(coneGeo(0.32, 1.5, 6), ice, 0.3, H - 0.75, 0.15); c2.rotation.x = Math.PI;
    const c3 = M(coneGeo(0.26, 1.25, 6), ice, 0.66, H - 0.62, -0.25); c3.rotation.x = Math.PI;
    g.add(c1, c2, c3);
  } else if (loc === 'pugs') {
    // Шарики с мордами мопсов:)
    const cols = [0xffd166, 0xff6b9d, 0x8be9fd];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.62;
      g.add(M(cylGeo(0.015, 0.015, 1.1, 4), lam(0x555), x, H - 0.55, 0));
      const b = M(sphGeo(0.34, 10, 8), std(cols[i], cols[i], 0.25, 0.6, 0, false), x, H - 1.42, 0);
      g.add(b);
      g.add(M(boxGeo(0.2, 0.1, 0.08), std(0x3a2c22), x, H - 1.45, -0.3));
      g.add(M(boxGeo(0.1, 0.06, 0.05), std(0x1d1611), x - 0.07, H - 1.34, -0.31));
      g.add(M(boxGeo(0.1, 0.06, 0.05), std(0x1d1611), x + 0.07, H - 1.34, -0.31));
    }
  }
  return g;
}

/** Полноростовой блок — только смена дорожки */
export function makeBlock(loc: LocId): THREE.Group {
  const g = new THREE.Group();
  const cfg = LOCS[loc];
  const hazMap = hazardTex().clone();
  hazMap.repeat.set(1, 3);
  hazMap.needsUpdate = true;
  const haz = new THREE.MeshStandardMaterial({ map: hazMap, roughness: 0.75, emissive: cfg.accent, emissiveIntensity: 0.1 });
  g.add(M(boxGeo(2.0, TUNNEL_H, 1.2), haz, 0, TUNNEL_H / 2, 0));
  g.add(M(boxGeo(2.06, 0.18, 1.26), lam(cfg.accent2), 0, TUNNEL_H - 1.2, 0));
  g.add(M(boxGeo(2.06, 0.18, 1.26), lam(cfg.accent2), 0, 1.2, 0));
  return g;
}

// ── Монетка ────────────────────────────────────────────────────
export function makeCoin(): THREE.Group {
  const g = new THREE.Group();
  const gold = std(0xf7c948, 0xffb300, 0.55, 0.3, 0.7, false);
  const c = M(cylGeo(0.3, 0.3, 0.07, 16), gold);
  c.rotation.x = Math.PI / 2;
  const rim = M(torGeo(0.3, 0.045), std(0xffe083, 0xffc93c, 0.5, 0.35, 0.6, false));
  g.add(c, rim);
  return g;
}

// ── ЗАМОК: препятствия ─────────────────────────────────────────
export function makeBush(): THREE.Group {
  const g = new THREE.Group();
  const leaf = std(0x3d7a34, 0, 0, 0.95);
  const leaf2 = std(0x4f9440, 0, 0, 0.95);
  const b1 = M(icoGeo(0.55, 0), leaf, -0.35, 0.5, 0);
  const b2 = M(icoGeo(0.48, 0), leaf2, 0.35, 0.42, 0.1);
  const b3 = M(icoGeo(0.42, 0), leaf, 0, 0.72, -0.15);
  g.add(b1, b2, b3);
  const fl = M(sphGeo(0.07, 6, 5), lam(0xff8fb5), 0.3, 0.78, 0.15);
  const fl2 = M(sphGeo(0.06, 6, 5), lam(0xffe9a8), -0.25, 0.82, -0.05);
  g.add(fl, fl2);
  return g;
}

export function makeVase(): THREE.Group {
  const g = new THREE.Group();
  g.add(M(vaseGeo(), std(0xb4653a, 0, 0, 0.75), 0, 0, 0));
  g.add(M(sphGeo(0.2, 8, 6), std(0x3d7a34), 0, 1.05, 0));
  g.add(M(sphGeo(0.08, 6, 5), lam(0xff6b9d), 0.12, 1.16, 0.08));
  g.add(M(sphGeo(0.07, 6, 5), lam(0xffd166), -0.1, 1.12, -0.06));
  return g;
}

export function makeRailOb(): THREE.Group {
  const g = new THREE.Group();
  const white = std(0xe8ecf2, 0, 0, 0.5, 0.1);
  const gold = std(0xd9a520, 0xffc93c, 0.3, 0.4, 0.6);
  for (const x of [-0.85, 0, 0.85]) {
    g.add(M(cylGeo(0.05, 0.07, 1.0, 6), white, x, 0.5, 0));
    g.add(M(sphGeo(0.08, 6, 5), gold, x, 1.04, 0));
  }
  g.add(M(boxGeo(2.05, 0.09, 0.09), gold, 0, 0.98, 0));
  g.add(M(boxGeo(2.05, 0.06, 0.06), white, 0, 0.55, 0));
  return g;
}

// ── ДРАКОН ─────────────────────────────────────────────────────
let wingGeoCache: THREE.BufferGeometry | null = null;
function wingGeo() {
  if (wingGeoCache) return wingGeoCache;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.85, 0.45); s.lineTo(1.6, 0.3); s.lineTo(1.15, -0.02);
  s.lineTo(1.55, -0.55); s.lineTo(0.8, -0.35); s.lineTo(0.35, -0.52);
  s.lineTo(0, 0);
  wingGeoCache = new THREE.ShapeGeometry(s);
  return wingGeoCache;
}

export function makeDragon(color = 0xc63b2f, scaleV = 1): THREE.Group {
  const g = new THREE.Group();
  const skin = std(color, 0, 0, 0.8);
  const dark = std(new THREE.Color(color).multiplyScalar(0.6).getHex(), 0, 0, 0.85);
  const wingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.85).getHex(), roughness: 0.85, side: THREE.DoubleSide, flatShading: true });

  const body = M(sphGeo(0.85, 10, 8), skin, 0, 0, 0);
  body.scale.set(0.72, 0.68, 1.6);
  g.add(body);
  // шипы на спине
  for (let i = 0; i < 4; i++) {
    g.add(M(coneGeo(0.11, 0.35, 4), dark, 0, 0.62, -0.5 + i * 0.42));
  }
  const neck = M(cylGeo(0.16, 0.3, 0.9, 6), skin, 0, 0.42, -1.2);
  neck.rotation.x = -0.9;
  g.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.78, -1.62);
  head.add(M(boxGeo(0.46, 0.4, 0.6), skin, 0, 0, 0));
  head.add(M(boxGeo(0.3, 0.22, 0.4), skin, 0, -0.05, -0.42));
  head.add(M(sphGeo(0.05, 6, 5), lam(0xffe14d), -0.16, 0.08, -0.26));
  head.add(M(sphGeo(0.05, 6, 5), lam(0xffe14d), 0.16, 0.08, -0.26));
  const h1 = M(coneGeo(0.07, 0.3, 4), dark, -0.14, 0.28, 0.14); h1.rotation.x = 0.5;
  const h2 = M(coneGeo(0.07, 0.3, 4), dark, 0.14, 0.28, 0.14); h2.rotation.x = 0.5;
  head.add(h1, h2);
  g.add(head);
  const tail = M(coneGeo(0.24, 1.6, 6), skin, 0, 0.1, 1.7);
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  // лапы
  g.add(M(cylGeo(0.08, 0.1, 0.4, 5), dark, -0.35, -0.55, -0.5));
  g.add(M(cylGeo(0.08, 0.1, 0.4, 5), dark, 0.35, -0.55, -0.5));
  // крылья
  const wl = new THREE.Group(); wl.position.set(0.3, 0.4, -0.2);
  const wlm = new THREE.Mesh(wingGeo(), wingMat); wlm.scale.setScalar(1.5); wl.add(wlm);
  const wr = new THREE.Group(); wr.position.set(-0.3, 0.4, -0.2);
  const wrm = new THREE.Mesh(wingGeo(), wingMat); wrm.scale.set(-1.5, 1.5, 1.5); wr.add(wrm);
  g.add(wl, wr);
  const phase = Math.random() * 10;
  g.userData.tick = (t: number) => {
    const f = 0.3 + Math.sin(t * 7 + phase) * 0.55;
    wl.rotation.z = f; wr.rotation.z = -f;
    head.rotation.y = Math.sin(t * 1.7 + phase) * 0.2;
  };
  g.scale.setScalar(scaleV);
  return g;
}

// ── МОПС ───────────────────────────────────────────────────────
export function makePug(): THREE.Group {
  const g = new THREE.Group();
  const tan = std(0xc9a06c, 0, 0, 0.95);
  const darkF = std(0x3a2c22, 0, 0, 0.95);
  g.add(M(boxGeo(0.56, 0.44, 0.82), tan, 0, 0.38, 0)); // тело
  const head = new THREE.Group();
  head.position.set(0, 0.62, -0.48);
  head.add(M(boxGeo(0.44, 0.4, 0.38), tan, 0, 0, 0));
  head.add(M(boxGeo(0.22, 0.16, 0.12), darkF, 0, -0.06, -0.22));
  head.add(M(sphGeo(0.045, 6, 5), lam(0x14100c), -0.12, 0.06, -0.19));
  head.add(M(sphGeo(0.045, 6, 5), lam(0x14100c), 0.12, 0.06, -0.19));
  const e1 = M(boxGeo(0.1, 0.14, 0.05), darkF, -0.16, 0.24, -0.02); e1.rotation.z = 0.35;
  const e2 = M(boxGeo(0.1, 0.14, 0.05), darkF, 0.16, 0.24, -0.02); e2.rotation.z = -0.35;
  head.add(e1, e2);
  g.add(head);
  for (const [x, z] of [[-0.18, -0.28], [0.18, -0.28], [-0.18, 0.28], [0.18, 0.28]] as const) {
    g.add(M(boxGeo(0.11, 0.24, 0.11), darkF, x, 0.12, z));
  }
  const tail = M(new THREE.TorusGeometry(0.09, 0.035, 5, 10, Math.PI * 1.6), tan, 0, 0.6, 0.42);
  tail.rotation.set(0.3, 0.4, 0);
  g.add(tail);
  const phase = Math.random() * 10;
  g.userData.tick = (t: number) => {
    g.position.y += 0; // позиция управляется снаружи
    const b = Math.abs(Math.sin(t * 6 + phase)) * 0.05;
    g.children[0].position.y = 0.38 + b;
    head.rotation.z = Math.sin(t * 5 + phase) * 0.08;
    tail.rotation.z = Math.sin(t * 9 + phase) * 0.4;
  };
  return g;
}

// ── Замок: стена на старой дороге ──────────────────────────────
export function makeCastleWall(len: number): THREE.Group {
  const g = new THREE.Group();
  const stone = std(0xb9b3a4, 0, 0, 0.95);
  g.add(M(boxGeo(8.6, 5.6, len), stone, 0, 2.8, -len / 2));
  g.add(M(boxGeo(8.8, 0.7, len), std(0x9d9688, 0, 0, 0.9), 0, 5.85, -len / 2));
  for (let i = 0; i < 5; i++) {
    g.add(M(boxGeo(1.1, 0.85, 1.4), stone, 0, 6.5, -2.4 - i * 6.2));
  }
  // красные знамёна
  for (let i = 0; i < 2; i++) {
    const b = M(planeGeo(1.4, 2.4), std(0xa12336, 0x701221, 0.15, 0.9), -4.33, 3.6, -8 - i * 14);
    b.rotation.y = -Math.PI / 2;
    const trim = M(planeGeo(1.4, 0.3), std(0xd9a520, 0xffc93c, 0.2, 0.5), -4.32, 2.55, -8 - i * 14);
    trim.rotation.y = -Math.PI / 2;
    g.add(b, trim);
  }
  const banner = M(planeGeo(1.4, 2.4), std(0xa12336, 0x701221, 0.15, 0.9), 4.33, 3.6, -15);
  banner.rotation.y = Math.PI / 2;
  g.add(banner);
  return g;
}

// ── Замок: дворец ──────────────────────────────────────────────
export function makePalace(variant: 'keep' | 'tower' | 'wall'): THREE.Group {
  const g = new THREE.Group();
  const white = std(0xeef1f5, 0, 0, 0.85);
  const roof = std(0x3f74d6, 0, 0, 0.7);
  const gold = std(0xd9a520, 0xffc93c, 0.35, 0.35, 0.7);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, emissive: 0xffd166, emissiveIntensity: 1.0, emissiveMap: windowsTex('#0c1420', '#ffd166', 3, 4), roughness: 0.5 });
  if (variant === 'keep') {
    g.add(M(boxGeo(7, 9, 9), white, 0, 4.5, 0));
    const roofM = M(coneGeo(5.4, 3.2, 4), roof, 0, 10.6, 0); roofM.rotation.y = Math.PI / 4; g.add(roofM);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(M(cylGeo(1.1, 1.3, 10.5, 8), white, sx * 3.9, 5.25, sz * 4.2));
      g.add(M(coneGeo(1.5, 2.8, 8), roof, sx * 3.9, 11.9, sz * 4.2));
      g.add(M(sphGeo(0.18, 6, 5), gold, sx * 3.9, 13.4, sz * 4.2));
    }
    // окна лицом к улице (+x)
    for (let iy = 0; iy < 3; iy++) for (let iz = 0; iz < 3; iz++) {
      const w = M(planeGeo(0.7, 1.0), winMat, 3.52, 2.4 + iy * 2.4, -2.6 + iz * 2.6);
      w.rotation.y = Math.PI / 2;
      g.add(w);
    }
    const gate = M(boxGeo(0.3, 2.4, 1.8), std(0x5e4632, 0, 0, 0.9), 3.52, 1.2, 0);
    g.add(gate);
  } else if (variant === 'tower') {
    g.add(M(cylGeo(1.7, 2.0, 12, 8), white, 0, 6, 0));
    g.add(M(coneGeo(2.3, 3.6, 8), roof, 0, 13.8, 0));
    g.add(M(sphGeo(0.24, 6, 5), gold, 0, 15.8, 0));
    for (let i = 0; i < 3; i++) {
      const w = M(planeGeo(0.6, 0.9), winMat, 1.72, 3 + i * 3, 0);
      w.rotation.y = Math.PI / 2;
      g.add(w);
    }
    g.add(M(boxGeo(3.4, 4.2, 18), white, 0.4, 2.1, 0));
    g.add(M(boxGeo(3.6, 0.6, 18.4), roof, 0.4, 4.4, 0));
  } else {
    // стена дворца с бойницами
    g.add(M(boxGeo(2.6, 4.4, 26), white, 0, 2.2, 0));
    g.add(M(boxGeo(2.8, 0.6, 26.4), std(0xd7dbe2, 0, 0, 0.9), 0, 4.7, 0));
    for (let i = 0; i < 5; i++) g.add(M(boxGeo(2.7, 0.8, 1.2), white, 0, 5.4, -10 + i * 5));
    for (let i = 0; i < 4; i++) {
      const w = M(planeGeo(0.5, 0.8), winMat, 1.32, 2.6, -9.5 + i * 6.3);
      w.rotation.y = Math.PI / 2;
      g.add(w);
    }
  }
  return g;
}

export function makeMoat(len: number): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.MeshStandardMaterial({ color: 0x1f6fc9, emissive: 0x2a86e8, emissiveIntensity: 0.25, roughness: 0.15, transparent: true, opacity: 0.92 });
  const w = M(planeGeo(6.4, len), water, 0, -0.18, -len / 2);
  w.rotation.x = -Math.PI / 2;
  g.add(w);
  for (let i = 0; i < 4; i++) {
    const s = sprite(0x9fd4ff, 0.5 + Math.random() * 0.4, 0.5);
    s.position.set(rand(-2.6, 2.6), 0.05, -rand(2, len - 2));
    const baseY = 0.05, ph = Math.random() * 7;
    s.userData.tick = (t: number) => { s.position.y = baseY + Math.sin(t * 2 + ph) * 0.06; };
    g.add(s);
  }
  return g;
}

export function makeRailingRow(len: number): THREE.Group {
  const g = new THREE.Group();
  const white = std(0xe8ecf2, 0, 0, 0.55, 0.1);
  const gold = std(0xd9a520, 0xffc93c, 0.25, 0.4, 0.6);
  g.add(M(boxGeo(0.1, 0.1, len), gold, 0, 0.98, -len / 2));
  g.add(M(boxGeo(0.07, 0.07, len), white, 0, 0.55, -len / 2));
  for (let i = 0; i <= Math.floor(len / 3); i++) {
    g.add(M(cylGeo(0.05, 0.07, 1.0, 6), white, 0, 0.5, -i * 3));
    if (i % 2 === 0) g.add(M(sphGeo(0.08, 6, 5), gold, 0, 1.05, -i * 3));
  }
  return g;
}

// ── Ворота-разделитель локаций ─────────────────────────────────
export function makeGate(x0: number, x1: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const mat = std(0x11141f, color, 0.5, 0.4, 0.4);
  g.add(M(boxGeo(0.7, TUNNEL_H, 0.8), mat, x0, TUNNEL_H / 2, 0));
  g.add(M(boxGeo(0.7, TUNNEL_H, 0.8), mat, x1, TUNNEL_H / 2, 0));
  g.add(M(boxGeo(w + 0.7, 0.6, 0.9), mat, cx, TUNNEL_H + 0.1, 0));
  g.add(M(boxGeo(w + 0.5, 0.14, 0.95), lam(color), cx, TUNNEL_H - 0.28, 0));
  for (const x of [x0, x1]) g.add(M(boxGeo(0.74, 0.14, 0.84), lam(color), x, TUNNEL_H * 0.55, 0));
  const s = sprite(color, 5, 0.4); s.position.set(cx, TUNNEL_H / 2, 0); g.add(s);
  return g;
}

/** Стрелка-шеврон на земле (указывает влево при dir='left', т.е. в -x) */
export function makeArrow(dir: 'left' | 'right', color: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const s = dir === 'left' ? 1 : -1;
  const a = M(boxGeo(1.25, 0.05, 0.32), m, -s * 0.05, 0, 0.28); a.rotation.y = -s * 0.885;
  const b = M(boxGeo(1.25, 0.05, 0.32), m, -s * 0.05, 0, -0.28); b.rotation.y = s * 0.885;
  g.add(a, b);
  const ph = Math.random() * 4;
  g.userData.tick = (t: number) => { m.opacity = 0.55 + Math.abs(Math.sin(t * 4 + ph)) * 0.45; };
  return g;
}

/** Баррикада на конце улицы замка */
export function makeBarricade(w: number): THREE.Group {
  const g = new THREE.Group();
  const hazMap = hazardTex().clone();
  hazMap.repeat.set(4, 1);
  hazMap.needsUpdate = true;
  const haz = new THREE.MeshStandardMaterial({ map: hazMap, roughness: 0.7, emissive: 0xff5722, emissiveIntensity: 0.18 });
  g.add(M(boxGeo(w, 0.5, 0.4), haz, 0, 1.5, 0));
  g.add(M(boxGeo(w, 0.5, 0.4), haz, 0, 2.3, 0));
  for (const x of [-w / 2 + 0.3, 0, w / 2 - 0.3]) {
    g.add(M(boxGeo(0.2, 2.6, 0.3), std(0x2a2f3d), x, 1.3, 0));
  }
  const s1 = sprite(0xff3040, 1.2, 0.9); s1.position.set(-w / 2 + 0.3, 2.85, 0);
  const s2 = sprite(0xff3040, 1.2, 0.9); s2.position.set(w / 2 - 0.3, 2.85, 0);
  const ph = Math.random() * 3;
  s1.userData.tick = (t: number) => { (s1.material as THREE.SpriteMaterial).opacity = 0.4 + Math.abs(Math.sin(t * 5 + ph)) * 0.6; };
  s2.userData.tick = (t: number) => { (s2.material as THREE.SpriteMaterial).opacity = 0.4 + Math.abs(Math.cos(t * 5 + ph)) * 0.6; };
  g.add(s1, s2);
  return g;
}

// ── Облака, деревья, кусты-декор ───────────────────────────────
export function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const m = std(0xffffff, 0, 0, 1, 0, false);
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = M(sphGeo(rand(1.2, 2.4), 8, 6), m, i * rand(1.2, 1.9), rand(-0.3, 0.5), rand(-0.5, 0.5));
    s.scale.y = 0.55;
    g.add(s);
  }
  const sp = rand(0.3, 0.8);
  g.userData.tick = (_t: number, dt: number) => { g.position.x += sp * dt; if (g.position.x > 30) g.position.x = -40; };
  return g;
}

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  g.add(M(cylGeo(0.14, 0.2, 1.4, 6), std(0x6b4a2b), 0, 0.7, 0));
  const leaf = std(0x3d7a34, 0, 0, 0.95);
  g.add(M(sphGeo(0.8, 8, 6), leaf, 0, 1.8, 0));
  g.add(M(sphGeo(0.55, 8, 6), std(0x4f9440), 0.45, 1.45, 0.2));
  g.add(M(sphGeo(0.5, 8, 6), leaf, -0.4, 1.5, -0.15));
  return g;
}

// ── МОПС-СТРИТ: витрины, фонарики, флажки ─────────────────────
export function makeStorefront(side: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const h = rand(5.5, 7.5);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x35204a, emissive: 0xffb96b, emissiveIntensity: 0.55,
    emissiveMap: windowsTex('#1d1028', '#ffb96b', 4, 5), roughness: 0.9,
  });
  const b = M(boxGeo(3.4, h, 12), bodyMat, side * 1.7 + 0, h / 2, 0);
  g.add(b);
  // тент
  const awnMat = new THREE.MeshStandardMaterial({ map: stripesTex('#ff6b9d', '#f7e9f2'), roughness: 0.8 });
  const awn = M(boxGeo(1.7, 0.16, 8), awnMat, -side * 0.4, 2.9, 0);
  awn.rotation.z = side * 0.28;
  g.add(awn);
  // вывеска
  const words = ['МОПС', 'PUG', 'ЛАПА', 'ВКУСНО', 'DOG'];
  const sign = new THREE.Mesh(planeGeo(3.0, 1.1), new THREE.MeshBasicMaterial({ map: signTex(pick(words), Math.random() < 0.5 ? '#ffd166' : '#ff6b9d'), transparent: true, depthWrite: false }));
  sign.position.set(-side * 0.12, 3.9, rand(-3, 3));
  sign.rotation.y = -side * Math.PI / 2;
  g.add(sign);
  void accent;
  return g;
}

export function makeLantern(): THREE.Group {
  const g = new THREE.Group();
  g.add(M(cylGeo(0.02, 0.02, 0.8, 4), lam(0x111418), 0, 0.4, 0));
  g.add(M(boxGeo(0.34, 0.42, 0.34), std(0xffb96b, 0xffa64d, 0.9, 0.6), 0, -0.2, 0));
  g.add(M(boxGeo(0.4, 0.08, 0.4), lam(0x111418), 0, 0.05, 0));
  const s = sprite(0xffb96b, 1.3, 0.55); s.position.set(0, -0.2, 0); g.add(s);
  const ph = Math.random() * 6;
  g.userData.tick = (t: number) => { g.rotation.z = Math.sin(t * 1.4 + ph) * 0.08; };
  return g;
}

export function makeBunting(): THREE.Group {
  const g = new THREE.Group();
  const cols = [0xff6b9d, 0xffd166, 0x8be9fd, 0xb388ff, 0x7CFC9A];
  for (let i = 0; i < 9; i++) {
    const x = -5.2 + i * 1.3;
    const f = M(coneGeo(0.22, 0.5, 4), std(cols[i % cols.length], cols[i % cols.length], 0.2, 0.9), x, -Math.sin((i / 8) * Math.PI) * 0.35 - 0.25, 0);
    f.rotation.x = Math.PI;
    g.add(f);
  }
  return g;
}

// ── Лёд: кристаллы, сосульки ───────────────────────────────────
export function makeCrystalCluster(): THREE.Group {
  const g = new THREE.Group();
  const m = std(0x66d9ff, 0x00e5ff, 0.7, 0.3);
  for (let i = 0; i < 3; i++) {
    const c = M(octGeo(rand(0.35, 0.7)), m, rand(-0.7, 0.7), rand(0.3, 0.8), rand(-0.5, 0.5));
    c.rotation.set(rand(0, 1), rand(0, 3), rand(0, 1));
    g.add(c);
  }
  const s = sprite(0x00e5ff, 2.2, 0.3); s.position.y = 0.6; g.add(s);
  return g;
}

export function makeIcicle(): THREE.Group {
  const g = new THREE.Group();
  const m = std(0xbfeaff, 0x66d9ff, 0.3, 0.35);
  const c = M(coneGeo(0.2, rand(0.9, 1.9), 6), m, 0, 0, 0);
  c.rotation.x = Math.PI;
  g.add(c);
  return g;
}

// ── Каньон: скалы, кактусы, hoodoo ─────────────────────────────
export function makeRockWall(): THREE.Group {
  const g = new THREE.Group();
  const cols = [0x8a4f2c, 0x9d5c33, 0x74401f];
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const r = M(boxGeo(rand(2.5, 4), rand(5, 9.5), rand(6, 12)), std(pick(cols), 0, 0, 1), rand(-1, 1), rand(2, 3.6), rand(-10, 10));
    r.rotation.y = rand(-0.2, 0.2);
    g.add(r);
  }
  return g;
}

export function makeCactus(): THREE.Group {
  const g = new THREE.Group();
  const m = std(0x3f7d3a, 0, 0, 0.9);
  g.add(M(cylGeo(0.22, 0.26, 2.0, 7), m, 0, 1.0, 0));
  const a1 = M(cylGeo(0.13, 0.15, 0.8, 6), m, 0.42, 1.25, 0); a1.rotation.z = -0.5;
  const a2 = M(cylGeo(0.13, 0.15, 0.7, 6), m, -0.4, 0.9, 0); a2.rotation.z = 0.5;
  g.add(a1, a2);
  g.add(M(sphGeo(0.09, 6, 5), lam(0xff8fb5), 0, 2.05, 0));
  return g;
}

export function makeHoodoo(): THREE.Group {
  const g = new THREE.Group();
  g.add(M(cylGeo(0.55, 0.95, rand(3.5, 5.5), 7), std(0x9d5c33, 0, 0, 1), 0, 2.2, 0));
  const top = M(icoGeo(0.9), std(0x74401f, 0, 0, 1), 0, 4.9, 0);
  top.scale.y = 0.6;
  g.add(top);
  return g;
}

// ── Метро: панели, колонны, балки ─────────────────────────────
export function makeBuilding(side: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const h = rand(7, 12);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x11141f, emissive: 0x9fd8ff, emissiveIntensity: 0.6,
    emissiveMap: windowsTex('#070910', '#7ecbff', 5, 8), roughness: 0.85,
  });
  bodyMat.emissiveMap!.repeat.set(2, 1);
  g.add(M(boxGeo(3, h, 26), bodyMat, side * 1.5, h / 2, 0));
  // неоновая вывеска-панель
  const panel = M(boxGeo(0.2, rand(1.6, 3), rand(2, 4)), lam(Math.random() < 0.5 ? accent : 0x22e0ff), -side * 0.05, rand(2.5, 5.5), rand(-8, 8));
  g.add(panel);
  const glow = sprite(accent, 3.2, 0.25); glow.position.copy(panel.position); g.add(glow);
  return g;
}

export function makePillar(accent: number): THREE.Group {
  const g = new THREE.Group();
  g.add(M(cylGeo(0.3, 0.4, TUNNEL_H, 8), std(0x1b2030, 0, 0, 0.7), 0, TUNNEL_H / 2, 0));
  g.add(M(boxGeo(0.72, 0.16, 0.72), lam(accent), 0, 2.4, 0));
  g.add(M(boxGeo(0.72, 0.16, 0.72), lam(accent), 0, 4.4, 0));
  return g;
}

export function makeCeilLight(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(M(boxGeo(4.6, 0.08, 0.5), lam(color), 0, 0, 0));
  const s = sprite(color, 3.4, 0.22); g.add(s);
  return g;
}
