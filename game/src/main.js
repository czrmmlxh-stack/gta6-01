// Sunvale — boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over. Progress
// (money, missions, pistol) is saved to localStorage when a mission completes and on game over.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import { MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSaveData()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { best: 0, hasSave: false, missionsDone: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let save = readSave();
  let best = save ? save.money || 0 : 0;
  let missionsDone = save ? save.missionsDone || 0 : 0;
  let accumulator = 0;
  let last = performance.now();
  let savedMissions = world.state.stats.missionsDone;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
      save = null;
    } else if (save) {
      world.reset();
      world.applySave(save);
    } else {
      world.reset();
    }
    savedMissions = world.state.stats.missionsDone;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing in Sunvale. ${MISSIONS[0].title}: ${MISSIONS[0].objective}.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    const money = world.state.player.money;
    if (money > best) best = money;
    missionsDone = world.state.stats.missionsDone;
    writeSave();
    audio.play(world.state.gameOver === 'busted' ? 'busted' : 'wasted');
    audio.setEngine(0);
    audio.setSiren(false);
    announce(`Game over — ${world.state.gameOver}. Money $${money}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startGame(false);
      else if (screen === SCREEN_OVER) startGame(true);
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    // Continue a saved story from the title screen.
    if (screen === SCREEN_TITLE && save) {
      // The C key is read through the same key handler as a confirm; main checks it here.
      if (window.__continuePressed) {
        window.__continuePressed = false;
        startGame(false);
      }
    }
  }

  function playEvents(events) {
    for (const event of events) {
      if (event === 'mission') {
        audio.play('mission');
        writeSave();
      } else if (event === 'missionFail') audio.play('missionFail');
      else audio.play(event);
    }
    // Continuous sounds follow the state.
    const player = world.state.player;
    audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / 620 : 0);
    audio.setSiren(world.stars() > 0 && screen === SCREEN_PLAY);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The city lives behind the title: traffic and pedestrians move, nobody plays.
      world.step(STEP, { up: false, down: false, left: false, right: false, sprint: false, enter: false, punch: false, shoot: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const mouse = input.mouse();
    const rect = canvas.getBoundingClientRect();
    // Aim in world coordinates: the mouse on screen, through the camera.
    const cam = world.state.camera;
    const aimX = cam.x + (mouse.x - rect.width / 2);
    const aimY = cam.y + (mouse.y - rect.height / 2);
    const frameInput = input.read(aimX, aimY);
    const events = world.step(STEP, frameInput);
    playEvents(events);
    if (world.state.gameOver) endGame();
    else if (world.state.stats.missionsDone > savedMissions) {
      savedMissions = world.state.stats.missionsDone;
      missionsDone = savedMissions;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { best, hasSave: !!save, missionsDone });
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The C key continues a saved story from the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && save && !event.repeat) {
      window.__continuePressed = true;
    }
  });

  announce('Sunvale. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
