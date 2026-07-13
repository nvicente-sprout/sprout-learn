// ─── Learner Dashboard ────────────────────────────────────────────────────────
function renderLearnerDashboard() {
  setTitle('Dashboard');
  const uid = currentUser.id;
  const assigned = getUserAssignments(uid);
  const done     = userCompletions(uid);
  const avg      = userAvgProgress(uid);

  const continueList = assigned
    .filter(cid => !getProgress(uid, cid).completed);

  // ── Team podium widget ───────────────────────────────────────────────────
  const myTeam = allTeams.find(team => team.id === currentUser.teamId);
  const podiumMembers = myTeam
    ? learners()
        .filter(user => user.teamId === currentUser.teamId)
        .map(user => ({ ...user, xp: userXP(user.id), completions: userCompletions(user.id) }))
        .sort((userA, userB) => userB.xp - userA.xp || userB.completions - userA.completions)
    : [];
  const myPodiumRank = podiumMembers.findIndex(user => user.id === currentUser.id) + 1;

  const teamWidget = myTeam && podiumMembers.length > 0 ? `
    <div class="ld-team-card">
      <div class="ld-team-header">
        <div>
          <div class="ld-team-name">🏆 ${esc(myTeam.name)}</div>
          <div class="ld-team-sub">Your rank: #${myPodiumRank} of ${podiumMembers.length} teammate${podiumMembers.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      ${podiumMembers.length >= 2 ? `
      <div class="ld-podium">
        ${[podiumMembers[1], podiumMembers[0], podiumMembers[2]].map((user, podiumIndex) => {
          if (!user) return '<div class="ld-podium-col"></div>';
          const podiumHeights = ['90px', '120px', '70px'];
          const podiumMedals = ['🥈', '🥇', '🥉'];
          const isMe = user.id === currentUser.id;
          return `<div class="ld-podium-col${isMe ? ' ld-podium-col--me' : ''}">
            ${avatarHTML(user, 38)}
            <div class="ld-podium-name">${esc(user.name.split(' ')[0])}${isMe ? ' <span class="ld-you-badge">You</span>' : ''}</div>
            <div class="ld-podium-xp">${user.xp} XP</div>
            <div class="ld-podium-block" style="height:${podiumHeights[podiumIndex]}">
              <span class="ld-podium-medal">${podiumMedals[podiumIndex]}</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 0">
        ${avatarHTML(podiumMembers[0], 36)}
        <div><div style="font-weight:700;font-size:.88rem">${esc(podiumMembers[0].name)}</div><div style="font-size:.75rem;color:var(--text-muted)">${podiumMembers[0].xp} XP</div></div>
        <span style="margin-left:auto;font-size:1.3rem">🥇</span>
      </div>`}
      ${podiumMembers.length > 3 ? `
      <div class="ld-podium-rest">
        ${podiumMembers.slice(3).map((user, restIndex) => {
          const isMe = user.id === currentUser.id;
          return `<div class="ld-podium-rest-row${isMe ? ' ld-podium-rest-row--me' : ''}">
            <span class="ld-podium-rest-rank">#${restIndex + 4}</span>
            ${avatarHTML(user, 26)}
            <span class="ld-podium-rest-name">${esc(user.name)}${isMe ? ' <span class="ld-you-badge">You</span>' : ''}</span>
            <span class="ld-podium-rest-xp">${user.xp} XP</span>
          </div>`;
        }).join('')}
      </div>` : ''}
    </div>` : '';

  setMain(`
    <div class="page-header fade-up">
      <h1>Welcome, ${esc(currentUser.name.split(' ')[0])} 👋</h1>
      <p>${userLevel(uid).icon} ${userLevel(uid).label} &nbsp;·&nbsp; ${userXP(uid)} XP${userNextLevel(uid) ? ` &nbsp;·&nbsp; ${userNextLevel(uid).xpNeeded} XP to ${userNextLevel(uid).label}` : ' &nbsp;·&nbsp; <strong style="color:var(--accent)">Max Level!</strong>'}</p>
    </div>
    ${userBadges(uid).length ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">${userBadges(uid).map(badge=>`<span title="${badge.desc}" style="background:#e8f5e9;color:#1B3A1B;padding:.25rem .65rem;border-radius:20px;font-size:.8rem;font-weight:700;cursor:default">${badge.icon} ${badge.label}</span>`).join('')}</div>` : ''}
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
        ${continueList.map((cid, courseIndex) => {
          const course = getCourse(cid); if (!course) return '';
          const prog = getProgress(uid, cid);
          const pct = Math.min(80, course.totalPages ? Math.round((prog.currentSlide / course.totalPages) * 100) : 0);
          const cover = course.coverUrl
            ? `<img src="${course.coverUrl}" alt="" />`
            : `<div class="cl-cover-placeholder">
                <img src="assets/logos/logo-icon-green.svg" style="width:34px;height:34px;opacity:.9" alt="" />
                <span style="font-size:.72rem;font-weight:700;color:rgba(255,255,255,.85);text-align:center;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:90%">${esc(course.title)}</span>
              </div>`;
          return `<a href="#/course/${course.id}" class="cl-card" style="animation-delay:${courseIndex*0.07}s">
            <div class="cl-card-cover">
              ${cover}
              ${pct > 0 ? `<span class="cl-pct">${pct}%</span>` : ''}
              <div class="cl-progress-track"><div class="cl-progress-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="cl-card-body">
              <div class="cl-card-title">${esc(course.title)}</div>
              <div class="cl-card-meta">${CAT_EMOJI[course.category]||'📚'} ${esc(course.category)}</div>
              <div class="cl-card-cta">${prog.currentSlide > 0 ? '▶ Continue' : '▶ Start'}</div>
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
      const myPaths = learningPaths.filter(path => path.courseIds.some(cid => isAssigned(uid, cid)));
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
      ${assigned.filter(cid => getProgress(uid, cid).completed).map((cid, courseIndex) => {
        const course = getCourse(cid); if (!course) return '';
        const cover = course.coverUrl
          ? `<img src="${course.coverUrl}" alt="" />`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#1B3A1B 0%,#2d6a2d 100%);display:flex;align-items:center;justify-content:center">
              <img src="assets/logos/logo-icon-green.svg" style="width:24px;height:24px;opacity:.8" alt="" />
            </div>`;
        return `<div class="completed-card" style="animation-delay:${courseIndex*0.05}s">
          <div class="completed-card-cover">
            ${cover}
            <span class="completed-done-badge">✓ Done</span>
          </div>
          <div class="completed-card-body">
            <div class="completed-card-title">${esc(course.title)}</div>
            <div class="completed-card-actions">
              <a href="#/course/${course.id}" class="btn btn-outline btn-sm">Review</a>
              <button class="btn btn-outline btn-sm" onclick="event.preventDefault();showCertificate('${course.id}')">🏆</button>
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
function renderLearnerLibrary(filterQ = '', filterCat = '') {
  setTitle('Course Library');
  const uid = currentUser.id;
  let filtered = courses.filter(course => {
    const matchQ   = !filterQ   || course.title.toLowerCase().includes(filterQ.toLowerCase()) || course.category.toLowerCase().includes(filterQ.toLowerCase());
    const matchCat = !filterCat || course.category === filterCat;
    return matchQ && matchCat;
  });

  // Group by category in CATEGORIES order
  const grouped = {};
  let idx = 0;
  filtered.forEach(course => {
    if (!grouped[course.category]) grouped[course.category] = [];
    grouped[course.category].push({ course, cardIndex: idx++ });
  });

  const sectionsHTML = filtered.length
    ? CATEGORIES.filter(cat => grouped[cat]).map(cat =>
        `<div class="library-section">
          <div class="library-section-heading">${CAT_EMOJI[cat] || '📚'} ${esc(cat)}</div>
          <div class="course-grid">${grouped[cat].map(({ course, cardIndex }) => learnerCourseCard(course, uid, cardIndex)).join('')}</div>
        </div>`
      ).join('')
    : '<div class="empty-state"><span class="empty-icon">📭</span><h2>No courses found</h2><p>Try different filters.</p></div>';

  // Already on this page — only swap the sections to avoid re-animating everything
  const existingSections = document.querySelector('#main-content .library-sections');
  if (existingSections) {
    existingSections.innerHTML = sectionsHTML;
    const inp = document.querySelector('#main-content .toolbar-search input');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    return;
  }

  setMain(`
    <div class="page-header"><h1>Course Library</h1><p>Explore all available training content</p></div>
    <div class="toolbar">
      <div class="toolbar-search">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 13L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input placeholder="Search courses…" value="${esc(filterQ)}" oninput="renderLearnerLibrary(this.value,document.getElementById('lib-cat')?.value)" />
      </div>
      <select class="toolbar-select" id="lib-cat" onchange="renderLearnerLibrary(document.querySelector('.toolbar-search input')?.value,this.value)">
        <option value="">All Categories</option>
        ${CATEGORIES.map(cat => `<option value="${esc(cat)}" ${filterCat===cat?'selected':''}>${esc(cat)}</option>`).join('')}
      </select>
    </div>
    <div class="library-sections">${sectionsHTML}</div>`);
}

function learnerCourseCard(course, uid, cardIndex = 0) {
  const prog   = getProgress(uid, course.id);
  const pct    = prog.completed ? 100 : Math.min(80, course.totalPages ? Math.round((prog.currentSlide / course.totalPages) * 100) : 0);
  const qs     = questions[course.id];
  const assigned = isAssigned(uid, course.id);
  const label  = prog.completed ? 'Review' : prog.currentSlide > 0 ? 'Continue' : 'Start';
  return `<div class="course-card" style="animation-delay:${cardIndex*0.04}s">
    ${courseCoverHTML(course)}
    <div class="course-card-body">
      <div class="course-card-badges">
        ${contentBadge(course.contentType)}
        ${qs ? `<span class="badge badge-q">${qs.length} Q</span>` : ''}
        ${prog.completed ? '<span class="badge badge-done">✓ Done</span>' : ''}
      </div>
      <div class="course-card-title">${esc(course.title)}</div>
      <div class="course-card-desc">${esc(course.description)}</div>
      <div class="course-card-meta">${CAT_EMOJI[course.category]||'📚'} ${esc(course.category)}</div>
      ${course.createdBy ? `<div class="course-card-publisher">by ${esc(allUsers.find(user => user.id === course.createdBy)?.name || 'Unknown')}</div>` : ''}
      ${assigned && course.totalPages ? `<div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>` : ''}
      <div class="course-card-actions">
        ${assigned ? `<a href="#/course/${course.id}" class="btn btn-primary btn-sm">${label}</a>` : `<span class="btn btn-outline btn-sm" style="opacity:.6;cursor:default">Not Assigned</span>`}
        ${prog.completed ? `<button class="btn btn-outline btn-sm" onclick="showCertificate('${course.id}')">🏆 Cert</button>` : ''}
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
          ${allTeams.map(team => `<option value="${team.id}" ${currentUser.teamId===team.id?'selected':''}>${esc(team.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveLearnerSettings()">Save Changes</button>
    </div>
    ${badges.length ? `
    <p class="section-heading">My Badges</p>
    <div style="display:flex;flex-wrap:wrap;gap:.75rem">
      ${badges.map(badge => `
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
      const user = getUser(currentUser.id);
      if (user) user.avatarUrl = publicUrl;
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
  const user = getUser(currentUser.id);
  if (user) { user.name = name; user.teamId = teamId; }
  toast('Profile saved!');
  renderLayout();
  navigate('/learner/settings');
}

// ─── Course Viewer ────────────────────────────────────────────────────────────
function hasLesson(course) {
  return course?.contentType === 'pdf' && !!lessons[course.id];
}

async function renderCourseViewer(courseId) {
  const course = getCourse(courseId);
  if (!course) { navigate(currentUser.isAdmin ? '/admin/courses' : '/learner/library'); return; }

  // Only reset to the default mode when landing on a different course —
  // toggleViewerMode() re-renders this same course and must not be clobbered back to lesson mode.
  if (viewerCourseId !== courseId) {
    viewerMode = hasLesson(course) ? 'lesson' : 'slides';
  }
  viewerCourseId = courseId;

  const uid = currentUser.id;
  const p   = getProgress(uid, courseId);

  if (viewerMode === 'lesson') {
    lessonCardIndex = Math.min(Math.max(0, p.lessonCard || 0), lessons[courseId].cards.length - 1);
  } else {
    viewerPage = Math.max(1, p.currentSlide || 1);
  }

  const showModeToggle = hasLesson(course);

  document.getElementById('app').innerHTML = `
    <div class="viewer-page" id="viewer-page">
      <div class="viewer-topbar">
        <button class="viewer-back" onclick="leaveViewer()">← Back</button>
        <div class="viewer-title">${esc(course.title)}</div>
        ${viewerMode === 'lesson' ? `
          <div class="viewer-progress-wrap">
            <div class="viewer-progress-bar" id="viewer-prog-bar" style="width:${Math.round(((lessonCardIndex+1)/lessons[courseId].cards.length)*100)}%"></div>
          </div>
          <span class="viewer-progress-label" id="viewer-prog-label">${lessonCardIndex+1}/${lessons[courseId].cards.length}</span>
        ` : course.totalPages ? `
          <div class="viewer-progress-wrap">
            <div class="viewer-progress-bar" id="viewer-prog-bar" style="width:${Math.round((viewerPage/course.totalPages)*100)}%"></div>
          </div>
          <span class="viewer-progress-label" id="viewer-prog-label">${viewerPage}/${course.totalPages}</span>
        ` : ''}
        ${showModeToggle ? `<button class="viewer-btn" onclick="toggleViewerMode()" style="margin-left:.5rem">${viewerMode === 'lesson' ? '📄 View Slides' : '🪄 Back to Lesson'}</button>` : ''}
        ${questions[courseId] && viewerMode !== 'lesson' ? `<button class="viewer-btn accent" onclick="navigate('/assessment/${courseId}')" style="margin-left:.5rem">📝 Assessment</button>` : ''}
      </div>
      <div class="viewer-body" id="viewer-body">
        ${viewerBodyHTML(course)}
      </div>
      ${viewerMode === 'lesson' ? '' : course.contentType === 'pdf' ? `
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

  // Attach arrow key navigation (works for both the PDF slide viewer and the lesson card viewer)
  _pdfKeyHandler = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      viewerMode === 'lesson' ? lessonNext() : pdfNextPage();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      viewerMode === 'lesson' ? lessonPrev() : pdfPrevPage();
    }
  };
  document.addEventListener('keydown', _pdfKeyHandler);

  if (viewerMode === 'lesson') {
    renderLessonCard();
    return;
  }
  if (course.contentType === 'pdf' && course.pdfDataUrl) {
    await initPdfViewer(course);
  }
  if (course.contentType === 'scorm' && course.scormUrl) {
    await initFrameViewer('scorm-iframe', course.scormUrl);
  }
  if (course.contentType === 'html' && course.htmlUrl) {
    await initFrameViewer('html-iframe', course.htmlUrl);
  }
}

function toggleViewerMode() {
  viewerMode = viewerMode === 'lesson' ? 'slides' : 'lesson';
  renderCourseViewer(viewerCourseId);
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
  if (viewerMode === 'lesson') {
    return `<div class="lesson-wrap" id="lesson-wrap"></div>`;
  }
  if (course.contentType === 'pdf') {
    return `<canvas id="pdf-canvas"></canvas>`;
  } else if (course.contentType === 'youtube') {
    return `<div class="viewer-youtube"><iframe src="https://www.youtube.com/embed/${esc(course.youtubeId)}?autoplay=0&rel=0" allowfullscreen></iframe></div>`;
  } else if (course.contentType === 'slides') {
    const embedId = (course.slidesUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || '';
    return `<div class="viewer-youtube"><iframe src="https://docs.google.com/presentation/d/${esc(embedId)}/embed?start=false&loop=false&delayms=3000" allowfullscreen></iframe></div>`;
  } else if (course.contentType === 'scorm') {
    return `<div class="viewer-youtube"><iframe id="scorm-iframe" src="about:blank" allowfullscreen allow="fullscreen; autoplay" style="width:100%;height:100%;border:none"></iframe></div>`;
  } else if (course.contentType === 'html') {
    return `<div class="viewer-youtube"><iframe id="html-iframe" src="about:blank" allowfullscreen style="width:100%;height:100%;border:none"></iframe></div>`;
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

async function initFrameViewer(iframeId, contentUrl) {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !contentUrl) return;
  try {
    const response = await fetch(contentUrl);
    let html = await response.text();
    // Inject <base href> so relative assets (JS, CSS, images) resolve against the storage path
    const baseHref = contentUrl.substring(0, contentUrl.lastIndexOf('/') + 1);
    const baseTag = `<base href="${baseHref}">`;
    html = html.includes('<head>') ? html.replace('<head>', '<head>' + baseTag) : baseTag + html;
    const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    iframe.src = blobUrl;
  } catch (err) {
    console.error('Frame load error:', err);
    toast('Could not load content: ' + err.message, 'error');
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

async function pdfGoTo(pageNum) {
  viewerPage = pageNum;
  await renderPdfPage(viewerPage);
}

function setViewerProgress(uid, courseId, update) {
  setProgress(uid, courseId, update);
}

function leaveViewer() {
  if (_pdfKeyHandler) { document.removeEventListener('keydown', _pdfKeyHandler); _pdfKeyHandler = null; }
  navigate(currentUser.isAdmin ? '/admin/courses' : '/learner/my-learning');
}

// ─── Interactive Lesson Viewer ─────────────────────────────────────────────────
// Per-card interaction state for the current viewer session only (mirrors assessmentAnswers).
let _lessonCardState = {};

function renderLessonCard() {
  const lesson = lessons[viewerCourseId];
  const wrap = document.getElementById('lesson-wrap');
  if (!lesson || !wrap) return;
  const card = lesson.cards[lessonCardIndex];
  const state = _lessonCardState[lessonCardIndex] || (_lessonCardState[lessonCardIndex] = {});

  const pct = Math.round(((lessonCardIndex+1) / lesson.cards.length) * 100);
  const progBar = document.getElementById('viewer-prog-bar');
  if (progBar) progBar.style.width = pct + '%';
  const progLabel = document.getElementById('viewer-prog-label');
  if (progLabel) progLabel.textContent = `${lessonCardIndex+1}/${lesson.cards.length}`;

  wrap.innerHTML = `
    <div class="lesson-card-body">
      ${lessonCardBodyHTML(card, state)}
    </div>
    <div class="viewer-bottombar" id="lesson-bottombar">
      <button class="viewer-btn" onclick="lessonPrev()" ${lessonCardIndex<=0?'disabled':''}>← Back</button>
      <div class="viewer-dots" id="lesson-dots">
        ${lesson.cards.length <= 30 ? lesson.cards.map((_, cardIndex) =>
          `<button class="viewer-dot ${cardIndex===lessonCardIndex?'active':''}" onclick="lessonGoTo(${cardIndex})"></button>`).join('') : ''}
      </div>
      <span class="viewer-slide-counter">Card ${lessonCardIndex+1} of ${lesson.cards.length}</span>
      ${card.type === 'recap'
        ? `<button class="viewer-btn accent" onclick="completeLesson('${viewerCourseId}')">✓ Complete</button>`
        : `<button class="viewer-btn accent" id="lesson-next-btn" onclick="lessonNext()" ${lessonCardNeedsAnswer(card) && state.selected===undefined?'disabled':''}>Next →</button>`}
    </div>`;
}

function lessonCardNeedsAnswer(card) {
  return card.type === 'check' || card.type === 'scenario';
}

function lessonCardBodyHTML(card, state) {
  if (card.type === 'learn') {
    return `
      <div class="lesson-kicker">📖 Learn</div>
      <h2 class="lesson-heading">${esc(card.heading || '')}</h2>
      <p class="lesson-body-text">${esc(card.body || '')}</p>
      ${card.highlight ? `<div class="lesson-highlight">💡 ${esc(card.highlight)}</div>` : ''}`;
  }
  if (card.type === 'recall') {
    return `
      <div class="lesson-kicker">🧠 Quick Recall</div>
      <p class="lesson-body-text">${esc(card.prompt || '')}</p>
      ${state.revealed
        ? `<div class="lesson-highlight">${esc(card.answer || '')}</div>`
        : `<button class="btn btn-outline" onclick="revealLessonAnswer()">Reveal Answer</button>`}`;
  }
  if (card.type === 'check' || card.type === 'scenario') {
    const kicker = card.type === 'scenario' ? '🎭 Scenario' : '✅ Check Your Understanding';
    const answered = state.selected !== undefined;
    return `
      <div class="lesson-kicker">${kicker}</div>
      <p class="lesson-body-text">${esc(card.prompt || '')}</p>
      <div class="assess-options">
        ${(card.options || []).map((opt, optionIndex) => {
          const isCorrect = optionIndex === card.correct;
          const isSelected = state.selected === optionIndex;
          let cls = 'assess-opt';
          if (answered && isSelected) cls += isCorrect ? ' assess-opt--selected lesson-opt--correct' : ' assess-opt--selected lesson-opt--wrong';
          else if (answered && isCorrect) cls += ' lesson-opt--correct';
          return `<button class="${cls}" ${answered?'disabled':''} onclick="selectLessonOption(${optionIndex})">
            <span class="assess-opt-letter">${String.fromCharCode(65+optionIndex)}</span>
            <span class="assess-opt-text">${esc(opt)}</span>
          </button>`;
        }).join('')}
      </div>
      ${answered ? `<div class="lesson-why">${state.selected===card.correct ? '✅ Correct — ' : '❌ Not quite — '}${esc(card.why || '')}</div>` : ''}`;
  }
  if (card.type === 'recap') {
    return `
      <div class="lesson-kicker">🎯 Recap</div>
      <ul class="lesson-recap-list">
        ${(card.points || []).map(point => `<li>${esc(point)}</li>`).join('')}
      </ul>`;
  }
  return '';
}

function revealLessonAnswer() {
  (_lessonCardState[lessonCardIndex] || (_lessonCardState[lessonCardIndex] = {})).revealed = true;
  renderLessonCard();
}

function selectLessonOption(optionIndex) {
  const state = _lessonCardState[lessonCardIndex] || (_lessonCardState[lessonCardIndex] = {});
  if (state.selected !== undefined) return; // already locked
  state.selected = optionIndex;
  renderLessonCard();
}

function lessonNext() {
  const lesson = lessons[viewerCourseId];
  if (!lesson || lessonCardIndex >= lesson.cards.length - 1) return;
  lessonCardIndex++;
  setLessonCard(currentUser.id, viewerCourseId, lessonCardIndex);
  renderLessonCard();
}

function lessonPrev() {
  if (lessonCardIndex <= 0) return;
  lessonCardIndex--;
  setLessonCard(currentUser.id, viewerCourseId, lessonCardIndex);
  renderLessonCard();
}

function lessonGoTo(cardIndex) {
  lessonCardIndex = cardIndex;
  setLessonCard(currentUser.id, viewerCourseId, lessonCardIndex);
  renderLessonCard();
}

function completeLesson(courseId) {
  if (questions[courseId]) {
    navigate(`/assessment/${courseId}`);
    return;
  }
  setProgress(currentUser.id, courseId, { completed: true });
  toast('✅ Lesson complete!');
  const btn = document.querySelector('#lesson-bottombar .viewer-btn.accent');
  if (btn) { btn.textContent = '✅ Completed'; btn.disabled = true; }
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
  qs.forEach((question, qIndex) => {
    const val = assessmentAnswers[qIndex];
    if (question.type === 'mc') { if (val === question.correct) correct++; }
    else                        { if (val === question.correct) correct++; }
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
          ${qs.map((question, qIndex) => {
            const val = assessmentAnswers[qIndex];
            const ok  = question.type === 'mc' ? val === question.correct : val === question.correct;
            return `<div class="assess-breakdown-row ${ok ? 'ok' : 'wrong'}">
              <span class="assess-breakdown-icon">${ok ? '✓' : '✗'}</span>
              <span class="assess-breakdown-q">${esc(question.question)}</span>
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
  const prog   = getProgress(currentUser.id, courseId);
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
        <div class="cert-score">with a score of <strong>${prog.score ?? 100}%</strong></div>
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
function contentBadge(type) {
  const map = { pdf: ['badge-pdf','PDF Slides'], youtube: ['badge-video','Video'], slides: ['badge-slides','Slides'], scorm: ['badge-scorm','SCORM'], html: ['badge-html','HTML Slides'], none: ['badge-none','Coming Soon'] };
  const [cls, label] = map[type] || map.none;
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Learning Paths ───────────────────────────────────────────────────────────
function getPath(id) { return learningPaths.find(path => path.id === id); }

function renderAdminPaths() {
  setTitle('Learning Paths');
  setMain(`
    <div class="page-header fade-up">
      <div><h1>Learning Paths</h1><p>Bundle courses into structured learning journeys</p></div>
      <button class="btn btn-primary" onclick="showCreatePathModal()">+ New Path</button>
    </div>
    ${learningPaths.length ? `
      <div class="path-grid">
        ${learningPaths.map(path => adminPathCard(path)).join('')}
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
            ${preview.map((courseName, previewIndex) => `
              <div class="path-preview-item">
                <span class="path-num-badge">${previewIndex + 1}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(courseName)}</span>
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
  const query = (document.getElementById('path-course-search')?.value || '').toLowerCase();
  const available = courses.filter(course =>
    !_pathCourseIds.includes(course.id) &&
    (!query || course.title.toLowerCase().includes(query) || course.category.toLowerCase().includes(query))
  );
  const el = document.getElementById('path-search-results');
  if (!el) return;
  if (!available.length) {
    el.innerHTML = `<div style="padding:.65rem 1rem;color:var(--text-muted);font-size:.85rem">${_pathCourseIds.length === courses.length ? 'All courses added' : 'No courses found'}</div>`;
    return;
  }
  el.innerHTML = available.map(course => `
    <div class="path-search-item" onclick="addCourseToPath('${course.id}')">
      <span style="flex:1;font-size:.88rem">${esc(course.title)}</span>
      <span style="font-size:.75rem;color:var(--text-muted);margin-right:.5rem">${esc(course.category)}</span>
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
  const pathIndex = _pathCourseIds.indexOf(courseId);
  if (pathIndex < 0) return;
  const newIndex = pathIndex + dir;
  if (newIndex < 0 || newIndex >= _pathCourseIds.length) return;
  [_pathCourseIds[pathIndex], _pathCourseIds[newIndex]] = [_pathCourseIds[newIndex], _pathCourseIds[pathIndex]];
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
  const pathRecord = getPath(pathId);
  if (pathRecord) { pathRecord.title = title; pathRecord.description = desc; pathRecord.courseIds = [..._pathCourseIds]; }
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
  learningPaths = learningPaths.filter(path => path.id !== pathId);
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
  const visible = filterTeamId ? allLearners.filter(user => user.teamId === filterTeamId) : allLearners;
  const teamTabs = [{ id: '', name: 'All' }, ...allTeams.map(team => ({ id: team.id, name: team.name }))];
  const allAssigned = visible.length > 0 && visible.every(user => path.courseIds.every(cid => isAssigned(user.id, cid)));

  showModal(`
    <div class="modal" onclick="event.stopPropagation()" style="max-width:460px;width:95vw">
      <div class="modal-header">
        <h3>Assign: ${esc(path.title)}</h3>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">Assigns all ${path.courseIds.length} course${path.courseIds.length !== 1 ? 's' : ''} in this path.</p>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.75rem">
          ${teamTabs.map(tab => `<button class="btn btn-sm ${filterTeamId===tab.id?'btn-primary':'btn-outline'}" onclick="showAssignPathModalFiltered('${pathId}','${tab.id}')">${esc(tab.name)}</button>`).join('')}
        </div>
        <div class="gmodal-list">
          ${visible.length ? visible.map(user => {
            const hasAll = path.courseIds.every(cid => isAssigned(user.id, cid));
            return `<div class="assign-row">
              <div class="assign-avatar" style="background:${user.color}">${initials(user.name)}</div>
              <span class="assign-name">${esc(user.name)}</span>
              <button class="btn btn-sm ${hasAll ? 'btn-outline' : 'btn-primary'}" onclick="togglePathAssign('${pathId}','${user.id}','${filterTeamId}')">
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
  const targets = filterTeamId ? learners().filter(user => user.teamId === filterTeamId) : learners();
  const allAssigned = targets.length > 0 && targets.every(user => path.courseIds.every(cid => isAssigned(user.id, cid)));
  if (allAssigned) {
    await Promise.all(targets.flatMap(user => path.courseIds.map(cid => sb.from('assignments').delete().eq('user_id', user.id).eq('course_id', cid))));
    targets.forEach(user => { path.courseIds.forEach(cid => { if (assignments[user.id]) assignments[user.id] = assignments[user.id].filter(id => id !== cid); }); });
  } else {
    await Promise.all(targets.flatMap(user => path.courseIds.filter(cid => !isAssigned(user.id, cid)).map(cid => sb.from('assignments').upsert({ user_id: user.id, course_id: cid }))));
    targets.forEach(user => { path.courseIds.forEach(cid => { if (!assignments[user.id]) assignments[user.id] = []; if (!assignments[user.id].includes(cid)) assignments[user.id].push(cid); }); });
  }
  showAssignPathModalFiltered(pathId, filterTeamId);
}

// ─── Learner Paths ────────────────────────────────────────────────────────────
function renderLearnerPaths() {
  setTitle('Learning Paths');
  const uid = currentUser.id;
  const myPaths = learningPaths.filter(path => path.courseIds.some(cid => isAssigned(uid, cid)));

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
      ${myPaths.map((path, pathIndex) => learnerPathCard(path, uid, pathIndex)).join('')}
    </div>`);
}

function learnerPathCard(path, uid, pathIndex = 0) {
  const assigned = path.courseIds.filter(cid => isAssigned(uid, cid));
  const completed = assigned.filter(cid => getProgress(uid, cid).completed).length;
  const total = assigned.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return `
    <div class="path-card" style="animation-delay:${pathIndex * 0.06}s">
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
            const course = getCourse(cid);
            const prog = getProgress(uid, cid);
            const tlClass = prog.completed ? 'tl-done' : prog.currentSlide > 0 ? 'tl-active' : '';
            const dotIcon = prog.completed ? '✓' : prog.currentSlide > 0 ? '▶' : String(idx + 1);
            const statusLabel = prog.completed ? 'Completed' : prog.currentSlide > 0 ? 'In progress' : 'Not started';
            const btnLabel = prog.completed ? 'Review' : prog.currentSlide > 0 ? 'Continue' : 'Start';
            const btnClass = prog.completed ? 'btn-outline' : 'btn-primary';
            return `
              <div class="path-tl-row ${tlClass}">
                <div class="path-tl-dot">${dotIcon}</div>
                <div class="path-tl-info">
                  <div class="path-tl-name">${esc(course?.title || cid)}</div>
                  <div class="path-tl-status">${statusLabel}</div>
                </div>
                <a href="#/course/${cid}" class="btn btn-sm ${btnClass}" style="flex-shrink:0">${btnLabel}</a>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

