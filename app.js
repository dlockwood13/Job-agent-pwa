// ============================================================
// JOB AGENT PWA — v3
// ============================================================

const API_URL = 'https://job-agent-proxy.d-lockwood6.workers.dev';
const MODEL = 'claude-sonnet-4-20250514';

const STORAGE = {
  saved: 'ja:saved',
  alerts: 'ja:alerts',
  lastSearch: 'ja:lastSearch',
};

const state = {
  jobs: [],
  saved: [],
  activeTab: 'search',
  currentJob: null,
};

const SETTING_LABELS = {
  any: 'Any',
  forensic: 'Forensic / secure',
  nhs: 'NHS / clinical',
  child: 'Child & adolescent',
  neuro: 'Neuropsychology',
  research: 'Research / academic',
};

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
  console.log('[Job Agent] v4 initialising...');

  // Safety: force modal hidden on init, no matter what
  const modal = document.getElementById('modal');
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';

  state.saved = loadSaved();
  bindTabs();
  bindSearch();
  bindModal();
  bindAlerts();
  bindInstallPrompt();
  updateSavedCount();
  refreshAlertsUI();
  scheduleDailyCheck();
  console.log('[Job Agent] Ready. API_URL =', API_URL);
}

// ============================================================
// STORAGE
// ============================================================

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.saved) || '[]');
  } catch {
    return [];
  }
}

function persistSaved() {
  localStorage.setItem(STORAGE.saved, JSON.stringify(state.saved));
  updateSavedCount();
}

function updateSavedCount() {
  const el = document.getElementById('saved-count');
  if (el) el.textContent = state.saved.length;
}

// ============================================================
// TABS
// ============================================================

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.panel').forEach((p) => {
    p.hidden = p.id !== `panel-${tab}`;
  });
  if (tab === 'saved') renderSaved();
}

// ============================================================
// SEARCH
// ============================================================

function bindSearch() {
  const btn = document.getElementById('run-btn');
  if (!btn) {
    console.error('[Job Agent] Run button not found!');
    return;
  }
  btn.addEventListener('click', runAgent);
  console.log('[Job Agent] Run button bound.');
}

