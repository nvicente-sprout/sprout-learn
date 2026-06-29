// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function renderAdminDashboard() {
  setTitle('Dashboard');
  const totalCompletions = learners().reduce((sum, user) => sum + userCompletions(user.id), 0);
  const avgProg = learners().length
    ? Math.round(learners().reduce((sum, user) => sum + userAvgProgress(user.id), 0) / learners().length)
    : 0;

  const topLearners = [...learners()]
    .sort((itemA, itemB) => userCompletions(itemB.id) - userCompletions(itemA.id) || userAvgProgress(itemB.id) - userAvgProgress(itemA.id))
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
      ${topLearners.map((user, rank) => lbItem(user, rank)).join('')}
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

function lbItem(user, rank) {
  const medals = ['🥇','🥈','🥉'];
  const done = userCompletions(user.id);
  const avg  = userAvgProgress(user.id);
  return `<div class="lb-item ${rank===0?'top1':''}" style="animation-delay:${rank*0.07}s">
    <div class="lb-rank">${medals[rank] || `#${rank+1}`}</div>
    ${avatarHTML(user, 38)}
    <div class="lb-info"><div class="lb-name">${esc(user.name)}</div><div class="lb-role">${esc(allTeams.find(team=>team.id===user.teamId)?.name||'')}</div></div>
    <div class="lb-stats"><strong>${done}</strong> completions &nbsp;·&nbsp; ${avg}% avg</div>
  </div>`;
}

// ─── Admin Courses ────────────────────────────────────────────────────────────
function renderAdminCourses(filterQ = '', filterCat = '') {
  setTitle('Courses');
  let filtered = courses.filter(course => {
    const matchQ   = !filterQ   || course.title.toLowerCase().includes(filterQ.toLowerCase()) || course.category.toLowerCase().includes(filterQ.toLowerCase());
    const matchCat = !filterCat || course.category === filterCat;
    return matchQ && matchCat;
  });

  const gridHTML = filtered.length ? filtered.map(course => adminCourseCard(course)).join('') : '<div class="empty-state"><span class="empty-icon">📭</span><h2>No courses found</h2><p>Try different filters.</p></div>';

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
        ${CATEGORIES.map(cat => `<option value="${esc(cat)}" ${filterCat===cat?'selected':''}>${esc(cat)}</option>`).join('')}
      </select>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-primary btn-sm" onclick="showAddCoursePickerModal()">+ Add Course</button>
    </div>
    <div class="course-grid">${gridHTML}</div>`);
}

function courseCoverHTML(course) {
  if (course.coverUrl) {
    return `<div class="course-card-cover"><img src="${course.coverUrl}" alt="" /></div>`;
  }
  return `<div class="course-card-cover course-card-cover--placeholder">
    <img src="assets/logos/logo-icon-green.svg" alt="Sprout Learn" class="cover-placeholder-logo" />
    <span class="cover-placeholder-title">${esc(course.title)}</span>
  </div>`;
}

function adminCoverHTML(course) {
  const inner = course.coverUrl
    ? `<img src="${course.coverUrl}" alt="" />`
    : `<img src="assets/logos/logo-icon-green.svg" alt="Sprout Learn" class="cover-placeholder-logo" /><span class="cover-placeholder-title">${esc(course.title)}</span>`;
  return `<div class="course-card-cover course-card-cover--editable" onclick="triggerCoverUpload('${course.id}')" title="Change cover image">
    ${inner}
    <div class="cover-edit-overlay">📷 Change Cover</div>
    <input type="file" accept="image/*" id="cover-input-${course.id}" style="display:none" onchange="handleCoverChange('${course.id}',this)" />
  </div>`;
}

