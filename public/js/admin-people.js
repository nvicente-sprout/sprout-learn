// ─── Assign Modal ─────────────────────────────────────────────────────────────
async function showAssignModal(courseId, filterTeamId = '') {
  const [{ data: uData }, { data: aData }] = await Promise.all([
    sb.from('users').select('*').order('created_at', { ascending: true }),
    sb.from('assignments').select('*'),
  ]);
  if (uData) allUsers = uData.map((userData, userIndex) => ({
    id: userData.id, email: userData.email, name: userData.name || userData.email.split('@')[0],
    role: userData.role, isAdmin: userData.is_admin, teamId: userData.team_id || null,
    avatarUrl: userData.avatar_url || null,
    color: USER_COLORS[userIndex % USER_COLORS.length],
  }));
  if (aData) {
    assignments = {};
    aData.forEach(row => {
      if (!assignments[row.user_id]) assignments[row.user_id] = [];
      assignments[row.user_id].push(row.course_id);
    });
  }
  const course = getCourse(courseId);
  const visible = filterTeamId ? learners().filter(user => user.teamId === filterTeamId) : learners();
  const teamTabs = [{ id: '', name: 'All' }, ...allTeams.map(team => ({ id: team.id, name: team.name }))];
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header">
        <h2>Assign: ${esc(course?.title || '')}</h2>
        <button class="gmodal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="gmodal-body">
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.75rem">
          ${teamTabs.map(tab => `<button class="btn btn-sm ${filterTeamId===tab.id?'btn-primary':'btn-outline'}" onclick="showAssignModal('${courseId}','${tab.id}')">${esc(tab.name)}</button>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <span style="font-size:.85rem;color:var(--text-muted)">${visible.length} member${visible.length!==1?'s':''}</span>
          <button class="btn btn-outline btn-sm" onclick="toggleAssignAll('${courseId}','${filterTeamId}')">Assign All</button>
        </div>
        <div class="assignee-list" id="assignee-list">
          ${visible.map(user => `
            <div class="assignee-item ${isAssigned(user.id,courseId)?'selected':''}" id="assignee-${user.id}" onclick="toggleAssignee('${user.id}','${courseId}')">
              <input type="checkbox" class="assignee-check" ${isAssigned(user.id,courseId)?'checked':''} />
              ${avatarHTML(user, 32)}
              <div><div style="font-weight:600;font-size:.88rem">${esc(user.name)}</div><div style="font-size:.75rem;color:var(--text-muted)">${esc(allTeams.find(team=>team.id===user.teamId)?.name||'')}</div></div>
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
  const particle = document.createElement('span');
  particle.className = 'assign-particle';
  particle.textContent = assigned ? '✓' : '✕';
  particle.style.color = assigned ? 'var(--accent-dark)' : '#e53935';
  item.appendChild(particle);
  setTimeout(() => particle.remove(), 480);
}

function toggleAssignAll(courseId, filterTeamId = '') {
  const targets = filterTeamId ? learners().filter(user => user.teamId === filterTeamId) : learners();
  const allAssigned = targets.every(user => isAssigned(user.id, courseId));
  targets.forEach(user => {
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
  if (searchQ) members = members.filter(user =>
    user.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQ.toLowerCase()));
  if (filterTeam) members = members.filter(user => user.teamId === filterTeam);
  members = [...members].sort((itemA, itemB) => {
    if (sortBy === 'progress')    return userAvgProgress(itemB.id) - userAvgProgress(itemA.id);
    if (sortBy === 'completions') return userCompletions(itemB.id) - userCompletions(itemA.id);
    return itemA.name.localeCompare(itemB.name);
  });

  // Group by team
  const grouped = {};
  members.forEach(user => {
    const key = user.teamId || '__none__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(user);
  });
  const teamsToShow = filterTeam ? allTeams.filter(team => team.id === filterTeam) : allTeams;
  const teamSections = teamsToShow.map(team => ({ team, members: grouped[team.id] || [] }));
  if (!filterTeam && grouped['__none__']?.length)
    teamSections.push({ team: null, members: grouped['__none__'] });

  const memberCard = (user, cardIndex) => {
    const assigned   = getUserAssignments(user.id).length;
    const done       = userCompletions(user.id);
    const avg        = userAvgProgress(user.id);
    const badgeColor = done === assigned && assigned > 0 ? '#2e7d32' : done > 0 ? '#e65100' : '#757575';

    let progressBlock = '';
    if (filterCourse) {
      const course = getCourse(filterCourse);
      const prog   = getProgress(user.id, filterCourse);
      const isAssignedHere = getUserAssignments(user.id).includes(filterCourse);
      if (!isAssignedHere) {
        progressBlock = `<div style="font-size:.8rem;color:var(--text-muted);margin:.4rem 0">Not assigned</div>`;
      } else if (prog.completed) {
        const col = prog.passed ? 'var(--accent-dark)' : '#e53935';
        const lbl = prog.passed ? '✓ Passed' : '✗ Failed';
        progressBlock = `
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin:.4rem 0">
            <span style="font-weight:700;color:${col}">${lbl}</span>
            ${prog.score != null ? `<span style="color:var(--text-muted)">${prog.score}%</span>` : ''}
          </div>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:100%;background:${col}"></div></div>`;
      } else if (prog.currentSlide > 0) {
        const pct = Math.min(80, course?.totalPages ? Math.round((prog.currentSlide / course.totalPages) * 100) : 0);
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

    return `<div class="member-card" style="animation-delay:${cardIndex*0.05}s">
      <div class="member-card-top">
        ${avatarHTML(user, 44)}
        <div class="member-info">
          <div class="member-name">${esc(user.name)}</div>
          <div class="member-role">${esc(allTeams.find(team=>team.id===user.teamId)?.name||'No team')}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${esc(user.email)}</div>
        </div>
        <span class="badge" style="background:${badgeColor};color:white">${done}/${assigned}</span>
      </div>
      ${progressBlock}
      <div style="display:flex;gap:.5rem;margin-top:.5rem">
        <button class="btn btn-outline btn-sm" onclick="promoteUser('${user.id}')">⬆ Make Admin</button>
        <button class="btn btn-outline btn-sm" onclick="editUserRole('${user.id}')">✏️ Edit</button>
      </div>
    </div>`;
  };

  const teamSection = ({ team, members: ms }) => {
    const label   = team ? esc(team.name) : 'No Team';
    const avgTeam = ms.length ? Math.round(ms.reduce((sum, member) => sum + userAvgProgress(member.id), 0) / ms.length) : 0;
    const allDone = ms.filter(user => { const assigned = getUserAssignments(user.id).length; return assigned > 0 && userCompletions(user.id) === assigned; }).length;
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
        : `<div class="member-grid">${ms.map((member, index) => memberCard(member, index)).join('')}</div>`}
    </div>`;
  };

  const adminsHTML = allUsers.filter(user => user.isAdmin).map((user, adminIndex) => `
    <div class="member-card" style="animation-delay:${adminIndex*0.07}s">
      <div class="member-card-top">
        ${avatarHTML(user, 44)}
        <div class="member-info">
          <div class="member-name">${esc(user.name)}</div>
          <div class="member-role">${esc(allTeams.find(team=>team.id===user.teamId)?.name||'')}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${esc(user.email)}</div>
        </div>
        <span class="badge badge-done">Admin</span>
      </div>
      ${user.id !== currentUser.id ? `<div style="margin-top:.5rem"><button class="btn btn-outline btn-sm" onclick="demoteUser('${user.id}')">⬇ Make Learner</button></div>` : '<div style="font-size:.75rem;color:var(--text-muted);margin-top:.5rem">That\'s you</div>'}
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
        ${allTeams.map(team => `<option value="${team.id}" ${filterTeam===team.id?'selected':''}>${esc(team.name)}</option>`).join('')}
      </select>
      <select class="toolbar-select" id="tp-course"
        onchange="renderAdminTeam(document.getElementById('tp-team')?.value,this.value,document.querySelector('.toolbar-search input')?.value,document.getElementById('tp-sort')?.value)">
        <option value="">All Courses</option>
        ${courses.map(course => `<option value="${course.id}" ${filterCourse===course.id?'selected':''}>${esc(course.title)}</option>`).join('')}
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
  const user = getUser(userId);
  if (!user || !confirm(`Make ${user.name} an Admin?`)) return;
  await sb.from('users').update({ is_admin: true }).eq('id', userId);
  user.isAdmin = true;
  toast(`${user.name} is now an Admin`);
  renderAdminTeam();
}

async function demoteUser(userId) {
  const user = getUser(userId);
  if (!user || !confirm(`Remove Admin from ${user.name}?`)) return;
  await sb.from('users').update({ is_admin: false }).eq('id', userId);
  user.isAdmin = false;
  toast(`${user.name} is now a Learner`);
  renderAdminTeam();
}

function editUserRole(userId) {
  const user = getUser(userId);
  if (!user) return;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header"><h2>Edit Name</h2><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input id="edit-name" class="form-input" value="${esc(user.name)}" />
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
  const user = getUser(userId);
  if (user) { user.name = name; }
  closeModal();
  toast('Saved!');
  renderAdminTeam();
}

