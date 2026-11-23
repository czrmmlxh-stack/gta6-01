// Sunvale itself: a fixed road grid, the blocks between the roads, the buildings and parks
// inside them, and the route-finding every driver (traffic, police, the screenshot autopilot)
// uses to get from one intersection to another.
//
// Roads run at x and y = firstRoad + i * roadSpacing. The world edge is a ring of blocks, so
// nothing can drive off the map. Buildings are placed once, from the seed, inside each block.

import { WORLD, PALETTE } from './config.js';

/** The road lines, as coordinates. */
export function roadLines() {
  const lines = [];
  for (let i = 0; i < WORLD.roadCount; i += 1) lines.push(WORLD.firstRoad + i * WORLD.roadSpacing);
  return lines;
}

export function isOnRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const line of roadLines()) {
    if (Math.abs(x - line) <= half || Math.abs(y - line) <= half) return true;
  }
  return false;
}

/** The nearest point on a road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  const lines = roadLines();
  let bestX = lines[0];
  let bestY = lines[0];
  for (const line of lines) {
    if (Math.abs(line - x) < Math.abs(bestX - x)) bestX = line;
    if (Math.abs(line - y) < Math.abs(bestY - y)) bestY = line;
  }
  // Snap to whichever axis is closer to a road.
  const dx = Math.abs(bestX - x);
  const dy = Math.abs(bestY - y);
  return dx < dy ? { x: bestX, y } : { x, y: bestY };
}

/** The nearest intersection to (x, y), as {ix, iy} grid indices. */
export function nearestIntersection(x, y) {
  const lines = roadLines();
  let ix = 0;
  let iy = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (Math.abs(lines[i] - x) < Math.abs(lines[ix] - x)) ix = i;
    if (Math.abs(lines[i] - y) < Math.abs(lines[iy] - y)) iy = i;
  }
  return { ix, iy };
}

export function intersectionPoint(ix, iy) {
  const lines = roadLines();
  return { x: lines[ix], y: lines[iy] };
}

/**
 * A route between two intersections as a list of points, found by breadth-first search over
 * the grid. Every driver follows its route one intersection at a time.
 */
export function findRoute(from, to) {
  const n = WORLD.roadCount;
  const key = (ix, iy) => iy * n + ix;
  const prev = new Map();
  const queue = [key(from.ix, from.iy)];
  prev.set(key(from.ix, from.iy), null);
  while (queue.length > 0) {
    const current = queue.shift();
    const cx = current % n;
    const cy = Math.floor(current / n);
    if (cx === to.ix && cy === to.iy) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const k = key(nx, ny);
      if (!prev.has(k)) {
        prev.set(k, current);
        queue.push(k);
      }
    }
  }
  const points = [];
  let cursor = key(to.ix, to.iy);
  if (!prev.has(cursor)) return [intersectionPoint(to.ix, to.iy)];
  while (cursor !== null) {
    const cx = cursor % n;
    const cy = Math.floor(cursor / n);
    points.unshift(intersectionPoint(cx, cy));
    cursor = prev.get(cursor);
  }
  return points;
}

/**
 * Build the city from a seed: one building (or a park) per block, plus the named places the
 * story uses. Buildings never touch a road; a block holds one big building or a few small ones.
 */
export function createCity(random) {
  const lines = roadLines();
  const half = WORLD.roadWidth / 2;
  const buildings = [];
  const parks = [];
  const names = [
    'Marlow Garage', 'Palm Motel', 'Sunvale Docks', 'Cactus Row Safehouse',
    'Harbour Market', 'Sunvale Plaza', 'The Rusty Anchor', 'Cactus Diner',
  ];
  let nameIndex = 0;

  for (let bx = 0; bx < lines.length - 1; bx += 1) {
    for (let by = 0; by < lines.length - 1; by += 1) {
      const x0 = lines[bx] + half + 14;
      const x1 = lines[bx + 1] - half - 14;
      const y0 = lines[by] + half + 14;
      const y1 = lines[by + 1] - half - 14;
      const w = x1 - x0;
      const h = y1 - y0;
      if (random.chance(0.14)) {
        parks.push({ x: x0, y: y0, w, h });
        continue;
      }
      if (random.chance(0.55)) {
        // One big building filling most of the block.
        const bw = w * random.range(0.55, 0.8);
        const bh = h * random.range(0.55, 0.8);
        buildings.push({
          x: x0 + (w - bw) / 2,
          y: y0 + (h - bh) / 2,
          w: bw,
          h: bh,
          color: random.pick(PALETTE.buildingRoof),
          name: nameIndex < names.length ? names[nameIndex++] : null,
        });
      } else {
        // Two or three smaller buildings.
        const count = random.int(2, 3);
        for (let i = 0; i < count; i += 1) {
          const bw = w * random.range(0.3, 0.45);
          const bh = h * random.range(0.3, 0.45);
          buildings.push({
            x: x0 + random.range(0, w - bw),
            y: y0 + random.range(0, h - bh),
            w: bw,
            h: bh,
            color: random.pick(PALETTE.buildingRoof),
            name: nameIndex < names.length ? names[nameIndex++] : null,
          });
        }
      }
    }
  }

  // The edge ring: a solid wall of blocks so the player cannot leave the city.
  const edge = [];
  const e = WORLD.size;
  edge.push({ x: -40, y: -40, w: e + 80, h: 200 });
  edge.push({ x: -40, y: e - 160, w: e + 80, h: 200 });
  edge.push({ x: -40, y: 0, w: 200, h: e });
  edge.push({ x: e - 160, y: 0, w: 200, h: e });

  return { buildings, parks, edge, lines };
}

/** True when the circle at (x, y, r) overlaps any building or the edge wall. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  for (const b of city.edge) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of whatever building it overlaps; returns the building or null. */
export function resolveBuildingCollision(city, body, r) {
  const b = hitsBuilding(city, body.x, body.y, r);
  if (!b) return null;
  const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
  let dx = body.x - cx;
  let dy = body.y - cy;
  let dist = Math.hypot(dx, dy);
  if (dist === 0) {
    // Centre is inside the building: push out along the shallowest axis.
    const left = body.x - b.x;
    const right = b.x + b.w - body.x;
    const top = body.y - b.y;
    const bottom = b.y + b.h - body.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) body.x = b.x - r;
    else if (min === right) body.x = b.x + b.w + r;
    else if (min === top) body.y = b.y - r;
    else body.y = b.y + b.h + r;
    return b;
  }
  dx /= dist;
  dy /= dist;
  body.x = cx + dx * r;
  body.y = cy + dy * r;
  return b;
}
