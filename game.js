/**
 * Five Nights at Freddy's - Browser Recreation
 * Per-animatronic AI, control panel with failing systems, lower power drain.
 */

// ==================== CONFIG ====================
const HOURS_PER_NIGHT = 6;
const GAME_DURATION_MS = 5.5 * 60 * 1000;
const POWER_MAX = 100;
// Much lower drain rates so Night 1 is easily survivable
const POWER_DRAIN_IDLE = 0.03;
const POWER_DRAIN_DOOR = 0.18;
const POWER_DRAIN_LIGHT = 0.15;
const POWER_DRAIN_CAM = 0.1;
const POWER_DRAIN_PANEL = 0.08;

// System failure config
const SYSTEMS = {
  power:  { name:'ELECTRICITY',   failLabel:'POWER OFFLINE',    rebootTime:4000 },
  vent:   { name:'VENTILATION',   failLabel:'VENT OFFLINE',     rebootTime:5000 },
  audio:  { name:'AUDIO DEVICES', failLabel:'AUDIO OFFLINE',    rebootTime:3500 }
};
// Base chance per second that a working system fails (night 1)
const SYS_FAIL_BASE = 0.003;
// How much more likely per night
const SYS_FAIL_NIGHT_MULT = 0.004;
// How long before a failed system causes a penalty (ms)
const SYS_PENALTY_DELAY = 8000;

// ==================== ROOMS ====================
const ROOMS = {
  '1a': { name:'Show Stage', next:['1b'] },
  '1b': { name:'Dining Area', next:['1a','1c','2a'] },
  '1c': { name:'Pirate Cove', next:['1b'] },
  '2a': { name:'West Hall', next:['1b','2b','4a'] },
  '2b': { name:'W. Hall Corner', next:['2a','3','left_hall'] },
  '3':  { name:'Supply Closet', next:['2b'] },
  '4a': { name:'East Hall', next:['2a','4b','5'] },
  '4b': { name:'E. Hall Corner', next:['4a','right_hall'] },
  '5':  { name:'Backstage', next:['4a'] },
  'left_hall':  { name:'Left Door', next:['2b','office'], side:'left' },
  'right_hall': { name:'Right Door', next:['4b','office'], side:'right' },
  'office': { name:'Office', next:[] }
};

const ANIMATRONICS = {
  freddy: {
    name:'Freddy', color:'#8B6914', eyes:'#4169E1', start:'1a', hat:true,
    baseInterval:50, nightScale:0.72, aggressiveness:0.35,
    retreatChance:0.3, doorLingerMax:20,
    preferredPath:['1a','1b','2a','4a','4b','right_hall']
  },
  bonnie: {
    name:'Bonnie', color:'#4B0082', eyes:'#FF0000', start:'1a', guitar:true,
    baseInterval:38, nightScale:0.78, aggressiveness:0.45,
    retreatChance:0.4, doorLingerMax:15,
    preferredPath:null
  },
  chica: {
    name:'Chica', color:'#DAA520', eyes:'#9932CC', start:'1a', bib:true,
    baseInterval:42, nightScale:0.75, aggressiveness:0.4,
    retreatChance:0.35, doorLingerMax:18,
    preferredPath:null
  },
  foxy: {
    name:'Foxy', color:'#8B2500', eyes:'#FFD700', start:'1c', hook:true,
    baseInterval:55, nightScale:0.65, aggressiveness:0.6,
    retreatChance:0.2, doorLingerMax:8,
    preferredPath:['1c','1b','2a','2b','left_hall']
  }
};

// ==================== STATE ====================
let S = {
  night:1, running:false, time:0, power:POWER_MAX,
  leftDoor:false, rightDoor:false, leftLight:false, rightLight:false,
  onCam:false, onPanel:false, currentCam:'1a',
  pos:{}, timers:{}, doorArrival:{}, lastUpdate:0,
  // Systems: 'ok', 'error', 'rebooting'
  sys: { power:'ok', vent:'ok', audio:'ok' },
  sysFailTime: { power:0, vent:0, audio:0 },
  sysRebootEnd: { power:0, vent:0, audio:0 },
  ventPenaltyActive: false
};

// ==================== DOM ====================
const $ = id => document.getElementById(id);
const officeCanvas = $('office-canvas');
const officeCtx = officeCanvas.getContext('2d');
const camCanvas = $('cam-canvas');
const camCtx = camCanvas.getContext('2d');
const scareCanvas = $('jumpscare-canvas');
const scareCtx = scareCanvas.getContext('2d');

