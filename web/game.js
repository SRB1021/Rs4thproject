import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { StereoEffect } from 'three/addons/effects/StereoEffect.js';
import { DeviceOrientationControls } from 'three/addons/controls/DeviceOrientationControls.js';

const canvas = document.getElementById('game');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');
const healthEl = document.getElementById('health');
const weaponNameEl = document.getElementById('weapon-name');
const crosshair = document.getElementById('crosshair');
const cardboardBtn = document.getElementById('cardboard-btn');
const damageFlash = document.getElementById('damage-flash');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.xr.enabled = true;
document.getElementById('vr-button-container').appendChild(VRButton.createButton(renderer));

const stereoEffect = new StereoEffect(renderer);
stereoEffect.setSize(window.innerWidth, window.innerHeight);
stereoEffect.eyeSeparation = 0.064;

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
scene.background = new THREE.Color(0x8fb8d8);
scene.fog = new THREE.Fog(0x8fb8d8, 25, 70);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

// Player rig: in VR the camera is parented to this so we can move/teleport the player.
const rig = new THREE.Group();
rig.position.set(0, 1.6, 6);
rig.add(camera);
scene.add(rig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  stereoEffect.setSize(window.innerWidth, window.innerHeight);
});

// --- Room (Refinery-inspired blockout: floor, walls, pipe cover) ---
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x7a8a93 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa7af });
function addWall(x, z, w, d, h = 4) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  wall.position.set(x, h / 2, z);
  scene.add(wall);
  return wall;
}
addWall(0, -20, 40, 1);
addWall(0, 20, 40, 1);
addWall(-20, 0, 1, 40);
addWall(20, 0, 1, 40);

const pipeMat = new THREE.MeshStandardMaterial({ color: 0x8d9aa1 });
for (let i = 0; i < 6; i++) {
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 12), pipeMat);
  pipe.position.set(-8 + i * 3, 1.5, -2 + (i % 2) * 2);
  scene.add(pipe);
}

const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa7af, 2.2);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(10, 15, 5);
scene.add(dirLight);

// --- Humanoid enemies (PMC soldiers, no blood: white-flash + spark burst on hit) ---
const enemyHitMeshes = [];
const enemies = [];
const uniformMat = new THREE.MeshStandardMaterial({ color: 0x4b5320 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc89a72 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c });

function buildEnemy() {
  const group = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.85, 4, 8), uniformMat);
  torso.position.y = 1.1;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skinMat);
  head.position.y = 1.75;
  group.add(head);

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

  const legGeo = new THREE.CapsuleGeometry(0.11, 0.7, 4, 6);
  const legL = new THREE.Mesh(legGeo, uniformMat.clone());
  legL.position.set(-0.15, 0.4, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, uniformMat.clone());
  legR.position.set(0.15, 0.4, 0);
  group.add(legR);

  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.enemyRoot = group;
      enemyHitMeshes.push(child);
    }
  });

  group.userData = {
    hp: 100,
    maxHp: 100,
    alive: true,
    fireDelay: 1.4 + Math.random() * 0.8,
    lastShot: -999,
    spawnPos: new THREE.Vector3(),
  };

  return group;
}

function placeEnemy(group) {
  const pos = new THREE.Vector3((Math.random() - 0.5) * 32, 0, (Math.random() - 0.5) * 32 - 4);
  group.position.copy(pos);
  group.userData.spawnPos.copy(pos);
}

for (let i = 0; i < 5; i++) {
  const enemy = buildEnemy();
  placeEnemy(enemy);
  scene.add(enemy);
  enemies.push(enemy);
}

function damageEnemy(mesh, dmg) {
  const root = mesh.userData.enemyRoot;
  if (!root || !root.userData.alive) return;
  root.userData.hp -= dmg;
  const hitPoint = mesh.getWorldPosition(new THREE.Vector3());
  spawnSparks(hitPoint);
  if (root.userData.hp <= 0) {
    root.userData.alive = false;
    root.visible = false;
    score += 50;
    updateHud();
    setTimeout(() => {
      placeEnemy(root);
      root.userData.hp = root.userData.maxHp;
      root.userData.alive = true;
      root.visible = true;
    }, 3000);
  }
}

