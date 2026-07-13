// ─── Notifications ────────────────────────────────────────────────────────────
async function loadNotifications() {
  if (!currentUser) return;
  let query = sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60);
  if (currentUser.isAdmin) {
    query = query.or(`user_id.eq.${currentUser.id},user_id.is.null`);
  } else {
    query = query.eq('user_id', currentUser.id);
  }
  const { data } = await query;
  notifications = data || [];
  updateBellBadge();
}

async function createNotif(userId, type, title, body = '') {
  const { data, error } = await sb.from('notifications')
    .insert({ user_id: userId ?? null, type, title, body, is_read: false })
    .select().single();
  if (error) return;
  const isForMe = data.user_id === null ? currentUser?.isAdmin : data.user_id === currentUser?.id;
  if (isForMe) {
    notifications.unshift(data);
    updateBellBadge();
    if (document.getElementById('notif-panel')?.dataset.open === 'true') renderNotifPanel();
  }
}

function updateBellBadge() {
  const badge = document.getElementById('bell-badge');
  const unread = notifications.filter(notif => !notif.is_read).length;
  if (!badge) return;
  badge.textContent = unread > 9 ? '9+' : unread;
  badge.style.display = unread > 0 ? '' : 'none';
}

function timeAgo(isoStr) {
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const NOTIF_ICON = { course_assigned: '📚', new_course: '🌱', user_joined: '👋', course_completed: '✅' };

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isOpen = panel.dataset.open === 'true';
  if (isOpen) {
    panel.dataset.open = 'false';
    panel.style.display = 'none';
  } else {
    panel.dataset.open = 'true';
    panel.style.display = '';
    renderNotifPanel();
    markAllNotifsRead();
  }
}

function renderNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="notif-header">
      <span class="notif-title">Notifications</span>
      <button class="notif-clear-btn" onclick="clearAllNotifs()">Clear all</button>
    </div>
    <div class="notif-list">
      ${notifications.length ? notifications.map(notif => `
        <div class="notif-item ${notif.is_read ? '' : 'unread'}">
          <div class="notif-item-icon">${NOTIF_ICON[notif.type] || '🔔'}</div>
          <div class="notif-item-body">
            <div class="notif-item-title">${esc(notif.title)}</div>
            ${notif.body ? `<div class="notif-item-sub">${esc(notif.body)}</div>` : ''}
            <div class="notif-item-time">${timeAgo(notif.created_at)}</div>
          </div>
        </div>`).join('')
      : '<div class="notif-empty">You\'re all caught up 🎉</div>'}
    </div>`;
}

async function markAllNotifsRead() {
  const unreadIds = notifications.filter(notif => !notif.is_read).map(notif => notif.id);
  if (!unreadIds.length) return;
  notifications.forEach(notif => { notif.is_read = true; });
  updateBellBadge();
  await sb.from('notifications').update({ is_read: true }).in('id', unreadIds);
}

async function clearAllNotifs() {
  const ids = notifications.map(notif => notif.id);
  notifications = [];
  updateBellBadge();
  renderNotifPanel();
  if (ids.length) await sb.from('notifications').delete().in('id', ids);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function initials(name) {
  return name.split(' ').slice(0,2).map(word => word[0]).join('').toUpperCase();
}
function avatarHTML(user, size = 40, extraStyle = '') {
  const fs = size <= 32 ? '.72rem' : size <= 38 ? '.8rem' : '.85rem';
  const base = `width:${size}px;height:${size}px;${extraStyle}`;
  if (user.avatarUrl) {
    return `<div class="user-avatar" style="${base};background:${user.color};overflow:hidden"><img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" /></div>`;
  }
  return `<div class="user-avatar" style="${base};background:${user.color};font-size:${fs}">${initials(user.name)}</div>`;
}
function formatDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
function getCourse(id)   { return courses.find(course => course.id === id); }
function getUser(id)     { return allUsers.find(user => user.id === id); }
function getProgress(userId, courseId) {
  return progress[`${userId}_${courseId}`] || { currentSlide: 0, lessonCard: 0, completed: false, score: null, passed: false };
}
function setProgress(userId, courseId, update) {
  const key = `${userId}_${courseId}`;
  progress[key] = { ...getProgress(userId, courseId), ...update };
  const saved = progress[key];
  sb.from('progress').upsert({
    user_id: userId, course_id: courseId,
    current_slide: saved.currentSlide, completed: saved.completed,
    score: saved.score ?? null, passed: saved.passed,
  }).then(({ error }) => {
    if (error) {
      console.error('Progress save:', error);
      toast('⚠️ Progress failed to save: ' + error.message, 'error');
    }
  });
}

// Lesson-card position is written through its own upsert (not folded into setProgress's
// payload) so that a missing `lesson_card` column can only break lesson-position resume —
// never the current_slide/completed/score/passed fields every other content type depends on.
function setLessonCard(userId, courseId, cardIndex) {
  const key = `${userId}_${courseId}`;
  progress[key] = { ...getProgress(userId, courseId), lessonCard: cardIndex };
  sb.from('progress').upsert({ user_id: userId, course_id: courseId, lesson_card: cardIndex })
    .then(({ error }) => { if (error) console.error('Lesson card progress save:', error); });
}
function getUserAssignments(userId) { return assignments[userId] || []; }
function isAssigned(userId, courseId) { return getUserAssignments(userId).includes(courseId); }
function userCompletions(userId) {
  return getUserAssignments(userId).filter(cid => getProgress(userId, cid).completed).length;
}
function userAvgProgress(userId) {
  const assigned = getUserAssignments(userId);
  if (!assigned.length) return 0;
  const total = assigned.reduce((sum, cid) => {
    const prog = getProgress(userId, cid);
    if (prog.completed) return sum + 100;
    const course = getCourse(cid);
    if (!course || !course.totalPages) return sum;
    return sum + Math.round((prog.currentSlide / course.totalPages) * 100);
  }, 0);
  return Math.round(total / assigned.length);
}
function learners() { return allUsers; }

