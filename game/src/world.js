// Sunvale's simulation: the player on foot and in a car, traffic, pedestrians, the police,
// the wanted level, three story missions, combat and particles. Everything the renderer draws
// comes from here; everything the player does flows through step() as an input object.
//
// Input: { up, down, left, right, sprint, enter, punch, shoot, aimX, aimY } — the keyboard
// module builds it from real keys, the screenshot scenes build it from an autopilot, so a
// staged scene plays the same rules as a live game.

import { CAR, MISSIONS, PARKED, PEDS, PLAYER, POLICE, TRAFFIC, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import {
  createCity,
  findRoute,
  hitsBuilding,
  intersectionPoint,
  nearestIntersection,
  nearestRoadPoint,
  resolveBuildingCollision,
} from './city.js';

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// The story's named places, as grid intersections.
const PLACES = {
  start: { ix: 1, iy: 1 },
  garage: { ix: 5, iy: 4 },
  docks: { ix: 7, iy: 7 },
  motel: { ix: 1, iy: 6 },
  safehouse: { ix: 2, iy: 2 },
  pistol: { ix: 1, iy: 2 },
};

function placePoint(name) {
  return intersectionPoint(PLACES[name].ix, PLACES[name].iy);
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const world = {
    seed,
    time: 0,
    city,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    pickups: [],
    wantedHeat: 0,
    lastCrimeAt: -100,
    missionIndex: 0,
    missionStage: 0,
    missionTimer: 0,
    missionBanner: null,
    bannerTimer: 0,
    camera: { x: 0, y: 0, shake: 0 },
    gameOver: null,
    stats: { missionsDone: 0, crimes: 0, carsStolen: 0 },
    events: [],
    policeRetarget: 0,
  };

  function makeCar(x, y, angle, color, kind) {
    return {
      x,
      y,
      angle,
      speed: 0,
      color,
      kind,
      health: CAR.health,
      wreck: false,
      route: null,
      routeIndex: 0,
      driver: kind === 'traffic',
      lane: 20,
      ramCooldown: 0,
    };
  }

  function randomRoute(ix, iy) {
    // A route to the intersection the car is already on has a single point, which leaves
    // no waypoint to drive toward: pick another destination until the route has length.
    let to = { ix: random.int(0, WORLD.roadCount - 1), iy: random.int(0, WORLD.roadCount - 1) };
    let guard = 0;
    while (to.ix === ix && to.iy === iy && guard < 8) {
      to = { ix: random.int(0, WORLD.roadCount - 1), iy: random.int(0, WORLD.roadCount - 1) };
      guard += 1;
    }
    return findRoute({ ix, iy }, to);
  }

  function randomSidewalkPoint(x, y) {
    const road = nearestRoadPoint(x, y);
    const side = random.chance(0.5) ? 1 : -1;
    const horizontal = Math.abs(road.x - x) < Math.abs(road.y - y);
    return {
      x: road.x + (horizontal ? random.range(-160, 160) : side * 56),
      y: road.y + (horizontal ? side * 56 : random.range(-160, 160)),
    };
  }

  function spawnPlayer() {
    const p = placePoint('start');
    // On the intersection itself, on the road, so the player starts in the open.
    world.player = {
      x: p.x,
      y: p.y,
      angle: -Math.PI / 2,
      speed: 0,
      health: PLAYER.health,
      money: 0,
      hasPistol: false,
      inCar: null,
      fireCooldown: 0,
      punchCooldown: 0,
      invulnerable: 0,
      moving: false,
    };
    world.camera.x = world.player.x;
    world.camera.y = world.player.y;
  }

  function spawnParkedCars() {
    for (let i = 0; i < PARKED.count; i += 1) {
      const ix = random.int(0, WORLD.roadCount - 1);
      const iy = random.int(0, WORLD.roadCount - 1);
      const pt = intersectionPoint(ix, iy);
      const alongRoad = random.chance(0.5);
      const offset = random.range(60, 300) * (random.chance(0.5) ? 1 : -1);
      const x = alongRoad ? pt.x + offset : pt.x + (random.chance(0.5) ? 44 : -44);
      const y = alongRoad ? pt.y + (random.chance(0.5) ? 44 : -44) : pt.y + offset;
      world.cars.push(makeCar(x, y, random.range(0, TAU), random.pick(['#c0392b', '#2471a3', '#d4ac0d', '#1e8449', '#6c3483', '#e67e22', '#2e86c1', '#b03a2e', '#117a65', '#7d3c98']), 'parked'));
    }
  }

  function spawnTrafficCar() {
    const ix = random.int(0, WORLD.roadCount - 1);
    const iy = random.int(0, WORLD.roadCount - 1);
    const pt = intersectionPoint(ix, iy);
    const horizontal = random.chance(0.5);
    const dir = random.chance(0.5) ? 1 : -1;
    const angle = horizontal ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const car = makeCar(pt.x, pt.y, angle, random.pick(['#c0392b', '#2471a3', '#d4ac0d', '#1e8449', '#6c3483', '#e67e22', '#2e86c1', '#b03a2e', '#117a65', '#7d3c98']), 'traffic');
    car.speed = TRAFFIC.speed * random.range(0.85, 1.1);
    car.route = randomRoute(ix, iy);
    car.routeIndex = 1;
    world.cars.push(car);
  }

  function spawnPed() {
    const ix = random.int(0, WORLD.roadCount - 1);
    const iy = random.int(0, WORLD.roadCount - 1);
    const pt = intersectionPoint(ix, iy);
    const ped = {
      x: pt.x + random.range(-120, 120),
      y: pt.y + random.range(-120, 120),
      angle: random.range(0, TAU),
      speed: random.range(40, 70),
      state: 'walk',
      color: random.pick(['#e8a13c', '#4a90d8', '#7ac74f', '#d86ab0', '#8a5fd8', '#e8e8e8', '#3cb8a0']),
      target: null,
      fleeTimer: 0,
      dead: false,
      deadTimer: 0,
    };
    ped.target = randomSidewalkPoint(ped.x, ped.y);
    world.peds.push(ped);
  }

  function spawnPickup(kind, x, y, amount) {
    world.pickups.push({ kind, x, y, amount, bob: random.range(0, TAU) });
  }

  function reset() {
    world.time = 0;
    world.cars = [];
    world.peds = [];
    world.cops = [];
    world.bullets = [];
    world.particles = [];
    world.pickups = [];
    world.wantedHeat = 0;
    world.lastCrimeAt = -100;
    world.missionIndex = 0;
    world.missionStage = 0;
    world.missionTimer = 0;
    world.missionBanner = null;
    world.bannerTimer = 0;
    world.gameOver = null;
    world.stats = { missionsDone: 0, crimes: 0, carsStolen: 0 };
    world.events = [];
    world.policeRetarget = 0;
    spawnPlayer();
    spawnParkedCars();
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    const pistol = placePoint('pistol');
    spawnPickup('pistol', pistol.x + 60, pistol.y + 60, 0);
    for (let i = 0; i < 4; i += 1) {
      const pt = randomSidewalkPoint(random.range(400, 2800), random.range(400, 2800));
      spawnPickup('cash', pt.x, pt.y, random.int(20, 50));
    }
    spawnPickup('health', 1000, 1000, 30);
  }

  function stars() {
    return clamp(Math.floor(world.wantedHeat / WANTED.starsPerHeat), 0, WANTED.maxStars);
  }

  function commitCrime(heat) {
    world.wantedHeat = clamp(world.wantedHeat + heat, 0, WANTED.maxStars * WANTED.starsPerHeat + 20);
    world.lastCrimeAt = world.time;
    world.stats.crimes += 1;
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, TAU);
      const s = random.range(speed * 0.3, speed);
      world.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: random.range(life * 0.5, life),
        maxLife: life,
        color,
        size: random.range(size * 0.6, size * 1.4),
      });
    }
  }

  function explodeCar(car) {
    car.wreck = true;
    car.speed = 0;
    addParticles(car.x, car.y, 26, '#ff9a3c', 260, 0.9, 7);
    addParticles(car.x, car.y, 18, '#5a5a5a', 140, 1.4, 10);
    addParticles(car.x, car.y, 10, '#ffd94a', 320, 0.5, 5);
    world.camera.shake = Math.max(world.camera.shake, 14);
    world.events.push('explosion');
    if (world.player.inCar === car) {
      damagePlayer(15);
      world.player.inCar = null;
    }
  }

  function damagePlayer(amount) {
    if (world.player.invulnerable > 0 || world.gameOver) return;
    world.player.health -= amount;
    world.player.invulnerable = 0.4;
    world.camera.shake = Math.max(world.camera.shake, 6);
    if (world.player.health <= 0) {
      world.player.health = 0;
      world.gameOver = 'wasted';
      world.events.push('wasted');
    }
  }

  function missionTarget() {
    if (world.missionIndex >= MISSIONS.length) return null;
    if (world.missionIndex === 0) {
      if (world.missionStage === 0) return null; // any car will do
      return { ...placePoint('garage'), label: 'Garage' };
    }
    if (world.missionIndex === 1) {
      if (world.missionStage === 0) return { ...placePoint('docks'), label: 'The Package' };
      return { ...placePoint('motel'), label: 'Palm Motel' };
    }
    return { ...placePoint('safehouse'), label: 'Safehouse' };
  }

  function completeMission() {
    const mission = MISSIONS[world.missionIndex];
    world.player.money += mission.reward;
    world.stats.missionsDone += 1;
    world.missionBanner = `MISSION COMPLETE — ${mission.title}  +$${mission.reward}`;
    world.bannerTimer = 3.5;
    world.events.push('mission');
    world.missionIndex += 1;
    world.missionStage = 0;
    world.missionTimer = 0;
    if (world.missionIndex === 2) {
      world.wantedHeat = 3 * WANTED.starsPerHeat;
      world.lastCrimeAt = world.time;
      world.missionBanner = 'THE DRAGNET IS OUT — lose the cops, reach the safehouse';
      world.bannerTimer = 4;
    }
  }

  function failMission(reason) {
    world.missionBanner = `MISSION FAILED — ${reason}`;
    world.bannerTimer = 3;
    world.events.push('missionFail');
    world.missionStage = 0;
    world.missionTimer = 0;
  }

  function updateMissions(dt) {
    if (world.gameOver || world.missionIndex >= MISSIONS.length) return;
    const player = world.player;
    if (world.missionIndex === 0) {
      if (world.missionStage === 0 && player.inCar) {
        world.missionStage = 1;
        world.missionBanner = 'Nice wheels. Now drive to the garage on Marlow Ave.';
        world.bannerTimer = 3;
      } else if (world.missionStage === 1) {
        const g = placePoint('garage');
        if (dist(player.x, player.y, g.x, g.y) < 70 && player.inCar) completeMission();
      }
      return;
    }
    if (world.missionIndex === 1) {
      if (world.missionStage === 0) {
        const d = placePoint('docks');
        if (!player.inCar && dist(player.x, player.y, d.x, d.y) < 55) {
          world.missionStage = 1;
          world.missionTimer = 90;
          commitCrime(WANTED.shoot);
          world.missionBanner = 'Package grabbed — the harbour crew called the cops. Deliver it fast!';
          world.bannerTimer = 3.5;
        }
      } else {
        world.missionTimer -= dt;
        const m = placePoint('motel');
        if (dist(player.x, player.y, m.x, m.y) < 70) {
          completeMission();
        } else if (world.missionTimer <= 0) {
          failMission('the delivery was too slow');
        }
      }
      return;
    }
    // Mission 2: the dragnet. Reaching the safehouse only counts once the heat is gone.
    const s = placePoint('safehouse');
    const near = dist(player.x, player.y, s.x, s.y) < 220;
    if (near && stars() === 0) completeMission();
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of world.cars) {
      if (car.wreck) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    const player = world.player;
    if (car.kind === 'traffic' && car.driver) {
      // The driver bails out and runs.
      car.driver = false;
      world.peds.push({
        x: car.x + 30,
        y: car.y + 30,
        angle: random.range(0, TAU),
        speed: 120,
        state: 'flee',
        color: '#e8a13c',
        target: randomSidewalkPoint(car.x + 200, car.y + 200),
        fleeTimer: 4,
        dead: false,
        deadTimer: 0,
      });
      commitCrime(WANTED.stealCar);
      world.stats.carsStolen += 1;
      world.events.push('steal');
    } else if (car.kind === 'parked') {
      commitCrime(WANTED.stealCar);
      world.stats.carsStolen += 1;
      world.events.push('steal');
    }
    car.kind = 'player';
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  }

  function exitCar() {
    const player = world.player;
    const car = player.inCar;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    player.x = car.x + Math.cos(player.angle + Math.PI / 2) * 44;
    player.y = car.y + Math.sin(player.angle + Math.PI / 2) * 44;
    // The spot beside the car can be inside a building: push the player out of it.
    resolveBuildingCollision(world.city, player, PLAYER.radius);
    player.inCar = null;
    player.speed = 0;
  }

  function updatePlayer(dt, input) {
    const player = world.player;
    if (world.gameOver) return;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    if (input.enter) {
      if (player.inCar) exitCar();
      else {
        const car = nearestCar(player.x, player.y, PLAYER.enterRange);
        if (car) enterCar(car);
      }
    }

    if (player.inCar) {
      updatePlayerCar(dt, input);
      return;
    }

    // On foot.
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    player.moving = len > 0;
    if (len > 0) {
      mx /= len;
      my /= len;
      const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      player.x += mx * speed * dt;
      player.y += my * speed * dt;
      player.angle = Math.atan2(my, mx);
      resolveBuildingCollision(world.city, player, PLAYER.radius);
      player.x = clamp(player.x, 170, WORLD.size - 170);
      player.y = clamp(player.y, 170, WORLD.size - 170);
    }

    // Punch: a short arc in front of the player.
    if (input.punch && player.punchCooldown <= 0) {
      player.punchCooldown = 0.45;
      world.events.push('punch');
      const hit = hitInArc(player.x, player.y, player.angle, PLAYER.punchRange, PLAYER.punchArc, PLAYER.punchDamage);
      if (hit) {
        addParticles(player.x + Math.cos(player.angle) * 34, player.y + Math.sin(player.angle) * 34, 6, '#ffd94a', 160, 0.4, 4);
        world.camera.shake = Math.max(world.camera.shake, 3);
      }
    }

    // Shoot toward the mouse (or the facing direction when no aim is given).
    if (input.shoot && player.hasPistol && player.fireCooldown <= 0) {
      player.fireCooldown = PLAYER.fireInterval;
      const aim = input.aimX !== undefined ? angleTo(player.x, player.y, input.aimX, input.aimY) : player.angle;
      player.angle = aim;
      world.bullets.push({
        x: player.x + Math.cos(aim) * 22,
        y: player.y + Math.sin(aim) * 22,
        vx: Math.cos(aim) * PLAYER.bulletSpeed,
        vy: Math.sin(aim) * PLAYER.bulletSpeed,
        life: 0.9,
        from: 'player',
      });
      world.events.push('shot');
      commitCrime(WANTED.shoot);
      world.camera.shake = Math.max(world.camera.shake, 2);
    }

    // Pickups.
    for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
      const pk = world.pickups[i];
      if (dist(player.x, player.y, pk.x, pk.y) < 34) {
        if (pk.kind === 'cash') {
          player.money += pk.amount;
          world.events.push('cash');
          addParticles(pk.x, pk.y, 8, '#7ddc7d', 120, 0.5, 4);
        } else if (pk.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + pk.amount);
          world.events.push('health');
          addParticles(pk.x, pk.y, 8, '#58c96b', 120, 0.5, 4);
        } else if (pk.kind === 'pistol') {
          player.hasPistol = true;
          world.events.push('cash');
          world.missionBanner = 'Pistol picked up — click to shoot';
          world.bannerTimer = 2.5;
        }
        world.pickups.splice(i, 1);
      }
    }
  }

  function hitInArc(x, y, angle, range, arc, damage) {
    let hitAnything = false;
    const hitOne = (tx, ty) => {
      const d = dist(x, y, tx, ty);
      if (d > range + 14) return false;
      return Math.abs(angleDiff(angle, angleTo(x, y, tx, ty))) < arc;
    };
    for (const ped of world.peds) {
      if (ped.dead) continue;
      if (hitOne(ped.x, ped.y)) {
        ped.dead = true;
        ped.deadTimer = 0;
        commitCrime(WANTED.killPed);
        hitAnything = true;
      }
    }
    for (const cop of world.cops) {
      if (hitOne(cop.x, cop.y)) {
        cop.health -= damage;
        cop.x += Math.cos(angle) * 26;
        cop.y += Math.sin(angle) * 26;
        commitCrime(WANTED.punchPed);
        hitAnything = true;
      }
    }
    for (const car of world.cars) {
      if (car.kind === 'traffic' || car.kind === 'police') {
        if (hitOne(car.x, car.y)) {
          car.health -= damage;
          if (car.health <= 0 && !car.wreck) explodeCar(car);
          hitAnything = true;
        }
      }
    }
    return hitAnything;
  }

  function updatePlayerCar(dt, input) {
    const player = world.player;
    const car = player.inCar;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (input.up) car.speed += CAR.accel * dt;
    if (input.down) {
      if (car.speed > 20) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    car.speed -= car.speed * CAR.drag * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    if (!input.up && !input.down) car.speed *= Math.max(0, 1 - 1.6 * dt);

    // A good turn even at a standstill, so a car can swing around an intersection instead
    // of being stuck facing the wrong way; the rate still grows a little with speed.
    const turn = steer * CAR.turnRate * clamp(Math.abs(car.speed) / 260, 0.45, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += turn * dt;

    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const hit = resolveBuildingCollision(world.city, car, CAR.length / 2 - 6);
    if (hit) {
      if (Math.abs(car.speed) > 240) {
        world.events.push('crash');
        addParticles(car.x, car.y, 10, '#ffd94a', 200, 0.5, 5);
        world.camera.shake = Math.max(world.camera.shake, 7);
        car.health -= 6;
        damagePlayer(2);
      }
      car.speed *= 0.55;
    }
    car.x = clamp(car.x, 170, WORLD.size - 170);
    car.y = clamp(car.y, 170, WORLD.size - 170);

    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = Math.abs(car.speed);

    // Dust when tearing along.
    if (Math.abs(car.speed) > 380 && random.chance(0.3)) {
      addParticles(car.x - Math.cos(car.angle) * 30, car.y - Math.sin(car.angle) * 30, 1, '#c9b489', 40, 0.6, 5);
    }

    // Running over a pedestrian is a crime.
    for (const ped of world.peds) {
      if (ped.dead) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 34 && Math.abs(car.speed) > 60) {
        ped.dead = true;
        ped.deadTimer = 0;
        commitCrime(WANTED.killPed);
        addParticles(ped.x, ped.y, 8, '#e5534b', 180, 0.6, 5);
        world.camera.shake = Math.max(world.camera.shake, 5);
      }
    }
    if (car.health <= 0 && !car.wreck) explodeCar(car);
  }

  function driveCarToward(car, tx, ty, dt, maxSpeed) {
    const desired = angleTo(car.x, car.y, tx, ty);
    const diff = angleDiff(car.angle, desired);
    const steer = clamp(diff * 2.2, -1, 1);
    car.angle += steer * CAR.turnRate * 0.8 * dt * (car.speed < 0 ? -1 : 1);
    if (Math.abs(diff) < 1.4) car.speed += CAR.accel * 0.7 * dt;
    else car.speed *= Math.max(0, 1 - 1.2 * dt);
    car.speed = clamp(car.speed, 0, maxSpeed);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const hit = resolveBuildingCollision(world.city, car, CAR.length / 2 - 6);
    if (hit) {
      car.speed *= 0.5;
      car.angle += 0.4;
    }
    car.x = clamp(car.x, 170, WORLD.size - 170);
    car.y = clamp(car.y, 170, WORLD.size - 170);
  }

  function updateTraffic(dt) {
    for (const car of world.cars) {
      if (car.kind !== 'traffic' || car.wreck) continue;
      if (!car.route || car.routeIndex >= car.route.length) {
        const here = nearestIntersection(car.x, car.y);
        car.route = randomRoute(here.ix, here.iy);
        car.routeIndex = 1;
      }
      const target = car.route[car.routeIndex];
      if (!target) continue; // a one-point route has no waypoint; it is re-routed next step
      // Stay in the right-hand lane: offset the waypoint sideways.
      const heading = angleTo(car.x, car.y, target.x, target.y);
      const lx = target.x + Math.cos(heading + Math.PI / 2) * car.lane;
      const ly = target.y + Math.sin(heading + Math.PI / 2) * car.lane;
      driveCarToward(car, lx, ly, dt, TRAFFIC.speed);
      if (dist(car.x, car.y, target.x, target.y) < 46) car.routeIndex += 1;
    }
  }

  function updatePeds(dt) {
    for (const ped of world.peds) {
      if (ped.dead) {
        ped.deadTimer += dt;
        continue;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const away = angleTo(world.player.x, world.player.y, ped.x, ped.y);
        ped.x += Math.cos(away) * ped.speed * 2.1 * dt;
        ped.y += Math.sin(away) * ped.speed * 2.1 * dt;
        ped.angle = away;
        resolveBuildingCollision(world.city, ped, 12);
        if (ped.fleeTimer <= 0) ped.state = 'walk';
        continue;
      }
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
        ped.target = randomSidewalkPoint(ped.x, ped.y);
      }
      const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = a;
      ped.x += Math.cos(a) * ped.speed * dt;
      ped.y += Math.sin(a) * ped.speed * dt;
      resolveBuildingCollision(world.city, ped, 12);
      // A gunshot nearby sends everyone running.
      if (world.events.includes('shot') && dist(ped.x, ped.y, world.player.x, world.player.y) < 420) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
    }
    // The dead are cleared after a while so the street does not fill up.
    world.peds = world.peds.filter((p) => !p.dead || p.deadTimer < 20);
    if (world.peds.length < PEDS.count && random.chance(dt * 0.5)) spawnPed();
  }

  function nearestCopSpawn() {
    const player = world.player;
    const angle = random.range(0, TAU);
    const road = nearestRoadPoint(
      player.x + Math.cos(angle) * POLICE.spawnDistance,
      player.y + Math.sin(angle) * POLICE.spawnDistance,
    );
    return { x: clamp(road.x, 180, WORLD.size - 180), y: clamp(road.y, 180, WORLD.size - 180) };
  }

  function updatePolice(dt) {
    const want = stars();
    const player = world.player;

    // Spawn police cars up to the wanted level.
    const policeCars = world.cars.filter((c) => c.kind === 'police' && !c.wreck);
    if (want >= 1 && policeCars.length < Math.min(want, 3)) {
      const spot = nearestCopSpawn();
      const car = makeCar(spot.x, spot.y, angleTo(spot.x, spot.y, player.x, player.y), '#2c3e50', 'police');
      car.speed = 200;
      world.cars.push(car);
      world.events.push('siren');
    }
    // The heat is off: the police give up and leave.
    if (want === 0) {
      world.cars = world.cars.filter((c) => c.kind !== 'police');
    }
    // Despawn far police.
    world.cars = world.cars.filter((c) => {
      if (c.kind === 'police' && !c.wreck && dist(c.x, c.y, player.x, player.y) > POLICE.despawnDistance) return false;
      return true;
    });

    // Foot cops only chase a player on foot: a car outruns them, so when the player is
    // driving there is nobody to drag out of the car — the police cars do the chasing.
    if (player.inCar) {
      world.cops = [];
    } else if (want >= 1 && world.cops.length < Math.min(want, 3)) {
      const spot = nearestCopSpawn();
      world.cops.push({ x: spot.x, y: spot.y, angle: 0, health: 50, bust: 0 });
    }
    for (let i = world.cops.length - 1; i >= 0; i -= 1) {
      const cop = world.cops[i];
      if (want === 0 || dist(cop.x, cop.y, player.x, player.y) > POLICE.despawnDistance) {
        world.cops.splice(i, 1);
        continue;
      }
      if (cop.health <= 0) {
        world.cops.splice(i, 1);
        continue;
      }
      const a = angleTo(cop.x, cop.y, player.x, player.y);
      cop.angle = a;
      cop.x += Math.cos(a) * POLICE.footSpeed * dt;
      cop.y += Math.sin(a) * POLICE.footSpeed * dt;
      resolveBuildingCollision(world.city, cop, 12);
      // Arrest: a cop that stays on top of the player busts them. (Foot cops only exist
      // while the player is on foot, so this is always an on-foot arrest.)
      if (dist(cop.x, cop.y, player.x, player.y) < 30) {
        cop.bust += dt;
        if (cop.bust >= POLICE.bustTime) {
          world.gameOver = 'busted';
          world.events.push('busted');
        }
      } else {
        cop.bust = Math.max(0, cop.bust - dt * 2);
      }
    }

    // Police cars chase: re-route to the player every couple of seconds.
    world.policeRetarget -= dt;
    if (world.policeRetarget <= 0) {
      world.policeRetarget = 1.5;
      const target = nearestIntersection(player.x, player.y);
      for (const car of world.cars) {
        if (car.kind !== 'police' || car.wreck) continue;
        const here = nearestIntersection(car.x, car.y);
        car.route = findRoute(here, target);
        car.routeIndex = 1;
      }
    }
    for (const car of world.cars) {
      if (car.kind !== 'police' || car.wreck) continue;
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < 120) {
        // Close in and ram — but a ram lands at most once a second per police car, so
        // three of them cannot grind the player's car down by leaning on it.
        car.ramCooldown = Math.max(0, car.ramCooldown - dt);
        driveCarToward(car, player.x, player.y, dt, POLICE.carSpeed);
        if (d < 52 && car.ramCooldown <= 0) {
          car.ramCooldown = 1;
          if (player.inCar) {
            car.health -= 2;
            player.inCar.health -= 2;
            player.inCar.speed *= 0.7;
            world.camera.shake = Math.max(world.camera.shake, 5);
            if (!world.events.includes('crash')) world.events.push('crash');
            if (player.inCar.health <= 0) explodeCar(player.inCar);
          } else {
            damagePlayer(18 * dt * 3);
          }
        }
      } else if (car.route && car.routeIndex < car.route.length) {
        const target = car.route[car.routeIndex];
        driveCarToward(car, target.x, target.y, dt, POLICE.carSpeed);
        if (dist(car.x, car.y, target.x, target.y) < 50) car.routeIndex += 1;
      } else {
        driveCarToward(car, player.x, player.y, dt, POLICE.carSpeed);
      }
      if (car.health <= 0 && !car.wreck) explodeCar(car);
    }
  }

  function updateWanted(dt) {
    const player = world.player;
    let nearestCop = Infinity;
    for (const car of world.cars) {
      if (car.kind === 'police' && !car.wreck) nearestCop = Math.min(nearestCop, dist(car.x, car.y, player.x, player.y));
    }
    for (const cop of world.cops) nearestCop = Math.min(nearestCop, dist(cop.x, cop.y, player.x, player.y));
    const hidden = nearestCop > 480 && world.time - world.lastCrimeAt > 8;
    const decay = hidden ? WANTED.hideDecayPerSecond : WANTED.decayPerSecond;
    world.wantedHeat = Math.max(0, world.wantedHeat - decay * dt);
    // Hiding in the safehouse clears heat fast.
    if (world.missionIndex === 2) {
      const s = placePoint('safehouse');
      if (dist(player.x, player.y, s.x, s.y) < 220) {
        world.wantedHeat = Math.max(0, world.wantedHeat - 22 * dt);
      }
    }
    // The player patches up when the heat is off.
    if (stars() === 0 && player.health < PLAYER.health && !world.gameOver) {
      player.health = Math.min(PLAYER.health, player.health + 2.5 * dt);
    }
  }

  function updateBullets(dt) {
    for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
      const b = world.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && hitsBuilding(world.city, b.x, b.y, 2)) {
        addParticles(b.x, b.y, 3, '#c9b489', 100, 0.3, 3);
        dead = true;
      }
      if (!dead) {
        for (const ped of world.peds) {
          if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 16) {
            ped.dead = true;
            ped.deadTimer = 0;
            commitCrime(WANTED.killPed);
            addParticles(b.x, b.y, 6, '#e5534b', 150, 0.5, 4);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const cop of world.cops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 16) {
            cop.health -= PLAYER.shootDamage;
            addParticles(b.x, b.y, 6, '#e5534b', 150, 0.5, 4);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of world.cars) {
          if (car.kind === 'player') continue;
          if (Math.abs(b.x - car.x) < 34 && Math.abs(b.y - car.y) < 34) {
            car.health -= PLAYER.shootDamage;
            addParticles(b.x, b.y, 5, '#ffd94a', 160, 0.4, 4);
            if (car.health <= 0 && !car.wreck) explodeCar(car);
            dead = true;
            break;
          }
        }
      }
      if (dead) world.bullets.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = world.particles.length - 1; i >= 0; i -= 1) {
      const p = world.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 2 * dt);
      p.vy *= Math.max(0, 1 - 2 * dt);
      p.life -= dt;
      if (p.life <= 0) world.particles.splice(i, 1);
    }
  }

  function updateCamera(dt) {
    const player = world.player;
    world.camera.x += (player.x - world.camera.x) * Math.min(1, 5 * dt);
    world.camera.y += (player.y - world.camera.y) * Math.min(1, 5 * dt);
    world.camera.shake = Math.max(0, world.camera.shake - 30 * dt);
    if (world.bannerTimer > 0) world.bannerTimer -= dt;
  }

  function step(dt, input) {
    world.events = [];
    world.time += dt;
    if (!world.gameOver) {
      updatePlayer(dt, input);
      updateTraffic(dt);
      updatePeds(dt);
      updatePolice(dt);
      updateWanted(dt);
      updateMissions(dt);
      updateBullets(dt);
    }
    updateParticles(dt);
    updateCamera(dt);
    // Cash and health pickups drift back in over time.
    if (world.pickups.filter((p) => p.kind === 'cash').length < 4 && random.chance(dt * 0.08)) {
      const pt = randomSidewalkPoint(random.range(400, 2800), random.range(400, 2800));
      spawnPickup('cash', pt.x, pt.y, random.int(20, 50));
    }
    return world.events;
  }

  function getSaveData() {
    return {
      money: world.player.money,
      missionIndex: world.missionIndex,
      missionsDone: world.stats.missionsDone,
      hasPistol: world.player.hasPistol,
    };
  }

  function applySave(save) {
    if (!save) return;
    world.player.money = save.money || 0;
    world.player.hasPistol = !!save.hasPistol;
    world.missionIndex = Math.min(save.missionIndex || 0, MISSIONS.length - 1);
    world.stats.missionsDone = save.missionsDone || 0;
    world.missionStage = 0;
  }

  reset();

  return {
    state: world,
    city,
    reset,
    step,
    stars,
    missionTarget,
    getSaveData,
    applySave,
    placePoint,
  };
}
