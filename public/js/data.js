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
function courseToRow(course) {
  return {
    id: course.id, title: course.title, description: course.description || '',
    category: course.category, type: course.type, content_type: course.contentType,
    total_pages: course.totalPages || 0, pdf_url: course.pdfDataUrl || null,
    cover_url: course.coverUrl || null, youtube_id: course.youtubeId || null,
    slides_url: course.slidesUrl || null, scorm_url: course.scormUrl || course.htmlUrl || null,
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
    learningPaths = lpRes.data ? lpRes.data.map(row => ({
      id: row.id, title: row.title, description: row.description || '', courseIds: row.course_ids || [],
    })) : [];

    allUsers = uData ? uData.map((userData, userIndex) => ({
      id: userData.id, email: userData.email, name: userData.name || userData.email.split('@')[0],
      role: userData.role, isAdmin: userData.is_admin, teamId: userData.team_id || null,
      avatarUrl: userData.avatar_url || null,
      color: USER_COLORS[userIndex % USER_COLORS.length],
    })) : [];

    courses = cData ? cData.map(courseFromRow) : [];

    questions = {};
    if (qData) qData.forEach(row => { questions[row.course_id] = row.questions_json; });

    assignments = {};
    if (aData) aData.forEach(row => {
      if (!assignments[row.user_id]) assignments[row.user_id] = [];
      assignments[row.user_id].push(row.course_id);
    });

    progress = {};
    if (pData) pData.forEach(row => {
      progress[`${row.user_id}_${row.course_id}`] = {
        currentSlide: row.current_slide, completed: row.completed,
        score: row.score, passed: row.passed,
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
  if (!email.endsWith('@sprout.ph') && !email.endsWith('@sproutsolutions.io')) {
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
          <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:1.5rem">Only @sprout.ph and @sproutsolutions.io accounts are allowed.</div>
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
  currentUser = allUsers.find(user => user.id === authUser.id);
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
      if (notifications.find(existing => existing.id === n.id)) return; // dedupe (we may have added it locally already)
      notifications.unshift(n);
      updateBellBadge();
      // Pulse the bell
      document.getElementById('bell-btn')?.classList.add('bell-pulse');
      setTimeout(() => document.getElementById('bell-btn')?.classList.remove('bell-pulse'), 600);
      if (document.getElementById('notif-panel')?.dataset.open === 'true') renderNotifPanel();
    })
    .subscribe();
}

