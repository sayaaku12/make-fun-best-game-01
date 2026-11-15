// NOVA SHARDS — everything the player sees, drawn on one 2D canvas. The renderer only reads
// world state; it keeps no game rules. The background (gradient, nebula, stars) is painted once
// to an offscreen canvas at boot, so each frame is cheap: background, shards, orbs, enemies,
// bullets, player, particles, floating text, HUD, banners and the screen overlays.
import { FIELD, ENEMIES, PALETTE, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';
export const SCREEN_INTERMISSION = 'intermission';

const TAU = Math.PI * 2;

/** The three upgrade cards' rectangles, shared by the draw code and the click handler. */
export function upgradeCardRects() {
  const w = 300;
  const h = 150;
  const gap = 28;
  const total = w * 3 + gap * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = 300;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

function poly(ctx, x, y, radius, sides, angle) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = angle + (i / sides) * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scale = { x: 1, y: 1 };

  // The background is painted once: deep-space gradient, three nebula glows, 170 stars.
  const background = document.createElement('canvas');
  background.width = FIELD.width;
  background.height = FIELD.height;
  {
    const b = background.getContext('2d');
    const grad = b.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, '#0a1030');
    grad.addColorStop(0.55, '#070b1a');
    grad.addColorStop(1, '#120a24');
    b.fillStyle = grad;
    b.fillRect(0, 0, FIELD.width, FIELD.height);
    const nebulae = [
      [300, 170, 320, 'rgba(79, 195, 247, 0.10)'],
      [1020, 520, 360, 'rgba(255, 93, 143, 0.09)'],
      [880, 130, 260, 'rgba(179, 136, 255, 0.10)'],
      [180, 580, 240, 'rgba(255, 209, 102, 0.06)'],
    ];
    for (const [x, y, r, color] of nebulae) {
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = g;
      b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Seeded-looking stars without an RNG dependency: a fixed hash of the index.
    for (let i = 0; i < 170; i += 1) {
      const hx = (i * 2654435761) % 1280;
      const hy = (i * 40503) % 720;
      const size = (i % 3) * 0.6 + 0.7;
      b.fillStyle = i % 7 === 0 ? 'rgba(255, 209, 102, 0.9)' : 'rgba(238, 241, 255, 0.75)';
      b.fillRect(hx, hy, size, size);
    }
    // Faint grid, for a sense of motion and scale.
    b.strokeStyle = 'rgba(120, 150, 255, 0.05)';
    b.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 80) {
      b.beginPath();
      b.moveTo(x, 0);
      b.lineTo(x, FIELD.height);
      b.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      b.beginPath();
      b.moveTo(0, y);
      b.lineTo(FIELD.width, y);
      b.stroke();
    }
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    scale.x = canvas.width / FIELD.width;
    scale.y = canvas.height / FIELD.height;
  }

  function drawShip(ctx2, player, time) {
    const p = player;
    ctx2.save();
    ctx2.translate(p.x, p.y);
    ctx2.rotate(p.angle);
    // Engine flame, flickering with time.
    const flame = 16 + Math.sin(time * 32) * 5;
    ctx2.fillStyle = 'rgba(255, 170, 60, 0.85)';
    ctx2.beginPath();
    ctx2.moveTo(-14, 6);
    ctx2.lineTo(-14 - flame, 0);
    ctx2.lineTo(-14, -6);
    ctx2.closePath();
    ctx2.fill();
    // Hull: a sleek dart.
    ctx2.fillStyle = '#eaf6ff';
    ctx2.strokeStyle = '#4fc3f7';
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.moveTo(22, 0);
    ctx2.lineTo(-12, 12);
    ctx2.lineTo(-6, 0);
    ctx2.lineTo(-12, -12);
    ctx2.closePath();
    ctx2.fill();
    ctx2.stroke();
    ctx2.fillStyle = '#4fc3f7';
    ctx2.beginPath();
    ctx2.arc(4, 0, 4, 0, TAU);
    ctx2.fill();
    ctx2.restore();
    if (p.shield > 0) {
      ctx2.strokeStyle = `rgba(105, 240, 174, ${0.5 + 0.3 * Math.sin(time * 8)})`;
      ctx2.lineWidth = 2.5;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, 30, 0, TAU);
      ctx2.stroke();
    }
  }

  function drawEnemy(ctx2, enemy) {
    const def = ENEMIES[enemy.kind];
    const x = enemy.x;
    const y = enemy.y;
    ctx2.save();
    ctx2.translate(x, y);
    // Soft glow halo.
    ctx2.globalAlpha = 0.16;
    ctx2.fillStyle = def.color;
    ctx2.beginPath();
    ctx2.arc(0, 0, enemy.radius * 1.7, 0, TAU);
    ctx2.fill();
    ctx2.globalAlpha = 1;
    ctx2.rotate(enemy.angle);
    ctx2.fillStyle = def.color;
    ctx2.strokeStyle = def.core;
    ctx2.lineWidth = 2;
    if (enemy.kind === 'mite' || enemy.kind === 'mini') {
      poly(ctx2, 0, 0, enemy.radius, 3, 0);
    } else if (enemy.kind === 'drifter') {
      poly(ctx2, 0, 0, enemy.radius, 4, Math.PI / 4);
    } else if (enemy.kind === 'spinner') {
      poly(ctx2, 0, 0, enemy.radius, 6, 0);
      ctx2.fill();
      ctx2.stroke();
      ctx2.rotate(-enemy.angle * 2);
      poly(ctx2, 0, 0, enemy.radius * 0.55, 3, 0);
    } else if (enemy.kind === 'splitter') {
      poly(ctx2, 0, 0, enemy.radius, 4, 0);
    } else if (enemy.kind === 'warden') {
      poly(ctx2, 0, 0, enemy.radius, 8, 0);
      ctx2.fill();
      ctx2.stroke();
      ctx2.rotate(-enemy.angle * 0.5);
      poly(ctx2, 0, 0, enemy.radius * 0.62, 8, 0);
    }
    if (enemy.kind !== 'spinner' && enemy.kind !== 'warden') {
      ctx2.fill();
      ctx2.stroke();
    }
    // Bright core.
    ctx2.fillStyle = def.core;
    ctx2.beginPath();
    ctx2.arc(0, 0, Math.max(3, enemy.radius * 0.28), 0, TAU);
    ctx2.fill();
    ctx2.restore();
    // Health arc for tough enemies.
    if (enemy.maxHp > 2 && enemy.hp < enemy.maxHp) {
      ctx2.strokeStyle = 'rgba(238,241,255,0.85)';
      ctx2.lineWidth = 3;
      ctx2.beginPath();
      ctx2.arc(x, y, enemy.radius + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (enemy.hp / enemy.maxHp));
      ctx2.stroke();
    }
  }

  function drawHud(state, best) {
    const player = state.player;
    // Score, top left.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(state.score).padStart(6, '0'), 24, 18);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`BEST ${Math.max(best, state.score)}`, 24, 58);
    // Combo meter under the score.
    if (state.combo >= 2) {
      const mult = Math.min(5, 1 + state.combo * 0.25);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(`COMBO x${mult.toFixed(2)}`, 24, 82);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
      ctx.fillRect(24, 108, 130, 6);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(24, 108, 130 * (state.comboTimer / 3), 6);
    }
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 22px ${FONT}`;
    const left = state.spawnQueue.length + state.enemies.length;
    ctx.fillText(`WAVE ${Math.max(1, state.wave)}`, FIELD.width / 2, 20);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(state.phase === 'intermission' ? 'CHOOSE AN UPGRADE' : `${left} HOSTILE${left === 1 ? '' : 'S'} LEFT`, FIELD.width / 2, 50);
    // Boss bar.
    if (state.boss) {
      const bw = 420;
      const bx = (FIELD.width - bw) / 2;
      const by = 76;
      ctx.fillStyle = 'rgba(255, 112, 67, 0.25)';
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = '#ff7043';
      ctx.fillRect(bx, by, bw * Math.max(0, state.boss.hp / state.boss.maxHp), 10);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText('THE WARDEN', FIELD.width / 2, 92);
    }
    // Hull hearts + bombs, top right.
    ctx.textAlign = 'right';
    for (let i = 0; i < player.maxHp; i += 1) {
      const x = FIELD.width - 28 - i * 30;
      const y = 34;
      ctx.fillStyle = i < player.hp ? '#ff5d8f' : 'rgba(255, 93, 143, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x, y + 7);
      ctx.lineTo(x - 9, y - 3);
      ctx.arc(x - 4.5, y - 3, 4.5, Math.PI, 0);
      ctx.arc(x + 4.5, y - 3, 4.5, Math.PI, 0);
      ctx.lineTo(x, y + 7);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`BOMBS ${player.bombs}  [B]`, FIELD.width - 24, 56);
    // Controls hint, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(139, 147, 184, 0.8)';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('WASD move · Mouse aim · Hold click to fire · B bomb · P pause · M mute', 24, FIELD.height - 26);
  }

  function drawBanner(state) {
    if (!state.banner) return;
    const alpha = Math.min(1, state.banner.timer * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(state.banner.text, FIELD.width / 2, 240);
    if (state.banner.sub) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 19px ${FONT}`;
      ctx.fillText(state.banner.sub, FIELD.width / 2, 300);
    }
    ctx.restore();
  }

  function drawUpgrades(state) {
    const rects = upgradeCardRects();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText('WAVE CLEAR — CHOOSE AN UPGRADE', FIELD.width / 2, 230);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Next wave in ${Math.ceil(state.phaseTimer)}s — press 1, 2 or 3, or click a card`, FIELD.width / 2, 266);
    state.offer.forEach((upgrade, i) => {
      const r = rects[i];
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, r.x + r.w / 2, r.y + 30);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(upgrade.name, r.x + r.w / 2, r.y + 66);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(upgrade.blurb, r.x + r.w / 2, r.y + 98);
    });
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(4, 7, 18, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 220);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 20px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, 300 + i * 34);
    });
  }

  function draw(state, screen, best) {
    resize();
    ctx.setTransform(scale.x, 0, 0, scale.y, 0, 0);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.drawImage(background, 0, 0);
    // Shards (additive glow).
    ctx.globalCompositeOperation = 'lighter';
    for (const shard of state.shards) {
      const pulse = 0.7 + 0.3 * Math.sin(state.time * 6 + shard.x);
      ctx.fillStyle = `rgba(255, 209, 102, ${pulse})`;
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(state.time * 2 + shard.x);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    // Enemy orbs.
    for (const orb of state.ebullets) {
      ctx.fillStyle = 'rgba(255, 93, 143, 0.9)';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd6e3';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius * 0.45, 0, TAU);
      ctx.fill();
    }
    // Player bullets.
    for (const bullet of state.bullets) {
      ctx.fillStyle = 'rgba(120, 220, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const enemy of state.enemies) drawEnemy(ctx, enemy);
    if (screen !== SCREEN_TITLE && state.phase !== 'title') {
      const blink = state.player.invuln > 0 && Math.floor(state.time * 12) % 2 === 0;
      if (!blink) drawShip(ctx, state.player, state.time);
    }
    // Particles.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Floating score text.
    ctx.textAlign = 'center';
    ctx.font = `800 17px ${FONT}`;
    for (const t of state.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Hit flash.
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 60, 90, ${state.flash * 0.35})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_PLAY || screen === SCREEN_INTERMISSION) drawHud(state, best);
    if (screen === SCREEN_INTERMISSION) drawUpgrades(state);
    drawBanner(state);

    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(4, 7, 18, 0.45)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.textAlign = 'center';
      const grad = ctx.createLinearGradient(340, 0, 940, 0);
      grad.addColorStop(0, '#4fc3f7');
      grad.addColorStop(0.5, '#eef1ff');
      grad.addColorStop(1, '#ffd166');
      ctx.fillStyle = grad;
      ctx.font = `800 88px ${FONT}`;
      ctx.fillText('NOVA SHARDS', FIELD.width / 2, 250);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 22px ${FONT}`;
      ctx.fillText('The swarm is coming. You are the last shard-ship.', FIELD.width / 2, 300);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText('WASD move  ·  Mouse aim  ·  Hold click to fire  ·  B nova bomb  ·  P pause', FIELD.width / 2, 350);
      ctx.fillText('Clear 10 waves. Break the Warden. Become Champion of the Nova.', FIELD.width / 2, 382);
      if (best > 0) {
        ctx.fillStyle = PALETTE.gold;
        ctx.font = `800 20px ${FONT}`;
        ctx.fillText(`BEST ${best}`, FIELD.width / 2, 430);
      }
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 24px ${FONT}`;
      const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
      ctx.globalAlpha = pulse;
      ctx.fillText('PRESS SPACE OR CLICK TO START', FIELD.width / 2, 500);
      ctx.globalAlpha = 1;
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or Space to resume.', 'M toggles sound.']);
    } else if (screen === SCREEN_OVER) {
      const acc = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0;
      overlay('GAME OVER', [
        `Score ${state.score}   ·   Best ${Math.max(best, state.score)}`,
        `Wave ${state.wave}   ·   ${state.kills} kills   ·   ${acc}% accuracy   ·   ${state.stats.shards} shards`,
        '',
        'Press R or click to fly again.',
      ], '#ff5d8f');
    } else if (screen === SCREEN_VICTORY) {
      overlay('CHAMPION OF THE NOVA', [
        `Score ${state.score}   ·   Best ${Math.max(best, state.score)}`,
        `Wave 10 cleared — the swarm is broken.`,
        '',
        'Press C to keep flying (endless) or R to restart.',
      ], '#ffd166');
    }
  }

  window.addEventListener('resize', resize);
  resize();
  return { draw, resize };
}
