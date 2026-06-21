import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { StereoEffect } from 'three/addons/effects/StereoEffect.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// Minimal device-orientation look control (the old three.js addon of this
// name was removed from the library; this replaces it for cardboard mode).
class DeviceOrientationControls {
  constructor(object) {
    this.object = object;
    this.enabled = true;
    this.deviceOrientation = null;
    this.screenOrientation = window.orientation || 0;
    this._onDeviceOrientation = (e) => { this.deviceOrientation = e; };
    this._onScreenOrientation = () => { this.screenOrientation = window.orientation || 0; };
    window.addEventListener('deviceorientation', this._onDeviceOrientation);
    window.addEventListener('orientationchange', this._onScreenOrientation);
  }
  update() {
    if (!this.enabled || !this.deviceOrientation) return;
    const alpha = THREE.MathUtils.degToRad(this.deviceOrientation.alpha || 0);
    const beta = THREE.MathUtils.degToRad(this.deviceOrientation.beta || 0);
    const gamma = THREE.MathUtils.degToRad(this.deviceOrientation.gamma || 0);
    const orient = THREE.MathUtils.degToRad(this.screenOrientation || 0);
    const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
    this.object.quaternion.setFromEuler(euler);
    this.object.quaternion.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)));
    this.object.quaternion.multiply(new THREE.Quaternion(0, 0, 0, 1).setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient));
  }
  dispose() {
    window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    window.removeEventListener('orientationchange', this._onScreenOrientation);
  }
}

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch-device');
}

const canvas = document.getElementById('game');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');
const healthEl = document.getElementById('health');
const weaponNameEl = document.getElementById('weapon-name');
const gearNameEl = document.getElementById('gear-name');
const ammoModeEl = document.getElementById('ammo-mode');
const healthBarFillEl = document.getElementById('health-bar-fill');
const topHealthFillEl = document.getElementById('top-health-fill');
const topArmorFillEl = document.getElementById('top-armor-fill');
const crosshair = document.getElementById('crosshair');
const cardboardBtn = document.getElementById('cardboard-btn');
const damageFlash = document.getElementById('damage-flash');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
document.getElementById('vr-button-container').appendChild(VRButton.createButton(renderer));

const stereoEffect = new StereoEffect(renderer);
stereoEffect.setSize(window.innerWidth, window.innerHeight);
stereoEffect.eyeSeparation = 0.064;

const composer = new EffectComposer(renderer);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength
  0.4,  // radius
  0.86  // threshold — only the brightest highlights (sky, muzzle flash, lenses) bloom
);

let cardboardMode = false;
let orientationControls = null;

cardboardBtn.addEventListener('click', async () => {
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch (e) {
      // permission denied or unsupported; cardboard mode still works via touch/mouse look
    }
  }
  cardboardMode = !cardboardMode;
  document.body.classList.toggle('cardboard-mode', cardboardMode);
  cardboardBtn.textContent = cardboardMode ? 'EXIT CARDBOARD' : 'CARDBOARD VR';

  if (cardboardMode && !orientationControls) {
    orientationControls = new DeviceOrientationControls(camera);
  }
  if (canvas.requestFullscreen) canvas.requestFullscreen().catch(() => {});
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c7d2);
scene.fog = new THREE.Fog(0xb9c7d2, 28, 75);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

// Player rig: in VR the camera is parented to this so we can move/teleport the player.
const rig = new THREE.Group();
rig.position.set(0, 1.6, 6);
rig.add(camera);
scene.add(rig);

composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 0.6;
ssaoPass.minDistance = 0.0008;
ssaoPass.maxDistance = 0.06;
composer.addPass(ssaoPass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  stereoEffect.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  ssaoPass.setSize(window.innerWidth, window.innerHeight);
});

// --- Procedural surface textures (no external image assets available) ---
// Generates a tileable noise/grain canvas texture so flat-colored boxes read
// as concrete/metal/wood instead of pure solid color.
function makeSurfaceTexture({ base, grain = 18, streaks = 0, size = 256 }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const [r, g, b] = base;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * grain;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);
  if (streaks > 0) {
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < streaks; i++) {
      ctx.strokeStyle = Math.random() > 0.5 ? '#000' : '#fff';
      ctx.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (Math.random() - 0.5) * 40);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function makeRoughnessTexture(size = 512, base = 200, grain = 50) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, base + (Math.random() - 0.5) * grain));
    imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = v;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
// Reuses a roughness-style grayscale buffer as a cheap bump map so flat
// faces pick up faint relief under the directional light instead of
// looking perfectly smooth.
function makeBumpTexture(size = 512, grain = 70, blotches = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * grain;
    imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < blotches; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 4 + Math.random() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const maxAniso = renderer.capabilities.getMaxAnisotropy();
function tile(tex, x, y) {
  tex.repeat.set(x, y);
  tex.anisotropy = maxAniso;
  return tex;
}

const concreteMap = tile(makeSurfaceTexture({ base: [122, 138, 147], grain: 26, streaks: 16, size: 512 }), 8, 8);
const concreteRough = tile(makeRoughnessTexture(512, 215, 45), 8, 8);
const concreteBump = tile(makeBumpTexture(512, 60, 30), 8, 8);

const metalMap = tile(makeSurfaceTexture({ base: [154, 167, 175], grain: 20, streaks: 22, size: 512 }), 3, 1.5);
const metalRough = tile(makeRoughnessTexture(512, 110, 70), 3, 1.5);
const metalBump = tile(makeBumpTexture(512, 90, 40), 3, 1.5);

const woodMap = tile(makeSurfaceTexture({ base: [122, 90, 54], grain: 30, streaks: 24, size: 512 }), 2, 2);
const woodBump = tile(makeBumpTexture(512, 50, 14), 2, 2);

// --- Room (Refinery-inspired blockout: floor, walls, pipe cover) ---
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: concreteMap,
    roughnessMap: concreteRough,
    bumpMap: concreteBump,
    bumpScale: 0.04,
    roughness: 1,
    metalness: 0.05,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: metalMap,
  roughnessMap: metalRough,
  bumpMap: metalBump,
  bumpScale: 0.03,
  roughness: 1,
  metalness: 0.15,
});
function addWall(x, z, w, d, h = 4) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  wall.position.set(x, h / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
  return wall;
}
const obstacles = [];
obstacles.push(addWall(0, -20, 40, 1));
obstacles.push(addWall(0, 20, 40, 1));
obstacles.push(addWall(-20, 0, 1, 40));
obstacles.push(addWall(20, 0, 1, 40));

const pipeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: metalMap,
  roughnessMap: metalRough,
  bumpMap: metalBump,
  bumpScale: 0.02,
  roughness: 0.6,
  metalness: 0.7,
});
for (let i = 0; i < 6; i++) {
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 12), pipeMat);
  pipe.position.set(-8 + i * 3, 1.5, -2 + (i % 2) * 2);
  pipe.castShadow = true;
  pipe.receiveShadow = true;
  scene.add(pipe);
  obstacles.push(pipe);
}

const hemi = new THREE.HemisphereLight(0xdfe8ee, 0x8a8270, 1.0);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xc9d4da, 0.4);
scene.add(ambient);
// Low, slightly warm overcast-industrial sun (matches a hazy refinery sky).
const dirLight = new THREE.DirectionalLight(0xfff2d8, 2.6);
dirLight.position.set(18, 22, -8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
dirLight.shadow.bias = -0.001;
scene.add(dirLight);
// Cool bounce/fill light from the opposite side so shadows aren't pure black.
const fillLight = new THREE.DirectionalLight(0xaecbe0, 0.5);
fillLight.position.set(-12, 8, 14);
scene.add(fillLight);

// --- Map dressing: crates, barriers, distant skyline for depth/realism ---
const crateMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: woodMap,
  bumpMap: woodBump,
  bumpScale: 0.05,
  roughness: 0.95,
  metalness: 0.02,
});
function addCrate(x, z, size = 1.1) {
  const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  crate.position.set(x, size / 2, z);
  crate.castShadow = true;
  crate.receiveShadow = true;
  scene.add(crate);
  obstacles.push(crate);
  return crate;
}
[[6, 4], [7.5, 5.5], [-10, 8], [4, -9], [-5, -11], [12, -3], [-14, 2]].forEach(([x, z]) => addCrate(x, z));

const barrierMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: metalMap,
  roughnessMap: metalRough,
  bumpMap: metalBump,
  bumpScale: 0.025,
  roughness: 0.85,
  metalness: 0.2,
});
function addBarrier(x, z, w = 2.4, rotY = 0) {
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, 0.3), barrierMat);
  barrier.position.set(x, 0.55, z);
  barrier.rotation.y = rotY;
  barrier.castShadow = true;
  barrier.receiveShadow = true;
  scene.add(barrier);
  obstacles.push(barrier);
  return barrier;
}
addBarrier(-3, 6, 3, 0.3);
addBarrier(9, -8, 3, -0.4);
addBarrier(-12, -6, 3.5, 0.6);

// --- Storage tanks + elevated catwalk (refinery set-dressing) ---
const tankMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: metalMap,
  roughnessMap: metalRough,
  bumpMap: metalBump,
  bumpScale: 0.03,
  roughness: 0.5,
  metalness: 0.65,
});
function addStorageTank(x, z, radius = 2.2, height = 5) {
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), tankMat);
  tank.position.set(x, height / 2, z);
  tank.castShadow = true;
  tank.receiveShadow = true;
  scene.add(tank);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), tankMat);
  dome.position.set(x, height, z);
  dome.castShadow = true;
  scene.add(dome);
  obstacles.push(tank);
  return tank;
}
addStorageTank(-16, -14, 2.4, 6);
addStorageTank(-13, -15.5, 1.8, 4.5);
addStorageTank(15, 13, 2.2, 5.5);

const railMatDress = new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.7, metalness: 0.4 });
function addCatwalk(x, z, length = 6, rotY = 0, deckHeight = 3) {
  const group = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, length), railMatDress);
  deck.position.y = deckHeight;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  for (const side of [-0.65, 0.65]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, length), railMatDress);
    rail.position.set(side, deckHeight + 0.35, 0);
    group.add(rail);
  }
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, deckHeight, 8), railMatDress);
    leg.position.set(i < 2 ? -0.6 : 0.6, deckHeight / 2, -length / 2 + (i % 2) * length);
    leg.castShadow = true;
    group.add(leg);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}
addCatwalk(7, 5, 7, Math.PI / 2);
addCatwalk(-9, -8, 6, 0.3);

const skylineMat = new THREE.MeshStandardMaterial({ color: 0x6f7d86, roughness: 1, fog: true });
for (let i = 0; i < 14; i++) {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 36 + Math.random() * 6;
  const h = 8 + Math.random() * 18;
  const bld = new THREE.Mesh(new THREE.BoxGeometry(6 + Math.random() * 4, h, 6 + Math.random() * 4), skylineMat);
  bld.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
  scene.add(bld);
}

// --- Humanoid soldiers (PMC teams, no blood: white-flash + spark burst on hit) ---
const enemyHitMeshes = [];
const enemies = [];
const allies = [];
const TEAM_PALETTES = {
  enemy: { camo: [0x4b5320, 0x3c4a3a, 0x5a5042, 0x44473e], armband: 0xb33a3a },
  ally: { camo: [0x35506b, 0x2d4a63, 0x3c5b78, 0x33495e], armband: 0x3a7fd9 },
};
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.8 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.3, metalness: 0.4 });
const vestMat = new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.85 });
const bootMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

