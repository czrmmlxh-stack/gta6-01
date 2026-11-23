// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot, so
// the frame is what a short game really looks like and the same seed always gives the same
// frame. The autopilot walks to a car, gets in, and drives the road grid by route-finding;
// the chase scene adds a three-star wanted level first, so the police are already on it.

import { STEP } from './config.js';
import { WANTED } from './config.js';
import { createRandom } from './random.js';
import { findRoute, intersectionPoint, nearestIntersection } from './city.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SHOT_SEED = 20261123;
const START_SECONDS = 6;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 20;
const END_LIMIT_SECONDS = 95;

const TAU = Math.PI * 2;

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * An autopilot that plays Sunvale: on foot it walks to the nearest parked car and gets in;
 * in a car it follows a route of intersections toward a destination. It keeps a route, a
 * stuck timer and a small seeded random source, so it behaves the same every run.
 */
function createAutopilot(worldObj, destination) {
  const random = createRandom(SHOT_SEED);
  let route = null;
  let routeIndex = 0;
  let stuckTimer = 0;
  let reversing = 0;
  let lastX = 0;
  let lastY = 0;
  let lastCheck = 0;

  function retarget(fromIx, fromIy) {
    let to = destination || { ix: random.int(0, 7), iy: random.int(0, 7) };
    // A route to the intersection we are already on has a single point, which leaves no
    // waypoint to drive toward: pick another destination until the route has some length.
    let guard = 0;
    while (to.ix === fromIx && to.iy === fromIy && guard < 8) {
      to = { ix: random.int(0, 7), iy: random.int(0, 7) };
      guard += 1;
    }
    route = findRoute({ ix: fromIx, iy: fromIy }, to);
    routeIndex = 1;
  }

  function driveInput(state, dt) {
    const player = state.player;
    const car = player.inCar;
    if (!route || routeIndex >= route.length) {
      const here = nearestIntersection(car.x, car.y);
      retarget(here.ix, here.iy);
    }
    // Look ahead only when almost at the waypoint, so the car does not cut the corner
    // across a block and into a building.
    let target = route[routeIndex];
    let d = dist(car.x, car.y, target.x, target.y);
    if (d < 60 && routeIndex + 1 < route.length) {
      target = route[routeIndex + 1];
      d = dist(car.x, car.y, target.x, target.y);
    }
    if (d < 70) {
      routeIndex += 1;
      return { up: true, down: false, left: false, right: false, sprint: false, enter: false, punch: false, shoot: false };
    }
    // Stuck? Reverse for a second, then carry on.
    if (state.time - lastCheck > 1) {
      const moved = dist(car.x, car.y, lastX, lastY);
      if (moved < 12 && Math.abs(car.speed) < 40) stuckTimer += 1;
      else stuckTimer = 0;
      lastX = car.x;
      lastY = car.y;
      lastCheck = state.time;
    }
    if (stuckTimer >= 2) {
      reversing = 1;
      stuckTimer = 0;
    }
    if (reversing > 0) {
      reversing -= dt;
      return { up: false, down: true, left: true, right: false, sprint: false, enter: false, punch: false, shoot: false };
    }
    const desired = angleTo(car.x, car.y, target.x, target.y);
    const diff = angleDiff(car.angle, desired);
    // Keep the speed moderate, and brake hard near a waypoint and for sharp turns, so the
    // car is slow enough to swing around an intersection instead of overshooting it. Near a
    // waypoint the car crawls: at speed its turning circle is wider than the waypoint's
    // radius, so it would orbit the point forever instead of reaching it.
    const sharp = Math.abs(diff) > 0.6;
    const nearWaypoint = d < 180;
    const cruise = nearWaypoint ? 60 : 340;
    return {
      up: Math.abs(car.speed) < cruise,
      down: (sharp && Math.abs(car.speed) > 90) || (nearWaypoint && Math.abs(car.speed) > cruise),
      left: diff < -0.08,
      right: diff > 0.08,
      sprint: false,
      enter: false,
      punch: false,
      shoot: false,
    };
  }

  // The on-foot route: a list of intersections to walk, so the pilot stays on the roads
  // instead of cutting across blocks and getting stuck on buildings.
  let walkRoute = null;
  let walkIndex = 0;
  let walkTarget = null;

  function moveToward(px, py, tx, ty, enter) {
    const dx = tx - px;
    const dy = ty - py;
    return {
      up: dy < -12,
      down: dy > 12,
      left: dx < -12,
      right: dx > 12,
      sprint: Math.hypot(dx, dy) > 200,
      enter,
      punch: false,
      shoot: false,
    };
  }

  function walkInput(state) {
    const player = state.player;
    // Parked cars do not move, so they are the reliable target.
    let best = null;
    let bestD = Infinity;
    for (const car of state.cars) {
      if (car.wreck || car.kind !== 'parked') continue;
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return { up: false, down: false, left: false, right: false, sprint: false, enter: false, punch: false, shoot: false };
    // Close in: walk straight at the car and get in.
    if (bestD < 90) {
      walkRoute = null;
      return moveToward(player.x, player.y, best.x, best.y, bestD < 50);
    }
    // Otherwise follow the road grid to the car's intersection.
    if (!walkRoute || walkTarget !== best) {
      walkTarget = best;
      const from = nearestIntersection(player.x, player.y);
      const to = nearestIntersection(best.x, best.y);
      walkRoute = findRoute(from, to);
      walkIndex = 0;
    }
    if (walkIndex >= walkRoute.length) {
      walkRoute = null;
      return moveToward(player.x, player.y, best.x, best.y, bestD < 50);
    }
    const wp = walkRoute[walkIndex];
    if (dist(player.x, player.y, wp.x, wp.y) < 60) {
      walkIndex += 1;
      return walkInput(state);
    }
    return moveToward(player.x, player.y, wp.x, wp.y, false);
  }

  return {
    input(state, dt) {
      const player = state.player;
      if (player.inCar) return driveInput(state, dt);
      return walkInput(state);
    },
  };
}

/**
 * Set `worldObj` to the named scene (start, play, chase or end; any other name is start)
 * and return the screen to draw over it.
 */
export function stageShot(name, worldObj) {
  const state = worldObj.state;
  worldObj.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      worldObj.step(STEP, { up: false, down: false, left: false, right: false, sprint: false, enter: false, punch: false, shoot: false });
    }
    return { screen: SCREEN_TITLE };
  }

  if (name === 'chase') {
    // Three stars before the drive starts, so the police are already closing in.
    state.wantedHeat = 3 * WANTED.starsPerHeat;
    state.lastCrimeAt = 0;
  }
  const pilot = createAutopilot(worldObj, name === 'end' ? { ix: 5, iy: 4 } : null);
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'chase' ? CHASE_SECONDS : PLAY_SECONDS;
  let missionDone = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    worldObj.step(STEP, pilot.input(state, STEP));
    if (name === 'end' && state.missionIndex >= 1) {
      missionDone = true;
      break;
    }
    if (state.gameOver) break;
  }
  if (name === 'end' && missionDone) {
    // A couple of seconds more so the mission-complete banner is on screen.
    for (let i = 0; i < 2 / STEP; i += 1) {
      worldObj.step(STEP, { up: false, down: false, left: false, right: false, sprint: false, enter: false, punch: false, shoot: false });
    }
  }
  return { screen: state.gameOver ? SCREEN_OVER : SCREEN_PLAY };
}

export { SHOT_SEED };
