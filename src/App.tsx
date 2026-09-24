import { useEffect, useRef, useState } from 'react';
import { Game, HudData } from './game/Game';
import { LOCS, LocId, css } from './game/config';
import {
  Play, RotateCcw, Pause, Volume2, VolumeX, Coins, Gauge, Trophy,
  MoveHorizontal, ArrowUpDown, TrainFront, AlertTriangle, Building2,
  Mountain, Snowflake, Dog, Castle, Flame, Home, ChevronRight,
} from 'lucide-react';

const LOC_ICONS: Record<LocId, typeof Building2> = {
  metro: Building2, canyon: Mountain, ice: Snowflake, pugs: Dog, castle: Castle,
};

interface Banner { t: string; s: string; c: string; key: number; }
interface Results { dist: number; coins: number; score: number; best: number; isRecord: boolean; }

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudData>({ dist: 0, coins: 0, speed: 0, best: 0 });
  const [state, setState] = useState<'menu' | 'play' | 'dead'>('menu');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [warn, setWarn] = useState<{ kind: 'train' | 'dragon'; key: number } | null>(null);
  const [loc, setLoc] = useState<LocId>('metro');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('gr_mute') === '1');
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const game = new Game(mountRef.current, {
      hud: (d) => setHud(d),
      banner: (t, s, c) => setBanner({ t, s, c, key: Date.now() + Math.random() }),
      state: (s) => setState(s),
      warn: (kind) => setWarn(kind ? { kind, key: Date.now() } : null),
      loc: (l) => setLoc(l),
      over: (r) => setResults(r),
      pauseChange: (p) => setPaused(p),
    });
    gameRef.current = game;
    game.setMuted(localStorage.getItem('gr_mute') === '1');
    const onVis = () => { if (document.hidden) game.pauseIfPlaying(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  // автоскрытие баннера и предупреждения
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 2900);
    return () => clearTimeout(id);
  }, [banner]);
  useEffect(() => {
    if (!warn) return;
    const id = setTimeout(() => setWarn(null), 2600);
    return () => clearTimeout(id);
  }, [warn]);

  const start = () => { setResults(null); gameRef.current?.start(); };
  const toMenu = () => { setResults(null); gameRef.current?.toMenu(); };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    localStorage.setItem('gr_mute', m ? '1' : '0');
    gameRef.current?.setMuted(m);
  };

  const LocIcon = LOC_ICONS[loc];
  const locCfg = LOCS[loc];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#04060d]">
      {/* 3D сцена */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* виньетка + сканлайны */}
      <div className="pointer-events-none absolute inset-0 vignette" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-60" />

      {/* ═══ HUD во время игры ═══ */}
      {state === 'play' && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2 animate-fade">
            <div className="glass rounded-2xl px-4 py-2.5">
              <div className="text-[10px] font-display tracking-[0.25em] text-cyan-300/70">СЧЁТ</div>
              <div className="font-display text-3xl font-800 leading-none text-white" style={{ fontWeight: 800 }}>
                {hud.dist + hud.coins * 25}
              </div>
            </div>
            <div className="glass rounded-2xl px-4 py-2 flex items-center gap-2">
              <Coins size={16} className="text-amber-300" />
              <span className="font-display text-lg text-amber-200" style={{ fontWeight: 600 }}>{hud.coins}</span>
            </div>
            <div className="glass rounded-2xl px-4 py-2 flex items-center gap-2">
              <LocIcon size={16} style={{ color: css(locCfg.accent) }} />
              <span className="font-russo text-xs text-white/85 tracking-wide">{locCfg.name}</span>
            </div>
          </div>

          <div className="absolute right-3 top-3 flex flex-col items-end gap-2 animate-fade">
            <div className="flex gap-2">
              <button
                onClick={() => gameRef.current?.togglePause()}
                className="glass rounded-full p-3 text-white/90 active:scale-90 transition-transform"
                aria-label="Пауза"
              >
                {paused ? <Play size={20} /> : <Pause size={20} />}
              </button>
              <button
                onClick={toggleMute}
                className="glass rounded-full p-3 text-white/90 active:scale-90 transition-transform"
                aria-label="Звук"
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
            <div className="pointer-events-none glass rounded-2xl px-4 py-2 flex items-center gap-2">
              <Gauge size={16} className="text-cyan-300" />
              <span className="font-display text-base text-white/90" style={{ fontWeight: 600 }}>{hud.speed}</span>
              <span className="text-[10px] text-white/50 font-russo">км/ч</span>
            </div>
          </div>

          {/* предупреждение о встречке */}
          {warn && (
            <div key={warn.key} className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 animate-warn">
              <div className="flex items-center gap-3 rounded-2xl border-2 border-red-500 bg-red-950/80 px-5 py-3 backdrop-blur">
                <AlertTriangle size={20} className="text-red-400" />
                <span className="font-display text-lg text-red-200 tracking-widest" style={{ fontWeight: 800 }}>
                  {warn.kind === 'train' ? 'ПОЕЗД!' : 'ДРАКОН!'}
                </span>
                {warn.kind === 'train'
                  ? <TrainFront size={22} className="text-red-300" />
                  : <Flame size={22} className="text-orange-400" />}
              </div>
            </div>
          )}
        </>
      )}

      {/* баннер (смена локации и т.п.) */}
      {banner && state === 'play' && (
        <div key={banner.key} className="pointer-events-none absolute left-1/2 top-[16%] -translate-x-1/2 animate-banner w-full px-4">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <div
              className="font-display text-2xl sm:text-4xl tracking-wide text-white"
              style={{ fontWeight: 900, textShadow: `0 0 24px ${banner.c}, 0 2px 12px rgba(0,0,0,.6)` }}
            >
              {banner.t}
            </div>
            <div className="mt-1.5 h-[3px] w-40 rounded-full" style={{ background: banner.c, boxShadow: `0 0 14px ${banner.c}` }} />
            <div className="mt-2 font-russo text-sm sm:text-base text-white/85" style={{ textShadow: '0 1px 8px rgba(0,0,0,.8)' }}>
              {banner.s}
            </div>
          </div>
        </div>
      )}

      {/* ═══ МЕНЮ ═══ */}
      {state === 'menu' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#04060d]/60 via-transparent to-[#04060d]/90 px-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget) start(); }}
        >
          <div className="flex flex-col items-center animate-pop">
            <div className="mb-3 flex items-center gap-2 rounded-full glass px-4 py-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse-dot" />
              <span className="font-russo text-[11px] tracking-[0.3em] text-cyan-200/80">WEBGL · БЕСКОНЕЧНЫЙ РАННЕР</span>
            </div>
            <h1
              className="title-sheen font-display text-center leading-none text-glow-cyan"
              style={{
                fontWeight: 900,
                fontSize: 'clamp(2.6rem, 9vw, 5.5rem)',
                backgroundImage: 'linear-gradient(100deg,#22e0ff 10%,#7cf7ff 30%,#ff2d95 55%,#ff7ab8 75%,#22e0ff 95%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              ГРАВИ-РАН
            </h1>
            <p className="mt-3 max-w-md text-center font-russo text-sm sm:text-base text-white/75">
              Жми на экран — и гравитация перевернётся: бегай по потолку!
              Уворачивайся от поездов, мопсов и драконов в 5 мирах.
            </p>
          </div>

          <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-2 animate-pop" style={{ animationDelay: '.08s' }}>
            {(Object.keys(LOCS) as LocId[]).map((id) => {
              const I = LOC_ICONS[id];
              return (
                <div key={id} className="glass rounded-xl px-2 py-2.5 flex flex-col items-center gap-1">
                  <I size={18} style={{ color: css(LOCS[id].accent) }} />
                  <span className="font-russo text-[9px] sm:text-[10px] text-white/75 text-center leading-tight">{LOCS[id].name}</span>
                </div>
              );
            })}
            <div className="glass rounded-xl px-2 py-2.5 flex flex-col items-center gap-1">
              <ArrowUpDown size={18} className="text-cyan-300" />
              <span className="font-russo text-[9px] sm:text-[10px] text-white/75 text-center leading-tight">ПОЛ + ПОТОЛОК</span>
            </div>
          </div>

          <div className="mt-4 flex w-full max-w-md items-stretch gap-2 animate-pop" style={{ animationDelay: '.14s' }}>
            <div className="glass rounded-xl px-4 py-3 flex-1 flex items-center gap-3">
              <MoveHorizontal size={22} className="text-fuchsia-400 shrink-0" />
              <span className="font-russo text-[11px] text-white/80 leading-snug">Свайпы или ← → — смена дорожки</span>
            </div>
            <div className="glass rounded-xl px-4 py-3 flex-1 flex items-center gap-3">
              <ArrowUpDown size={22} className="text-cyan-300 shrink-0" />
              <span className="font-russo text-[11px] text-white/80 leading-snug">Тап или Пробел — сальто на потолок</span>
            </div>
          </div>

          <button
            onClick={start}
            className="group mt-7 flex items-center gap-3 rounded-full px-10 py-4 font-display text-xl tracking-widest text-white shadow-[0_0_40px_rgba(34,224,255,.45)] transition-transform active:scale-95 animate-pop"
            style={{
              fontWeight: 800,
              background: 'linear-gradient(100deg,#0891b2,#22d3ee 45%,#e11d8f)',
              animationDelay: '.2s',
            }}
          >
            <Play size={24} className="transition-transform group-hover:scale-125" />
            ИГРАТЬ
          </button>

          {hud.best > 0 && (
            <div className="mt-4 flex items-center gap-2 glass rounded-full px-5 py-2 animate-fade">
              <Trophy size={15} className="text-amber-300" />
              <span className="font-russo text-sm text-amber-200">Рекорд: {hud.best}</span>
            </div>
          )}

          <p className="pointer-events-none absolute bottom-4 left-1/2 w-full -translate-x-1/2 text-center font-russo text-[10px] tracking-widest text-white/35 px-4">
            3D НА OPENGL (WEBGL) · РАБОТАЕТ НА ТЕЛЕФОНЕ И ПК · МОЖНО СОБРАТЬ В APK
          </p>
        </div>
      )}

      {/* ═══ ПАУЗА ═══ */}
      {paused && state === 'play' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-fade">
          <div className="font-display text-3xl text-white tracking-widest mb-6" style={{ fontWeight: 800 }}>ПАУЗА</div>
          <div className="flex gap-3">
            <button
              onClick={() => gameRef.current?.togglePause()}
              className="flex items-center gap-2 rounded-full bg-cyan-500 px-7 py-3.5 font-display text-base text-white active:scale-95 transition-transform"
              style={{ fontWeight: 700 }}
            >
              <Play size={19} /> ДАЛЬШЕ
            </button>
            <button
              onClick={() => { gameRef.current?.togglePause(); toMenu(); }}
              className="flex items-center gap-2 rounded-full glass px-7 py-3.5 font-display text-base text-white/90 active:scale-95 transition-transform"
              style={{ fontWeight: 700 }}
            >
              <Home size={19} /> МЕНЮ
            </button>
          </div>
        </div>
      )}

      {/* ═══ СМЕРТЬ ═══ */}
      {state === 'dead' && results && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-red-950/50 via-[#04060d]/80 to-[#04060d]/95 px-4">
          <div className="animate-pop flex flex-col items-center">
            <div className="font-display text-4xl sm:text-5xl text-red-400 tracking-wider" style={{ fontWeight: 900, textShadow: '0 0 30px rgba(255,48,64,.5)' }}>
              АВАРИЯ!
            </div>
            {results.isRecord && (
              <div className="mt-3 flex items-center gap-2 rounded-full bg-amber-400/15 border border-amber-300/40 px-4 py-1.5">
                <Trophy size={15} className="text-amber-300" />
                <span className="font-russo text-xs text-amber-200 tracking-widest">НОВЫЙ РЕКОРД!</span>
              </div>
            )}
            <div className="mt-6 glass rounded-3xl px-8 py-5 flex flex-col items-center min-w-[260px]">
              <div className="text-[10px] font-display tracking-[0.3em] text-white/50">ИТОГОВЫЙ СЧЁТ</div>
              <div className="font-display text-5xl text-white mt-1" style={{ fontWeight: 900 }}>{results.score}</div>
              <div className="mt-3 flex items-center gap-5">
                <div className="flex items-center gap-1.5 text-white/80">
                  <ChevronRight size={14} className="text-cyan-300" />
                  <span className="font-russo text-sm">{results.dist} м</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/80">
                  <Coins size={14} className="text-amber-300" />
                  <span className="font-russo text-sm">{results.coins}</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/80">
                  <Trophy size={14} className="text-amber-400" />
                  <span className="font-russo text-sm">{results.best}</span>
                </div>
              </div>
            </div>
            <div className="mt-7 flex gap-3">
              <button
                onClick={start}
                className="flex items-center gap-3 rounded-full px-8 py-4 font-display text-lg text-white shadow-[0_0_34px_rgba(34,224,255,.4)] active:scale-95 transition-transform"
                style={{ fontWeight: 800, background: 'linear-gradient(100deg,#0891b2,#22d3ee 45%,#e11d8f)' }}
              >
                <RotateCcw size={22} />
                ЕЩЁ РАЗ
              </button>
              <button
                onClick={toMenu}
                className="flex items-center gap-2 rounded-full glass px-6 py-4 font-display text-base text-white/90 active:scale-95 transition-transform"
                style={{ fontWeight: 700 }}
              >
                <Home size={19} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
