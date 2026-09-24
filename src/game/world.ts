import * as THREE from 'three';
import {
  CHUNK, GEN_AHEAD, LANES, CASTLE_LANES, TUNNEL_H,
  LocId, LOCS, LOC_LIST, MoveMode, rand, irand, pick, shuffle,
} from './config';
import * as MX from './meshes';
import { cobbleTex } from './textures';

export interface Collider {
  x: number; z: number; w: number; half: number;
  y0: number; y1: number;
  obj?: THREE.Object3D | null;
  vx?: number; vz?: number;
}
export interface CoinRef { obj: THREE.Object3D; x: number; y: number; z: number; taken: boolean; }
export interface GameEvent { z: number; type: 'loc' | 'preCastle' | 'mode' | 'exitCastle'; loc?: LocId; mode?: MoveMode; }

interface Chunk { node: THREE.Group; z0: number; }
interface Extra { obj: THREE.Object3D; z0: number; }
interface VisMover { obj: THREE.Object3D; vz: number; }

const TRAIN_SCHEMES: Record<string, MX.TrainScheme> = {
  metro: { body: 0x232c44, roof: 0x161b2c, stripe: 0x22e0ff, win: 0xbfe6ff },
  canyon: { body: 0x7c3a1e, roof: 0x5e2c14, stripe: 0xffd54f, win: 0xffe4b0 },
  ice: { body: 0x2a5a75, roof: 0x1c3f55, stripe: 0x00e5ff, win: 0xdff4ff },
  pugs: { body: 0x57284a, roof: 0x3a1a30, stripe: 0xff6b9d, win: 0xffd166 },
  castle: { body: 0x8a8578, roof: 0x6b675c, stripe: 0xffb300, win: 0xfff2c0 },
};
const FLOOR_H: Record<string, number> = { metro: 1.16, canyon: 1.15, ice: 1.3, pugs: 0.8 };

export class World {
  root = new THREE.Group();
  colliders: Collider[] = [];
  coins: CoinRef[] = [];
  diff = 0;

  private chunks: Chunk[] = [];
  private extras: Extra[] = [];
  private animated: { obj: THREE.Object3D; z0: number }[] = [];
  private visMovers: VisMover[] = [];
  private events: GameEvent[] = [];

  private genLoc: LocId = 'metro';
  private segLeft = 540;
  private genZ = 6;
  private bag: LocId[] = [];
  private palaceIdx = 0;
  private safeChunks = 2;

  constructor(private scene: THREE.Scene) {
    scene.add(this.root);
  }

  reset() {
    this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.colliders = []; this.coins = []; this.chunks = [];
    this.extras = []; this.animated = []; this.visMovers = []; this.events = [];
    this.genLoc = 'metro';
    this.segLeft = 540;
    this.genZ = 6;
    this.bag = [];
    this.palaceIdx = 0;
    this.safeChunks = 2;
    this.diff = 0;
  }