// ==================== PATHFINDING ====================
let distMap = null;
function buildDist() {
  const d = { office:0 };
  const q = ['office'];
  let i = 0;
  while (i < q.length) {
    const room = q[i++];
    for (const [r, cfg] of Object.entries(ROOMS)) {
      if (cfg.next.includes(room) && d[r] === undefined) {
        d[r] = d[room] + 1;
        q.push(r);
      }
    }
  }
  return d;
}
function getNextTowardOffice(room) {
  if (!distMap) distMap = buildDist();
  const r = ROOMS[room];
  if (!r) return null;
  const closer = r.next.filter(n => (distMap[n]??99) < (distMap[room]??99));
  return closer.length ? closer[Math.floor(Math.random()*closer.length)] : null;
}
function getRandomNeighbor(room) {
  const r = ROOMS[room];
  if (!r || !r.next.length) return null;
  const safe = r.next.filter(n => n !== 'office');
  return safe.length ? safe[Math.floor(Math.random()*safe.length)] : null;
}

// ==================== MOVE INTERVAL ====================
function getInterval(id) {
  const cfg = ANIMATRONICS[id];
  const nightMult = Math.pow(cfg.nightScale, S.night - 1);
  const base = cfg.baseInterval * nightMult;
  const jitter = base * 0.4 * (Math.random() - 0.2);
  return Math.max(4, base + jitter);
}

// ==================== INIT ====================
function initPositions() {
  S.pos = {}; S.timers = {}; S.doorArrival = {};
  const now = performance.now();
  for (const [id, cfg] of Object.entries(ANIMATRONICS)) {
    S.pos[id] = cfg.start;
    S.timers[id] = now + getInterval(id) * 1000 * (0.6 + Math.random() * 0.8);
    S.doorArrival[id] = 0;
  }
}

function initSystems() {
  S.sys = { power:'ok', vent:'ok', audio:'ok' };
  S.sysFailTime = { power:0, vent:0, audio:0 };
  S.sysRebootEnd = { power:0, vent:0, audio:0 };
  S.ventPenaltyActive = false;
}

// ==================== ANIMATRONIC MOVE ====================
function tryMove(id) {
  const cfg = ANIMATRONICS[id];
  const pos = S.pos[id];
  if (pos === 'office') return;

  if (pos === 'left_hall' || pos === 'right_hall') {
    const isDoorShut = (pos === 'left_hall' && S.leftDoor) ||
                       (pos === 'right_hall' && S.rightDoor);
    if (isDoorShut) {
      if (Math.random() < cfg.retreatChance) { retreatAnimatronic(id); return; }
      const now = performance.now();
      if (S.doorArrival[id] && (now - S.doorArrival[id]) > cfg.doorLingerMax * 1000) {
        retreatAnimatronic(id); return;
      }
      return;
    }
    // Door open: 50% chance per tick (not instant)
    if (Math.random() < 0.5) { jumpscare(id); return; }
    return;
  }

  const nightAggBoost = (S.night - 1) * 0.07;
  const agg = Math.min(0.9, cfg.aggressiveness + nightAggBoost);
  // Audio system down = animatronics are more aggressive
  const audioBonus = (S.sys.audio === 'error') ? 0.15 : 0;

  let next = null;
  if (Math.random() < (agg + audioBonus)) {
    if (cfg.preferredPath) {
      const idx = cfg.preferredPath.indexOf(pos);
      if (idx >= 0 && idx < cfg.preferredPath.length - 1) {
        next = cfg.preferredPath[idx + 1];
      } else {
        next = getNextTowardOffice(pos);
      }
    } else {
      next = getNextTowardOffice(pos);
    }
  } else {
    next = getRandomNeighbor(pos);
  }
  if (!next) return;

  if (next === 'left_hall' || next === 'right_hall') {
    S.pos[id] = next;
    S.doorArrival[id] = performance.now();
    return;
  }
  if (next === 'office') return;
  S.pos[id] = next;
}

function retreatAnimatronic(id) {
  const pos = S.pos[id];
  if (pos === 'left_hall') S.pos[id] = '2b';
  else if (pos === 'right_hall') S.pos[id] = '4b';
  else {
    const r = ROOMS[pos];
    if (r && r.next.length) {
      if (!distMap) distMap = buildDist();
      const away = r.next.filter(n => (distMap[n]??0) > (distMap[pos]??0));
      S.pos[id] = away.length ? away[Math.floor(Math.random()*away.length)] : r.next[0];
    }
  }
  S.doorArrival[id] = 0;
}

