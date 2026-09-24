import * as THREE from 'three';
import { LANES, CASTLE_LANES, TUNNEL_H, PLAYER_H, MoveMode, easeInOut, easeOut } from './config';
import { boxGeo, sphGeo, M, std, lam } from './meshes';

export class Player {
  group = new THREE.Group();   // мировая позиция (x дорожки, z = 0)
  rig = new THREE.Group();     // переворот (вокруг ног)
  body = new THREE.Group();    // модель + наклоны
  blob: THREE.Mesh;            // тень

  lane = 1;
  x = 0;
  private fromX = 0; private toX = 0; private laneT = 1; private laneDur = 0.16;

  mode: MoveMode = 'flip';
  laneSet: 'std' | 'castle' = 'std';

  // сальто
  flipT = 0;                   // 0 пол, 1 потолок
  private flipFrom = 0; private flipTo = 0; private flipAnim = 1;
  flipping = false;
  onCeiling = false;

  // прыжок (замок)
  private jumpT = 1;           // >=1 — на земле
  jumpY = 0;

  runPhase = 0;
  dead = false;
  private deadT = 0;
  private landPulse = 0;

  private armL: THREE.Group; private armR: THREE.Group;
  private legL: THREE.Group; private legR: THREE.Group;
  private headG: THREE.Group;

  justFlipped = false; justLanded = false;