function updateEnemies(dt) {
  const playerPos = rig.position;
  const now = clock.elapsedTime;
  for (const enemy of enemies) {
    if (!enemy.userData.alive) continue;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.position);
    const dist = toPlayer.length();

    const angle = Math.atan2(toPlayer.x, toPlayer.z);
    enemy.rotation.y = angle;

    if (dist < 18 && dist > 1.2 && now - enemy.userData.lastShot > enemy.userData.fireDelay) {
      enemy.userData.lastShot = now;
      const muzzlePos = enemy.position.clone().add(new THREE.Vector3(0, 1.6, 0));
      spawnSparks(muzzlePos);

      const hitChance = Math.max(0.15, 0.85 - dist * 0.03);
      if (Math.random() < hitChance) {
        damagePlayer(6 + Math.random() * 6);
      }
    }
  }
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
      playerHealth = 100;
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
  { name: 'MP-Sidearm', damage: 34, fireDelay: 0.18, magSize: 12, reloadTime: 1.0 },
  { name: 'PDX-9 SMG', damage: 25, fireDelay: 0.09, magSize: 30, reloadTime: 1.4 },
  { name: 'AR-15K', damage: 40, fireDelay: 0.11, magSize: 30, reloadTime: 1.8 },
  { name: 'SR-50 Sniper', damage: 100, fireDelay: 0.9, magSize: 5, reloadTime: 2.2 },
];
WEAPONS.forEach((w) => (w.ammo = w.magSize));

let weaponIndex = 0;
let reloading = false;
let lastFireTime = -999;
const raycaster = new THREE.Raycaster();
let score = 0;

function currentWeapon() {
  return WEAPONS[weaponIndex];
}

function updateHud() {
  const w = currentWeapon();
  weaponNameEl.textContent = w.name;
  ammoEl.textContent = reloading ? 'Reloading...' : `Ammo: ${w.ammo}/${w.magSize}`;
  scoreEl.textContent = `Score: ${score}`;
  healthEl.textContent = `HP: ${Math.ceil(playerHealth)}`;
}
updateHud();

function switchWeapon() {
  if (reloading) return;
  weaponIndex = (weaponIndex + 1) % WEAPONS.length;
  updateHud();
}

function fireFrom(originMatrixWorld) {
  if (!playerAlive) return;
  const w = currentWeapon();
  const now = clock.elapsedTime;
  if (reloading || w.ammo <= 0 || now - lastFireTime < w.fireDelay) return;
  lastFireTime = now;
  w.ammo -= 1;
  updateHud();

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
  setTimeout(() => {
    w.ammo = w.magSize;
    reloading = false;
    updateHud();
  }, w.reloadTime * 1000);
}

// --- Desktop controls: mouse look (pointer lock) + WASD + click/space to fire ---
let yaw = 0, pitch = 0;
const moveState = { f: 0, b: 0, l: 0, r: 0 };
let usingPointerLock = false;

canvas.addEventListener('click', () => {
  if (!renderer.xr.isPresenting) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  usingPointerLock = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!usingPointerLock) return;
  yaw -= e.movementX * 0.0025;
  pitch -= e.movementY * 0.0025;
  pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
});
document.addEventListener('mousedown', () => {
  if (usingPointerLock) fireFrom(camera.matrixWorld);
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') moveState.f = 1;
  if (k === 's' || k === 'arrowdown') moveState.b = 1;
  if (k === 'a' || k === 'arrowleft') moveState.l = 1;
  if (k === 'd' || k === 'arrowright') moveState.r = 1;
  if (k === ' ') fireFrom(camera.matrixWorld);
  if (k === 'r') reload();
  if (k === 'q' || k === 'v') switchWeapon();
  if (['1', '2', '3', '4'].includes(k)) {
    weaponIndex = Number(k) - 1;
    updateHud();
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
  if (!renderer.xr.isPresenting) {
    crosshair.style.display = cardboardMode ? 'none' : 'block';

    if (cardboardMode && orientationControls) {
      orientationControls.update();
    } else {
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }

    let dx = (moveState.r - moveState.l) + moveVec.x;
    let dy = (moveState.b - moveState.f) - moveVec.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      right.y = 0; right.normalize();
      const speed = 4.5 * dt;
      rig.position.addScaledVector(forward, -dy * speed);
      rig.position.addScaledVector(right, dx * speed);
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
  } else {
    renderer.render(scene, camera);
  }
});