function buildSoldier(team) {
  const palette = TEAM_PALETTES[team];
  const group = new THREE.Group();
  const uniformMat = new THREE.MeshStandardMaterial({
    color: palette.camo[Math.floor(Math.random() * palette.camo.length)],
    roughness: 0.85,
    metalness: 0.05,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.85, 4, 8), uniformMat);
  torso.position.y = 1.1;
  group.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.22), vestMat);
  vest.position.set(0, 1.2, 0.04);
  group.add(vest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skinMat);
  head.position.y = 1.75;
  group.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), vestMat);
  helmet.position.y = 1.8;
  group.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.05), visorMat);
  visor.position.set(0, 1.78, 0.18);
  group.add(visor);

  const armGeo = new THREE.CapsuleGeometry(0.09, 0.6, 4, 6);
  const armL = new THREE.Mesh(armGeo, uniformMat);
  armL.position.set(-0.4, 1.15, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, uniformMat);
  armR.position.set(0.4, 1.15, 0);
  group.add(armR);

  const armbandMat = new THREE.MeshStandardMaterial({ color: palette.armband, roughness: 0.6 });
  const armband = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), armbandMat);
  armband.rotation.z = Math.PI / 2;
  armband.position.set(0.4, 1.35, 0);
  group.add(armband);

  const legGeo = new THREE.CapsuleGeometry(0.11, 0.7, 4, 6);
  const legL = new THREE.Mesh(legGeo, uniformMat.clone());
  legL.position.set(-0.15, 0.4, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, uniformMat.clone());
  legR.position.set(0.15, 0.4, 0);
  group.add(legR);

  const bootGeo = new THREE.BoxGeometry(0.14, 0.12, 0.24);
  const bootL = new THREE.Mesh(bootGeo, bootMat);
  bootL.position.set(-0.15, 0.06, 0.04);
  group.add(bootL);
  const bootR = new THREE.Mesh(bootGeo, bootMat);
  bootR.position.set(0.15, 0.06, 0.04);
  group.add(bootR);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.soldierRoot = group;
      if (team === 'enemy') enemyHitMeshes.push(child);
    }
  });

  group.userData = {
    team,
    hp: 100,
    maxHp: 100,
    alive: true,
    fireDelay: 1.4 + Math.random() * 0.8,
    lastShot: -999,
    spawnPos: new THREE.Vector3(),
    wanderTarget: new THREE.Vector3(),
    wanderTimer: 0,
    legPhase: Math.random() * Math.PI * 2,
    legL, legR, armL, armR,
  };

  return group;
}

function placeEnemy(group) {
  const pos = new THREE.Vector3((Math.random() - 0.5) * 32, 0, (Math.random() - 0.5) * 32 - 4);
  group.position.copy(pos);
  group.userData.spawnPos.copy(pos);
  group.userData.wanderTarget.copy(pos);
}

for (let i = 0; i < 5; i++) {
  const enemy = buildSoldier('enemy');
  placeEnemy(enemy);
  scene.add(enemy);
  enemies.push(enemy);
}

// Offsets are in player-facing space: negative z = ahead of the player (visible
// on spawn, since the camera looks down -Z by default), positive z = trailing.
const ALLY_OFFSETS = [
  new THREE.Vector3(-2.0, 0, -1.5),
  new THREE.Vector3(2.0, 0, -1.5),
  new THREE.Vector3(0, 0, 1.8),
];
for (let i = 0; i < ALLY_OFFSETS.length; i++) {
  const ally = buildSoldier('ally');
  ally.position.set(rig.position.x + ALLY_OFFSETS[i].x, 0, rig.position.z + ALLY_OFFSETS[i].z);
  ally.userData.lastShot = -999;
  scene.add(ally);
  allies.push(ally);
}

function animateWalkCycle(soldier, dt, moving) {
  const ud = soldier.userData;
  if (moving) {
    ud.legPhase += dt * 6;
    const swing = Math.sin(ud.legPhase) * 0.5;
    ud.legL.rotation.x = swing;
    ud.legR.rotation.x = -swing;
    ud.armL.rotation.x = -swing;
    ud.armR.rotation.x = swing;
  } else {
    ud.legL.rotation.x *= 0.8;
    ud.legR.rotation.x *= 0.8;
    ud.armL.rotation.x *= 0.8;
    ud.armR.rotation.x *= 0.8;
  }
}

function damageEnemyRoot(root, dmg) {
  if (!root || !root.userData.alive) return;
  root.userData.hp -= dmg;
  spawnSparks(root.position.clone().add(new THREE.Vector3(0, 1.3, 0)));
  if (root.userData.hp <= 0) {
    root.userData.alive = false;
    root.visible = false;
    if (root.userData.team === 'enemy') {
      score += 50;
      updateHud();
    }
    setTimeout(() => {
      if (root.userData.team === 'enemy') placeEnemy(root);
      else root.position.copy(rig.position);
      root.userData.hp = root.userData.maxHp;
      root.userData.alive = true;
      root.visible = true;
    }, 3000);
  }
}

function damageEnemy(mesh, dmg) {
  damageEnemyRoot(mesh.userData.soldierRoot, dmg);
}

const enemyRaycaster = new THREE.Raycaster();

function hasLineOfSight(fromPos, toPos) {
  const dir = new THREE.Vector3().subVectors(toPos, fromPos);
  const dist = dir.length();
  dir.normalize();
  enemyRaycaster.set(fromPos, dir);
  enemyRaycaster.far = dist;
  const hits = enemyRaycaster.intersectObjects(obstacles, false);
  return hits.length === 0;
}

// Resolves whether a shot fired from muzzlePos toward targetPos (with accuracy
// spread) actually connects with a hit-radius around targetPos.
function resolveHit(muzzlePos, targetPos, dist, spreadScale) {
  const spread = Math.min(0.35, dist * spreadScale);
  const aimDir = new THREE.Vector3().subVectors(targetPos, muzzlePos).normalize();
  aimDir.x += (Math.random() - 0.5) * spread;
  aimDir.y += (Math.random() - 0.5) * spread;
  aimDir.normalize();
  const hitRadius = 0.4;
  const closestApproach = new THREE.Line3(muzzlePos, muzzlePos.clone().addScaledVector(aimDir, 30))
    .closestPointToPoint(targetPos, true, new THREE.Vector3())
    .distanceTo(targetPos);
  return closestApproach < hitRadius;
}