  constructor(scene: THREE.Scene) {
    // ── модель бегуна ──
    const jacket = std(0x18c8e8, 0x0aa9c9, 0.35, 0.6);
    const dark = std(0x181c2a, 0, 0, 0.85);
    const skin = std(0xf2c49b, 0, 0, 0.85);

    const torso = M(boxGeo(0.56, 0.62, 0.34), jacket, 0, 0.93, 0);
    const belt = M(boxGeo(0.58, 0.1, 0.36), lam(0xff2d95), 0, 0.66, 0);
    this.body.add(torso, belt);

    this.headG = new THREE.Group();
    this.headG.position.set(0, 1.42, 0);
    this.headG.add(M(boxGeo(0.38, 0.36, 0.34), skin, 0, 0, 0));
    this.headG.add(M(boxGeo(0.42, 0.14, 0.38), std(0xff2d95, 0xff2d95, 0.25), 0, 0.2, 0.03)); // кепка
    this.headG.add(M(boxGeo(0.42, 0.05, 0.2), std(0xff2d95, 0xff2d95, 0.25), 0, 0.17, -0.26));
    this.headG.add(M(boxGeo(0.3, 0.09, 0.05), lam(0x22e0ff), 0, 0.01, -0.19)); // визор
    this.body.add(this.headG);

    const mkLimb = (px: number, py: number, w: number, len: number, mat: THREE.Material, shoe: boolean) => {
      const g = new THREE.Group();
      g.position.set(px, py, 0);
      const limb = M(boxGeo(w, len, w), mat, 0, -len / 2 + 0.03, 0);
      g.add(limb);
      if (shoe) g.add(M(boxGeo(w + 0.04, 0.1, w + 0.16), std(0xf5f7fa, 0, 0, 0.6), 0, -len + 0.02, -0.05));
      return g;
    };
    this.armL = mkLimb(-0.36, 1.16, 0.15, 0.52, jacket, false);
    this.armR = mkLimb(0.36, 1.16, 0.15, 0.52, jacket, false);
    this.legL = mkLimb(-0.15, 0.6, 0.19, 0.6, dark, true);
    this.legR = mkLimb(0.15, 0.6, 0.19, 0.6, dark, true);
    this.body.add(this.armL, this.armR, this.legL, this.legR);

    // грави-ранец
    const pack = M(boxGeo(0.34, 0.4, 0.16), std(0x232a3d, 0, 0, 0.5, 0.3), 0, 0.98, 0.24);
    const orb = M(sphGeo(0.09, 8, 6), lam(0x22e0ff), 0, 0.98, 0.34);
    this.body.add(pack, orb);

    this.body.position.y = 0;
    this.rig.add(this.body);
    this.group.add(this.rig); // модель построена лицом в -z (спиной к камере)
    scene.add(this.group);

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);
  }

  private lanesArr() { return this.laneSet === 'castle' ? CASTLE_LANES : LANES; }
  targetX() { return this.lanesArr()[this.lane]; }

  setLaneSet(s: 'std' | 'castle') {
    if (this.laneSet === s) return;
    this.laneSet = s;
    this.glideTo(this.targetX(), 1.15);
  }

  setMode(m: MoveMode) { this.mode = m; }

  private glideTo(x: number, dur: number) {
    this.fromX = this.x; this.toX = x; this.laneT = 0; this.laneDur = dur;
  }

  tryLane(dir: -1 | 1): boolean {
    if (this.dead) return false;
    const nl = Math.min(2, Math.max(0, this.lane + dir));
    if (nl === this.lane) return false;
    this.lane = nl;
    this.glideTo(this.targetX(), 0.17);
    return true;
  }

  /** Главное действие: сальто или прыжок */
  primary(): 'flip' | 'jump' | null {
    if (this.dead) return null;
    if (this.mode === 'flip') {
      this.flipFrom = this.flipT;
      this.flipTo = this.flipTo === 1 ? 0 : 1;
      this.flipAnim = 0;
      this.flipping = true;
      this.justFlipped = true;
      return 'flip';
    }
    if (this.jumpT >= 1) {
      this.jumpT = 0;
      return 'jump';
    }
    return null;
  }

  forceLand() {
    if (this.flipT > 0 || this.flipTo === 1 || this.flipping) {
      this.flipFrom = this.flipT;
      this.flipTo = 0;
      this.flipAnim = 0;
      this.flipping = true;
    }
  }

  bounds() {
    const feet = this.feetY();
    const k = this.flipT;
    return {
      x: this.x,
      y0: feet - PLAYER_H * k,
      y1: feet + PLAYER_H * (1 - k),
    };
  }

  feetY() {
    return easeInOut(this.flipT) * TUNNEL_H + this.jumpY;
  }

  crash() {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
  }

  reset() {
    this.dead = false; this.deadT = 0;
    this.lane = 1; this.x = 0; this.fromX = 0; this.toX = 0; this.laneT = 1;
    this.flipT = 0; this.flipTo = 0; this.flipAnim = 1; this.flipping = false; this.onCeiling = false;
    this.jumpT = 1; this.jumpY = 0;
    this.laneSet = 'std'; this.mode = 'flip';
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.y = 0;
    this.body.rotation.set(0.1, 0, 0);
    this.body.position.y = 0;
    this.group.position.set(0, 0, 0);
  }

  update(dt: number, speed: number, t: number) {
    // смена дорожки
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / this.laneDur);
      this.x = this.fromX + (this.toX - this.fromX) * easeOut(this.laneT);
    }
    // сальто
    if (this.flipping) {
      this.flipAnim = Math.min(1, this.flipAnim + dt / 0.42);
      this.flipT = this.flipFrom + (this.flipTo - this.flipFrom) * easeInOut(this.flipAnim);
      if (this.flipAnim >= 1) {
        this.flipping = false;
        this.onCeiling = this.flipT > 0.5;
        this.landPulse = 1;
        this.justLanded = true;
      }
    }
    // прыжок
    if (this.jumpT < 1) {
      this.jumpT = Math.min(1, this.jumpT + dt / 0.62);
      this.jumpY = Math.sin(Math.PI * this.jumpT) * 2.35;
      if (this.jumpT >= 1) { this.jumpY = 0; this.landPulse = 1; this.justLanded = true; }
    }

    const feet = this.feetY();
    this.rig.position.y = feet;
    this.rig.rotation.z = easeInOut(this.flipT) * Math.PI;
    this.group.position.x = this.x;

    if (this.dead) {
      this.deadT += dt;
      this.rig.rotation.z += dt * 9;
      this.rig.position.y = Math.max(0.1, feet - this.deadT * 2);
      this.blob.scale.setScalar(Math.max(0.01, 1 - this.deadT));
      return;
    }

    // бег мультипликационный
    const rate = 7 + speed * 0.42;
    this.runPhase += dt * rate;
    const p = this.runPhase;
    const amp = this.jumpT < 1 ? 0.35 : 0.95;
    this.legL.rotation.x = Math.sin(p) * amp;
    this.legR.rotation.x = Math.sin(p + Math.PI) * amp;
    this.armL.rotation.x = Math.sin(p + Math.PI) * amp * 0.85;
    this.armR.rotation.x = Math.sin(p) * amp * 0.85;
    this.armL.rotation.z = 0.22; this.armR.rotation.z = -0.22;
    this.body.rotation.x = 0.12 + Math.sin(p * 2) * 0.02;
    this.body.position.y = Math.abs(Math.sin(p)) * 0.055;
    // крен при смене дорожки
    const vx = this.laneT < 1 ? (this.toX - this.fromX) : 0;
    this.body.rotation.z = THREE.MathUtils.clamp(-vx * 0.16 * (1 - this.laneT), -0.4, 0.4);
    this.headG.rotation.y = Math.sin(t * 0.7) * 0.06;

    // приседание при приземлении
    if (this.landPulse > 0) {
      this.landPulse = Math.max(0, this.landPulse - dt * 5);
      const s = 1 - Math.sin(this.landPulse * Math.PI) * 0.12;
      this.body.scale.set(1 / s, s, 1 / s);
    } else this.body.scale.set(1, 1, 1);

    // тень на текущей поверхности
    const surfY = this.flipT > 0.5 ? TUNNEL_H : 0;
    this.blob.position.set(this.x, surfY + (this.flipT > 0.5 ? -0.02 : 0.02), this.group.position.z);
    if (this.flipT > 0.5) this.blob.rotation.x = Math.PI / 2; else this.blob.rotation.x = -Math.PI / 2;
    const hAbove = Math.abs(feet - surfY);
    const sc = Math.max(0.35, 1 - hAbove * 0.18);
    this.blob.scale.setScalar(sc);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.34 * sc;
  }
}
