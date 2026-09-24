import * as THREE from 'three';
import { LOCS, LocId, TUNNEL_H, css, rand } from './config';
import { World } from './world';
import { Player } from './player';
import { Particles, SpeedStreaks } from './particles';
import { SFX } from './audio';
import { Input, InputAction } from './input';

export interface HudData { dist: number; coins: number; speed: number; best: number; }
export interface GameCallbacks {
  hud(d: HudData): void;
  banner(title: string, sub: string, color: string): void;
  state(s: 'menu' | 'play' | 'dead'): void;
  warn(kind: 'train' | 'dragon' | null): void;
  loc(l: LocId): void;
  over(r: { dist: number; coins: number; score: number; best: number; isRecord: boolean }): void;
  pauseChange(p: boolean): void;
}

const lerpC = (a: THREE.Color, b: THREE.Color, k: number) => {
  a.r += (b.r - a.r) * k; a.g += (b.g - a.g) * k; a.b += (b.b - a.b) * k;
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private hemi: THREE.HemisphereLight;
  private dir: THREE.DirectionalLight;
  private point: THREE.PointLight;

  private world: World;
  private player: Player;
  private particles: Particles;
  private streaks: SpeedStreaks;
  private sfx = new SFX();
  private input: Input;
  private cb: GameCallbacks;

  private state: 'menu' | 'play' | 'dying' | 'dead' = 'menu';
  private paused = false;
  private pz = 0;
  private speed = 0;
  private dist = 0;
  private coinCount = 0;
  private elapsed = 0;
  private best = 0;
  private oncT = 6;
  private curLoc: LocId = 'metro';
  private shake = 0;
  private timeScale = 1;
  private dieTimer = 0;
  private nextMile = 500;
  private hudT = 0;
  private last = 0;
  private raf = 0;
  private t = 0;
  private camFov = 62;

  // цветовые цели для плавного перехода локаций
  private tgt = {
    bg: new THREE.Color(LOCS.metro.bg),
    fog: new THREE.Color(LOCS.metro.fog),
    fogNear: LOCS.metro.fogNear,
    fogFar: LOCS.metro.fogFar,
    hemiSky: new THREE.Color(LOCS.metro.hemiSky),
    hemiGround: new THREE.Color(LOCS.metro.hemiGround),
    sun: new THREE.Color(LOCS.metro.sunColor),
  };

  constructor(private mount: HTMLElement, cb: GameCallbacks) {
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    mount.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(LOCS.metro.bg);
    this.scene.fog = new THREE.Fog(LOCS.metro.fog, LOCS.metro.fogNear, LOCS.metro.fogFar);

    this.camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 420);
    this.camera.position.set(0, 3.1, 8.6);

    this.hemi = new THREE.HemisphereLight(LOCS.metro.hemiSky, LOCS.metro.hemiGround, LOCS.metro.hemiInt);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(LOCS.metro.sunColor, LOCS.metro.sunInt);
    this.dir.position.set(8, 16, 6);
    this.scene.add(this.dir);
    this.point = new THREE.PointLight(LOCS.metro.accent2, 16, 26, 2);
    this.scene.add(this.point);

    this.world = new World(this.scene);
    this.player = new Player(this.scene);
    this.particles = new Particles(this.scene);
    this.streaks = new SpeedStreaks(this.scene);

    this.best = Number(localStorage.getItem('gr_best') || 0);

    this.input = new Input(this.renderer.domElement, (a) => this.onAction(a));
    window.addEventListener('resize', this.onResize);

    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ─────────────────────────── публичное ───────────────────────────
  start() {
    this.sfx.ensure();
    this.sfx.startMusic();
    this.sfx.uiClick();
    this.world.reset();
    this.player.reset();
    this.pz = 0;
    this.dist = 0;
    this.coinCount = 0;
    this.elapsed = 0;
    this.speed = 15;
    this.oncT = 6.5;
    this.shake = 0;
    this.timeScale = 1;
    this.nextMile = 500;
    this.curLoc = 'metro';
    this.snapColors(LOCS.metro);
    this.state = 'play';
    this.paused = false;
    this.cb.state('play');
    this.cb.loc('metro');
    this.cb.banner('НЕОН-СИТИ', 'Погнали! Уворачивайся от поездов', css(LOCS.metro.accent));
    this.cb.hud({ dist: 0, coins: 0, speed: 54, best: this.best });
  }

  toMenu() {
    this.world.reset();
    this.player.reset();
    this.pz = 0;
    this.state = 'menu';
    this.paused = false;
    this.timeScale = 1;
    this.curLoc = 'metro';
    this.snapColors(LOCS.metro);
    this.cb.state('menu');
  }

  togglePause() {
    if (this.state !== 'play' && this.state !== 'dying') return;
    this.paused = !this.paused;
    this.cb.pauseChange(this.paused);
    if (this.sfx) {
      if (this.paused) (this.sfx as unknown as { ctx?: AudioContext }).ctx?.suspend();
      else (this.sfx as unknown as { ctx?: AudioContext }).ctx?.resume();
    }
  }

  pauseIfPlaying() {
    if (this.state === 'play' && !this.paused) this.togglePause();
  }

  setMuted(m: boolean) {
    this.sfx.ensure();
    this.sfx.setMuted(m);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.sfx.stopMusic();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }

  // ─────────────────────────── ввод ───────────────────────────
  private onAction(a: InputAction) {
    this.sfx.ensure();
    if (a === 'pause') { this.togglePause(); return; }
    if (this.state !== 'play' || this.paused) return;
    if (a === 'left' || a === 'right') {
      if (this.player.tryLane(a === 'left' ? -1 : 1)) {
        this.sfx.laneTick();
        this.particles.spawn(this.player.x, 0.15, this.pz, 0x9fdcff, 4, 1.6, 1.2, 0.4);
      }
    } else if (a === 'action') {
      const r = this.player.primary();
      if (r === 'flip') {
        this.sfx.whoosh();
        this.particles.spawn(this.player.x, this.player.feetY() + 0.2, this.pz, 0x22e0ff, 8, 2.4, 2, 0.5);
      } else if (r === 'jump') {
        this.sfx.jumpS();
        this.particles.spawn(this.player.x, 0.1, this.pz, 0xffe9a8, 6, 2, 1.4, 0.4);
      }
    } else if (a === 'down') {
      if (this.player.mode === 'flip' && this.player.flipT > 0) {
        this.player.forceLand();
        this.sfx.whoosh();
      }
    }
  }

  // ─────────────────────────── цикл ───────────────────────────
  private tick(now: number) {
    let dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
    this.t += dt;
    const t = this.t;

    if (this.state === 'dying') {
      this.timeScale += (0.22 - this.timeScale) * Math.min(1, dt * 8);
      this.dieTimer += dt;
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 4);
    }
    dt *= this.timeScale;

    const playing = this.state === 'play' || this.state === 'dying';

    if (playing) {
      this.elapsed += dt;
      const diff = Math.min(1, this.elapsed / 100 + this.dist / 7000);
      this.world.diff = diff;
      this.speed = Math.min(38, 15 + this.elapsed * 0.14 + this.dist * 0.0012);
      this.dist += this.speed * dt;
      this.pz -= this.speed * dt;

      // перебазировка координат
      if (this.pz < -15000) {
        const dz = -this.pz;
        this.pz = 0;
        this.world.shift(dz);
        this.particles.shift(dz);
        this.camera.position.z += dz;
      }

      this.player.group.position.z = this.pz;
      if (this.state === 'play' && this.player.justLanded) {
        this.sfx.land();
        this.particles.spawn(this.player.x, this.player.feetY() + 0.1, this.pz, 0xffffff, 6, 2, 1, 0.35);
      }
      this.player.justLanded = false;

      // встречные поезда / драконы
      this.oncT -= dt;
      if (this.oncT <= 0) {
        const kind = this.world.spawnOncoming(this.pz - 280, this.speed, this.curLoc);
        if (kind === 'train') { this.sfx.horn(); this.cb.warn('train'); }
        else { this.sfx.roar(); this.cb.warn('dragon'); }
        this.oncT = rand(9.5, 14) - diff * 4;
      }

      // события мира
      for (const ev of this.world.pollEvents(this.pz)) {
        if (ev.type === 'loc' && ev.loc) {
          this.curLoc = ev.loc;
          const cfg = LOCS[ev.loc];
          this.cb.banner(cfg.name, cfg.sub, css(cfg.accent));
          this.cb.loc(ev.loc);
          this.sfx.setRoot(cfg.musicRoot);
          this.sfx.milestone();
          this.setTargets(cfg);
        } else if (ev.type === 'preCastle') {
          this.player.setLaneSet('castle');
          this.cb.banner('СТЕНА ВПЕРЕДИ!', 'Дорогу перекрыли — уходи влево на новую улицу', '#ffb300');
          this.sfx.milestone();
        } else if (ev.type === 'mode' && ev.mode === 'jump') {
          this.player.setMode('jump');
          this.player.forceLand();
        } else if (ev.type === 'exitCastle') {
          this.player.setLaneSet('std');
          this.player.setMode('flip');
          setTimeout(() => {
            if (this.state === 'play') {
              this.cb.banner('ПОТОЛОК СНОВА ДОСТУПЕН', 'Улица замка заканчивается — назад, на основную дорогу', '#ffffff');
            }
          }, 1600);
        }
      }

      // столкновения
      if (this.state === 'play') {
        const pb = this.player.bounds();
        for (const c of this.world.colliders) {
          const dzc = c.z - this.pz;
          if (dzc < -c.half - 0.5 || dzc > c.half + 0.5) continue;
          if (Math.abs(c.x - pb.x) > c.w / 2 + 0.34) continue;
          if (c.y1 <= pb.y0 + 0.05 || c.y0 >= pb.y1 - 0.05) continue;
          this.crash();
          break;
        }
        // монетки
        for (const cn of this.world.coins) {
          if (cn.taken) continue;
          const dzc = cn.z - this.pz;
          if (Math.abs(dzc) > 0.95) continue;
          if (Math.abs(cn.x - pb.x) > 0.8) continue;
          if (cn.y < pb.y0 - 0.95 || cn.y > pb.y1 + 0.95) continue;
          cn.taken = true;
          cn.obj.visible = false;
          this.coinCount++;
          this.sfx.coin();
          this.particles.spawn(cn.x, cn.y, cn.z, 0xffd166, 7, 2.2, 2.4, 0.5);
        }
      }

      // милы
      if (this.dist >= this.nextMile) {
        this.sfx.milestone();
        this.particles.spawn(this.player.x, 2, this.pz - 2, 0x22e0ff, 16, 4, 4, 0.9);
        if (this.nextMile % 1000 === 0) {
          this.cb.banner(`${this.nextMile} МЕТРОВ!`, 'Отличный темп — не сбавляй', css(LOCS[this.curLoc].accent));
        }
        this.nextMile += 500;
      }
    }

    // мир и игрок обновляются всегда (в меню — фоновая сцена)
    if (!this.paused) {
      this.world.update(dt, this.pz, t);
      this.player.update(dt, this.state === 'menu' ? 2.5 : this.speed, t);
      this.particles.update(dt);
      this.streaks.update(dt, this.pz, this.state === 'play' ? this.speed : 0, TUNNEL_H);
    }

    // камера
    this.updateCamera(dt, t);

    // свет следует за игроком
    this.point.position.set(this.player.x * 0.6, 4.4, this.pz - 4);
    this.dir.position.set(this.player.x + 8, 16, this.pz + 4);

    // плавная смена палитры
    const k = Math.min(1, dt * 2.2);
    lerpC(this.scene.background as THREE.Color, this.tgt.bg, k);
    const fog = this.scene.fog as THREE.Fog;
    lerpC(fog.color, this.tgt.fog, k);
    fog.near += (this.tgt.fogNear - fog.near) * k;
    fog.far += (this.tgt.fogFar - fog.far) * k;
    lerpC(this.hemi.color, this.tgt.hemiSky, k);
    lerpC(this.hemi.groundColor, this.tgt.hemiGround, k);
    lerpC(this.dir.color, this.tgt.sun, k);

    // HUD с троттлингом
    if (playing) {
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.1;
        this.cb.hud({
          dist: Math.floor(this.dist),
          coins: this.coinCount,
          speed: Math.round(this.speed * 3.6),
          best: this.best,
        });
      }
    }

    // смерть → экран поражения
    if (this.state === 'dying' && this.dieTimer > 1.2) {
      this.state = 'dead';
      const score = Math.floor(this.dist) + this.coinCount * 25;
      const isRecord = score > this.best;
      if (isRecord) {
        this.best = score;
        localStorage.setItem('gr_best', String(score));
      }
      this.cb.over({ dist: Math.floor(this.dist), coins: this.coinCount, score, best: this.best, isRecord });
      this.cb.state('dead');
    }

    this.renderer.render(this.scene, this.camera);
  }

  private crash() {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.dieTimer = 0;
    this.player.crash();
    this.sfx.crash();
    this.shake = 1.4;
    this.cb.warn(null);
    this.particles.spawn(this.player.x, this.player.feetY() + 0.8, this.pz, 0xff3040, 26, 5, 4, 0.9);
    this.particles.spawn(this.player.x, this.player.feetY() + 0.8, this.pz, 0xffb300, 14, 4, 5, 0.8);
  }

  private updateCamera(dt: number, t: number) {
    const cam = this.camera;
    if (this.state === 'menu') {
      cam.position.set(Math.sin(t * 0.13) * 1.5, 3.05 + Math.sin(t * 0.17) * 0.25, 8.4);
      cam.lookAt(0, 1.7, -10);
      if (Math.abs(cam.fov - 58) > 0.1) { cam.fov = 58; cam.updateProjectionMatrix(); }
      return;
    }
    const px = this.player.x;
    const flip = this.player.flipT;
    const castle = this.curLoc === 'castle';
    const targY = castle ? 3.75 : 3.05 + flip * 1.05;
    const k = 1 - Math.pow(0.001, dt);
    cam.position.x += (px * 0.45 - cam.position.x) * k;
    cam.position.y += (targY - cam.position.y) * k;
    cam.position.z = this.pz + 8.6;

    this.shake = Math.max(0, this.shake - dt * 2.0);
    if (this.shake > 0.01) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }

    const lookY = castle ? 1.7 : 1.55 + flip * 2.7;
    cam.lookAt(px * 0.72, lookY, this.pz - 9);

    const targetFov = 62 + Math.min(16, Math.max(0, (this.speed - 15) * 0.5));
    this.camFov += (targetFov - this.camFov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.camFov) > 0.1) {
      cam.fov = this.camFov;
      cam.updateProjectionMatrix();
    }
  }

  private setTargets(cfg: (typeof LOCS)[LocId]) {
    this.tgt.bg.setHex(cfg.bg);
    this.tgt.fog.setHex(cfg.fog);
    this.tgt.fogNear = cfg.fogNear;
    this.tgt.fogFar = cfg.fogFar;
    this.tgt.hemiSky.setHex(cfg.hemiSky);
    this.tgt.hemiGround.setHex(cfg.hemiGround);
    this.tgt.sun.setHex(cfg.sunColor);
    this.hemi.intensity += (cfg.hemiInt - this.hemi.intensity) * 0.5;
    this.dir.intensity += (cfg.sunInt - this.dir.intensity) * 0.5;
    this.point.color.setHex(cfg.accent2);
  }

  private snapColors(cfg: (typeof LOCS)[LocId]) {
    this.setTargets(cfg);
    (this.scene.background as THREE.Color).copy(this.tgt.bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.tgt.fog);
    fog.near = cfg.fogNear; fog.far = cfg.fogFar;
    this.hemi.color.copy(this.tgt.hemiSky);
    this.hemi.groundColor.copy(this.tgt.hemiGround);
    this.hemi.intensity = cfg.hemiInt;
    this.dir.color.copy(this.tgt.sun);
    this.dir.intensity = cfg.sunInt;
  }

  private onResize = () => {
    const w = this.mount.clientWidth, h = this.mount.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