function updateEnemies(dt) {
  const playerPos = rig.position;
  const playerEye = playerPos.clone().setY(1.6);
  const now = clock.elapsedTime;
  for (const enemy of enemies) {
    if (!enemy.userData.alive) continue;
    const ud = enemy.userData;
    if (ud.stunnedUntil && now < ud.stunnedUntil) continue;

    // Pick the nearest visible target: the player or a living ally.
    let target = null, targetDist = Infinity, targetIsPlayer = false, targetAlly = null;
    const distToPlayer = enemy.position.distanceTo(playerPos);
    if (distToPlayer < 20 && hasLineOfSight(enemy.position.clone().add(new THREE.Vector3(0, 1.5, 0)), playerEye)) {
      target = playerEye; targetDist = distToPlayer; targetIsPlayer = true;
    }
    for (const ally of allies) {
      if (!ally.userData.alive) continue;
      const d = enemy.position.distanceTo(ally.position);
      if (d < targetDist && d < 16 && hasLineOfSight(enemy.position.clone().add(new THREE.Vector3(0, 1.5, 0)), ally.position.clone().add(new THREE.Vector3(0, 1.4, 0)))) {
        target = ally.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        targetDist = d;
        targetIsPlayer = false;
        targetAlly = ally;
      }
    }

    let moving = false;
    if (target) {
      const angle = Math.atan2(target.x - enemy.position.x, target.z - enemy.position.z);
      enemy.rotation.y = angle;

      // Hold ground and strafe sideways a little for more lifelike combat movement.
      ud.wanderTimer -= dt;
      if (ud.wanderTimer <= 0) {
        ud.wanderTimer = 1 + Math.random() * 1.5;
        const strafe = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar((Math.random() - 0.5) * 3);
        ud.wanderTarget.copy(enemy.position).add(strafe);
      }
      const toStrafe = new THREE.Vector3().subVectors(ud.wanderTarget, enemy.position);
      if (toStrafe.length() > 0.2) {
        toStrafe.normalize();
        enemy.position.addScaledVector(toStrafe, 1.1 * dt);
        moving = true;
      }

      const muzzlePos = enemy.position.clone().add(new THREE.Vector3(0, 1.5, 0.3));
      const offCooldown = now - ud.lastShot > ud.fireDelay;
      const inRange = targetDist < 20 && targetDist > 1.2;
      if (inRange && offCooldown) {
        ud.lastShot = now;
        spawnSparks(muzzlePos);
        playMuzzleSound();
        if (resolveHit(muzzlePos, target, targetDist, 0.02)) {
          if (targetIsPlayer) damagePlayer(6 + Math.random() * 6);
          else if (targetAlly) damageEnemyRoot(targetAlly, 8 + Math.random() * 8);
        }
      }
    } else {
      // Idle patrol near spawn point.
      ud.wanderTimer -= dt;
      if (ud.wanderTimer <= 0) {
        ud.wanderTimer = 3 + Math.random() * 3;
        ud.wanderTarget.copy(ud.spawnPos).add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
      }
      const toTarget = new THREE.Vector3().subVectors(ud.wanderTarget, enemy.position);
      if (toTarget.length() > 0.3) {
        toTarget.normalize();
        enemy.rotation.y = Math.atan2(toTarget.x, toTarget.z);
        enemy.position.addScaledVector(toTarget, 0.8 * dt);
        moving = true;
      }
    }

    enemy.position.x = Math.max(-19, Math.min(19, enemy.position.x));
    enemy.position.z = Math.max(-19, Math.min(19, enemy.position.z));
    animateWalkCycle(enemy, dt, moving);
  }
}

function updateAllies(dt) {
  const playerPos = rig.position;
  const playerFacing = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  playerFacing.y = 0; playerFacing.normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  right.y = 0; right.normalize();
  const now = clock.elapsedTime;

  allies.forEach((ally, i) => {
    if (!ally.userData.alive) return;
    const ud = ally.userData;
    const offset = ALLY_OFFSETS[i];
    const formationPos = playerPos.clone()
      .addScaledVector(playerFacing, -offset.z)
      .addScaledVector(right, offset.x);
    formationPos.y = 0;

    const toFormation = new THREE.Vector3().subVectors(formationPos, ally.position);
    let moving = false;
    if (toFormation.length() > 0.6) {
      const dir = toFormation.clone().normalize();
      ally.position.addScaledVector(dir, Math.min(toFormation.length(), 4.5 * dt));
      ally.rotation.y = Math.atan2(dir.x, dir.z);
      moving = true;
    }

    // Find nearest living enemy with line of sight and fire at it.
    let nearest = null, nearestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.userData.alive) continue;
      const d = ally.position.distanceTo(enemy.position);
      if (d < nearestDist && d < 18) {
        nearest = enemy; nearestDist = d;
      }
    }
    if (nearest) {
      const muzzlePos = ally.position.clone().add(new THREE.Vector3(0, 1.5, 0.3));
      const targetPos = nearest.position.clone().add(new THREE.Vector3(0, 1.3, 0));
      if (hasLineOfSight(muzzlePos, targetPos)) {
        if (!moving) ally.rotation.y = Math.atan2(targetPos.x - ally.position.x, targetPos.z - ally.position.z);
        const offCooldown = now - ud.lastShot > ud.fireDelay;
        if (offCooldown) {
          ud.lastShot = now;
          spawnSparks(muzzlePos);
          playMuzzleSound();
          if (resolveHit(muzzlePos, targetPos, nearestDist, 0.02)) {
            damageEnemyRoot(nearest, 10 + Math.random() * 8);
          }
        }
      }
    }

    ally.position.x = Math.max(-19, Math.min(19, ally.position.x));
    ally.position.z = Math.max(-19, Math.min(19, ally.position.z));
    animateWalkCycle(ally, dt, moving);
  });
}

// --- Player health ---
let playerHealth = 100;
let playerAlive = true;
const playerSpawn = new THREE.Vector3(0, 1.6, 6);

function damagePlayer(amount) {
  if (!playerAlive) return;
  playerHealth = Math.max(0, playerHealth - amount);
  updateHud();
  damageFlash.style.background = 'rgba(220,30,30,0.35)';
  setTimeout(() => (damageFlash.style.background = 'rgba(220,30,30,0)'), 90);
  if (playerHealth <= 0) {
    playerAlive = false;
    setTimeout(() => {
      playerHealth = playerMaxHealth;
      playerAlive = true;
      rig.position.copy(playerSpawn);
      updateHud();
    }, 2000);
  }
}

// --- Spark VFX (replaces blood) ---
const sparkGroup = new THREE.Group();
scene.add(sparkGroup);
function spawnSparks(position) {
  const geo = new THREE.BufferGeometry();
  const count = 24;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities.push(new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 4,
      (Math.random() - 0.5) * 4
    ));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 });
  const points = new THREE.Points(geo, mat);
  points.userData = { velocities, life: 0.6 };
  sparkGroup.add(points);
}

