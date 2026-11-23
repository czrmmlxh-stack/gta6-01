// Keyboard and mouse input. Held keys give movement; one-shot presses (enter a car, punch,
// pause, confirm) are queued as flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse position is reported in canvas
// pixels; main.js turns it into world coordinates for aiming.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, sprint: false };
  let actions = 0;
  let enterPressed = false;
  let punchPressed = false;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (SPRINT.has(event.code)) held.sprint = true;
    else if (ENTER.has(event.code)) {
      if (!event.repeat) enterPressed = true;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) punchPressed = true;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (SPRINT.has(event.code)) held.sprint = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.sprint = false;
    mouseDown = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** The movement + action state for this frame, in the shape the world steps with. */
    read(aimX, aimY) {
      const input = {
        up: held.up,
        down: held.down,
        left: held.left,
        right: held.right,
        sprint: held.sprint,
        enter: enterPressed,
        punch: punchPressed,
        shoot: mouseDown,
        aimX,
        aimY,
      };
      enterPressed = false;
      punchPressed = false;
      return input;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
  };
}
