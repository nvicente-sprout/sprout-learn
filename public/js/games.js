// ─── Flappy Sprout ────────────────────────────────────────────────────────────
async function loadFlappyScores() {
  try {
    const { data } = await sb.from('flappy_scores')
      .select('user_id, high_score')
      .order('high_score', { ascending: false })
      .limit(10);
    if (data) {
      flappyScores = data.map(row => {
        const userData = getUser(row.user_id);
        return { userId: row.user_id, name: userData?.name || 'Unknown', color: userData?.color || '#ccc', avatarUrl: userData?.avatarUrl || null, highScore: row.high_score };
      });
    }
  } catch(error) {}
}

async function saveFlappyScore(score) {
  try {
    const { error } = await sb.from('flappy_scores').upsert(
      { user_id: currentUser.id, high_score: score, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) { console.error('flappy save error:', error); return; }
    await loadFlappyScores();
  } catch(error) { console.error('flappy save exception:', error); }
}

function renderFlappyLeaderboard() {
  const el = document.getElementById('flappy-lb');
  if (!el) return;
  const myId = currentUser?.id;
  if (!flappyScores.length) {
    el.innerHTML = `<div class="flappy-lb-empty">No scores yet — be the first! 🏆</div>`;
    return;
  }
  el.innerHTML = flappyScores.slice(0, 5).map((scoreEntry, scoreIndex) => {
    const medals = ['🥇','🥈','🥉'];
    const isMe = scoreEntry.userId === myId;
    const avatar = scoreEntry.avatarUrl
      ? `<img src="${scoreEntry.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"/>`
      : initials(scoreEntry.name);
    return `<div class="flappy-lb-row${isMe?' flappy-lb-row--me':''}">
      <div class="flappy-lb-rank">${medals[scoreIndex] || `#${scoreIndex+1}`}</div>
      <div class="user-avatar" style="background:${scoreEntry.color};width:28px;height:28px;font-size:.6rem;flex-shrink:0">${avatar}</div>
      <div class="flappy-lb-name">${esc(scoreEntry.name)}${isMe?'<span class="ld-you-badge" style="margin-left:.3rem">You</span>':''}</div>
      <div class="flappy-lb-score">${scoreEntry.highScore}</div>
    </div>`;
  }).join('');
}

function destroyFlappy() {
  if (_flappyGame) { _flappyGame.destroy(); _flappyGame = null; }
}

function startFlappyGame() {
  destroyFlappy();
  const myScore = flappyScores.find(scoreEntry => scoreEntry.userId === currentUser?.id)?.highScore || 0;
  _flappyGame = new RunnerGame('flappy-canvas', myScore);
}

function setRunnerChar(charName) { localStorage.setItem('sprout_char', charName); }
function getRunnerChar()  { return localStorage.getItem('sprout_char') || 'boy'; }

class RunnerGame {
  constructor(canvasId, bestScore = 0) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx    = this.canvas.getContext('2d');
    this.W      = this.canvas.width;
    this.H      = this.canvas.height;
    this.state  = 'idle';
    this.score  = 0;
    this.best   = bestScore;
    this._frame = 0;
    this._dist  = 0;

    this.GROUND_Y = this.H - 68;
    this.speed    = 1.9;   // 50% slower start

    this.runner   = { x: 75, y: this.GROUND_Y, vy: 0, jumping: false, jumps: 0, leg: 0 };
    this.obs      = [];
    this.coins    = [];
    this.obsTimer = 0;
    this.coinTimer = 0;
    this.groundX  = 0;
    this.cloudX   = 0;

    this._input = this._input.bind(this);
    this.canvas.addEventListener('click',      this._input);
    this.canvas.addEventListener('touchstart', this._input, { passive: true });
    document.addEventListener('keydown',       this._input);
    this._tick = this._tick.bind(this);
    this._raf  = requestAnimationFrame(this._tick);
  }

  _input(e) {
    if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'ArrowUp') return;
    if (e.type === 'keydown') e.preventDefault();
    if (this.state === 'idle' || this.state === 'dead') {
      this._reset(); this.state = 'playing';
    } else if (this.state === 'playing' && this.runner.jumps < 2) {
      this.runner.vy = -12; this.runner.jumping = true; this.runner.jumps++;
    }
  }

  _reset() {
    this.runner   = { x: 75, y: this.GROUND_Y, vy: 0, jumping: false, jumps: 0, leg: 0 };
    this.obs      = []; this.coins = [];
    this.obsTimer = 0; this.coinTimer = 0;
    this.score    = 0; this._frame = 0; this._dist = 0;
    this.speed    = 1.9;
  }

  _update() {
    if (this.state !== 'playing') return;
    this._frame++;
    this._dist += this.speed;
    this.score  = Math.floor(this._dist / 8);
    this.speed  = Math.min(4.5, 1.9 + Math.floor(this.score / 20) * 0.18); // max 4.5

    const runner = this.runner;
    runner.vy += 0.52; runner.y += runner.vy;
    if (runner.y >= this.GROUND_Y) { runner.y = this.GROUND_Y; runner.vy = 0; runner.jumping = false; runner.jumps = 0; }
    if (!runner.jumping) runner.leg = (runner.leg + 0.22) % (Math.PI * 2);

    this.groundX = (this.groundX - this.speed + 60) % 60;
    this.cloudX  = (this.cloudX  - this.speed * 0.25 + 500) % 500;

    // Obstacles — longer gaps, scale slowly
    this.obsTimer++;
    const gap = Math.max(90, 140 - Math.floor(this.score / 15) * 4);
    if (this.obsTimer >= gap) {
      this.obsTimer = 0;
      const obsHeight = 36 + Math.floor(Math.random() * 3) * 22; // 36, 58, or 80
      this.obs.push({ x: this.W + 10, h: obsHeight });
    }

    this.coinTimer++;
    if (this.coinTimer >= 55) {
      this.coinTimer = 0;
      this.coins.push({ x: this.W + 10, y: this.GROUND_Y - 70 - Math.random() * 50 });
    }

    for (const obstacle of this.obs) obstacle.x -= this.speed;
    this.obs = this.obs.filter(obstacle => obstacle.x > -40);
    for (const obstacle of this.obs) { if (this._hitObs(obstacle)) { this._die(); return; } }

    for (const coin of this.coins) coin.x -= this.speed;
    for (const coin of this.coins) {
      if (!coin.col && Math.abs(coin.x - runner.x) < 24 && Math.abs(coin.y - (runner.y - 36)) < 24) { coin.col = true; this.score += 3; }
    }
    this.coins = this.coins.filter(coin => coin.x > -20 && !coin.col);
  }

  _hitObs(obstacle) {
    const runner = this.runner;
    const rL = runner.x - 13, rR = runner.x + 13, rT = runner.y - 42, rB = runner.y - 4;
    const oL = obstacle.x - 16, oR = obstacle.x + 16, oT = this.GROUND_Y - obstacle.h;
    return rL < oR && rR > oL && rT < this.GROUND_Y && rB > oT;
  }

  async _die() {
    this.state = 'dead';
    if (this.score > this.best) {
      this.best = this.score;
      await saveFlappyScore(this.score);
      renderFlappyLeaderboard();
    }
  }

  _draw() {
    const ctx = this.ctx, canvasW = this.W, canvasH = this.H;
    const sky = ctx.createLinearGradient(0, 0, 0, this.GROUND_Y);
    sky.addColorStop(0, '#b2dfdb'); sky.addColorStop(1, '#e8f5e9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvasW, this.GROUND_Y);

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    const cx = this.cloudX;
    this._cloud(cx % canvasW, 45, 34); this._cloud((cx+200)%canvasW, 26, 22); this._cloud((cx+340)%canvasW, 60, 18);

    for (const obstacle of this.obs) this._drawObs(obstacle);

    for (const coin of this.coins) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(coin.x, coin.y, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(coin.x-2, coin.y-2, 3, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(0, this.GROUND_Y, canvasW, canvasH - this.GROUND_Y);
    ctx.fillStyle = '#3ED320';  ctx.fillRect(0, this.GROUND_Y, canvasW, 8);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let groundTileX = this.groundX; groundTileX < canvasW; groundTileX += 60) ctx.fillRect(groundTileX, this.GROUND_Y + 14, 30, 5);

    this._drawRunner();

    if (this.state !== 'idle') {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px system-ui'; ctx.fillStyle = 'white';
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 4;
      ctx.fillText(this.score, canvasW - 16, 32);
      ctx.shadowBlur = 0;
    }

    if (this.state === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, canvasW, canvasH);
      this._txt('🏃 Sprout Runner', canvasW/2, canvasH/2 - 30, 'bold 20px system-ui', 'white');
      this._txt('Tap / Space to start', canvasW/2, canvasH/2 + 8, '15px system-ui', 'rgba(255,255,255,.85)');
      this._txt('Tap twice = double jump!', canvasW/2, canvasH/2 + 32, '13px system-ui', 'rgba(255,255,255,.6)');
      this._txt(`Best: ${this.best}`, canvasW/2, canvasH/2 + 56, '14px system-ui', '#3ED320');
    }
    if (this.state === 'dead') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, canvasW, canvasH);
      this._txt('💥 Ouch!', canvasW/2, canvasH/2 - 42, 'bold 22px system-ui', 'white');
      this._txt(`Score: ${this.score}`, canvasW/2, canvasH/2 - 10, '17px system-ui', 'white');
      this._txt(`Best: ${this.best}`, canvasW/2, canvasH/2 + 18, '15px system-ui', '#3ED320');
      this._txt('Tap or Space to retry', canvasW/2, canvasH/2 + 50, '13px system-ui', 'rgba(255,255,255,.8)');
    }
  }

  _drawObs(obstacle) {
    const ctx = this.ctx, obsX = obstacle.x, obsY = this.GROUND_Y - obstacle.h, obsWidth = 32;
    ctx.fillStyle = '#1B3A1B'; ctx.fillRect(obsX - obsWidth/2, obsY, obsWidth, obstacle.h);
    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(obsX - obsWidth/2, obsY, obsWidth, 8);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    for (let stripe = 14; stripe < obstacle.h - 4; stripe += 10) ctx.fillRect(obsX - obsWidth/2 + 5, obsY + stripe, obsWidth - 10, 5);
  }

  _drawRunner() {
    const ctx = this.ctx, runner = this.runner;
    const runX = runner.x, runY = runner.y;
    const swing = runner.jumping ? 0 : Math.sin(runner.leg) * 10;
    const char  = getRunnerChar();
    const skin  = '#FDBCB4';

    if (char === 'girl') {
      // Legs (bare skin)
      ctx.fillStyle = skin;
      ctx.fillRect(runX - 9 + swing, runY - 16, 8, 17);
      ctx.fillRect(runX + 1 - swing, runY - 16, 8, 17);
      // Skirt
      ctx.fillStyle = '#e91e63';
      ctx.beginPath(); ctx.moveTo(runX - 14, runY - 22); ctx.lineTo(runX + 14, runY - 22);
      ctx.lineTo(runX + 16, runY - 10); ctx.lineTo(runX - 16, runY - 10); ctx.closePath(); ctx.fill();
      // Top
      ctx.fillStyle = '#c2185b';
      ctx.fillRect(runX - 10, runY - 40, 20, 19);
      // Arms
      ctx.fillStyle = skin;
      ctx.fillRect(runX - 16, runY - 38, 6, 12);
      ctx.fillRect(runX + 10, runY - 38, 6, 12);
      // Head
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(runX, runY - 52, 13, 0, Math.PI*2); ctx.fill();
      // Hair (long with side strands)
      ctx.fillStyle = '#8b5e3c';
      ctx.beginPath(); ctx.arc(runX, runY - 62, 13, Math.PI, 0); ctx.fill();
      ctx.fillRect(runX - 13, runY - 62, 5, 20);
      ctx.fillRect(runX + 8,  runY - 62, 5, 20);
      ctx.fillRect(runX - 13, runY - 62, 26, 8);
      // Eyes
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(runX - 4, runY - 52, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(runX + 4, runY - 52, 2, 0, Math.PI*2); ctx.fill();
    } else {
      // Boy
      // Legs / pants
      ctx.fillStyle = '#37474f';
      ctx.fillRect(runX - 9 + swing, runY - 16, 8, 17);
      ctx.fillRect(runX + 1 - swing, runY - 16, 8, 17);
      // Shoes
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(runX - 10 + swing, runY - 4, 10, 5);
      ctx.fillRect(runX, runY - 4 - swing*0.3, 10, 5);
      // Shirt
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(runX - 11, runY - 40, 22, 25);
      // Arms
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(runX - 17, runY - 39, 6, 13);
      ctx.fillRect(runX + 11, runY - 39, 6, 13);
      ctx.fillStyle = skin;
      ctx.fillRect(runX - 17, runY - 27, 6, 6);
      ctx.fillRect(runX + 11, runY - 27, 6, 6);
      // Head
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(runX, runY - 52, 13, 0, Math.PI*2); ctx.fill();
      // Hair
      ctx.fillStyle = '#4a3728';
      ctx.beginPath(); ctx.arc(runX, runY - 62, 13, Math.PI, 0); ctx.fill();
      ctx.fillRect(runX - 13, runY - 63, 26, 8);
      // Eyes
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(runX - 4, runY - 52, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(runX + 4, runY - 52, 2, 0, Math.PI*2); ctx.fill();
    }
  }

  _cloud(cloudX, cloudY, cloudRadius) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, cloudRadius, 0, Math.PI*2); ctx.arc(cloudX+cloudRadius*.8, cloudY-cloudRadius*.3, cloudRadius*.7, 0, Math.PI*2); ctx.arc(cloudX+cloudRadius*1.5, cloudY, cloudRadius*.8, 0, Math.PI*2);
    ctx.fill();
  }

  _txt(text, textX, textY, font, color) {
    const ctx = this.ctx;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, textY);
  }

  _tick() { this._update(); this._draw(); this._raf = requestAnimationFrame(this._tick); }

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this.canvas) {
      this.canvas.removeEventListener('click',      this._input);
      this.canvas.removeEventListener('touchstart', this._input);
    }
    document.removeEventListener('keydown', this._input);
  }
}

// ─── Duck Hunt ────────────────────────────────────────────────────────────────
async function loadDuckScores() {
  try {
    const { data } = await sb.from('duck_hunt_scores')
      .select('user_id, high_score')
      .order('high_score', { ascending: false })
      .limit(10);
    if (data) {
      duckScores = data.map(row => {
        const userData = getUser(row.user_id);
        return { userId: row.user_id, name: userData?.name || 'Unknown', color: userData?.color || '#ccc', avatarUrl: userData?.avatarUrl || null, highScore: row.high_score };
      });
    }
  } catch {}
}

async function saveDuckScore(score) {
  try {
    const { error } = await sb.from('duck_hunt_scores').upsert(
      { user_id: currentUser.id, high_score: score, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) { console.error('duck save error:', error); return; }
    await loadDuckScores();
  } catch(error) { console.error('duck save exception:', error); }
}

function renderDuckLeaderboard() {
  const el = document.getElementById('duck-lb');
  if (!el) return;
  const myId = currentUser?.id;
  if (!duckScores.length) { el.innerHTML = `<div class="flappy-lb-empty">No scores yet — be the first! 🏆</div>`; return; }
  el.innerHTML = duckScores.slice(0, 5).map((scoreEntry, scoreIndex) => {
    const medals = ['🥇','🥈','🥉'];
    const isMe = scoreEntry.userId === myId;
    const avatar = scoreEntry.avatarUrl
      ? `<img src="${scoreEntry.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"/>`
      : initials(scoreEntry.name);
    return `<div class="flappy-lb-row${isMe?' flappy-lb-row--me':''}">
      <div class="flappy-lb-rank">${medals[scoreIndex] || `#${scoreIndex+1}`}</div>
      <div class="user-avatar" style="background:${scoreEntry.color};width:28px;height:28px;font-size:.6rem;flex-shrink:0">${avatar}</div>
      <div class="flappy-lb-name">${esc(scoreEntry.name)}${isMe?'<span class="ld-you-badge" style="margin-left:.3rem">You</span>':''}</div>
      <div class="flappy-lb-score">${scoreEntry.highScore}</div>
    </div>`;
  }).join('');
}

function destroyDuck() {
  if (_duckGame) { _duckGame.destroy(); _duckGame = null; }
}

function startDuckHunt() {
  destroyDuck();
  const myScore = duckScores.find(scoreEntry => scoreEntry.userId === currentUser?.id)?.highScore || 0;
  _duckGame = new DuckHuntGame('duck-canvas', myScore);
}

class DuckHuntGame {
  constructor(canvasId, bestScore = 0) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx    = this.canvas.getContext('2d');
    this.W      = this.canvas.width;
    this.H      = this.canvas.height;
    this.state  = 'idle';
    this.score  = 0;
    this.best   = bestScore;
    this.ducks  = [];
    this.shots  = [];
    this.spawnTimer  = 0;
    this.timeLeft    = 30;
    this._frameCount = 0;
    this._lastSec    = 0;
    this.crosshair   = { x: -200, y: -200 };

    this._onMove  = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onTouch = this._onTouch.bind(this);
    this._tick    = this._tick.bind(this);

    this.canvas.addEventListener('mousemove',  this._onMove);
    this.canvas.addEventListener('click',      this._onClick);
    this.canvas.addEventListener('touchstart', this._onTouch, { passive: false });
    this._raf = requestAnimationFrame(this._tick);
  }

  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.crosshair.x = (e.clientX - rect.left) * (this.W / rect.width);
    this.crosshair.y = (e.clientY - rect.top)  * (this.H / rect.height);
  }

  _onTouch(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const touchX = (touch.clientX - rect.left) * (this.W / rect.width);
    const touchY = (touch.clientY - rect.top)  * (this.H / rect.height);
    this.crosshair = { x: touchX, y: touchY };
    if (this.state === 'idle' || this.state === 'done') { this._reset(); this.state = 'playing'; }
    else this._shoot(touchX, touchY);
  }

  _onClick(e) {
    const rect  = this.canvas.getBoundingClientRect();
    const clickX  = (e.clientX - rect.left) * (this.W / rect.width);
    const clickY  = (e.clientY - rect.top)  * (this.H / rect.height);
    if (this.state === 'idle' || this.state === 'done') { this._reset(); this.state = 'playing'; return; }
    this._shoot(clickX, clickY);
  }

  _shoot(x, y) {
    if (this.state !== 'playing') return;
    let hit = false;
    for (const duck of this.ducks) {
      if (duck.state !== 'alive') continue;
      if (Math.hypot(x - duck.x, y - duck.y) < duck.r + 8) {
        duck.state = 'falling'; duck.fallVy = -4;
        this.score += duck.pts;
        this.shots.push({ x: duck.x, y: duck.y - 20, text: `+${duck.pts}`, timer: 45 });
        hit = true; break;
      }
    }
    if (!hit) this.shots.push({ x, y, text: '✗', timer: 22, miss: true });
  }

  _reset() {
    this.ducks = []; this.shots = [];
    this.spawnTimer = 0; this.score = 0;
    this.timeLeft = 30; this._frameCount = 0; this._lastSec = 0;
  }

  _spawnDuck() {
    const small   = Math.random() < 0.35;
    const r       = small ? 13 : 22;
    const pts     = small ? 25 : 10;
    const spd     = small ? 2.8 + Math.random() * 1.8 : 1.6 + Math.random() * 1.4;
    const fromL   = Math.random() > 0.5;
    const x       = fromL ? -50 : this.W + 50;
    const y       = 50 + Math.random() * (this.H - 180);
    const vx      = fromL ? spd : -spd;
    const vy      = (Math.random() - 0.5) * 1.2;
    const colors  = ['#8B4513','#556B2F','#4B0082','#8B0000','#005f73'];
    this.ducks.push({ x, y, vx, vy, r, pts, state: 'alive', fallVy: 0,
      wing: Math.random() * Math.PI * 2, color: colors[Math.floor(Math.random()*colors.length)] });
  }

  _update() {
    if (this.state !== 'playing') return;
    this._frameCount++;

    const secs = Math.floor(this._frameCount / 60);
    if (secs > this._lastSec) {
      this._lastSec = secs;
      this.timeLeft = Math.max(0, 30 - secs);
      if (this.timeLeft <= 0) { this._endGame(); return; }
    }

    this.spawnTimer++;
    const interval = Math.max(45, 90 - Math.floor((30 - this.timeLeft) * 2));
    if (this.spawnTimer >= interval && this.ducks.filter(duck => duck.state === 'alive').length < 6) {
      this.spawnTimer = 0;
      this._spawnDuck();
    }

    for (const duck of this.ducks) {
      if (duck.state === 'alive') {
        duck.x += duck.vx; duck.y += duck.vy; duck.wing += 0.28;
        if (duck.y < 35)         { duck.y = 35;         duck.vy =  Math.abs(duck.vy); }
        if (duck.y > this.H-140) { duck.y = this.H-140; duck.vy = -Math.abs(duck.vy); }
        if (duck.x < -80 || duck.x > this.W + 80) duck.state = 'gone';
      } else if (duck.state === 'falling') {
        duck.fallVy += 0.45; duck.y += duck.fallVy; duck.wing += 0.08;
        if (duck.y > this.H) duck.state = 'gone';
      }
    }
    this.ducks = this.ducks.filter(duck => duck.state !== 'gone');
    for (const shot of this.shots) { shot.timer--; shot.y -= 0.6; }
    this.shots = this.shots.filter(shot => shot.timer > 0);
  }

  async _endGame() {
    this.state = 'done';
    if (this.score > this.best) {
      this.best = this.score;
      await saveDuckScore(this.score);
      renderDuckLeaderboard();
    }
  }

  _draw() {
    const ctx = this.ctx, canvasW = this.W, canvasH = this.H;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, canvasH - 80);
    sky.addColorStop(0, '#5ba3d9'); sky.addColorStop(1, '#c8e8f8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvasW, canvasH - 80);

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    this._cloud(80, 48, 38); this._cloud(260, 28, 26); this._cloud(430, 52, 32); this._cloud(560, 32, 22);

    // Ducks
    for (const duck of this.ducks) this._drawDuck(duck);

    // Floating score texts
    for (const shot of this.shots) {
      ctx.globalAlpha = Math.min(1, shot.timer / (shot.miss ? 22 : 45));
      ctx.font = `bold ${shot.miss ? 15 : 19}px system-ui`;
      ctx.fillStyle = shot.miss ? '#ef5350' : '#FFD700';
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
      ctx.fillText(shot.text, shot.x, shot.y);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // Ground / trees
    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(0, canvasH - 80, canvasW, 80);
    ctx.fillStyle = '#3ED320'; ctx.fillRect(0, canvasH - 80, canvasW, 10);
    ctx.fillStyle = '#1B3A1B';
    for (let tx = 30; tx < canvasW; tx += 70) {
      ctx.beginPath(); ctx.arc(tx, canvasH - 84, 22, 0, Math.PI * 2); ctx.fill();
    }

    // HUD
    if (this.state !== 'idle') {
      ctx.font = 'bold 22px system-ui'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
      ctx.fillStyle = this.timeLeft <= 5 ? '#ef5350' : 'white';
      ctx.textAlign = 'left';  ctx.fillText(`⏱ ${this.timeLeft}s`, 14, 32);
      ctx.fillStyle = 'white'; ctx.textAlign = 'right'; ctx.fillText(`${this.score}`, canvasW - 14, 32);
      ctx.shadowBlur = 0;
    }

    // Crosshair
    if (this.state === 'playing') this._drawCrosshair(this.crosshair.x, this.crosshair.y);

    // Overlays
    if (this.state === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, canvasW, canvasH);
      this._txt('🦆 Duck Hunt', canvasW/2, canvasH/2 - 36, 'bold 24px system-ui', 'white');
      this._txt('Click to start — shoot the ducks!', canvasW/2, canvasH/2 + 4, '15px system-ui', 'rgba(255,255,255,.85)');
      this._txt('Big = 10pts  ·  Small = 25pts  ·  30 seconds', canvasW/2, canvasH/2 + 28, '13px system-ui', 'rgba(255,255,255,.65)');
      this._txt(`Best: ${this.best}`, canvasW/2, canvasH/2 + 56, '14px system-ui', '#FFD700');
    }
    if (this.state === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, canvasW, canvasH);
      this._txt("Time's Up! 🦆", canvasW/2, canvasH/2 - 48, 'bold 22px system-ui', 'white');
      this._txt(`Score: ${this.score}`, canvasW/2, canvasH/2 - 10, '20px system-ui', '#FFD700');
      this._txt(`Best: ${this.best}`, canvasW/2, canvasH/2 + 20, '16px system-ui', '#FFD700');
      this._txt('Click to play again', canvasW/2, canvasH/2 + 56, '13px system-ui', 'rgba(255,255,255,.8)');
    }
  }

  _drawDuck(d) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.state === 'falling') ctx.rotate(Math.sin(d.wing) * 0.6);
    ctx.scale(d.vx > 0 ? 1 : -1, 1);

    const duckRadius = d.r;
    // Wing
    ctx.save();
    ctx.translate(-duckRadius * 0.2, -duckRadius * 0.3);
    ctx.rotate(Math.sin(d.wing) * 0.55);
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, duckRadius * 0.9, duckRadius * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Body
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, duckRadius, duckRadius * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    ctx.fillStyle = d.pts === 25 ? '#006400' : d.color;
    ctx.beginPath(); ctx.arc(duckRadius * 0.72, -duckRadius * 0.5, duckRadius * 0.42, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.moveTo(duckRadius * 1.1, -duckRadius * 0.5); ctx.lineTo(duckRadius * 1.42, -duckRadius * 0.35); ctx.lineTo(duckRadius * 1.1, -duckRadius * 0.2);
    ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(duckRadius * 0.82, -duckRadius * 0.55, duckRadius * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';  ctx.beginPath(); ctx.arc(duckRadius * 0.84, -duckRadius * 0.55, duckRadius * 0.06, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  _drawCrosshair(crosshairX, crosshairY) {
    const ctx = this.ctx, crosshairRadius = 18;
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(crosshairX, crosshairY, crosshairRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(crosshairX - crosshairRadius - 6, crosshairY); ctx.lineTo(crosshairX - 5, crosshairY);
    ctx.moveTo(crosshairX + 5, crosshairY);     ctx.lineTo(crosshairX + crosshairRadius + 6, crosshairY);
    ctx.moveTo(crosshairX, crosshairY - crosshairRadius - 6); ctx.lineTo(crosshairX, crosshairY - 5);
    ctx.moveTo(crosshairX, crosshairY + 5);     ctx.lineTo(crosshairX, crosshairY + crosshairRadius + 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,50,50,.9)';
    ctx.beginPath(); ctx.arc(crosshairX, crosshairY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  _cloud(cloudX, cloudY, cloudRadius) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, cloudRadius, 0, Math.PI * 2);
    ctx.arc(cloudX + cloudRadius * 0.85, cloudY - cloudRadius * 0.3, cloudRadius * 0.7, 0, Math.PI * 2);
    ctx.arc(cloudX + cloudRadius * 1.55, cloudY, cloudRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  _txt(text, textX, textY, font, color) {
    const ctx = this.ctx;
    ctx.font = font; ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, textY);
  }

  _tick() { this._update(); this._draw(); this._raf = requestAnimationFrame(this._tick); }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.canvas?.removeEventListener('mousemove',  this._onMove);
    this.canvas?.removeEventListener('click',      this._onClick);
    this.canvas?.removeEventListener('touchstart', this._onTouch);
    if (this.canvas) this.canvas.style.cursor = '';
  }
}