// --- Weapons (stats from the Tactical Breach design doc) ---
const WEAPONS = [
  { name: 'MP-Sidearm', damage: 34, fireDelay: 0.18, magSize: 12, reloadTime: 1.0, recoil: 0.01, aimFov: 55, barrelLen: 0.35, mode: 'SEMI' },
  { name: 'PDX-9 SMG', damage: 25, fireDelay: 0.09, magSize: 30, reloadTime: 1.4, recoil: 0.012, aimFov: 50, barrelLen: 0.5, mode: 'AUTO' },
  { name: 'AR-15K', damage: 40, fireDelay: 0.11, magSize: 30, reloadTime: 1.8, recoil: 0.018, aimFov: 45, barrelLen: 0.75, mode: 'AUTO' },
  { name: 'SR-50 Sniper', damage: 100, fireDelay: 0.9, magSize: 5, reloadTime: 2.2, recoil: 0.05, aimFov: 20, barrelLen: 1.0, mode: 'BOLT' },
];
WEAPONS.forEach((w) => (w.ammo = w.magSize));

// --- Gear (from the Tactical Breach design doc) ---
const GEAR = [
  { name: 'Smart Smoke', effect: 'Smoke + blocks thermal 8s', active: true, cooldown: 10 },
  { name: 'Breach Charge', effect: 'Destroys a wall/door segment', active: true, cooldown: 12 },
  { name: 'Recon Drone', effect: 'Reveals enemies in radius 5s', active: true, cooldown: 12 },
  { name: 'EMP Grenade', effect: 'Disables gadgets/drones, no dmg', active: true, cooldown: 10 },
  { name: 'Flash-Stun', effect: 'Blinds + slows, no damage', active: true, cooldown: 10 },
  { name: 'Armor (Light)', effect: '+50 effective HP', active: false, hpBonus: 50 },
  { name: 'Armor (Heavy)', effect: '+100 HP, -10% mobility', active: false, hpBonus: 100, speedMult: 0.9 },
  { name: 'Defuse Kit', effect: 'Halves defuse time', active: false },
];

let weaponIndex = 0;
function currentWeapon() {
  return WEAPONS[weaponIndex];
}

// --- Equipped gear (set on the ready screen) ---
let equippedGear = [];
let gearIndex = -1;
const gearCooldowns = {};
let playerSpeedMult = 1;
let playerMaxHealth = 100;
function activeGearList() {
  return equippedGear.filter((i) => GEAR[i].active);
}
function currentGear() {
  const list = activeGearList();
  if (gearIndex < 0 || !list.length) return null;
  return GEAR[list[gearIndex % list.length]];
}

// --- First-person weapon view-models ---
const viewModelRig = new THREE.Group();
viewModelRig.position.set(0.22, -0.2, -0.4);
camera.add(viewModelRig);

const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.4, roughness: 0.5 });
const scopeMat = new THREE.MeshStandardMaterial({ color: 0x161616, metalness: 0.6, roughness: 0.35 });
const lensMat = new THREE.MeshBasicMaterial({ color: 0x2eff6b });
const sniperLensMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff });

function addReflexSight(group, bodyTopY) {
  // Low-profile red/green-dot reflex sight, sits just above the receiver.
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.05), scopeMat);
  mount.position.set(0, bodyTopY + 0.009, -0.04);
  group.add(mount);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.032, 0.06), scopeMat);
  housing.position.set(0, bodyTopY + 0.034, -0.04);
  group.add(housing);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), lensMat);
  lens.position.set(0, bodyTopY + 0.034, -0.07);
  group.add(lens);
}

function addSniperScope(group, bodyTopY, barrelLen) {
  // Long tube scope with two adjustment turrets, mounted along the top rail.
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.32, 12), scopeMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, bodyTopY + 0.05, -0.18);
  group.add(tube);
  const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), sniperLensMat);
  frontLens.position.set(0, bodyTopY + 0.05, -0.34);
  group.add(frontLens);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), scopeMat);
  turret.position.set(0, bodyTopY + 0.08, -0.18);
  group.add(turret);
  const sideTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), scopeMat);
  sideTurret.rotation.z = Math.PI / 2;
  sideTurret.position.set(0.02, bodyTopY + 0.05, -0.1);
  group.add(sideTurret);
}

const railMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.5, roughness: 0.6 });
const magMat = new THREE.MeshStandardMaterial({ color: 0x232323, metalness: 0.3, roughness: 0.7 });

const gunMeshes = WEAPONS.map((w) => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.3), gunMat);
  group.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w.barrelLen, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.15 - w.barrelLen / 2);
  group.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.07), gunMat);
  grip.position.set(0, -0.13, 0.08);
  group.add(grip);

  // Top rail strip for a more detailed silhouette.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.22), railMat);
  rail.position.set(0, 0.058, -0.08);
  group.add(rail);

  const isRifle = w.mode !== 'SEMI' || w.magSize > 12;
  if (isRifle) {
    // Curved magazine and a forward grip/handguard for the long guns.
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.06), magMat);
    mag.position.set(0, -0.16, -0.02);
    mag.rotation.x = -0.18;
    group.add(mag);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, w.barrelLen * 0.55), railMat);
    handguard.position.set(0, 0.0, -0.15 - w.barrelLen * 0.2);
    group.add(handguard);
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), gunMat);
    foregrip.position.set(0, -0.08, -0.15 - w.barrelLen * 0.4);
    group.add(foregrip);
  }
  if (w.mode === 'BOLT') {
    // Stock extends back for the sniper rifle's silhouette.
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.22), gunMat);
    stock.position.set(0, -0.02, 0.26);
    group.add(stock);
  }

  if (w.mode === 'BOLT') {
    addSniperScope(group, 0.05, w.barrelLen);
  } else {
    addReflexSight(group, 0.05);
  }

  group.visible = false;
  viewModelRig.add(group);
  return group;
});

const muzzleFlashLight = new THREE.PointLight(0xffdd88, 0, 4);
viewModelRig.add(muzzleFlashLight);
const muzzleFlashMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.04, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 })
);
viewModelRig.add(muzzleFlashMesh);

