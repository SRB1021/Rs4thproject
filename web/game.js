import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const canvas = document.getElementById('game');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');
const crosshair = document.getElementById('crosshair');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.getElementById('vr-button-container').appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c333a);
scene.fog = new THREE.Fog(0x2c333a, 8, 40);

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
});

// --- Room (Refinery-inspired blockout: floor, walls, pipe cover) ---
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x3a4148 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a535c });
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

const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5d6b73 });
for (let i = 0; i < 6; i++) {
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 12), pipeMat);
  pipe.position.set(-8 + i * 3, 1.5, -2 + (i % 2) * 2);
  scene.add(pipe);
}

const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1.2);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 15, 5);
scene.add(dirLight);

// --- Targets (no blood: white-flash + spark burst on hit) ---
const targetMat = new THREE.MeshStandardMaterial({ color: 0xc0392b });
const targets = [];
function spawnTarget() {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), targetMat.clone());
  mesh.position.set((Math.random() - 0.5) * 30, 1, (Math.random() - 0.5) * 30 - 4);
  mesh.userData.alive = true;
  scene.add(mesh);
  targets.push(mesh);
}
for (let i = 0; i < 8; i++) spawnTarget();

function hitTarget(mesh) {
  if (!mesh.userData.alive) return;
  mesh.userData.alive = false;
  mesh.visible = false;
  score += 10;
  updateHud();
  spawnSparks(mesh.position);
  setTimeout(() => {
    mesh.position.set((Math.random() - 0.5) * 30, 1, (Math.random() - 0.5) * 30 - 4);
    mesh.visible = true;
    mesh.userData.alive = true;
  }, 900);
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

// --- Bullets / raycast hit-scan ---
const raycaster = new THREE.Raycaster();
let ammo = 30;
const magSize = 30;
let score = 0;
let reloading = false;

function updateHud() {
  ammoEl.textContent = reloading ? 'Reloading...' : `Ammo: ${ammo}/${magSize}`;
  scoreEl.textContent = `Score: ${score}`;
}
updateHud();

function fireFrom(originMatrixWorld) {
  if (reloading || ammo <= 0) return;
  ammo -= 1;
  updateHud();

  const origin = new THREE.Vector3().setFromMatrixPosition(originMatrixWorld);
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(originMatrixWorld).normalize();
  raycaster.set(origin, dir);
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length) hitTarget(hits[0].object);

  if (ammo === 0) reload();
}

function reload() {
  if (reloading) return;
  reloading = true;
  updateHud();
  setTimeout(() => {
    ammo = magSize;
    reloading = false;
    updateHud();
  }, 1200);
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
    crosshair.style.display = 'block';
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

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

    if (Math.hypot(lookVec.x, lookVec.y) > 0.1) {
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

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
});
