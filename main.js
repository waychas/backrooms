import {CELL, HEIGHT, EXTENT, LEVEL_SEEDS, createLayout, canStand} from './world.js';

const $ = id => document.getElementById(id);
const canvas = $('world');
const keys = new Set();
const touchDevice = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const requestedLevel = Number(params.get('level'));
let levelIndex = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= LEVEL_SEEDS.length ? requestedLevel - 1 : 0;
if (params.has('seed')) {
  const url = new URL(location.href);
  url.searchParams.delete('seed');
  history.replaceState(null, '', url);
}
let layout = createLayout(LEVEL_SEEDS[levelIndex]);
let obstacles = [...layout.walls, ...layout.pillars];
let started = false;
let paused = true;
let overhead = false;
let yaw = -Math.PI * 0.65;
let pitch = 0;
let walkSpeed = 5.8;
let worldGroup;
let ceilingGroup;
let exitNearby = false;
let completed = false;
let audio;
let soundOn = false;
let drag = null;
let noticeTimer;
const player = {x: CELL / 2, z: CELL / 2};

function notice(message) {
  clearTimeout(noticeTimer);
  $('notice').textContent = message;
  $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4500);
}

function showFatal(error) {
  console.error(error);
  $('enter').disabled = true;
  $('enter').textContent = 'UNABLE TO OPEN THE SPACE';
  notice('The 3D scene could not load. Check that WebGL / hardware acceleration is enabled and reload.');
}

try {
  if (!window.THREE) throw new Error('Local Three.js failed to load');
  await init();
} catch (error) {
  showFatal(error);
}