function updateViewModel() {
  gunMeshes.forEach((m, i) => (m.visible = i === weaponIndex));
  const w = currentWeapon();
  const barrelTip = -0.15 - w.barrelLen;
  muzzleFlashLight.position.set(0, 0.02, barrelTip);
  muzzleFlashMesh.position.set(0, 0.02, barrelTip);
}
updateViewModel();

function flashMuzzle() {
  muzzleFlashLight.intensity = 3.5;
  muzzleFlashMesh.material.opacity = 1;
  setTimeout(() => {
    muzzleFlashLight.intensity = 0;
    muzzleFlashMesh.material.opacity = 0;
  }, 45);
}

// --- Recoil (kicks aim up, recovers over time) ---
let recoilKick = 0;
function applyRecoil(amount) {
  recoilKick += amount;
}

// --- ADS (aim down sights) ---
let aiming = false;
const baseFov = 70;

// --- Synthesized audio (no external assets) ---
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playGunshot() {
  const ctx = getAudioCtx();
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start();
}
function playMuzzleSound() {
  playGunshot();
}
function playReloadSound() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 420;
  const gain = ctx.createGain();
  gain.gain.value = 0.08;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}
let lastFootstep = 0;
function playFootstep() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 90 + Math.random() * 20;
  const gain = ctx.createGain();
  gain.gain.value = 0.06;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.stop(ctx.currentTime + 0.08);
}

let reloading = false;
let lastFireTime = -999;
const raycaster = new THREE.Raycaster();
let score = 0;
let gameReady = false;

// --- Loadout / ready screen ---
const loadoutScreen = document.getElementById('loadout-screen');
const loadoutList = document.getElementById('loadout-list');
const gearList = document.getElementById('gear-list');
const readyBtn = document.getElementById('ready-btn');
const weaponCategoryBtn = document.getElementById('weapon-category');
const gearCategoryBtn = document.getElementById('gear-category');
const weaponCategoryValue = document.getElementById('weapon-category-value');
const gearCategoryValue = document.getElementById('gear-category-value');
let selectedLoadoutIndex = 0;
const selectedGear = new Set();

weaponCategoryBtn.addEventListener('click', () => {
  const expanded = loadoutList.classList.toggle('expanded');
  weaponCategoryBtn.setAttribute('aria-expanded', String(expanded));
  gearList.classList.remove('expanded');
  gearCategoryBtn.setAttribute('aria-expanded', 'false');
});
gearCategoryBtn.addEventListener('click', () => {
  const expanded = gearList.classList.toggle('expanded');
  gearCategoryBtn.setAttribute('aria-expanded', String(expanded));
  loadoutList.classList.remove('expanded');
  weaponCategoryBtn.setAttribute('aria-expanded', 'false');
});

function renderLoadoutScreen() {
  weaponCategoryValue.textContent = WEAPONS[selectedLoadoutIndex].name;
  gearCategoryValue.textContent = selectedGear.size
    ? Array.from(selectedGear).map(i => GEAR[i].name).join(', ')
    : 'None';

  loadoutList.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const card = document.createElement('div');
    card.className = 'loadout-card' + (i === selectedLoadoutIndex ? ' selected' : '');
    card.innerHTML = `
      <h3>${w.name}</h3>
      <div>Damage: ${w.damage}</div>
      <div>Fire delay: ${w.fireDelay}s</div>
      <div>Mag: ${w.magSize}</div>
      <div>Reload: ${w.reloadTime}s</div>
    `;
    card.addEventListener('click', () => {
      selectedLoadoutIndex = i;
      renderLoadoutScreen();
      loadoutList.classList.add('expanded');
      weaponCategoryBtn.setAttribute('aria-expanded', 'true');
    });
    loadoutList.appendChild(card);
  });

  gearList.innerHTML = '';
  GEAR.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = 'loadout-card' + (selectedGear.has(i) ? ' selected' : '');
    card.innerHTML = `
      <h3>${g.name}</h3>
      <div>${g.effect}</div>
    `;
    card.addEventListener('click', () => {
      if (selectedGear.has(i)) selectedGear.delete(i);
      else selectedGear.add(i);
      renderLoadoutScreen();
      gearList.classList.add('expanded');
      gearCategoryBtn.setAttribute('aria-expanded', 'true');
    });
    gearList.appendChild(card);
  });
}
renderLoadoutScreen();

readyBtn.addEventListener('click', () => {
  weaponIndex = selectedLoadoutIndex;
  equippedGear = Array.from(selectedGear);
  gearIndex = activeGearList().length ? 0 : -1;
  playerMaxHealth = 100;
  playerSpeedMult = 1;
  equippedGear.forEach((i) => {
    const g = GEAR[i];
    if (g.hpBonus) playerMaxHealth += g.hpBonus;
    if (g.speedMult) playerSpeedMult *= g.speedMult;
  });
  playerHealth = playerMaxHealth;
  updateHud();
  updateViewModel();
  loadoutScreen.style.display = 'none';
  document.body.classList.remove('game-hidden');
  gameReady = true;
  if (!renderer.xr.isPresenting && canvas.requestPointerLock) {
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  }
});

function updateHud() {
  const w = currentWeapon();
  weaponNameEl.textContent = w.name;
  ammoEl.textContent = reloading ? '...' : `${w.ammo}/${w.magSize}`;
  ammoModeEl.textContent = w.mode;
  scoreEl.textContent = String(score);
  healthEl.textContent = String(Math.ceil(playerHealth));
  const healthPct = Math.max(0, Math.min(1, playerHealth / playerMaxHealth)) * 100;
  healthBarFillEl.style.width = `${healthPct}%`;
  topHealthFillEl.style.width = `${healthPct}%`;
  const armorBonus = playerMaxHealth - 100;
  topArmorFillEl.style.width = armorBonus > 0 ? `${Math.min(100, (armorBonus / 100) * 100)}%` : '0%';
  const g = currentGear();
  if (!g) {
    gearNameEl.textContent = 'Gear: None';
  } else {
    const cd = gearCooldowns[g.name] || 0;
    const remaining = Math.max(0, cd - clock.elapsedTime);
    gearNameEl.textContent = `Gear: ${g.name}${remaining > 0 ? ` (${remaining.toFixed(1)}s)` : ''}`;
  }
}
updateHud();

