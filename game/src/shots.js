// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from
// a fresh world for a fixed number of steps, steered by a simple autopilot (chase the nearest
// enemy, grab nearby shards, sidestep incoming orbs), so the frame is what a short game really
// looks like and the same seed always gives the same frame. The end scene's pilot never moves,
// so it is caught out once the swarm closes in, as a careless player is.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
/** The play scene runs until the frame is busy (or this cap): a screenshot taken in a lull
 * between waves would show an empty field, so the pilot plays until several enemies are on
 * screen with bullets and particles flying, then freezes. */
const PLAY_LIMIT_SECONDS = 40;
const END_LIMIT_SECONDS = 600;
const SAMPLE = 1 / 30;

/** The autopilot's input for one step: move, aim at the nearest enemy, always firing. */
function autopilot(state, careless) {
  const player = state.player;
  if (careless) {
    let aim = { x: player.x, y: player.y - 100 };
    let best = Infinity;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (d < best) {
        best = d;
        aim = enemy;
      }
    }
    return { moveX: 0, moveY: 0, aimX: aim.x, aimY: aim.y, firing: true };
  }
  let mx = 0;
  let my = 0;
  // Dodge the nearest incoming orb.
  let threat = null;
  let threatD = 120;
  for (const orb of state.ebullets) {
    const d = Math.hypot(orb.x - player.x, orb.y - player.y);
    if (d < threatD) {
      threatD = d;
      threat = orb;
    }
  }
  if (threat) {
    const dx = player.x - threat.x;
    const dy = player.y - threat.y;
    const d = Math.hypot(dx, dy) || 1;
    mx += (dx / d) * 1.6;
    my += (dy / d) * 1.6;
  }
  // Chase the nearest shard, else close in on the nearest enemy (but not into it).
  let target = null;
  let targetD = 320;
  for (const shard of state.shards) {
    const d = Math.hypot(shard.x - player.x, shard.y - player.y);
    if (d < targetD) {
      targetD = d;
      target = shard;
    }
  }
  let aim = target;
  if (!target) {
    let best = Infinity;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (d < best) {
        best = d;
        aim = enemy;
      }
    }
    if (aim && best > 170) {
      mx += (aim.x - player.x) / best;
      my += (aim.y - player.y) / best;
    } else if (aim) {
      mx += (player.x - aim.x) / best;
      my += (player.y - aim.y) / best;
    }
  } else {
    mx += (target.x - player.x) / targetD;
    my += (target.y - player.y) / targetD;
  }
  // Stay inside the field.
  if (player.x < 90) mx += 1;
  if (player.x > FIELD.width - 90) mx -= 1;
  if (player.y < 90) my += 1;
  if (player.y > FIELD.height - 90) my -= 1;
  const len = Math.hypot(mx, my) || 1;
  const aimAt = aim ?? { x: player.x, y: player.y - 100 };
  return { moveX: mx / len, moveY: my / len, aimX: aimAt.x, aimY: aimAt.y, firing: true };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: 640, aimY: 300, firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_LIMIT_SECONDS;
  const careless = name === 'end';
  for (let index = 0; index < limit / STEP; index += 1) {
    const input = autopilot(world.state, careless);
    if (world.step(STEP, input, false) & EVENT_OVER) break;
    // The play scene picks the first upgrade when the draft opens, so it keeps playing.
    if (world.state.phase === 'intermission' && world.state.offer.length > 0) {
      world.applyUpgrade(world.state.offer[0].id);
    }
    // Freeze the play scene on a busy frame, never on a between-waves lull.
    if (!careless && world.state.time > 10 && world.state.enemies.length >= 5
      && world.state.bullets.length >= 1 && world.state.particles.length >= 3) break;
  }
  const over = world.state.phase === 'over';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