// ==================== SYSTEMS ====================
function updateSystems(dt, now) {
  const failChance = SYS_FAIL_BASE + SYS_FAIL_NIGHT_MULT * (S.night - 1);

  for (const sysId of Object.keys(SYSTEMS)) {
    if (S.sys[sysId] === 'ok') {
      // Random chance to fail
      if (Math.random() < failChance * dt) {
        S.sys[sysId] = 'error';
        S.sysFailTime[sysId] = now;
      }
    } else if (S.sys[sysId] === 'rebooting') {
      if (now >= S.sysRebootEnd[sysId]) {
        S.sys[sysId] = 'ok';
        S.sysFailTime[sysId] = 0;
      }
    }
    // 'error' state just persists until player reboots
  }

  // Penalties for systems being down too long
  // ELECTRICITY down: extra power drain
  if (S.sys.power === 'error') {
    const downTime = now - S.sysFailTime.power;
    if (downTime > SYS_PENALTY_DELAY) {
      S.power = Math.max(0, S.power - 0.25 * dt);
    }
  }

  // VENTILATION down: after delay, causes hallucinations (animatronics move faster)
  S.ventPenaltyActive = (S.sys.vent === 'error' &&
    (now - S.sysFailTime.vent) > SYS_PENALTY_DELAY);

  // AUDIO down: animatronics are more aggressive (handled in tryMove)
}

function rebootSystem(sysId) {
  if (S.sys[sysId] !== 'error') return;
  S.sys[sysId] = 'rebooting';
  S.sysRebootEnd[sysId] = performance.now() + SYSTEMS[sysId].rebootTime;
}

// ==================== DRAWING: ANIMATRONICS ====================
function drawAnimatronic(ctx, id, cfg, cx, cy, size) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = cfg.color;
  ctx.beginPath(); ctx.ellipse(0, s*0.2, s*0.35, s*0.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s*0.3, s*0.28, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.arc(-s*0.22, -s*0.55, s*0.1, 0, Math.PI*2);
  ctx.arc(s*0.22, -s*0.55, s*0.1, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(-s*0.1, -s*0.32, s*0.08, s*0.09, 0, 0, Math.PI*2);
  ctx.ellipse(s*0.1, -s*0.32, s*0.08, s*0.09, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = cfg.eyes; ctx.shadowColor = cfg.eyes; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(-s*0.1, -s*0.32, s*0.04, 0, Math.PI*2);
  ctx.arc(s*0.1, -s*0.32, s*0.04, 0, Math.PI*2);
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -s*0.2, s*0.12, 0.1*Math.PI, 0.9*Math.PI); ctx.stroke();
  ctx.fillStyle = '#ddd';
  for (let i = -2; i <= 2; i++) ctx.fillRect(i*s*0.04 - s*0.015, -s*0.18, s*0.03, s*0.04);
  if (cfg.hat) {
    ctx.fillStyle = '#111';
    ctx.fillRect(-s*0.18, -s*0.62, s*0.36, s*0.04);
    ctx.fillRect(-s*0.1, -s*0.78, s*0.2, s*0.16);
  }
  if (cfg.guitar) {
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(s*0.3, -s*0.1, s*0.06, s*0.5);
    ctx.beginPath(); ctx.ellipse(s*0.33, s*0.45, s*0.12, s*0.08, 0, 0, Math.PI*2); ctx.fill();
  }
  if (cfg.bib) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, s*0.15, s*0.2, s*0.15, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = `bold ${s*0.08}px monospace`;
    ctx.textAlign = 'center'; ctx.fillText("LET'S EAT", 0, s*0.18);
  }
  if (cfg.hook) {
    ctx.strokeStyle = '#888'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-s*0.38, s*0.1); ctx.lineTo(-s*0.38, s*0.3);
    ctx.arc(-s*0.38, s*0.25, s*0.06, Math.PI*0.5, Math.PI*1.5, true); ctx.stroke();
  }
  ctx.restore();
}