function switchWeapon() {
  if (reloading) return;
  weaponIndex = (weaponIndex + 1) % WEAPONS.length;
  updateHud();
  updateViewModel();
}

function cycleGear() {
  const list = activeGearList();
  if (!list.length) return;
  gearIndex = (gearIndex + 1) % list.length;
  updateHud();
}

const smokeGroup = new THREE.Group();
scene.add(smokeGroup);
function spawnSmoke(position) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(3, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.55, depthWrite: false })
  );
  mesh.position.copy(position);
  smokeGroup.add(mesh);
  obstacles.push(mesh);
  setTimeout(() => {
    smokeGroup.remove(mesh);
    obstacles.splice(obstacles.indexOf(mesh), 1);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }, 8000);
}

function breachNearestWall() {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld).normalize();
  raycaster.set(origin, dir);
  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length && hits[0].distance < 5) {
    const obj = hits[0].object;
    scene.remove(obj);
    const idx = obstacles.indexOf(obj);
    if (idx >= 0) obstacles.splice(idx, 1);
  }
}

const revealMarkers = [];
function recon() {
  enemies.forEach((enemy) => {
    if (!enemy.userData.alive) return;
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.3, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    marker.rotation.x = Math.PI;
    marker.position.set(0, 2.1, 0);
    enemy.add(marker);
    revealMarkers.push(marker);
    setTimeout(() => {
      enemy.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
      const idx = revealMarkers.indexOf(marker);
      if (idx >= 0) revealMarkers.splice(idx, 1);
    }, 5000);
  });
}

function stunNearbyEnemies(radius = 12, duration = 4) {
  const playerPos = rig.position;
  const until = clock.elapsedTime + duration;
  enemies.forEach((enemy) => {
    if (!enemy.userData.alive) return;
    if (enemy.position.distanceTo(playerPos) <= radius) {
      enemy.userData.stunnedUntil = until;
    }
  });
}

function useGear() {
  const g = currentGear();
  if (!g || !g.active) return;
  const now = clock.elapsedTime;
  const cdUntil = gearCooldowns[g.name] || 0;
  if (now < cdUntil) return;
  gearCooldowns[g.name] = now + (g.cooldown || 10);

  switch (g.name) {
    case 'Smart Smoke':
      spawnSmoke(camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld).multiplyScalar(3)));
      break;
    case 'Breach Charge':
      breachNearestWall();
      break;
    case 'Recon Drone':
      recon();
      break;
    case 'EMP Grenade':
      stunNearbyEnemies(14, 5);
      break;
    case 'Flash-Stun':
      stunNearbyEnemies(10, 3);
      break;
  }
  updateHud();
}

function fireFrom(originMatrixWorld) {
  if (!gameReady || !playerAlive) return;
  const w = currentWeapon();
  const now = clock.elapsedTime;
  if (reloading || w.ammo <= 0 || now - lastFireTime < w.fireDelay) return;
  lastFireTime = now;
  w.ammo -= 1;
  updateHud();
  flashMuzzle();
  playGunshot();
  applyRecoil(w.recoil);

  const origin = new THREE.Vector3().setFromMatrixPosition(originMatrixWorld);
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(originMatrixWorld).normalize();
  raycaster.set(origin, dir);
  const hits = raycaster.intersectObjects(enemyHitMeshes, false);
  if (hits.length) damageEnemy(hits[0].object, w.damage);

  if (w.ammo === 0) reload();
}

function reload() {
  if (reloading) return;
  const w = currentWeapon();
  if (w.ammo === w.magSize) return;
  reloading = true;
  updateHud();
  playReloadSound();
  setTimeout(() => {
    w.ammo = w.magSize;
    reloading = false;
    updateHud();
  }, w.reloadTime * 1000);
}

// --- Desktop controls: mouse look (pointer lock, with click-drag fallback) + WASD ---
let yaw = 0, pitch = 0;
const moveState = { f: 0, b: 0, l: 0, r: 0 };
let usingPointerLock = false;
let dragLook = false;
let lastMouseX = 0, lastMouseY = 0;

canvas.addEventListener('click', () => {
  if (!renderer.xr.isPresenting && canvas.requestPointerLock) {
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  }
});
document.addEventListener('pointerlockchange', () => {
  usingPointerLock = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (usingPointerLock) {
    yaw -= e.movementX * 0.0025;
    pitch -= e.movementY * 0.0025;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  } else if (dragLook) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    yaw -= dx * 0.0025;
    pitch -= dy * 0.0025;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    aiming = true;
    return;
  }
  if (e.button !== 0) return;
  if (!usingPointerLock) {
    dragLook = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
  fireFrom(camera.matrixWorld);
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 2) aiming = false;
  if (e.button === 0) dragLook = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.f = 1;
  if (k === 's' || k === 'arrowdown') moveState.b = 1;
  if (k === 'a' || k === 'arrowleft') moveState.l = 1;
  if (k === 'd' || k === 'arrowright') moveState.r = 1;
  if (k === ' ') fireFrom(camera.matrixWorld);
  if (k === 'r') reload();
  if (k === 'q' || k === 'v') switchWeapon();
  if (k === 'g') cycleGear();
  if (k === 'f') useGear();
  if (['1', '2', '3', '4'].includes(k)) {
    weaponIndex = Number(k) - 1;
    updateHud();
    updateViewModel();
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.f = 0;
  if (k === 's' || k === 'arrowdown') moveState.b = 0;
  if (k === 'a' || k === 'arrowleft') moveState.l = 0;
  if (k === 'd' || k === 'arrowright') moveState.r = 0;
});

// --- Touch controls (move + look sticks, fire button) ---
let moveVec = { x: 0, y: 0 };
let lookVec = { x: 0, y: 0 };

