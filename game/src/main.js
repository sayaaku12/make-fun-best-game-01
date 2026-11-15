// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, intermission (upgrade draft), paused, victory and
// game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BOMB, EVENT_HIT, EVENT_OVER, EVENT_VICTORY, EVENT_WAVE } from './world.js';
import {
  ACTION_BOMB, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART,
  ACTION_UPGRADE_1, ACTION_UPGRADE_2, ACTION_UPGRADE_3, createInput,
} from './input.js';
import { sfx } from './audio.js';
import {
  createRenderer, SCREEN_INTERMISSION, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_VICTORY, upgradeCardRects,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastShots = 0;
  let lastKills = 0;
  let lastShards = 0;
  let lastShardSfx = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    lastShots = 0;
    lastKills = 0;
    lastShards = 0;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1. Blast the swarm.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playSounds(events) {
    if (events & EVENT_HIT) sfx.hit();
    if (events & EVENT_BOMB) sfx.bomb();
    if (events & EVENT_WAVE) sfx.wave();
    if (events & EVENT_VICTORY) sfx.victory();
    if (world.state.stats.shots > lastShots) sfx.shoot();
    if (world.state.stats.kills > lastKills) sfx.explode();
    if (world.state.stats.shards > lastShards && performance.now() - lastShardSfx > 60) {
      sfx.shard();
      lastShardSfx = performance.now();
    }
    lastShots = world.state.stats.shots;
    lastKills = world.state.stats.kills;
    lastShards = world.state.stats.shards;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = sfx.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_BOMB && screen === SCREEN_PLAY) {
      const events = world.detonateBomb();
      if (events) playSounds(events);
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        sfx.unlock();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
      return;
    }
    if (screen === SCREEN_VICTORY) {
      if (actions & ACTION_RESTART) startGame();
      else if (actions & ACTION_CONFIRM) {
        world.continueEndless();
        screen = SCREEN_PLAY;
        announce('Endless mode. The swarm does not stop.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // SCREEN_PLAY or SCREEN_INTERMISSION
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (screen === SCREEN_INTERMISSION) {
      const pick = actions & ACTION_UPGRADE_1 ? 0 : actions & ACTION_UPGRADE_2 ? 1 : actions & ACTION_UPGRADE_3 ? 2 : -1;
      if (pick >= 0 && world.state.offer[pick]) {
        world.applyUpgrade(world.state.offer[pick].id);
        sfx.upgrade();
        screen = SCREEN_PLAY;
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: 640, aimY: 300, firing: false }, true);
      return;
    }
    const events = world.step(STEP, input.state(), false);
    playSounds(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_VICTORY) {
      screen = SCREEN_VICTORY;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      announce(`Champion of the Nova. Score ${world.state.score}.`);
    } else if (world.state.phase === 'intermission' && screen === SCREEN_PLAY) {
      screen = SCREEN_INTERMISSION;
      announce('Wave clear. Choose an upgrade.');
    } else if (world.state.phase === 'play' && screen === SCREEN_INTERMISSION) {
      // The draft timer ran out and the next wave started on its own.
      screen = SCREEN_PLAY;
    } else if (events & EVENT_HIT) {
      announce(world.state.player.hp === 1 ? 'Hit. 1 hull left.' : `Hit. ${world.state.player.hp} hull left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_INTERMISSION) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_INTERMISSION)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Clicks: start on the title, restart on game over, pick an upgrade card in the draft.
  canvas.addEventListener('click', (event) => {
    sfx.unlock();
    if (screen === SCREEN_TITLE) startGame();
    else if (screen === SCREEN_OVER) startGame();
    else if (screen === SCREEN_INTERMISSION) {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (1280 / rect.width);
      const y = (event.clientY - rect.top) * (720 / rect.height);
      const rects = upgradeCardRects();
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && world.state.offer[i]) {
          world.applyUpgrade(world.state.offer[i].id);
          sfx.upgrade();
          screen = SCREEN_PLAY;
          break;
        }
      }
    }
  });

  // Leaving the tab pauses a running game rather than letting the swarm close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Nova Shards. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
