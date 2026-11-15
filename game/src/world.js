// NOVA SHARDS — the whole game, as pure logic: no DOM, no canvas, no Math.random. Every
// random choice flows through the seeded RNG passed to createWorld, so the same seed and the
// same inputs always give the same state — that is what the Node tests and the screenshot
// autopilot rely on. The renderer only reads state; the loop only feeds it input.
import {
  FIELD, PLAYER, COMBO, SHARD, ENEMIES, SPAWN_TABLE, BOSS_WAVES, VICTORY_WAVE,
  waveSize, spawnInterval, INTERMISSION_SECONDS, UPGRADES,
} from './config.js';
import { weightedPick } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_KILL = 4;
export const EVENT_WAVE = 8;
export const EVENT_VICTORY = 16;
export const EVENT_PICKUP = 32;
export const EVENT_BOMB = 64;

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function makePlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    fireTimer: 0,
    invuln: 0,
    shield: 0,
    shieldOnWave: false,
    speed: PLAYER.speed,
    damage: PLAYER.damage,
    fireRate: PLAYER.fireRate,
    projectiles: PLAYER.projectiles,
    magnet: PLAYER.magnet,
    bombs: PLAYER.bombs,
  };
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    wave: 0,
    phase: 'title',
    phaseTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    player: makePlayer(),
    enemies: [],
    bullets: [],
    ebullets: [],
    shards: [],
    particles: [],
    texts: [],
    offer: [],
    banner: null,
    boss: null,
    shake: 0,
    flash: 0,
    stats: { shots: 0, hits: 0, shards: 0, bombs: 0 },
  };

  function addText(x, y, text, color) {
    state.texts.push({ x, y, text, color, life: 0.9, vy: -46 });
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 0.4 + random() * 0.5,
        maxLife: 0.9,
        size: 2 + random() * 3.5,
        color,
      });
    }
  }

  function spawnPoint() {
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = Math.floor(random() * 4);
      let x;
      let y;
      if (edge === 0) { x = random() * FIELD.width; y = -30; }
      else if (edge === 1) { x = FIELD.width + 30; y = random() * FIELD.height; }
      else if (edge === 2) { x = random() * FIELD.width; y = FIELD.height + 30; }
      else { x = -30; y = random() * FIELD.height; }
      if (dist(x, y, state.player.x, state.player.y) > 240) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function spawnEnemy(kind) {
    const def = ENEMIES[kind];
    const at = spawnPoint();
    const enemy = {
      kind,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      speed: def.speed * (1 + (state.wave - 1) * 0.03),
      score: def.score,
      angle: random() * TAU,
      spin: (random() - 0.5) * 2.4,
      shootTimer: 1.5 + random() * 1.5,
      burstTimer: 3,
      wobble: random() * TAU,
    };
    if (kind === 'warden') {
      enemy.x = FIELD.width / 2;
      enemy.y = -70;
      enemy.hp = def.hp + (state.wave - 5) * 280;
      enemy.maxHp = enemy.hp;
      state.boss = enemy;
    }
    state.enemies.push(enemy);
    return enemy;
  }

  function buildQueue(wave) {
    const table = SPAWN_TABLE.filter((row) => row.from <= wave);
    const queue = [];
    const count = waveSize(wave);
    for (let i = 0; i < count; i += 1) queue.push(weightedPick(random, table).kind);
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildQueue(wave);
    state.spawnTimer = 0.8;
    state.phase = 'play';
    state.banner = {
      text: BOSS_WAVES.includes(wave) ? `WAVE ${wave} — THE WARDEN` : `WAVE ${wave}`,
      sub: wave === 1 ? 'Blast the swarm. Grab the shards.' : '',
      timer: 2.2,
    };
    if (BOSS_WAVES.includes(wave)) spawnEnemy('warden');
    if (state.player.shieldOnWave) state.player.shield = PLAYER.shieldSeconds;
  }

  function offerUpgrades() {
    const pool = [...UPGRADES];
    const offer = [];
    while (offer.length < 3 && pool.length > 0) {
      const index = Math.floor(random() * pool.length);
      offer.push(pool.splice(index, 1)[0]);
    }
    state.offer = offer;
  }

  function clearWave() {
    const bonus = 100 * state.wave;
    state.score += bonus;
    addText(FIELD.width / 2, FIELD.height / 2 - 40, `WAVE CLEAR  +${bonus}`, '#ffd166');
    if (state.wave >= VICTORY_WAVE) {
      state.phase = 'victory';
      state.banner = { text: 'CHAMPION OF THE NOVA', sub: 'Wave 10 cleared — the swarm is broken.', timer: 99 };
      return EVENT_VICTORY;
    }
    state.phase = 'intermission';
    state.phaseTimer = INTERMISSION_SECONDS;
    offerUpgrades();
    return EVENT_WAVE;
  }

  function damagePlayer(amount) {
    const player = state.player;
    if (player.invuln > 0 || player.shield > 0 || state.phase !== 'play') return 0;
    player.hp -= amount;
    player.invuln = PLAYER.invuln;
    state.shake = Math.max(state.shake, 14);
    state.flash = 0.35;
    state.combo = 0;
    state.comboTimer = 0;
    burst(player.x, player.y, '#ff5d8f', 18, 260);
    if (player.hp <= 0) {
      player.hp = 0;
      state.phase = 'over';
      burst(player.x, player.y, '#4fc3f7', 60, 420);
      burst(player.x, player.y, '#ffd166', 40, 320);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function killEnemy(index) {
    const enemy = state.enemies[index];
    const mult = Math.min(COMBO.max, 1 + state.combo * COMBO.step);
    const gained = Math.round(enemy.score * mult);
    state.score += gained;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.kills += 1;
    addText(enemy.x, enemy.y - 10, `+${gained}`, '#ffd166');
    burst(enemy.x, enemy.y, ENEMIES[enemy.kind].color, enemy.kind === 'warden' ? 70 : 16, 300);
    const shards = enemy.kind === 'warden' ? 10 : enemy.kind === 'spinner' || enemy.kind === 'splitter' ? 2 : 1;
    for (let i = 0; i < shards; i += 1) {
      state.shards.push({
        x: enemy.x + (random() - 0.5) * 30,
        y: enemy.y + (random() - 0.5) * 30,
        vx: (random() - 0.5) * 120,
        vy: (random() - 0.5) * 120,
        life: SHARD.life,
      });
    }
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 3; i += 1) {
        state.enemies.push({
          kind: 'mini', x: enemy.x + (random() - 0.5) * 36, y: enemy.y + (random() - 0.5) * 36,
          vx: 0, vy: 0, hp: 1, maxHp: 1, radius: ENEMIES.mini.radius,
          speed: ENEMIES.mini.speed, score: ENEMIES.mini.score,
          angle: random() * TAU, spin: (random() - 0.5) * 3, shootTimer: 0, burstTimer: 0,
          wobble: random() * TAU,
        });
      }
    }
    if (enemy.kind === 'warden') state.boss = null;
    state.enemies.splice(index, 1);
    return EVENT_KILL;
  }

  function fireBullet(angle) {
    const player = state.player;
    state.bullets.push({
      x: player.x + Math.cos(angle) * 22,
      y: player.y + Math.sin(angle) * 22,
      vx: Math.cos(angle) * PLAYER.bulletSpeed,
      vy: Math.sin(angle) * PLAYER.bulletSpeed,
      damage: player.damage,
      life: 1.1,
    });
  }

  function updatePlayer(dt, input) {
    const player = state.player;
    player.vx += input.moveX * PLAYER.accel * dt;
    player.vy += input.moveY * PLAYER.accel * dt;
    const drag = Math.exp(-PLAYER.friction * dt);
    player.vx *= drag;
    player.vy *= drag;
    player.x = Math.max(24, Math.min(FIELD.width - 24, player.x + player.vx * dt));
    player.y = Math.max(24, Math.min(FIELD.height - 24, player.y + player.vy * dt));
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.shield > 0) player.shield -= dt;
    if (input.firing) {
      player.fireTimer -= dt;
      while (player.fireTimer <= 0) {
        const n = player.projectiles;
        const base = player.angle;
        for (let i = 0; i < n; i += 1) {
          const offset = (i - (n - 1) / 2) * PLAYER.spread;
          fireBullet(base + offset);
        }
        state.stats.shots += 1;
        player.fireTimer += 1 / player.fireRate;
      }
    } else {
      player.fireTimer = Math.min(player.fireTimer, 0);
    }
  }

  function updateEnemies(dt) {
    const player = state.player;
    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      enemy.wobble += dt * 3;
      const wob = Math.sin(enemy.wobble) * 0.5;
      let mx = dx / d;
      let my = dy / d;
      if (enemy.kind === 'spinner') {
        const want = 260;
        const toward = d > want + 40 ? 1 : d < want - 60 ? -1 : 0;
        mx = (dx / d) * toward + (-dy / d) * 0.6;
        my = (dy / d) * toward + (dx / d) * 0.6;
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0 && d < 560) {
          enemy.shootTimer = 2.1 + random() * 0.8;
          state.ebullets.push({
            x: enemy.x, y: enemy.y,
            vx: (dx / d) * 210, vy: (dy / d) * 210,
            radius: 7, life: 6,
          });
        }
      } else if (enemy.kind === 'warden') {
        const toward = d > 300 ? 1 : d < 200 ? -1 : 0;
        mx = (dx / d) * toward * 0.7;
        my = (dy / d) * toward * 0.7;
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = 3.2;
          const count = 12;
          for (let i = 0; i < count; i += 1) {
            const a = (i / count) * TAU + enemy.angle;
            state.ebullets.push({
              x: enemy.x, y: enemy.y,
              vx: Math.cos(a) * 170, vy: Math.sin(a) * 170,
              radius: 8, life: 7,
            });
          }
        }
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0 && d < 620) {
          enemy.shootTimer = 1.4;
          for (const off of [-0.22, 0, 0.22]) {
            const a = Math.atan2(dy, dx) + off;
            state.ebullets.push({
              x: enemy.x, y: enemy.y,
              vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
              radius: 7, life: 6,
            });
          }
        }
      } else {
        mx = (dx / d) + (-dy / d) * wob * 0.4;
        my = (dy / d) + (dx / d) * wob * 0.4;
      }
      const len = Math.hypot(mx, my) || 1;
      enemy.vx = (mx / len) * enemy.speed;
      enemy.vy = (my / len) * enemy.speed;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle += enemy.spin * dt;
    }
    // Gentle separation so enemies do not stack on one point.
    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function updateBullets(dt) {
    let events = 0;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = state.enemies[j];
        if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.radius + PLAYER.bulletRadius) {
          state.bullets.splice(i, 1);
          state.stats.hits += 1;
          enemy.hp -= bullet.damage;
          burst(bullet.x, bullet.y, '#9be7ff', 4, 160);
          if (enemy.hp <= 0) events |= killEnemy(j);
          break;
        }
      }
    }
    return events;
  }

  function updateEnemyBullets(dt) {
    let events = 0;
    const player = state.player;
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const orb = state.ebullets[i];
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      if (orb.life <= 0 || orb.x < -30 || orb.x > FIELD.width + 30 || orb.y < -30 || orb.y > FIELD.height + 30) {
        state.ebullets.splice(i, 1);
        continue;
      }
      if (dist(orb.x, orb.y, player.x, player.y) < orb.radius + PLAYER.radius - 4) {
        state.ebullets.splice(i, 1);
        events |= damagePlayer(1);
        if (events & EVENT_OVER) return events;
      }
    }
    return events;
  }

  function updateContacts(dt) {
    let events = 0;
    const player = state.player;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (dist(enemy.x, enemy.y, player.x, player.y) < enemy.radius + PLAYER.radius - 2) {
        enemy.hp -= 1;
        events |= damagePlayer(1);
        if (events & EVENT_OVER) return events;
        if (enemy.hp <= 0) events |= killEnemy(j);
      }
    }
    return events;
  }

  function updateShards(dt) {
    let events = 0;
    const player = state.player;
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const shard = state.shards[i];
      shard.life -= dt;
      let d = dist(shard.x, shard.y, player.x, player.y);
      if (d < player.magnet) {
        const pull = SHARD.magnetSpeed * (1 - d / (player.magnet + 40));
        shard.vx += ((player.x - shard.x) / (d || 1)) * pull * dt * 6;
        shard.vy += ((player.y - shard.y) / (d || 1)) * pull * dt * 6;
      }
      shard.vx *= Math.exp(-2.5 * dt);
      shard.vy *= Math.exp(-2.5 * dt);
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      d = dist(shard.x, shard.y, player.x, player.y);
      if (d < 26) {
        state.shards.splice(i, 1);
        state.score += SHARD.points;
        state.stats.shards += 1;
        events |= EVENT_PICKUP;
      } else if (shard.life <= 0) {
        state.shards.splice(i, 1);
      }
    }
    return events;
  }

  function updateFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2 * dt);
      p.vy *= Math.exp(-2 * dt);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 42);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.6);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
  }

  function attractUpdate(dt) {
    if (state.enemies.length < 14 && random() < dt * 2) {
      const kinds = ['mite', 'drifter', 'spinner', 'splitter'];
      const kind = kinds[Math.floor(random() * kinds.length)];
      const def = ENEMIES[kind];
      state.enemies.push({
        kind,
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        vx: (random() - 0.5) * 60,
        vy: (random() - 0.5) * 60,
        hp: def.hp, maxHp: def.hp, radius: def.radius, speed: def.speed,
        score: def.score, angle: random() * TAU, spin: (random() - 0.5) * 2,
        shootTimer: 0, burstTimer: 0, wobble: random() * TAU,
      });
    }
    for (const enemy of state.enemies) {
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle += enemy.spin * dt;
      if (enemy.x < -40) enemy.x = FIELD.width + 40;
      if (enemy.x > FIELD.width + 40) enemy.x = -40;
      if (enemy.y < -40) enemy.y = FIELD.height + 40;
      if (enemy.y > FIELD.height + 40) enemy.y = -40;
    }
    if (random() < dt * 6) {
      burst(random() * FIELD.width, random() * FIELD.height, '#4fc3f7', 3, 60);
    }
  }

  function step(dt, input, attract) {
    state.time += dt;
    updateFx(dt);
    if (attract || state.phase === 'title') {
      attractUpdate(dt);
      return 0;
    }
    if (state.phase === 'over' || state.phase === 'victory') return 0;
    if (state.phase === 'intermission') {
      state.phaseTimer -= dt;
      updateShards(dt);
      if (state.phaseTimer <= 0) startWave(state.wave + 1);
      return 0;
    }
    // phase === 'play'
    let events = 0;
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = spawnInterval(state.wave);
        spawnEnemy(state.spawnQueue.shift());
      }
    }
    updatePlayer(dt, input);
    updateEnemies(dt);
    events |= updateBullets(dt);
    if (events & EVENT_OVER) return events;
    events |= updateEnemyBullets(dt);
    if (events & EVENT_OVER) return events;
    events |= updateContacts(dt);
    if (events & EVENT_OVER) return events;
    events |= updateShards(dt);
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      events |= clearWave();
    }
    return events;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.wave = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.player = makePlayer();
    state.enemies = [];
    state.bullets = [];
    state.ebullets = [];
    state.shards = [];
    state.particles = [];
    state.texts = [];
    state.offer = [];
    state.banner = null;
    state.boss = null;
    state.shake = 0;
    state.flash = 0;
    state.stats = { shots: 0, hits: 0, shards: 0, bombs: 0 };
    startWave(1);
  }

  function applyUpgrade(id) {
    if (state.phase !== 'intermission') return false;
    const upgrade = UPGRADES.find((u) => u.id === id);
    if (!upgrade) return false;
    upgrade.apply(state.player);
    state.offer = [];
    startWave(state.wave + 1);
    return true;
  }

  function detonateBomb() {
    const player = state.player;
    if (state.phase !== 'play' || player.bombs <= 0) return 0;
    player.bombs -= 1;
    state.stats.bombs += 1;
    state.ebullets = [];
    let events = 0;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      enemy.hp -= enemy.kind === 'warden' ? 25 : 6;
      burst(enemy.x, enemy.y, '#ffd166', 8, 240);
      if (enemy.hp <= 0) events |= killEnemy(j);
    }
    state.shake = 22;
    state.flash = 0.5;
    burst(player.x, player.y, '#ffd166', 40, 500);
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      events |= clearWave();
    }
    return EVENT_BOMB | events;
  }

  function continueEndless() {
    if (state.phase !== 'victory') return;
    startWave(state.wave + 1);
  }

  return { state, step, reset, applyUpgrade, detonateBomb, continueEndless, startWave };
}