function adminCourseCard(course) {
  const qs = questions[course.id];
  return `<div class="course-card" style="animation-delay:${courses.indexOf(course)*0.04}s">
    ${adminCoverHTML(course)}
    <div class="course-card-body">
      <div class="course-card-badges">
        ${contentBadge(course.contentType)}
        ${qs ? `<span class="badge badge-q">${qs.length} Q</span>` : ''}
      </div>
      <div class="course-card-title">${esc(course.title)}</div>
      <div class="course-card-desc">${esc(course.description)}</div>
      <div class="course-card-meta">${CAT_EMOJI[course.category]||'📚'} ${esc(course.category)} ${course.totalPages ? `· ${course.totalPages} slides` : ''}</div>
      ${course.createdBy ? `<div class="course-card-publisher">by ${esc(allUsers.find(user => user.id === course.createdBy)?.name || 'Unknown')}</div>` : ''}
      <div class="course-card-actions">
        <a href="#/course/${course.id}" class="btn btn-accent btn-sm">▶ Preview</a>
        <button class="btn btn-outline btn-sm" onclick="showAssignModal('${course.id}')">👥 Assign</button>
        <button class="btn btn-outline btn-sm" onclick="${qs ? `showManualBuilderModal('${course.id}')` : `showAddQuestionsModal('${course.id}')`}">${qs ? '✏️ Edit Questions' : '+ Questions'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCourse('${course.id}')">🗑</button>
      </div>
    </div>
  </div>`;
}

