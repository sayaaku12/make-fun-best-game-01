// Keyboard + mouse input, read every frame. The world only ever sees a small plain object:
// { moveX, moveY, aimX, aimY, firing, actions } — so the same shape can be faked in Node tests
// and by the screenshot autopilot. Coordinates are logical 1280x720 field coordinates.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_BOMB = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;
export const ACTION_UPGRADE_1 = 32;
export const ACTION_UPGRADE_2 = 64;
export const ACTION_UPGRADE_3 = 128;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyB: ACTION_BOMB,
  KeyR: ACTION_RESTART,
  KeyM: ACTION_MUTE,
  Digit1: ACTION_UPGRADE_1,
  Digit2: ACTION_UPGRADE_2,
  Digit3: ACTION_UPGRADE_3,
  Numpad1: ACTION_UPGRADE_1,
  Numpad2: ACTION_UPGRADE_2,
  Numpad3: ACTION_UPGRADE_3,
};

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 640, y: 300, down: false };
  let actions = 0;

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    mouse.x = (event.clientX - rect.left) * scaleX;
    mouse.y = (event.clientY - rect.top) * scaleY;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action !== undefined) {
      actions |= action;
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    toField(event);
  }

  function onMouseDown(event) {
    toField(event);
    if (event.button === 0) mouse.down = true;
    if (event.button === 2) actions |= ACTION_BOMB;
  }

  function onMouseUp(event) {
    if (event.button === 0) mouse.down = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onBlur);

  return {
    /** The movement + aim the world steps with this frame. */
    state() {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const move = MOVE_KEYS[code];
        if (move) {
          x += move[0];
          y += move[1];
        }
      }
      const len = Math.hypot(x, y);
      if (len > 0) {
        x /= len;
        y /= len;
      }
      return {
        moveX: x,
        moveY: y,
        aimX: mouse.x,
        aimY: mouse.y,
        firing: mouse.down || keys.has('Space'),
      };
    },
    /** One-shot actions since the last call (confirm, pause, bomb, ...). */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