async function runAgent() {
  console.log('[Job Agent] runAgent() called');

  const role = document.getElementById('q-role').value.trim();
  const loc = document.getElementById('q-loc').value.trim();
  const setting = document.getElementById('q-setting').value;

  if (!role) {
    showError('Please enter a role to search for.');
    return;
  }

  setLoading(true);
  clearError();
  state.jobs = [];
  renderResults();
  document.getElementById('empty-state').hidden = true;

  const log = document.getElementById('agent-log');
  log.hidden = false;
  log.innerHTML = '';
  addLog(`Searching live listings for "${role}"...`);
  addLog(`Location: ${loc} · Setting: ${SETTING_LABELS[setting]}`);

  const settingClause =
    setting !== 'any' ? ` with a focus on ${SETTING_LABELS[setting].toLowerCase()} settings` : '';

  const prompt = `You are a job-search agent. Search the live web for current "${role}" job listings in ${loc}${settingClause}. Return the 8 most relevant, currently-advertised positions.

For each, return a JSON object with: title, employer, location, salary (string, e.g. "£25,000-£28,000" or "Not stated"), setting (one of: NHS, Forensic, Private, Charity, Research, Other), posted (relative, e.g. "2 days ago"), url (the application/listing URL), summary (1 sentence, max 25 words), keyRequirements (array of 3-5 short strings), fitScore (1-100 integer estimating relevance to an Assistant Psychologist applicant with a non-linear background spanning policing, corporate, and online psychiatry).

Return ONLY a JSON array of these 8 objects. No preamble, no markdown fences, no trailing text. If you genuinely cannot find live listings, return an empty array [].`;

  try {
    console.log('[Job Agent] Calling proxy:', API_URL);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    console.log('[Job Agent] Response status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    console.log('[Job Agent] Response data:', data);
    addLog('Scanned job boards, parsing results...');

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    if (!data.content || !Array.isArray(data.content)) {
      throw new Error('Unexpected response shape — no content array');
    }

    const fullText = data.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n');

    if (!fullText.trim()) {
      throw new Error('Empty response from search');
    }

    const cleaned = fullText.replace(/```json|```/g, '').trim();
    const s = cleaned.indexOf('[');
    const e = cleaned.lastIndexOf(']');
    if (s === -1 || e === -1) {
      throw new Error('No JSON array in response. Raw: ' + cleaned.slice(0, 200));
    }

    const parsed = JSON.parse(cleaned.slice(s, e + 1));
    state.jobs = parsed.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));

    addLog(`Found ${state.jobs.length} roles · ranked by fit`);
    localStorage.setItem(STORAGE.lastSearch, new Date().toISOString());
    renderResults();

    if (state.jobs.length === 0) {
      addLog('No live listings matched. Try broader search terms.');
    }
  } catch (err) {
    console.error('[Job Agent] Search failed:', err);
    showError(`Search failed: ${err.message}`, err.stack);
    addLog(`Error: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  const btn = document.getElementById('run-btn');
  btn.disabled = loading;
  btn.querySelector('.btn-label').innerHTML = loading
    ? '<span class="spin">↻</span> Searching'
    : 'Run Agent';
}

function addLog(msg) {
  const log = document.getElementById('agent-log');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="arrow">→</span> ${escapeHtml(msg)}`;
  log.appendChild(line);
}

function showError(msg, detail) {
  const box = document.getElementById('error-box');
  box.innerHTML = `<strong>${escapeHtml(msg)}</strong>${
    detail ? `<code>${escapeHtml(String(detail).slice(0, 400))}</code>` : ''
  }`;
  box.hidden = false;
}

function clearError() {
  const box = document.getElementById('error-box');
  box.hidden = true;
  box.innerHTML = '';
}

// ============================================================
// RENDER
// ============================================================

function renderResults() {
  const container = document.getElementById('results');
  container.innerHTML = '';
  if (state.jobs.length === 0) return;

  const header = document.createElement('div');
  header.className = 'mono muted';
  header.style.marginBottom = '8px';
  header.textContent = `↗ ${state.jobs.length} ROLES · RANKED BY FIT`;
  container.appendChild(header);

  state.jobs.forEach((job) => container.appendChild(jobCard(job)));
}

function renderSaved() {
  const container = document.getElementById('saved-list');
  const empty = document.getElementById('saved-empty');
  container.innerHTML = '';
  if (state.saved.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  state.saved.forEach((job) => container.appendChild(jobCard(job)));
}

function jobCard(job) {
  const card = document.createElement('div');
  card.className = 'job-card';

  const isSaved = state.saved.some((s) => s.url === job.url && s.title === job.title);
  const fitScore = job.fitScore || 0;
  const fitColor =
    fitScore >= 80 ? 'var(--accent)' : fitScore >= 60 ? 'var(--mid)' : 'var(--dim)';

  card.innerHTML = `
    <div class="fit-badge" style="background: ${fitColor};">${fitScore || '?'}</div>
    <h3>${escapeHtml(job.title || 'Untitled')}</h3>
    <div class="job-meta">
      <span class="employer">${escapeHtml(job.employer || '')}</span> · ${escapeHtml(job.location || '')}
      ${
        job.salary && job.salary !== 'Not stated'
          ? ` · <span class="salary">${escapeHtml(job.salary)}</span>`
          : ''
      }
    </div>
    <p class="job-summary">${escapeHtml(job.summary || '')}</p>
    <div class="tags">
      ${(job.keyRequirements || [])
        .slice(0, 4)
        .map((r) => `<span class="tag">${escapeHtml(r)}</span>`)
        .join('')}
    </div>
    <div class="job-footer">
      <span class="meta">${escapeHtml(job.setting || '')} · ${escapeHtml(job.posted || '')}</span>
      ${
        job.url
          ? `<a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">View →</a>`
          : ''
      }
    </div>
    <button class="save-btn ${isSaved ? 'saved' : ''}" type="button" aria-label="Save job">${
    isSaved ? '♥' : '♡'
  }</button>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.save-btn') || e.target.closest('a')) return;
    openModal(job);
  });

  card.querySelector('.save-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSave(job);
    const nowSaved = state.saved.some((s) => s.url === job.url && s.title === job.title);
    const btn = e.currentTarget;
    btn.classList.toggle('saved', nowSaved);
    btn.textContent = nowSaved ? '♥' : '♡';
    if (state.activeTab === 'saved') renderSaved();
  });

  return card;
}

function toggleSave(job) {
  const idx = state.saved.findIndex((s) => s.url === job.url && s.title === job.title);
  if (idx >= 0) state.saved.splice(idx, 1);
  else state.saved.push(job);
  persistSaved();
}

// ============================================================
// MODAL
// ============================================================

function bindModal() {
  const modal = document.getElementById('modal');
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}