function setupStick(stickEl, onMove, onEnd) {
  let active = false;
  let touchId = null;
  const knob = stickEl.querySelector('.stick-knob');
  const rect = () => stickEl.getBoundingClientRect();

  function handleStart(e) {
    active = true;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    handleMove(e);
  }
  function handleMove(e) {
    if (!active) return;
    const t = [...e.changedTouches].find((tt) => tt.identifier === touchId);
    if (!t) return;
    const r = rect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const max = r.width / 2;
    const dist = Math.min(Math.hypot(dx, dy), max);
    const angle = Math.atan2(dy, dx);
    dx = Math.cos(angle) * dist;
    dy = Math.sin(angle) * dist;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / max, dy / max);
  }
  function handleEnd() {
    active = false;
    touchId = null;
    knob.style.transform = '';
    if (onEnd) onEnd();
  }

  stickEl.addEventListener('touchstart', handleStart, { passive: true });
  stickEl.addEventListener('touchmove', handleMove, { passive: true });
  stickEl.addEventListener('touchend', handleEnd);
  stickEl.addEventListener('touchcancel', handleEnd);
}

setupStick(
  document.getElementById('stick-move'),
  (x, y) => (moveVec = { x, y }),
  () => (moveVec = { x: 0, y: 0 })
);
setupStick(
  document.getElementById('stick-look'),
  (x, y) => (lookVec = { x, y }),
  () => (lookVec = { x: 0, y: 0 })
);
document.getElementById('fire-btn').addEventListener('touchstart', (e) => {
  e.preventDefault();
  fireFrom(camera.matrixWorld);
});
document.getElementById('switch-btn').addEventListener('touchstart', (e) => {
  e.preventDefault();
  switchWeapon();
});
const gearBtn = document.getElementById('gear-btn');
let gearHoldTimer = null;
gearBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  gearHoldTimer = setTimeout(() => {
    gearHoldTimer = null;
    useGear();
  }, 400);
});
gearBtn.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (gearHoldTimer) {
    clearTimeout(gearHoldTimer);
    gearHoldTimer = null;
    cycleGear();
  }
});
const adsBtn = document.getElementById('ads-btn');
adsBtn.addEventListener('touchstart', (e) => { e.preventDefault(); aiming = true; });
adsBtn.addEventListener('touchend', (e) => { e.preventDefault(); aiming = false; });

// --- VR controllers: trigger to fire, thumbstick to move ---
const controllerModels = [];
function setupController(index) {
  const controller = renderer.xr.getController(index);
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.scale.z = 5;
  controller.add(line);
  controller.addEventListener('selectstart', () => fireFrom(controller.matrixWorld));
  controller.addEventListener('squeezestart', () => switchWeapon());
  rig.add(controller);
  controllerModels.push(controller);
  return controller;
}
setupController(0);
setupController(1);

function getVRThumbstick() {
  const session = renderer.xr.getSession();
  if (!session) return { x: 0, y: 0 };
  for (const source of session.inputSources) {
    if (source.gamepad && source.gamepad.axes.length >= 4) {
      return { x: source.gamepad.axes[2], y: source.gamepad.axes[3] };
    }
  }
  return { x: 0, y: 0 };
}

// --- Update / render loop ---
const clock = new THREE.Clock();

function update(dt) {
  if (!gameReady) return;

  if (!renderer.xr.isPresenting) {
    crosshair.style.display = cardboardMode ? 'none' : 'block';

    recoilKick *= Math.pow(0.05, dt);
    if (cardboardMode && orientationControls) {
      orientationControls.update();
    } else {
      camera.rotation.set(pitch - recoilKick, yaw, 0, 'YXZ');
    }

    const targetFov = aiming ? currentWeapon().aimFov : baseFov;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    viewModelRig.visible = !aiming;

    let dx = (moveState.r - moveState.l) + moveVec.x;
    let dy = (moveState.b - moveState.f) - moveVec.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      right.y = 0; right.normalize();
      const speed = (aiming ? 2.2 : 4.5) * dt * playerSpeedMult;
      rig.position.addScaledVector(forward, -dy * speed);
      rig.position.addScaledVector(right, dx * speed);

      lastFootstep += dt;
      if (lastFootstep > 0.35) {
        lastFootstep = 0;
        playFootstep();
      }
    }

    if (!cardboardMode && Math.hypot(lookVec.x, lookVec.y) > 0.1) {
      yaw -= lookVec.x * dt * 2.5;
      pitch -= lookVec.y * dt * 2.5;
      pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
    }

    rig.position.x = Math.max(-18, Math.min(18, rig.position.x));
    rig.position.z = Math.max(-18, Math.min(18, rig.position.z));
    rig.position.y = 1.6;
  } else {
    crosshair.style.display = 'none';
    const stick = getVRThumbstick();
    if (Math.hypot(stick.x, stick.y) > 0.15) {
      const headQuat = camera.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(headQuat);
      right.y = 0; right.normalize();
      const speed = 3.5 * dt;
      rig.position.addScaledVector(forward, -stick.y * speed);
      rig.position.addScaledVector(right, stick.x * speed);
      rig.position.x = Math.max(-18, Math.min(18, rig.position.x));
      rig.position.z = Math.max(-18, Math.min(18, rig.position.z));
    }
  }

  updateEnemies(dt);
  updateAllies(dt);

  for (let i = sparkGroup.children.length - 1; i >= 0; i--) {
    const points = sparkGroup.children[i];
    points.userData.life -= dt;
    if (points.userData.life <= 0) {
      sparkGroup.remove(points);
      points.geometry.dispose();
      points.material.dispose();
      continue;
    }
    const positions = points.geometry.attributes.position.array;
    points.userData.velocities.forEach((v, idx) => {
      positions[idx * 3] += v.x * dt;
      positions[idx * 3 + 1] += v.y * dt;
      positions[idx * 3 + 2] += v.z * dt;
      v.y -= 9 * dt;
    });
    points.geometry.attributes.position.needsUpdate = true;
    points.material.opacity = Math.max(0, points.userData.life / 0.6);
    points.material.transparent = true;
  }
}

renderer.xr.addEventListener('sessionstart', () => {
  cardboardBtn.style.display = 'none';
});
renderer.xr.addEventListener('sessionend', () => {
  cardboardBtn.style.display = 'block';
});

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  if (!renderer.xr.isPresenting && cardboardMode) {
    stereoEffect.render(scene, camera);
  } else if (renderer.xr.isPresenting) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
});
