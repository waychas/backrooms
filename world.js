export const SIZE = 9;
export const CELL = 12;
export const HEIGHT = 5.5;
export const EXTENT = SIZE * CELL;
export const WALL = 0.2;
export const GAP = 1.35;
export const LEVEL_SEEDS = Object.freeze([7419, 18257, 39461, 52783, 68147, 82609, 103291, 127681, 156493, 192847]);

function pathsFrom(horizontal, vertical, start) {
  const parents = Array(SIZE * SIZE).fill(-1);
  parents[start] = start;
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    const x = cell % SIZE, z = Math.floor(cell / SIZE);
    const neighbors = [];
    if (x > 0 && !vertical[z][x]) neighbors.push(cell - 1);
    if (x < SIZE - 1 && !vertical[z][x + 1]) neighbors.push(cell + 1);
    if (z > 0 && !horizontal[z][x]) neighbors.push(cell - SIZE);
    if (z < SIZE - 1 && !horizontal[z + 1][x]) neighbors.push(cell + SIZE);
    for (const neighbor of neighbors) if (parents[neighbor] === -1) {
      parents[neighbor] = cell;
      queue.push(neighbor);
    }
  }
  return queue[queue.length - 1];
}

export function createLayout(seed) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const horizontal = Array.from({length: SIZE + 1}, () => Array(SIZE).fill(true));
  const vertical = Array.from({length: SIZE}, () => Array(SIZE + 1).fill(true));
  const visited = new Set([0]);
  const stack = [[0, 0]];
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const options = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]
      .filter(([nx, nz]) => nx >= 0 && nz >= 0 && nx < SIZE && nz < SIZE && !visited.has(nz * SIZE + nx));
    if (!options.length) { stack.pop(); continue; }
    const [nx, nz] = options[Math.floor(random() * options.length)];
    if (nx !== x) vertical[z][Math.max(x, nx)] = false;
    else horizontal[Math.max(z, nz)][x] = false;
    visited.add(nz * SIZE + nx);
    stack.push([nx, nz]);
  }
  // A few loops preserve disorientation without making the maze single-path.
  for (let z = 0; z < SIZE; z++) for (let x = 1; x < SIZE; x++) {
    if (random() < 0.1) vertical[z][x] = false;
  }
  for (let z = 1; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    if (random() < 0.1) horizontal[z][x] = false;
  }
  const halls = [
    {x: 0, z: 0, width: 3, depth: 2},
    {x: 1, z: 3 + Math.floor(random() * 2), width: 7, depth: 1},
    {x: 5, z: 5, width: 3, depth: 3}
  ];
  for (let index = 0; index < 4; index++) {
    const width = 2 + Math.floor(random() * 2);
    const depth = 2 + Math.floor(random() * 2);
    halls.push({x: Math.floor(random() * (SIZE - width + 1)), z: Math.floor(random() * (SIZE - depth + 1)), width, depth});
  }
  const openHorizontal = new Set();
  const openVertical = new Set();
  for (const hall of halls) {
    for (let z = hall.z; z < hall.z + hall.depth; z++) for (let x = hall.x; x < hall.x + hall.width; x++) {
      if (x > hall.x) { vertical[z][x] = false; openVertical.add(`${x},${z}`); }
      if (z > hall.z) { horizontal[z][x] = false; openHorizontal.add(`${x},${z}`); }
    }
  }
  const walls = [];
  const openings = [];
  const flank = (CELL - GAP) / 2;
  for (let z = 0; z <= SIZE; z++) for (let x = 0; x < SIZE; x++) {
    if (horizontal[z][x]) walls.push({x: (x + 0.5) * CELL, z: z * CELL, width: CELL + WALL, depth: WALL});
    else if (!openHorizontal.has(`${x},${z}`)) {
      for (const offset of [flank / 2, CELL - flank / 2]) walls.push({x: x * CELL + offset, z: z * CELL, width: flank, depth: WALL});
      openings.push({x: (x + 0.5) * CELL, z: z * CELL, width: GAP, depth: WALL});
    }
  }
  for (let z = 0; z < SIZE; z++) for (let x = 0; x <= SIZE; x++) {
    if (vertical[z][x]) walls.push({x: x * CELL, z: (z + 0.5) * CELL, width: WALL, depth: CELL + WALL});
    else if (!openVertical.has(`${x},${z}`)) {
      for (const offset of [flank / 2, CELL - flank / 2]) walls.push({x: x * CELL, z: z * CELL + offset, width: WALL, depth: flank});
      openings.push({x: x * CELL, z: (z + 0.5) * CELL, width: WALL, depth: GAP});
    }
  }
  const corridors = [];
  for (let z = 0; z < SIZE && corridors.length < 8; z++) for (let x = 0; x < SIZE && corridors.length < 8; x++) {
    const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    if (vertical[z][x] && vertical[z][x + 1]) {
      corridors.push({x: cx, z: cz, axis: 'z'});
      for (const side of [-1, 1]) walls.push({x: cx + side * (GAP + WALL) / 2, z: cz, width: WALL, depth: CELL});
    } else if (horizontal[z][x] && horizontal[z + 1][x]) {
      corridors.push({x: cx, z: cz, axis: 'x'});
      for (const side of [-1, 1]) walls.push({x: cx, z: cz + side * (GAP + WALL) / 2, width: CELL, depth: WALL});
    }
  }
  const pillars = [];
  const columnLocations = new Set();
  for (const hall of halls) {
    for (let z = hall.z + 1; z < hall.z + hall.depth; z++) for (let x = hall.x + 1; x < hall.x + hall.width; x++) {
      const key = `${x},${z}`;
      if (!columnLocations.has(key)) {
        pillars.push({x: x * CELL, z: z * CELL, width: 0.9, depth: 1.4, rotation: random() < 0.5 ? 0 : Math.PI / 4});
        columnLocations.add(key);
      }
    }
  }
  // Off-axis screens and L-shaped alcoves leave the cell-center routes clear.
  // This keeps decorative architecture from sealing a generated connection.
  for (let index = 0; index < 14; index++) {
    const x = (index === 0 ? 1 : Math.floor(random() * SIZE)) * CELL;
    const z = (index === 0 ? 1 : Math.floor(random() * SIZE)) * CELL;
    if (index % 2 === 0) {
      walls.push({x: x + 3, z: z + 3, width: 6.6, depth: 0.3, rotation: (random() < 0.5 ? -1 : 1) * Math.PI / 4});
    } else {
      walls.push({x: x + 3.2, z: z + 1.5, width: 4, depth: 0.3});
      walls.push({x: x + 1.35, z: z + 3.2, width: 0.3, depth: 3.7});
    }
  }
  const exitCell = pathsFrom(horizontal, vertical, 0);
  const exit = {x: (exitCell % SIZE + 0.5) * CELL, z: (Math.floor(exitCell / SIZE) + 0.5) * CELL};
  return {horizontal, vertical, walls, pillars, openings, halls, corridors, exit, exitCell};
}

export function canStand(x, z, obstacles, radius = 0.24) {
  if (x < radius || z < radius || x > EXTENT - radius || z > EXTENT - radius) return false;
  return !obstacles.some(wall => {
    const angle = wall.rotation || 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const localX = (x - wall.x) * cos - (z - wall.z) * sin;
    const localZ = (x - wall.x) * sin + (z - wall.z) * cos;
    const nearX = Math.max(-wall.width / 2, Math.min(localX, wall.width / 2));
    const nearZ = Math.max(-wall.depth / 2, Math.min(localZ, wall.depth / 2));
    return (localX - nearX) ** 2 + (localZ - nearZ) ** 2 < radius ** 2;
  });
}
