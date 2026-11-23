// Sunvale — tuning, colours and story constants. The city is a fixed road grid; every number
// that shapes how the game feels lives here so the world, the renderer and the missions agree.

export const STEP = 1 / 60;

export const WORLD = {
  size: 3200,
  roadSpacing: 400,
  roadWidth: 76,
  firstRoad: 200,
  roadCount: 8,
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  sprintSpeed: 350,
  health: 100,
  punchDamage: 25,
  punchRange: 46,
  punchArc: 1.1,
  shootDamage: 34,
  bulletSpeed: 900,
  fireInterval: 0.22,
  enterRange: 60,
};

export const CAR = {
  length: 64,
  width: 32,
  accel: 520,
  reverseAccel: 320,
  maxSpeed: 620,
  maxReverse: 220,
  turnRate: 2.6,
  brake: 700,
  drag: 0.55,
  health: 100,
};

export const TRAFFIC = { count: 14, speed: 150 };
export const PARKED = { count: 10 };
export const PEDS = { count: 26 };

export const WANTED = {
  maxStars: 5,
  stealCar: 22,
  punchPed: 18,
  shoot: 26,
  killPed: 34,
  ramCop: 30,
  decayPerSecond: 2.2,
  hideDecayPerSecond: 7,
  starsPerHeat: 22,
};

export const POLICE = {
  carSpeed: 560,
  footSpeed: 265,
  bustTime: 1.6,
  spawnDistance: 700,
  despawnDistance: 1400,
};

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Borrowed Wheels',
    giver: 'Marla',
    brief: 'Rook, you need wheels. Take any parked car and bring it to the garage on Marlow Ave.',
    objective: 'Steal a car, then drive to the garage',
    reward: 150,
  },
  {
    id: 'package',
    title: 'The Package',
    giver: 'Marla',
    brief: 'A package is waiting at the docks. Pick it up and get it to the Palm Motel. The harbour crew will not be happy to see you.',
    objective: 'Pick up the package, then deliver it to the motel',
    reward: 300,
  },
  {
    id: 'dragnet',
    title: 'Break the Dragnet',
    giver: 'Marla',
    brief: 'The whole Sunvale force is out for you. Lose them and get to the safehouse on Cactus Row.',
    objective: 'Lose the cops and reach the safehouse',
    reward: 500,
  },
];

export const SAVE_KEY = 'sunvale.save.v1';

export const PALETTE = {
  ground: '#d8bd82',
  groundAlt: '#cdb274',
  park: '#7fae5a',
  parkDark: '#6b9c4a',
  road: '#3c414d',
  roadEdge: '#2f333d',
  lane: '#e8d98a',
  sidewalk: '#c9b489',
  buildingRoof: ['#b5674c', '#c98a4b', '#7a8ba0', '#a05a72', '#5f7d6a', '#8a6fb0', '#b08a4a', '#4f7d8a'],
  buildingEdge: '#00000033',
  water: '#5a8fb0',
  player: '#f2f2f2',
  playerJacket: '#d84a4a',
  pedShirt: ['#e8a13c', '#4a90d8', '#7ac74f', '#d86ab0', '#8a5fd8', '#e8e8e8', '#3cb8a0'],
  carColors: ['#c0392b', '#2471a3', '#d4ac0d', '#1e8449', '#6c3483', '#e67e22', '#2e86c1', '#b03a2e', '#117a65', '#7d3c98'],
  policeCar: '#2c3e50',
  policeLight: ['#e74c3c', '#3498db'],
  hudPanel: '#10141cd9',
  hudText: '#f4f1e6',
  hudMuted: '#b9b2a0',
  star: '#ffd94a',
  starEmpty: '#5a5546',
  health: '#58c96b',
  healthLow: '#e5534b',
  money: '#7ddc7d',
  marker: '#ffd94a',
  missionBanner: '#ffd94a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
