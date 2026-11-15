// NOVA SHARDS — every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule depends on the
// screen size. All gameplay randomness flows through the seeded RNG in random.js.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Seconds the player is invulnerable right after being hit. */
export const PLAYER = {
  radius: 16,
  speed: 330,
  accel: 2600,
  friction: 6.5,
  maxHp: 3,
  fireRate: 4.2,
  damage: 1,
  projectiles: 1,
  spread: 0.16,
  bulletSpeed: 640,
  bulletRadius: 5,
  magnet: 110,
  bombs: 1,
  invuln: 1.6,
  shieldSeconds: 4,
};

export const COMBO = { window: 3.0, step: 0.25, max: 5 };

export const SHARD = { radius: 7, points: 25, magnetSpeed: 520, life: 9 };

/** Enemy kinds: hp, radius, speed, score, colour, behaviour. */
export const ENEMIES = {
  mite: { hp: 1, radius: 13, speed: 165, score: 10, color: '#ff5d8f', core: '#ffd166' },
  drifter: { hp: 2, radius: 18, speed: 105, score: 20, color: '#4fc3f7', core: '#eaf6ff' },
  spinner: { hp: 4, radius: 21, speed: 78, score: 40, color: '#b388ff', core: '#efe6ff' },
  splitter: { hp: 6, radius: 26, speed: 62, score: 50, color: '#69f0ae', core: '#eafff3' },
  mini: { hp: 1, radius: 10, speed: 210, score: 5, color: '#ff5d8f', core: '#ffd166' },
  warden: { hp: 420, radius: 52, speed: 46, score: 500, color: '#ff7043', core: '#ffe082' },
};

/** Which kinds may appear from which wave on, and their spawn weight. */
export const SPAWN_TABLE = [
  { kind: 'mite', from: 1, weight: 10 },
  { kind: 'drifter', from: 2, weight: 7 },
  { kind: 'spinner', from: 3, weight: 4 },
  { kind: 'splitter', from: 4, weight: 3 },
];

/** Enemies in a wave (boss waves add the Warden on top of a smaller pack). */
export function waveSize(wave) {
  return 8 + wave * 4;
}

export const BOSS_WAVES = [5, 10];
export const VICTORY_WAVE = 10;

/** Seconds between trickle spawns inside a wave; shrinks as waves rise. Kept brisk so the
 * field stays crowded: kills come fast, and the swarm must outnumber the player. */
export function spawnInterval(wave) {
  return Math.max(0.3, 0.75 - wave * 0.04);
}

/** Seconds of calm before the upgrade draft after a wave is cleared. */
export const INTERMISSION_SECONDS = 5;

/** The upgrade draft: id, name, blurb, and the stat it changes. */
export const UPGRADES = [
  { id: 'rapid', name: 'RAPID CYCLER', blurb: '+25% fire rate', apply: (p) => { p.fireRate *= 1.25; } },
  { id: 'heavy', name: 'HEAVY ROUNDS', blurb: '+1 bullet damage', apply: (p) => { p.damage += 1; } },
  { id: 'twin', name: 'TWIN BARRELS', blurb: '+1 projectile (max 4)', apply: (p) => { p.projectiles = Math.min(4, p.projectiles + 1); } },
  { id: 'thrusters', name: 'ION THRUSTERS', blurb: '+15% move speed', apply: (p) => { p.speed *= 1.15; } },
  { id: 'magnet', name: 'MAGNET CORE', blurb: '+70% shard pickup radius', apply: (p) => { p.magnet *= 1.7; } },
  { id: 'plating', name: 'HULL PLATING', blurb: '+1 max hull, repair 1', apply: (p) => { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 1); } },
  { id: 'bomb', name: 'NOVA BOMB', blurb: '+1 bomb (B / right-click)', apply: (p) => { p.bombs += 1; } },
  { id: 'shield', name: 'AEGIS SHIELD', blurb: '4s shield at each wave start', apply: (p) => { p.shieldOnWave = true; } },
];

export const PALETTE = {
  backdrop: '#070b1a',
  panel: 'rgba(10, 16, 36, 0.82)',
  panelEdge: '#2a3a6e',
  text: '#eef1ff',
  muted: '#8b93b8',
  accent: '#4fc3f7',
  gold: '#ffd166',
  danger: '#ff5d8f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'nova-shards.best';
