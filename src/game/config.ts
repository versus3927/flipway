// ── Константы мира ─────────────────────────────────────────────
export const LANE_GAP = 2.3;
export const LANES = [-LANE_GAP, 0, LANE_GAP];
/** Сдвиг улицы у замка относительно основной дороги */
export const CASTLE_SHIFT = -6.9;
export const CASTLE_LANES = LANES.map((x) => x + CASTLE_SHIFT);
export const TUNNEL_H = 6.4; // высота потолка
export const CHUNK = 30; // длина чанка
export const GEN_AHEAD = 300; // как далеко вперёд генерировать
export const PLAYER_H = 1.5;

export type LocId = 'metro' | 'canyon' | 'ice' | 'pugs' | 'castle';
export type MoveMode = 'flip' | 'jump';

export interface LocCfg {
  id: LocId;
  name: string;
  sub: string;
  bg: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  ground2: number;
  ceiling: number;
  laneGlow: number;
  accent: number;
  accent2: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  sunColor: number;
  sunInt: number;
  sunPos: [number, number, number];
  hasCeiling: boolean;
  musicRoot: number; // Hz
}

export const LOCS: Record<LocId, LocCfg> = {
  metro: {
    id: 'metro', name: 'НЕОН-СИТИ', sub: 'Подземка будущего — берегись поездов',
    bg: 0x04060d, fog: 0x080c1e, fogNear: 42, fogFar: 190,
    ground: 0x12141d, ground2: 0x0a0c14, ceiling: 0x0d1126,
    laneGlow: 0x22e0ff, accent: 0xff2d95, accent2: 0x22e0ff,
    hemiSky: 0x44548c, hemiGround: 0x0a0c14, hemiInt: 0.95,
    sunColor: 0x9db4ff, sunInt: 1.15, sunPos: [8, 16, 6],
    hasCeiling: true, musicRoot: 55,
  },
  canyon: {
    id: 'canyon', name: 'АЛЫЙ КАНЬОН', sub: 'Пыль, скалы и товарняки',
    bg: 0xffa762, fog: 0xf2814a, fogNear: 55, fogFar: 225,
    ground: 0xc9854a, ground2: 0xa5673a, ceiling: 0x5e3018,
    laneGlow: 0xffe08a, accent: 0xff5722, accent2: 0xffd54f,
    hemiSky: 0xffd9a8, hemiGround: 0x7a4a2b, hemiInt: 0.95,
    sunColor: 0xffedd0, sunInt: 1.65, sunPos: [-12, 20, 8],
    hasCeiling: true, musicRoot: 49,
  },
  ice: {
    id: 'ice', name: 'ЛЕДЯНАЯ ПЕЩЕРА', sub: 'Осторожно: сосульки сверху и снизу',
    bg: 0x03202d, fog: 0x0d4359, fogNear: 38, fogFar: 178,
    ground: 0x9fd3e8, ground2: 0x74aac6, ceiling: 0x11455e,
    laneGlow: 0x00e5ff, accent: 0x00e5ff, accent2: 0xb388ff,
    hemiSky: 0x9fd8ef, hemiGround: 0x0b2a3a, hemiInt: 1.05,
    sunColor: 0xcfeaff, sunInt: 1.15, sunPos: [10, 18, 4],
    hasCeiling: true, musicRoot: 58.27,
  },
  pugs: {
    id: 'pugs', name: 'МОПС-СТРИТ', sub: 'Крытая улица, где правят мопсы',
    bg: 0x150920, fog: 0x2c1140, fogNear: 42, fogFar: 185,
    ground: 0x3f2350, ground2: 0x2c1638, ceiling: 0x241130,
    laneGlow: 0xff9be0, accent: 0xffd166, accent2: 0xff6b9d,
    hemiSky: 0x9a5aad, hemiGround: 0x1c0b26, hemiInt: 1.0,
    sunColor: 0xffc9e2, sunInt: 1.05, sunPos: [8, 16, 6],
    hasCeiling: true, musicRoot: 65.41,
  },
  castle: {
    id: 'castle', name: 'ЗАМОК ДРАКОНОВ', sub: 'Потолка нет — тап = прыжок. Стена справа!',
    bg: 0x7fb4f2, fog: 0xa9c9ee, fogNear: 65, fogFar: 250,
    ground: 0xa89f8c, ground2: 0x8a8271, ceiling: 0,
    laneGlow: 0xffe9a8, accent: 0xffb300, accent2: 0x64b5ff,
    hemiSky: 0xd8ecff, hemiGround: 0x6b6250, hemiInt: 1.2,
    sunColor: 0xfff3d6, sunInt: 1.75, sunPos: [-16, 24, 10],
    hasCeiling: false, musicRoot: 61.74,
  },
};

export const LOC_LIST: LocId[] = ['metro', 'canyon', 'ice', 'pugs', 'castle'];

export const css = (h: number) => '#' + h.toString(16).padStart(6, '0');

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const irand = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
