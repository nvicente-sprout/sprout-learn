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
        <div style="margin-top:1rem;font-size:.78rem;color:var(--text-muted)">Only @sprout.ph and @sproutsolutions.io accounts are allowed</div>
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
                ${allTeams.map(team => `<option value="${team.id}">${esc(team.name)}</option>`).join('')}
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

// ─── Layout ───────────────────────────────────────────────────────────────────
function toggleLearnerView() {
  adminViewingAsLearner = !adminViewingAsLearner;
  navigate(adminViewingAsLearner ? '/learner/dashboard' : '/admin/dashboard');
}

function renderLayout() {
  const isAdmin = currentUser?.isAdmin && !adminViewingAsLearner;
  const unread = notifications.filter(notif => !notif.is_read).length;
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

  const tabs = navLinks.map(link => `
    <a class="nav-tab ${currentRoute === link.href ? 'active' : ''}" href="#${link.href}">
      <span class="nav-icon">${link.icon}</span>${esc(link.label)}
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
  const user = getUser(userId);
  if (!user) return;
  const teamName     = allTeams.find(team => team.id === user.teamId)?.name || '—';
  const assignedCids = getUserAssignments(userId);
  const completed    = assignedCids.filter(cid => getProgress(userId, cid).completed).length;
  const scores       = assignedCids.map(cid => getProgress(userId, cid)).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined).map(progressEntry => progressEntry.score);
  const avgScore     = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

  const rows = assignedCids.map(cid => {
    const course = getCourse(cid);
    const prog = getProgress(userId, cid);
    if (!course) return '';
    const statusColor = prog.completed ? '#2e7d32' : '#f57c00';
    const statusLabel = prog.completed ? '✅ Completed' : prog.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
    const pct = prog.completed ? 100 : Math.min(80, course.totalPages ? Math.round((prog.currentSlide / course.totalPages) * 100) : 0);
    return `<div class="sp-course-row">
      ${course.coverUrl ? `<img src="${course.coverUrl}" class="sp-course-thumb"/>` : `<div class="sp-course-thumb sp-course-thumb--placeholder">${CAT_EMOJI[course.category]||'📚'}</div>`}
      <div style="flex:1;min-width:0">
        <div class="sp-course-title">${esc(course.title)}</div>
        <div style="font-size:.76rem;color:var(--text-muted);margin-bottom:.3rem">${esc(course.category)}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <div style="flex:1;background:#e8f5e9;border-radius:99px;height:6px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${prog.completed?'#2e7d32':'#4a9e4a'};border-radius:99px"></div>
          </div>
          <span style="font-size:.74rem;color:var(--text-muted);white-space:nowrap">${pct}%</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.78rem;font-weight:600;color:${statusColor}">${statusLabel}</div>
        ${prog.score !== null && prog.score !== undefined ? `<div style="font-size:.82rem;font-weight:800;color:var(--primary);margin-top:.2rem">${prog.score}%</div>` : ''}
      </div>
    </div>`;
  }).join('');

  openSidePanel(`
    <div class="sp-header">
      <div style="display:flex;align-items:center;gap:.75rem;flex:1;min-width:0">
        ${avatarHTML(user, 44)}
        <div style="min-width:0">
          <div class="sp-title">${esc(user.name)}</div>
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
  const course = getCourse(courseId);
  if (!course) return;
  const assignedUsers  = learners().filter(user => isAssigned(user.id, courseId));
  const completedUsers = assignedUsers.filter(user => getProgress(user.id, courseId).completed);
  const scores         = assignedUsers.map(user => getProgress(user.id, courseId)).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined).map(progressEntry => progressEntry.score);
  const avgScore       = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const passRate       = assignedUsers.length ? Math.round((completedUsers.length / assignedUsers.length) * 100) : 0;
  const barColor       = passRate >= 70 ? '#2e7d32' : passRate >= 40 ? '#f57c00' : '#c62828';

  const rows = assignedUsers.map(user => {
    const progressEntry = getProgress(user.id, courseId);
    const teamName = allTeams.find(team => team.id === user.teamId)?.name || '—';
    const statusColor = progressEntry.completed ? '#2e7d32' : '#f57c00';
    const statusLabel = progressEntry.completed ? '✅ Completed' : progressEntry.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
    const pct = progressEntry.completed ? 100 : Math.min(80, course.totalPages ? Math.round((progressEntry.currentSlide / course.totalPages) * 100) : 0);
    return `<div class="sp-course-row">
      ${avatarHTML(user, 36)}
      <div style="flex:1;min-width:0">
        <div class="sp-course-title">${esc(user.name)}</div>
        <div style="font-size:.76rem;color:var(--text-muted);margin-bottom:.3rem">${esc(teamName)}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <div style="flex:1;background:#e8f5e9;border-radius:99px;height:6px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${progressEntry.completed?'#2e7d32':'#4a9e4a'};border-radius:99px"></div>
          </div>
          <span style="font-size:.74rem;color:var(--text-muted);white-space:nowrap">${pct}%</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.78rem;font-weight:600;color:${statusColor}">${statusLabel}</div>
        ${progressEntry.score !== null && progressEntry.score !== undefined ? `<div style="font-size:.82rem;font-weight:800;color:var(--primary);margin-top:.2rem">${progressEntry.score}%</div>` : ''}
      </div>
    </div>`;
  }).join('');

  openSidePanel(`
    <div class="sp-header">
      <div style="display:flex;align-items:center;gap:.75rem;flex:1;min-width:0">
        ${course.coverUrl ? `<img src="${course.coverUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0"/>` : `<div style="width:44px;height:44px;border-radius:8px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">${CAT_EMOJI[course.category]||'📚'}</div>`}
        <div style="min-width:0">
          <div class="sp-title">${esc(course.title)}</div>
          <div class="sp-subtitle">${esc(course.category)}</div>
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
function setTitle(title) { document.title = `${title} — Sprout Learn`; }