// ==================== DRAWING: ROOMS ====================
function drawRoom(ctx, w, h, camId) {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a08'); grad.addColorStop(0.5, '#12120f'); grad.addColorStop(1, '#0a0a08');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1815'; ctx.fillRect(0, h*0.65, w, h*0.35);
  ctx.strokeStyle = '#222018'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, h*0.65); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = h*0.65; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = '#15130f'; ctx.fillRect(0, 0, w, h*0.65);
  ctx.strokeStyle = '#1e1c18'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, w, h*0.65);

  switch (camId) {
    case '1a': drawShowStage(ctx, w, h); break;
    case '1b': drawDining(ctx, w, h); break;
    case '1c': drawPirateCove(ctx, w, h); break;
    case '2a': case '4a': drawHallway(ctx, w, h); break;
    case '2b': case '4b': drawHallCorner(ctx, w, h); break;
    case '3': drawSupply(ctx, w, h); break;
    case '5': drawBackstage(ctx, w, h); break;
  }

  const inRoom = Object.entries(S.pos).filter(([_, r]) => r === camId);
  const count = inRoom.length;
  inRoom.forEach(([aid, _], i) => {
    const acfg = ANIMATRONICS[aid];
    const spacing = w / (count + 1);
    drawAnimatronic(ctx, aid, acfg, spacing*(i+1), h*0.52, Math.min(w,h)*0.35);
  });

  const vig = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  // Camera system down = static noise overlay
  if (S.sys.power === 'error') {
    ctx.fillStyle = 'rgba(255,0,0,0.05)';
    ctx.fillRect(0, 0, w, h);
  }
}