async function init() {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171b14);
  scene.fog = new THREE.FogExp2(0x35391f, 0.014);
  const camera = new THREE.PerspectiveCamera(92, innerWidth / innerHeight, 0.08, EXTENT * 2);
  camera.rotation.order = 'YXZ';
  const overviewCamera = new THREE.PerspectiveCamera(47, innerWidth / innerHeight, 0.1, 150);
  scene.add(new THREE.HemisphereLight(0xe5e6b9, 0x5b5031, 1.05));

  const loader = new THREE.TextureLoader();
  const textureNames = ['wallTexture', 'wallBumpTexture', 'carpetTexture', 'ceilingTexture', 'ceilingBumpTexture'];
  const textures = Object.fromEntries(await Promise.all(textureNames.map(async name => {
    const texture = await loader.loadAsync(`./assets/textures/${name}.webp`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (!name.includes('Bump')) texture.colorSpace = THREE.SRGBColorSpace;
    return [name, texture];
  })));
  textures.wallTexture.repeat.set(3, 1);
  textures.wallBumpTexture.repeat.set(3, 1);
  textures.carpetTexture.repeat.set(EXTENT / 2, EXTENT / 2);
  textures.ceilingTexture.repeat.set(EXTENT / 3.6, EXTENT / 3.6);
  textures.ceilingBumpTexture.repeat.copy(textures.ceilingTexture.repeat);

  const wallMaterial = new THREE.MeshStandardMaterial({map: textures.wallTexture, bumpMap: textures.wallBumpTexture, bumpScale: 0.025, roughness: 0.96, color: 0xd5cf9f});
  // Vertical ambient shading gives the wall/floor junction depth without baked assets.
  wallMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying float wallHeight;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nwallHeight = uv.y;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          float span = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
          vec2 surfaceScale = vec2(span / 4.0, length(instanceMatrix[1].xyz) / 3.4);
          vMapUv *= surfaceScale;
          vBumpMapUv *= surfaceScale;
        #endif`);
    shader.fragmentShader = 'varying float wallHeight;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= (0.62 + 0.38 * smoothstep(0.0, 0.24, wallHeight)) * (1.0 - 0.15 * smoothstep(0.87, 1.0, wallHeight));');
  };
  const floorMaterial = new THREE.MeshStandardMaterial({map: textures.carpetTexture, bumpMap: textures.carpetTexture, bumpScale: 0.025, roughness: 1, color: 0xa79b6b});
  const ceilingMaterial = new THREE.MeshStandardMaterial({map: textures.ceilingTexture, bumpMap: textures.ceilingBumpTexture, bumpScale: 0.035, roughness: 1, color: 0xd4d0b4});
  const trimMaterial = new THREE.MeshStandardMaterial({color: 0x5c5436, roughness: 0.85});
  const fixtureMaterial = new THREE.MeshStandardMaterial({color: 0x797967, roughness: 0.6});
  const tubeMaterial = new THREE.MeshBasicMaterial({color: 0xfffbd4});
  const capMaterial = new THREE.MeshStandardMaterial({color: 0xaaa67d, roughness: 1});
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(18,15,7,0.55)');
  gradient.addColorStop(1, 'rgba(18,15,7,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({map: shadowTexture, transparent: true, depthWrite: false});

  function box(group, width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function boxes(group, items, material) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
    const transform = new THREE.Object3D();
    items.forEach((item, index) => {
      transform.position.set(item.x, item.y, item.z);
      transform.rotation.set(0, item.rotation || 0, 0);
      transform.scale.set(item.width, item.height, item.depth);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  const lightPositions = [];
  function buildWorld() {
    if (worldGroup) {
      scene.remove(worldGroup);
      worldGroup.traverse(object => { object.geometry?.dispose(); if (object.isInstancedMesh) object.dispose(); });
      for (const resource of worldGroup.userData.disposable) resource.dispose();
    }
    lightPositions.length = 0;
    worldGroup = new THREE.Group();
    ceilingGroup = new THREE.Group();
    worldGroup.add(ceilingGroup);
    scene.add(worldGroup);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(EXTENT, EXTENT), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(EXTENT / 2, 0, EXTENT / 2);
    floor.receiveShadow = true;
    worldGroup.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(EXTENT, EXTENT), ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(EXTENT / 2, HEIGHT, EXTENT / 2);
    ceiling.receiveShadow = true;
    ceilingGroup.add(ceiling);

    const materials = [wallMaterial, wallMaterial, capMaterial, capMaterial, wallMaterial, wallMaterial];
    boxes(worldGroup, obstacles.map(wall => ({...wall, height: HEIGHT, y: HEIGHT / 2})), materials);
    boxes(worldGroup, obstacles.map(wall => ({...wall, width: wall.width + 0.035, depth: wall.depth + 0.035, height: 0.13, y: 0.065})), trimMaterial);
    boxes(ceilingGroup, layout.openings.map(opening => ({...opening, height: HEIGHT - 2.35, y: 2.35 + (HEIGHT - 2.35) / 2})), materials);
    const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), shadowMaterial, obstacles.length);
    const transform = new THREE.Object3D();
    obstacles.forEach((wall, index) => {
      transform.rotation.set(-Math.PI / 2, 0, wall.rotation || 0);
      transform.position.set(wall.x, 0.007, wall.z);
      transform.scale.set(wall.width + 1.2, wall.depth + 1.2, 1);
      transform.updateMatrix();
      shadows.setMatrixAt(index, transform.matrix);
    });
    shadows.computeBoundingSphere();
    worldGroup.add(shadows);
    const fixtures = [], tubes = [], baffles = [];
    const fixtureSpacing = 4;
    for (let z = 0; z < EXTENT / fixtureSpacing; z++) for (let x = 0; x < EXTENT / fixtureSpacing; x++) {
      const px = (x + 0.5) * fixtureSpacing;
      const pz = (z + 0.5) * fixtureSpacing;
      if (x % 2 === 0 && z % 2 === 0) lightPositions.push(new THREE.Vector3(px, HEIGHT - 0.25, pz));
      fixtures.push({width: 0.7, height: 0.09, depth: 1.7, x: px, y: HEIGHT - 0.06, z: pz});
      tubes.push({width: 0.56, height: 0.025, depth: 1.55, x: px, y: HEIGHT - 0.12, z: pz});
      for (let tube = -1; tube <= 1; tube++) baffles.push({width: 0.025, height: 0.035, depth: 1.55, x: px + tube * 0.18, y: HEIGHT - 0.14, z: pz});
    }
    boxes(ceilingGroup, fixtures, fixtureMaterial);
    boxes(ceilingGroup, tubes, tubeMaterial);
    boxes(ceilingGroup, baffles, fixtureMaterial);
    const doorMaterial = new THREE.MeshStandardMaterial({color: 0x5c5841, roughness: 0.85});
    const door = box(worldGroup, 1.45, 2.5, 0.07, 0.13, 1.25, CELL / 2, doorMaterial);
    door.rotation.y = Math.PI / 2;
    box(worldGroup, 0.12, 2.5, 0.15, layout.exit.x - 0.65, 1.25, layout.exit.z, trimMaterial);
    box(worldGroup, 0.12, 2.5, 0.15, layout.exit.x + 0.65, 1.25, layout.exit.z, trimMaterial);
    box(worldGroup, 1.42, 0.15, 0.15, layout.exit.x, 2.5, layout.exit.z, trimMaterial);
    box(worldGroup, 1.18, 2.4, 0.07, layout.exit.x, 1.2, layout.exit.z, doorMaterial);
    box(worldGroup, 0.16, 0.06, 0.12, layout.exit.x + 0.42, 1.05, layout.exit.z + 0.07, fixtureMaterial);
    worldGroup.userData.disposable = [doorMaterial];
    ceilingGroup.visible = !overhead;
    $('level-label').textContent = `LEVEL ${levelIndex + 1} / 10`;
    $('level-select').value = String(levelIndex);
    $('exit-action').textContent = levelIndex === 9 ? 'FINISH [E]' : `ENTER LEVEL ${levelIndex + 2} [E]`;
    $('exit-action').hidden = true;
    exitNearby = false;
  }

  // Keep a bounded light pool: lighting cost does not grow with room count.
  const lightPool = Array.from({length: 9}, (_, index) => {
    const light = new THREE.PointLight(0xfff1bd, 60, 30, 1.6);
    if (index < 2 && !touchDevice) {
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.002;
      light.shadow.normalBias = 0.035;
      light.shadow.camera.near = 0.15;
      light.shadow.camera.far = 30;
    }
    scene.add(light);
    return light;
  });
  const overviewLight = new THREE.DirectionalLight(0xfff7d6, 2.2);
  overviewLight.position.set(12, 24, 8);
  overviewLight.visible = false;
  scene.add(overviewLight);
  const avatar = new THREE.Group();
  const avatarMaterial = new THREE.MeshStandardMaterial({color: 0xddd7b3, roughness: 0.8});
  const avatarBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), avatarMaterial);
  avatarBody.position.y = 0.85;
  avatar.add(avatarBody);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), avatarMaterial);
  head.position.y = 1.45;
  avatar.add(head);
  const heading = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 3), new THREE.MeshBasicMaterial({color: 0xf4efaf}));
  heading.rotation.x = -Math.PI / 2;
  heading.position.set(0, 0.12, -0.55);
  avatar.add(heading);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.37, 0.43, 32), new THREE.MeshBasicMaterial({color: 0xf5eab5, side: THREE.DoubleSide}));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  avatar.add(ring);
  avatar.visible = false;
  scene.add(avatar);
  buildWorld();

  function updateLights(time) {
    lightPositions.sort((a, b) => ((a.x - player.x) ** 2 + (a.z - player.z) ** 2) - ((b.x - player.x) ** 2 + (b.z - player.z) ** 2));
    lightPool.forEach((light, index) => {
      light.position.copy(lightPositions[index]);
      light.intensity = 60 * (reducedMotion ? 1 : 0.99 + 0.01 * Math.sin(time * 29 + index));
      light.visible = !overhead;
    });
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = overviewCamera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    overviewCamera.updateProjectionMatrix();
    const distance = EXTENT * 1.65 / Math.min(1, overviewCamera.aspect);
    overviewCamera.far = distance * 3;
    overviewCamera.updateProjectionMatrix();
    overviewCamera.position.set(EXTENT / 2, distance, EXTENT / 2 + distance * 0.62);
    overviewCamera.lookAt(EXTENT / 2, 0, EXTENT / 2);
  }
  addEventListener('resize', resize);
  resize();

  function renderPosition(time, moving) {
    const bob = !reducedMotion && moving && !overhead ? Math.sin(time * 10) * 0.025 : 0;
    camera.position.set(player.x, 1.67 + bob, player.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    avatar.position.set(player.x, 0, player.z);
    avatar.rotation.y = yaw;
  }

  function requestLook() {
    if (touchDevice || overhead) return;
    try {
      const result = canvas.requestPointerLock?.();
      result?.catch(() => notice('Drag to look around, or use the arrow keys.'));
    } catch { notice('Drag to look around, or use the arrow keys.'); }
  }

  function start() {
    if (completed) loadLevel(0);
    started = true;
    paused = false;
    $('intro').hidden = true;
    $('settings').hidden = true;
    $('settings-toggle').setAttribute('aria-expanded', 'false');
    $('crosshair').hidden = overhead;
    $('touch-controls').hidden = !touchDevice;
    document.body.classList.add('playing');
    canvas.focus();
    requestLook();
  }
  $('enter').textContent = 'START';
  $('enter').disabled = false;
  $('enter').addEventListener('click', start);

  function pause() {
    keys.clear();
    if (!started) return;
    paused = true;
    $('intro').hidden = false;
    $('enter').textContent = completed ? 'RESTART' : 'RESUME';
    $('crosshair').hidden = true;
    $('touch-controls').hidden = true;
    document.body.classList.remove('playing');
  }

  function switchView() {
    if (!$('settings').hidden) toggleSettings(false);
    overhead = !overhead;
    if (document.pointerLockElement) document.exitPointerLock();
    if (started && !completed) {
      paused = false;
      $('intro').hidden = true;
      $('touch-controls').hidden = !touchDevice;
      document.body.classList.add('playing');
    }
    ceilingGroup.visible = !overhead;
    avatar.visible = overviewLight.visible = overhead;
    scene.fog.density = overhead ? 0 : 0.014;
    $('view-toggle').setAttribute('aria-pressed', String(overhead));
    $('view-label').textContent = overhead ? 'FIRST PERSON' : 'OVERHEAD';
    $('mode-note').hidden = !overhead;
    $('crosshair').hidden = overhead || !started || paused;
    canvas.focus();
    if (started && !overhead) requestLook();
  }
  $('view-toggle').addEventListener('click', switchView);

  function toggleSettings(open) {
    $('settings').hidden = !open;
    $('settings-toggle').setAttribute('aria-expanded', String(open));
    keys.clear();
    if (open) {
      paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (started && !completed) {
      paused = false;
      $('intro').hidden = true;
      canvas.focus();
    }
  }
  $('settings-toggle').addEventListener('click', () => toggleSettings($('settings').hidden));
  $('settings-close').addEventListener('click', () => toggleSettings(false));
  $('fov').addEventListener('input', event => {
    camera.fov = Number(event.target.value);
    camera.updateProjectionMatrix();
    $('fov-value').textContent = `${camera.fov}\u00b0`;
  });
  $('speed').addEventListener('input', event => {
    walkSpeed = Number(event.target.value);
    $('speed-value').textContent = `${walkSpeed.toFixed(1)} m/s`;
  });
  function resetPlayer() {
    player.x = player.z = CELL / 2;
    yaw = -Math.PI * 0.65; pitch = 0;
    keys.clear();
    toggleSettings(false);
  }
  $('reset').addEventListener('click', resetPlayer);

  function loadLevel(index) {
    levelIndex = index;
    completed = false;
    $('completion').hidden = true;
    layout = createLayout(LEVEL_SEEDS[levelIndex]);
    obstacles = [...layout.walls, ...layout.pillars];
    buildWorld();
    const url = new URL(location.href);
    url.searchParams.delete('seed');
    url.searchParams.set('level', String(levelIndex + 1));
    history.replaceState(null, '', url);
    resetPlayer();
    if (!started) $('enter').textContent = 'START';
  }
  $('level-select').addEventListener('change', event => loadLevel(Number(event.target.value)));

  function enterExit() {
    if (!started || paused || !exitNearby || completed) return;
    if (levelIndex < LEVEL_SEEDS.length - 1) {
      loadLevel(levelIndex + 1);
      notice(`Level ${levelIndex + 1} / 10`);
    } else {
      completed = true;
      $('completion').hidden = false;
      $('exit-action').hidden = true;
      pause();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  $('exit-action').addEventListener('click', enterExit);

  addEventListener('keydown', event => {
    if (/^(INPUT|BUTTON|A)$/.test(event.target.tagName) && event.code !== 'Escape') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyE' && !event.repeat) enterExit();
    else if (event.code === 'KeyM' && !event.repeat) switchView();
    else if (event.code === 'Escape') {
      if (!$('settings').hidden) toggleSettings(false);
      else if (started) { if (document.pointerLockElement) document.exitPointerLock(); pause(); }
    } else keys.add(event.code);
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('blur', () => { keys.clear(); if (started) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); if (started) pause(); } });
  document.addEventListener('pointerlockchange', () => {
    keys.clear();
    // Escape releases capture. View/settings changes intentionally release it too.
    if (!document.pointerLockElement && started && !overhead && $('settings').hidden) pause();
  });
  document.addEventListener('pointerlockerror', () => notice('Mouse capture is unavailable here. Drag to look, or use arrow keys.'));
  document.addEventListener('mousemove', event => {
    if (!paused && !overhead && document.pointerLockElement === canvas) look(event.movementX, event.movementY);
  });
  function look(dx, dy) {
    yaw -= dx * 0.002;
    pitch = Math.max(-1.25, Math.min(1.25, pitch - dy * 0.002));
  }
  canvas.addEventListener('pointerdown', event => {
    if (!started || paused) return;
    canvas.focus();
    if (!overhead && document.pointerLockElement !== canvas) {
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || paused || overhead) return;
    look(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; keys.clear(); });
  canvas.style.touchAction = 'none';
  document.querySelectorAll('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.move); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => keys.delete(button.dataset.move));
  });

  $('sound').addEventListener('click', async () => {
    try {
      if (!audio) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audio = new AudioContext();
        const gain = audio.createGain();
        gain.gain.value = 0.018;
        gain.connect(audio.destination);
        for (const frequency of [60, 120, 180]) {
          const oscillator = audio.createOscillator();
          oscillator.type = frequency === 60 ? 'sine' : 'triangle';
          oscillator.frequency.value = frequency;
          oscillator.connect(gain); oscillator.start();
        }
      }
      soundOn = !soundOn;
      if (soundOn) await audio.resume(); else await audio.suspend();
      $('sound').setAttribute('aria-pressed', String(soundOn));
      $('sound').querySelector('span').textContent = soundOn ? 'ON' : 'OFF';
    } catch { notice('Audio is unavailable in this browser.'); }
  });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); notice('Graphics were interrupted. Reload the page to restart.'); });

  let previousTime = performance.now();
  let lightUpdateTime = -1;
  renderer.setAnimationLoop(now => {
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const time = now / 1000;
    let moving = false;
    if (started && !paused) {
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const turn = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      if (!overhead) yaw -= turn * delta * 1.7;
      const angle = overhead ? 0 : yaw;
      const lateral = overhead ? strafe + turn : strafe;
      const magnitude = Math.hypot(forward, lateral);
      if (magnitude) {
        const distance = walkSpeed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.65 : 1) * delta;
        const dx = (lateral * Math.cos(angle) - forward * Math.sin(angle)) / magnitude * distance;
        const dz = (-lateral * Math.sin(angle) - forward * Math.cos(angle)) / magnitude * distance;
        // Substeps prevent faster movement from tunneling through thin walls.
        const steps = Math.max(1, Math.ceil(distance / 0.1));
        for (let step = 0; step < steps; step++) {
          if (canStand(player.x + dx / steps, player.z, obstacles)) player.x += dx / steps;
          if (canStand(player.x, player.z + dz / steps, obstacles)) player.z += dz / steps;
        }
        if (overhead) yaw = Math.atan2(-dx, -dz);
        moving = true;
      }
    }
    if (time - lightUpdateTime > 0.12) { updateLights(time); lightUpdateTime = time; }
    exitNearby = Math.hypot(player.x - layout.exit.x, player.z - layout.exit.z) < 1.05;
    $('exit-action').hidden = !exitNearby || !started || paused || completed;
    renderPosition(time, moving);
    renderer.render(scene, overhead ? overviewCamera : camera);
  });
}