  // ──────────────────────────── update ────────────────────────────
  update(dt: number, pz: number, t: number) {
    // генерация вперёд
    while (this.genZ > pz - GEN_AHEAD) this.genChunk();
    // переработка чанков
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.z0 > pz + 55) {
        this.root.remove(c.node);
        this.chunks.splice(i, 1);
      }
    }
    for (let i = this.extras.length - 1; i >= 0; i--) {
      if (this.extras[i].z0 > pz + 70) {
        this.root.remove(this.extras[i].obj);
        this.extras.splice(i, 1);
      }
    }
    // анимации статиков
    for (let i = this.animated.length - 1; i >= 0; i--) {
      const a = this.animated[i];
      if (a.z0 > pz + 80) { this.animated.splice(i, 1); continue; }
      a.obj.userData.tick?.(t, dt);
    }
    // визуальные движущиеся (побочные поезда, драконы на фоне)
    for (let i = this.visMovers.length - 1; i >= 0; i--) {
      const v = this.visMovers[i];
      v.obj.position.z += v.vz * dt;
      v.obj.userData.tick?.(t, dt);
      if (v.obj.position.z > pz + 90 || v.obj.position.z < pz - GEN_AHEAD - 120) {
        this.root.remove(v.obj);
        this.visMovers.splice(i, 1);
      }
    }
    // движущиеся опасности (встречки, мопсы)
    for (let i = this.colliders.length - 1; i >= 0; i--) {
      const c = this.colliders[i];
      if (c.obj && (c.vx || c.vz)) {
        c.z += (c.vz ?? 0) * dt;
        c.x += (c.vx ?? 0) * dt;
        c.obj.position.z = c.z;
        c.obj.position.x = c.x;
        c.obj.userData.tick?.(t, dt);
        if (c.vx && Math.abs(c.x) > 14) { // мопс убежал за пределы
          this.root.remove(c.obj);
          this.colliders.splice(i, 1);
          continue;
        }
      }
      if (c.z > pz + 90) {
        if (c.obj) this.root.remove(c.obj);
        this.colliders.splice(i, 1);
      }
    }
    // монетки крутим
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const cn = this.coins[i];
      if (cn.z > pz + 25 || cn.taken) { this.coins.splice(i, 1); continue; }
      cn.obj.rotation.y += dt * 3.2;
    }
  }

  pollEvents(pz: number): GameEvent[] {
    const fired: GameEvent[] = [];
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (pz <= this.events[i].z) {
        fired.unshift(this.events[i]);
        this.events.splice(i, 1);
      }
    }
    return fired;
  }

  /** Перебазировка координат, чтобы не уплыть по точности float */
  shift(dz: number) {
    this.genZ += dz;
    for (const c of this.chunks) { c.z0 += dz; c.node.position.z += dz; }
    for (const e of this.extras) { e.z0 += dz; e.obj.position.z += dz; }
    for (const a of this.animated) a.z0 += dz;
    for (const v of this.visMovers) v.obj.position.z += dz;
    for (const c of this.colliders) c.z += dz;
    for (const cn of this.coins) cn.z += dz;
    for (const e of this.events) e.z += dz;
  }

  // ──────────────────────────── чанки ────────────────────────────
  private genChunk() {
    if (this.segLeft <= 0) this.startSegment(this.genZ);
    const loc = this.genLoc;
    const z0 = this.genZ;
    const node = new THREE.Group();
    node.position.z = z0;
    this.buildGround(node, loc);
    this.buildDecor(node, loc, z0);
    if (loc === 'castle') this.buildCastleHazards(node, z0);
    else this.buildTunnelHazards(node, z0, loc);
    this.root.add(node);
    this.chunks.push({ node, z0 });
    this.genZ -= CHUNK;
    this.segLeft -= CHUNK;
    if (this.safeChunks > 0) this.safeChunks--;
  }

  private startSegment(zB: number) {
    const prev = this.genLoc;
    if (this.bag.length === 0) {
      this.bag = shuffle(LOC_LIST.filter((l) => l !== prev));
    }
    const next = this.bag.pop()!;
    this.genLoc = next;
    this.segLeft = CHUNK * irand(15, 22);
    const cfg = LOCS[next];

    // арка на границе
    const gate = MX.makeGate(next === 'castle' ? CASTLE_LANES[0] - 1.4 : -5.4, next === 'castle' ? CASTLE_LANES[2] + 1.4 : 5.4, cfg.accent);
    gate.position.z = zB;
    this.root.add(gate);
    this.extras.push({ obj: gate, z0: zB });

    this.events.push({ z: zB, type: 'loc', loc: next });

    if (next === 'castle') {
      // предупреждение и шевроны «влево» ДО стены
      this.events.push({ z: zB + 76, type: 'preCastle' });
      for (const zz of [zB + 70, zB + 52, zB + 34]) {
        for (const lx of LANES) {
          const ar = MX.makeArrow('left', LOCS.castle.accent);
          ar.position.set(lx, 0.07, zz);
          this.root.add(ar);
          this.extras.push({ obj: ar, z0: zz });
          this.animated.push({ obj: ar, z0: zz });
        }
      }
      this.events.push({ z: zB, type: 'mode', mode: 'jump' });
    }
    if (prev === 'castle') {
      // после замка — пара безопасных чанков, пока игрок возвращается на основную дорогу
      this.safeChunks = Math.max(this.safeChunks, 2);
      this.events.push({ z: zB, type: 'exitCastle' });
      for (const zz of [zB - 4, zB - 20, zB - 36]) {
        for (const lx of CASTLE_LANES) {
          const ar = MX.makeArrow('right', 0xffffff);
          ar.position.set(lx, 0.07, zz);
          this.root.add(ar);
          this.extras.push({ obj: ar, z0: zz });
          this.animated.push({ obj: ar, z0: zz });
        }
      }
      // баррикада на конце улицы через ~2 чанка
      const bar = MX.makeBarricade(7.9);
      bar.position.set(-6.9, 0, zB - 56);
      this.root.add(bar);
      this.extras.push({ obj: bar, z0: zB - 56 });
      this.animated.push({ obj: bar, z0: zB - 56 });
      this.colliders.push({ x: -6.9, z: zB - 56, w: 8.2, half: 0.5, y0: 0, y1: 6.6 });
    }
  }

  // ──────────────────────────── земля ────────────────────────────
  private buildGround(node: THREE.Group, loc: LocId) {
    const cfg = LOCS[loc];
    if (loc === 'castle') {
      // улица из булыжника (новая «4-я дорога»)
      const cob = new THREE.MeshStandardMaterial({ map: cobbleTex(), roughness: 0.95 });
      cob.map!.repeat.set(2, 8);
      const st = MX.M(MX.planeGeo(7.7, CHUNK), cob, -6.975, 0, -CHUNK / 2);
      st.rotation.x = -Math.PI / 2;
      node.add(st);
      node.add(MX.M(MX.boxGeo(0.4, 0.2, CHUNK), MX.std(0x8a8271), -10.75, 0.1, -CHUNK / 2));
      node.add(MX.M(MX.boxGeo(0.4, 0.2, CHUNK), MX.std(0x8a8271), -3.2, 0.1, -CHUNK / 2));
      // золотые направляющие
      node.add(MX.M(MX.boxGeo(0.1, 0.03, CHUNK), MX.lam(cfg.laneGlow), -8.05, 0.02, -CHUNK / 2));
      node.add(MX.M(MX.boxGeo(0.1, 0.03, CHUNK), MX.lam(cfg.laneGlow), -5.75, 0.02, -CHUNK / 2));
      // трава справа
      const grass = MX.M(MX.planeGeo(8.4, CHUNK), MX.std(0x4d7a3f, 0, 0, 1), 8.4, 0.01, -CHUNK / 2);
      grass.rotation.x = -Math.PI / 2;
      node.add(grass);
      return;
    }
    const g = MX.M(MX.planeGeo(24, CHUNK), MX.std(cfg.ground, 0, 0, 0.95), 0, 0, -CHUNK / 2);
    g.rotation.x = -Math.PI / 2;
    node.add(g);
    node.add(MX.M(MX.boxGeo(0.12, 0.04, CHUNK), MX.lam(cfg.laneGlow), -1.15, 0.02, -CHUNK / 2));
    node.add(MX.M(MX.boxGeo(0.12, 0.04, CHUNK), MX.lam(cfg.laneGlow), 1.15, 0.02, -CHUNK / 2));
    node.add(MX.M(MX.boxGeo(0.5, 0.22, CHUNK), MX.std(cfg.ground2), -4.95, 0.11, -CHUNK / 2));
    node.add(MX.M(MX.boxGeo(0.5, 0.22, CHUNK), MX.std(cfg.ground2), 4.95, 0.11, -CHUNK / 2));
    // потолок
    const ceil = MX.M(MX.planeGeo(24, CHUNK), MX.std(cfg.ceiling, 0, 0, 1), 0, TUNNEL_H, -CHUNK / 2);
    ceil.rotation.x = Math.PI / 2;
    node.add(ceil);
  }

  // ──────────────────────────── декор ────────────────────────────
  private trackAnim(obj: THREE.Object3D, z0: number) {
    if (obj.userData.tick) this.animated.push({ obj, z0 });
  }

  private buildDecor(node: THREE.Group, loc: LocId, z0: number) {
    const cfg = LOCS[loc];
    switch (loc) {
      case 'metro': {
        for (const s of [-1, 1]) {
          const b = MX.makeBuilding(s, cfg.accent);
          b.position.set(s * 8.6, 0, -14);
          node.add(b);
          for (const zz of [-7.5, -22.5]) {
            const p = MX.makePillar(cfg.accent2);
            p.position.set(s * 5.7, 0, zz);
            node.add(p);
          }
        }
        for (const zz of [-7.5, -22.5]) {
          const beam = MX.M(MX.boxGeo(11.4, 0.32, 0.7), MX.std(0x151a29), 0, TUNNEL_H - 0.18, zz);
          node.add(beam);
        }
        const lt = MX.makeCeilLight(cfg.accent2);
        lt.position.set(0, TUNNEL_H - 0.45, -15);
        node.add(lt);
        if (Math.random() < 0.18) {
          const s = Math.random() < 0.5 ? -1 : 1;
          const tr = MX.makeTrain(20, TRAIN_SCHEMES.metro);
          tr.position.set(s * 9.2, 0, -15);
          this.root.add(tr);
          this.visMovers.push({ obj: tr, vz: rand(26, 40) });
          tr.position.z = z0 - 15;
        }
        break;
      }
      case 'canyon': {
        for (const s of [-1, 1]) {
          const r = MX.makeRockWall();
          r.position.set(s * rand(9.2, 10.4), 0, -15);
          node.add(r);
        }
        const side = pick([-1, 1]);
        const hd = MX.makeHoodoo();
        hd.position.set(side * 6.7, 0, -rand(6, 24));
        node.add(hd);
        if (Math.random() < 0.4) {
          const c = MX.makeCactus();
          c.position.set(-side * 6.2, 0, -rand(4, 26));
          node.add(c);
        }
        // нависающие камни у потолка (по краям)
        for (let i = 0; i < 2; i++) {
          const rock = MX.M(MX.coneGeo(rand(0.5, 0.9), rand(1.2, 2.2), 6), MX.std(0x6e3a1f, 0, 0, 1), pick([-1, 1]) * rand(3.6, 5.2), TUNNEL_H - 0.6, -rand(4, 26));
          rock.rotation.x = Math.PI;
          node.add(rock);
        }
        const slab = MX.M(MX.boxGeo(24, 1.2, CHUNK * 0.7), MX.std(0x5e3018, 0, 0, 1), 0, TUNNEL_H + 0.7, -CHUNK / 2);
        node.add(slab);
        break;
      }
      case 'ice': {
        for (const s of [-1, 1]) {
          node.add(MX.M(MX.boxGeo(4, rand(7, 9), 26), MX.std(0x0d3a52, 0, 0, 1), s * 9.4, 3.6, -14));
          for (const zz of [-9, -21]) {
            const cr = MX.makeCrystalCluster();
            cr.position.set(s * 5.9, 0, zz + rand(-2, 2));
            this.trackAnim(cr, z0);
            node.add(cr);
          }
        }
        for (let i = 0; i < 3; i++) {
          const ic = MX.makeIcicle();
          ic.position.set(rand(-5, 5) > 0 ? rand(3.4, 5.2) : rand(-5.2, -3.4), TUNNEL_H - 0.5, -rand(3, 27));
          node.add(ic);
        }
        break;
      }
      case 'pugs': {
        for (const s of [-1, 1]) {
          const sf = MX.makeStorefront(s, cfg.accent);
          sf.position.set(s * 7.0, 0, -14);
          node.add(sf);
        }
        for (const zz of [-7.5, -22.5]) {
          for (const lx of [-1.15, 1.15]) {
            const ln = MX.makeLantern();
            ln.position.set(lx, TUNNEL_H - 0.75, zz);
            node.add(ln);
            this.trackAnim(ln, z0);
          }
        }
        const bn = MX.makeBunting();
        bn.position.set(0, TUNNEL_H - 0.55, -15);
        node.add(bn);
        if (Math.random() < 0.3) {
          const s = pick([-1, 1]);
          const p = MX.makePug();
          p.position.set(s * 5.5, 0, -rand(5, 25));
          p.rotation.y = rand(-0.6, 0.6) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
          node.add(p);
          this.trackAnim(p, z0);
        }
        break;
      }
      case 'castle': {
        // стена на старых 3 дорожках
        const wall = MX.makeCastleWall(CHUNK);
        wall.position.set(0, 0, 0);
        node.add(wall);
        // поручни вдоль рва
        const rail = MX.makeRailingRow(CHUNK);
        rail.position.set(-10.55, 0, 0);
        node.add(rail);
        // ров с водой
        const moat = MX.makeMoat(CHUNK);
        moat.position.set(-14, 0, 0);
        node.add(moat);
        this.trackAnim(moat, z0);
        for (const ch of moat.children) this.trackAnim(ch, z0);
        // дальний берег
        node.add(MX.M(MX.boxGeo(1.4, 0.8, CHUNK), MX.std(0x8a8271), -17.9, 0.4, -CHUNK / 2));
        // дворец
        const variants: ('keep' | 'tower' | 'wall')[] = ['wall', 'keep', 'wall', 'tower'];
        const pv = variants[this.palaceIdx % variants.length];
        this.palaceIdx++;
        const pal = MX.makePalace(pv);
        pal.position.set(-22, 0, -CHUNK / 2);
        node.add(pal);
        // деревья и кусты на траве
        if (Math.random() < 0.5) {
          const tr = MX.makeTree();
          tr.position.set(rand(5.6, 9.6), 0, -rand(4, 26));
          tr.scale.setScalar(rand(0.8, 1.3));
          node.add(tr);
        }
        if (Math.random() < 0.35) {
          const b = MX.makeBush();
          b.position.set(rand(5.4, 9.4), 0, -rand(4, 26));
          node.add(b);
        }
        // облака
        if (Math.random() < 0.4) {
          const cl = MX.makeCloud();
          cl.position.set(rand(-32, 8), rand(11, 17), -rand(5, 25));
          cl.scale.setScalar(rand(1.4, 2.4));
          node.add(cl);
          this.trackAnim(cl, z0);
        }
        // драконы на фоне
        if (Math.random() < 0.62) {
          const cols = [0x57a04a, 0x8a5bd6, 0xc63b2f, 0x3d6ea8];
          const d = MX.makeDragon(pick(cols), rand(0.7, 1.05));
          const baseX = rand(-22, 6);
          const baseY = rand(8, 13.5);
          const ph = rand(0, 6);
          d.position.set(baseX, baseY, -rand(5, 55));
          const inner = d.userData.tick as (t: number, dt: number) => void;
          d.userData.tick = (t: number, dt: number) => {
            inner(t, dt);
            d.position.x = baseX + Math.sin(t * 0.35 + ph) * 8;
            d.position.y = baseY + Math.sin(t * 0.6 + ph) * 1.6;
            d.rotation.z = Math.cos(t * 0.35 + ph) * 0.25;
          };
          this.root.add(d);
          d.position.z = z0 - rand(5, 25);
          this.visMovers.push({ obj: d, vz: -rand(3, 7) });
        }
        break;
      }
    }
  }

  // ──────────────────────────── туннельные препятствия ──────────
  private addStaticCol(x: number, z: number, w: number, half: number, y0: number, y1: number) {
    this.colliders.push({ x, z, w, half, y0, y1 });
  }

  private addTrainStatic(node: THREE.Group, z0: number, loc: LocId, lz: number, lane: number) {
    const len = rand(11, 16);
    const tr = MX.makeTrain(len, TRAIN_SCHEMES[loc]);
    tr.position.set(LANES[lane], 0, -lz);
    node.add(tr);
    this.addStaticCol(LANES[lane], z0 - lz, 2.25, len / 2 + 1.25, 0, TUNNEL_H - 0.15);
  }

  private addFloorOb(node: THREE.Group, z0: number, loc: LocId, lz: number, lane: number) {
    const o = MX.makeFloorObstacle(loc);
    o.position.set(LANES[lane], 0, -lz);
    node.add(o);
    this.addStaticCol(LANES[lane], z0 - lz, 2.0, 0.6, 0, FLOOR_H[loc] ?? 1.15);
  }

  private addCeilOb(node: THREE.Group, z0: number, loc: LocId, lz: number, lane: number) {
    const o = MX.makeCeilObstacle(loc);
    o.position.set(LANES[lane], 0, -lz);
    node.add(o);
    this.addStaticCol(LANES[lane], z0 - lz, 1.95, 0.75, TUNNEL_H - 1.9, TUNNEL_H + 0.2);
  }

  private addBlock(node: THREE.Group, z0: number, loc: LocId, lz: number, lane: number) {
    const o = MX.makeBlock(loc);
    o.position.set(LANES[lane], 0, -lz);
    node.add(o);
    this.addStaticCol(LANES[lane], z0 - lz, 2.05, 0.65, 0, TUNNEL_H);
  }

  private addCoinLine(node: THREE.Group, x: number, y: number, z0: number, lz: number, n = 6, dz = 1.35) {
    for (let i = 0; i < n; i++) {
      const c = MX.makeCoin();
      const lzI = lz - ((n - 1) / 2) * dz + i * dz;
      c.position.set(x, y, lzI);
      c.rotation.y = Math.random();
      node.add(c);
      this.coins.push({ obj: c, x, y, z: z0 + lzI, taken: false });
    }
  }

  private buildTunnelHazards(node: THREE.Group, z0: number, loc: LocId) {
    if (this.safeChunks > 0) { return; }
    // бонусный чанк с монетками
    if (Math.random() < 0.11) {
      this.addCoinLine(node, 0, 1.0, z0, -CHUNK / 2, 8, 1.4);
      this.addCoinLine(node, -2.3, 1.0, z0, -CHUNK / 2 - 6, 5, 1.4);
      return;
    }
    const cfg = LOCS[loc];
    const nSlices = this.diff > 0.4 && Math.random() < 0.5 ? 2 : 1;
    const poses = shuffle([6.5, 19]);
    for (let s = 0; s < nSlices; s++) {
      const lz = poses[s];
      const lanes = shuffle([0, 1, 2]);
      const tpls = ['train', 'bar2', 'ceil2', 'mix', 'block', 'trainceil'] as const;
      const weights = [0.2, 0.18, 0.15, 0.2, 0.13, 0.14];
      let r = Math.random(), acc = 0, tpl: (typeof tpls)[number] = 'bar2';
      for (let i = 0; i < tpls.length; i++) { acc += weights[i]; if (r <= acc) { tpl = tpls[i]; break; } }
      void cfg;
      if (tpl === 'train') {
        this.addTrainStatic(node, z0, loc, lz, lanes[0]);
        this.addCoinLine(node, LANES[lanes[1]], 1.0, z0, -lz, 5, 1.9);
        if (Math.random() < 0.5) this.addCoinLine(node, LANES[lanes[2]], TUNNEL_H - 1, z0, -lz, 5, 1.9);
      } else if (tpl === 'bar2') {
        this.addFloorOb(node, z0, loc, lz, lanes[0]);
        this.addFloorOb(node, z0, loc, lz + 1.2 > 30 ? lz - 1.2 : lz + 1.2, lanes[1]);
        this.addCoinLine(node, LANES[lanes[2]], 1.0, z0, -lz, 6, 1.6);
      } else if (tpl === 'ceil2') {
        this.addCeilOb(node, z0, loc, lz, lanes[0]);
        this.addCeilOb(node, z0, loc, lz, lanes[1]);
        this.addCoinLine(node, LANES[lanes[2]], 1.0, z0, -lz, 6, 1.6);
      } else if (tpl === 'mix') {
        this.addFloorOb(node, z0, loc, lz, lanes[0]);
        this.addCeilOb(node, z0, loc, lz, lanes[1]);
        this.addCoinLine(node, LANES[lanes[2]], 1.0, z0, -lz, 6, 1.6);
      } else if (tpl === 'block') {
        this.addBlock(node, z0, loc, lz, lanes[0]);
        this.addFloorOb(node, z0, loc, lz + 8 > 28 ? lz - 8 : lz + 8, lanes[1]);
        this.addCoinLine(node, LANES[lanes[2]], 1.0, z0, -lz, 6, 1.8);
      } else { // trainceil
        this.addTrainStatic(node, z0, loc, lz, lanes[0]);
        this.addCeilOb(node, z0, loc, lz + 10 > 28 ? lz - 10 : lz + 10, lanes[1]);
        this.addCoinLine(node, LANES[lanes[2]], 1.0, z0, -lz, 6, 1.8);
      }
    }
    // мопс перебегает дорогу (только локация мопсов)
    if (loc === 'pugs' && this.diff > 0.15 && Math.random() < 0.34) {
      const dir = pick([-1, 1]) as -1 | 1;
      const pug = MX.makePug();
      const startX = -dir * 5.6;
      const wz = z0 - rand(6, 24);
      pug.position.set(startX, 0, wz);
      pug.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      pug.scale.setScalar(0.95);
      this.root.add(pug);
      this.colliders.push({
        x: startX, z: wz, w: 0.95, half: 0.6, y0: 0, y1: 0.78,
        obj: pug, vx: dir * rand(1.5, 2.4 + this.diff * 1.4),
      });
    }
  }

  // ──────────────────────────── замок: препятствия ──────────────
  private addCastleCoinArc(node: THREE.Group, x: number, z0: number, lz: number) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const c = MX.makeCoin();
      const lzI = lz - 3 + k * 6;
      const y = 0.9 + Math.sin(Math.PI * k) * 1.65;
      c.position.set(x, y, lzI);
      node.add(c);
      this.coins.push({ obj: c, x, y, z: z0 + lzI, taken: false });
    }
  }

  private buildCastleHazards(node: THREE.Group, z0: number) {
    // стена на старой дороге — смертельный коллайдер на весь чанк
    this.addStaticCol(0, z0 - CHUNK / 2, 8.8, CHUNK / 2, 0, 6.6);
    if (this.safeChunks > 0) return;

    const nSlices = this.diff > 0.45 && Math.random() < 0.5 ? 2 : 1;
    const poses = shuffle([7, 19.5]);
    for (let s = 0; s < nSlices; s++) {
      const lz = poses[s];
      const lanes = shuffle([0, 1, 2]);
      const nOb = Math.random() < 0.55 ? 1 : 2;
      for (let i = 0; i < nOb; i++) {
        const lane = lanes[i];
        const kind = pick(['bush', 'vase', 'rail'] as const);
        const x = CASTLE_LANES[lane];
        let o: THREE.Group; let h: number;
        if (kind === 'bush') { o = MX.makeBush(); h = 1.08; }
        else if (kind === 'vase') { o = MX.makeVase(); h = 1.32; }
        else { o = MX.makeRailOb(); h = 1.05; }
        o.position.set(x, 0, -lz + (i === 1 ? 1.4 : 0));
        node.add(o);
        this.addStaticCol(x, z0 - lz + (i === 1 ? 1.4 : 0), kind === 'rail' ? 2.1 : 1.4, 0.55, 0, h);
        if (i === 0 && Math.random() < 0.6) this.addCastleCoinArc(node, x, z0, -lz);
      }
      if (Math.random() < 0.55) {
        const freeLane = lanes[nOb];
        this.addCoinLine(node, CASTLE_LANES[freeLane], 1.0, z0, -lz, 5, 1.7);
      }
    }
  }

  // ──────────────────────────── встречные ───────────────────────
  spawnOncoming(zStart: number, speed: number, loc: LocId): 'train' | 'dragon' {
    const lane = irand(0, 2);
    if (loc === 'castle') {
      const d = MX.makeDragon(0xc62828, 1.35);
      d.rotation.y = Math.PI;
      const x = CASTLE_LANES[lane];
      const y = 1.75;
      d.position.set(x, y, zStart);
      // пламя из пасти
      const fire = MX.sprite(0xff7a1a, 1.6, 0.85);
      fire.position.set(0, 0.7, -2.4);
      d.add(fire);
      const inner = d.userData.tick as (t: number, dt: number) => void;
      d.userData.tick = (t: number, dt: number) => {
        inner(t, dt);
        d.position.y = y + Math.sin(t * 3.1) * 0.22;
        (fire.material as THREE.SpriteMaterial).opacity = 0.5 + Math.abs(Math.sin(t * 9)) * 0.5;
      };
      this.root.add(d);
      this.colliders.push({
        x, z: zStart, w: 2.5, half: 2.7, y0: 0.8, y1: 2.95,
        obj: d, vz: speed * 0.55 + 13,
      });
      return 'dragon';
    }
    const len = 15;
    const tr = MX.makeTrain(len, TRAIN_SCHEMES[loc]);
    const x = LANES[lane];
    tr.position.set(x, 0, zStart);
    this.root.add(tr);
    this.colliders.push({
      x, z: zStart, w: 2.25, half: len / 2 + 1.25, y0: 0, y1: TUNNEL_H - 0.15,
      obj: tr, vz: speed * 0.5 + 15,
    });
    return 'train';
  }
}