async function openModal(job) {
  state.currentJob = job;
  document.getElementById('modal-title').textContent = job.title || '';
  document.getElementById('modal-employer').textContent = job.employer || '';

  const link = document.getElementById('modal-link');
  if (job.url) {
    link.href = job.url;
    link.style.pointerEvents = 'auto';
    link.style.opacity = '1';
  } else {
    link.href = '#';
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.5';
  }

  const analysisEl = document.getElementById('modal-analysis');
  analysisEl.innerHTML =
    '<div class="muted"><span class="spin">↻</span> Analysing fit against your background...</div>';

  // Save button wiring
  const saveBtn = document.getElementById('modal-save');
  const isSaved = state.saved.some((s) => s.url === job.url && s.title === job.title);
  saveBtn.textContent = isSaved ? '♥ Saved' : '♡ Save';
  saveBtn.onclick = () => {
    toggleSave(job);
    const nowSaved = state.saved.some((s) => s.url === job.url && s.title === job.title);
    saveBtn.textContent = nowSaved ? '♥ Saved' : '♡ Save';
    renderResults();
    if (state.activeTab === 'saved') renderSaved();
  };

  document.getElementById('modal').hidden = false;
  document.body.style.overflow = 'hidden';

  const prompt = `An applicant with a non-linear background — former police officer, corporate sector experience, and recent work at an online psychiatry provider — is applying for this Assistant Psychologist role:

Title: ${job.title}
Employer: ${job.employer}
Setting: ${job.setting}
Summary: ${job.summary}
Key requirements: ${(job.keyRequirements || []).join(', ')}

Write a sharp, candid assessment in exactly this format:

WHY THIS FITS
- (3 specific bullets, max 15 words each, drawing on their actual background)

WATCH-OUTS
- (2 honest bullets on gaps or framing risks)

OPENING LINE
"(One sentence they could use to open a cover letter — punchy, specific, no clichés)"

No preamble. No closing remarks. Use the format exactly.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy ${response.status}: ${errText.slice(0, 150)}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const text = data.content.map((b) => b.text || '').filter(Boolean).join('\n');
    analysisEl.textContent = text || "No analysis returned. Try again.";
  } catch (err) {
    console.error('[Job Agent] Analysis failed:', err);
    analysisEl.innerHTML = `<div style="color: var(--accent);">Couldn't generate analysis: ${escapeHtml(
      err.message
    )}</div>`;
  }
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  document.body.style.overflow = '';
  state.currentJob = null;
}

// ============================================================
// ALERTS
// ============================================================

function bindAlerts() {
  const btn = document.getElementById('enable-alerts');
  btn.addEventListener('click', async () => {
    const enabled = localStorage.getItem(STORAGE.alerts) === '1';
    if (enabled) {
      localStorage.removeItem(STORAGE.alerts);
      refreshAlertsUI();
      return;
    }
    if (!('Notification' in window)) {
      refreshAlertsUI();
      return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      localStorage.setItem(STORAGE.alerts, '1');
      new Notification('Job Agent', {
        body: "Reminders enabled. We'll nudge you daily.",
        icon: 'icons/icon-192.png',
      });
    }
    refreshAlertsUI();
  });
}

function refreshAlertsUI() {
  const statusEl = document.getElementById('alerts-status');
  const enableBtn = document.getElementById('enable-alerts');
  const enabled = localStorage.getItem(STORAGE.alerts) === '1';

  if (!('Notification' in window)) {
    statusEl.textContent = "⊘ This browser doesn't support notifications.";
    enableBtn.disabled = true;
    return;
  }
  if (Notification.permission === 'denied') {
    statusEl.textContent = '⊘ Notifications blocked. Enable them in your browser settings.';
    enableBtn.disabled = true;
    return;
  }
  if (enabled && Notification.permission === 'granted') {
    statusEl.textContent = "✓ Daily reminders on. We'll nudge you to check for new roles.";
    enableBtn.textContent = 'Disable reminders';
  } else {
    statusEl.textContent = '';
    enableBtn.textContent = 'Enable reminders';
  }
}

function scheduleDailyCheck() {
  const last = localStorage.getItem(STORAGE.lastSearch);
  if (!last) return;
  const hoursSince = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
  if (
    hoursSince >= 24 &&
    'Notification' in window &&
    Notification.permission === 'granted' &&
    localStorage.getItem(STORAGE.alerts) === '1'
  ) {
    new Notification('Time for a fresh search', {
      body: 'New Assistant Psychologist roles may have been posted.',
      icon: 'icons/icon-192.png',
    });
  }
}

// ============================================================
// INSTALL PROMPT
// ============================================================

let deferredInstallPrompt = null;

function bindInstallPrompt() {
  const banner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-btn');
  const dismissBtn = document.getElementById('install-dismiss');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (sessionStorage.getItem('ja:installDismissed') !== '1') {
      banner.hidden = false;
    }
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') banner.hidden = true;
    deferredInstallPrompt = null;
  });

  dismissBtn.addEventListener('click', () => {
    banner.hidden = true;
    sessionStorage.setItem('ja:installDismissed', '1');
  });
}

// ============================================================
// UTILS
// ============================================================

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