// ─── Gamification ─────────────────────────────────────────────────────────────
const LEVELS = [
  { min: 0,    label: 'Seedling',        icon: '🌱' },
  { min: 100,  label: 'Sprout',          icon: '🌿' },
  { min: 300,  label: 'Sapling',         icon: '🪴' },
  { min: 600,  label: 'Tree',            icon: '🌳' },
  { min: 1000, label: 'Forest Guardian', icon: '🌲' },
];
const BADGES = [
  { id: 'first_pass',   icon: '🎓', label: 'First Graduate',  desc: 'Passed your first assessment' },
  { id: 'perfect',      icon: '💯', label: 'Perfect Score',   desc: 'Scored 100% on an assessment' },
  { id: 'all_done',     icon: '🏅', label: 'All Clear',       desc: 'Completed all assigned courses' },
  { id: 'speed',        icon: '⚡', label: 'Quick Learner',   desc: 'Passed 3 or more assessments' },
  { id: 'high_scorer',  icon: '🔥', label: 'On Fire',         desc: 'Scored 90%+ on 3 assessments' },
];

function userXP(userId) {
  return getUserAssignments(userId).reduce((xp, cid) => {
    const prog = getProgress(userId, cid);
    if (!prog.completed) return xp;
    const base = 50;
    const bonus = prog.score ? Math.round((prog.score / 100) * 50) : 0;
    const perfect = prog.score === 100 ? 25 : 0;
    return xp + base + bonus + perfect;
  }, 0);
}
function userLevel(userId) {
  const xp = userXP(userId);
  let level = LEVELS[0];
  for (const levelEntry of LEVELS) { if (xp >= levelEntry.min) level = levelEntry; }
  return level;
}
function userNextLevel(userId) {
  const xp = userXP(userId);
  const next = LEVELS.find(levelEntry => levelEntry.min > xp);
  return next ? { xpNeeded: next.min - xp, label: next.label } : null;
}
function userBadges(userId) {
  const assignments = getUserAssignments(userId);
  const passes = assignments.filter(cid => getProgress(userId, cid).passed);
  const scores = passes.map(cid => getProgress(userId, cid).score || 0);
  const earned = [];
  if (passes.length >= 1) earned.push('first_pass');
  if (scores.some(score => score === 100)) earned.push('perfect');
  if (assignments.length > 0 && assignments.every(cid => getProgress(userId, cid).completed)) earned.push('all_done');
  if (passes.length >= 3) earned.push('speed');
  if (scores.filter(score => score >= 90).length >= 3) earned.push('high_scorer');
  return BADGES.filter(badge => earned.includes(badge.id));
}

function confetti() {
  const colors = ['#4CAF50','#32CE13','#1B3A1B','#FFD700','#FF6B6B','#4FC3F7'];
  for (let particleIndex = 0; particleIndex < 80; particleIndex++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; z-index:99999; pointer-events:none;
      width:${6 + Math.random()*6}px; height:${6 + Math.random()*6}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>0.5?'50%':'2px'};
      left:${Math.random()*100}vw; top:-10px;
      opacity:1; transform:rotate(${Math.random()*360}deg);
    `;
    document.body.appendChild(el);
    const duration = 1800 + Math.random() * 1400;
    const drift = (Math.random() - 0.5) * 200;
    el.animate([
      { transform: `translateY(0) translateX(0) rotate(0deg)`, opacity: 1 },
      { transform: `translateY(100vh) translateX(${drift}px) rotate(${Math.random()*720}deg)`, opacity: 0 }
    ], { duration, easing: 'cubic-bezier(.25,.46,.45,.94)' }).onfinish = () => el.remove();
  }
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function animateCount(el, target) {
  const dur = 900;
  const start = Date.now();
  const run = () => {
    const elapsed = Math.min((Date.now() - start) / dur, 1);
    el.textContent = Math.round(elapsed * target);
    if (elapsed < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

function showModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" id="modal-overlay-el" onclick="handleOverlayClick(event)">${html}</div>`;
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}
function handleOverlayClick(event) {
  if (event.target.id === 'modal-overlay-el') closeModal();
}

function showLoader(msg = 'Loading', sub = '') {
  let el = document.getElementById('global-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loader';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="loader-card">
      <div class="loader-ring-wrap">
        <svg class="loader-ring" viewBox="0 0 80 80">
          <circle class="track" cx="40" cy="40" r="35"/>
          <circle cx="40" cy="40" r="35" transform="rotate(-90 40 40)"/>
        </svg>
        <img src="assets/logos/logo-icon-green.svg" class="loader-logo-img" alt="" />
      </div>
      <div class="loader-msg">${msg}<span class="loader-dot"></span><span class="loader-dot"></span><span class="loader-dot"></span></div>
      ${sub ? `<div class="loader-sub">${sub}</div>` : ''}
    </div>`;
  el.style.display = 'flex';
}
function hideLoader() {
  const el = document.getElementById('global-loader');
  if (el) el.remove();
}

function nextCourseId() {
  const nums = courses.map(course => parseInt(course.id.replace('c',''))).filter(Boolean);
  return 'c' + (Math.max(0, ...nums) + 1);
}

