const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const player = {
  x: 0, y: 0, angle: 0, speed: 220, radius: 14,
};
player.x = canvas.width / 2;
player.y = canvas.height / 2;

const bullets = [];
const targets = [];
const sparks = [];

let ammo = 30;
const magSize = 30;
let score = 0;
let reloading = false;

function spawnTarget() {
  const margin = 60;
  targets.push({
    x: margin + Math.random() * (canvas.width - margin * 2),
    y: margin + Math.random() * (canvas.height - margin * 2),
    radius: 16,
    alive: true,
    flash: 0,
  });
}
for (let i = 0; i < 6; i++) spawnTarget();

const keys = {};
window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

let mouse = { x: player.x, y: player.y };
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener('mousedown', fire);
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') fire();
  if (e.key.toLowerCase() === 'r') reload();
});

function fire() {
  if (reloading || ammo <= 0) return;
  ammo -= 1;
  updateHud();
  bullets.push({
    x: player.x,
    y: player.y,
    dx: Math.cos(player.angle) * 900,
    dy: Math.sin(player.angle) * 900,
    life: 1.2,
  });
  if (ammo === 0) reload();
}

function reload() {
  if (reloading) return;
  reloading = true;
  ammoEl.textContent = 'Reloading...';
  setTimeout(() => {
    ammo = magSize;
    reloading = false;
    updateHud();
  }, 1200);
}

function updateHud() {
  ammoEl.textContent = `Ammo: ${ammo}/${magSize}`;
  scoreEl.textContent = `Score: ${score}`;
}
updateHud();

// --- Touch controls (move stick + look stick + fire button) ---
function setupStick(stickEl, onMove, onEnd) {
  let active = false;
  let touchId = null;
  const knob = stickEl.querySelector('.stick-knob');
  const rect = () => stickEl.getBoundingClientRect();

  function handleStart(e) {
    active = true;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    touchId = e.changedTouches ? t.identifier : 'mouse';
    handleMove(e);
  }
  function handleMove(e) {
    if (!active) return;
    const t = e.changedTouches
      ? [...e.changedTouches].find((tt) => tt.identifier === touchId)
      : e;
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

let moveVec = { x: 0, y: 0 };
let lookVec = { x: 0, y: 0 };

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
  fire();
});

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  dx += moveVec.x;
  dy += moveVec.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    player.x += (dx / len) * player.speed * dt;
    player.y += (dy / len) * player.speed * dt;
  }
  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

  if (Math.hypot(lookVec.x, lookVec.y) > 0.1) {
    player.angle = Math.atan2(lookVec.y, lookVec.x);
  } else {
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx * dt;
    b.y += b.dy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
      bullets.splice(i, 1);
      continue;
    }
    for (const t of targets) {
      if (!t.alive) continue;
      if (Math.hypot(b.x - t.x, b.y - t.y) < t.radius) {
        t.alive = false;
        t.flash = 1;
        score += 10;
        updateHud();
        sparks.push({ x: b.x, y: b.y, life: 0.3 });
        bullets.splice(i, 1);
        setTimeout(() => {
          t.alive = true;
          t.x = 60 + Math.random() * (canvas.width - 120);
          t.y = 60 + Math.random() * (canvas.height - 120);
        }, 900);
        break;
      }
    }
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    sparks[i].life -= dt;
    if (sparks[i].life <= 0) sparks.splice(i, 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // targets (no blood — white-flash on hit, spark VFX)
  for (const t of targets) {
    if (!t.alive) continue;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
  }

  // sparks (hit feedback, no gore)
  for (const s of sparks) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10 * s.life + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${s.life})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // bullets
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f';
    ctx.fill();
  }

  // player
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#3498db';
  ctx.fill();
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(player.radius - 4, -3, 16, 6);
  ctx.restore();
}

requestAnimationFrame(loop);
