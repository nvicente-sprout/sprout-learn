/**
 * app.js — Sprout Learn
 * Sprout Solutions | Native LMS — Vanilla JS SPA
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://jwdumjludmjuufqhzysk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ZHVtamx1ZG1qdXVmcWh6eXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTMzNjcsImV4cCI6MjA4OTM4OTM2N30.kPXVHsFBBOvYgiDAP-LatzX4oiM4huhHyMFN1YKcfCk';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Gemini key is server-side only — calls go through /api/generate-questions

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ─── Initial Data ─────────────────────────────────────────────────────────────
const USER_COLORS = ['#1B3A1B','#2d5a2d','#3a7a3a','#4a9e4a','#1565c0','#6a1b9a','#e65100','#880e4f','#00695c','#4e342e'];
let allUsers = [];

const CATEGORIES = [
  'Leadership & Management', 'HR & Compliance', 'Partner Solutions',
  'Sprout Product Training', 'Uploaded Content', 'Other',
];
const CAT_EMOJI = {
  'Leadership & Management': '🎯', 'HR & Compliance': '📋',
  'Partner Solutions': '🤝', 'Sprout Product Training': '🌱',
  'Uploaded Content': '📄', 'Other': '📚',
};

const DEFAULT_COURSES = [
  { id: 'c1', title: 'Effective Leadership Fundamentals',    category: 'Leadership & Management', type: 'Free', contentType: 'none',    totalPages: 0, description: 'Build the foundational skills of effective leadership in the modern workplace.' },
  { id: 'c2', title: 'Philippine Labor Law Basics',          category: 'HR & Compliance',         type: 'Free', contentType: 'none',    totalPages: 0, description: 'Understand the key provisions of Philippine labor law and employee rights.' },
  { id: 'c3', title: 'Data Privacy in the Workplace',        category: 'HR & Compliance',         type: 'Free', contentType: 'none',    totalPages: 0, description: 'Learn how to protect employee and customer data under the Data Privacy Act.' },
  { id: 'c4', title: 'Manatal ATS Demo',                     category: 'Partner Solutions',        type: 'Free', contentType: 'youtube', totalPages: 0, youtubeId: 'VjinpYMUMoc', description: 'Explore Manatal\'s Applicant Tracking System with a live product demo.' },
  { id: 'c5', title: 'Conflict Resolution at Work',          category: 'Leadership & Management', type: 'Free', contentType: 'none',    totalPages: 0, description: 'Practical strategies for managing and resolving workplace conflict.' },
  { id: 'c6', title: 'Employee Onboarding Best Practices',   category: 'HR & Compliance',         type: 'Paid', contentType: 'none',    totalPages: 0, description: 'Design effective onboarding programs that set new hires up for success.' },
];
let courses = [];

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentRoute  = '';
let adminViewingAsLearner = false;
let assignments   = {};  // { userId: [courseId, ...] }
let progress      = {};  // { 'userId_courseId': { currentSlide, completed, score, passed } }
let questions     = {};  // { courseId: [...] }
let viewerPdfDoc    = null;
let viewerPage      = 1;
let viewerCourseId  = null;
let _pdfKeyHandler  = null;

// Assessment state
let assessmentAnswers  = [];
let assessmentCurrentQ = 0;
let assessmentCourseId = null;

let allTeams = [];
let notifications = [];
let flappyScores  = [];
let _flappyGame   = null;
let scormZipData  = null; // { zip, launchFile, fileCount }
let siteSettings  = { activeGame: 'sprout_runner' };
let duckScores    = [];
let _duckGame     = null;
let learningPaths = [];
let _pathCourseIds = []; // path builder state

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
  const unread = notifications.filter(n => !n.is_read).length;
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
      ${notifications.length ? notifications.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}">
          <div class="notif-item-icon">${NOTIF_ICON[n.type] || '🔔'}</div>
          <div class="notif-item-body">
            <div class="notif-item-title">${esc(n.title)}</div>
            ${n.body ? `<div class="notif-item-sub">${esc(n.body)}</div>` : ''}
            <div class="notif-item-time">${timeAgo(n.created_at)}</div>
          </div>
        </div>`).join('')
      : '<div class="notif-empty">You\'re all caught up 🎉</div>'}
    </div>`;
}

async function markAllNotifsRead() {
  const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
  if (!unreadIds.length) return;
  notifications.forEach(n => { n.is_read = true; });
  updateBellBadge();
  await sb.from('notifications').update({ is_read: true }).in('id', unreadIds);
}

async function clearAllNotifs() {
  const ids = notifications.map(n => n.id);
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
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}
function avatarHTML(u, size = 40, extraStyle = '') {
  const fs = size <= 32 ? '.72rem' : size <= 38 ? '.8rem' : '.85rem';
  const base = `width:${size}px;height:${size}px;${extraStyle}`;
  if (u.avatarUrl) {
    return `<div class="user-avatar" style="${base};background:${u.color};overflow:hidden"><img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" /></div>`;
  }
  return `<div class="user-avatar" style="${base};background:${u.color};font-size:${fs}">${initials(u.name)}</div>`;
}
function formatDate(d = new Date()) {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}
function getCourse(id)   { return courses.find(c => c.id === id); }
function getUser(id)     { return allUsers.find(u => u.id === id); }
function getProgress(userId, courseId) {
  return progress[`${userId}_${courseId}`] || { currentSlide: 0, completed: false, score: null, passed: false };
}
function setProgress(userId, courseId, update) {
  const key = `${userId}_${courseId}`;
  progress[key] = { ...getProgress(userId, courseId), ...update };
  const p = progress[key];
  sb.from('progress').upsert({
    user_id: userId, course_id: courseId,
    current_slide: p.currentSlide, completed: p.completed,
    score: p.score ?? null, passed: p.passed,
  }).then(({ error }) => {
    if (error) {
      console.error('Progress save:', error);
      toast('⚠️ Progress failed to save: ' + error.message, 'error');
    }
  });
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
    const p = getProgress(userId, cid);
    if (p.completed) return sum + 100;
    const c = getCourse(cid);
    if (!c || !c.totalPages) return sum;
    return sum + Math.round((p.currentSlide / c.totalPages) * 100);
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
    const p = getProgress(userId, cid);
    if (!p.completed) return xp;
    const base = 50;
    const bonus = p.score ? Math.round((p.score / 100) * 50) : 0;
    const perfect = p.score === 100 ? 25 : 0;
    return xp + base + bonus + perfect;
  }, 0);
}
function userLevel(userId) {
  const xp = userXP(userId);
  let level = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.min) level = l; }
  return level;
}
function userNextLevel(userId) {
  const xp = userXP(userId);
  const next = LEVELS.find(l => l.min > xp);
  return next ? { xpNeeded: next.min - xp, label: next.label } : null;
}
function userBadges(userId) {
  const assignments = getUserAssignments(userId);
  const passes = assignments.filter(cid => getProgress(userId, cid).passed);
  const scores = passes.map(cid => getProgress(userId, cid).score || 0);
  const earned = [];
  if (passes.length >= 1) earned.push('first_pass');
  if (scores.some(s => s === 100)) earned.push('perfect');
  if (assignments.length > 0 && assignments.every(cid => getProgress(userId, cid).completed)) earned.push('all_done');
  if (passes.length >= 3) earned.push('speed');
  if (scores.filter(s => s >= 90).length >= 3) earned.push('high_scorer');
  return BADGES.filter(b => earned.includes(b.id));
}

function confetti() {
  const colors = ['#4CAF50','#32CE13','#1B3A1B','#FFD700','#FF6B6B','#4FC3F7'];
  for (let i = 0; i < 80; i++) {
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
    const t = Math.min((Date.now() - start) / dur, 1);
    el.textContent = Math.round(t * target);
    if (t < 1) requestAnimationFrame(run);
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
function handleOverlayClick(e) {
  if (e.target.id === 'modal-overlay-el') closeModal();
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
  const nums = courses.map(c => parseInt(c.id.replace('c',''))).filter(Boolean);
  return 'c' + (Math.max(0, ...nums) + 1);
}

// ─── Supabase Data Layer ──────────────────────────────────────────────────────
function courseFromRow(row) {
  return {
    id: row.id, title: row.title, description: row.description || '',
    category: row.category, type: row.type, contentType: row.content_type,
    totalPages: row.total_pages || 0, pdfDataUrl: row.pdf_url || null,
    coverUrl: row.cover_url || null, youtubeId: row.youtube_id || null,
    slidesUrl: row.slides_url || null,
    scormUrl: row.content_type === 'scorm' ? (row.scorm_url || null) : null,
    htmlUrl:  row.content_type === 'html'  ? (row.scorm_url || null) : null,
  };
}
function courseToRow(c) {
  return {
    id: c.id, title: c.title, description: c.description || '',
    category: c.category, type: c.type, content_type: c.contentType,
    total_pages: c.totalPages || 0, pdf_url: c.pdfDataUrl || null,
    cover_url: c.coverUrl || null, youtube_id: c.youtubeId || null,
    slides_url: c.slidesUrl || null, scorm_url: c.scormUrl || c.htmlUrl || null,
  };
}

async function loadData() {
  showLoader('Loading Sprout Learn', 'Fetching your data');
  try {
    const [cRes, qRes, aRes, pRes, uRes, tRes, lpRes] = await Promise.all([
      sb.from('courses').select('*').order('created_at', { ascending: false }),
      sb.from('questions').select('*'),
      sb.from('assignments').select('*'),
      sb.from('progress').select('*'),
      sb.from('users').select('*').order('created_at', { ascending: true }),
      sb.from('teams').select('*').order('name'),
      sb.from('learning_paths').select('*').order('created_at', { ascending: false }),
    ]);

    if (cRes.error) console.error('courses load error:', cRes.error.message);
    if (qRes.error) { console.error('questions load error:', qRes.error.message); toast('⚠️ Questions failed to load: ' + qRes.error.message, 'error'); }
    if (aRes.error) { console.error('assignments load error:', aRes.error.message); toast('⚠️ Assignments failed to load: ' + aRes.error.message, 'error'); }
    if (pRes.error) console.error('progress load error:', pRes.error.message);
    if (uRes.error) console.error('users load error:', uRes.error.message);
    if (tRes.error) console.error('teams load error:', tRes.error.message);

    const cData = cRes.data, qData = qRes.data, aData = aRes.data,
          pData = pRes.data, uData = uRes.data;

    allTeams = tRes.data || [];
    learningPaths = lpRes.data ? lpRes.data.map(r => ({
      id: r.id, title: r.title, description: r.description || '', courseIds: r.course_ids || [],
    })) : [];

    allUsers = uData ? uData.map((u, i) => ({
      id: u.id, email: u.email, name: u.name || u.email.split('@')[0],
      role: u.role, isAdmin: u.is_admin, teamId: u.team_id || null,
      avatarUrl: u.avatar_url || null,
      color: USER_COLORS[i % USER_COLORS.length],
    })) : [];

    courses = cData ? cData.map(courseFromRow) : [];

    questions = {};
    if (qData) qData.forEach(r => { questions[r.course_id] = r.questions_json; });

    assignments = {};
    if (aData) aData.forEach(r => {
      if (!assignments[r.user_id]) assignments[r.user_id] = [];
      assignments[r.user_id].push(r.course_id);
    });

    progress = {};
    if (pData) pData.forEach(r => {
      progress[`${r.user_id}_${r.course_id}`] = {
        currentSlide: r.current_slide, completed: r.completed,
        score: r.score, passed: r.passed,
      };
    });
    await loadSiteSettings();
  } catch (err) {
    console.error('loadData exception:', err);
  }
  hideLoader();
}

async function loadSiteSettings() {
  try {
    const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl('config/site_settings.json');
    const res = await fetch(publicUrl + '?t=' + Date.now());
    if (res.ok) siteSettings = await res.json();
  } catch {}
}

async function saveSiteSettings() {
  const blob = new Blob([JSON.stringify(siteSettings)], { type: 'application/json' });
  const { error } = await sb.storage.from('course-files').upload('config/site_settings.json', blob, { upsert: true, contentType: 'application/json' });
  if (error) { toast('Failed to save setting: ' + error.message, 'error'); return false; }
  return true;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function handleAuthUser(authUser) {
  if (!authUser) { currentUser = null; return; }

  const email = authUser.email || '';
  if (!email.endsWith('@sprout.ph')) {
    await sb.auth.signOut();
    currentUser = null;
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-card" style="text-align:center">
          <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1.5rem;justify-content:center">
            <img src="assets/logos/sproutsol-logo-01.svg" style="height:36px" />
            <span class="brand-learn">Learn</span>
          </div>
          <div style="font-size:2rem;margin-bottom:.5rem">🚫</div>
          <div style="font-weight:700;margin-bottom:.5rem">Access Denied</div>
          <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:1.5rem">Only @sprout.ph accounts are allowed.</div>
          <button class="btn btn-primary" onclick="googleLogin()">Try a different account</button>
        </div>
      </div>`;
    return;
  }

  // Insert new user only if they don't exist yet (never overwrite existing record)
  const googleAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
  const { data: existingUser } = await sb.from('users').select('id, avatar_url').eq('id', authUser.id).maybeSingle();
  if (!existingUser) {
    const name = authUser.user_metadata?.full_name || email.split('@')[0];
    await sb.from('users').insert({
      id: authUser.id, email, name, is_admin: false, avatar_url: googleAvatar,
    });
    // Notify admins of new joiner (user_id null = admin broadcast)
    await sb.from('notifications').insert({
      user_id: null, type: 'user_joined',
      title: `👋 New learner joined: ${name}`, body: email, is_read: false,
    });
  } else if (!existingUser.avatar_url && googleAvatar) {
    // Backfill Google photo for existing users who don't have one yet
    await sb.from('users').update({ avatar_url: googleAvatar }).eq('id', authUser.id);
  }

  await loadData();
  currentUser = allUsers.find(u => u.id === authUser.id);
  if (!currentUser) { currentUser = null; navigate('/login'); return; }
  await loadNotifications();
  loadFlappyScores();
  sb.channel('flappy_scores_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flappy_scores' }, async () => {
      await loadFlappyScores();
      renderFlappyLeaderboard();
    })
    .subscribe();
  loadDuckScores();
  sb.channel('duck_scores_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'duck_hunt_scores' }, async () => {
      await loadDuckScores();
      renderDuckLeaderboard();
    })
    .subscribe();
  if (!currentUser.teamId) { renderCompleteProfile(); return; }
  navigate(currentUser.isAdmin ? '/admin/dashboard' : '/learner/dashboard');
}

async function googleLogin() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) toast('Login failed: ' + error.message, 'error');
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  adminViewingAsLearner = false;
  navigate('/login');
}

// ─── Realtime ─────────────────────────────────────────────────────────────────
function subscribeRealtime() {
  sb.channel('assignments-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assignments' }, ({ new: r }) => {
      if (!assignments[r.user_id]) assignments[r.user_id] = [];
      if (!assignments[r.user_id].includes(r.course_id)) assignments[r.user_id].push(r.course_id);
      const hash = window.location.hash.slice(1);
      if (currentUser?.id === r.user_id && hash === '/learner/dashboard') renderLearnerDashboard();
      if (currentUser?.id === r.user_id && hash === '/learner/library') renderLearnerLibrary();
      if (hash === '/admin/team') renderAdminTeam();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'assignments' }, ({ old: r }) => {
      if (assignments[r.user_id])
        assignments[r.user_id] = assignments[r.user_id].filter(cid => cid !== r.course_id);
      const hash = window.location.hash.slice(1);
      if (currentUser?.id === r.user_id && hash === '/learner/dashboard') renderLearnerDashboard();
      if (currentUser?.id === r.user_id && hash === '/learner/library') renderLearnerLibrary();
      if (hash === '/admin/team') renderAdminTeam();
    })
    .subscribe();

  // Realtime questions — learners always get the latest version
  sb.channel('questions-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, ({ new: r, eventType }) => {
      if (eventType === 'DELETE') {
        delete questions[r.course_id];
      } else if (r?.course_id) {
        questions[r.course_id] = r.questions_json;
      }
    })
    .subscribe();

  // Realtime progress — keeps leaderboard/reports live without refresh
  sb.channel('progress-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'progress' }, ({ new: r, eventType }) => {
      if (!r?.user_id) return;
      const key = `${r.user_id}_${r.course_id}`;
      if (eventType === 'DELETE') {
        delete progress[key];
      } else {
        progress[key] = {
          currentSlide: r.current_slide, completed: r.completed,
          score: r.score, passed: r.passed,
        };
      }
      const hash = window.location.hash.slice(1);
      if (hash === '/admin/leaderboard') renderLeaderboard(true);
      if (hash === '/admin/reports')     renderAdminReports();
      if (hash === '/admin/dashboard')   renderAdminDashboard();
      if (hash === '/admin/team')        renderAdminTeam();
    })
    .subscribe();

  // Realtime notifications
  sb.channel('notifications-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, ({ new: n }) => {
      const isForMe = n.user_id === null ? currentUser?.isAdmin : n.user_id === currentUser?.id;
      if (!isForMe) return;
      if (notifications.find(x => x.id === n.id)) return; // dedupe (we may have added it locally already)
      notifications.unshift(n);
      updateBellBadge();
      // Pulse the bell
      document.getElementById('bell-btn')?.classList.add('bell-pulse');
      setTimeout(() => document.getElementById('bell-btn')?.classList.remove('bell-pulse'), 600);
      if (document.getElementById('notif-panel')?.dataset.open === 'true') renderNotifPanel();
    })
    .subscribe();
}

// ─── Router ───────────────────────────────────────────────────────────────────
// ─── SCORM 1.2 postMessage Bridge ─────────────────────────────────────────────
window.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'scorm12' || !viewerCourseId || !currentUser) return;
  const { action, element: el, value: val } = e.data;
  if (action === 'set') {
    if (el === 'cmi.core.lesson_status' && (val === 'completed' || val === 'passed')) {
      setProgress(currentUser.id, viewerCourseId, { completed: true, currentSlide: 1 });
      toast('✅ Course completed!');
    }
    if (el === 'cmi.core.score.raw') {
      const score = Math.round(parseFloat(val));
      if (!isNaN(score)) setProgress(currentUser.id, viewerCourseId, { score });
    }
  }
});

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', async () => {
  showLoader('Loading Sprout Learn', '');
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await handleAuthUser(session.user);
  } else {
    await loadData();
  }
  hideLoader();
  subscribeRealtime();
  if (!window.location.hash || window.location.hash === '#/') {
    window.location.hash = currentUser ? (currentUser.isAdmin ? '#/admin/dashboard' : '#/learner/dashboard') : '#/login';
  }
  handleRoute();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !currentUser) {
      await handleAuthUser(session.user);
      handleRoute();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      navigate('/login');
    }
  });
});

function navigate(route) {
  if (window.location.hash === '#' + route) {
    handleRoute();
  } else {
    window.location.hash = route;
  }
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || '/login';
  currentRoute = hash;
  destroyFlappy();
  destroyDuck();

  if (!currentUser && hash !== '/login') {
    navigate('/login');
    return;
  }
  if (currentUser && hash === '/login') {
    navigate(currentUser.isAdmin && !adminViewingAsLearner ? '/admin/dashboard' : '/learner/dashboard');
    return;
  }
  // Force profile completion if no team set
  if (currentUser && !currentUser.teamId) {
    renderCompleteProfile();
    return;
  }
  // Block learner routes for non-admin/non-preview users trying to access admin routes
  if (currentUser && !currentUser.isAdmin && hash.startsWith('/admin')) {
    navigate('/learner/dashboard'); return;
  }

  if (hash === '/login')               { renderLogin(); return; }

  // Viewer and assessment are full-screen, skip layout
  if (hash.startsWith('/course/'))     { renderCourseViewer(hash.replace('/course/','')); return; }
  if (hash.startsWith('/assessment/')) { renderAssessmentPage(hash.replace('/assessment/','')); return; }

  renderLayout();

  if (hash === '/admin/dashboard')     renderAdminDashboard();
  else if (hash === '/admin/courses')  renderAdminCourses();
  else if (hash === '/admin/paths')    renderAdminPaths();
  else if (hash === '/admin/team')      renderAdminTeam();
  else if (hash === '/admin/reports')   renderAdminReports();
  else if (hash.startsWith('/admin/reports/user/'))   renderReportsUser(hash.replace('/admin/reports/user/',''));
  else if (hash.startsWith('/admin/reports/course/')) renderReportsCourse(hash.replace('/admin/reports/course/',''));
  else if (hash === '/admin/leaderboard') renderLeaderboard(true);
  else if (hash === '/admin/settings')  renderAdminSettings();
  else if (hash === '/learner/dashboard')  renderLearnerDashboard();
  else if (hash === '/learner/library')    renderLearnerLibrary();
  else if (hash === '/learner/paths')      renderLearnerPaths();
  else if (hash === '/learner/settings')   renderLearnerSettings();
  else if (hash === '/learner/leaderboard') renderLeaderboard(false);
  else navigate(currentUser.isAdmin ? '/admin/dashboard' : '/learner/dashboard');
}

// ─── Login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card" style="text-align:center">
        <div class="login-logo">
          <img src="assets/logos/sproutsol-logo-01.svg" alt="Sprout" />
          <span class="brand-learn" style="background:var(--primary);color:var(--accent)">Learn</span>
        </div>
        <div class="login-heading">Welcome to Sprout Learn</div>
        <div class="login-sub">Sign in with your Sprout work account to continue</div>
        <button class="btn-google" onclick="googleLogin()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
          Sign in with Google
        </button>
        <div style="margin-top:1rem;font-size:.78rem;color:var(--text-muted)">Only @sprout.ph accounts are allowed</div>
      </div>
    </div>`;
}

function renderCompleteProfile() {
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card" style="max-width:420px;text-align:left">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1.5rem">
          <img src="assets/logos/sproutsol-logo-01.svg" style="height:30px;display:block" />
          <span class="brand-learn" style="background:var(--primary);color:var(--accent)">Learn</span>
        </div>
        <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:.25rem">Complete your profile</h2>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.5rem">One more step before you get started</p>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" value="${esc(currentUser.name)}" disabled style="opacity:.55;cursor:not-allowed" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" value="${esc(currentUser.email)}" disabled style="opacity:.55;cursor:not-allowed" />
        </div>
        <div class="form-group">
          <label class="form-label">Team *</label>
          ${allTeams.length
            ? `<select id="profile-team" class="form-select">
                <option value="">— Select your team —</option>
                ${allTeams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
              </select>`
            : `<div style="font-size:.85rem;color:#e65100;padding:.6rem;background:#fff3e0;border-radius:8px">
                No teams have been set up yet. Contact your admin.
              </div>`}
        </div>
        ${allTeams.length ? `<button class="btn btn-primary" style="width:100%;margin-top:.25rem" onclick="saveProfile()">Save & Continue →</button>` : ''}
        <button class="btn btn-outline" style="width:100%;margin-top:.5rem" onclick="logout()">Sign out</button>
      </div>
    </div>`;
}

async function saveProfile() {
  const teamId = document.getElementById('profile-team')?.value;
  if (!teamId) { toast('Please select your team', 'error'); return; }
  const { error } = await sb.from('users').update({ team_id: teamId }).eq('id', currentUser.id);
  if (error) { toast('Save failed: ' + error.message, 'error'); return; }
  currentUser.teamId = teamId;
  navigate(currentUser.isAdmin ? '/admin/dashboard' : '/learner/dashboard');
}

function logout() {
  currentUser = null;
  navigate('/login');
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function toggleLearnerView() {
  adminViewingAsLearner = !adminViewingAsLearner;
  navigate(adminViewingAsLearner ? '/learner/dashboard' : '/admin/dashboard');
}

function renderLayout() {
  const isAdmin = currentUser?.isAdmin && !adminViewingAsLearner;
  const unread = notifications.filter(n => !n.is_read).length;
  const navLinks = isAdmin ? [
    { href: '/admin/dashboard',   label: 'Dashboard',       icon: iconHome() },
    { href: '/admin/courses',     label: 'Courses',         icon: iconCourses() },
    { href: '/admin/paths',       label: 'Learning Paths',  icon: iconBook() },
    { href: '/admin/team',        label: 'Team Progress',   icon: iconUsers() },
    { href: '/admin/reports',     label: 'Reports',         icon: iconReport() },
    { href: '/admin/leaderboard', label: 'Leaderboard',     icon: iconTrophy() },
    { href: '/admin/settings',    label: 'Settings',        icon: iconSettings() },
  ] : [
    { href: '/learner/dashboard',   label: 'Dashboard',      icon: iconHome() },
    { href: '/learner/library',     label: 'Course Library',  icon: iconCourses() },
    { href: '/learner/paths',       label: 'Learning Paths',  icon: iconBook() },
    { href: '/learner/leaderboard', label: 'Leaderboard',     icon: iconTrophy() },
    { href: '/learner/settings',    label: 'Settings',        icon: iconSettings() },
  ];

  const tabs = navLinks.map(l => `
    <a class="nav-tab ${currentRoute === l.href ? 'active' : ''}" href="#${l.href}">
      <span class="nav-icon">${l.icon}</span>${esc(l.label)}
    </a>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="app-layout">
      <header class="app-header">
        <div class="header-inner">
          <a class="header-brand" href="#${navLinks[0].href}">
            <img src="assets/logos/sproutsol-logo-white.svg" alt="Sprout" class="header-brand-logo" />
            <span class="brand-learn">Learn</span>
          </a>
          <nav class="header-nav">${tabs}</nav>
          <div class="header-user">
            ${currentUser.isAdmin ? `<button class="btn-view-toggle" onclick="toggleLearnerView()">${adminViewingAsLearner ? '⚙️ Admin View' : '👁 Learner View'}</button>` : ''}
            <div class="notif-wrap" id="notif-wrap">
              <button class="bell-btn" id="bell-btn" onclick="toggleNotifPanel()" aria-label="Notifications">
                ${iconBell()}
                <span class="bell-badge" id="bell-badge" style="display:${unread > 0 ? '' : 'none'}">${unread > 9 ? '9+' : unread}</span>
              </button>
              <div class="notif-panel" id="notif-panel" data-open="false" style="display:none"></div>
            </div>
            ${currentUser.avatarUrl ? `<div class="topbar-avatar" style="overflow:hidden"><img src="${currentUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" /></div>` : `<div class="topbar-avatar" style="background:${currentUser.color}">${initials(currentUser.name)}</div>`}
            <span class="topbar-name">${esc(currentUser.name.split(' ')[0])}</span>
            <button class="topbar-logout" onclick="logout()">Logout</button>
            <button class="hamburger" onclick="toggleMobileMenu()" aria-label="Menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
            </button>
          </div>
        </div>
        <nav class="mobile-nav" id="mobile-nav">${tabs}</nav>
      </header>
      <main class="main-content" id="main-content"></main>
    </div>
    <div class="side-panel-overlay" id="side-panel-overlay" onclick="closeSidePanel()" style="display:none"></div>
    <div class="side-panel" id="side-panel">
      <div class="side-panel-inner" id="side-panel-inner"></div>
    </div>`;
}

function toggleMobileMenu() {
  document.getElementById('mobile-nav')?.classList.toggle('open');
}

function openSidePanel(html) {
  const panel   = document.getElementById('side-panel');
  const overlay = document.getElementById('side-panel-overlay');
  const inner   = document.getElementById('side-panel-inner');
  if (!panel || !inner) return;
  inner.innerHTML = html;
  overlay.style.display = '';
  requestAnimationFrame(() => panel.classList.add('open'));
}

function closeSidePanel() {
  const panel   = document.getElementById('side-panel');
  const overlay = document.getElementById('side-panel-overlay');
  if (!panel) return;
  panel.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}

function openReportsUserPanel(userId) {
  const u = getUser(userId);
  if (!u) return;
  const teamName     = allTeams.find(t => t.id === u.teamId)?.name || '—';
  const assignedCids = getUserAssignments(userId);
  const completed    = assignedCids.filter(cid => getProgress(userId, cid).completed).length;
  const scores       = assignedCids.map(cid => getProgress(userId, cid)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score);
  const avgScore     = scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null;

  const rows = assignedCids.map(cid => {
    const c = getCourse(cid);
    const p = getProgress(userId, cid);
    if (!c) return '';
    const statusColor = p.completed ? '#2e7d32' : '#f57c00';
    const statusLabel = p.completed ? '✅ Completed' : p.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
    const pct = p.completed ? 100 : Math.min(80, c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
    return `<div class="sp-course-row">
      ${c.coverUrl ? `<img src="${c.coverUrl}" class="sp-course-thumb"/>` : `<div class="sp-course-thumb sp-course-thumb--placeholder">${CAT_EMOJI[c.category]||'📚'}</div>`}
      <div style="flex:1;min-width:0">
        <div class="sp-course-title">${esc(c.title)}</div>
        <div style="font-size:.76rem;color:var(--text-muted);margin-bottom:.3rem">${esc(c.category)}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <div style="flex:1;background:#e8f5e9;border-radius:99px;height:6px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${p.completed?'#2e7d32':'#4a9e4a'};border-radius:99px"></div>
          </div>
          <span style="font-size:.74rem;color:var(--text-muted);white-space:nowrap">${pct}%</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.78rem;font-weight:600;color:${statusColor}">${statusLabel}</div>
        ${p.score !== null && p.score !== undefined ? `<div style="font-size:.82rem;font-weight:800;color:var(--primary);margin-top:.2rem">${p.score}%</div>` : ''}
      </div>
    </div>`;
  }).join('');

  openSidePanel(`
    <div class="sp-header">
      <div style="display:flex;align-items:center;gap:.75rem;flex:1;min-width:0">
        ${avatarHTML(u, 44)}
        <div style="min-width:0">
          <div class="sp-title">${esc(u.name)}</div>
          <div class="sp-subtitle">${esc(teamName)}</div>
        </div>
      </div>
      <button class="sp-close" onclick="closeSidePanel()">✕</button>
    </div>
    <div class="sp-stats">
      <div class="sp-stat"><span>${assignedCids.length}</span>Assigned</div>
      <div class="sp-stat"><span>${completed}</span>Completed</div>
      <div class="sp-stat"><span>${avgScore !== null ? avgScore+'%' : '—'}</span>Avg Score</div>
      <div class="sp-stat"><span>${userXP(userId)}</span>XP</div>
    </div>
    <div class="sp-section-label">Assigned Courses</div>
    <div class="sp-list">
      ${rows || '<div style="color:var(--text-muted);font-size:.88rem;padding:1rem 0">No courses assigned yet.</div>'}
    </div>`);
}

function openReportsCoursePanel(courseId) {
  const c = getCourse(courseId);
  if (!c) return;
  const assignedUsers  = learners().filter(u => isAssigned(u.id, courseId));
  const completedUsers = assignedUsers.filter(u => getProgress(u.id, courseId).completed);
  const scores         = assignedUsers.map(u => getProgress(u.id, courseId)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score);
  const avgScore       = scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null;
  const passRate       = assignedUsers.length ? Math.round((completedUsers.length / assignedUsers.length) * 100) : 0;
  const barColor       = passRate >= 70 ? '#2e7d32' : passRate >= 40 ? '#f57c00' : '#c62828';

  const rows = assignedUsers.map(u => {
    const p        = getProgress(u.id, courseId);
    const teamName = allTeams.find(t => t.id === u.teamId)?.name || '—';
    const statusColor = p.completed ? '#2e7d32' : '#f57c00';
    const statusLabel = p.completed ? '✅ Completed' : p.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
    const pct = p.completed ? 100 : Math.min(80, c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
    return `<div class="sp-course-row">
      ${avatarHTML(u, 36)}
      <div style="flex:1;min-width:0">
        <div class="sp-course-title">${esc(u.name)}</div>
        <div style="font-size:.76rem;color:var(--text-muted);margin-bottom:.3rem">${esc(teamName)}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <div style="flex:1;background:#e8f5e9;border-radius:99px;height:6px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${p.completed?'#2e7d32':'#4a9e4a'};border-radius:99px"></div>
          </div>
          <span style="font-size:.74rem;color:var(--text-muted);white-space:nowrap">${pct}%</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.78rem;font-weight:600;color:${statusColor}">${statusLabel}</div>
        ${p.score !== null && p.score !== undefined ? `<div style="font-size:.82rem;font-weight:800;color:var(--primary);margin-top:.2rem">${p.score}%</div>` : ''}
      </div>
    </div>`;
  }).join('');

  openSidePanel(`
    <div class="sp-header">
      <div style="display:flex;align-items:center;gap:.75rem;flex:1;min-width:0">
        ${c.coverUrl ? `<img src="${c.coverUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0"/>` : `<div style="width:44px;height:44px;border-radius:8px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">${CAT_EMOJI[c.category]||'📚'}</div>`}
        <div style="min-width:0">
          <div class="sp-title">${esc(c.title)}</div>
          <div class="sp-subtitle">${esc(c.category)}</div>
        </div>
      </div>
      <button class="sp-close" onclick="closeSidePanel()">✕</button>
    </div>
    <div class="sp-stats">
      <div class="sp-stat"><span>${assignedUsers.length}</span>Assigned</div>
      <div class="sp-stat"><span>${completedUsers.length}</span>Completed</div>
      <div class="sp-stat"><span style="color:${barColor}">${passRate}%</span>Pass Rate</div>
      <div class="sp-stat"><span>${avgScore !== null ? avgScore+'%' : '—'}</span>Avg Score</div>
    </div>
    <div class="sp-section-label">Assigned People</div>
    <div class="sp-list">
      ${rows || '<div style="color:var(--text-muted);font-size:.88rem;padding:1rem 0">No one assigned yet.</div>'}
    </div>`);
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('notif-wrap');
  const panel = document.getElementById('notif-panel');
  if (panel && panel.dataset.open === 'true' && wrap && !wrap.contains(e.target)) {
    panel.dataset.open = 'false';
    panel.style.display = 'none';
  }
});

function setMain(html) {
  const el = document.getElementById('main-content');
  if (el) { el.innerHTML = html; el.classList.remove('fade-up'); void el.offsetWidth; el.classList.add('fade-up'); }
}
function setTitle(t) { document.title = `${t} — Sprout Learn`; }

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function renderAdminDashboard() {
  setTitle('Dashboard');
  const totalCompletions = learners().reduce((s, u) => s + userCompletions(u.id), 0);
  const avgProg = learners().length
    ? Math.round(learners().reduce((s, u) => s + userAvgProgress(u.id), 0) / learners().length)
    : 0;

  const topLearners = [...learners()]
    .sort((a,b) => userCompletions(b.id) - userCompletions(a.id) || userAvgProgress(b.id) - userAvgProgress(a.id))
    .slice(0,4);

  setMain(`
    <div class="page-header fade-up">
      <h1>Welcome back, ${esc(currentUser.name.split(' ')[0])} 👋</h1>
      <p>Here's your team's learning overview</p>
    </div>
    <div class="stats-grid">
      ${statCard('Team Members', learners().length, '', '#1B3A1B', 0)}
      ${statCard('Total Courses', courses.length, '', '#2d5a2d', 1)}
      ${statCard('Completions', totalCompletions, '', '#3a7a3a', 2)}
      ${statCard('Avg Progress', avgProg, '%', '#4a9e4a', 3)}
    </div>
    <p class="section-heading">Leaderboard Snapshot</p>
    <div class="leaderboard-list">
      ${topLearners.map((u, i) => lbItem(u, i)).join('')}
    </div>
    <div style="margin-top:1rem">
      <a href="#/admin/leaderboard" class="btn btn-outline btn-sm">View full leaderboard →</a>
    </div>`);

  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    animateCount(el, parseInt(el.dataset.target));
  });
}

function statCard(label, value, suffix, color, delay) {
  return `<div class="stat-card" style="animation-delay:${delay*0.07}s;border-top:3px solid ${color}">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value" data-target="${value}">0</div>
    ${suffix ? `<div class="stat-suffix">${esc(suffix)}</div>` : ''}
  </div>`;
}

function lbItem(u, i) {
  const medals = ['🥇','🥈','🥉'];
  const done = userCompletions(u.id);
  const avg  = userAvgProgress(u.id);
  return `<div class="lb-item ${i===0?'top1':''}" style="animation-delay:${i*0.07}s">
    <div class="lb-rank">${medals[i] || `#${i+1}`}</div>
    ${avatarHTML(u, 38)}
    <div class="lb-info"><div class="lb-name">${esc(u.name)}</div><div class="lb-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div></div>
    <div class="lb-stats"><strong>${done}</strong> completions &nbsp;·&nbsp; ${avg}% avg</div>
  </div>`;
}

// ─── Admin Courses ────────────────────────────────────────────────────────────
function renderAdminCourses(filterQ = '', filterCat = '') {
  setTitle('Courses');
  let filtered = courses.filter(c => {
    const matchQ   = !filterQ   || c.title.toLowerCase().includes(filterQ.toLowerCase()) || c.category.toLowerCase().includes(filterQ.toLowerCase());
    const matchCat = !filterCat || c.category === filterCat;
    return matchQ && matchCat;
  });

  const gridHTML = filtered.length ? filtered.map(c => adminCourseCard(c)).join('') : '<div class="empty-state"><span class="empty-icon">📭</span><h2>No courses found</h2><p>Try different filters.</p></div>';

  // Already on this page — only swap the grid to avoid re-animating everything
  const existingGrid = document.querySelector('#main-content .course-grid');
  if (existingGrid) {
    existingGrid.innerHTML = gridHTML;
    const inp = document.getElementById('course-search');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    return;
  }

  setMain(`
    <div class="page-header"><h1>Courses</h1><p>Manage all training content</p></div>
    <div class="toolbar">
      <div class="toolbar-search">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input id="course-search" placeholder="Search courses…" value="${esc(filterQ)}" oninput="renderAdminCourses(this.value, document.getElementById('course-cat-filter')?.value)" />
      </div>
      <select class="toolbar-select" id="course-cat-filter" onchange="renderAdminCourses(document.getElementById('course-search')?.value, this.value)">
        <option value="">All Categories</option>
        ${CATEGORIES.map(c => `<option value="${esc(c)}" ${filterCat===c?'selected':''}>${esc(c)}</option>`).join('')}
      </select>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-primary btn-sm" onclick="showAddCoursePickerModal()">+ Add Course</button>
    </div>
    <div class="course-grid">${gridHTML}</div>`);
}

function courseCoverHTML(c) {
  if (c.coverUrl) {
    return `<div class="course-card-cover"><img src="${c.coverUrl}" alt="" /></div>`;
  }
  return `<div class="course-card-cover course-card-cover--placeholder">
    <img src="assets/logos/logo-icon-green.svg" alt="Sprout Learn" class="cover-placeholder-logo" />
    <span class="cover-placeholder-title">${esc(c.title)}</span>
  </div>`;
}

function adminCoverHTML(c) {
  const inner = c.coverUrl
    ? `<img src="${c.coverUrl}" alt="" />`
    : `<img src="assets/logos/logo-icon-green.svg" alt="Sprout Learn" class="cover-placeholder-logo" /><span class="cover-placeholder-title">${esc(c.title)}</span>`;
  return `<div class="course-card-cover course-card-cover--editable" onclick="triggerCoverUpload('${c.id}')" title="Change cover image">
    ${inner}
    <div class="cover-edit-overlay">📷 Change Cover</div>
    <input type="file" accept="image/*" id="cover-input-${c.id}" style="display:none" onchange="handleCoverChange('${c.id}',this)" />
  </div>`;
}

function adminCourseCard(c) {
  const qs = questions[c.id];
  return `<div class="course-card" style="animation-delay:${courses.indexOf(c)*0.04}s">
    ${adminCoverHTML(c)}
    <div class="course-card-body">
      <div class="course-card-badges">
        ${typeBadge(c.type)} ${contentBadge(c.contentType)}
        ${qs ? `<span class="badge badge-q">${qs.length} Q</span>` : ''}
      </div>
      <div class="course-card-title">${esc(c.title)}</div>
      <div class="course-card-desc">${esc(c.description)}</div>
      <div class="course-card-meta">${CAT_EMOJI[c.category]||'📚'} ${esc(c.category)} ${c.totalPages ? `· ${c.totalPages} slides` : ''}</div>
      <div class="course-card-actions">
        <a href="#/course/${c.id}" class="btn btn-accent btn-sm">▶ Preview</a>
        <button class="btn btn-outline btn-sm" onclick="showAssignModal('${c.id}')">👥 Assign</button>
        <button class="btn btn-outline btn-sm" onclick="${qs ? `showManualBuilderModal('${c.id}')` : `showAddQuestionsModal('${c.id}')`}">${qs ? '✏️ Edit Questions' : '+ Questions'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCourse('${c.id}')">🗑</button>
      </div>
    </div>
  </div>`;
}

async function deleteCourse(id) {
  if (!confirm('Delete this course?')) return;
  courses = courses.filter(c => c.id !== id);
  delete questions[id];
  Object.keys(assignments).forEach(uid => {
    assignments[uid] = assignments[uid].filter(cid => cid !== id);
  });
  Object.keys(progress).forEach(k => { if (k.includes(`_${id}`)) delete progress[k]; });
  await sb.from('courses').delete().eq('id', id);
  toast('Course deleted');
  renderAdminCourses();
}

function triggerCoverUpload(courseId) {
  document.getElementById(`cover-input-${courseId}`)?.click();
}

async function handleCoverChange(courseId, input) {
  const file = input.files[0];
  if (!file) return;
  showLoader('Updating cover', 'Uploading image…');
  try {
    // Resize to max 640px wide using canvas
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    const maxW = 640;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));

    const { error: upErr } = await sb.storage.from('course-files')
      .upload(`covers/${courseId}.jpg`, blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl(`covers/${courseId}.jpg`);
    // Add cache-bust so the new image loads immediately
    const coverUrl = publicUrl + '?t=' + Date.now();

    const course = getCourse(courseId);
    if (course) course.coverUrl = coverUrl;
    const { error: dbErr } = await sb.from('courses').update({ cover_url: coverUrl }).eq('id', courseId);
    if (dbErr) throw dbErr;

    hideLoader();
    toast('Cover updated!');
    renderAdminCourses();
  } catch(err) {
    hideLoader();
    toast(`Cover upload failed: ${err.message}`, 'error');
  }
  input.value = '';
}

// ─── Create Course Modal ──────────────────────────────────────────────────────
// ─── Add Course Picker ────────────────────────────────────────────────────────
function showAddCoursePickerModal() {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Add Course</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem">Choose a content type to get started</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.65rem">
          <button class="course-type-pick" onclick="closeModal();showUploadModal()">
            <span class="course-type-icon">📄</span>
            <div class="course-type-label">PDF Upload</div>
            <div class="course-type-desc">Upload a PDF as slides</div>
          </button>
          <button class="course-type-pick" onclick="closeModal();showAddUrlCourseModal('youtube')">
            <span class="course-type-icon">🎬</span>
            <div class="course-type-label">YouTube Video</div>
            <div class="course-type-desc">Embed a YouTube video</div>
          </button>
          <button class="course-type-pick" onclick="closeModal();showAddUrlCourseModal('slides')">
            <span class="course-type-icon">📊</span>
            <div class="course-type-label">Google Slides</div>
            <div class="course-type-desc">Embed a Slides presentation</div>
          </button>
          <button class="course-type-pick" onclick="closeModal();showAddScormModal()">
            <span class="course-type-icon">📦</span>
            <div class="course-type-label">SCORM Package</div>
            <div class="course-type-desc">Upload a SCORM .zip file</div>
          </button>
          <button class="course-type-pick" onclick="closeModal();showAddHtmlSlidesModal()">
            <span class="course-type-icon">🖥️</span>
            <div class="course-type-label">HTML Slides</div>
            <div class="course-type-desc">Paste HTML from Claude</div>
          </button>
          <button class="course-type-pick" style="grid-column:1/-1" onclick="closeModal();showCreateCourseModal()">
            <span class="course-type-icon">📝</span>
            <div class="course-type-label">No Content Yet</div>
            <div class="course-type-desc">Create a placeholder — add content later</div>
          </button>
        </div>
      </div>
    </div>`);
}

function showCreateCourseModal() {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>New Course</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Title *</label>
          <input id="nc-title" class="form-input" placeholder="Course title" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="nc-desc" class="form-textarea" placeholder="Brief description…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="nc-cat" class="form-select">
              ${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select id="nc-type" class="form-select">
              <option>Free</option><option>Paid</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">YouTube Video ID (optional)</label>
          <input id="nc-yt" class="form-input" placeholder="e.g. VjinpYMUMoc" />
          <div class="form-hint">Paste just the video ID from the YouTube URL</div>
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="createCourse()">Create Course</button>
      </div>
    </div>`);
}

function createCourse() {
  const title = document.getElementById('nc-title')?.value.trim();
  if (!title) { toast('Please enter a title', 'error'); return; }
  const ytId = document.getElementById('nc-yt')?.value.trim();
  const newCourse = {
    id: nextCourseId(),
    title,
    description: document.getElementById('nc-desc')?.value.trim() || '',
    category: document.getElementById('nc-cat')?.value || CATEGORIES[0],
    type: document.getElementById('nc-type')?.value || 'Free',
    contentType: ytId ? 'youtube' : 'none',
    youtubeId: ytId || null,
    totalPages: 0,
  };
  courses.unshift(newCourse);
  sb.from('courses').upsert(courseToRow(newCourse))
    .then(({ error }) => {
      if (error) {
        console.error('Course save:', error);
        toast(`Save failed: ${error.message}`, 'error');
        courses.shift();
        renderAdminCourses();
      }
    });
  closeModal();
  toast('Course created!');
  createNotif(null, 'new_course', `🌱 New course added: ${title}`, document.getElementById('nc-cat')?.value || '');
  renderAdminCourses();
}

// ─── Add YouTube / Google Slides Course Modal ─────────────────────────────────
function showAddUrlCourseModal(hint = '') {
  const placeholder = hint === 'youtube' ? 'Paste a YouTube video URL'
    : hint === 'slides' ? 'Paste a Google Slides share/edit link'
    : 'Paste a YouTube or Google Slides URL';
  const title = hint === 'youtube' ? 'Add YouTube Video'
    : hint === 'slides' ? 'Add Google Slides'
    : 'Add YouTube / Google Slides';
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>${title}</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Content URL *</label>
          <input id="url-input" class="form-input" placeholder="${placeholder}" oninput="onUrlInput(this.value)" />
          <div id="url-detect" style="font-size:.78rem;margin-top:.4rem;color:var(--text-muted)">${placeholder}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Course Title *</label>
          <input id="url-title" class="form-input" placeholder="Enter course title" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="url-cat" class="form-select">
              ${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select id="url-type" class="form-select"><option>Free</option><option>Paid</option></select>
          </div>
        </div>
        <p class="form-label" style="margin-bottom:.5rem">Assessment Questions</p>
        <label class="upload-option selected" id="url-opt-ai">
          <input type="radio" name="url-mode" value="ai" checked onchange="selectUrlMode('ai')" />
          <div style="flex:1">
            <div class="upload-option-title">🤖 AI Generate</div>
            <div class="upload-option-desc">AI reads the content and auto-generates 8 questions</div>
          </div>
        </label>
        <label class="upload-option" id="url-opt-manual">
          <input type="radio" name="url-mode" value="manual" onchange="selectUrlMode('manual')" />
          <div><div class="upload-option-title">✍️ Add Manually</div><div class="upload-option-desc">Build questions yourself after adding the course</div></div>
        </label>
        <label class="upload-option" id="url-opt-skip">
          <input type="radio" name="url-mode" value="skip" onchange="selectUrlMode('skip')" />
          <div><div class="upload-option-title">⏭ Skip for now</div><div class="upload-option-desc">Add questions later</div></div>
        </label>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitUrlCourse()">Add Course</button>
      </div>
    </div>`);
}

function selectUrlMode(mode) {
  ['ai','manual','skip'].forEach(m => {
    const el = document.getElementById(`url-opt-${m}`);
    if (el) el.classList.toggle('selected', m === mode);
  });
}

function onUrlInput(val) {
  const detected = parseContentUrl(val.trim());
  const el = document.getElementById('url-detect');
  if (!el) return;
  if (!val.trim()) {
    el.textContent = 'Paste a YouTube video URL or a Google Slides share/edit link';
    el.style.color = 'var(--text-muted)';
    return;
  }
  if (detected?.type === 'youtube') {
    el.innerHTML = '✅ <strong>YouTube video detected</strong> · ID: ' + esc(detected.id);
    el.style.color = '#2e7d32';
  } else if (detected?.type === 'slides') {
    el.innerHTML = '✅ <strong>Google Slides detected</strong> · ID: ' + esc(detected.id);
    el.style.color = '#2e7d32';
  } else {
    el.textContent = '⚠️ URL not recognized. Use a YouTube or Google Slides URL.';
    el.style.color = '#e65100';
  }
}

function parseContentUrl(url) {
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', id: ytMatch[1] };
  const slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slidesMatch) return { type: 'slides', id: slidesMatch[1] };
  return null;
}

async function submitUrlCourse() {
  const urlVal = document.getElementById('url-input')?.value.trim() || '';
  const detected = parseContentUrl(urlVal);
  if (!detected) { toast('Please enter a valid YouTube or Google Slides URL', 'error'); return; }
  const title = document.getElementById('url-title')?.value.trim();
  if (!title) { toast('Please enter a course title', 'error'); return; }
  const cat  = document.getElementById('url-cat')?.value || CATEGORIES[0];
  const type = document.getElementById('url-type')?.value || 'Free';
  const mode = document.querySelector('input[name="url-mode"]:checked')?.value || 'ai';
  const courseId = nextCourseId();

  closeModal();
  showLoader('Adding course', 'Saving to database');

  const newCourse = {
    id: courseId, title, description: '', category: cat, type,
    contentType: detected.type,
    youtubeId: detected.type === 'youtube' ? detected.id : null,
    slidesUrl: detected.type === 'slides' ? urlVal : null,
    totalPages: 0,
  };
  courses.unshift(newCourse);
  const { error: saveErr } = await sb.from('courses').upsert(courseToRow(newCourse));
  if (saveErr) {
    hideLoader();
    toast(`Course save failed: ${saveErr.message}`, 'error');
    courses.shift();
    return;
  }

  createNotif(null, 'new_course', `🌱 New course added: ${title}`, cat);
  if (mode === 'ai') {
    showLoader('Generating questions', detected.type === 'youtube' ? 'Fetching video transcript…' : 'Reading slide content…');
    try {
      const body = detected.type === 'youtube'
        ? { type: 'youtube', videoId: detected.id }
        : { type: 'slides', presentationId: detected.id };
      const contentRes = await fetch('/api/fetch-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const contentData = await contentRes.json();
      if (!contentData.text || contentData.text.length < 50) {
        hideLoader();
        renderAdminCourses();
        showPasteContentModal(courseId, title, detected.type, contentData.error);
        return;
      }
      const qs = await generateQuestionsAI(contentData.text, title);
      questions[courseId] = qs;
      await sb.from('questions').upsert({ course_id: courseId, questions_json: qs });
      hideLoader();
      toast(`✅ Course added! ${qs.length} questions generated for "${title}"`);
    } catch(err) {
      hideLoader();
      console.error('AI URL generation error:', err);
      renderAdminCourses();
      showPasteContentModal(courseId, title, detected.type, err.message);
      return;
    }
    renderAdminCourses();
  } else if (mode === 'manual') {
    hideLoader();
    toast('Course added! Opening question builder…');
    renderAdminCourses();
    requestAnimationFrame(() => requestAnimationFrame(() => showManualBuilderModal(courseId)));
  } else {
    hideLoader();
    toast('Course added!');
    renderAdminCourses();
  }
}

// ─── Add SCORM Modal ──────────────────────────────────────────────────────────
function showAddScormModal() {
  scormZipData = null;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Upload SCORM Package</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div class="upload-file-box" onclick="document.getElementById('scorm-zip-input').click()" style="margin-bottom:1rem">
          <input type="file" id="scorm-zip-input" accept=".zip" style="display:none" onchange="handleScormZip(this.files[0])" />
          <div style="font-size:2rem">📦</div>
          <p style="margin:.25rem 0 0;font-size:.85rem">Click to select SCORM .zip file</p>
        </div>
        <div id="scorm-file-info" style="display:none;background:#f1f8f1;border-radius:8px;padding:.6rem .85rem;margin-bottom:.75rem;font-size:.82rem">
          <div id="scorm-file-name" style="font-weight:700;color:var(--primary)"></div>
          <div id="scorm-file-stats" style="color:var(--text-muted);margin-top:.15rem"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Course Title *</label>
          <input id="scorm-title" class="form-input" placeholder="Auto-filled from package" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="scorm-desc" class="form-textarea" placeholder="Brief description…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="scorm-cat" class="form-select">
              ${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select id="scorm-type" class="form-select"><option>Free</option><option>Paid</option></select>
          </div>
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="scorm-submit-btn" onclick="submitScormUpload()" disabled>Upload</button>
      </div>
    </div>`);
}

async function handleScormZip(file) {
  if (!file) return;
  try {
    const zip = await JSZip.loadAsync(file);

    // Parse imsmanifest.xml
    const manifestFile = zip.file('imsmanifest.xml') ||
      Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('imsmanifest.xml'));

    let launchFile = 'index.html';
    let titleFromManifest = '';

    if (manifestFile) {
      const xml = new DOMParser().parseFromString(await manifestFile.async('string'), 'text/xml');
      titleFromManifest = xml.querySelector('title')?.textContent?.trim() || '';
      const sco = xml.querySelector('resource[type*="sco"], resource[type*="SCO"], resource[href]');
      if (sco) launchFile = (sco.getAttribute('href') || 'index.html').split('?')[0].split('#')[0];
    }

    const fileCount = Object.values(zip.files).filter(f => !f.dir).length;
    scormZipData = { zip, launchFile, fileCount };

    document.getElementById('scorm-file-info').style.display = '';
    document.getElementById('scorm-file-name').textContent = file.name;
    document.getElementById('scorm-file-stats').textContent = `${fileCount} files · Launch: ${launchFile}`;
    if (titleFromManifest) document.getElementById('scorm-title').value = titleFromManifest;
    document.getElementById('scorm-submit-btn').disabled = false;
  } catch (err) {
    toast('Could not read zip: ' + err.message, 'error');
  }
}

async function submitScormUpload() {
  if (!scormZipData) { toast('Please select a SCORM zip file', 'error'); return; }
  const title = document.getElementById('scorm-title')?.value.trim();
  if (!title) { toast('Please enter a course title', 'error'); return; }
  const cat  = document.getElementById('scorm-cat')?.value || CATEGORIES[0];
  const type = document.getElementById('scorm-type')?.value || 'Free';
  const desc = document.getElementById('scorm-desc')?.value.trim() || '';

  closeModal();

  const courseId = nextCourseId();
  const basePath = `scorm/${courseId}`;

  // Inline SCORM 1.2 shim — intercepts API calls and relays via postMessage
  const shimScript = `<script>(function(){var d={};window.API={LMSInitialize:function(){window.parent.postMessage({type:'scorm12',action:'init'},'*');return'true'},LMSFinish:function(){window.parent.postMessage({type:'scorm12',action:'finish',data:d},'*');return'true'},LMSGetValue:function(e){return d[e]||''},LMSSetValue:function(e,v){d[e]=v;window.parent.postMessage({type:'scorm12',action:'set',element:e,value:v},'*');return'true'},LMSCommit:function(){window.parent.postMessage({type:'scorm12',action:'commit',data:d},'*');return'true'},LMSGetLastError:function(){return'0'},LMSGetErrorString:function(){return''},LMSGetDiagnostic:function(){return''}};})();<\/script>`;

  showLoader('Uploading SCORM', `Uploading ${scormZipData.fileCount} files…`);

  try {
    const { zip, launchFile } = scormZipData;
    const files = Object.values(zip.files).filter(f => !f.dir);

    // Upload in batches of 5
    for (let i = 0; i < files.length; i += 5) {
      await Promise.all(files.slice(i, i + 5).map(async zipFile => {
        const isLaunch = zipFile.name === launchFile || zipFile.name.endsWith('/' + launchFile);
        let content;
        if (isLaunch) {
          let html = await zipFile.async('string');
          html = html.includes('<head>') ? html.replace('<head>', '<head>' + shimScript)
               : html.includes('<html>') ? html.replace('<html>', '<html><head>' + shimScript + '</head>')
               : shimScript + html;
          content = new Blob([html], { type: 'text/html' });
        } else {
          content = await zipFile.async('blob');
        }
        const { error } = await sb.storage.from('course-files')
          .upload(`${basePath}/${zipFile.name}`, content, { upsert: true, contentType: scormContentType(zipFile.name) });
        if (error) console.warn('SCORM file upload error:', zipFile.name, error.message);
      }));
    }

    const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl(`${basePath}/${launchFile}`);

    const newCourse = {
      id: courseId, title, description: desc, category: cat, type,
      contentType: 'scorm', scormUrl: publicUrl, totalPages: 0,
      pdfDataUrl: null, youtubeId: null, slidesUrl: null, coverUrl: null,
    };
    courses.unshift(newCourse);
    const { error: dbError } = await sb.from('courses').upsert(courseToRow(newCourse));
    hideLoader();
    if (dbError) {
      toast(`Save failed: ${dbError.message}`, 'error');
      courses.shift();
    } else {
      scormZipData = null;
      toast('✅ SCORM course uploaded!');
      createNotif(null, 'new_course', `🌱 New course added: ${title}`, cat);
      renderAdminCourses();
    }
  } catch (err) {
    hideLoader();
    toast(`Upload failed: ${err.message}`, 'error');
    console.error('SCORM upload error:', err);
  }
}

function scormContentType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return ({ html:'text/html', htm:'text/html', js:'application/javascript', css:'text/css',
    xml:'application/xml', json:'application/json', png:'image/png', jpg:'image/jpeg',
    jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml', webp:'image/webp',
    mp4:'video/mp4', mp3:'audio/mpeg', wav:'audio/wav',
    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf' })[ext] || 'application/octet-stream';
}

// ─── HTML Slides Modal ────────────────────────────────────────────────────────
function showAddHtmlSlidesModal() {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()" style="max-width:640px;width:95vw">
      <div class="gmodal-header">
        <h2>HTML Slides Course</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body" style="max-height:80vh;overflow-y:auto">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Course Title *</label>
            <input class="form-input" id="hs-title" placeholder="e.g. TeamTailor Basics" />
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-input" id="hs-cat">
              ${CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-input" id="hs-type">
              <option value="Free">Free</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <input class="form-input" id="hs-desc" placeholder="Short description" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">HTML Content *</label>
          <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem">Paste the full HTML generated by Claude. It will be saved and served as a self-contained slide deck.</p>
          <textarea class="form-input" id="hs-html" rows="10" placeholder="<!DOCTYPE html>..." style="font-family:monospace;font-size:.8rem;resize:vertical"></textarea>
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitHtmlSlides()">Upload & Create</button>
      </div>
    </div>
  `);
}

async function submitHtmlSlides() {
  const title = document.getElementById('hs-title')?.value.trim();
  const html  = document.getElementById('hs-html')?.value.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  if (!html || html.length < 20) { toast('HTML content is required', 'error'); return; }

  const cat  = document.getElementById('hs-cat')?.value  || CATEGORIES[0];
  const type = document.getElementById('hs-type')?.value || 'Free';
  const desc = document.getElementById('hs-desc')?.value.trim() || '';

  closeModal();
  showLoader('Uploading', 'Saving HTML slides…');

  const courseId = nextCourseId();
  const path = `html/${courseId}/index.html`;
  const blob = new Blob([html], { type: 'text/html' });

  const { error: upErr } = await sb.storage.from('course-files').upload(path, blob, { upsert: true, contentType: 'text/html' });
  if (upErr) { hideLoader(); toast('Upload failed: ' + upErr.message, 'error'); return; }

  const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl(path);

  const newCourse = {
    id: courseId, title, description: desc, category: cat, type,
    contentType: 'html', htmlUrl: publicUrl, totalPages: 0,
    pdfDataUrl: null, youtubeId: null, slidesUrl: null, scormUrl: null, coverUrl: null,
  };
  const { error: dbErr } = await sb.from('courses').upsert(courseToRow(newCourse));
  hideLoader();
  if (dbErr) { toast('Save failed: ' + dbErr.message, 'error'); return; }
  courses.unshift(newCourse);
  toast('HTML slides course created!');
  renderAdminCourses();
}

// ─── Upload PDF Modal ─────────────────────────────────────────────────────────
function showUploadModal() {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Upload PDF Course</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div class="upload-file-box" onclick="document.getElementById('pdf-file-input').click()">
          <div style="font-size:2rem">📄</div>
          <p>Click to select a PDF file</p>
          <p style="font-size:.75rem;margin-top:.25rem">One PDF per upload</p>
          <input id="pdf-file-input" type="file" accept=".pdf" style="display:none" onchange="handlePdfSelected(this)" />
        </div>
        <div id="upload-file-info" style="display:none;margin-bottom:1rem">
          <div style="font-weight:600;font-size:.9rem" id="upload-file-name"></div>
          <div style="font-size:.78rem;color:var(--text-muted)" id="upload-file-pages"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Course Title</label>
          <input id="upload-title" class="form-input" placeholder="Auto-filled from filename" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="upload-cat" class="form-select">
              ${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select id="upload-type" class="form-select"><option>Free</option><option>Paid</option></select>
          </div>
        </div>
        <p class="form-label" style="margin-bottom:.5rem">Assessment Questions</p>
        <label class="upload-option selected" id="opt-ai">
          <input type="radio" name="upload-mode" value="ai" checked onchange="selectUploadMode('ai')" />
          <div style="flex:1">
            <div class="upload-option-title">🤖 AI Generate</div>
            <div class="upload-option-desc">Gemini reads the PDF and auto-generates 12 questions</div>
          </div>
        </label>
        <label class="upload-option" id="opt-manual">
          <input type="radio" name="upload-mode" value="manual" onchange="selectUploadMode('manual')" />
          <div><div class="upload-option-title">✍️ Add Manually</div><div class="upload-option-desc">Build questions yourself after upload</div></div>
        </label>
        <label class="upload-option" id="opt-skip">
          <input type="radio" name="upload-mode" value="skip" onchange="selectUploadMode('skip')" />
          <div><div class="upload-option-title">⏭ Skip for now</div><div class="upload-option-desc">Upload slides only, add questions later</div></div>
        </label>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="upload-submit-btn" onclick="submitUpload()" disabled>Upload</button>
      </div>
    </div>`);
}

function selectUploadMode(mode) {
  ['ai','manual','skip'].forEach(m => {
    const el = document.getElementById(`opt-${m}`);
    if (el) el.classList.toggle('selected', m === mode);
  });
}

let uploadedPdfData = null; // { dataUrl, arrayBuffer, numPages, extractedText }

async function handlePdfSelected(input) {
  const file = input.files[0];
  if (!file) return;
  const btn = document.getElementById('upload-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  showLoader('Reading PDF', 'Extracting content');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const dataUrl = await readAsDataUrl(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const numPages = pdf.numPages;

    // Extract text
    let text = '';
    for (let i = 1; i <= Math.min(numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }

    // Render first page as cover thumbnail
    let coverUrl = null;
    try {
      const coverPage = await pdf.getPage(1);
      const vp = coverPage.getViewport({ scale: 1 });
      const scale = 320 / vp.width;
      const viewport = coverPage.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await coverPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      coverUrl = canvas.toDataURL('image/jpeg', 0.8);
    } catch(e) { /* cover optional */ }

    uploadedPdfData = { file, dataUrl, numPages, extractedText: text, coverUrl };
    hideLoader();

    const titleEl = document.getElementById('upload-title');
    if (titleEl && !titleEl.value) {
      titleEl.value = file.name.replace(/\.pdf$/i,'').replace(/[-_]/g,' ');
    }
    const infoEl = document.getElementById('upload-file-info');
    if (infoEl) { infoEl.style.display = 'block'; }
    const nameEl = document.getElementById('upload-file-name');
    if (nameEl) nameEl.textContent = file.name;
    const pagesEl = document.getElementById('upload-file-pages');
    if (pagesEl) pagesEl.textContent = `${numPages} page${numPages !== 1 ? 's' : ''} detected`;

    btn.disabled = false;
    btn.textContent = 'Upload';
  } catch (err) {
    hideLoader();
    toast('Could not read PDF', 'error');
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function submitUpload() {
  if (!uploadedPdfData) { toast('Please select a PDF first', 'error'); return; }
  const title = document.getElementById('upload-title')?.value.trim() || 'Untitled Course';
  const cat   = document.getElementById('upload-cat')?.value || CATEGORIES[0];
  const type  = document.getElementById('upload-type')?.value || 'Free';
  const mode  = document.querySelector('input[name="upload-mode"]:checked')?.value || 'ai';
  const courseId = nextCourseId();

  closeModal();
  showLoader('Uploading PDF', 'Saving to cloud storage');

  // Upload PDF file to Supabase Storage
  let pdfUrl = uploadedPdfData.dataUrl; // fallback to data URL if storage fails
  let coverStorageUrl = uploadedPdfData.coverUrl || null;

  try {
    const { error: pdfErr } = await sb.storage.from('course-files')
      .upload(`pdfs/${courseId}.pdf`, uploadedPdfData.file, { upsert: true, contentType: 'application/pdf' });
    if (!pdfErr) {
      const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl(`pdfs/${courseId}.pdf`);
      pdfUrl = publicUrl;
    } else {
      console.error('PDF storage upload:', pdfErr);
    }

    if (uploadedPdfData.coverUrl) {
      const coverBlob = await fetch(uploadedPdfData.coverUrl).then(r => r.blob());
      const { error: covErr } = await sb.storage.from('course-files')
        .upload(`covers/${courseId}.jpg`, coverBlob, { upsert: true, contentType: 'image/jpeg' });
      if (!covErr) {
        const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl(`covers/${courseId}.jpg`);
        coverStorageUrl = publicUrl;
      }
    }
  } catch (e) {
    console.error('Storage upload error:', e);
  }

  const newCourse = {
    id: courseId, title, description: '', category: cat, type,
    contentType: 'pdf', totalPages: uploadedPdfData.numPages,
    pdfDataUrl: pdfUrl, coverUrl: coverStorageUrl,
  };

  // Save course to DB
  const { error: dbErr } = await sb.from('courses').upsert(courseToRow(newCourse));
  if (dbErr) console.error('Course DB save:', dbErr);
  courses.unshift(newCourse);

  if (mode === 'ai') {
    showLoader('Generating questions', 'AI is reading your PDF');
    try {
      const qs = await generateQuestionsAI(uploadedPdfData.extractedText, title);
      questions[courseId] = qs;
      await sb.from('questions').upsert({ course_id: courseId, questions_json: qs });
      hideLoader();
      toast(`✅ Upload complete! ${qs.length} questions generated for "${title}"`);
    } catch(err) {
      console.error('AI generation error:', err);
      hideLoader();
      toast(`AI failed: ${err.message || 'unknown error'} — course uploaded without questions.`, 'info');
    }
    renderAdminCourses();
  } else if (mode === 'manual') {
    hideLoader();
    toast('Course uploaded! Opening question builder…');
    renderAdminCourses();
    requestAnimationFrame(() => requestAnimationFrame(() => showManualBuilderModal(courseId)));
  } else {
    hideLoader();
    toast('Course uploaded!');
    renderAdminCourses();
  }
  uploadedPdfData = null;
}

// ─── Gemini API Test ─────────────────────────────────────────────────────────

// ─── AI Question Generation ───────────────────────────────────────────────────
async function generateQuestionsAI(text, courseTitle) {
  const res = await fetch('/api/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, courseTitle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const data = await res.json();
  console.log('Gemini raw response:', JSON.stringify(data).slice(0, 500));
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('Gemini text reply:', raw.slice(0, 400));
  // Strip markdown code fences, backtick blocks
  const cleaned = raw
    .replace(/```json/gi, '').replace(/```/g, '')
    .replace(/^[^[{]*/,'').trim();
  const match = cleaned.match(/\[[\s\S]*/);
  if (!match) throw new Error(`No JSON array in response. Got: "${raw.slice(0,120)}"`);
  return repairJsonArray(match[0]);
}

function repairJsonArray(str) {
  try { return JSON.parse(str); } catch {}
  // Find the last complete object in the array and close it
  let depth = 0, inString = false, escape = false, lastClose = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escape)          { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"')       { inString = !inString; continue; }
    if (inString)        continue;
    if (c === '{')       depth++;
    if (c === '}')       { depth--; if (depth === 0) lastClose = i; }
  }
  if (lastClose > -1) {
    try { return JSON.parse(str.slice(0, lastClose + 1) + ']'); } catch {}
  }
  throw new Error('Could not parse or repair Gemini JSON response');
}

const FALLBACK_QUESTIONS = [
  { type: 'mc', question: 'What is the primary focus of this course?', options: ['Skill development', 'Compliance', 'Technical training', 'Leadership'], correct: 0 },
  { type: 'tf', question: 'The knowledge from this course is applicable to the workplace.', correct: true },
  { type: 'mc', question: 'Which best describes a key takeaway from this course?', options: ['Improved productivity', 'Cost reduction', 'Better communication', 'All of the above'], correct: 3 },
  { type: 'tf', question: 'Continuous learning contributes to career growth.', correct: true },
];

// ─── Manual Question Builder ──────────────────────────────────────────────────
let builderQuestions = [];

function showManualBuilderModal(courseId) {
  builderQuestions = questions[courseId] ? JSON.parse(JSON.stringify(questions[courseId])) : [];
  renderBuilderModal(courseId);
}

function renderBuilderModal(courseId) {
  const course = getCourse(courseId);
  showModal(`
    <div class="modal" style="max-width:680px" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Question Builder — ${esc(course?.title || '')}</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body" style="max-height:60vh;overflow-y:auto">
        <div id="builder-list">
          ${builderQuestions.map((q, i) => builderQuestionHTML(q, i)).join('')}
        </div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem">
          <button class="btn btn-outline btn-sm" onclick="addBuilderQuestion('mc')">+ Multiple Choice</button>
          <button class="btn btn-outline btn-sm" onclick="addBuilderQuestion('tf')">+ True/False</button>
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveBuilderQuestions('${courseId}')">Save Questions</button>
      </div>
    </div>`);
}

function builderQuestionHTML(q, i) {
  if (q.type === 'mc') {
    return `<div class="qbuilder-item">
      <div class="qbuilder-item-header">
        <span class="qbuilder-item-num">Q${i+1} · Multiple Choice</span>
        <button class="btn btn-danger btn-sm qbuilder-item-remove" onclick="removeBuilderQ(${i})">Remove</button>
      </div>
      <div class="form-group" style="margin-bottom:.6rem">
        <input class="form-input" placeholder="Question text" value="${esc(q.question)}" oninput="builderQuestions[${i}].question=this.value" />
      </div>
      <div class="qbuilder-options">
        ${q.options.map((opt, j) => `
          <div class="qbuilder-option">
            <input type="radio" name="correct-${i}" ${q.correct===j?'checked':''} onchange="builderQuestions[${i}].correct=${j}" title="Mark as correct" />
            <input type="text" placeholder="Option ${j+1}" value="${esc(opt)}" oninput="builderQuestions[${i}].options[${j}]=this.value" />
          </div>`).join('')}
      </div>
      <div class="form-hint" style="margin-top:.4rem">Select the radio button next to the correct answer</div>
    </div>`;
  } else {
    return `<div class="qbuilder-item">
      <div class="qbuilder-item-header">
        <span class="qbuilder-item-num">Q${i+1} · True/False</span>
        <button class="btn btn-danger btn-sm qbuilder-item-remove" onclick="removeBuilderQ(${i})">Remove</button>
      </div>
      <div class="form-group" style="margin-bottom:.6rem">
        <input class="form-input" placeholder="Question text" value="${esc(q.question)}" oninput="builderQuestions[${i}].question=this.value" />
      </div>
      <div style="display:flex;gap:.75rem">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
          <input type="radio" name="tf-${i}" ${q.correct===true?'checked':''} onchange="builderQuestions[${i}].correct=true" /> True
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
          <input type="radio" name="tf-${i}" ${q.correct===false?'checked':''} onchange="builderQuestions[${i}].correct=false" /> False
        </label>
      </div>
    </div>`;
  }
}

function addBuilderQuestion(type) {
  if (type === 'mc') {
    builderQuestions.push({ type: 'mc', question: '', options: ['','','',''], correct: 0 });
  } else {
    builderQuestions.push({ type: 'tf', question: '', correct: true });
  }
  const list = document.getElementById('builder-list');
  if (list) {
    const div = document.createElement('div');
    div.innerHTML = builderQuestionHTML(builderQuestions[builderQuestions.length-1], builderQuestions.length-1);
    list.appendChild(div.firstElementChild);
  }
}

function removeBuilderQ(i) {
  builderQuestions.splice(i, 1);
  const courseId = document.querySelector('[onclick^="saveBuilderQuestions"]')?.getAttribute('onclick')?.match(/'(.+?)'/)?.[1];
  if (courseId) renderBuilderModal(courseId);
}

function saveBuilderQuestions(courseId) {
  const valid = builderQuestions.filter(q => q.question.trim());
  questions[courseId] = valid.length ? valid : undefined;
  if (!valid.length) {
    delete questions[courseId];
    sb.from('questions').delete().eq('course_id', courseId)
      .then(({ error }) => { if (error) console.error('Questions delete:', error); });
  } else {
    sb.from('questions').upsert({ course_id: courseId, questions_json: valid })
      .then(({ error }) => { if (error) console.error('Questions save:', error); });
  }
  closeModal();
  toast(`${valid.length} question${valid.length!==1?'s':''} saved!`);
  renderAdminCourses();
}

// ─── Add Questions to existing course ────────────────────────────────────────
function showAddQuestionsModal(courseId) {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>${questions[courseId] ? 'Edit Questions' : 'Add Questions'}</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <p style="margin-bottom:1rem;font-size:.9rem;color:var(--text-muted)">How would you like to add questions?</p>
        ${getCourse(courseId)?.contentType === 'pdf' && getCourse(courseId)?.pdfDataUrl ? `
        <button class="btn btn-accent" style="width:100%;margin-bottom:.65rem;justify-content:center" onclick="aiGenerateForExisting('${courseId}')">
          🤖 AI Generate from PDF
        </button>` : ''}
        ${['youtube','slides'].includes(getCourse(courseId)?.contentType) ? `
        <button class="btn btn-accent" style="width:100%;margin-bottom:.65rem;justify-content:center" onclick="aiGenerateForUrl('${courseId}')">
          🤖 AI Generate from ${getCourse(courseId)?.contentType === 'youtube' ? 'Video' : 'Slides'}
        </button>` : ''}
        <button class="btn btn-outline" style="width:100%;margin-bottom:.65rem;justify-content:center" onclick="closeModal();setTimeout(()=>showExcelUploadModal('${courseId}'),200)">
          📊 Upload Excel
        </button>
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="closeModal();setTimeout(()=>showManualBuilderModal('${courseId}'),200)">
          ✍️ Manual Builder
        </button>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

function showExcelUploadModal(courseId) {
  const course = getCourse(courseId);
  showModal(`
    <div class="modal" style="max-width:520px" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Upload Questions from Excel</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div class="excel-upload-hint">
          <strong>Required columns (row 1 = headers):</strong><br/>
          <code>type</code> · <code>question</code> · <code>option_a</code> · <code>option_b</code> · <code>option_c</code> · <code>option_d</code> · <code>correct</code>
          <div style="margin-top:.5rem;font-size:.8rem;color:var(--text-muted)">
            For <strong>mc</strong>: correct = A, B, C, or D &nbsp;·&nbsp;
            For <strong>tf</strong>: correct = TRUE or FALSE (option columns can be blank)
          </div>
        </div>
        <div style="display:flex;gap:.6rem;margin-bottom:1rem">
          <button class="btn btn-outline btn-sm" style="flex:1;justify-content:center" onclick="downloadQuestionsTemplate()">⬇ Download Template</button>
        </div>
        <div class="excel-drop-zone" id="excel-drop-zone" onclick="document.getElementById('excel-file-input').click()">
          <div class="excel-drop-icon">📊</div>
          <div class="excel-drop-label">Click to choose file or drag & drop</div>
          <div class="excel-drop-sub">.xlsx or .xls</div>
          <input type="file" id="excel-file-input" accept=".xlsx,.xls" style="display:none" onchange="handleExcelFile(this,'${courseId}')" />
        </div>
        <div id="excel-preview" style="display:none;margin-top:1rem"></div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="excel-save-btn" style="display:none" onclick="saveExcelQuestions('${courseId}')">Save Questions</button>
      </div>
    </div>`);

  // drag & drop support
  setTimeout(() => {
    const zone = document.getElementById('excel-drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('dragging');
      const file = e.dataTransfer.files[0];
      if (file) handleExcelFile({ files: [file] }, courseId);
    });
  }, 100);
}

let _parsedExcelQuestions = [];

function handleExcelFile(input, courseId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const parsed = [];
      const errors = [];

      rows.forEach((row, i) => {
        const rowNum = i + 2; // 1-indexed, row 1 = headers
        const type = String(row.type || '').trim().toLowerCase();
        const question = String(row.question || '').trim();
        const correctRaw = row.correct;
        const correct = correctRaw === true ? 'TRUE' : correctRaw === false ? 'FALSE' : String(correctRaw || '').trim().toUpperCase();

        if (!type) { errors.push(`Row ${rowNum}: missing type`); return; }
        if (!question) { errors.push(`Row ${rowNum}: missing question`); return; }
        if (!['mc','tf'].includes(type)) { errors.push(`Row ${rowNum}: type must be "mc" or "tf"`); return; }

        if (type === 'mc') {
          const opts = [
            String(row.option_a || '').trim(),
            String(row.option_b || '').trim(),
            String(row.option_c || '').trim(),
            String(row.option_d || '').trim(),
          ];
          if (opts.some(o => !o)) { errors.push(`Row ${rowNum}: all 4 options required for mc`); return; }
          const correctIdx = { A:0, B:1, C:2, D:3 }[correct];
          if (correctIdx === undefined) { errors.push(`Row ${rowNum}: correct must be A, B, C, or D for mc`); return; }
          parsed.push({ type: 'mc', question, options: opts, correct: correctIdx });
        } else {
          if (!['TRUE','FALSE'].includes(correct)) { errors.push(`Row ${rowNum}: correct must be TRUE or FALSE for tf`); return; }
          parsed.push({ type: 'tf', question, correct: correct === 'TRUE' });
        }
      });

      const preview = document.getElementById('excel-preview');
      const saveBtn = document.getElementById('excel-save-btn');
      if (!preview || !saveBtn) return;

      if (errors.length) {
        preview.style.display = 'block';
        preview.innerHTML = `<div class="excel-errors">
          <strong>⚠️ Fix these errors before saving:</strong>
          <ul style="margin:.5rem 0 0 1rem">${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
        </div>`;
        saveBtn.style.display = 'none';
        _parsedExcelQuestions = [];
        return;
      }

      if (!parsed.length) {
        preview.style.display = 'block';
        preview.innerHTML = `<div class="excel-errors"><strong>⚠️ No valid rows found.</strong> Make sure row 1 contains the headers.</div>`;
        saveBtn.style.display = 'none';
        _parsedExcelQuestions = [];
        return;
      }

      _parsedExcelQuestions = parsed;
      const mcCount = parsed.filter(q => q.type === 'mc').length;
      const tfCount = parsed.filter(q => q.type === 'tf').length;

      preview.style.display = 'block';
      preview.innerHTML = `
        <div class="excel-success">
          ✅ <strong>${parsed.length} questions ready</strong> — ${mcCount} multiple choice · ${tfCount} true/false
        </div>
        <div class="excel-preview-list">
          ${parsed.slice(0, 5).map((q, i) => `
            <div class="excel-preview-row">
              <span class="badge ${q.type === 'mc' ? 'badge-pdf' : 'badge-none'}" style="flex-shrink:0">${q.type.toUpperCase()}</span>
              <span style="font-size:.82rem;color:var(--text)">${esc(q.question)}</span>
            </div>`).join('')}
          ${parsed.length > 5 ? `<div style="font-size:.78rem;color:var(--text-muted);text-align:center;padding:.4rem">… and ${parsed.length - 5} more</div>` : ''}
        </div>`;
      saveBtn.style.display = '';
    } catch(err) {
      toast('Could not read file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function saveExcelQuestions(courseId) {
  if (!_parsedExcelQuestions.length) { toast('No questions to save', 'error'); return; }
  closeModal();
  showLoader('Saving questions', 'Writing to database…');
  questions[courseId] = _parsedExcelQuestions;
  const { error } = await sb.from('questions').upsert({ course_id: courseId, questions_json: _parsedExcelQuestions });
  hideLoader();
  if (error) {
    toast(`Save failed: ${error.message}`, 'error');
  } else {
    toast(`✅ ${_parsedExcelQuestions.length} questions saved!`);
    _parsedExcelQuestions = [];
    renderAdminCourses();
  }
}

function downloadQuestionsTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['type', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct'],
    ['mc', 'What is the capital of the Philippines?', 'Cebu', 'Manila', 'Davao', 'Quezon City', 'B'],
    ['mc', 'Which law governs data privacy in the Philippines?', 'RA 9165', 'RA 8291', 'RA 10173', 'RA 7641', 'C'],
    ['tf', 'Employees are entitled to at least one rest day per week.', '', '', '', '', 'TRUE'],
    ['tf', 'The probationary period in the Philippines can exceed 12 months.', '', '', '', '', 'FALSE'],
  ]);
  // Set column widths
  ws['!cols'] = [{ wch: 5 }, { wch: 52 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 9 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  XLSX.writeFile(wb, 'sprout-learn-questions-template.xlsx');
}

async function aiGenerateForExisting(courseId) {
  const course = getCourse(courseId);
  if (!course?.pdfDataUrl) { toast('No PDF attached', 'error'); return; }
  closeModal();
  showLoader('Generating questions', 'AI is reading your PDF');
  try {
    const arrayBuffer = await (await fetch(course.pdfDataUrl)).arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    const qs = await generateQuestionsAI(text, course.title);
    questions[courseId] = qs;
    await sb.from('questions').upsert({ course_id: courseId, questions_json: qs });
    hideLoader();
    toast(`${qs.length} questions generated!`);
    renderAdminCourses();
  } catch(err) {
    console.error('AI generation error:', err);
    hideLoader();
    toast(`AI failed: ${err.message || 'check console'}`, 'error');
  }
}

async function aiGenerateForUrl(courseId) {
  const course = getCourse(courseId);
  if (!course) return;
  closeModal();
  const isYoutube = course.contentType === 'youtube';
  showLoader('Generating questions', isYoutube ? 'Fetching video transcript…' : 'Reading slide content…');
  try {
    const presentationId = (course.slidesUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    const body = isYoutube
      ? { type: 'youtube', videoId: course.youtubeId }
      : { type: 'slides', presentationId };
    if (!body.videoId && !body.presentationId) throw new Error('No video ID or presentation ID found on this course.');
    const contentRes = await fetch('/api/fetch-content', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const contentData = await contentRes.json();
    if (!contentData.text || contentData.text.length < 50) {
      hideLoader();
      showPasteContentModal(courseId, course.title, course.contentType, contentData.error);
      return;
    }
    const qs = await generateQuestionsAI(contentData.text, course.title);
    questions[courseId] = qs;
    await sb.from('questions').upsert({ course_id: courseId, questions_json: qs });
    hideLoader();
    toast(`${qs.length} questions generated!`);
    renderAdminCourses();
  } catch(err) {
    hideLoader();
    console.error('AI URL generation error:', err);
    showPasteContentModal(courseId, course.title, course.contentType, err.message);
  }
}

function showPasteContentModal(courseId, courseTitle, contentType, errorMsg) {
  const hint = contentType === 'youtube'
    ? 'On YouTube: open the video, click the <strong>⋯ More</strong> button → <strong>Show transcript</strong>, then copy and paste it here.'
    : 'In Google Slides: go to <strong>File → Share → Publish to web</strong>, then try AI generate again. Or paste the slide text below.';
  showModal(`
    <div class="modal" style="max-width:560px" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Paste Content for AI Questions</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        ${errorMsg ? `<div style="background:#fff3e0;border:1px solid #ffb74d;border-radius:8px;padding:.75rem 1rem;font-size:.83rem;color:#e65100;margin-bottom:1rem">${esc(errorMsg)}</div>` : ''}
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:.75rem" id="paste-hint">${hint}</p>
        <div class="form-group">
          <label class="form-label">Course content / transcript *</label>
          <textarea id="paste-text" class="form-textarea" rows="8" placeholder="Paste the video transcript or slide text here…" style="font-size:.82rem"></textarea>
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal();setTimeout(()=>showManualBuilderModal('${courseId}'),200)">✍️ Manual Builder</button>
        <button class="btn btn-primary" onclick="generateFromPastedText('${courseId}','${esc(courseTitle)}')">🤖 Generate Questions</button>
      </div>
    </div>`);
}

async function generateFromPastedText(courseId, courseTitle) {
  const text = document.getElementById('paste-text')?.value.trim();
  if (!text || text.length < 50) { toast('Please paste more content (at least a few sentences)', 'error'); return; }
  closeModal();
  showLoader('Generating questions', 'AI is reading your content');
  try {
    const qs = await generateQuestionsAI(text, courseTitle);
    questions[courseId] = qs;
    await sb.from('questions').upsert({ course_id: courseId, questions_json: qs });
    hideLoader();
    toast(`${qs.length} questions generated!`);
    renderAdminCourses();
  } catch(err) {
    hideLoader();
    toast(`AI failed: ${err.message}`, 'error');
  }
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────
function showAssignModal(courseId, filterTeamId = '') {
  const course = getCourse(courseId);
  const visible = filterTeamId ? learners().filter(u => u.teamId === filterTeamId) : learners();
  const teamTabs = [{ id: '', name: 'All' }, ...allTeams.map(t => ({ id: t.id, name: t.name }))];
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Assign: ${esc(course?.title || '')}</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.75rem">
          ${teamTabs.map(t => `<button class="btn btn-sm ${filterTeamId===t.id?'btn-primary':'btn-outline'}" onclick="showAssignModal('${courseId}','${t.id}')">${esc(t.name)}</button>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <span style="font-size:.85rem;color:var(--text-muted)">${visible.length} member${visible.length!==1?'s':''}</span>
          <button class="btn btn-outline btn-sm" onclick="toggleAssignAll('${courseId}','${filterTeamId}')">Assign All</button>
        </div>
        <div class="assignee-list" id="assignee-list">
          ${visible.map(u => `
            <div class="assignee-item ${isAssigned(u.id,courseId)?'selected':''}" id="assignee-${u.id}" onclick="toggleAssignee('${u.id}','${courseId}')">
              <input type="checkbox" class="assignee-check" ${isAssigned(u.id,courseId)?'checked':''} />
              ${avatarHTML(u, 32)}
              <div><div style="font-weight:600;font-size:.88rem">${esc(u.name)}</div><div style="font-size:.75rem;color:var(--text-muted)">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div></div>
            </div>`).join('')}
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Done</button>
      </div>
    </div>`);
}

async function toggleAssignee(userId, courseId) {
  const item = document.getElementById(`assignee-${userId}`);
  if (!item || item.dataset.saving === 'true') return; // prevent double-click
  item.dataset.saving = 'true';

  // Show saving spinner on the item
  const savingBadge = document.createElement('span');
  savingBadge.className = 'assignee-saving';
  savingBadge.innerHTML = '<span class="assignee-spinner"></span>';
  item.appendChild(savingBadge);
  item.style.pointerEvents = 'none';
  item.style.opacity = '.7';

  if (!assignments[userId]) assignments[userId] = [];
  const idx = assignments[userId].indexOf(courseId);
  const willAssign = idx === -1;

  let error;
  if (!willAssign) {
    assignments[userId].splice(idx, 1);
    ({ error } = await sb.from('assignments').delete().eq('user_id', userId).eq('course_id', courseId));
    if (error) assignments[userId].push(courseId); // rollback
  } else {
    assignments[userId].push(courseId);
    ({ error } = await sb.from('assignments').upsert({ user_id: userId, course_id: courseId }));
    if (error) assignments[userId].splice(assignments[userId].indexOf(courseId), 1); // rollback
  }

  // Remove spinner
  savingBadge.remove();
  item.style.pointerEvents = '';
  item.style.opacity = '';
  item.dataset.saving = 'false';

  if (error) {
    toast('Failed to ' + (willAssign ? 'assign' : 'unassign') + ': ' + error.message, 'error');
    return;
  }
  if (willAssign) {
    const course = getCourse(courseId);
    const user   = getUser(userId);
    if (course && user) createNotif(userId, 'course_assigned', `📚 New course assigned: ${course.title}`, `Assigned by ${currentUser.name}`);
  }

  const assigned = isAssigned(userId, courseId);
  const check = item.querySelector('input[type="checkbox"]');
  item.classList.toggle('selected', assigned);
  if (check) check.checked = assigned;

  // Pop + particle animation
  const avatar = item.querySelector('.user-avatar');
  if (avatar) { avatar.classList.add('popping'); setTimeout(() => avatar.classList.remove('popping'), 350); }
  const p = document.createElement('span');
  p.className = 'assign-particle';
  p.textContent = assigned ? '✓' : '✕';
  p.style.color = assigned ? 'var(--accent-dark)' : '#e53935';
  item.appendChild(p);
  setTimeout(() => p.remove(), 480);
}

function toggleAssignAll(courseId, filterTeamId = '') {
  const targets = filterTeamId ? learners().filter(u => u.teamId === filterTeamId) : learners();
  const allAssigned = targets.every(u => isAssigned(u.id, courseId));
  targets.forEach(u => {
    if (!assignments[u.id]) assignments[u.id] = [];
    if (allAssigned) {
      assignments[u.id] = assignments[u.id].filter(cid => cid !== courseId);
      sb.from('assignments').delete().eq('user_id', u.id).eq('course_id', courseId)
        .then(({ error }) => { if (error) { console.error('Assignment delete:', error); toast('Failed to unassign: ' + error.message, 'error'); } });
    } else if (!isAssigned(u.id, courseId)) {
      assignments[u.id].push(courseId);
      sb.from('assignments').upsert({ user_id: u.id, course_id: courseId })
        .then(({ error }) => { if (error) { console.error('Assignment insert:', error); toast('Failed to assign: ' + error.message, 'error'); } });
    }
  });
  showAssignModal(courseId, filterTeamId);
}

// ─── Admin Team Progress ──────────────────────────────────────────────────────
function renderAdminTeam(filterTeam = '', filterCourse = '', searchQ = '', sortBy = 'name') {
  setTitle('Team Progress');

  // Filter + sort learners
  let members = learners();
  if (searchQ) members = members.filter(u =>
    u.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQ.toLowerCase()));
  if (filterTeam) members = members.filter(u => u.teamId === filterTeam);
  members = [...members].sort((a, b) => {
    if (sortBy === 'progress')    return userAvgProgress(b.id) - userAvgProgress(a.id);
    if (sortBy === 'completions') return userCompletions(b.id) - userCompletions(a.id);
    return a.name.localeCompare(b.name);
  });

  // Group by team
  const grouped = {};
  members.forEach(u => {
    const key = u.teamId || '__none__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(u);
  });
  const teamsToShow = filterTeam ? allTeams.filter(t => t.id === filterTeam) : allTeams;
  const teamSections = teamsToShow.map(t => ({ team: t, members: grouped[t.id] || [] }));
  if (!filterTeam && grouped['__none__']?.length)
    teamSections.push({ team: null, members: grouped['__none__'] });

  const memberCard = (u, i) => {
    const assigned   = getUserAssignments(u.id).length;
    const done       = userCompletions(u.id);
    const avg        = userAvgProgress(u.id);
    const badgeColor = done === assigned && assigned > 0 ? '#2e7d32' : done > 0 ? '#e65100' : '#757575';

    let progressBlock = '';
    if (filterCourse) {
      const c  = getCourse(filterCourse);
      const p  = getProgress(u.id, filterCourse);
      const ia = getUserAssignments(u.id).includes(filterCourse);
      if (!ia) {
        progressBlock = `<div style="font-size:.8rem;color:var(--text-muted);margin:.4rem 0">Not assigned</div>`;
      } else if (p.completed) {
        const col = p.passed ? 'var(--accent-dark)' : '#e53935';
        const lbl = p.passed ? '✓ Passed' : '✗ Failed';
        progressBlock = `
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin:.4rem 0">
            <span style="font-weight:700;color:${col}">${lbl}</span>
            ${p.score != null ? `<span style="color:var(--text-muted)">${p.score}%</span>` : ''}
          </div>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:100%;background:${col}"></div></div>`;
      } else if (p.currentSlide > 0) {
        const pct = Math.min(80, c?.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
        progressBlock = `
          <div style="font-size:.8rem;color:var(--text-muted);margin:.4rem 0">In Progress · ${pct}%</div>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>`;
      } else {
        progressBlock = `
          <div style="font-size:.8rem;color:var(--text-muted);margin:.4rem 0">Not started</div>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:0%"></div></div>`;
      }
    } else {
      progressBlock = `
        <div class="member-stats">
          <span><strong>${assigned}</strong> assigned</span>
          <span><strong>${done}</strong> completed</span>
          <span><strong>${avg}%</strong> avg</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${avg}%"></div></div>`;
    }

    return `<div class="member-card" style="animation-delay:${i*0.05}s">
      <div class="member-card-top">
        ${avatarHTML(u, 44)}
        <div class="member-info">
          <div class="member-name">${esc(u.name)}</div>
          <div class="member-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'No team')}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${esc(u.email)}</div>
        </div>
        <span class="badge" style="background:${badgeColor};color:white">${done}/${assigned}</span>
      </div>
      ${progressBlock}
      <div style="display:flex;gap:.5rem;margin-top:.5rem">
        <button class="btn btn-outline btn-sm" onclick="promoteUser('${u.id}')">⬆ Make Admin</button>
        <button class="btn btn-outline btn-sm" onclick="editUserRole('${u.id}')">✏️ Edit</button>
      </div>
    </div>`;
  };

  const teamSection = ({ team, members: ms }) => {
    const label   = team ? esc(team.name) : 'No Team';
    const avgTeam = ms.length ? Math.round(ms.reduce((s,u) => s + userAvgProgress(u.id), 0) / ms.length) : 0;
    const allDone = ms.filter(u => { const a = getUserAssignments(u.id).length; return a > 0 && userCompletions(u.id) === a; }).length;
    return `<div class="team-group">
      <div class="team-group-header">
        <div>
          <span class="team-group-name">${label}</span>
          <span style="font-size:.8rem;color:var(--text-muted);margin-left:.6rem">${ms.length} member${ms.length!==1?'s':''}</span>
        </div>
        <div class="team-group-stats">
          <span><strong>${avgTeam}%</strong> avg</span>
          <span><strong>${allDone}/${ms.length}</strong> fully done</span>
        </div>
      </div>
      ${ms.length === 0
        ? `<p style="color:var(--text-muted);font-size:.85rem;padding:.25rem 0">No members in this team yet.</p>`
        : `<div class="member-grid">${ms.map((u,i) => memberCard(u,i)).join('')}</div>`}
    </div>`;
  };

  const adminsHTML = allUsers.filter(u => u.isAdmin).map((u, i) => `
    <div class="member-card" style="animation-delay:${i*0.07}s">
      <div class="member-card-top">
        ${avatarHTML(u, 44)}
        <div class="member-info">
          <div class="member-name">${esc(u.name)}</div>
          <div class="member-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${esc(u.email)}</div>
        </div>
        <span class="badge badge-done">Admin</span>
      </div>
      ${u.id !== currentUser.id ? `<div style="margin-top:.5rem"><button class="btn btn-outline btn-sm" onclick="demoteUser('${u.id}')">⬇ Make Learner</button></div>` : '<div style="font-size:.75rem;color:var(--text-muted);margin-top:.5rem">That\'s you</div>'}
    </div>`).join('');

  const resultsHTML = `
    ${teamSections.length === 0
      ? `<div class="empty-state"><span class="empty-icon">👥</span><h2>No members found</h2><p>Try adjusting your filters.</p></div>`
      : teamSections.map(teamSection).join('')}
    <p class="section-heading" style="margin-top:1.5rem">Admins</p>
    <div class="member-grid">${adminsHTML}</div>`;

  // Already on this page — only swap results to avoid re-animating everything
  const existingResults = document.getElementById('tp-results');
  if (existingResults) {
    existingResults.innerHTML = resultsHTML;
    const inp = document.querySelector('#main-content .toolbar-search input');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    return;
  }

  setMain(`
    <div class="page-header">
      <h1>Team Progress</h1>
      <p>Track and manage your team members</p>
    </div>
    <div class="toolbar" style="flex-wrap:wrap;gap:.5rem;margin-bottom:1.25rem">
      <div class="toolbar-search" style="flex:1;min-width:180px">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input placeholder="Search members…" value="${esc(searchQ)}"
          oninput="renderAdminTeam(document.getElementById('tp-team')?.value,document.getElementById('tp-course')?.value,this.value,document.getElementById('tp-sort')?.value)" />
      </div>
      <select class="toolbar-select" id="tp-team"
        onchange="renderAdminTeam(this.value,document.getElementById('tp-course')?.value,document.querySelector('.toolbar-search input')?.value,document.getElementById('tp-sort')?.value)">
        <option value="">All Teams</option>
        ${allTeams.map(t => `<option value="${t.id}" ${filterTeam===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
      </select>
      <select class="toolbar-select" id="tp-course"
        onchange="renderAdminTeam(document.getElementById('tp-team')?.value,this.value,document.querySelector('.toolbar-search input')?.value,document.getElementById('tp-sort')?.value)">
        <option value="">All Courses</option>
        ${courses.map(c => `<option value="${c.id}" ${filterCourse===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}
      </select>
      <select class="toolbar-select" id="tp-sort"
        onchange="renderAdminTeam(document.getElementById('tp-team')?.value,document.getElementById('tp-course')?.value,document.querySelector('.toolbar-search input')?.value,this.value)">
        <option value="name"        ${sortBy==='name'?'selected':''}>Sort: Name</option>
        <option value="progress"    ${sortBy==='progress'?'selected':''}>Sort: Progress</option>
        <option value="completions" ${sortBy==='completions'?'selected':''}>Sort: Completions</option>
      </select>
    </div>

    <div id="tp-results">${resultsHTML}</div>`);
}

async function promoteUser(userId) {
  const u = getUser(userId);
  if (!u || !confirm(`Make ${u.name} an Admin?`)) return;
  await sb.from('users').update({ is_admin: true }).eq('id', userId);
  u.isAdmin = true;
  toast(`${u.name} is now an Admin`);
  renderAdminTeam();
}

async function demoteUser(userId) {
  const u = getUser(userId);
  if (!u || !confirm(`Remove Admin from ${u.name}?`)) return;
  await sb.from('users').update({ is_admin: false }).eq('id', userId);
  u.isAdmin = false;
  toast(`${u.name} is now a Learner`);
  renderAdminTeam();
}

function editUserRole(userId) {
  const u = getUser(userId);
  if (!u) return;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header"><h2>Edit Name</h2><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input id="edit-name" class="form-input" value="${esc(u.name)}" />
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUserRole('${userId}')">Save</button>
      </div>
    </div>`);
}

async function saveUserRole(userId) {
  const name = document.getElementById('edit-name')?.value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  await sb.from('users').update({ name }).eq('id', userId);
  const u = getUser(userId);
  if (u) { u.name = name; }
  closeModal();
  toast('Saved!');
  renderAdminTeam();
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function renderAdminSettings() {
  setTitle('Settings');
  setMain(`
    <div class="page-header"><h1>Settings</h1><p>Manage teams and user access</p></div>

    <div class="settings-section">
      <div class="settings-section-header">
        <h2 class="section-heading" style="margin:0">Teams</h2>
        <button class="btn btn-primary btn-sm" onclick="showAddTeamModal()">+ Add Team</button>
      </div>
      <div class="settings-list">
        ${allTeams.length === 0
          ? `<div class="empty-state" style="padding:1.5rem"><span class="empty-icon">👥</span><p>No teams yet. Add your first team above.</p></div>`
          : allTeams.map(t => `
              <div class="settings-list-item">
                <span style="font-weight:600">${esc(t.name)}</span>
                <div style="display:flex;gap:.5rem">
                  <button class="btn btn-outline btn-sm" onclick="showRenameTeamModal('${t.id}','${esc(t.name)}')">✏️ Rename</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteTeam('${t.id}','${esc(t.name)}')">🗑</button>
                </div>
              </div>`).join('')}
      </div>
    </div>

    <div class="settings-section" style="margin-top:2rem">
      <h2 class="section-heading">🎮 Active Game</h2>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">Choose which game appears on the learner dashboard</p>
      <div class="settings-list">
        <div class="settings-list-item">
          <div>
            <div style="font-weight:600">🏃 Sprout Runner</div>
            <div style="font-size:.78rem;color:var(--text-muted)">Side-scrolling obstacle runner</div>
          </div>
          <input type="radio" name="active-game" value="sprout_runner" ${(siteSettings.activeGame||'sprout_runner')==='sprout_runner'?'checked':''} onchange="setActiveGame('sprout_runner')" style="width:18px;height:18px;cursor:pointer" />
        </div>
        <div class="settings-list-item">
          <div>
            <div style="font-weight:600">🦆 Duck Hunt</div>
            <div style="font-size:.78rem;color:var(--text-muted)">Click to shoot ducks — 30 seconds</div>
          </div>
          <input type="radio" name="active-game" value="duck_hunt" ${siteSettings.activeGame==='duck_hunt'?'checked':''} onchange="setActiveGame('duck_hunt')" style="width:18px;height:18px;cursor:pointer" />
        </div>
      </div>
    </div>

    <div class="settings-section" style="margin-top:2rem">
      <h2 class="section-heading">User Access</h2>
      <div class="settings-list">
        ${allUsers.map(u => {
          const team = allTeams.find(t => t.id === u.teamId);
          return `<div class="settings-list-item">
            <div style="display:flex;align-items:center;gap:.75rem;min-width:0">
              ${avatarHTML(u, 38, 'flex-shrink:0')}
              <div style="min-width:0">
                <div style="font-weight:600;font-size:.9rem">${esc(u.name)}</div>
                <div style="font-size:.74rem;color:var(--text-muted)">${esc(u.email)} · ${team ? esc(team.name) : '<em>No team</em>'}</div>
              </div>
            </div>
            <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">
              ${u.isAdmin ? `<span class="badge badge-done">Admin</span>` : `<span class="badge badge-none">Learner</span>`}
              ${u.id !== currentUser.id ? `<button class="btn btn-outline btn-sm" onclick="${u.isAdmin ? `demoteUser('${u.id}')` : `promoteUser('${u.id}')`}">${u.isAdmin ? '⬇' : '⬆'}</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="showEditUserModal('${u.id}')">✏️</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`);
}

async function setActiveGame(game) {
  siteSettings.activeGame = game;
  const ok = await saveSiteSettings();
  if (ok) toast(`✅ Active game set to ${game === 'duck_hunt' ? 'Duck Hunt' : 'Sprout Runner'}`);
}

function showAddTeamModal() {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header"><h2>Add Team</h2><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Team Name *</label>
          <input id="new-team-name" class="form-input" placeholder="e.g. Sales, Engineering, HR" />
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="addTeam()">Add Team</button>
      </div>
    </div>`);
}

async function addTeam() {
  const name = document.getElementById('new-team-name')?.value.trim();
  if (!name) { toast('Please enter a team name', 'error'); return; }
  const { data, error } = await sb.from('teams').insert({ name }).select().single();
  if (error) { toast('Failed: ' + error.message, 'error'); return; }
  allTeams.push(data);
  allTeams.sort((a, b) => a.name.localeCompare(b.name));
  closeModal();
  toast('Team added!');
  renderAdminSettings();
}

function showRenameTeamModal(id, currentName) {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header"><h2>Rename Team</h2><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Team Name *</label>
          <input id="rename-team-name" class="form-input" value="${esc(currentName)}" />
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="renameTeam('${id}')">Save</button>
      </div>
    </div>`);
}

async function renameTeam(id) {
  const name = document.getElementById('rename-team-name')?.value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  const { error } = await sb.from('teams').update({ name }).eq('id', id);
  if (error) { toast('Failed: ' + error.message, 'error'); return; }
  const t = allTeams.find(t => t.id === id);
  if (t) t.name = name;
  closeModal();
  toast('Team renamed!');
  renderAdminSettings();
}

async function deleteTeam(id, name) {
  if (!confirm(`Delete team "${name}"? Users in this team will have no team assigned.`)) return;
  const { error } = await sb.from('teams').delete().eq('id', id);
  if (error) { toast('Failed: ' + error.message, 'error'); return; }
  allTeams = allTeams.filter(t => t.id !== id);
  allUsers.forEach(u => { if (u.teamId === id) u.teamId = null; });
  toast('Team deleted');
  renderAdminSettings();
}

function showEditUserModal(userId) {
  const u = getUser(userId);
  if (!u) return;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header"><h2>Edit User</h2><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input id="eu-name" class="form-input" value="${esc(u.name)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Team</label>
          <select id="eu-team" class="form-select">
            <option value="">— No team —</option>
            ${allTeams.map(t => `<option value="${t.id}" ${u.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUserEdit('${userId}')">Save</button>
      </div>
    </div>`);
}

async function saveUserEdit(userId) {
  const name   = document.getElementById('eu-name')?.value.trim();
  const teamId = document.getElementById('eu-team')?.value || null;
  if (!name) { toast('Name required', 'error'); return; }
  const { error } = await sb.from('users').update({ name, team_id: teamId }).eq('id', userId);
  if (error) { toast('Failed: ' + error.message, 'error'); return; }
  const u = getUser(userId);
  if (u) { u.name = name; u.teamId = teamId; }
  closeModal();
  toast('Saved!');
  renderAdminSettings();
}

// ─── Leaderboard (shared admin/learner) ───────────────────────────────────────
function renderLeaderboard(isAdmin, filterCourseId) {
  setTitle('Leaderboard');
  const medals = ['🥇','🥈','🥉'];
  const allCourses = courses.filter(c => c.published !== false);

  // Overall ranking by XP
  const overallRanked = [...learners()]
    .map(u => ({ ...u, xp: userXP(u.id), level: userLevel(u.id), badges: userBadges(u.id), done: userCompletions(u.id) }))
    .sort((a,b) => b.xp - a.xp);

  let perModuleRanked = null;
  if (filterCourseId) {
    const course = getCourse(filterCourseId);
    perModuleRanked = [...learners()]
      .filter(u => isAssigned(u.id, filterCourseId))
      .map(u => {
        const p = getProgress(u.id, filterCourseId);
        return { ...u, score: p.score ?? null, passed: p.passed, completed: p.completed };
      })
      .sort((a,b) => {
        if (b.score !== null && a.score === null) return 1;
        if (a.score !== null && b.score === null) return -1;
        return (b.score ?? -1) - (a.score ?? -1);
      });
  }

  const filterBar = `
    <div style="margin-bottom:1.25rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
      <label style="font-weight:600;font-size:.9rem">Filter by module:</label>
      <select onchange="renderLeaderboard(${isAdmin}, this.value || null)" style="padding:.4rem .75rem;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:.9rem;cursor:pointer">
        <option value="" ${!filterCourseId ? 'selected' : ''}>Overall</option>
        ${allCourses.map(c => `<option value="${c.id}" ${filterCourseId === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}
      </select>
    </div>`;

  if (filterCourseId && perModuleRanked) {
    const course = getCourse(filterCourseId);
    setMain(`
      <div class="page-header"><h1>🏆 Leaderboard</h1><p>Rankings for: <strong>${esc(course?.title || filterCourseId)}</strong></p></div>
      ${filterBar}
      <div class="leaderboard-list">
        ${perModuleRanked.length === 0
          ? `<div class="empty-state" style="padding:2rem"><span class="empty-icon">👥</span><p>No learners assigned to this module yet.</p></div>`
          : perModuleRanked.map((u, i) => {
              const scoreDisplay = u.score !== null ? `${u.score}%` : '—';
              const statusBadge = u.completed
                ? `<span class="lb-status-badge ${u.passed?'pass':'fail'}">${u.passed ? '✅ Passed' : '❌ Failed'}</span>`
                : `<span class="lb-status-badge">Not taken</span>`;
              return `<div class="lb-item ${i===0&&u.score!==null?'top1':''}" style="animation-delay:${i*0.07}s">
                <div class="lb-rank">${u.score !== null ? (medals[i] || `#${i+1}`) : '—'}</div>
                ${avatarHTML(u, 42)}
                <div class="lb-info"><div class="lb-name">${esc(u.name)}</div><div class="lb-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div></div>
                <div>${statusBadge}</div>
                <div class="lb-stats"><strong>${scoreDisplay}</strong> score</div>
              </div>`;
            }).join('')}
      </div>`);
    return;
  }

  // Team standings
  const teamStandings = allTeams.map(team => {
    const members   = learners().filter(u => u.teamId === team.id);
    const tAssigned  = members.reduce((s, u) => s + getUserAssignments(u.id).length, 0);
    const tCompleted = members.reduce((s, u) => s + userCompletions(u.id), 0);
    const rate = tAssigned ? Math.round((tCompleted / tAssigned) * 100) : 0;
    const scores = members.flatMap(u =>
      getUserAssignments(u.id).map(cid => getProgress(u.id, cid)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score)
    );
    const avgSc = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    const totalXP = members.reduce((s, u) => s + userXP(u.id), 0);
    return { team, members: members.length, tAssigned, tCompleted, rate, avgSc, totalXP };
  }).sort((a,b) => b.rate - a.rate || b.totalXP - a.totalXP);
  const maxRate = Math.max(...teamStandings.map(r => r.rate), 1);
  const myTeamId = currentUser?.teamId;

  setMain(`
    <div class="page-header"><h1>🏆 Leaderboard</h1><p>Individual rankings, team standings & achievements</p></div>
    ${filterBar}
    <div class="lb-two-col">
      <div>
        <p class="section-heading">Individual Rankings</p>
        <div class="leaderboard-list">
          ${overallRanked.map((u, i) => {
            const next = userNextLevel(u.id);
            const xpToNext = next ? `<div style="font-size:.7rem;color:var(--text-muted)">${next.xpNeeded} XP to ${next.label}</div>` : `<div style="font-size:.7rem;color:var(--accent);font-weight:700">Max Level!</div>`;
            const badgeIcons = u.badges.map(b => `<span title="${b.label}: ${b.desc}" style="font-size:1.1rem;cursor:default">${b.icon}</span>`).join('');
            const isMe = u.id === currentUser?.id;
            return `<div class="lb-item ${i===0?'top1':''} ${isMe?'lb-item--me':''}" style="animation-delay:${i*0.07}s">
              <div class="lb-rank">${medals[i] || `#${i+1}`}</div>
              ${avatarHTML(u, 42)}
              <div class="lb-info">
                <div class="lb-name">${esc(u.name)}${isMe?'<span class="ld-you-badge" style="margin-left:.4rem">You</span>':''}</div>
                <div class="lb-role">${u.level.icon} ${u.level.label} &nbsp;·&nbsp; ${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div>
              </div>
              <div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap">${badgeIcons}</div>
              <div style="text-align:right;min-width:90px">
                <div style="font-size:1.1rem;font-weight:800;color:var(--accent)">${u.xp} XP</div>
                ${xpToNext}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div>
        <p class="section-heading">Team Standings</p>
        <div class="lb-team-list">
          ${teamStandings.length === 0 ? `<p style="color:var(--text-muted);font-size:.9rem">No teams yet.</p>` :
            teamStandings.map((r, i) => {
              const teamMedals = ['🥇','🥈','🥉'];
              const isMe = r.team.id === myTeamId;
              const barW = maxRate > 0 ? Math.round((r.rate / maxRate) * 100) : 0;
              const barColor = r.rate >= 70 ? '#2e7d32' : r.rate >= 40 ? '#f57c00' : '#c62828';
              return `<div class="lb-team-item ${isMe?'lb-team-item--me':''}" style="animation-delay:${i*0.08}s">
                <div class="lb-team-rank">${teamMedals[i]||`#${i+1}`}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem">
                    <span style="font-weight:700;font-size:.95rem">${esc(r.team.name)}</span>
                    ${isMe?'<span class="ld-you-badge">Your team</span>':''}
                  </div>
                  <div style="display:flex;gap:.75rem;font-size:.77rem;color:var(--text-muted);margin-bottom:.5rem">
                    <span>👥 ${r.members} member${r.members!==1?'s':''}</span>
                    <span>✅ ${r.tCompleted}/${r.tAssigned} done</span>
                    ${r.avgSc !== null ? `<span>📊 ${r.avgSc}% avg</span>` : ''}
                    <span>⚡ ${r.totalXP} XP</span>
                  </div>
                  <div class="lb-team-bar-wrap">
                    <div class="lb-team-bar-fill" style="width:${barW}%;background:${isMe?'var(--accent-dark)':barColor}"></div>
                  </div>
                </div>
                <div style="font-size:1.05rem;font-weight:800;color:${isMe?'var(--accent-dark)':barColor};min-width:42px;text-align:right">${r.rate}%</div>
              </div>`;
            }).join('')}
        </div>
        <p class="section-heading" style="margin-top:1.5rem">Badges</p>
        <div class="badges-grid">
          ${BADGES.map(b => `
            <div class="badge-card">
              <span class="badge-card-icon">${b.icon}</span>
              <div><div style="font-weight:700;font-size:.85rem">${b.label}</div><div style="font-size:.75rem;color:var(--text-muted)">${b.desc}</div></div>
            </div>`).join('')}
        </div>
      </div>
    </div>`);
}

// ─── Admin Reports ────────────────────────────────────────────────────────────
function renderAdminReports() {
  setTitle('Reports');
  const allLearners = learners();
  const totalLearners    = allLearners.length;
  const totalCompletions = allLearners.reduce((s, u) => s + userCompletions(u.id), 0);
  const totalAssigned    = allLearners.reduce((s, u) => s + getUserAssignments(u.id).length, 0);
  const scoredProgress   = Object.values(progress).filter(p => p.score !== null && p.score !== undefined);
  const avgScore         = scoredProgress.length
    ? Math.round(scoredProgress.reduce((s, p) => s + p.score, 0) / scoredProgress.length)
    : 0;
  const completionRate   = totalAssigned ? Math.round((totalCompletions / totalAssigned) * 100) : 0;

  // Per-team stats
  const teamRows = allTeams.map(team => {
    const members = allLearners.filter(u => u.teamId === team.id);
    const assigned = members.reduce((s, u) => s + getUserAssignments(u.id).length, 0);
    const completed = members.reduce((s, u) => s + userCompletions(u.id), 0);
    const rate = assigned ? Math.round((completed / assigned) * 100) : 0;
    const teamScores = members.flatMap(u =>
      getUserAssignments(u.id).map(cid => getProgress(u.id, cid)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score)
    );
    const teamAvgScore = teamScores.length ? Math.round(teamScores.reduce((a,b)=>a+b,0)/teamScores.length) : null;
    return { team, members, assigned, completed, rate, teamAvgScore };
  }).sort((a,b) => b.rate - a.rate);

  // Per-course stats
  const courseRows = courses.map(c => {
    const assignedUsers = allLearners.filter(u => isAssigned(u.id, c.id));
    const completedUsers = assignedUsers.filter(u => getProgress(u.id, c.id).completed);
    const cScores = assignedUsers.map(u => getProgress(u.id, c.id)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score);
    const cAvgScore = cScores.length ? Math.round(cScores.reduce((a,b)=>a+b,0)/cScores.length) : null;
    const passRate = assignedUsers.length ? Math.round((completedUsers.length / assignedUsers.length) * 100) : 0;
    return { c, assigned: assignedUsers.length, completed: completedUsers.length, passRate, cAvgScore };
  }).sort((a,b) => b.assigned - a.assigned);

  // Top performers
  const topPerformers = [...allLearners]
    .sort((a,b) => userCompletions(b.id) - userCompletions(a.id) || userAvgProgress(b.id) - userAvgProgress(a.id))
    .slice(0, 5);

  // Donut chart SVG helper
  const r = 54, circ = +(2 * Math.PI * r).toFixed(1);
  const donutChart = (pct, label, color) => {
    const offset = +(circ * (1 - pct / 100)).toFixed(1);
    return `<svg width="148" height="148" viewBox="0 0 148 148">
      <circle cx="74" cy="74" r="${r}" fill="none" stroke="#e8f5e9" stroke-width="14"/>
      <circle cx="74" cy="74" r="${r}" fill="none" stroke="${color}" stroke-width="14"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 74 74)"
        style="transition:stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)"/>
      <text x="74" y="69" text-anchor="middle" font-size="24" font-weight="800" fill="#1B3A1B">${pct}%</text>
      <text x="74" y="88" text-anchor="middle" font-size="10" fill="#5a6a5a">${label}</text>
    </svg>`;
  };

  // Horizontal bar for team chart
  const maxTeamRate = Math.max(...teamRows.map(t => t.rate), 1);
  const teamBarColor = r => r.rate >= 70 ? '#2e7d32' : r.rate >= 40 ? '#f59c00' : '#e53935';

  setMain(`
    <div class="page-header fade-up" style="display:flex;align-items:center;flex-wrap:wrap;gap:.5rem">
      <div>
        <h1>Reports</h1>
        <p>Learning analytics and team performance</p>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="exportReportsCsv()">⬇ Export CSV</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="border-top:3px solid #1B3A1B;animation-delay:0s">
        <div class="stat-label">Total Learners</div>
        <div class="stat-value" data-target="${totalLearners}">0</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #2d5a2d;animation-delay:.07s">
        <div class="stat-label">Total Completions</div>
        <div class="stat-value" data-target="${totalCompletions}">0</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #3a7a3a;animation-delay:.14s">
        <div class="stat-label">Courses Available</div>
        <div class="stat-value" data-target="${courses.length}">0</div>
      </div>
      <div class="stat-card" style="border-top:3px solid #4a9e4a;animation-delay:.21s">
        <div class="stat-label">Avg Assessment Score</div>
        <div class="stat-value" data-target="${avgScore}">0</div>
        <div class="stat-suffix">%</div>
      </div>
    </div>

    <div class="reports-charts-row">
      <!-- Donut charts -->
      <div class="reports-chart-card fade-up" style="animation-delay:.1s">
        <div class="reports-chart-title">Overall Completion Rate</div>
        <div style="display:flex;gap:2rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:.5rem 0">
          <div style="text-align:center">
            ${donutChart(completionRate, 'completion', '#2e7d32')}
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:.3rem">${totalCompletions} of ${totalAssigned} assigned</div>
          </div>
          <div style="text-align:center">
            ${donutChart(avgScore, 'avg score', '#1565c0')}
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:.3rem">${scoredProgress.length} assessment${scoredProgress.length!==1?'s':''} taken</div>
          </div>
        </div>
      </div>

      <!-- Team bar chart -->
      <div class="reports-chart-card fade-up" style="animation-delay:.18s;flex:1;min-width:260px">
        <div class="reports-chart-title">Team Completion Rates</div>
        ${teamRows.length ? `
          <div class="reports-bar-chart">
            ${teamRows.map((r,i) => `
              <div class="reports-bar-row" style="animation-delay:${i*.07+.2}s">
                <div class="reports-bar-label" title="${esc(r.team.name)}">${esc(r.team.name)}</div>
                <div class="reports-bar-track">
                  <div class="reports-bar-fill" style="width:${Math.round((r.rate/maxTeamRate)*100)}%;background:${teamBarColor(r)}"></div>
                </div>
                <div class="reports-bar-pct" style="color:${teamBarColor(r)}">${r.rate}%</div>
              </div>`).join('')}
          </div>
          <div style="font-size:.76rem;color:var(--text-muted);margin-top:.75rem;text-align:right">${teamRows.length} team${teamRows.length!==1?'s':''} · ${totalLearners} learner${totalLearners!==1?'s':''}</div>
        ` : '<p style="color:var(--text-muted);font-size:.88rem;padding:.5rem 0">No teams configured yet.</p>'}
      </div>
    </div>

    <div class="reports-section">
      <p class="section-heading">Top Performers</p>
      <div class="reports-top-list">
        ${topPerformers.length ? topPerformers.map((u, i) => {
          const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
          const done = userCompletions(u.id);
          const avg  = userAvgProgress(u.id);
          const teamName = allTeams.find(t=>t.id===u.teamId)?.name || '—';
          const maxDone  = userCompletions(topPerformers[0].id) || 1;
          return `<div class="reports-top-item reports-top-item--clickable" style="animation-delay:${i*.06}s" onclick="openReportsUserPanel('${u.id}')">
            <div class="reports-top-rank">${medals[i]||`#${i+1}`}</div>
            ${avatarHTML(u, 38)}
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.9rem">${esc(u.name)}</div>
              <div style="font-size:.77rem;color:var(--text-muted);margin-bottom:.35rem">${esc(teamName)}</div>
              <div style="background:#e8f5e9;border-radius:99px;height:5px;overflow:hidden">
                <div style="width:${Math.round((done/maxDone)*100)}%;height:100%;background:#2e7d32;border-radius:99px;transition:width .8s ease"></div>
              </div>
            </div>
            <div style="text-align:right;font-size:.82rem;margin-left:.75rem;flex-shrink:0">
              <div style="font-weight:700;color:var(--primary)">${done} done</div>
              <div style="color:var(--text-muted)">${avg}% progress</div>
            </div>
            <span style="color:var(--text-muted);font-size:.8rem;margin-left:.5rem">›</span>
          </div>`;
        }).join('') : '<p style="color:var(--text-muted);font-size:.9rem">No activity yet.</p>'}
      </div>
    </div>

    <div class="reports-section">
      <p class="section-heading">Course Performance</p>
      <div class="reports-table-wrap">
        <table class="reports-table">
          <thead><tr>
            <th>Course</th>
            <th>Assigned</th>
            <th>Completed</th>
            <th>Completion Rate</th>
            <th>Avg Score</th>
          </tr></thead>
          <tbody>
            ${courseRows.length ? courseRows.map(r => {
              const barColor = r.passRate >= 70 ? '#2e7d32' : r.passRate >= 40 ? '#f57c00' : r.passRate > 0 ? '#c62828' : '#ccc';
              return `<tr class="reports-table-row--clickable" onclick="openReportsCoursePanel('${r.c.id}')">
                <td>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    ${r.c.coverUrl ? `<img src="${r.c.coverUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0" />` : `<div style="width:36px;height:36px;border-radius:6px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${CAT_EMOJI[r.c.category]||'📚'}</div>`}
                    <div>
                      <div style="font-weight:600;font-size:.85rem">${esc(r.c.title)}</div>
                      <div style="font-size:.75rem;color:var(--text-muted)">${esc(r.c.category)}</div>
                    </div>
                  </div>
                </td>
                <td style="text-align:center;font-weight:600">${r.assigned}</td>
                <td style="text-align:center;font-weight:600">${r.completed}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:.5rem;min-width:120px">
                    <div style="flex:1;background:#e8f5e9;border-radius:99px;height:7px;overflow:hidden">
                      <div style="width:${r.passRate}%;height:100%;background:${barColor};border-radius:99px;transition:width .7s ease"></div>
                    </div>
                    <span style="font-size:.8rem;font-weight:700;color:${barColor};white-space:nowrap">${r.passRate}%</span>
                  </div>
                </td>
                <td style="text-align:center;color:var(--text-muted);font-size:.85rem">${r.cAvgScore !== null ? r.cAvgScore + '%' : '—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No courses yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`);

  // Animate stat counters
  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    animateCount(el, parseInt(el.dataset.target));
  });
}

function exportReportsCsv() {
  const allLearners = learners();
  const rows = [['Name','Team','Email','Assigned','Completed','Avg Progress %','Avg Score %']];
  allLearners.forEach(u => {
    const teamName = allTeams.find(t=>t.id===u.teamId)?.name || '';
    const assigned  = getUserAssignments(u.id).length;
    const completed = userCompletions(u.id);
    const avgProg   = userAvgProgress(u.id);
    const scores    = getUserAssignments(u.id).map(cid => getProgress(u.id, cid)).filter(p=>p.score!==null&&p.score!==undefined).map(p=>p.score);
    const avgSc     = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : '';
    rows.push([u.name, teamName, u.email, assigned, completed, avgProg, avgSc]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `sprout-learn-report-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ─── Reports Detail Pages ─────────────────────────────────────────────────────
function renderReportsUser(userId) {
  const u = getUser(userId);
  if (!u) { navigate('/admin/reports'); return; }
  setTitle(u.name + ' — Report');
  const teamName = allTeams.find(t => t.id === u.teamId)?.name || '—';
  const assignedCids = getUserAssignments(userId);

  const rows = assignedCids.map(cid => {
    const c = getCourse(cid);
    const p = getProgress(userId, cid);
    return { c, p };
  });

  const completed = rows.filter(r => r.p.completed).length;
  const scores = rows.filter(r => r.p.score !== null && r.p.score !== undefined).map(r => r.p.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null;

  setMain(`
    <div class="page-header fade-up">
      <button class="btn btn-outline btn-sm" onclick="navigate('/admin/reports')">← Back to Reports</button>
    </div>
    <div class="rpt-detail-hero fade-up">
      ${avatarHTML(u, 56)}
      <div>
        <div class="rpt-detail-name">${esc(u.name)}</div>
        <div class="rpt-detail-meta">${esc(teamName)} · ${esc(u.email)}</div>
      </div>
      <div class="rpt-detail-stats">
        <div class="rpt-detail-stat"><span>${assignedCids.length}</span>Assigned</div>
        <div class="rpt-detail-stat"><span>${completed}</span>Completed</div>
        <div class="rpt-detail-stat"><span>${avgScore !== null ? avgScore + '%' : '—'}</span>Avg Score</div>
        <div class="rpt-detail-stat"><span>${userXP(userId)}</span>XP</div>
      </div>
    </div>
    <div class="reports-table-wrap" style="margin-top:1.5rem">
      <table class="reports-table">
        <thead><tr>
          <th>Course</th>
          <th>Status</th>
          <th>Score</th>
          <th>Progress</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(({ c, p }) => {
            if (!c) return '';
            const statusColor = p.completed ? '#2e7d32' : '#f57c00';
            const statusLabel = p.completed ? '✅ Completed' : p.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
            const pct = p.completed ? 100 : Math.min(80, c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:.6rem">
                  ${c.coverUrl ? `<img src="${c.coverUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0"/>` : `<div style="width:36px;height:36px;border-radius:6px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${CAT_EMOJI[c.category]||'📚'}</div>`}
                  <div>
                    <div style="font-weight:600;font-size:.85rem">${esc(c.title)}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${esc(c.category)}</div>
                  </div>
                </div>
              </td>
              <td><span style="font-size:.83rem;font-weight:600;color:${statusColor}">${statusLabel}</span></td>
              <td style="text-align:center;font-weight:700;color:var(--primary)">${p.score !== null && p.score !== undefined ? p.score + '%' : '—'}</td>
              <td style="min-width:120px">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <div style="flex:1;background:#e8f5e9;border-radius:99px;height:7px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${p.completed ? '#2e7d32' : '#4a9e4a'};border-radius:99px"></div>
                  </div>
                  <span style="font-size:.78rem;font-weight:600;color:var(--text-muted)">${pct}%</span>
                </div>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No courses assigned yet.</td></tr>'}
        </tbody>
      </table>
    </div>`);
}

function renderReportsCourse(courseId) {
  const c = getCourse(courseId);
  if (!c) { navigate('/admin/reports'); return; }
  setTitle(c.title + ' — Report');
  const assignedUsers = learners().filter(u => isAssigned(u.id, courseId));
  const completedUsers = assignedUsers.filter(u => getProgress(u.id, courseId).completed);
  const scores = assignedUsers.map(u => getProgress(u.id, courseId)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null;
  const passRate = assignedUsers.length ? Math.round((completedUsers.length / assignedUsers.length) * 100) : 0;
  const barColor = passRate >= 70 ? '#2e7d32' : passRate >= 40 ? '#f57c00' : '#c62828';

  setMain(`
    <div class="page-header fade-up">
      <button class="btn btn-outline btn-sm" onclick="navigate('/admin/reports')">← Back to Reports</button>
    </div>
    <div class="rpt-detail-hero fade-up">
      ${c.coverUrl ? `<img src="${c.coverUrl}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;flex-shrink:0"/>` : `<div style="width:56px;height:56px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">${CAT_EMOJI[c.category]||'📚'}</div>`}
      <div>
        <div class="rpt-detail-name">${esc(c.title)}</div>
        <div class="rpt-detail-meta">${esc(c.category)} · ${contentBadge(c.contentType)}</div>
      </div>
      <div class="rpt-detail-stats">
        <div class="rpt-detail-stat"><span>${assignedUsers.length}</span>Assigned</div>
        <div class="rpt-detail-stat"><span>${completedUsers.length}</span>Completed</div>
        <div class="rpt-detail-stat"><span style="color:${barColor}">${passRate}%</span>Pass Rate</div>
        <div class="rpt-detail-stat"><span>${avgScore !== null ? avgScore + '%' : '—'}</span>Avg Score</div>
      </div>
    </div>
    <div class="reports-table-wrap" style="margin-top:1.5rem">
      <table class="reports-table">
        <thead><tr>
          <th>Person</th>
          <th>Team</th>
          <th>Status</th>
          <th>Score</th>
          <th>Progress</th>
        </tr></thead>
        <tbody>
          ${assignedUsers.length ? assignedUsers.map(u => {
            const p = getProgress(u.id, courseId);
            const teamName = allTeams.find(t => t.id === u.teamId)?.name || '—';
            const statusColor = p.completed ? '#2e7d32' : '#f57c00';
            const statusLabel = p.completed ? '✅ Completed' : p.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
            const pct = p.completed ? 100 : Math.min(80, c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:.6rem">
                  ${avatarHTML(u, 32)}
                  <div style="font-weight:600;font-size:.85rem">${esc(u.name)}</div>
                </div>
              </td>
              <td style="font-size:.83rem;color:var(--text-muted)">${esc(teamName)}</td>
              <td><span style="font-size:.83rem;font-weight:600;color:${statusColor}">${statusLabel}</span></td>
              <td style="text-align:center;font-weight:700;color:var(--primary)">${p.score !== null && p.score !== undefined ? p.score + '%' : '—'}</td>
              <td style="min-width:120px">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <div style="flex:1;background:#e8f5e9;border-radius:99px;height:7px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${p.completed ? '#2e7d32' : '#4a9e4a'};border-radius:99px"></div>
                  </div>
                  <span style="font-size:.78rem;font-weight:600;color:var(--text-muted)">${pct}%</span>
                </div>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No one assigned yet.</td></tr>'}
        </tbody>
      </table>
    </div>`);
}

// ─── Flappy Sprout ────────────────────────────────────────────────────────────
async function loadFlappyScores() {
  try {
    const { data } = await sb.from('flappy_scores')
      .select('user_id, high_score')
      .order('high_score', { ascending: false })
      .limit(10);
    if (data) {
      flappyScores = data.map(r => {
        const u = getUser(r.user_id);
        return { userId: r.user_id, name: u?.name || 'Unknown', color: u?.color || '#ccc', avatarUrl: u?.avatarUrl || null, highScore: r.high_score };
      });
    }
  } catch(e) {}
}

async function saveFlappyScore(score) {
  try {
    const { error } = await sb.from('flappy_scores').upsert(
      { user_id: currentUser.id, high_score: score, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) { console.error('flappy save error:', error); return; }
    await loadFlappyScores();
  } catch(e) { console.error('flappy save exception:', e); }
}

function renderFlappyLeaderboard() {
  const el = document.getElementById('flappy-lb');
  if (!el) return;
  const myId = currentUser?.id;
  if (!flappyScores.length) {
    el.innerHTML = `<div class="flappy-lb-empty">No scores yet — be the first! 🏆</div>`;
    return;
  }
  el.innerHTML = flappyScores.slice(0, 5).map((r, i) => {
    const medals = ['🥇','🥈','🥉'];
    const isMe = r.userId === myId;
    const avatar = r.avatarUrl
      ? `<img src="${r.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"/>`
      : initials(r.name);
    return `<div class="flappy-lb-row${isMe?' flappy-lb-row--me':''}">
      <div class="flappy-lb-rank">${medals[i] || `#${i+1}`}</div>
      <div class="user-avatar" style="background:${r.color};width:28px;height:28px;font-size:.6rem;flex-shrink:0">${avatar}</div>
      <div class="flappy-lb-name">${esc(r.name)}${isMe?'<span class="ld-you-badge" style="margin-left:.3rem">You</span>':''}</div>
      <div class="flappy-lb-score">${r.highScore}</div>
    </div>`;
  }).join('');
}

function destroyFlappy() {
  if (_flappyGame) { _flappyGame.destroy(); _flappyGame = null; }
}

function startFlappyGame() {
  destroyFlappy();
  const myScore = flappyScores.find(r => r.userId === currentUser?.id)?.highScore || 0;
  _flappyGame = new RunnerGame('flappy-canvas', myScore);
}

function setRunnerChar(c) { localStorage.setItem('sprout_char', c); }
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

    const r = this.runner;
    r.vy += 0.52; r.y += r.vy;
    if (r.y >= this.GROUND_Y) { r.y = this.GROUND_Y; r.vy = 0; r.jumping = false; r.jumps = 0; }
    if (!r.jumping) r.leg = (r.leg + 0.22) % (Math.PI * 2);

    this.groundX = (this.groundX - this.speed + 60) % 60;
    this.cloudX  = (this.cloudX  - this.speed * 0.25 + 500) % 500;

    // Obstacles — longer gaps, scale slowly
    this.obsTimer++;
    const gap = Math.max(90, 140 - Math.floor(this.score / 15) * 4);
    if (this.obsTimer >= gap) {
      this.obsTimer = 0;
      const h = 36 + Math.floor(Math.random() * 3) * 22; // 36, 58, or 80
      this.obs.push({ x: this.W + 10, h });
    }

    this.coinTimer++;
    if (this.coinTimer >= 55) {
      this.coinTimer = 0;
      this.coins.push({ x: this.W + 10, y: this.GROUND_Y - 70 - Math.random() * 50 });
    }

    for (const o of this.obs) o.x -= this.speed;
    this.obs = this.obs.filter(o => o.x > -40);
    for (const o of this.obs) { if (this._hitObs(o)) { this._die(); return; } }

    for (const c of this.coins) c.x -= this.speed;
    for (const c of this.coins) {
      if (!c.col && Math.abs(c.x - r.x) < 24 && Math.abs(c.y - (r.y - 36)) < 24) { c.col = true; this.score += 3; }
    }
    this.coins = this.coins.filter(c => c.x > -20 && !c.col);
  }

  _hitObs(o) {
    const r = this.runner;
    const rL = r.x - 13, rR = r.x + 13, rT = r.y - 42, rB = r.y - 4;
    const oL = o.x - 16, oR = o.x + 16, oT = this.GROUND_Y - o.h;
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
    const ctx = this.ctx, W = this.W, H = this.H;
    const sky = ctx.createLinearGradient(0, 0, 0, this.GROUND_Y);
    sky.addColorStop(0, '#b2dfdb'); sky.addColorStop(1, '#e8f5e9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, this.GROUND_Y);

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    const cx = this.cloudX;
    this._cloud(cx % W, 45, 34); this._cloud((cx+200)%W, 26, 22); this._cloud((cx+340)%W, 60, 18);

    for (const o of this.obs) this._drawObs(o);

    for (const c of this.coins) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(c.x, c.y, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(c.x-2, c.y-2, 3, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(0, this.GROUND_Y, W, H - this.GROUND_Y);
    ctx.fillStyle = '#3ED320';  ctx.fillRect(0, this.GROUND_Y, W, 8);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let x = this.groundX; x < W; x += 60) ctx.fillRect(x, this.GROUND_Y + 14, 30, 5);

    this._drawRunner();

    if (this.state !== 'idle') {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px system-ui'; ctx.fillStyle = 'white';
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 4;
      ctx.fillText(this.score, W - 16, 32);
      ctx.shadowBlur = 0;
    }

    if (this.state === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, W, H);
      this._txt('🏃 Sprout Runner', W/2, H/2 - 30, 'bold 20px system-ui', 'white');
      this._txt('Tap / Space to start', W/2, H/2 + 8, '15px system-ui', 'rgba(255,255,255,.85)');
      this._txt('Tap twice = double jump!', W/2, H/2 + 32, '13px system-ui', 'rgba(255,255,255,.6)');
      this._txt(`Best: ${this.best}`, W/2, H/2 + 56, '14px system-ui', '#3ED320');
    }
    if (this.state === 'dead') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
      this._txt('💥 Ouch!', W/2, H/2 - 42, 'bold 22px system-ui', 'white');
      this._txt(`Score: ${this.score}`, W/2, H/2 - 10, '17px system-ui', 'white');
      this._txt(`Best: ${this.best}`, W/2, H/2 + 18, '15px system-ui', '#3ED320');
      this._txt('Tap or Space to retry', W/2, H/2 + 50, '13px system-ui', 'rgba(255,255,255,.8)');
    }
  }

  _drawObs(o) {
    const ctx = this.ctx, x = o.x, y = this.GROUND_Y - o.h, w = 32;
    ctx.fillStyle = '#1B3A1B'; ctx.fillRect(x - w/2, y, w, o.h);
    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(x - w/2, y, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 14; i < o.h - 4; i += 10) ctx.fillRect(x - w/2 + 5, y + i, w - 10, 5);
  }

  _drawRunner() {
    const ctx = this.ctx, r = this.runner;
    const x = r.x, y = r.y;
    const swing = r.jumping ? 0 : Math.sin(r.leg) * 10;
    const char  = getRunnerChar();
    const skin  = '#FDBCB4';

    if (char === 'girl') {
      // Legs (bare skin)
      ctx.fillStyle = skin;
      ctx.fillRect(x - 9 + swing, y - 16, 8, 17);
      ctx.fillRect(x + 1 - swing, y - 16, 8, 17);
      // Skirt
      ctx.fillStyle = '#e91e63';
      ctx.beginPath(); ctx.moveTo(x - 14, y - 22); ctx.lineTo(x + 14, y - 22);
      ctx.lineTo(x + 16, y - 10); ctx.lineTo(x - 16, y - 10); ctx.closePath(); ctx.fill();
      // Top
      ctx.fillStyle = '#c2185b';
      ctx.fillRect(x - 10, y - 40, 20, 19);
      // Arms
      ctx.fillStyle = skin;
      ctx.fillRect(x - 16, y - 38, 6, 12);
      ctx.fillRect(x + 10, y - 38, 6, 12);
      // Head
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(x, y - 52, 13, 0, Math.PI*2); ctx.fill();
      // Hair (long with side strands)
      ctx.fillStyle = '#8b5e3c';
      ctx.beginPath(); ctx.arc(x, y - 62, 13, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - 13, y - 62, 5, 20);
      ctx.fillRect(x + 8,  y - 62, 5, 20);
      ctx.fillRect(x - 13, y - 62, 26, 8);
      // Eyes
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(x - 4, y - 52, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4, y - 52, 2, 0, Math.PI*2); ctx.fill();
    } else {
      // Boy
      // Legs / pants
      ctx.fillStyle = '#37474f';
      ctx.fillRect(x - 9 + swing, y - 16, 8, 17);
      ctx.fillRect(x + 1 - swing, y - 16, 8, 17);
      // Shoes
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x - 10 + swing, y - 4, 10, 5);
      ctx.fillRect(x, y - 4 - swing*0.3, 10, 5);
      // Shirt
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(x - 11, y - 40, 22, 25);
      // Arms
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(x - 17, y - 39, 6, 13);
      ctx.fillRect(x + 11, y - 39, 6, 13);
      ctx.fillStyle = skin;
      ctx.fillRect(x - 17, y - 27, 6, 6);
      ctx.fillRect(x + 11, y - 27, 6, 6);
      // Head
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(x, y - 52, 13, 0, Math.PI*2); ctx.fill();
      // Hair
      ctx.fillStyle = '#4a3728';
      ctx.beginPath(); ctx.arc(x, y - 62, 13, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - 13, y - 63, 26, 8);
      // Eyes
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(x - 4, y - 52, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4, y - 52, 2, 0, Math.PI*2); ctx.fill();
    }
  }

  _cloud(x, y, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2); ctx.arc(x+r*.8, y-r*.3, r*.7, 0, Math.PI*2); ctx.arc(x+r*1.5, y, r*.8, 0, Math.PI*2);
    ctx.fill();
  }

  _txt(text, x, y, font, color) {
    const ctx = this.ctx;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
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
      duckScores = data.map(r => {
        const u = getUser(r.user_id);
        return { userId: r.user_id, name: u?.name || 'Unknown', color: u?.color || '#ccc', avatarUrl: u?.avatarUrl || null, highScore: r.high_score };
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
  } catch(e) { console.error('duck save exception:', e); }
}

function renderDuckLeaderboard() {
  const el = document.getElementById('duck-lb');
  if (!el) return;
  const myId = currentUser?.id;
  if (!duckScores.length) { el.innerHTML = `<div class="flappy-lb-empty">No scores yet — be the first! 🏆</div>`; return; }
  el.innerHTML = duckScores.slice(0, 5).map((r, i) => {
    const medals = ['🥇','🥈','🥉'];
    const isMe = r.userId === myId;
    const avatar = r.avatarUrl
      ? `<img src="${r.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"/>`
      : initials(r.name);
    return `<div class="flappy-lb-row${isMe?' flappy-lb-row--me':''}">
      <div class="flappy-lb-rank">${medals[i] || `#${i+1}`}</div>
      <div class="user-avatar" style="background:${r.color};width:28px;height:28px;font-size:.6rem;flex-shrink:0">${avatar}</div>
      <div class="flappy-lb-name">${esc(r.name)}${isMe?'<span class="ld-you-badge" style="margin-left:.3rem">You</span>':''}</div>
      <div class="flappy-lb-score">${r.highScore}</div>
    </div>`;
  }).join('');
}

function destroyDuck() {
  if (_duckGame) { _duckGame.destroy(); _duckGame = null; }
}

function startDuckHunt() {
  destroyDuck();
  const myScore = duckScores.find(r => r.userId === currentUser?.id)?.highScore || 0;
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
    const r = this.canvas.getBoundingClientRect();
    this.crosshair.x = (e.clientX - r.left) * (this.W / r.width);
    this.crosshair.y = (e.clientY - r.top)  * (this.H / r.height);
  }

  _onTouch(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const t = e.touches[0];
    const x = (t.clientX - r.left) * (this.W / r.width);
    const y = (t.clientY - r.top)  * (this.H / r.height);
    this.crosshair = { x, y };
    if (this.state === 'idle' || this.state === 'done') { this._reset(); this.state = 'playing'; }
    else this._shoot(x, y);
  }

  _onClick(e) {
    const r  = this.canvas.getBoundingClientRect();
    const x  = (e.clientX - r.left) * (this.W / r.width);
    const y  = (e.clientY - r.top)  * (this.H / r.height);
    if (this.state === 'idle' || this.state === 'done') { this._reset(); this.state = 'playing'; return; }
    this._shoot(x, y);
  }

  _shoot(x, y) {
    if (this.state !== 'playing') return;
    let hit = false;
    for (const d of this.ducks) {
      if (d.state !== 'alive') continue;
      if (Math.hypot(x - d.x, y - d.y) < d.r + 8) {
        d.state = 'falling'; d.fallVy = -4;
        this.score += d.pts;
        this.shots.push({ x: d.x, y: d.y - 20, text: `+${d.pts}`, timer: 45 });
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
    if (this.spawnTimer >= interval && this.ducks.filter(d => d.state === 'alive').length < 6) {
      this.spawnTimer = 0;
      this._spawnDuck();
    }

    for (const d of this.ducks) {
      if (d.state === 'alive') {
        d.x += d.vx; d.y += d.vy; d.wing += 0.28;
        if (d.y < 35)         { d.y = 35;         d.vy =  Math.abs(d.vy); }
        if (d.y > this.H-140) { d.y = this.H-140; d.vy = -Math.abs(d.vy); }
        if (d.x < -80 || d.x > this.W + 80) d.state = 'gone';
      } else if (d.state === 'falling') {
        d.fallVy += 0.45; d.y += d.fallVy; d.wing += 0.08;
        if (d.y > this.H) d.state = 'gone';
      }
    }
    this.ducks = this.ducks.filter(d => d.state !== 'gone');
    for (const s of this.shots) { s.timer--; s.y -= 0.6; }
    this.shots = this.shots.filter(s => s.timer > 0);
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
    const ctx = this.ctx, W = this.W, H = this.H;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H - 80);
    sky.addColorStop(0, '#5ba3d9'); sky.addColorStop(1, '#c8e8f8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H - 80);

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    this._cloud(80, 48, 38); this._cloud(260, 28, 26); this._cloud(430, 52, 32); this._cloud(560, 32, 22);

    // Ducks
    for (const d of this.ducks) this._drawDuck(d);

    // Floating score texts
    for (const s of this.shots) {
      ctx.globalAlpha = Math.min(1, s.timer / (s.miss ? 22 : 45));
      ctx.font = `bold ${s.miss ? 15 : 19}px system-ui`;
      ctx.fillStyle = s.miss ? '#ef5350' : '#FFD700';
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
      ctx.fillText(s.text, s.x, s.y);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // Ground / trees
    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(0, H - 80, W, 80);
    ctx.fillStyle = '#3ED320'; ctx.fillRect(0, H - 80, W, 10);
    ctx.fillStyle = '#1B3A1B';
    for (let tx = 30; tx < W; tx += 70) {
      ctx.beginPath(); ctx.arc(tx, H - 84, 22, 0, Math.PI * 2); ctx.fill();
    }

    // HUD
    if (this.state !== 'idle') {
      ctx.font = 'bold 22px system-ui'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
      ctx.fillStyle = this.timeLeft <= 5 ? '#ef5350' : 'white';
      ctx.textAlign = 'left';  ctx.fillText(`⏱ ${this.timeLeft}s`, 14, 32);
      ctx.fillStyle = 'white'; ctx.textAlign = 'right'; ctx.fillText(`${this.score}`, W - 14, 32);
      ctx.shadowBlur = 0;
    }

    // Crosshair
    if (this.state === 'playing') this._drawCrosshair(this.crosshair.x, this.crosshair.y);

    // Overlays
    if (this.state === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
      this._txt('🦆 Duck Hunt', W/2, H/2 - 36, 'bold 24px system-ui', 'white');
      this._txt('Click to start — shoot the ducks!', W/2, H/2 + 4, '15px system-ui', 'rgba(255,255,255,.85)');
      this._txt('Big = 10pts  ·  Small = 25pts  ·  30 seconds', W/2, H/2 + 28, '13px system-ui', 'rgba(255,255,255,.65)');
      this._txt(`Best: ${this.best}`, W/2, H/2 + 56, '14px system-ui', '#FFD700');
    }
    if (this.state === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H);
      this._txt("Time's Up! 🦆", W/2, H/2 - 48, 'bold 22px system-ui', 'white');
      this._txt(`Score: ${this.score}`, W/2, H/2 - 10, '20px system-ui', '#FFD700');
      this._txt(`Best: ${this.best}`, W/2, H/2 + 20, '16px system-ui', '#FFD700');
      this._txt('Click to play again', W/2, H/2 + 56, '13px system-ui', 'rgba(255,255,255,.8)');
    }
  }

  _drawDuck(d) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.state === 'falling') ctx.rotate(Math.sin(d.wing) * 0.6);
    ctx.scale(d.vx > 0 ? 1 : -1, 1);

    const r = d.r;
    // Wing
    ctx.save();
    ctx.translate(-r * 0.2, -r * 0.3);
    ctx.rotate(Math.sin(d.wing) * 0.55);
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Body
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    ctx.fillStyle = d.pts === 25 ? '#006400' : d.color;
    ctx.beginPath(); ctx.arc(r * 0.72, -r * 0.5, r * 0.42, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.moveTo(r * 1.1, -r * 0.5); ctx.lineTo(r * 1.42, -r * 0.35); ctx.lineTo(r * 1.1, -r * 0.2);
    ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(r * 0.82, -r * 0.55, r * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';  ctx.beginPath(); ctx.arc(r * 0.84, -r * 0.55, r * 0.06, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  _drawCrosshair(x, y) {
    const ctx = this.ctx, r = 18;
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r - 6, y); ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y);     ctx.lineTo(x + r + 6, y);
    ctx.moveTo(x, y - r - 6); ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5);     ctx.lineTo(x, y + r + 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,50,50,.9)';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  _cloud(x, y, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.85, y - r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 1.55, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  _txt(text, x, y, font, color) {
    const ctx = this.ctx;
    ctx.font = font; ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
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

// ─── Learner Dashboard ────────────────────────────────────────────────────────
function renderLearnerDashboard() {
  setTitle('Dashboard');
  const uid = currentUser.id;
  const assigned = getUserAssignments(uid);
  const done     = userCompletions(uid);
  const avg      = userAvgProgress(uid);

  const continueList = assigned
    .filter(cid => !getProgress(uid, cid).completed);

  // ── Team performance widget ──────────────────────────────────────────────
  const myTeam = allTeams.find(t => t.id === currentUser.teamId);
  const teamStandings = allTeams.map(team => {
    const members  = learners().filter(u => u.teamId === team.id);
    const tAssigned  = members.reduce((s, u) => s + getUserAssignments(u.id).length, 0);
    const tCompleted = members.reduce((s, u) => s + userCompletions(u.id), 0);
    const rate = tAssigned ? Math.round((tCompleted / tAssigned) * 100) : 0;
    const scores = members.flatMap(u =>
      getUserAssignments(u.id).map(cid => getProgress(u.id, cid)).filter(p => p.score !== null && p.score !== undefined).map(p => p.score)
    );
    const avgSc = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    return { team, members: members.length, tAssigned, tCompleted, rate, avgSc };
  }).sort((a,b) => b.rate - a.rate);

  const myTeamData  = myTeam ? teamStandings.find(r => r.team.id === myTeam.id) : null;
  const myTeamRank  = myTeam ? teamStandings.findIndex(r => r.team.id === myTeam.id) + 1 : null;
  const maxRate     = Math.max(...teamStandings.map(r => r.rate), 1);
  const rankSuffix  = n => ['','st','nd','rd'][n] || 'th';

  const teamWidget = myTeamData ? `
    <div class="ld-team-card">
      <div class="ld-team-header">
        <div>
          <div class="ld-team-name">${esc(myTeam.name)}</div>
          <div class="ld-team-sub">${myTeamRank}${rankSuffix(myTeamRank)} place &nbsp;·&nbsp; ${myTeamData.members} member${myTeamData.members!==1?'s':''}</div>
        </div>
        <div class="ld-team-stats">
          <div class="ld-team-stat"><span>${myTeamData.rate}%</span>Completion</div>
          <div class="ld-team-stat"><span>${myTeamData.avgSc !== null ? myTeamData.avgSc+'%' : '—'}</span>Avg Score</div>
          <div class="ld-team-stat"><span>${myTeamData.tCompleted}</span>Done</div>
        </div>
      </div>
      <div class="ld-team-standings">
        ${teamStandings.map((r, i) => {
          const isMe = myTeam && r.team.id === myTeam.id;
          const bar  = maxRate > 0 ? Math.round((r.rate / maxRate) * 100) : 0;
          const medals = ['🥇','🥈','🥉'];
          return `<div class="ld-team-row${isMe?' ld-team-row--me':''}">
            <div class="ld-team-row-rank">${medals[i]||`#${i+1}`}</div>
            <div class="ld-team-row-name">${esc(r.team.name)}${isMe?'<span class="ld-you-badge">You</span>':''}</div>
            <div class="ld-team-bar-wrap">
              <div class="ld-team-bar-fill" style="width:${bar}%;background:${isMe?'var(--accent-dark)':'#a8d5a8'}"></div>
            </div>
            <div class="ld-team-row-rate">${r.rate}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  setMain(`
    <div class="page-header fade-up">
      <h1>Welcome, ${esc(currentUser.name.split(' ')[0])} 👋</h1>
      <p>${userLevel(uid).icon} ${userLevel(uid).label} &nbsp;·&nbsp; ${userXP(uid)} XP${userNextLevel(uid) ? ` &nbsp;·&nbsp; ${userNextLevel(uid).xpNeeded} XP to ${userNextLevel(uid).label}` : ' &nbsp;·&nbsp; <strong style="color:var(--accent)">Max Level!</strong>'}</p>
    </div>
    ${userBadges(uid).length ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">${userBadges(uid).map(b=>`<span title="${b.desc}" style="background:#e8f5e9;color:#1B3A1B;padding:.25rem .65rem;border-radius:20px;font-size:.8rem;font-weight:700;cursor:default">${b.icon} ${b.label}</span>`).join('')}</div>` : ''}
    <div class="ld-top-row">
      <div class="ld-stat-pills">
        <div class="ld-stat-pill"><span>${assigned.length}</span>Assigned</div>
        <div class="ld-stat-pill"><span>${done}</span>Completed</div>
        <div class="ld-stat-pill"><span>${avg}%</span>Avg Progress</div>
      </div>
      ${teamWidget}
    </div>
    <p class="section-heading">Continue Learning</p>
    ${continueList.length ? `
      <div class="cl-grid">
        ${continueList.map((cid, i) => {
          const c = getCourse(cid); if (!c) return '';
          const p = getProgress(uid, cid);
          const pct = Math.min(80, c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
          const cover = c.coverUrl
            ? `<img src="${c.coverUrl}" alt="" />`
            : `<div class="cl-cover-placeholder">
                <img src="assets/logos/logo-icon-green.svg" style="width:34px;height:34px;opacity:.9" alt="" />
                <span style="font-size:.72rem;font-weight:700;color:rgba(255,255,255,.85);text-align:center;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:90%">${esc(c.title)}</span>
              </div>`;
          return `<a href="#/course/${c.id}" class="cl-card" style="animation-delay:${i*0.07}s">
            <div class="cl-card-cover">
              ${cover}
              ${pct > 0 ? `<span class="cl-pct">${pct}%</span>` : ''}
              <div class="cl-progress-track"><div class="cl-progress-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="cl-card-body">
              <div class="cl-card-title">${esc(c.title)}</div>
              <div class="cl-card-meta">${CAT_EMOJI[c.category]||'📚'} ${esc(c.category)}</div>
              <div class="cl-card-cta">${p.currentSlide > 0 ? '▶ Continue' : '▶ Start'}</div>
            </div>
          </a>`;
        }).join('')}
      </div>` : `
      <div class="empty-state" style="padding:2rem">
        <span class="empty-icon">🎉</span>
        <h2>${done > 0 ? 'All caught up!' : 'No courses assigned yet'}</h2>
        <p>${done > 0 ? 'You\'ve completed all your assigned courses.' : 'Ask your admin to assign courses to you.'}</p>
        <a href="#/learner/library" class="btn btn-primary" style="margin-top:1rem">Browse Library</a>
      </div>`}
    ${(() => {
      const myPaths = learningPaths.filter(p => p.courseIds.some(cid => isAssigned(uid, cid)));
      if (!myPaths.length) return '';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
          <p class="section-heading" style="margin:0">My Learning Paths</p>
          <a href="#/learner/paths" class="btn btn-outline btn-sm">View All →</a>
        </div>
        <div class="ld-paths-list">
          ${myPaths.map(path => {
            const assigned = path.courseIds.filter(cid => isAssigned(uid, cid));
            const completed = assigned.filter(cid => getProgress(uid, cid).completed).length;
            const total = assigned.length;
            const pct = total ? Math.round((completed / total) * 100) : 0;
            const allDone = completed === total && total > 0;
            return `
              <a href="#/learner/paths" class="ld-path-row">
                <div class="ld-path-icon">${allDone ? '✅' : '🛣️'}</div>
                <div class="ld-path-info">
                  <div class="ld-path-title">${esc(path.title)}</div>
                  <div class="ld-path-bar-wrap">
                    <div class="ld-path-bar-fill" style="width:${pct}%"></div>
                  </div>
                </div>
                <div class="ld-path-pct">${completed}/${total}</div>
              </a>`;
          }).join('')}
        </div>`;
    })()}
    <p class="section-heading">Completed Courses</p>
    ${done > 0 ? `<div class="completed-grid">
      ${assigned.filter(cid => getProgress(uid, cid).completed).map((cid, i) => {
        const c = getCourse(cid); if (!c) return '';
        const cover = c.coverUrl
          ? `<img src="${c.coverUrl}" alt="" />`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#1B3A1B 0%,#2d6a2d 100%);display:flex;align-items:center;justify-content:center">
              <img src="assets/logos/logo-icon-green.svg" style="width:24px;height:24px;opacity:.8" alt="" />
            </div>`;
        return `<div class="completed-card" style="animation-delay:${i*0.05}s">
          <div class="completed-card-cover">
            ${cover}
            <span class="completed-done-badge">✓ Done</span>
          </div>
          <div class="completed-card-body">
            <div class="completed-card-title">${esc(c.title)}</div>
            <div class="completed-card-actions">
              <a href="#/course/${c.id}" class="btn btn-outline btn-sm">Review</a>
              <button class="btn btn-outline btn-sm" onclick="event.preventDefault();showCertificate('${c.id}')">🏆</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>` : `<p style="color:var(--text-muted);font-size:.88rem">No completions yet.</p>`}
    ${(siteSettings.activeGame || 'sprout_runner') === 'duck_hunt' ? `
    <p class="section-heading">🦆 Duck Hunt</p>
    <div class="flappy-card">
      <canvas id="duck-canvas" width="600" height="420" class="flappy-canvas" style="cursor:none"></canvas>
      <div class="flappy-side">
        <div class="flappy-lb-header">🏆 Top Scores</div>
        <div id="duck-lb" class="flappy-lb"></div>
        <div class="flappy-hint">Click ducks to shoot &nbsp;·&nbsp; 30 seconds<br>Big duck = 10pts &nbsp;·&nbsp; Small duck = 25pts</div>
      </div>
    </div>` : `
    <p class="section-heading">🏃 Sprout Runner</p>
    <div class="flappy-card">
      <canvas id="flappy-canvas" width="600" height="420" class="flappy-canvas"></canvas>
      <div class="flappy-side">
        <div class="flappy-lb-header">🏆 Top Scores</div>
        <div id="flappy-lb" class="flappy-lb"></div>
        <div class="flappy-char-picker">
          <span style="font-size:.75rem;color:var(--text-muted);font-weight:600">Play as:</span>
          <button class="char-btn ${getRunnerChar()==='boy'?'char-btn--active':''}" onclick="setRunnerChar('boy');destroyFlappy();requestAnimationFrame(()=>startFlappyGame())">👦 Boy</button>
          <button class="char-btn ${getRunnerChar()==='girl'?'char-btn--active':''}" onclick="setRunnerChar('girl');destroyFlappy();requestAnimationFrame(()=>startFlappyGame())">👧 Girl</button>
        </div>
        <div class="flappy-hint">Tap / <kbd>Space</kbd> to jump &nbsp;·&nbsp; Tap twice = double jump</div>
      </div>
    </div>`}
    `);

  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    animateCount(el, parseInt(el.dataset.target));
  });

  // Start active game + render leaderboard
  if ((siteSettings.activeGame || 'sprout_runner') === 'duck_hunt') {
    renderDuckLeaderboard();
    requestAnimationFrame(() => startDuckHunt());
  } else {
    renderFlappyLeaderboard();
    requestAnimationFrame(() => startFlappyGame());
  }
}

// ─── Learner Library ──────────────────────────────────────────────────────────
function renderLearnerLibrary(filterQ = '', filterCat = '', filterType = '') {
  setTitle('Course Library');
  const uid = currentUser.id;
  let filtered = courses.filter(c => {
    const matchQ    = !filterQ    || c.title.toLowerCase().includes(filterQ.toLowerCase()) || c.category.toLowerCase().includes(filterQ.toLowerCase());
    const matchCat  = !filterCat  || c.category === filterCat;
    const matchType = !filterType || c.type === filterType;
    return matchQ && matchCat && matchType;
  });

  const gridHTML = filtered.length ? filtered.map((c, i) => learnerCourseCard(c, uid, i)).join('') : '<div class="empty-state"><span class="empty-icon">📭</span><h2>No courses found</h2><p>Try different filters.</p></div>';

  // Already on this page — only swap the grid to avoid re-animating everything
  const existingGrid = document.querySelector('#main-content .course-grid');
  if (existingGrid) {
    existingGrid.innerHTML = gridHTML;
    const inp = document.querySelector('#main-content .toolbar-search input');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    return;
  }

  setMain(`
    <div class="page-header"><h1>Course Library</h1><p>Explore all available training content</p></div>
    <div class="toolbar">
      <div class="toolbar-search">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input placeholder="Search courses…" value="${esc(filterQ)}" oninput="renderLearnerLibrary(this.value,document.getElementById('lib-cat')?.value,document.getElementById('lib-type')?.value)" />
      </div>
      <select class="toolbar-select" id="lib-cat" onchange="renderLearnerLibrary(document.querySelector('.toolbar-search input')?.value,this.value,document.getElementById('lib-type')?.value)">
        <option value="">All Categories</option>
        ${CATEGORIES.map(c => `<option value="${esc(c)}" ${filterCat===c?'selected':''}>${esc(c)}</option>`).join('')}
      </select>
      <select class="toolbar-select" id="lib-type" onchange="renderLearnerLibrary(document.querySelector('.toolbar-search input')?.value,document.getElementById('lib-cat')?.value,this.value)">
        <option value="">Free &amp; Paid</option>
        <option value="Free" ${filterType==='Free'?'selected':''}>Free</option>
        <option value="Paid" ${filterType==='Paid'?'selected':''}>Paid</option>
      </select>
    </div>
    <div class="course-grid">${gridHTML}</div>`);
}

function learnerCourseCard(c, uid, i = 0) {
  const p      = getProgress(uid, c.id);
  const pct    = p.completed ? 100 : Math.min(80, c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0);
  const qs     = questions[c.id];
  const assigned = isAssigned(uid, c.id);
  const label  = p.completed ? 'Review' : p.currentSlide > 0 ? 'Continue' : 'Start';
  return `<div class="course-card" style="animation-delay:${i*0.04}s">
    ${courseCoverHTML(c)}
    <div class="course-card-body">
      <div class="course-card-badges">
        ${typeBadge(c.type)} ${contentBadge(c.contentType)}
        ${qs ? `<span class="badge badge-q">${qs.length} Q</span>` : ''}
        ${p.completed ? '<span class="badge badge-done">✓ Done</span>' : ''}
      </div>
      <div class="course-card-title">${esc(c.title)}</div>
      <div class="course-card-desc">${esc(c.description)}</div>
      <div class="course-card-meta">${CAT_EMOJI[c.category]||'📚'} ${esc(c.category)}</div>
      ${assigned && c.totalPages ? `<div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>` : ''}
      <div class="course-card-actions">
        ${assigned ? `<a href="#/course/${c.id}" class="btn btn-primary btn-sm">${label}</a>` : `<span class="btn btn-outline btn-sm" style="opacity:.6;cursor:default">Not Assigned</span>`}
        ${p.completed ? `<button class="btn btn-outline btn-sm" onclick="showCertificate('${c.id}')">🏆 Cert</button>` : ''}
      </div>
    </div>
  </div>`;
}

// ─── My Learning ──────────────────────────────────────────────────────────────
function renderLearnerSettings() {
  setTitle('Settings');
  const uid = currentUser.id;
  const badges = userBadges(uid);
  setMain(`
    <div class="page-header fade-up"><h1>Settings</h1><p>Manage your profile</p></div>
    <div class="settings-card">
      <p class="section-heading" style="margin-top:0">Profile Photo</p>
      <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.75rem">
        <div class="learner-avatar-upload" id="lav-wrap" onclick="document.getElementById('lav-input').click()" title="Change photo">
          ${currentUser.avatarUrl
            ? `<img src="${currentUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" />`
            : `<span style="font-size:1.6rem;font-weight:700;color:white">${initials(currentUser.name)}</span>`}
          <div class="learner-avatar-overlay">📷</div>
        </div>
        <input type="file" id="lav-input" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)" />
        <div>
          <div style="font-weight:700">${esc(currentUser.name)}</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.5rem">${esc(currentUser.email)}</div>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('lav-input').click()">Change Photo</button>
        </div>
      </div>
      <p class="section-heading" style="margin-top:0">Profile Info</p>
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input id="ls-name" class="form-input" value="${esc(currentUser.name)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" value="${esc(currentUser.email)}" disabled style="opacity:.55;cursor:not-allowed" />
      </div>
      <div class="form-group">
        <label class="form-label">Team</label>
        <select id="ls-team" class="form-select">
          ${allTeams.map(t => `<option value="${t.id}" ${currentUser.teamId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveLearnerSettings()">Save Changes</button>
    </div>
    ${badges.length ? `
    <p class="section-heading">My Badges</p>
    <div style="display:flex;flex-wrap:wrap;gap:.75rem">
      ${badges.map(b => `
        <div style="background:var(--card-bg);border:1.5px solid var(--border);border-radius:var(--radius);padding:.85rem 1.1rem;display:flex;align-items:center;gap:.75rem;min-width:190px;animation:fadeUp .3s ease both">
          <span style="font-size:1.75rem">${b.icon}</span>
          <div>
            <div style="font-weight:700;font-size:.88rem">${esc(b.label)}</div>
            <div style="font-size:.76rem;color:var(--text-muted)">${esc(b.desc)}</div>
          </div>
        </div>`).join('')}
    </div>` : ''}
  `);
}

async function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const size = Math.min(img.width, img.height);
    const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
    ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
    canvas.toBlob(async blob => {
      showLoader('Uploading', 'Saving your photo…');
      const path = `avatars/${currentUser.id}`;
      const { error: upErr } = await sb.storage.from('course-files').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) { hideLoader(); toast('Upload failed: ' + upErr.message, 'error'); return; }
      const { data: { publicUrl } } = sb.storage.from('course-files').getPublicUrl(path);
      const { error: dbErr } = await sb.from('users').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
      if (dbErr) { hideLoader(); toast('Save failed: ' + dbErr.message, 'error'); return; }
      currentUser.avatarUrl = publicUrl;
      const u = getUser(currentUser.id);
      if (u) u.avatarUrl = publicUrl;
      hideLoader();
      toast('Profile photo updated!');
      renderLearnerSettings();
    }, 'image/jpeg', 0.88);
  };
  img.src = URL.createObjectURL(file);
}

async function saveLearnerSettings() {
  const name   = document.getElementById('ls-name')?.value.trim();
  const teamId = document.getElementById('ls-team')?.value || null;
  if (!name) { toast('Name is required', 'error'); return; }
  const { error } = await sb.from('users').update({ name, team_id: teamId }).eq('id', currentUser.id);
  if (error) { toast('Save failed: ' + error.message, 'error'); return; }
  currentUser.name = name;
  currentUser.teamId = teamId;
  const u = getUser(currentUser.id);
  if (u) { u.name = name; u.teamId = teamId; }
  toast('Profile saved!');
  renderLayout();
  navigate('/learner/settings');
}

// ─── Course Viewer ────────────────────────────────────────────────────────────
async function renderCourseViewer(courseId) {
  viewerCourseId = courseId;
  const course = getCourse(courseId);
  if (!course) { navigate(currentUser.isAdmin ? '/admin/courses' : '/learner/library'); return; }

  const uid = currentUser.id;
  const p   = getProgress(uid, courseId);
  viewerPage = Math.max(1, p.currentSlide || 1);

  document.getElementById('app').innerHTML = `
    <div class="viewer-page" id="viewer-page">
      <div class="viewer-topbar">
        <button class="viewer-back" onclick="leaveViewer()">← Back</button>
        <div class="viewer-title">${esc(course.title)}</div>
        ${course.totalPages ? `
          <div class="viewer-progress-wrap">
            <div class="viewer-progress-bar" id="viewer-prog-bar" style="width:${Math.round((viewerPage/course.totalPages)*100)}%"></div>
          </div>
          <span class="viewer-progress-label" id="viewer-prog-label">${viewerPage}/${course.totalPages}</span>
        ` : ''}
        ${questions[courseId] ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')" style="margin-left:.5rem">📝 Assessment</button>` : ''}
      </div>
      <div class="viewer-body" id="viewer-body">
        ${viewerBodyHTML(course)}
      </div>
      ${course.contentType === 'pdf' ? `
        <div class="viewer-bottombar" id="viewer-bottombar">
          <button class="viewer-btn" id="viewer-prev" onclick="pdfPrevPage()" ${viewerPage<=1?'disabled':''}>← Prev</button>
          <div class="viewer-dots" id="viewer-dots"></div>
          <span class="viewer-slide-counter" id="viewer-counter">Slide ${viewerPage} of ${course.totalPages}</span>
          <button class="viewer-btn" id="viewer-next" onclick="pdfNextPage()">Next →</button>
        </div>` : course.contentType === 'scorm' ? `
        <div class="viewer-bottombar" style="justify-content:center;gap:1rem">
          <span style="font-size:.82rem;color:var(--text-muted)">Progress tracked automatically</span>
          ${questions[courseId] ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')">📝 Take Assessment</button>` : ''}
        </div>` : course.contentType === 'html' ? `
        <div class="viewer-bottombar" style="justify-content:center;gap:1rem">
          ${getProgress(currentUser.id, courseId).completed
            ? `<span style="font-size:.82rem;color:var(--accent-dark);font-weight:700">✅ Completed</span>`
            : `<button class="viewer-btn accent" id="html-complete-btn" onclick="markHtmlComplete('${courseId}')">✓ Mark as Complete</button>`}
          ${questions[courseId] ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')">📝 Take Assessment</button>` : ''}
        </div>` : `
        <div class="viewer-bottombar" style="justify-content:center">
          ${questions[courseId] ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')">Take Assessment →</button>` : ''}
        </div>`}
    </div>`;

  if (course.contentType === 'pdf' && course.pdfDataUrl) {
    // Attach arrow key navigation
    _pdfKeyHandler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pdfNextPage(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pdfPrevPage(); }
    };
    document.addEventListener('keydown', _pdfKeyHandler);
    await initPdfViewer(course);
  }
}

function markScormComplete(courseId) {
  setProgress(currentUser.id, courseId, { completed: true, currentSlide: 1 });
  toast('✅ Course marked as complete!');
  const btn = document.querySelector('.viewer-bottombar .viewer-btn.accent');
  if (btn) { btn.textContent = '✅ Completed'; btn.disabled = true; }
}

function markHtmlComplete(courseId) {
  setProgress(currentUser.id, courseId, { completed: true, currentSlide: 1 });
  toast('✅ Course marked as complete!');
  const btn = document.getElementById('html-complete-btn');
  if (btn) { btn.outerHTML = `<span style="font-size:.82rem;color:var(--accent-dark);font-weight:700">✅ Completed</span>`; }
}

function viewerBodyHTML(course) {
  if (course.contentType === 'pdf') {
    return `<canvas id="pdf-canvas"></canvas>`;
  } else if (course.contentType === 'youtube') {
    return `<div class="viewer-youtube"><iframe src="https://www.youtube.com/embed/${esc(course.youtubeId)}?autoplay=0&rel=0" allowfullscreen></iframe></div>`;
  } else if (course.contentType === 'slides') {
    const embedId = (course.slidesUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || '';
    return `<div class="viewer-youtube"><iframe src="https://docs.google.com/presentation/d/${esc(embedId)}/embed?start=false&loop=false&delayms=3000" allowfullscreen></iframe></div>`;
  } else if (course.contentType === 'scorm') {
    return `<div class="viewer-youtube"><iframe id="scorm-iframe" src="${esc(course.scormUrl)}" allowfullscreen allow="fullscreen; autoplay" style="width:100%;height:100%;border:none"></iframe></div>`;
  } else if (course.contentType === 'html') {
    return `<div class="viewer-youtube"><iframe src="${esc(course.htmlUrl)}" allowfullscreen style="width:100%;height:100%;border:none"></iframe></div>`;
  } else {
    return `<div class="viewer-no-content">
      <span class="big-icon">📚</span>
      <h2>Content Coming Soon</h2>
      <p style="margin-top:.5rem">This course doesn't have content yet.</p>
    </div>`;
  }
}

async function initPdfViewer(course) {
  try {
    viewerPdfDoc = await pdfjsLib.getDocument(course.pdfDataUrl).promise;
    updatePdfDots(course.totalPages);
    await renderPdfPage(viewerPage);
  } catch {
    document.getElementById('viewer-body').innerHTML = `<div class="viewer-no-content"><span class="big-icon">⚠️</span><h2>Could not load PDF</h2></div>`;
  }
}

async function renderPdfPage(pageNum) {
  if (!viewerPdfDoc) return;
  const canvas = document.getElementById('pdf-canvas');
  if (!canvas) return;
  canvas.classList.add('fading');
  await new Promise(r => setTimeout(r, 120));
  const page     = await viewerPdfDoc.getPage(pageNum);
  const scale    = Math.min(
    (window.innerWidth - 48) / page.getViewport({ scale: 1 }).width,
    (window.innerHeight - 180) / page.getViewport({ scale: 1 }).height,
    2
  );
  const viewport = page.getViewport({ scale });
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  canvas.classList.remove('fading');

  // Update progress bar + counter
  const course = getCourse(viewerCourseId);
  if (course) {
    const pct = Math.round((pageNum / course.totalPages) * 100);
    document.getElementById('viewer-prog-bar')?.style  && (document.getElementById('viewer-prog-bar').style.width = pct + '%');
    const lbl = document.getElementById('viewer-prog-label');
    if (lbl) lbl.textContent = `${pageNum}/${course.totalPages}`;
    const counter = document.getElementById('viewer-counter');
    if (counter) counter.textContent = `Slide ${pageNum} of ${course.totalPages}`;
  }
  updatePdfDots(course?.totalPages || 0);
  updatePdfNavBtns(pageNum, course?.totalPages || 1);
  setProgress(currentUser.id, viewerCourseId, { currentSlide: pageNum });
}

function updatePdfDots(total) {
  const dotsEl = document.getElementById('viewer-dots');
  if (!dotsEl || total > 30) return;
  dotsEl.innerHTML = Array.from({ length: total }, (_, i) =>
    `<button class="viewer-dot ${i+1===viewerPage?'active':''}" onclick="pdfGoTo(${i+1})"></button>`
  ).join('');
}

function updatePdfNavBtns(page, total) {
  const prev = document.getElementById('viewer-prev');
  const next = document.getElementById('viewer-next');
  if (prev) prev.disabled = page <= 1;
  if (next) {
    if (page >= total) {
      next.textContent = questions[viewerCourseId] ? 'Take Assessment →' : 'Finish';
      next.classList.add('accent');
      next.onclick = () => {
        setProgress(currentUser.id, viewerCourseId, { currentSlide: total });
        questions[viewerCourseId] ? navigate(`/assessment/${viewerCourseId}`) : leaveViewer();
      };
    } else {
      next.textContent = 'Next →';
      next.classList.remove('accent');
      next.onclick = pdfNextPage;
    }
  }
}

async function pdfNextPage() {
  const course = getCourse(viewerCourseId);
  if (!course || viewerPage >= course.totalPages) return;
  viewerPage++;
  await renderPdfPage(viewerPage);
}

async function pdfPrevPage() {
  if (viewerPage <= 1) return;
  viewerPage--;
  await renderPdfPage(viewerPage);
}

async function pdfGoTo(n) {
  viewerPage = n;
  await renderPdfPage(viewerPage);
}

function setViewerProgress(uid, courseId, update) {
  setProgress(uid, courseId, update);
}

function leaveViewer() {
  if (_pdfKeyHandler) { document.removeEventListener('keydown', _pdfKeyHandler); _pdfKeyHandler = null; }
  navigate(currentUser.isAdmin ? '/admin/courses' : '/learner/my-learning');
}

// ─── Assessment ───────────────────────────────────────────────────────────────
function renderAssessmentPage(courseId) {
  assessmentCourseId = courseId;
  assessmentAnswers  = new Array((questions[courseId] || FALLBACK_QUESTIONS).length).fill(undefined);
  assessmentCurrentQ = 0;
  showAssessmentQuestion();
}

function showAssessmentQuestion() {
  const courseId = assessmentCourseId;
  const course   = getCourse(courseId);
  const qs       = questions[courseId] || FALLBACK_QUESTIONS;
  const i        = assessmentCurrentQ;
  const q        = qs[i];
  const total    = qs.length;
  const answered = assessmentAnswers[i] !== undefined;
  const isLast   = i === total - 1;
  const LETTERS  = ['A','B','C','D'];

  const optionsHTML = q.type === 'mc'
    ? q.options.map((opt, j) => `
        <button class="assess-opt${assessmentAnswers[i] === j ? ' assess-opt--selected' : ''}"
          onclick="selectAssessmentAnswer(${j})">
          <span class="assess-opt-letter">${LETTERS[j]}</span>
          <span class="assess-opt-text">${esc(opt)}</span>
        </button>`).join('')
    : `<button class="assess-opt assess-opt--tf${assessmentAnswers[i] === true ? ' assess-opt--selected' : ''}"
        onclick="selectAssessmentAnswer('true')">
        <span class="assess-opt-tf-icon">✓</span><span>True</span>
      </button>
      <button class="assess-opt assess-opt--tf${assessmentAnswers[i] === false ? ' assess-opt--selected' : ''}"
        onclick="selectAssessmentAnswer('false')">
        <span class="assess-opt-tf-icon">✗</span><span>False</span>
      </button>`;

  const dots = Array.from({ length: total }, (_, k) => {
    const cls = k === i ? 'assess-dot assess-dot--current'
              : assessmentAnswers[k] !== undefined ? 'assess-dot assess-dot--done'
              : 'assess-dot';
    return `<span class="${cls}"></span>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="assess-shell">
      <div class="assess-topbar">
        <button class="btn btn-outline btn-sm" onclick="navigate('/course/${courseId}')">← Back</button>
        <div class="assess-meta">
          <span class="assess-course-name">${esc(course?.title || '')}</span>
          <span class="assess-qcount">${i + 1} of ${total}</span>
        </div>
        <div class="assess-prog-track"><div class="assess-prog-fill" style="width:${Math.round(((i+1)/total)*100)}%"></div></div>
      </div>

      <div class="assess-body">
        <div class="assess-q-type-label">${q.type === 'mc' ? 'Multiple Choice' : 'True / False'}</div>
        <div class="assess-q-text">${esc(q.question)}</div>
        <div class="assess-options${q.type === 'tf' ? ' assess-options--tf' : ''}">
          ${optionsHTML}
        </div>
      </div>

      <div class="assess-nav">
        <button class="btn btn-outline btn-sm assess-nav-prev"
          onclick="${i > 0 ? 'assessmentPrev()' : `navigate('/course/${courseId}')`}">
          ← ${i > 0 ? 'Previous' : 'Exit'}
        </button>
        <div class="assess-dots">${dots}</div>
        ${answered
          ? `<button class="btn ${isLast ? 'btn-accent' : 'btn-primary'} assess-nav-next"
               onclick="${isLast ? `submitAssessment('${courseId}')` : 'assessmentNext()'}">
               ${isLast ? '🏁 Submit' : 'Next →'}
             </button>`
          : `<button class="btn btn-outline assess-nav-next" style="opacity:.4;pointer-events:none">Next →</button>`
        }
      </div>
    </div>`;
}

function selectAssessmentAnswer(val) {
  const qs = questions[assessmentCourseId] || FALLBACK_QUESTIONS;
  const q  = qs[assessmentCurrentQ];
  assessmentAnswers[assessmentCurrentQ] = q.type === 'mc' ? parseInt(val) : (val === 'true' || val === true);
  showAssessmentQuestion();
}

function assessmentNext() {
  const total = (questions[assessmentCourseId] || FALLBACK_QUESTIONS).length;
  if (assessmentCurrentQ < total - 1) fadeToQuestion(assessmentCurrentQ + 1);
}

function assessmentPrev() {
  if (assessmentCurrentQ > 0) fadeToQuestion(assessmentCurrentQ - 1);
}

function fadeToQuestion(idx) {
  const body = document.querySelector('.assess-body');
  if (body) {
    body.classList.add('fading');
    setTimeout(() => { assessmentCurrentQ = idx; showAssessmentQuestion(); }, 150);
  } else {
    assessmentCurrentQ = idx; showAssessmentQuestion();
  }
}

function submitAssessment(courseId) {
  const qs = questions[courseId] || FALLBACK_QUESTIONS;
  let correct = 0;
  qs.forEach((q, i) => {
    const val = assessmentAnswers[i];
    if (q.type === 'mc') { if (val === q.correct) correct++; }
    else                 { if (val === q.correct) correct++; }
  });

  const score  = Math.round((correct / qs.length) * 100);
  const passed = score >= 80;
  setProgress(currentUser.id, courseId, { completed: passed, score, passed });
  if (passed) {
    const course = getCourse(courseId);
    createNotif(null, 'course_completed', `✅ ${currentUser.name} completed ${course?.title || 'a course'}`, `Score: ${score}%`);
  }

  const course = getCourse(courseId);
  document.getElementById('app').innerHTML = `
    <div class="assess-shell assess-shell--result">
      <div class="assess-result-card">
        <div class="assess-score-ring ${passed ? 'assess-score-ring--pass' : 'assess-score-ring--fail'}">
          <span class="assess-score-num">${score}<span style="font-size:1.2rem">%</span></span>
          <span class="assess-score-label">${passed ? 'Passed!' : 'Not yet'}</span>
        </div>
        <h2 style="margin:.5rem 0 .25rem">${passed ? '🎉 Great work!' : '😔 Keep going!'}</h2>
        <p style="color:var(--text-muted);font-size:.95rem">${correct} out of ${qs.length} correct · Pass score is 80%</p>
        <div class="assess-result-breakdown">
          ${qs.map((q, i) => {
            const val = assessmentAnswers[i];
            const ok  = q.type === 'mc' ? val === q.correct : val === q.correct;
            return `<div class="assess-breakdown-row ${ok ? 'ok' : 'wrong'}">
              <span class="assess-breakdown-icon">${ok ? '✓' : '✗'}</span>
              <span class="assess-breakdown-q">${esc(q.question)}</span>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem">
          ${passed ? `<button class="btn btn-accent" onclick="showCertificate('${courseId}')">🏆 Certificate</button>` : ''}
          <button class="btn btn-outline" onclick="navigate('/course/${courseId}')">Review Course</button>
          ${!passed ? `<button class="btn btn-primary" onclick="retakeAssessment('${courseId}')">Try Again</button>` : ''}
          <button class="btn btn-outline" onclick="navigate('${currentUser.isAdmin && !adminViewingAsLearner ? '/admin/courses' : '/learner/my-learning'}')">Back</button>
        </div>
      </div>
    </div>`;

  if (passed) { confetti(); setTimeout(() => showCertificate(courseId), 800); }
}

function retakeAssessment(courseId) {
  setProgress(currentUser.id, courseId, { completed: false, score: null, passed: false });
  renderAssessmentPage(courseId);
}

// ─── Certificate ──────────────────────────────────────────────────────────────
function showCertificate(courseId) {
  const course = getCourse(courseId);
  const p      = getProgress(currentUser.id, courseId);
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="cert-header" style="position:relative">
        <button class="modal-close" onclick="closeModal()">✕</button>
        <img src="assets/logos/logo-icon-white.svg" alt="Sprout" class="cert-logo" />
        <h2>Certificate of Completion</h2>
        <p>Sprout Learn · Sprout Solutions</p>
      </div>
      <div class="cert-body">
        <div class="cert-subtitle">This certifies that</div>
        <div class="cert-learner">${esc(currentUser.name)}</div>
        <div class="cert-course-label">has successfully completed</div>
        <div class="cert-course">${esc(course?.title || '')}</div>
        <div class="cert-score">with a score of <strong>${p.score ?? 100}%</strong></div>
        <div class="cert-sigs">
          <div class="cert-sig">
            <div style="height:30px"></div>
            <div class="cert-sig-line">Date Issued<br><strong>${formatDate()}</strong></div>
          </div>
          <div class="cert-sig">
            <div style="height:30px"></div>
            <div class="cert-sig-line">Issued By<br><strong>Sprout Solutions</strong></div>
          </div>
        </div>
      </div>
      <div class="cert-footer">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="window.print()">🖨 Print</button>
      </div>
    </div>`);
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────
function typeBadge(type) {
  return `<span class="badge badge-${(type||'free').toLowerCase()}">${esc(type||'Free')}</span>`;
}
function contentBadge(type) {
  const map = { pdf: ['badge-pdf','PDF Slides'], youtube: ['badge-video','Video'], slides: ['badge-slides','Slides'], scorm: ['badge-scorm','SCORM'], html: ['badge-html','HTML Slides'], none: ['badge-none','Coming Soon'] };
  const [cls, label] = map[type] || map.none;
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Learning Paths ───────────────────────────────────────────────────────────
function getPath(id) { return learningPaths.find(p => p.id === id); }

function renderAdminPaths() {
  setTitle('Learning Paths');
  setMain(`
    <div class="page-header fade-up">
      <div><h1>Learning Paths</h1><p>Bundle courses into structured learning journeys</p></div>
      <button class="btn btn-primary" onclick="showCreatePathModal()">+ New Path</button>
    </div>
    ${learningPaths.length ? `
      <div class="path-grid">
        ${learningPaths.map(p => adminPathCard(p)).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <span class="empty-icon">🛣️</span>
        <h2>No learning paths yet</h2>
        <p>Create your first path to bundle courses into a journey.</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="showCreatePathModal()">+ New Path</button>
      </div>
    `}
  `);
}

function adminPathCard(path) {
  const count = path.courseIds.length;
  const preview = path.courseIds.slice(0, 4).map(id => getCourse(id)?.title).filter(Boolean);
  return `
    <div class="path-card">
      <div class="path-banner">
        <div class="path-banner-top">
          <div class="path-banner-icon">🛣️</div>
          <div style="flex:1;min-width:0">
            <div class="path-banner-title">${esc(path.title)}</div>
            ${path.description ? `<div class="path-banner-meta">${esc(path.description)}</div>` : ''}
          </div>
          <span class="path-banner-badge">${count} course${count !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div class="path-body">
        ${preview.length ? `
          <div class="path-preview-list">
            ${preview.map((n, i) => `
              <div class="path-preview-item">
                <span class="path-num-badge">${i + 1}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span>
              </div>`).join('')}
            ${count > 4 ? `<div class="path-preview-item" style="color:var(--text-muted);font-style:italic">+${count - 4} more courses…</div>` : ''}
          </div>` : `<div style="color:var(--text-muted);font-size:.85rem">No courses added yet.</div>`}
        <div class="path-card-actions">
          <button class="btn btn-primary btn-sm" onclick="showAssignPathModal('${path.id}')">👥 Assign</button>
          <button class="btn btn-outline btn-sm" onclick="showEditPathModal('${path.id}')">✏️ Edit</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);margin-left:auto" onclick="deletePath('${path.id}')">🗑 Delete</button>
        </div>
      </div>
    </div>`;
}

function showCreatePathModal() {
  _pathCourseIds = [];
  showModal(`
    <div class="modal" onclick="event.stopPropagation()" style="max-width:600px;width:95vw">
      <div class="modal-header">
        <h3>New Learning Path</h3>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div class="form-group">
          <label class="form-label">Path Title *</label>
          <input class="form-input" id="path-title" placeholder="e.g. TeamTailor Mastery" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-input" id="path-desc" rows="2" placeholder="What will learners achieve?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Add Courses</label>
          <input class="form-input" id="path-course-search" placeholder="Search courses…" oninput="renderPathCourseSearch()" style="margin-bottom:.6rem" />
          <div id="path-search-results" class="path-search-box"></div>
          <div id="path-selected-list" style="margin-top:.75rem"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveNewPath()">Create Path</button>
      </div>
    </div>
  `);
  renderPathCourseSearch();
  renderPathSelectedList();
}

function showEditPathModal(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  _pathCourseIds = [...path.courseIds];
  showModal(`
    <div class="modal" onclick="event.stopPropagation()" style="max-width:600px;width:95vw">
      <div class="modal-header">
        <h3>Edit Learning Path</h3>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div class="form-group">
          <label class="form-label">Path Title *</label>
          <input class="form-input" id="path-title" value="${esc(path.title)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-input" id="path-desc" rows="2">${esc(path.description)}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Add Courses</label>
          <input class="form-input" id="path-course-search" placeholder="Search courses…" oninput="renderPathCourseSearch()" style="margin-bottom:.6rem" />
          <div id="path-search-results" class="path-search-box"></div>
          <div id="path-selected-list" style="margin-top:.75rem"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEditPath('${pathId}')">Save Changes</button>
      </div>
    </div>
  `);
  renderPathCourseSearch();
  renderPathSelectedList();
}

function renderPathCourseSearch() {
  const q = (document.getElementById('path-course-search')?.value || '').toLowerCase();
  const available = courses.filter(c =>
    !_pathCourseIds.includes(c.id) &&
    (!q || c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
  );
  const el = document.getElementById('path-search-results');
  if (!el) return;
  if (!available.length) {
    el.innerHTML = `<div style="padding:.65rem 1rem;color:var(--text-muted);font-size:.85rem">${_pathCourseIds.length === courses.length ? 'All courses added' : 'No courses found'}</div>`;
    return;
  }
  el.innerHTML = available.map(c => `
    <div class="path-search-item" onclick="addCourseToPath('${c.id}')">
      <span style="flex:1;font-size:.88rem">${esc(c.title)}</span>
      <span style="font-size:.75rem;color:var(--text-muted);margin-right:.5rem">${esc(c.category)}</span>
      <button class="btn btn-primary btn-sm" style="font-size:.75rem;padding:.2rem .6rem">+ Add</button>
    </div>`).join('');
}

function renderPathSelectedList() {
  const el = document.getElementById('path-selected-list');
  if (!el) return;
  if (!_pathCourseIds.length) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem">No courses added yet.</div>`;
    return;
  }
  el.innerHTML = `
    <label class="form-label">Course Order</label>
    <div>
      ${_pathCourseIds.map((cid, i) => `
        <div class="path-ordered-item">
          <span class="path-step-num">${i + 1}</span>
          <span style="flex:1;font-size:.88rem">${esc(getCourse(cid)?.title || cid)}</span>
          <div style="display:flex;gap:.25rem">
            ${i > 0 ? `<button class="btn btn-outline btn-sm" style="padding:.2rem .45rem" onclick="moveCourseInPath('${cid}',-1)">↑</button>` : ''}
            ${i < _pathCourseIds.length - 1 ? `<button class="btn btn-outline btn-sm" style="padding:.2rem .45rem" onclick="moveCourseInPath('${cid}',1)">↓</button>` : ''}
            <button class="btn btn-outline btn-sm" style="padding:.2rem .45rem;color:var(--danger)" onclick="removeCourseFromPath('${cid}')">✕</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function addCourseToPath(courseId) {
  if (!_pathCourseIds.includes(courseId)) _pathCourseIds.push(courseId);
  renderPathCourseSearch();
  renderPathSelectedList();
}

function removeCourseFromPath(courseId) {
  _pathCourseIds = _pathCourseIds.filter(id => id !== courseId);
  renderPathCourseSearch();
  renderPathSelectedList();
}

function moveCourseInPath(courseId, dir) {
  const i = _pathCourseIds.indexOf(courseId);
  if (i < 0) return;
  const ni = i + dir;
  if (ni < 0 || ni >= _pathCourseIds.length) return;
  [_pathCourseIds[i], _pathCourseIds[ni]] = [_pathCourseIds[ni], _pathCourseIds[i]];
  renderPathSelectedList();
}

async function saveNewPath() {
  const title = document.getElementById('path-title')?.value.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  const desc = document.getElementById('path-desc')?.value.trim() || '';
  const id = 'p' + Date.now();
  const { error } = await sb.from('learning_paths').insert({ id, title, description: desc, course_ids: _pathCourseIds });
  if (error) { toast('Save failed: ' + error.message, 'error'); return; }
  learningPaths.unshift({ id, title, description: desc, courseIds: [..._pathCourseIds] });
  closeModal();
  toast('Learning path created!');
  renderAdminPaths();
}

async function saveEditPath(pathId) {
  const title = document.getElementById('path-title')?.value.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  const desc = document.getElementById('path-desc')?.value.trim() || '';
  const { error } = await sb.from('learning_paths').update({ title, description: desc, course_ids: _pathCourseIds }).eq('id', pathId);
  if (error) { toast('Save failed: ' + error.message, 'error'); return; }
  const p = getPath(pathId);
  if (p) { p.title = title; p.description = desc; p.courseIds = [..._pathCourseIds]; }
  closeModal();
  toast('Path updated!');
  renderAdminPaths();
}

function deletePath(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-header"><h3>Delete Path</h3><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body"><p>Delete <strong>${esc(path.title)}</strong>? Individual course assignments won't be affected.</p></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="confirmDeletePath('${pathId}')">Delete</button>
      </div>
    </div>`);
}

async function confirmDeletePath(pathId) {
  const { error } = await sb.from('learning_paths').delete().eq('id', pathId);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  learningPaths = learningPaths.filter(p => p.id !== pathId);
  closeModal();
  toast('Path deleted');
  renderAdminPaths();
}

function showAssignPathModal(pathId) {
  showAssignPathModalFiltered(pathId, '');
}

function showAssignPathModalFiltered(pathId, filterTeamId) {
  const path = getPath(pathId);
  if (!path) return;
  const allLearners = learners();
  const visible = filterTeamId ? allLearners.filter(u => u.teamId === filterTeamId) : allLearners;
  const teamTabs = [{ id: '', name: 'All' }, ...allTeams.map(t => ({ id: t.id, name: t.name }))];
  const allAssigned = visible.length > 0 && visible.every(u => path.courseIds.every(cid => isAssigned(u.id, cid)));

  showModal(`
    <div class="modal" onclick="event.stopPropagation()" style="max-width:460px;width:95vw">
      <div class="modal-header">
        <h3>Assign: ${esc(path.title)}</h3>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">Assigns all ${path.courseIds.length} course${path.courseIds.length !== 1 ? 's' : ''} in this path.</p>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.75rem">
          ${teamTabs.map(t => `<button class="btn btn-sm ${filterTeamId===t.id?'btn-primary':'btn-outline'}" onclick="showAssignPathModalFiltered('${pathId}','${t.id}')">${esc(t.name)}</button>`).join('')}
        </div>
        <div class="gmodal-list">
          ${visible.length ? visible.map(u => {
            const hasAll = path.courseIds.every(cid => isAssigned(u.id, cid));
            return `<div class="assign-row">
              <div class="assign-avatar" style="background:${u.color}">${initials(u.name)}</div>
              <span class="assign-name">${esc(u.name)}</span>
              <button class="btn btn-sm ${hasAll ? 'btn-outline' : 'btn-primary'}" onclick="togglePathAssign('${pathId}','${u.id}','${filterTeamId}')">
                ${hasAll ? '✓ Assigned' : 'Assign'}
              </button>
            </div>`;
          }).join('') : '<div style="padding:1rem;color:var(--text-muted);text-align:center">No learners in this group.</div>'}
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between">
        <button class="btn btn-outline btn-sm" onclick="toggleAssignAllPath('${pathId}','${filterTeamId}')">${allAssigned ? 'Unassign All' : 'Assign All'}</button>
        <button class="btn btn-outline" onclick="closeModal()">Done</button>
      </div>
    </div>`);
}

async function togglePathAssign(pathId, userId, filterTeamId) {
  const path = getPath(pathId);
  if (!path) return;
  const hasAll = path.courseIds.every(cid => isAssigned(userId, cid));
  if (hasAll) {
    await Promise.all(path.courseIds.map(cid => sb.from('assignments').delete().eq('user_id', userId).eq('course_id', cid)));
    path.courseIds.forEach(cid => { if (assignments[userId]) assignments[userId] = assignments[userId].filter(id => id !== cid); });
  } else {
    const toAssign = path.courseIds.filter(cid => !isAssigned(userId, cid));
    await Promise.all(toAssign.map(cid => sb.from('assignments').upsert({ user_id: userId, course_id: cid })));
    toAssign.forEach(cid => { if (!assignments[userId]) assignments[userId] = []; if (!assignments[userId].includes(cid)) assignments[userId].push(cid); });
  }
  showAssignPathModalFiltered(pathId, filterTeamId);
}

async function toggleAssignAllPath(pathId, filterTeamId) {
  const path = getPath(pathId);
  if (!path) return;
  const targets = filterTeamId ? learners().filter(u => u.teamId === filterTeamId) : learners();
  const allAssigned = targets.length > 0 && targets.every(u => path.courseIds.every(cid => isAssigned(u.id, cid)));
  if (allAssigned) {
    await Promise.all(targets.flatMap(u => path.courseIds.map(cid => sb.from('assignments').delete().eq('user_id', u.id).eq('course_id', cid))));
    targets.forEach(u => { path.courseIds.forEach(cid => { if (assignments[u.id]) assignments[u.id] = assignments[u.id].filter(id => id !== cid); }); });
  } else {
    await Promise.all(targets.flatMap(u => path.courseIds.filter(cid => !isAssigned(u.id, cid)).map(cid => sb.from('assignments').upsert({ user_id: u.id, course_id: cid }))));
    targets.forEach(u => { path.courseIds.forEach(cid => { if (!assignments[u.id]) assignments[u.id] = []; if (!assignments[u.id].includes(cid)) assignments[u.id].push(cid); }); });
  }
  showAssignPathModalFiltered(pathId, filterTeamId);
}

// ─── Learner Paths ────────────────────────────────────────────────────────────
function renderLearnerPaths() {
  setTitle('Learning Paths');
  const uid = currentUser.id;
  const myPaths = learningPaths.filter(p => p.courseIds.some(cid => isAssigned(uid, cid)));

  if (!myPaths.length) {
    setMain(`
      <div class="page-header fade-up"><h1>Learning Paths</h1><p>Your structured learning journeys</p></div>
      <div class="empty-state">
        <span class="empty-icon">🛣️</span>
        <h2>No learning paths assigned yet</h2>
        <p>Your admin will assign you to a learning path soon.</p>
      </div>`);
    return;
  }

  setMain(`
    <div class="page-header fade-up"><h1>Learning Paths</h1><p>Your structured learning journeys</p></div>
    <div class="path-grid">
      ${myPaths.map((p, i) => learnerPathCard(p, uid, i)).join('')}
    </div>`);
}

function learnerPathCard(path, uid, i = 0) {
  const assigned = path.courseIds.filter(cid => isAssigned(uid, cid));
  const completed = assigned.filter(cid => getProgress(uid, cid).completed).length;
  const total = assigned.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return `
    <div class="path-card" style="animation-delay:${i * 0.06}s">
      <div class="path-banner">
        <div class="path-banner-top">
          <div class="path-banner-icon">${allDone ? '✅' : '🛣️'}</div>
          <div style="flex:1;min-width:0">
            <div class="path-banner-title">${esc(path.title)}</div>
            ${path.description ? `<div class="path-banner-meta">${esc(path.description)}</div>` : ''}
          </div>
          ${allDone ? '<span class="path-banner-badge">Complete!</span>' : ''}
        </div>
        <div class="path-banner-progress">
          <div class="path-banner-progress-label">
            <span>${completed} of ${total} courses done</span>
            <span>${pct}%</span>
          </div>
          <div class="path-banner-bar"><div class="path-banner-bar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="path-body">
        <div class="path-timeline">
          ${assigned.map((cid, idx) => {
            const c = getCourse(cid);
            const p = getProgress(uid, cid);
            const tlClass = p.completed ? 'tl-done' : p.currentSlide > 0 ? 'tl-active' : '';
            const dotIcon = p.completed ? '✓' : p.currentSlide > 0 ? '▶' : String(idx + 1);
            const statusLabel = p.completed ? 'Completed' : p.currentSlide > 0 ? 'In progress' : 'Not started';
            const btnLabel = p.completed ? 'Review' : p.currentSlide > 0 ? 'Continue' : 'Start';
            const btnClass = p.completed ? 'btn-outline' : 'btn-primary';
            return `
              <div class="path-tl-row ${tlClass}">
                <div class="path-tl-dot">${dotIcon}</div>
                <div class="path-tl-info">
                  <div class="path-tl-name">${esc(c?.title || cid)}</div>
                  <div class="path-tl-status">${statusLabel}</div>
                </div>
                <a href="#/course/${cid}" class="btn btn-sm ${btnClass}" style="flex-shrink:0">${btnLabel}</a>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function iconHome()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`; }
function iconCourses() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`; }
function iconUsers()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function iconTrophy()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 9a6 6 0 0 0 12 0"/><line x1="12" y1="15" x2="12" y2="22"/><polyline points="9 22 15 22"/></svg>`; }
function iconBook()     { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`; }
function iconReport()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>`; }
function iconBell()     { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`; }
function iconSettings() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`; }
