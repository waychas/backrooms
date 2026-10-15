import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE, CELL, EXTENT, HEIGHT, WALL, GAP, LEVEL_SEEDS, createLayout, canStand} from './world.js';

test('the same seed reproduces the same finite layout', () => {
  assert.deepEqual(createLayout(7419), createLayout(7419));
  assert.notDeepEqual(createLayout(7419), createLayout(7420));
});

test('all spaces are connected across 100 seeds', () => {
  for (const seed of [...Array(100).keys(), ...LEVEL_SEEDS]) {
    const {horizontal, vertical} = createLayout(seed);
    const queue = [[0, 0]];
    const seen = new Set(['0,0']);
    for (let index = 0; index < queue.length; index++) {
      const [x, z] = queue[index];
      const neighbors = [];
      if (x < SIZE - 1 && !vertical[z][x + 1]) neighbors.push([x + 1, z]);
      if (x > 0 && !vertical[z][x]) neighbors.push([x - 1, z]);
      if (z < SIZE - 1 && !horizontal[z + 1][x]) neighbors.push([x, z + 1]);
      if (z > 0 && !horizontal[z][x]) neighbors.push([x, z - 1]);
      for (const [nx, nz] of neighbors) {
        const key = `${nx},${nz}`;
        if (!seen.has(key)) { seen.add(key); queue.push([nx, nz]); }
      }
    }
    assert.equal(seen.size, SIZE * SIZE, `Disconnected layout for seed ${seed}`);
  }
});

test('all seeds retain their four outer boundaries and clear cell centers', () => {
  for (const seed of [...Array(100).keys(), ...LEVEL_SEEDS]) {
    const layout = createLayout(seed);
    assert.ok(layout.horizontal[0].every(Boolean));
    assert.ok(layout.horizontal[SIZE].every(Boolean));
    assert.ok(layout.vertical.every(row => row[0] && row[SIZE]));
    const obstacles = [...layout.walls, ...layout.pillars];
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      assert.ok(canStand((x + 0.5) * CELL, (z + 0.5) * CELL, obstacles));
    }
    assert.equal(canStand(-1, 2.5, obstacles), false);
    assert.equal(canStand(EXTENT + 1, 2.5, obstacles), false);
  }
});

test('collision rejects wall intersections and respects the player radius', () => {
  const obstacles = [{x: 5, z: 5, width: 5, depth: 0.2}];
  assert.equal(canStand(5, 5, obstacles), false);
  assert.equal(canStand(5, 5.2, obstacles), false);
  assert.equal(canStand(5, 5.5, obstacles), true);
  assert.equal(canStand(1, 5, obstacles), true);
});

test('open passages are traversable with collision enabled', () => {
  for (const seed of [...Array(20).keys(), ...LEVEL_SEEDS]) {
    const layout = createLayout(seed);
    const obstacles = [...layout.walls, ...layout.pillars];
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      for (let step = 0; step <= CELL * 10; step++) {
        if (x < SIZE - 1 && !layout.vertical[z][x + 1]) {
          assert.ok(canStand((x + 0.5) * CELL + step * 0.1, (z + 0.5) * CELL, obstacles));
        }
        if (z < SIZE - 1 && !layout.horizontal[z + 1][x]) {
          assert.ok(canStand((x + 0.5) * CELL, (z + 0.5) * CELL + step * 0.1, obstacles));
        }
      }
    }
  }
});

test('ten fixed levels have clear exits, large halls, and narrow connectors', () => {
  assert.equal(LEVEL_SEEDS.length, 10);
  assert.equal(new Set(LEVEL_SEEDS).size, 10);
  const layouts = LEVEL_SEEDS.map(seed => createLayout(seed));
  assert.equal(new Set(layouts.map(layout => JSON.stringify(layout.walls))).size, 10);
  for (const layout of layouts) {
    assert.ok(layout.openings.every(opening => Math.min(opening.width, opening.depth) === 0.2));
    assert.ok(layout.openings.every(opening => Math.max(opening.width, opening.depth) === GAP));
    assert.notEqual(layout.exitCell, 0);
    assert.ok(canStand(layout.exit.x, layout.exit.z, [...layout.walls, ...layout.pillars]));
    assert.ok(EXTENT >= 100 && HEIGHT >= 5);
    assert.ok(layout.halls.some(hall => hall.width * CELL >= 36 && hall.depth * CELL >= 24));
    assert.ok(layout.halls.some(hall => hall.width * CELL >= 80));
    assert.ok(layout.walls.some(wall => wall.rotation));
    assert.ok(layout.pillars.length > 0);
    assert.ok(layout.corridors.length > 0);
    for (const corridor of layout.corridors) {
      const walls = [...layout.walls, ...layout.pillars];
      assert.ok(canStand(corridor.x, corridor.z, walls));
      const dx = corridor.axis === 'z' ? (GAP + WALL) / 2 : 0;
      const dz = corridor.axis === 'x' ? (GAP + WALL) / 2 : 0;
      assert.equal(canStand(corridor.x + dx, corridor.z + dz, walls), false);
    }
    for (let z = 0; z < 2; z++) for (let x = 0; x < 3; x++) {
      if (x > 0) assert.equal(layout.vertical[z][x], false);
      if (z > 0) assert.equal(layout.horizontal[z][x], false);
    }
  }
});

test('angled wall collision follows the rendered rotation, not its bounding box', () => {
  const walls = [{x: 20, z: 20, width: 8, depth: 0.3, rotation: Math.PI / 4}];
  assert.equal(canStand(20, 20, walls), false);
  assert.equal(canStand(22, 18, walls), false);
  assert.equal(canStand(23, 20, walls), true);
  assert.equal(canStand(20.5, 20.5, walls), true);
});
