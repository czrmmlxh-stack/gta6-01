// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player with a smoothed pan and a shake; the HUD (health, money, wanted stars, mission
// objective, minimap) is drawn in screen space on top. Menus are drawn over the living world.

import { CAR, FONT, MISSIONS, PALETTE, PLAYER, WORLD } from './config.js';
import { roadLines } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = 168;

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 800;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function drawGround(view, state) {
    const { x0, y0, x1, y1 } = view;
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // A faint checker of fields so the ground is not one flat colour.
    ctx.fillStyle = PALETTE.groundAlt;
    const tile = 400;
    const startX = Math.floor(x0 / tile) * tile;
    const startY = Math.floor(y0 / tile) * tile;
    for (let x = startX; x < x1; x += tile) {
      for (let y = startY; y < y1; y += tile) {
        if (((x + y) / tile) % 2 === 0) ctx.fillRect(x, y, tile, tile);
      }
    }
    // Parks.
    for (const park of state.city.parks) {
      if (park.x > x1 || park.y > y1 || park.x + park.w < x0 || park.y + park.h < y0) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = PALETTE.parkDark;
      for (let i = 0; i < 5; i += 1) {
        const tx = park.x + 30 + hash2(park.x, i) * (park.w - 60);
        const ty = park.y + 30 + hash2(park.y, i) * (park.h - 60);
        ctx.beginPath();
        ctx.arc(tx, ty, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Roads: a sidewalk border, then asphalt, then a dashed centre line.
    const half = WORLD.roadWidth / 2;
    for (const line of roadLines()) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(x0, line - half - 10, x1 - x0, WORLD.roadWidth + 20);
      ctx.fillRect(line - half - 10, y0, WORLD.roadWidth + 20, y1 - y0);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(x0, line - half, x1 - x0, WORLD.roadWidth);
      ctx.fillRect(line - half, y0, WORLD.roadWidth, y1 - y0);
    }
    ctx.fillStyle = PALETTE.lane;
    ctx.setLineDash([26, 30]);
    ctx.lineWidth = 3;
    for (const line of roadLines()) {
      ctx.beginPath();
      ctx.moveTo(x0, line);
      ctx.lineTo(x1, line);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(line, y0);
      ctx.lineTo(line, y1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Buildings.
    for (const b of state.city.buildings) {
      if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
      ctx.fillRect(b.x + b.w - 10, b.y, 10, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (hash2(b.x + cx * 31, b.y + cy * 47) < 0.45) {
            ctx.fillRect(b.x + 12 + cx * 34, b.y + 12 + cy * 34, 14, 10);
          }
        }
      }
    }
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = CAR.length;
    const wid = CAR.width;
    // Wheels.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-len / 2 + 6, -wid / 2 - 4, 14, 7);
    ctx.fillRect(len / 2 - 20, -wid / 2 - 4, 14, 7);
    ctx.fillRect(-len / 2 + 6, wid / 2 - 3, 14, 7);
    ctx.fillRect(len / 2 - 20, wid / 2 - 3, 14, 7);
    // Body.
    ctx.fillStyle = car.wreck ? '#3a3a3a' : car.color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    if (!car.wreck) {
      // Windshield and roof.
      ctx.fillStyle = 'rgba(20,30,45,0.85)';
      ctx.fillRect(len / 2 - 22, -wid / 2 + 4, 12, wid - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(-8, -wid / 2 + 5, 20, wid - 10);
      // Headlights.
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 6);
      ctx.fillRect(len / 2 - 2, wid / 2 - 9, 3, 6);
    }
    if (car.kind === 'police' && !car.wreck) {
      // White doors and a flashing light bar.
      ctx.fillStyle = '#f4f1e6';
      ctx.fillRect(-14, -wid / 2 + 2, 22, wid - 4);
      const phase = Math.floor(time * 4) % 2;
      ctx.fillStyle = phase === 0 ? '#e74c3c' : '#3498db';
      ctx.fillRect(-6, -wid / 2 - 1, 12, 7);
      ctx.fillStyle = phase === 0 ? '#3498db' : '#e74c3c';
      ctx.fillRect(-6, wid / 2 - 6, 12, 7);
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, isPlayer, hasGun, time, dead) {
    ctx.save();
    ctx.translate(x, y);
    if (dead) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = '#00000030';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.fillStyle = PALETTE.playerJacket;
      ctx.beginPath();
      ctx.arc(-2, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(4, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      if (hasGun) {
        ctx.fillStyle = '#222';
        ctx.fillRect(8, -2, 14, 4);
      }
    }
    ctx.restore();
  }

  function drawMarker(w, h, target, time) {
    if (!target) return;
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    // Beacon in the world.
    ctx.save();
    ctx.strokeStyle = PALETTE.marker;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 52 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = PALETTE.marker;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(target.label, target.x, target.y - 44);
    ctx.restore();
  }

  function drawMinimap(w, h, state, target, starsCount) {
    const x0 = w - MINIMAP - 16;
    const y0 = 16 + 34;
    const scale = MINIMAP / WORLD.size;
    ctx.save();
    ctx.fillStyle = 'rgba(16,20,28,0.82)';
    ctx.fillRect(x0, y0, MINIMAP, MINIMAP);
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, MINIMAP, MINIMAP);
    ctx.beginPath();
    ctx.rect(x0, y0, MINIMAP, MINIMAP);
    ctx.clip();
    // Roads.
    ctx.strokeStyle = '#8a8f9c';
    ctx.lineWidth = 2;
    for (const line of roadLines()) {
      const p = x0 + line * scale;
      ctx.beginPath();
      ctx.moveTo(p, y0);
      ctx.lineTo(p, y0 + MINIMAP);
      ctx.stroke();
      const q = y0 + line * scale;
      ctx.beginPath();
      ctx.moveTo(x0, q);
      ctx.lineTo(x0 + MINIMAP, q);
      ctx.stroke();
    }
    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * scale, y0 + y * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of state.cars) {
      if (car.kind === 'police') dot(car.x, car.y, '#ff5a4a', 3);
      else if (car.kind === 'player') dot(car.x, car.y, '#ffffff', 3.5);
      else dot(car.x, car.y, '#9aa0ad', 2);
    }
    if (target) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.2;
      dot(target.x, target.y, PALETTE.marker, pulse);
    }
    dot(state.player.x, state.player.y, '#ffffff', 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + state.player.x * scale, y0 + state.player.y * scale, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SUNVALE', x0, y0 + MINIMAP + 14);
  }

  function drawHud(w, h, worldObj, state) {
    const player = state.player;
    const starsCount = worldObj.stars();
    const target = worldObj.missionTarget();
    // Top-left panel: health, money, weapon.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(16, 16, 250, 86);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('ROOK', 28, 36);
    ctx.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.healthLow;
    ctx.fillRect(28, 44, 226 * Math.max(0, player.health / PLAYER.health), 14);
    ctx.strokeStyle = '#ffffff44';
    ctx.strokeRect(28, 44, 226, 14);
    ctx.fillStyle = PALETTE.money;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`$${player.money}`, 28, 82);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(player.hasPistol ? 'PISTOL — click to shoot' : 'FISTS — Space to punch', 108, 82);
    // Wanted stars, top-right.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.fillRect(w - 16 - 190, 16, 190, 34);
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < starsCount ? PALETTE.star : PALETTE.starEmpty;
      ctx.fillText('★', w - 16 - 178 + i * 36, 41);
    }
    drawMinimap(w, h, state, target, starsCount);
    // Mission objective, bottom-left.
    const mission = worldObj.state.missionIndex < MISSIONS.length ? MISSIONS[worldObj.state.missionIndex] : null;
    ctx.fillStyle = PALETTE.hudPanel;
    const objective = mission
      ? worldObj.state.missionIndex === 0 && worldObj.state.missionStage === 0
        ? 'Steal a car — walk up to one and press E'
        : mission.objective
      : 'Free roam — Sunvale is yours. Grab cash, stay out of trouble.';
    ctx.fillRect(16, h - 78, 430, 62);
    ctx.fillStyle = PALETTE.missionBanner;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(mission ? `${mission.giver.toUpperCase()} — ${mission.title.toUpperCase()}` : 'FREE ROAM', 28, h - 56);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(objective, 28, h - 34);
    if (mission && worldObj.state.missionIndex === 1 && worldObj.state.missionStage === 1) {
      ctx.fillStyle = PALETTE.star;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(`${Math.max(0, Math.ceil(worldObj.state.missionTimer))}s left`, 380, h - 56);
    }
    if (target) {
      const d = Math.round(Math.hypot(player.x - target.x, player.y - target.y));
      ctx.fillStyle = PALETTE.hudMuted;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(`${target.label} — ${d}m`, 28, h - 20);
    }
    // Speed, bottom-right, when driving.
    if (player.inCar) {
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.fillRect(w - 116, h - 66, 100, 50);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = `bold 24px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(Math.abs(player.inCar.speed) * 0.16)}`, w - 40, h - 32);
      ctx.fillStyle = PALETTE.hudMuted;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('km/h', w - 40, h - 18);
      ctx.textAlign = 'left';
    }
    // Mission banner, centre-top.
    if (state.bannerTimer > 0 && state.missionBanner) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.bannerTimer);
      ctx.fillStyle = 'rgba(16,20,28,0.85)';
      const bw = Math.min(640, ctx.measureText(state.missionBanner).width + 60);
      ctx.fillRect((w - bw) / 2, 66, bw, 40);
      ctx.fillStyle = PALETTE.missionBanner;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(state.missionBanner, w / 2, 92);
      ctx.restore();
    }
    // Controls hint, bottom-centre.
    ctx.fillStyle = 'rgba(244,241,230,0.75)';
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('WASD move / drive   E enter car   Space punch   Click shoot   Shift sprint   P pause', w / 2, h - 12);
    ctx.textAlign = 'left';
  }

  function drawPanel(w, h, title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.hudPanel;
    const pw = 620;
    const ph = 150 + lines.length * 30;
    ctx.fillRect((w - pw) / 2, (h - ph) / 2, pw, ph);
    ctx.strokeStyle = accent || PALETTE.missionBanner;
    ctx.lineWidth = 3;
    ctx.strokeRect((w - pw) / 2, (h - ph) / 2, pw, ph);
    ctx.fillStyle = accent || PALETTE.missionBanner;
    ctx.font = `bold 52px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, (h - ph) / 2 + 78);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `17px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, (h - ph) / 2 + 122 + i * 30);
    });
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(prompt, w / 2, (h - ph) / 2 + ph - 24);
    ctx.textAlign = 'left';
  }

  function draw(worldObj, screen, info) {
    const { w, h } = size();
    const state = worldObj.state;
    const cam = state.camera;
    // The shake is a function of world time, so a staged scene repeats exactly.
    const shakeX = cam.shake > 0 ? Math.sin(state.time * 127.1) * cam.shake * 0.5 : 0;
    const shakeY = cam.shake > 0 ? Math.cos(state.time * 149.7) * cam.shake * 0.5 : 0;
    const view = {
      x0: cam.x - w / 2 + shakeX,
      y0: cam.y - h / 2 + shakeY,
      x1: cam.x + w / 2 + shakeX,
      y1: cam.y + h / 2 + shakeY,
    };
    ctx.save();
    ctx.translate(w / 2 - cam.x + shakeX, h / 2 - cam.y + shakeY);
    drawGround(view, state);
    // Pickups.
    for (const pk of state.pickups) {
      const bob = Math.sin(state.time * 3 + pk.bob) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#2e7d32';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ddc7d';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 5);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#f4f1e6';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(-2, -8, 4, 16);
        ctx.fillRect(-8, -2, 16, 4);
      } else {
        ctx.fillStyle = '#222';
        ctx.fillRect(-12, -3, 18, 6);
        ctx.fillRect(2, -2, 12, 4);
        ctx.fillStyle = PALETTE.marker;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PISTOL', 0, -14);
      }
      ctx.restore();
    }
    // Mission beacon.
    drawMarker(w, h, worldObj.missionTarget(), state.time);
    // Cars, peds, cops, bullets, particles.
    for (const car of state.cars) drawCar(car, state.time);
    for (const ped of state.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.color, false, false, state.time, ped.dead);
    }
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#2c4a7a', false, false, state.time, false);
      ctx.save();
      ctx.fillStyle = '#1a2a44';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y - 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const player = state.player;
    if (player.inCar) {
      // The player's car is drawn with the cars; add a marker ring.
      ctx.save();
      ctx.strokeStyle = '#ffffffcc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, CAR.length / 2 + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, true, player.hasPistol, state.time, false);
    }
    ctx.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(w, h, worldObj, state);
    }
    if (screen === SCREEN_TITLE) {
      drawPanel(
        w,
        h,
        'SUNVALE',
        [
          'Rook is back in Sunvale with nothing but a name and a debt.',
          'Marla has work: cars to borrow, packages to run, cops to lose.',
          'Steal a car with E. Drive with WASD. Punch with Space.',
          'Click to shoot once you find a pistol. Lose the stars to lay low.',
        ],
        info.hasSave ? 'SPACE or CLICK — Start    •    C — Continue your story' : 'SPACE or CLICK — Start',
        PALETTE.missionBanner,
      );
      ctx.fillStyle = PALETTE.hudMuted;
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Best haul: $${info.best}   •   Missions done: ${info.missionsDone}`, w / 2, h / 2 + 128);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_PAUSED) {
      drawPanel(w, h, 'PAUSED', ['Sunvale waits for no one — except right now.'], 'P or ESC — Resume', '#9aa0ad');
    } else if (screen === SCREEN_OVER) {
      const busted = state.gameOver === 'busted';
      drawPanel(
        w,
        h,
        busted ? 'BUSTED' : 'WASTED',
        [
          busted ? 'The Sunvale police dragged Rook out of the game.' : 'Rook went down in the streets of Sunvale.',
          `Money kept: $${player.money}   •   Missions done: ${state.stats.missionsDone}   •   Cars stolen: ${state.stats.carsStolen}`,
          `Crimes committed: ${state.stats.crimes}`,
        ],
        'SPACE or CLICK — Run it back',
        busted ? '#5a8fd8' : '#e5534b',
      );
    }
  }

  return { draw };
}
