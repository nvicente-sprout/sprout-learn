// ─── Settings ─────────────────────────────────────────────────────────────────
function renderAdminSettings(filterTeam = '') {
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
          : allTeams.map(team => `
              <div class="settings-list-item">
                <span style="font-weight:600">${esc(team.name)}</span>
                <div style="display:flex;gap:.5rem">
                  <button class="btn btn-outline btn-sm" onclick="showRenameTeamModal('${team.id}','${esc(team.name)}')">✏️ Rename</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteTeam('${team.id}','${esc(team.name)}')">🗑</button>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <h2 class="section-heading" style="margin:0">User Access</h2>
        <select id="settings-team-filter" class="toolbar-select" onchange="renderAdminSettings(this.value)">
          <option value="" ${filterTeam===''?'selected':''}>All Teams</option>
          ${allTeams.map(team => `<option value="${team.id}" ${filterTeam===team.id?'selected':''}>${esc(team.name)}</option>`).join('')}
          <option value="__none__" ${filterTeam==='__none__'?'selected':''}>No Team</option>
        </select>
      </div>
      <div class="settings-list">
        ${allUsers
          .filter(member => {
            if (filterTeam === '__none__') return !member.teamId;
            if (filterTeam) return member.teamId === filterTeam;
            return true;
          })
          .map(member => {
            const memberTeam = allTeams.find(team => team.id === member.teamId);
            return `<div class="settings-list-item">
              <div style="display:flex;align-items:center;gap:.75rem;min-width:0">
                ${avatarHTML(member, 38, 'flex-shrink:0')}
                <div style="min-width:0">
                  <div style="font-weight:600;font-size:.9rem">${esc(member.name)}</div>
                  <div style="font-size:.74rem;color:var(--text-muted)">${esc(member.email)} · ${memberTeam ? esc(memberTeam.name) : '<em>No team</em>'}</div>
                </div>
              </div>
              <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">
                ${member.isAdmin ? `<span class="badge badge-done">Admin</span>` : `<span class="badge badge-none">Learner</span>`}
                ${member.id !== currentUser.id ? `<button class="btn btn-outline btn-sm" onclick="${member.isAdmin ? `demoteUser('${member.id}')` : `promoteUser('${member.id}')`}">${member.isAdmin ? '⬇' : '⬆'}</button>` : ''}
                <button class="btn btn-outline btn-sm" onclick="showEditUserModal('${member.id}')">✏️</button>
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
  allTeams.sort((teamA, teamB) => teamA.name.localeCompare(teamB.name));
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
  const teamToRename = allTeams.find(team => team.id === id);
  if (teamToRename) teamToRename.name = name;
  closeModal();
  toast('Team renamed!');
  renderAdminSettings();
}

async function deleteTeam(id, name) {
  if (!confirm(`Delete team "${name}"? Users in this team will have no team assigned.`)) return;
  const { error } = await sb.from('teams').delete().eq('id', id);
  if (error) { toast('Failed: ' + error.message, 'error'); return; }
  // Clear team_id in DB for all users who were in this team
  await sb.from('users').update({ team_id: null }).eq('team_id', id);
  allTeams = allTeams.filter(team => team.id !== id);
  allUsers.forEach(user => { if (user.teamId === id) user.teamId = null; });
  toast('Team deleted');
  renderAdminSettings();
}

function showEditUserModal(userId) {
  const user = getUser(userId);
  if (!user) return;
  showModal(`
    <div class="modal" onclick="event.stopPropagation()">
      <div class="gmodal-header"><h2>Edit User</h2><button class="gmodal-close" onclick="closeModal()">✕</button></div>
      <div class="gmodal-body">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input id="eu-name" class="form-input" value="${esc(user.name)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Team</label>
          <select id="eu-team" class="form-select">
            <option value="">— No team —</option>
            ${allTeams.map(team => `<option value="${team.id}" ${user.teamId === team.id ? 'selected' : ''}>${esc(team.name)}</option>`).join('')}
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
  const user = getUser(userId);
  if (user) { user.name = name; user.teamId = teamId; }
  const prevFilter = document.getElementById('settings-team-filter')?.value || '';
  closeModal();
  toast('Saved!');
  renderAdminSettings(prevFilter);
}

// ─── Leaderboard (shared admin/learner) ───────────────────────────────────────
function renderLeaderboard(isAdmin, filterCourseId) {
  setTitle('Leaderboard');
  const medals = ['🥇','🥈','🥉'];
  const allCourses = courses.filter(course => course.published !== false);

  // Overall ranking by XP
  const overallRanked = [...learners()]
    .map(user => ({ ...user, xp: userXP(user.id), level: userLevel(user.id), badges: userBadges(user.id), done: userCompletions(user.id) }))
    .sort((itemA, itemB) => itemB.xp - itemA.xp);

  let perModuleRanked = null;
  if (filterCourseId) {
    const course = getCourse(filterCourseId);
    perModuleRanked = [...learners()]
      .filter(user => isAssigned(user.id, filterCourseId))
      .map(user => {
        const progressEntry = getProgress(user.id, filterCourseId);
        return { ...user, score: progressEntry.score ?? null, passed: progressEntry.passed, completed: progressEntry.completed };
      })
      .sort((itemA, itemB) => {
        if (itemB.score !== null && itemA.score === null) return 1;
        if (itemA.score !== null && itemB.score === null) return -1;
        return (itemB.score ?? -1) - (itemA.score ?? -1);
      });
  }

  const filterBar = `
    <div style="margin-bottom:1.25rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
      <label style="font-weight:600;font-size:.9rem">Filter by module:</label>
      <select onchange="renderLeaderboard(${isAdmin}, this.value || null)" style="padding:.4rem .75rem;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:.9rem;cursor:pointer">
        <option value="" ${!filterCourseId ? 'selected' : ''}>Overall</option>
        ${allCourses.map(course => `<option value="${course.id}" ${filterCourseId === course.id ? 'selected' : ''}>${esc(course.title)}</option>`).join('')}
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
          : perModuleRanked.map((user, rank) => {
              const scoreDisplay = user.score !== null ? `${user.score}%` : '—';
              const statusBadge = user.completed
                ? `<span class="lb-status-badge ${user.passed?'pass':'fail'}">${user.passed ? '✅ Passed' : '❌ Failed'}</span>`
                : `<span class="lb-status-badge">Not taken</span>`;
              return `<div class="lb-item ${rank===0&&user.score!==null?'top1':''}" style="animation-delay:${rank*0.07}s">
                <div class="lb-rank">${user.score !== null ? (medals[rank] || `#${rank+1}`) : '—'}</div>
                ${avatarHTML(user, 42)}
                <div class="lb-info"><div class="lb-name">${esc(user.name)}</div><div class="lb-role">${esc(allTeams.find(team=>team.id===user.teamId)?.name||'')}</div></div>
                <div>${statusBadge}</div>
                <div class="lb-stats"><strong>${scoreDisplay}</strong> score</div>
              </div>`;
            }).join('')}
      </div>`);
    return;
  }

  // Team standings
  const teamStandings = allTeams.map(team => {
    const members   = learners().filter(user => user.teamId === team.id);
    const tAssigned  = members.reduce((sum, user) => sum + getUserAssignments(user.id).length, 0);
    const tCompleted = members.reduce((sum, user) => sum + userCompletions(user.id), 0);
    const rate = tAssigned ? Math.round((tCompleted / tAssigned) * 100) : 0;
    const scores = members.flatMap(user =>
      getUserAssignments(user.id).map(cid => getProgress(user.id, cid)).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined).map(progressEntry => progressEntry.score)
    );
    const avgSc = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0)/scores.length) : null;
    const totalXP = members.reduce((sum, user) => sum + userXP(user.id), 0);
    return { team, members: members.length, tAssigned, tCompleted, rate, avgSc, totalXP };
  }).sort((itemA, itemB) => itemB.rate - itemA.rate || itemB.totalXP - itemA.totalXP);
  const maxRate = Math.max(...teamStandings.map(standing => standing.rate), 1);
  const myTeamId = currentUser?.teamId;

  setMain(`
    <div class="page-header"><h1>🏆 Leaderboard</h1><p>Individual rankings, team standings & achievements</p></div>
    ${filterBar}
    <div class="lb-two-col">
      <div>
        <p class="section-heading">Individual Rankings</p>
        <div class="leaderboard-list">
          ${overallRanked.map((user, rank) => {
            const next = userNextLevel(user.id);
            const xpToNext = next ? `<div style="font-size:.7rem;color:var(--text-muted)">${next.xpNeeded} XP to ${next.label}</div>` : `<div style="font-size:.7rem;color:var(--accent);font-weight:700">Max Level!</div>`;
            const badgeIcons = user.badges.map(badge => `<span title="${badge.label}: ${badge.desc}" style="font-size:1.1rem;cursor:default">${badge.icon}</span>`).join('');
            const isMe = user.id === currentUser?.id;
            return `<div class="lb-item ${rank===0?'top1':''} ${isMe?'lb-item--me':''}" style="animation-delay:${rank*0.07}s">
              <div class="lb-rank">${medals[rank] || `#${rank+1}`}</div>
              ${avatarHTML(user, 42)}
              <div class="lb-info">
                <div class="lb-name">${esc(user.name)}${isMe?'<span class="ld-you-badge" style="margin-left:.4rem">You</span>':''}</div>
                <div class="lb-role">${user.level.icon} ${user.level.label} &nbsp;·&nbsp; ${esc(allTeams.find(team=>team.id===user.teamId)?.name||'')}</div>
              </div>
              <div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap">${badgeIcons}</div>
              <div style="text-align:right;min-width:90px">
                <div style="font-size:1.1rem;font-weight:800;color:var(--accent)">${user.xp} XP</div>
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
            teamStandings.map((standing, standingIndex) => {
              const teamMedals = ['🥇','🥈','🥉'];
              const isMe = standing.team.id === myTeamId;
              const barW = maxRate > 0 ? Math.round((standing.rate / maxRate) * 100) : 0;
              const barColor = standing.rate >= 70 ? '#2e7d32' : standing.rate >= 40 ? '#f57c00' : '#c62828';
              return `<div class="lb-team-item ${isMe?'lb-team-item--me':''}" style="animation-delay:${standingIndex*0.08}s">
                <div class="lb-team-rank">${teamMedals[standingIndex]||`#${standingIndex+1}`}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem">
                    <span style="font-weight:700;font-size:.95rem">${esc(standing.team.name)}</span>
                    ${isMe?'<span class="ld-you-badge">Your team</span>':''}
                  </div>
                  <div style="display:flex;gap:.75rem;font-size:.77rem;color:var(--text-muted);margin-bottom:.5rem">
                    <span>👥 ${standing.members} member${standing.members!==1?'s':''}</span>
                    <span>✅ ${standing.tCompleted}/${standing.tAssigned} done</span>
                    ${standing.avgSc !== null ? `<span>📊 ${standing.avgSc}% avg</span>` : ''}
                    <span>⚡ ${standing.totalXP} XP</span>
                  </div>
                  <div class="lb-team-bar-wrap">
                    <div class="lb-team-bar-fill" style="width:${barW}%;background:${isMe?'var(--accent-dark)':barColor}"></div>
                  </div>
                </div>
                <div style="font-size:1.05rem;font-weight:800;color:${isMe?'var(--accent-dark)':barColor};min-width:42px;text-align:right">${standing.rate}%</div>
              </div>`;
            }).join('')}
        </div>
        <p class="section-heading" style="margin-top:1.5rem">Badges</p>
        <div class="badges-grid">
          ${BADGES.map(badge => `
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
  const totalCompletions = allLearners.reduce((sum, user) => sum + userCompletions(user.id), 0);
  const totalAssigned    = allLearners.reduce((sum, user) => sum + getUserAssignments(user.id).length, 0);
  const scoredProgress   = Object.values(progress).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined);
  const avgScore         = scoredProgress.length
    ? Math.round(scoredProgress.reduce((sum, progressEntry) => sum + progressEntry.score, 0) / scoredProgress.length)
    : 0;
  const completionRate   = totalAssigned ? Math.round((totalCompletions / totalAssigned) * 100) : 0;

  // Per-team stats
  const teamRows = allTeams.map(team => {
    const members = allLearners.filter(user => user.teamId === team.id);
    const assigned = members.reduce((sum, user) => sum + getUserAssignments(user.id).length, 0);
    const completed = members.reduce((sum, user) => sum + userCompletions(user.id), 0);
    const rate = assigned ? Math.round((completed / assigned) * 100) : 0;
    const teamScores = members.flatMap(user =>
      getUserAssignments(user.id).map(cid => getProgress(user.id, cid)).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined).map(progressEntry => progressEntry.score)
    );
    const teamAvgScore = teamScores.length ? Math.round(teamScores.reduce((sum, score) => sum + score, 0)/teamScores.length) : null;
    return { team, members, assigned, completed, rate, teamAvgScore };
  }).sort((itemA, itemB) => itemB.rate - itemA.rate);

  // Per-course stats
  const courseRows = courses.map(course => {
    const assignedUsers = allLearners.filter(user => isAssigned(user.id, course.id));
    const completedUsers = assignedUsers.filter(user => getProgress(user.id, course.id).completed);
    const cScores = assignedUsers.map(user => getProgress(user.id, course.id)).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined).map(progressEntry => progressEntry.score);
    const cAvgScore = cScores.length ? Math.round(cScores.reduce((sum, score) => sum + score, 0)/cScores.length) : null;
    const passRate = assignedUsers.length ? Math.round((completedUsers.length / assignedUsers.length) * 100) : 0;
    return { course, assigned: assignedUsers.length, completed: completedUsers.length, passRate, cAvgScore };
  }).sort((itemA, itemB) => itemB.assigned - itemA.assigned);

  // Top performers
  const topPerformers = [...allLearners]
    .sort((itemA, itemB) => userCompletions(itemB.id) - userCompletions(itemA.id) || userAvgProgress(itemB.id) - userAvgProgress(itemA.id))
    .slice(0, 5);

  // Donut chart SVG helper
  const svgRadius = 54, circ = +(2 * Math.PI * svgRadius).toFixed(1);
  const donutChart = (pct, label, color) => {
    const offset = +(circ * (1 - pct / 100)).toFixed(1);
    return `<svg width="148" height="148" viewBox="0 0 148 148">
      <circle cx="74" cy="74" r="${svgRadius}" fill="none" stroke="#e8f5e9" stroke-width="14"/>
      <circle cx="74" cy="74" r="${svgRadius}" fill="none" stroke="${color}" stroke-width="14"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 74 74)"
        style="transition:stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)"/>
      <text x="74" y="69" text-anchor="middle" font-size="24" font-weight="800" fill="#1B3A1B">${pct}%</text>
      <text x="74" y="88" text-anchor="middle" font-size="10" fill="#5a6a5a">${label}</text>
    </svg>`;
  };

  // Horizontal bar for team chart
  const maxTeamRate = Math.max(...teamRows.map(teamRow => teamRow.rate), 1);
  const teamBarColor = teamRow => teamRow.rate >= 70 ? '#2e7d32' : teamRow.rate >= 40 ? '#f59c00' : '#e53935';

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
            ${teamRows.map((teamRow, index) => `
              <div class="reports-bar-row" style="animation-delay:${index*.07+.2}s">
                <div class="reports-bar-label" title="${esc(teamRow.team.name)}">${esc(teamRow.team.name)}</div>
                <div class="reports-bar-track">
                  <div class="reports-bar-fill" style="width:${Math.round((teamRow.rate/maxTeamRate)*100)}%;background:${teamBarColor(teamRow)}"></div>
                </div>
                <div class="reports-bar-pct" style="color:${teamBarColor(teamRow)}">${teamRow.rate}%</div>
              </div>`).join('')}
          </div>
          <div style="font-size:.76rem;color:var(--text-muted);margin-top:.75rem;text-align:right">${teamRows.length} team${teamRows.length!==1?'s':''} · ${totalLearners} learner${totalLearners!==1?'s':''}</div>
        ` : '<p style="color:var(--text-muted);font-size:.88rem;padding:.5rem 0">No teams configured yet.</p>'}
      </div>
    </div>

    <div class="reports-section">
      <p class="section-heading">Top Performers</p>
      <div class="reports-top-list">
        ${topPerformers.length ? topPerformers.map((user, performerIndex) => {
          const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
          const done = userCompletions(user.id);
          const avg  = userAvgProgress(user.id);
          const teamName = allTeams.find(team=>team.id===user.teamId)?.name || '—';
          const maxDone  = userCompletions(topPerformers[0].id) || 1;
          return `<div class="reports-top-item reports-top-item--clickable" style="animation-delay:${performerIndex*.06}s" onclick="openReportsUserPanel('${user.id}')">
            <div class="reports-top-rank">${medals[performerIndex]||`#${performerIndex+1}`}</div>
            ${avatarHTML(user, 38)}
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.9rem">${esc(user.name)}</div>
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
            ${courseRows.length ? courseRows.map(courseRow => {
              const barColor = courseRow.passRate >= 70 ? '#2e7d32' : courseRow.passRate >= 40 ? '#f57c00' : courseRow.passRate > 0 ? '#c62828' : '#ccc';
              return `<tr class="reports-table-row--clickable" onclick="openReportsCoursePanel('${courseRow.course.id}')">
                <td>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    ${courseRow.course.coverUrl ? `<img src="${courseRow.course.coverUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0" />` : `<div style="width:36px;height:36px;border-radius:6px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${CAT_EMOJI[courseRow.course.category]||'📚'}</div>`}
                    <div>
                      <div style="font-weight:600;font-size:.85rem">${esc(courseRow.course.title)}</div>
                      <div style="font-size:.75rem;color:var(--text-muted)">${esc(courseRow.course.category)}</div>
                    </div>
                  </div>
                </td>
                <td style="text-align:center;font-weight:600">${courseRow.assigned}</td>
                <td style="text-align:center;font-weight:600">${courseRow.completed}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:.5rem;min-width:120px">
                    <div style="flex:1;background:#e8f5e9;border-radius:99px;height:7px;overflow:hidden">
                      <div style="width:${courseRow.passRate}%;height:100%;background:${barColor};border-radius:99px;transition:width .7s ease"></div>
                    </div>
                    <span style="font-size:.8rem;font-weight:700;color:${barColor};white-space:nowrap">${courseRow.passRate}%</span>
                  </div>
                </td>
                <td style="text-align:center;color:var(--text-muted);font-size:.85rem">${courseRow.cAvgScore !== null ? courseRow.cAvgScore + '%' : '—'}</td>
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
  allLearners.forEach(user => {
    const teamName = allTeams.find(team=>team.id===user.teamId)?.name || '';
    const assigned  = getUserAssignments(user.id).length;
    const completed = userCompletions(user.id);
    const avgProg   = userAvgProgress(user.id);
    const scores    = getUserAssignments(user.id).map(cid => getProgress(user.id, cid)).filter(progressEntry=>progressEntry.score!==null&&progressEntry.score!==undefined).map(progressEntry=>progressEntry.score);
    const avgSc     = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0)/scores.length) : '';
    rows.push([user.name, teamName, user.email, assigned, completed, avgProg, avgSc]);
  });
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(',')).join('\n');
  const anchor = document.createElement('a');
  anchor.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  anchor.download = `sprout-learn-report-${new Date().toISOString().slice(0,10)}.csv`;
  anchor.click();
}