function drawShowStage(ctx, w, h) {
  ctx.fillStyle = '#2a2520'; ctx.fillRect(w*0.1, h*0.55, w*0.8, h*0.12);
  ctx.fillStyle = '#3a3530'; ctx.fillRect(w*0.1, h*0.55, w*0.8, h*0.03);
  ctx.fillStyle = '#5a1020'; ctx.fillRect(0, 0, w*0.08, h*0.65); ctx.fillRect(w*0.92, 0, w*0.08, h*0.65);
  ctx.strokeStyle = '#4a0818'; ctx.lineWidth = 2;
  for (let y = 0; y < h*0.65; y += 20) {
    ctx.beginPath(); ctx.moveTo(w*0.02, y); ctx.quadraticCurveTo(w*0.04, y+10, w*0.06, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*0.94, y); ctx.quadraticCurveTo(w*0.96, y+10, w*0.98, y); ctx.stroke();
  }
}
function drawDining(ctx, w, h) {
  for (let i = 0; i < 3; i++) {
    const tx = w*0.15 + i*w*0.3;
    ctx.fillStyle = '#2a2520'; ctx.fillRect(tx, h*0.68, w*0.18, h*0.05);
    ctx.fillStyle = '#1a1510';
    ctx.fillRect(tx+w*0.03, h*0.73, w*0.04, h*0.12);
    ctx.fillRect(tx+w*0.11, h*0.73, w*0.04, h*0.12);
    ctx.fillStyle = '#5a2030';
    ctx.beginPath(); ctx.moveTo(tx+w*0.09, h*0.68); ctx.lineTo(tx+w*0.07, h*0.62); ctx.lineTo(tx+w*0.11, h*0.68); ctx.fill();
  }
  ctx.fillStyle = '#1e1a15'; ctx.fillRect(w*0.2, h*0.1, w*0.12, h*0.15); ctx.fillRect(w*0.65, h*0.1, w*0.12, h*0.15);
}
function drawPirateCove(ctx, w, h) {
  ctx.fillStyle = '#2a1040'; ctx.fillRect(w*0.2, 0, w*0.6, h*0.65);
  ctx.fillStyle = '#050308';
  ctx.beginPath(); ctx.moveTo(w*0.35, 0); ctx.lineTo(w*0.5, h*0.65); ctx.lineTo(w*0.65, 0); ctx.fill();
  ctx.fillStyle = '#1a1515'; ctx.fillRect(w*0.35, h*0.7, w*0.3, h*0.08);
  ctx.fillStyle = '#8B0000'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('OUT OF ORDER', w*0.5, h*0.755); ctx.textAlign = 'start';
}
function drawHallway(ctx, w, h) {
  ctx.fillStyle = '#0e0e0c'; ctx.fillRect(w*0.3, h*0.1, w*0.4, h*0.55);
  ctx.strokeStyle = '#1a1815'; ctx.lineWidth = 1; ctx.strokeRect(w*0.3, h*0.1, w*0.4, h*0.55);
  for (let i = 0; i < 3; i++) {
    const dy = h*0.15 + i*h*0.15;
    ctx.fillStyle = '#1a1510'; ctx.fillRect(w*0.3, dy, w*0.06, h*0.12); ctx.fillRect(w*0.64, dy, w*0.06, h*0.12);
  }
}
function drawHallCorner(ctx, w, h) {
  ctx.fillStyle = '#0c0c0a';
  ctx.beginPath(); ctx.moveTo(w*0.2, 0); ctx.lineTo(w*0.4, h*0.3); ctx.lineTo(w*0.6, h*0.3);
  ctx.lineTo(w*0.8, 0); ctx.lineTo(w*0.8, h*0.65); ctx.lineTo(w*0.2, h*0.65); ctx.fill();
  ctx.fillStyle = '#0a0a08'; ctx.fillRect(w*0.35, h*0.08, w*0.3, h*0.2);
  ctx.strokeStyle = '#1a1815'; ctx.strokeRect(w*0.35, h*0.08, w*0.3, h*0.2);
}
function drawSupply(ctx, w, h) {
  for (let i = 0; i < 3; i++) {
    const sy = h*0.15 + i*h*0.15;
    ctx.fillStyle = '#1a1510'; ctx.fillRect(w*0.1, sy, w*0.8, h*0.03);
    ctx.fillStyle = '#252520';
    for (let j = 0; j < 4; j++) ctx.fillRect(w*0.15 + j*w*0.18, sy - h*0.06, w*0.08, h*0.06);
  }
  ctx.fillStyle = '#333'; ctx.fillRect(w*0.6, h*0.7, w*0.12, h*0.1);
}
function drawBackstage(ctx, w, h) {
  for (let i = 0; i < 3; i++) {
    const hx = w*0.2 + i*w*0.25;
    ctx.fillStyle = ['#8B6914','#4B0082','#DAA520'][i];
    ctx.beginPath(); ctx.arc(hx, h*0.25, 20, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(hx-7, h*0.24, 5, 0, Math.PI*2); ctx.arc(hx+7, h*0.24, 5, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = '#1a1510'; ctx.fillRect(w*0.08, h*0.32, w*0.84, h*0.03);
}

// ==================== OFFICE DRAWING ====================
function drawOffice(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0c0c0a'); bg.addColorStop(0.4, '#131310'); bg.addColorStop(1, '#0a0a08');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1815'; ctx.fillRect(0, h*0.6, w, h*0.4);
  ctx.strokeStyle = '#222018';
  for (let x = 0; x < w; x += 50) { ctx.beginPath(); ctx.moveTo(x, h*0.6); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.strokeStyle = '#1a1815';
  for (let y = 0; y < h*0.6; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Desk
  ctx.fillStyle = '#2a2520'; ctx.fillRect(w*0.15, h*0.55, w*0.7, h*0.08);
  ctx.fillStyle = '#222018';
  ctx.fillRect(w*0.2, h*0.63, w*0.05, h*0.2);
  ctx.fillRect(w*0.75, h*0.63, w*0.05, h*0.2);

  // Monitor
  ctx.fillStyle = '#111'; ctx.fillRect(w*0.35, h*0.3, w*0.3, h*0.22);
  const monitorOn = S.sys.power !== 'error';
  ctx.fillStyle = monitorOn ? '#0a1a0a' : '#050505';
  ctx.fillRect(w*0.36, h*0.31, w*0.28, h*0.2);
  if (!monitorOn) {
    ctx.fillStyle = '#1a0505'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('NO SIGNAL', w*0.5, h*0.42); ctx.textAlign = 'start';
  }
  ctx.fillStyle = '#222'; ctx.fillRect(w*0.47, h*0.52, w*0.06, h*0.04);

  // Fan (stops when power is out)
  const fanX = w*0.78, fanY = h*0.38;
  if (monitorOn) {
    ctx.save(); ctx.translate(fanX, fanY); ctx.rotate(performance.now() / 200);
    ctx.fillStyle = '#333';
    for (let a = 0; a < 3; a++) {
      ctx.save(); ctx.rotate(a * Math.PI*2/3);
      ctx.beginPath(); ctx.ellipse(0, -18, 5, 18, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(fanX, fanY, 5, 0, Math.PI*2); ctx.fill();

  // Papers
  ctx.fillStyle = '#ddd8cc';
  ctx.save(); ctx.translate(w*0.25, h*0.54); ctx.rotate(-0.1); ctx.fillRect(0, 0, 30, 40); ctx.restore();
  ctx.save(); ctx.translate(w*0.62, h*0.53); ctx.rotate(0.08); ctx.fillRect(0, 0, 25, 35); ctx.restore();

  // Cup
  ctx.fillStyle = '#444'; ctx.fillRect(w*0.55, h*0.5, 12, 18);
  ctx.fillStyle = '#8B0000'; ctx.fillRect(w*0.55, h*0.5, 12, 5);

  // Poster
  ctx.fillStyle = '#1e1a15'; ctx.fillRect(w*0.1, h*0.1, w*0.12, h*0.18);
  ctx.strokeStyle = '#2a2520'; ctx.lineWidth = 2; ctx.strokeRect(w*0.1, h*0.1, w*0.12, h*0.18);
  ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.fillText('CELEBRATE!', w*0.105, h*0.2);

  // Vignette
  const vig = ctx.createRadialGradient(w/2, h/2, w*0.15, w/2, h/2, w*0.6);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);

  // Vent penalty: red tint flicker
  if (S.ventPenaltyActive && Math.random() > 0.7) {
    ctx.fillStyle = 'rgba(80,0,0,0.08)'; ctx.fillRect(0, 0, w, h);
  }
}

// ==================== JUMPSCARE ====================
function jumpscare(animId) {
  S.running = false;
  const cfg = ANIMATRONICS[animId];
  $('office-view').classList.add('hidden');
  $('camera-view').classList.add('hidden');
  $('control-panel').classList.add('hidden');
  $('jumpscare').classList.remove('hidden');
  resizeCanvas(scareCanvas, scareCtx);
  const w = scareCanvas.width, h = scareCanvas.height;
  let frame = 0;
  function animateScare() {
    if (frame >= 30) { $('jumpscare').classList.add('hidden'); showMenu(); return; }
    scareCtx.clearRect(0, 0, w, h); scareCtx.fillStyle = '#000'; scareCtx.fillRect(0, 0, w, h);
    const cx = w/2 + (Math.random()-0.5)*20;
    const cy = h/2 + (Math.random()-0.5)*15;
    drawAnimatronic(scareCtx, animId, cfg, cx, cy, Math.min(w,h)*(0.5+frame*0.02));
    scareCtx.fillStyle = `rgba(139,0,0,${0.15+Math.random()*0.1})`; scareCtx.fillRect(0, 0, w, h);
    frame++; requestAnimationFrame(animateScare);
  }
  animateScare();
}

// ==================== CANVAS RESIZE ====================
function resizeCanvas(canvas, ctx) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const w = parent.clientWidth, h = parent.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ==================== GAME LOOP ====================
function updateTime(dt) {
  S.time = Math.min(6, S.time + (dt / (GAME_DURATION_MS/1000)) * HOURS_PER_NIGHT);
  if (S.time >= 6) {
    S.running = false;
    $('office-view').classList.add('hidden');
    $('camera-view').classList.add('hidden');
    $('control-panel').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('win-screen').classList.remove('hidden');
  }
}

function drainPower(dt) {
  let drain = POWER_DRAIN_IDLE;
  if (S.leftDoor) drain += POWER_DRAIN_DOOR;
  if (S.rightDoor) drain += POWER_DRAIN_DOOR;
  if (S.leftLight) drain += POWER_DRAIN_LIGHT;
  if (S.rightLight) drain += POWER_DRAIN_LIGHT;
  if (S.onCam) drain += POWER_DRAIN_CAM;
  if (S.onPanel) drain += POWER_DRAIN_PANEL;
  S.power = Math.max(0, S.power - drain * dt);
  if (S.power <= 0) {
    S.running = false;
    jumpscare('freddy');
  }
}

function updateAI(now) {
  for (const id of Object.keys(ANIMATRONICS)) {
    if (S.pos[id] === 'office') continue;
    // Vent penalty: animatronics move faster
    const speedMult = S.ventPenaltyActive ? 0.6 : 1;
    if (S.timers[id] <= now) {
      tryMove(id);
      S.timers[id] = now + getInterval(id) * 1000 * speedMult;
    }
  }
}

function renderPanel() {
  const now = performance.now();
  for (const sysId of Object.keys(SYSTEMS)) {
    const rowEl = $('sys-' + sysId);
    if (!rowEl) continue;
    const statusEl = rowEl.querySelector('.sys-status');
    const barFill = rowEl.querySelector('.sys-bar-fill');
    const rebootBtn = rowEl.querySelector('.sys-reboot-btn');

    const state = S.sys[sysId];
    statusEl.className = 'sys-status ' + (state === 'ok' ? 'ok' : state === 'rebooting' ? 'rebooting' : 'error');
    statusEl.textContent = state === 'ok' ? 'ONLINE' : state === 'rebooting' ? 'REBOOTING...' : 'OFFLINE';
    barFill.className = 'sys-bar-fill' + (state === 'error' ? ' error' : state === 'rebooting' ? ' rebooting' : '');
    rebootBtn.disabled = (state !== 'error');

    if (state === 'rebooting') {
      const total = SYSTEMS[sysId].rebootTime;
      const elapsed = now - (S.sysRebootEnd[sysId] - total);
      barFill.style.width = Math.min(100, (elapsed / total) * 100) + '%';
    } else if (state === 'ok') {
      barFill.style.width = '100%';
    } else {
      barFill.style.width = '0%';
    }
  }

  // Warnings
  const warnings = [];
  if (S.sys.power === 'error') warnings.push('ELECTRICITY FAILING - POWER DRAINING FAST');
  if (S.sys.vent === 'error') warnings.push('VENTILATION DOWN - ANIMATRONICS MORE ACTIVE');
  if (S.sys.audio === 'error') warnings.push('AUDIO OFFLINE - ANIMATRONICS MORE AGGRESSIVE');
  $('panel-warnings').textContent = warnings.join(' | ');
}

function render() {
  const hour = Math.floor(S.time);
  $('time-display').textContent = hour === 0 ? '12 AM' : hour + ' AM';
  $('night-label').textContent = 'Night ' + S.night;

  const pct = Math.round(S.power);
  const pctEl = $('power-pct');
  pctEl.textContent = pct + '%';
  pctEl.classList.toggle('low', pct < 25);

  let usage = 1;
  if (S.leftDoor) usage++;
  if (S.rightDoor) usage++;
  if (S.leftLight || S.rightLight) usage++;
  if (S.onCam) usage++;
  if (S.onPanel) usage++;
  $('usage-bars').textContent = '\u2588'.repeat(usage);

  // System alerts in HUD
  const alerts = [];
  if (S.sys.power === 'error') alerts.push('POWER OFFLINE');
  if (S.sys.vent === 'error') alerts.push('VENT OFFLINE');
  if (S.sys.audio === 'error') alerts.push('AUDIO OFFLINE');
  $('system-alerts').textContent = alerts.join('  ');

  $('left-door').classList.toggle('shut', S.leftDoor);
  $('right-door').classList.toggle('shut', S.rightDoor);
  $('left-door-indicator').classList.toggle('active', S.leftDoor);
  $('right-door-indicator').classList.toggle('active', S.rightDoor);
  $('left-door-btn').classList.toggle('on', S.leftDoor);
  $('right-door-btn').classList.toggle('on', S.rightDoor);
  $('left-light-btn').classList.toggle('on', S.leftLight);
  $('right-light-btn').classList.toggle('on', S.rightLight);

  const leftWindow = $('left-hall-window');
  const rightWindow = $('right-hall-window');
  leftWindow.classList.toggle('hall-lit', S.leftLight);
  rightWindow.classList.toggle('hall-lit', S.rightLight);
  leftWindow.innerHTML = '';
  rightWindow.innerHTML = '';
  if (S.leftLight) {
    const inLeft = Object.entries(S.pos).find(([_, r]) => r === 'left_hall');
    if (inLeft) leftWindow.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${ANIMATRONICS[inLeft[0]].eyes};font-size:2rem;text-shadow:0 0 15px ${ANIMATRONICS[inLeft[0]].eyes}">&#9679; &#9679;</div>`;
  }
  if (S.rightLight) {
    const inRight = Object.entries(S.pos).find(([_, r]) => r === 'right_hall');
    if (inRight) rightWindow.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${ANIMATRONICS[inRight[0]].eyes};font-size:2rem;text-shadow:0 0 15px ${ANIMATRONICS[inRight[0]].eyes}">&#9679; &#9679;</div>`;
  }

  if (S.onPanel) {
    renderPanel();
  } else if (S.onCam) {
    resizeCanvas(camCanvas, camCtx);
    const w = camCanvas.parentElement.clientWidth, h = camCanvas.parentElement.clientHeight;
    drawRoom(camCtx, w, h, S.currentCam);
    $('cam-label').textContent = 'CAM ' + S.currentCam.toUpperCase() + ' - ' + (ROOMS[S.currentCam]?.name || '');
  } else {
    resizeCanvas(officeCanvas, officeCtx);
    const w = officeCanvas.parentElement.clientWidth, h = officeCanvas.parentElement.clientHeight;
    drawOffice(officeCtx, w, h);
  }
}

function gameLoop(now) {
  if (!S.running) return;
  const dt = Math.min((now - S.lastUpdate) / 1000, 0.1);
  S.lastUpdate = now;
  updateTime(dt);
  drainPower(dt);
  updateSystems(dt, now);
  updateAI(now);
  render();
  requestAnimationFrame(gameLoop);
}

// ==================== SCREENS ====================
function showMenu() {
  $('menu-screen').classList.remove('hidden');
  ['office-view','camera-view','control-panel','hud','win-screen','jumpscare']
    .forEach(id => $(id).classList.add('hidden'));
}

function goToOffice() {
  S.onCam = false; S.onPanel = false;
  $('camera-view').classList.add('hidden');
  $('control-panel').classList.add('hidden');
  $('office-view').classList.remove('hidden');
}

function startNight() {
  S.night = parseInt($('night-choice').value, 10);
  S.running = true; S.time = 0; S.power = POWER_MAX;
  S.leftDoor = S.rightDoor = S.leftLight = S.rightLight = false;
  S.onCam = false; S.onPanel = false; S.currentCam = '1a';
  S.lastUpdate = performance.now();
  distMap = null;
  initPositions();
  initSystems();
  $('menu-screen').classList.add('hidden');
  $('office-view').classList.remove('hidden');
  $('hud').classList.remove('hidden');
  ['camera-view','control-panel','win-screen','jumpscare'].forEach(id => $(id).classList.add('hidden'));
  document.querySelectorAll('.cam-btn-map').forEach(b => b.classList.remove('active'));
  document.querySelector('.cam-btn-map[data-cam="1a"]')?.classList.add('active');
  requestAnimationFrame(gameLoop);
}

// ==================== EVENTS ====================
$('start-btn').addEventListener('click', startNight);
$('continue-btn').addEventListener('click', showMenu);

$('left-door-btn').addEventListener('click', () => { if (S.running) S.leftDoor = !S.leftDoor; });
$('right-door-btn').addEventListener('click', () => { if (S.running) S.rightDoor = !S.rightDoor; });
$('left-light-btn').addEventListener('mousedown', () => { if (S.running) S.leftLight = true; });
$('left-light-btn').addEventListener('mouseup', () => S.leftLight = false);
$('left-light-btn').addEventListener('mouseleave', () => S.leftLight = false);
$('right-light-btn').addEventListener('mousedown', () => { if (S.running) S.rightLight = true; });
$('right-light-btn').addEventListener('mouseup', () => S.rightLight = false);
$('right-light-btn').addEventListener('mouseleave', () => S.rightLight = false);

$('cam-btn').addEventListener('click', () => {
  if (!S.running) return;
  S.onCam = true; S.onPanel = false;
  $('office-view').classList.add('hidden');
  $('control-panel').classList.add('hidden');
  $('camera-view').classList.remove('hidden');
});
$('cam-close-btn').addEventListener('click', goToOffice);

$('panel-btn').addEventListener('click', () => {
  if (!S.running) return;
  S.onPanel = true; S.onCam = false;
  $('office-view').classList.add('hidden');
  $('camera-view').classList.add('hidden');
  $('control-panel').classList.remove('hidden');
});
$('panel-close-btn').addEventListener('click', goToOffice);

document.querySelectorAll('.cam-btn-map').forEach(btn => {
  btn.addEventListener('click', () => {
    S.currentCam = btn.dataset.cam;
    document.querySelectorAll('.cam-btn-map').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.querySelectorAll('.sys-reboot-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!S.running) return;
    rebootSystem(btn.dataset.sys);
  });
});

document.querySelectorAll('button').forEach(b => b.addEventListener('contextmenu', e => e.preventDefault()));
window.addEventListener('resize', () => { if (S.running) render(); });
