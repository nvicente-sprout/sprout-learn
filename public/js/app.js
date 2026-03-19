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
let viewerPdfDoc  = null;
let viewerPage    = 1;
let viewerCourseId = null;

// Assessment state
let assessmentAnswers  = [];
let assessmentCurrentQ = 0;
let assessmentCourseId = null;

let allTeams = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function initials(name) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
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
  }).then(({ error }) => { if (error) console.error('Progress save:', error); });
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
function learners() { return allUsers.filter(u => !u.isAdmin); }

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
  };
}
function courseToRow(c) {
  return {
    id: c.id, title: c.title, description: c.description || '',
    category: c.category, type: c.type, content_type: c.contentType,
    total_pages: c.totalPages || 0, pdf_url: c.pdfDataUrl || null,
    cover_url: c.coverUrl || null, youtube_id: c.youtubeId || null,
    slides_url: c.slidesUrl || null,
  };
}

async function loadData() {
  showLoader('Loading Sprout Learn', 'Fetching your data');
  try {
    const [cRes, qRes, aRes, pRes, uRes, tRes] = await Promise.all([
      sb.from('courses').select('*').order('created_at', { ascending: false }),
      sb.from('questions').select('*'),
      sb.from('assignments').select('*'),
      sb.from('progress').select('*'),
      sb.from('users').select('*').order('created_at', { ascending: true }),
      sb.from('teams').select('*').order('name'),
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

    allUsers = uData ? uData.map((u, i) => ({
      id: u.id, email: u.email, name: u.name || u.email.split('@')[0],
      role: u.role, isAdmin: u.is_admin, teamId: u.team_id || null,
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
  } catch (err) {
    console.error('loadData exception:', err);
  }
  hideLoader();
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
  const { data: existingUser } = await sb.from('users').select('id').eq('id', authUser.id).maybeSingle();
  if (!existingUser) {
    const name = authUser.user_metadata?.full_name || email.split('@')[0];
    await sb.from('users').insert({
      id: authUser.id, email, name, is_admin: false,
    });
  }

  await loadData();
  currentUser = allUsers.find(u => u.id === authUser.id);
  if (!currentUser) { currentUser = null; navigate('/login'); return; }
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

// ─── Router ───────────────────────────────────────────────────────────────────
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
  else if (hash === '/admin/team')      renderAdminTeam();
  else if (hash === '/admin/leaderboard') renderLeaderboard(true);
  else if (hash === '/admin/settings')  renderAdminSettings();
  else if (hash === '/learner/dashboard')  renderLearnerDashboard();
  else if (hash === '/learner/library')    renderLearnerLibrary();
  else if (hash === '/learner/my-learning') renderMyLearning();
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
  const navLinks = isAdmin ? [
    { href: '/admin/dashboard',   label: 'Dashboard',     icon: iconHome() },
    { href: '/admin/courses',     label: 'Courses',       icon: iconCourses() },
    { href: '/admin/team',        label: 'Team Progress', icon: iconUsers() },
    { href: '/admin/leaderboard', label: 'Leaderboard',   icon: iconTrophy() },
    { href: '/admin/settings',    label: 'Settings',      icon: iconSettings() },
  ] : [
    { href: '/learner/dashboard',   label: 'Dashboard',      icon: iconHome() },
    { href: '/learner/library',     label: 'Course Library',  icon: iconCourses() },
    { href: '/learner/my-learning', label: 'My Learning',     icon: iconBook() },
    { href: '/learner/leaderboard', label: 'Leaderboard',     icon: iconTrophy() },
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
            <div class="topbar-avatar" style="background:${currentUser.color}">${initials(currentUser.name)}</div>
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
    </div>`;
}

function toggleMobileMenu() {
  document.getElementById('mobile-nav')?.classList.toggle('open');
}

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
    <div class="user-avatar" style="background:${u.color};width:38px;height:38px;font-size:.8rem">${initials(u.name)}</div>
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
      <button class="btn btn-outline btn-sm" onclick="showUploadModal()">📄 Upload PDF</button>
      <button class="btn btn-outline btn-sm" onclick="showAddUrlCourseModal()">🔗 YouTube / Slides</button>
      <button class="btn btn-primary btn-sm" onclick="showCreateCourseModal()">+ New Course</button>
    </div>
    <div class="course-grid">
      ${filtered.length ? filtered.map(c => adminCourseCard(c)).join('') : '<div class="empty-state"><span class="empty-icon">📭</span><h2>No courses found</h2><p>Try different filters.</p></div>'}
    </div>`);
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
  renderAdminCourses();
}

// ─── Add YouTube / Google Slides Course Modal ─────────────────────────────────
function showAddUrlCourseModal() {
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Add YouTube / Google Slides Course</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Content URL *</label>
          <input id="url-input" class="form-input" placeholder="Paste YouTube or Google Slides URL" oninput="onUrlInput(this.value)" />
          <div id="url-detect" style="font-size:.78rem;margin-top:.4rem;color:var(--text-muted)">Paste a YouTube video URL or a Google Slides share/edit link</div>
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
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="closeModal();setTimeout(()=>showManualBuilderModal('${courseId}'),200)">
          ✍️ Manual Builder
        </button>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
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
function showAssignModal(courseId) {
  const course = getCourse(courseId);
  const allLearners = allUsers;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Assign: ${esc(course?.title || '')}</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <span style="font-size:.85rem;color:var(--text-muted)">Select team members</span>
          <button class="btn btn-outline btn-sm" onclick="toggleAssignAll('${courseId}')">Assign All</button>
        </div>
        <div class="assignee-list" id="assignee-list">
          ${allLearners.map(u => `
            <div class="assignee-item ${isAssigned(u.id,courseId)?'selected':''}" id="assignee-${u.id}" onclick="toggleAssignee('${u.id}','${courseId}')">
              <input type="checkbox" class="assignee-check" ${isAssigned(u.id,courseId)?'checked':''} />
              <div class="user-avatar" style="background:${u.color};width:32px;height:32px;font-size:.72rem">${initials(u.name)}</div>
              <div><div style="font-weight:600;font-size:.88rem">${esc(u.name)}</div><div style="font-size:.75rem;color:var(--text-muted)">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div></div>
            </div>`).join('')}
        </div>
      </div>
      <div class="gmodal-footer">
        <button class="btn btn-outline" onclick="closeModal()">Done</button>
      </div>
    </div>`);
}

function toggleAssignee(userId, courseId) {
  if (!assignments[userId]) assignments[userId] = [];
  const idx = assignments[userId].indexOf(courseId);
  if (idx > -1) {
    assignments[userId].splice(idx, 1);
    sb.from('assignments').delete().eq('user_id', userId).eq('course_id', courseId)
      .then(({ error }) => { if (error) { console.error('Assignment delete:', error); toast('Failed to unassign: ' + error.message, 'error'); } });
  } else {
    assignments[userId].push(courseId);
    sb.from('assignments').upsert({ user_id: userId, course_id: courseId })
      .then(({ error }) => { if (error) { console.error('Assignment insert:', error); toast('Failed to assign: ' + error.message, 'error'); } });
  }
  const item = document.getElementById(`assignee-${userId}`);
  const check = item?.querySelector('input[type="checkbox"]');
  const assigned = isAssigned(userId, courseId);
  if (item) item.classList.toggle('selected', assigned);
  if (check) check.checked = assigned;
  if (item) {
    const avatar = item.querySelector('.user-avatar');
    if (avatar) { avatar.classList.add('popping'); setTimeout(() => avatar.classList.remove('popping'), 350); }
    const p = document.createElement('span');
    p.className = 'assign-particle';
    p.textContent = assigned ? '✓' : '✕';
    p.style.color = assigned ? 'var(--accent-dark)' : '#e53935';
    item.appendChild(p);
    setTimeout(() => p.remove(), 480);
  }
}

function toggleAssignAll(courseId) {
  const allAssigned = allUsers.every(u => isAssigned(u.id, courseId));
  allUsers.forEach(u => {
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
  showAssignModal(courseId);
}

// ─── Admin Team Progress ──────────────────────────────────────────────────────
function renderAdminTeam() {
  setTitle('Team Progress');
  const allMembers = allUsers.filter(u => u.id !== currentUser.id);
  setMain(`
    <div class="page-header">
      <h1>Team Progress</h1>
      <p>Track and manage your team members</p>
    </div>
    <p class="section-heading">Learners</p>
    <div class="member-grid">
      ${learners().length === 0 ? `<div class="empty-state" style="padding:2rem"><span class="empty-icon">👥</span><p>No learners yet — they'll appear here after signing in.</p></div>` :
        learners().map((u, i) => {
          const assigned = getUserAssignments(u.id).length;
          const done     = userCompletions(u.id);
          const avg      = userAvgProgress(u.id);
          const badgeColor = done === assigned && assigned > 0 ? '#2e7d32' : done > 0 ? '#e65100' : '#757575';
          return `<div class="member-card" style="animation-delay:${i*0.07}s">
            <div class="member-card-top">
              <div class="user-avatar" style="background:${u.color};width:44px;height:44px">${initials(u.name)}</div>
              <div class="member-info">
                <div class="member-name">${esc(u.name)}</div>
                <div class="member-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'No team')}</div>
                <div style="font-size:.72rem;color:var(--text-muted)">${esc(u.email)}</div>
              </div>
              <span class="badge" style="background:${badgeColor};color:white">${done}/${assigned}</span>
            </div>
            <div class="member-stats">
              <span><strong>${assigned}</strong> assigned</span>
              <span><strong>${done}</strong> completed</span>
              <span><strong>${avg}%</strong> avg</span>
            </div>
            <div class="progress-bar-wrap"><div class="progress-bar" style="width:${avg}%"></div></div>
            <div style="display:flex;gap:.5rem;margin-top:.5rem">
              <button class="btn btn-outline btn-sm" onclick="promoteUser('${u.id}')">⬆ Make Admin</button>
              <button class="btn btn-outline btn-sm" onclick="editUserRole('${u.id}')">✏️ Role</button>
            </div>
          </div>`;
        }).join('')}
    </div>
    <p class="section-heading" style="margin-top:1.5rem">Admins</p>
    <div class="member-grid">
      ${allUsers.filter(u => u.isAdmin).map((u, i) => `
        <div class="member-card" style="animation-delay:${i*0.07}s">
          <div class="member-card-top">
            <div class="user-avatar" style="background:${u.color};width:44px;height:44px">${initials(u.name)}</div>
            <div class="member-info">
              <div class="member-name">${esc(u.name)}</div>
              <div class="member-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div>
              <div style="font-size:.72rem;color:var(--text-muted)">${esc(u.email)}</div>
            </div>
            <span class="badge badge-done">Admin</span>
          </div>
          ${u.id !== currentUser.id ? `<div style="margin-top:.5rem"><button class="btn btn-outline btn-sm" onclick="demoteUser('${u.id}')">⬇ Make Learner</button></div>` : '<div style="font-size:.75rem;color:var(--text-muted);margin-top:.5rem">That\'s you</div>'}
        </div>`).join('')}
    </div>`);
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
      <h2 class="section-heading">User Access</h2>
      <div class="settings-list">
        ${allUsers.map(u => {
          const team = allTeams.find(t => t.id === u.teamId);
          return `<div class="settings-list-item">
            <div style="display:flex;align-items:center;gap:.75rem;min-width:0">
              <div class="user-avatar" style="background:${u.color};width:38px;height:38px;font-size:.72rem;flex-shrink:0">${initials(u.name)}</div>
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
                <div class="user-avatar" style="background:${u.color};width:42px;height:42px">${initials(u.name)}</div>
                <div class="lb-info"><div class="lb-name">${esc(u.name)}</div><div class="lb-role">${esc(allTeams.find(t=>t.id===u.teamId)?.name||'')}</div></div>
                <div>${statusBadge}</div>
                <div class="lb-stats"><strong>${scoreDisplay}</strong> score</div>
              </div>`;
            }).join('')}
      </div>`);
    return;
  }

  setMain(`
    <div class="page-header"><h1>🏆 Leaderboard</h1><p>Team XP rankings & achievements</p></div>
    ${filterBar}
    <div class="leaderboard-list">
      ${overallRanked.map((u, i) => {
        const next = userNextLevel(u.id);
        const xpToNext = next ? `<div style="font-size:.7rem;color:var(--text-muted)">${next.xpNeeded} XP to ${next.label}</div>` : `<div style="font-size:.7rem;color:var(--accent);font-weight:700">Max Level!</div>`;
        const badgeIcons = u.badges.map(b => `<span title="${b.label}: ${b.desc}" style="font-size:1.1rem;cursor:default">${b.icon}</span>`).join('');
        return `<div class="lb-item ${i===0?'top1':''}" style="animation-delay:${i*0.07}s">
          <div class="lb-rank">${medals[i] || `#${i+1}`}</div>
          <div class="user-avatar" style="background:${u.color};width:42px;height:42px">${initials(u.name)}</div>
          <div class="lb-info">
            <div class="lb-name">${esc(u.name)}</div>
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
    <div class="badges-legend">
      <p class="section-heading">Badges</p>
      <div class="badges-grid">
        ${BADGES.map(b => `
          <div class="badge-card">
            <span class="badge-card-icon">${b.icon}</span>
            <div><div style="font-weight:700;font-size:.85rem">${b.label}</div><div style="font-size:.75rem;color:var(--text-muted)">${b.desc}</div></div>
          </div>`).join('')}
      </div>
    </div>`);
}

// ─── Learner Dashboard ────────────────────────────────────────────────────────
function renderLearnerDashboard() {
  setTitle('Dashboard');
  const uid = currentUser.id;
  const assigned = getUserAssignments(uid);
  const done     = userCompletions(uid);
  const avg      = userAvgProgress(uid);

  const continueList = assigned
    .filter(cid => !getProgress(uid, cid).completed)
    .slice(0, 6);

  setMain(`
    <div class="page-header fade-up">
      <h1>Welcome, ${esc(currentUser.name.split(' ')[0])} 👋</h1>
      <p>${userLevel(uid).icon} ${userLevel(uid).label} &nbsp;·&nbsp; ${userXP(uid)} XP${userNextLevel(uid) ? ` &nbsp;·&nbsp; ${userNextLevel(uid).xpNeeded} XP to ${userNextLevel(uid).label}` : ' &nbsp;·&nbsp; <strong style="color:var(--accent)">Max Level!</strong>'}</p>
    </div>
    ${userBadges(uid).length ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">${userBadges(uid).map(b=>`<span title="${b.desc}" style="background:#e8f5e9;color:#1B3A1B;padding:.25rem .65rem;border-radius:20px;font-size:.8rem;font-weight:700;cursor:default">${b.icon} ${b.label}</span>`).join('')}</div>` : ''}
    <div class="stats-grid">
      ${statCard('Assigned', assigned.length, '', '#1B3A1B', 0)}
      ${statCard('Completed', done, '', '#2d5a2d', 1)}
      ${statCard('Avg Progress', avg, '%', '#3a7a3a', 2)}
    </div>
    <p class="section-heading">Continue Learning</p>
    ${continueList.length ? `
      <div class="cl-grid">
        ${continueList.map((cid, i) => {
          const c = getCourse(cid); if (!c) return '';
          const p = getProgress(uid, cid);
          const pct = c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0;
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
    </div>` : `<p style="color:var(--text-muted);font-size:.88rem">No completions yet.</p>`}`);

  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    animateCount(el, parseInt(el.dataset.target));
  });
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
    <div class="course-grid">
      ${filtered.length ? filtered.map((c, i) => learnerCourseCard(c, uid, i)).join('') : '<div class="empty-state"><span class="empty-icon">📭</span><h2>No courses found</h2><p>Try different filters.</p></div>'}
    </div>`);
}

function learnerCourseCard(c, uid, i = 0) {
  const p      = getProgress(uid, c.id);
  const pct    = c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : 0;
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
function renderMyLearning() {
  setTitle('My Learning');
  const uid = currentUser.id;
  const assigned = getUserAssignments(uid);
  setMain(`
    <div class="page-header"><h1>My Learning</h1><p>${assigned.length} course${assigned.length!==1?'s':''} assigned to you</p></div>
    ${assigned.length ? `<div class="continue-list">
      ${assigned.map(cid => {
        const c = getCourse(cid); if (!c) return '';
        const p = getProgress(uid, cid);
        const pct = c.totalPages ? Math.round((p.currentSlide / c.totalPages) * 100) : p.completed ? 100 : 0;
        const label = p.completed ? 'Review' : p.currentSlide > 0 ? 'Continue' : 'Start';
        return `<div class="continue-item">
          <div style="font-size:1.5rem">${CAT_EMOJI[c.category]||'📚'}</div>
          <div class="continue-item-info">
            <div class="continue-item-title">${esc(c.title)}</div>
            <div class="continue-item-meta">${esc(c.category)} · ${esc(c.type)} ${p.completed ? '· ✓ Completed' : `· ${pct}%`}</div>
          </div>
          <div class="continue-item-progress">
            <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
          </div>
          <a href="#/course/${c.id}" class="btn btn-primary btn-sm">${label}</a>
        </div>`;
      }).join('')}
    </div>` : `
    <div class="empty-state">
      <span class="empty-icon">📋</span>
      <h2>No courses assigned yet</h2>
      <p>Your admin will assign courses to you. In the meantime, browse the library.</p>
      <a href="#/learner/library" class="btn btn-primary" style="margin-top:1rem">Browse Library</a>
    </div>`}`);
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
        </div>` : course.contentType === 'youtube' ? `
        <div class="viewer-bottombar" style="justify-content:center">
          ${questions[courseId] ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')">Take Assessment →</button>` : ''}
        </div>` : `
        <div class="viewer-bottombar" style="justify-content:center">
          ${questions[courseId] ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')">Take Assessment →</button>` : ''}
        </div>`}
    </div>`;

  if (course.contentType === 'pdf' && course.pdfDataUrl) {
    await initPdfViewer(course);
  }
}

function viewerBodyHTML(course) {
  if (course.contentType === 'pdf') {
    return `<canvas id="pdf-canvas"></canvas>`;
  } else if (course.contentType === 'youtube') {
    setViewerProgress(currentUser.id, course.id, { completed: true });
    return `<div class="viewer-youtube"><iframe src="https://www.youtube.com/embed/${esc(course.youtubeId)}?autoplay=0&rel=0" allowfullscreen></iframe></div>`;
  } else if (course.contentType === 'slides') {
    setViewerProgress(currentUser.id, course.id, { completed: true });
    const embedId = (course.slidesUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || '';
    return `<div class="viewer-youtube"><iframe src="https://docs.google.com/presentation/d/${esc(embedId)}/embed?start=false&loop=false&delayms=3000" allowfullscreen></iframe></div>`;
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
  const map = { pdf: ['badge-pdf','PDF Slides'], youtube: ['badge-video','Video'], slides: ['badge-slides','Slides'], none: ['badge-none','Coming Soon'] };
  const [cls, label] = map[type] || map.none;
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function iconHome()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`; }
function iconCourses() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`; }
function iconUsers()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function iconTrophy()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 9a6 6 0 0 0 12 0"/><line x1="12" y1="15" x2="12" y2="22"/><polyline points="9 22 15 22"/></svg>`; }
function iconBook()     { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`; }
function iconSettings() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`; }