async function deleteCourse(id) {
  if (!confirm('Delete this course?')) return;
  courses = courses.filter(course => course.id !== id);
  delete questions[id];
  Object.keys(assignments).forEach(uid => {
    assignments[uid] = assignments[uid].filter(cid => cid !== id);
  });
  Object.keys(progress).forEach(key => { if (key.includes(`_${id}`)) delete progress[key]; });
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
      const imageEl = new Image();
      imageEl.onload = () => res(imageEl);
      imageEl.onerror = rej;
      imageEl.src = URL.createObjectURL(file);
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
              ${CATEGORIES.map(cat => `<option>${esc(cat)}</option>`).join('')}
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
    type: 'Free',
    contentType: ytId ? 'youtube' : 'none',
    youtubeId: ytId || null,
    totalPages: 0,
    createdBy: currentUser?.id || null,
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
              ${CATEGORIES.map(cat => `<option>${esc(cat)}</option>`).join('')}
            </select>
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
  ['ai','manual','skip'].forEach(mode => {
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
  const mode = document.querySelector('input[name="url-mode"]:checked')?.value || 'ai';
  const courseId = nextCourseId();

  closeModal();
  showLoader('Adding course', 'Saving to database');

  const newCourse = {
    id: courseId, title, description: '', category: cat, type: 'Free',
    contentType: detected.type,
    youtubeId: detected.type === 'youtube' ? detected.id : null,
    slidesUrl: detected.type === 'slides' ? urlVal : null,
    totalPages: 0,
    createdBy: currentUser?.id || null,
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
              ${CATEGORIES.map(cat => `<option>${esc(cat)}</option>`).join('')}
            </select>
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
      Object.values(zip.files).find(file => file.name.toLowerCase().endsWith('imsmanifest.xml'));

    let launchFile = 'index.html';
    let titleFromManifest = '';

    if (manifestFile) {
      const xml = new DOMParser().parseFromString(await manifestFile.async('string'), 'text/xml');
      titleFromManifest = xml.querySelector('title')?.textContent?.trim() || '';
      const sco = xml.querySelector('resource[type*="sco"], resource[type*="SCO"], resource[href]');
      if (sco) launchFile = (sco.getAttribute('href') || 'index.html').split('?')[0].split('#')[0];
    }

    const fileCount = Object.values(zip.files).filter(file => !file.dir).length;
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
  const type = 'Free';
  const desc = document.getElementById('scorm-desc')?.value.trim() || '';

  closeModal();

  const courseId = nextCourseId();
  const basePath = `scorm/${courseId}`;

  // Inline SCORM 1.2 shim — intercepts API calls and relays via postMessage
  const shimScript = `<script>(function(){var d={};window.API={LMSInitialize:function(){window.parent.postMessage({type:'scorm12',action:'init'},'*');return'true'},LMSFinish:function(){window.parent.postMessage({type:'scorm12',action:'finish',data:d},'*');return'true'},LMSGetValue:function(e){return d[e]||''},LMSSetValue:function(e,v){d[e]=v;window.parent.postMessage({type:'scorm12',action:'set',element:e,value:v},'*');return'true'},LMSCommit:function(){window.parent.postMessage({type:'scorm12',action:'commit',data:d},'*');return'true'},LMSGetLastError:function(){return'0'},LMSGetErrorString:function(){return''},LMSGetDiagnostic:function(){return''}};})();<\/script>`;

  showLoader('Uploading SCORM', `Uploading ${scormZipData.fileCount} files…`);

  try {
    const { zip, launchFile } = scormZipData;
    const files = Object.values(zip.files).filter(file => !file.dir);

    // Upload in batches of 5
    for (let batchStart = 0; batchStart < files.length; batchStart += 5) {
      await Promise.all(files.slice(batchStart, batchStart + 5).map(async zipFile => {
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
      createdBy: currentUser?.id || null,
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
              ${CATEGORIES.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="hs-desc" placeholder="Short description" />
        </div>
        <div class="form-group">
          <label class="form-label">HTML File</label>
          <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem">Upload an .html file from your computer, or paste HTML below.</p>
          <input type="file" accept=".html,.htm" id="hs-file" class="form-input" style="padding:.4rem" onchange="document.getElementById('hs-file-name').textContent = this.files[0]?.name || ''" />
          <span id="hs-file-name" style="font-size:.8rem;color:var(--text-muted);margin-top:.25rem;display:block"></span>
        </div>
        <div class="form-group">
          <label class="form-label">Or Paste HTML</label>
          <textarea class="form-input" id="hs-html" rows="8" placeholder="<!DOCTYPE html>..." style="font-family:monospace;font-size:.8rem;resize:vertical"></textarea>
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
  const title    = document.getElementById('hs-title')?.value.trim();
  const fileEl   = document.getElementById('hs-file');
  const file     = fileEl?.files?.[0];
  const pastedHtml = document.getElementById('hs-html')?.value.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  if (!file && (!pastedHtml || pastedHtml.length < 20)) { toast('Upload an HTML file or paste HTML content', 'error'); return; }

  const cat  = document.getElementById('hs-cat')?.value  || CATEGORIES[0];
  const type = 'Free';
  const desc = document.getElementById('hs-desc')?.value.trim() || '';

  closeModal();
  showLoader('Uploading', 'Saving HTML slides…');

  let html;
  if (file) {
    html = await file.text();
  } else {
    html = pastedHtml;
  }

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
    createdBy: currentUser?.id || null,
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
              ${CATEGORIES.map(cat => `<option>${esc(cat)}</option>`).join('')}
            </select>
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
  ['ai','manual','skip'].forEach(mode => {
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
    for (let pageNum = 1; pageNum <= Math.min(numPages, 30); pageNum++) {
      const page = await pdf.getPage(pageNum);
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
    } catch(error) { /* cover optional */ }

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
  const type = 'Free';
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
  } catch (error) {
    console.error('Storage upload error:', error);
  }

  const newCourse = {
    id: courseId, title, description: '', category: cat, type,
    contentType: 'pdf', totalPages: uploadedPdfData.numPages,
    pdfDataUrl: pdfUrl, coverUrl: coverStorageUrl,
    createdBy: currentUser?.id || null,
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
  for (let charIndex = 0; charIndex < str.length; charIndex++) {
    const char = str[charIndex];
    if (escape)               { escape = false; continue; }
    if (char === '\\' && inString) { escape = true; continue; }
    if (char === '"')         { inString = !inString; continue; }
    if (inString)             continue;
    if (char === '{')         depth++;
    if (char === '}')         { depth--; if (depth === 0) lastClose = charIndex; }
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
          ${builderQuestions.map((question, questionIndex) => builderQuestionHTML(question, questionIndex)).join('')}
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

function builderQuestionHTML(question, index) {
  if (question.type === 'mc') {
    return `<div class="qbuilder-item">
      <div class="qbuilder-item-header">
        <span class="qbuilder-item-num">Q${index+1} · Multiple Choice</span>
        <button class="btn btn-danger btn-sm qbuilder-item-remove" onclick="removeBuilderQ(${index})">Remove</button>
      </div>
      <div class="form-group" style="margin-bottom:.6rem">
        <input class="form-input" placeholder="Question text" value="${esc(question.question)}" oninput="builderQuestions[${index}].question=this.value" />
      </div>
      <div class="qbuilder-options">
        ${question.options.map((opt, optionIndex) => `
          <div class="qbuilder-option">
            <input type="radio" name="correct-${index}" ${question.correct===optionIndex?'checked':''} onchange="builderQuestions[${index}].correct=${optionIndex}" title="Mark as correct" />
            <input type="text" placeholder="Option ${optionIndex+1}" value="${esc(opt)}" oninput="builderQuestions[${index}].options[${optionIndex}]=this.value" />
          </div>`).join('')}
      </div>
      <div class="form-hint" style="margin-top:.4rem">Select the radio button next to the correct answer</div>
    </div>`;
  } else {
    return `<div class="qbuilder-item">
      <div class="qbuilder-item-header">
        <span class="qbuilder-item-num">Q${index+1} · True/False</span>
        <button class="btn btn-danger btn-sm qbuilder-item-remove" onclick="removeBuilderQ(${index})">Remove</button>
      </div>
      <div class="form-group" style="margin-bottom:.6rem">
        <input class="form-input" placeholder="Question text" value="${esc(question.question)}" oninput="builderQuestions[${index}].question=this.value" />
      </div>
      <div style="display:flex;gap:.75rem">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
          <input type="radio" name="tf-${index}" ${question.correct===true?'checked':''} onchange="builderQuestions[${index}].correct=true" /> True
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
          <input type="radio" name="tf-${index}" ${question.correct===false?'checked':''} onchange="builderQuestions[${index}].correct=false" /> False
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

function removeBuilderQ(index) {
  builderQuestions.splice(index, 1);
  const courseId = document.querySelector('[onclick^="saveBuilderQuestions"]')?.getAttribute('onclick')?.match(/'(.+?)'/)?.[1];
  if (courseId) renderBuilderModal(courseId);
}

function saveBuilderQuestions(courseId) {
  const valid = builderQuestions.filter(question => question.question.trim());
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
          if (opts.some(opt => !opt)) { errors.push(`Row ${rowNum}: all 4 options required for mc`); return; }
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
          <ul style="margin:.5rem 0 0 1rem">${errors.map(errorMsg => `<li>${esc(errorMsg)}</li>`).join('')}</ul>
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
      const mcCount = parsed.filter(question => question.type === 'mc').length;
      const tfCount = parsed.filter(question => question.type === 'tf').length;

      preview.style.display = 'block';
      preview.innerHTML = `
        <div class="excel-success">
          ✅ <strong>${parsed.length} questions ready</strong> — ${mcCount} multiple choice · ${tfCount} true/false
        </div>
        <div class="excel-preview-list">
          ${parsed.slice(0, 5).map((question) => `
            <div class="excel-preview-row">
              <span class="badge ${question.type === 'mc' ? 'badge-pdf' : 'badge-none'}" style="flex-shrink:0">${question.type.toUpperCase()}</span>
              <span style="font-size:.82rem;color:var(--text)">${esc(question.question)}</span>
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
    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 30); pageNum++) {
      const page = await pdf.getPage(pageNum);
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