// ─── Reports Detail Pages ─────────────────────────────────────────────────────
function renderReportsUser(userId) {
  const user = getUser(userId);
  if (!user) { navigate('/admin/reports'); return; }
  setTitle(user.name + ' — Report');
  const teamName = allTeams.find(team => team.id === user.teamId)?.name || '—';
  const assignedCids = getUserAssignments(userId);

  const rows = assignedCids.map(cid => {
    const course = getCourse(cid);
    const progressEntry = getProgress(userId, cid);
    return { course, progressEntry };
  });

  const completed = rows.filter(row => row.progressEntry.completed).length;
  const scores = rows.filter(row => row.progressEntry.score !== null && row.progressEntry.score !== undefined).map(row => row.progressEntry.score);
  const avgScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

  setMain(`
    <div class="page-header fade-up">
      <button class="btn btn-outline btn-sm" onclick="navigate('/admin/reports')">← Back to Reports</button>
    </div>
    <div class="rpt-detail-hero fade-up">
      ${avatarHTML(user, 56)}
      <div>
        <div class="rpt-detail-name">${esc(user.name)}</div>
        <div class="rpt-detail-meta">${esc(teamName)} · ${esc(user.email)}</div>
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
          ${rows.length ? rows.map(({ course, progressEntry }) => {
            if (!course) return '';
            const statusColor = progressEntry.completed ? '#2e7d32' : '#f57c00';
            const statusLabel = progressEntry.completed ? '✅ Completed' : progressEntry.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
            const pct = progressEntry.completed ? 100 : Math.min(80, course.totalPages ? Math.round((progressEntry.currentSlide / course.totalPages) * 100) : 0);
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:.6rem">
                  ${course.coverUrl ? `<img src="${course.coverUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0"/>` : `<div style="width:36px;height:36px;border-radius:6px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${CAT_EMOJI[course.category]||'📚'}</div>`}
                  <div>
                    <div style="font-weight:600;font-size:.85rem">${esc(course.title)}</div>
                    <div style="font-size:.75rem;color:var(--text-muted)">${esc(course.category)}</div>
                  </div>
                </div>
              </td>
              <td><span style="font-size:.83rem;font-weight:600;color:${statusColor}">${statusLabel}</span></td>
              <td style="text-align:center;font-weight:700;color:var(--primary)">${progressEntry.score !== null && progressEntry.score !== undefined ? progressEntry.score + '%' : '—'}</td>
              <td style="min-width:120px">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <div style="flex:1;background:#e8f5e9;border-radius:99px;height:7px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${progressEntry.completed ? '#2e7d32' : '#4a9e4a'};border-radius:99px"></div>
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
  const course = getCourse(courseId);
  if (!course) { navigate('/admin/reports'); return; }
  setTitle(course.title + ' — Report');
  const assignedUsers = learners().filter(user => isAssigned(user.id, courseId));
  const completedUsers = assignedUsers.filter(user => getProgress(user.id, courseId).completed);
  const scores = assignedUsers.map(user => getProgress(user.id, courseId)).filter(progressEntry => progressEntry.score !== null && progressEntry.score !== undefined).map(progressEntry => progressEntry.score);
  const avgScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const passRate = assignedUsers.length ? Math.round((completedUsers.length / assignedUsers.length) * 100) : 0;
  const barColor = passRate >= 70 ? '#2e7d32' : passRate >= 40 ? '#f57c00' : '#c62828';

  setMain(`
    <div class="page-header fade-up">
      <button class="btn btn-outline btn-sm" onclick="navigate('/admin/reports')">← Back to Reports</button>
    </div>
    <div class="rpt-detail-hero fade-up">
      ${course.coverUrl ? `<img src="${course.coverUrl}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;flex-shrink:0"/>` : `<div style="width:56px;height:56px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0">${CAT_EMOJI[course.category]||'📚'}</div>`}
      <div>
        <div class="rpt-detail-name">${esc(course.title)}</div>
        <div class="rpt-detail-meta">${esc(course.category)} · ${contentBadge(course.contentType)}</div>
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
          ${assignedUsers.length ? assignedUsers.map(user => {
            const progressEntry = getProgress(user.id, courseId);
            const teamName = allTeams.find(team => team.id === user.teamId)?.name || '—';
            const statusColor = progressEntry.completed ? '#2e7d32' : '#f57c00';
            const statusLabel = progressEntry.completed ? '✅ Completed' : progressEntry.currentSlide > 0 ? '🕐 In Progress' : '○ Not Started';
            const pct = progressEntry.completed ? 100 : Math.min(80, course.totalPages ? Math.round((progressEntry.currentSlide / course.totalPages) * 100) : 0);
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:.6rem">
                  ${avatarHTML(user, 32)}
                  <div style="font-weight:600;font-size:.85rem">${esc(user.name)}</div>
                </div>
              </td>
              <td style="font-size:.83rem;color:var(--text-muted)">${esc(teamName)}</td>
              <td><span style="font-size:.83rem;font-weight:600;color:${statusColor}">${statusLabel}</span></td>
              <td style="text-align:center;font-weight:700;color:var(--primary)">${progressEntry.score !== null && progressEntry.score !== undefined ? progressEntry.score + '%' : '—'}</td>
              <td style="min-width:120px">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <div style="flex:1;background:#e8f5e9;border-radius:99px;height:7px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${progressEntry.completed ? '#2e7d32' : '#4a9e4a'};border-radius:99px"></div>
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

