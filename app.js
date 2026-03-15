    const STORAGE_KEY = 'trainingLogApp_v5';
    const LEGACY_KEYS = ['trainingLogApp_v4','trainingLogApp_v3', 'trainingLogApp_v2', 'trainingLogApp_v1'];
    const DAYS = [
      { key: 'mon', label: 'Pondělí', short: 'po' },
      { key: 'tue', label: 'Úterý', short: 'út' },
      { key: 'wed', label: 'Středa', short: 'st' },
      { key: 'thu', label: 'Čtvrtek', short: 'čt' },
      { key: 'fri', label: 'Pátek', short: 'pá' },
      { key: 'sat', label: 'Sobota', short: 'so' },
      { key: 'sun', label: 'Neděle', short: 'ne' },
    ];
    const DATABASE_TAB = 'db';

    let state = loadState();
    let activeTab = DAYS[0].key;

    function uid() {
      return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    }

    function defaultExercise(name, part='', trackMode='both', valueMode='weight') {
      return {
        id: uid(),
        name: name.trim(),
        part: part.trim(),
        trackMode,
        valueMode,
        history: []
      };
    }

    function defaultState() {
      return {
        schemaVersion: 5,
        exercises: [],
        ui: {
          dbPartFilter: 'all',
          dbSearch: '',
          dayPartFilters: Object.fromEntries(DAYS.map(d => [d.key, 'all']))
        },
        draftDays: Object.fromEntries(DAYS.map(d => [d.key, {}])),
        days: Object.fromEntries(DAYS.map(d => [d.key, { items: [] }]))
      };
    }

    function migrateState(parsed) {
      const base = defaultState();
      base.exercises = Array.isArray(parsed.exercises) ? parsed.exercises.map(ex => ({
        id: ex.id || uid(),
        name: ex.name || 'Bez názvu',
        part: (ex.part || ex.category || '').trim(),
        trackMode: ex.trackMode || 'both',
        valueMode: ex.valueMode || 'weight',
        history: Array.isArray(ex.history) ? ex.history.map(h => ({
          id: h.id || uid(),
          date: h.date || new Date().toISOString(),
          dayKey: h.dayKey || 'mon',
          setIndex: Math.max(1, Number(h.setIndex) || 1),
          weight: h.weight === 'BW' ? null : (h.weight ?? null),
          reps: Number(h.reps) || 0
        })) : []
      })) : [];

      for (const d of DAYS) {
        const bucket = parsed.days?.[d.key];
        if (bucket?.items && Array.isArray(bucket.items)) {
          base.days[d.key].items = bucket.items.map(item => ({
            exerciseId: item.exerciseId,
            setCount: Math.max(1, Number(item.setCount) || 1)
          }));
        } else if (bucket?.exerciseIds && Array.isArray(bucket.exerciseIds)) {
          base.days[d.key].items = bucket.exerciseIds.map(id => ({ exerciseId: id, setCount: 1 }));
        }
      }

      if (parsed.draftDays && typeof parsed.draftDays === 'object') {
        for (const d of DAYS) {
          const src = parsed.draftDays[d.key] || {};
          base.draftDays[d.key] = {};
          for (const [exerciseId, sets] of Object.entries(src)) {
            base.draftDays[d.key][exerciseId] = Array.isArray(sets) ? sets.map(s => ({
              weight: s?.weight ?? '',
              reps: s?.reps ?? ''
            })) : [];
          }
        }
      }

      if (parsed.ui && typeof parsed.ui === 'object') {
        base.ui.dbPartFilter = parsed.ui.dbPartFilter || 'all';
        base.ui.dbSearch = parsed.ui.dbSearch || '';
        for (const d of DAYS) {
          base.ui.dayPartFilters[d.key] = parsed.ui.dayPartFilters?.[d.key] || 'all';
        }
      }

      return base;
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.map(k => localStorage.getItem(k)).find(Boolean);
        if (!raw) return defaultState();
        return migrateState(JSON.parse(raw));
      } catch (e) {
        console.error(e);
        return defaultState();
      }
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function escapeHtml(str) {
      return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function findExercise(id) {
      return state.exercises.find(x => x.id === id);
    }

    function findDayItem(dayKey, exerciseId) {
      return state.days[dayKey].items.find(x => x.exerciseId === exerciseId);
    }

    function uniqueParts() {
      return [...new Set(state.exercises.map(ex => (ex.part || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'cs'));
    }

    function addExercise(name, part='', trackMode='both', valueMode='weight') {
      const clean = name.trim();
      if (!clean) return alert('Zadej název cviku.');
      if (state.exercises.some(x => x.name.toLowerCase() === clean.toLowerCase())) return alert('Tenhle cvik už v databázi je.');
      state.exercises.push(defaultExercise(clean, part, trackMode, valueMode));
      saveState();
      render();
    }

    function deleteExercise(id) {
      const ex = findExercise(id);
      if (!ex) return;
      if (!confirm(`Smazat cvik „${ex.name}“ včetně historie?`)) return;
      state.exercises = state.exercises.filter(x => x.id !== id);
      for (const d of DAYS) {
        state.days[d.key].items = state.days[d.key].items.filter(x => x.exerciseId !== id);
        delete state.draftDays[d.key][id];
      }
      saveState();
      render();
    }

    function updateExerciseConfig(id, patch) {
      const ex = findExercise(id);
      if (!ex) return;
      Object.assign(ex, patch);
      if (patch.valueMode === 'bw') {
        for (const d of DAYS) {
          const drafts = state.draftDays[d.key][id];
          if (Array.isArray(drafts)) drafts.forEach(s => s.weight = '');
        }
      }
      saveState();
      render();
    }

    function ensureDraftSlots(dayKey, exerciseId, setCount) {
      if (!state.draftDays[dayKey][exerciseId]) state.draftDays[dayKey][exerciseId] = [];
      const arr = state.draftDays[dayKey][exerciseId];
      while (arr.length < setCount) arr.push({ weight: '', reps: '' });
      if (arr.length > setCount) arr.length = setCount;
    }

    function assignExerciseToDay(dayKey, exerciseId) {
      if (!exerciseId) return alert('Nejdřív vyber cvik.');
      const bucket = state.days[dayKey].items;
      if (bucket.some(x => x.exerciseId === exerciseId)) return alert('Tenhle cvik už v tom dni je.');
      bucket.push({ exerciseId, setCount: 1 });
      ensureDraftSlots(dayKey, exerciseId, 1);
      saveState();
      render();
    }

    function unassignExerciseFromDay(dayKey, exerciseId) {
      state.days[dayKey].items = state.days[dayKey].items.filter(x => x.exerciseId !== exerciseId);
      delete state.draftDays[dayKey][exerciseId];
      saveState();
      render();
    }

function addSetToDayExercise(dayKey, exerciseId) {
  const item = findDayItem(dayKey, exerciseId);
  if (!item) return;
  item.setCount = Math.max(1, Number(item.setCount || 1) + 1);
  ensureDraftSlots(dayKey, exerciseId, item.setCount);
  saveState();
  render();
}

function removeSetFromDayExercise(dayKey, exerciseId) {
  const item = findDayItem(dayKey, exerciseId);
  if (!item) return;
  item.setCount = Math.max(1, Number(item.setCount || 1) - 1);
  ensureDraftSlots(dayKey, exerciseId, item.setCount);
  saveState();
  render();
}

function moveExerciseInDay(dayKey, exerciseId, direction) {
  const items = state.days[dayKey].items;
  const index = items.findIndex(x => x.exerciseId === exerciseId);
  if (index === -1) return;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  saveState();
  render();
}

function updateExerciseDraftValue(dayKey, exerciseId, setIndex, field, step) {
  const item = findDayItem(dayKey, exerciseId);
  if (!item) return;
  ensureDraftSlots(dayKey, exerciseId, item.setCount);
  const current = state.draftDays[dayKey][exerciseId][setIndex - 1][field];
  const currNum = Number(current || 0);
  const next = Math.max(0, Math.round((currNum + step) * 100) / 100);
  const value = field === 'weight' ? String(Number(next.toFixed(1))) : String(Math.round(next));
  updateDraft(dayKey, exerciseId, setIndex, field, value);
  render();
}

    function updateDraft(dayKey, exerciseId, setIndex, field, value) {
      const item = findDayItem(dayKey, exerciseId);
      if (!item) return;
      ensureDraftSlots(dayKey, exerciseId, item.setCount);
      state.draftDays[dayKey][exerciseId][setIndex - 1][field] = value;
      saveState();
    }

    function getLastEntryForSet(exercise, setIndex) {
      const sorted = [...exercise.history].sort((a,b)=> new Date(b.date) - new Date(a.date));
      return sorted.find(entry => Number(entry.setIndex) === Number(setIndex));
    }

    function trendForInput(exercise, setIndex, newWeight, newReps) {
      const prev = getLastEntryForSet(exercise, setIndex);
      if (!prev) return { cls: 'same', icon: '•', text: 'první zápis' };

      const reps = Number(newReps) || 0;
      const weight = newWeight === '' || newWeight == null ? null : Number(newWeight);
      const prevWeight = prev.weight == null ? null : Number(prev.weight);
      const prevReps = Number(prev.reps) || 0;

      if (exercise.valueMode === 'bw') {
        if (!reps) return { cls: 'same', icon: '→', text: `minule ${prevReps} reps` };
        if (reps > prevReps) return { cls: 'up', icon: '↑', text: `lepší než minule (${prevReps} reps)` };
        if (reps < prevReps) return { cls: 'down', icon: '↓', text: `horší než minule (${prevReps} reps)` };
        return { cls: 'same', icon: '→', text: `stejné jako minule (${prevReps} reps)` };
      }

      if (exercise.trackMode === 'weight') {
        if (weight == null || Number.isNaN(weight)) return { cls: 'same', icon: '→', text: `minule ${prevWeight ?? 0} kg` };
        if (weight > prevWeight) return { cls: 'up', icon: '↑', text: `lepší váha (${prevWeight} kg)` };
        if (weight < prevWeight) return { cls: 'down', icon: '↓', text: `nižší váha (${prevWeight} kg)` };
        return { cls: 'same', icon: '→', text: `stejná váha (${prevWeight} kg)` };
      }

      if (exercise.trackMode === 'reps') {
        if (!reps) return { cls: 'same', icon: '→', text: `minule ${prevReps} reps` };
        if (reps > prevReps) return { cls: 'up', icon: '↑', text: `víc reps (${prevReps})` };
        if (reps < prevReps) return { cls: 'down', icon: '↓', text: `míň reps (${prevReps})` };
        return { cls: 'same', icon: '→', text: `stejné reps (${prevReps})` };
      }

      const prevScore = (prevWeight || 0) * prevReps;
      const currScore = (weight || 0) * reps;
      if (!reps && (weight == null || Number.isNaN(weight))) return { cls: 'same', icon: '→', text: `minule ${prevWeight ?? 0} × ${prevReps}` };
      if (currScore > prevScore || ((weight || 0) >= (prevWeight || 0) && reps > prevReps) || ((weight || 0) > (prevWeight || 0) && reps >= prevReps)) {
        return { cls: 'up', icon: '↑', text: `lepší než ${prevWeight ?? 0} × ${prevReps}` };
      }
      if (currScore < prevScore || ((weight || 0) <= (prevWeight || 0) && reps < prevReps) || ((weight || 0) < (prevWeight || 0) && reps <= prevReps)) {
        return { cls: 'down', icon: '↓', text: `slabší než ${prevWeight ?? 0} × ${prevReps}` };
      }
      return { cls: 'same', icon: '→', text: `mix proti ${prevWeight ?? 0} × ${prevReps}` };
    }

    function validateDraftSet(ex, setDraft) {
      const reps = Number(setDraft.reps);
      if (!reps) return 'Vyplň počet opakování.';
      if (ex.valueMode === 'weight') {
        const w = Number(setDraft.weight);
        if (setDraft.weight === '' || Number.isNaN(w)) return 'Vyplň váhu.';
      }
      return null;
    }

    function saveWholeWorkout(dayKey) {
      const items = state.days[dayKey].items;
      if (!items.length) return alert('Tenhle den je prázdný.');
      let records = [];
      for (const item of items) {
        const ex = findExercise(item.exerciseId);
        if (!ex) continue;
        ensureDraftSlots(dayKey, ex.id, item.setCount);
        const drafts = state.draftDays[dayKey][ex.id];
        for (let i = 0; i < item.setCount; i++) {
          const setDraft = drafts[i] || { weight: '', reps: '' };
          const isFilled = String(setDraft.reps).trim() !== '' || String(setDraft.weight).trim() !== '';
          if (!isFilled) continue;
          const err = validateDraftSet(ex, setDraft);
          if (err) return alert(`${ex.name} · série ${i+1}: ${err}`);
          records.push({
            exercise: ex,
            setIndex: i + 1,
            reps: Number(setDraft.reps),
            weight: ex.valueMode === 'bw' ? null : Number(setDraft.weight)
          });
        }
      }
      if (!records.length) return alert('Nemáš vyplněný žádný set k uložení.');
      const now = new Date().toISOString();
      for (const rec of records) {
        rec.exercise.history.push({
          id: uid(),
          date: now,
          dayKey,
          setIndex: rec.setIndex,
          weight: rec.weight,
          reps: rec.reps
        });
      }
      for (const item of items) {
        state.draftDays[dayKey][item.exerciseId] = Array.from({ length: item.setCount }, () => ({ weight: '', reps: '' }));
      }
      saveState();
      render();
      alert(`Uloženo ${records.length} setů pro ${DAYS.find(d=>d.key===dayKey)?.label}.`);
    }

    function latestWorkoutDate(exerciseId) {
      const ex = findExercise(exerciseId);
      if (!ex || !ex.history.length) return null;
      const max = ex.history.reduce((a,b)=> new Date(a.date) > new Date(b.date) ? a : b);
      return new Date(max.date).toLocaleString('cs-CZ');
    }

    function countTabItems(tabKey) {
      if (tabKey === DATABASE_TAB) return state.exercises.length;
      return state.days[tabKey].items.length;
    }

    function formatRecord(ex, h) {
      if (ex.valueMode === 'bw') return `${h.reps} reps`;
      return `${h.weight} kg × ${h.reps}`;
    }

    function scoreRecord(ex, h) {
      if (ex.valueMode === 'bw' || ex.trackMode === 'reps') return Number(h.reps) || 0;
      if (ex.trackMode === 'weight') return Number(h.weight) || 0;
      return (Number(h.weight) || 0) * (Number(h.reps) || 0);
    }

    function bestWorstRecords(ex) {
      if (!ex.history.length) return { best: null, worst: null };
      const arr = [...ex.history];
      arr.sort((a,b) => scoreRecord(ex,b) - scoreRecord(ex,a) || new Date(b.date) - new Date(a.date));
      const best = arr[0];
      const worst = arr[arr.length - 1];
      return { best, worst };
    }

    function renderMiniHistory(ex) {
      if (!ex.history.length) return `<div class="muted">Zatím bez historie. První zápis to nakopne.</div>`;
      const latest = [...ex.history].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,3);
      const { best, worst } = bestWorstRecords(ex);
      return `
        <div class="history-grid">
          <div class="stats-box">
            <div class="stats-title">Poslední 3 záznamy</div>
            ${latest.map(h => `<div class="history-line">${new Date(h.date).toLocaleDateString('cs-CZ')} · S${h.setIndex} · ${formatRecord(ex, h)}</div>`).join('')}
          </div>
          <div class="stats-box">
            <div class="stats-title">Nejlepší / nejhorší</div>
            <div class="history-line"><strong>Best:</strong> ${formatRecord(ex, best)} · ${new Date(best.date).toLocaleDateString('cs-CZ')}</div>
            <div class="history-line"><strong>Worst:</strong> ${formatRecord(ex, worst)} · ${new Date(worst.date).toLocaleDateString('cs-CZ')}</div>
          </div>
      `;
    }

function renderTabs() {
  const el = document.getElementById('mainTabs');
  const dayTabs = DAYS.map(t => `
    <button class="tab-btn ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">
      <div class="tab-name tab-name-full">${t.label}</div>
      <div class="tab-name tab-name-short">${t.short || t.label.slice(0,2).toLowerCase()}</div>
      <div class="tab-meta">${countTabItems(t.key)}</div>
    </button>
  `).join('');
  el.innerHTML = `
    <div class="day-tabs">${dayTabs}</div>
    <div class="db-tab-wrap">
      <button class="tab-btn ${activeTab === DATABASE_TAB ? 'active' : ''}" data-tab="${DATABASE_TAB}">
        <div class="tab-name">Databáze cviků</div>
        <div class="tab-meta">${countTabItems(DATABASE_TAB)} cviků</div>
      </button>
    </div>
  `;
  el.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); }));
}

    function renderPanel() {
      const title = document.getElementById('panelTitle');
      const actions = document.getElementById('panelActions');
      const body = document.getElementById('panelBody');
      if (activeTab === DATABASE_TAB) {
        title.textContent = 'Centrální databáze cviků';
        actions.innerHTML = `<span class="pill">${state.exercises.length} cviků</span>`;
        body.innerHTML = renderDatabasePanel();
        bindDatabasePanel();
        return;
      }
      const dayObj = DAYS.find(x => x.key === activeTab);
      title.textContent = dayObj.label;
      actions.innerHTML = `<span class="pill">Průběžný draft se ukládá automaticky</span>`;
      body.innerHTML = renderDayPanel(dayObj);
      bindDayPanel(dayObj.key);
    }

    function renderPartOptions(selected='all') {
      return `<option value="all" ${selected==='all'?'selected':''}>Všechny partie</option>` + uniqueParts().map(part => `<option value="${escapeHtml(part)}" ${selected===part?'selected':''}>${escapeHtml(part)}</option>`).join('');
    }

    function renderDatabasePanel() {
      return `
        <div class="toolbar">
          <div class="muted">Master databáze. Tady si držíš cviky, partie a logiku progresu.</div>
          <div class="tiny">Weight = hlídej kg, Reps = hlídej opakování, Oboje = kombinace obou. BW je vlastní váha.</div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Název cviku</label>
            <input id="exerciseNameInput" placeholder="Např. Bench press" />
          </div>
          <div class="field">
            <label>Partie</label>
            <input id="exercisePartInput" placeholder="Např. Hrudník" />
          </div>
          <div class="field">
            <label>Co trackovat</label>
            <select id="exerciseTrackModeInput">
              <option value="weight">Zlepšení ve váze</option>
              <option value="reps">Zlepšení v opakováních</option>
              <option value="both" selected>Zlepšení ve váze i opakováních</option>
            </select>
          </div>
          <div class="field">
            <label>Typ zátěže</label>
            <select id="exerciseValueModeInput">
              <option value="weight" selected>Klasická váha (kg)</option>
              <option value="bw">BW / vlastní váha</option>
            </select>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button id="addExerciseBtn" class="primary">Přidat cvik</button>
        </div>
        <div class="hr"></div>
        <div class="form-grid">
          <div class="field">
            <label>Filtrovat podle partie</label>
            <select id="dbPartFilter">${renderPartOptions(state.ui.dbPartFilter)}</select>
          </div>
          <div class="field">
            <label>Hledat</label>
            <input id="exerciseSearchInput" placeholder="Název cviku" value="${escapeHtml(state.ui.dbSearch || '')}" />
          </div>
        </div>
        <div id="exerciseDbList" class="exercise-list" style="margin-top:12px"></div>
        <div class="footer-note">Historie žije u cviku. Když ho přesuneš z pondělí na pátek, nic se neztratí.</div>
      `;
    }

    function renderFullHistory(ex) {
      if (!ex.history.length) return `<div class="muted">Zatím bez historie.</div>`;
      const ordered = [...ex.history].sort((a,b)=> new Date(b.date)-new Date(a.date));
      return `<div class="full-history">${ordered.map(h => `<div class="history-line">${new Date(h.date).toLocaleDateString('cs-CZ')} · ${DAYS.find(d=>d.key===h.dayKey)?.short || h.dayKey} · S${h.setIndex} · ${formatRecord(ex, h)}</div>`).join('')}</div>`;
    }

    function renderDbItem(ex) {
      const modeLabel = ex.valueMode === 'bw' ? 'BW' : 'kg';
      const trackLabel = ex.trackMode === 'weight' ? 'váha' : ex.trackMode === 'reps' ? 'reps' : 'váha + reps';
      const { best, worst } = bestWorstRecords(ex);
      return `
        <div class="db-item">
          <div class="db-item-head">
            <div>
              <div><strong>${escapeHtml(ex.name)}</strong></div>
              <div class="db-meta">${escapeHtml(ex.part || 'Bez partie')} · ${ex.history.length} záznamů · ${trackLabel} · ${modeLabel}</div>
              ${best ? `<div class="tiny">Best: ${formatRecord(ex, best)} · Worst: ${formatRecord(ex, worst)}</div>` : `<div class="tiny">Zatím bez zapsaného výkonu</div>`}
            </div>
            <div class="db-item-controls">
              <select data-edit-part="${ex.id}">
                <option value="">Bez partie</option>
                ${uniqueParts().map(part => `<option value="${escapeHtml(part)}" ${ex.part===part?'selected':''}>${escapeHtml(part)}</option>`).join('')}
              </select>
              <select data-edit-track="${ex.id}">
                <option value="weight" ${ex.trackMode==='weight'?'selected':''}>váha</option>
                <option value="reps" ${ex.trackMode==='reps'?'selected':''}>reps</option>
                <option value="both" ${ex.trackMode==='both'?'selected':''}>oboje</option>
              </select>
              <select data-edit-value="${ex.id}">
                <option value="weight" ${ex.valueMode==='weight'?'selected':''}>kg</option>
                <option value="bw" ${ex.valueMode==='bw'?'selected':''}>BW</option>
              </select>
              <button data-del-ex="${ex.id}" class="danger">Smazat</button>
            </div>
          </div>
          <details class="db-details">
            <summary><span class="arrow">▶</span><span>Kompletní historie progresu</span></summary>
            ${renderFullHistory(ex)}
          </details>
        </div>
      `;
    }

    function bindDatabasePanel() {
      const list = document.getElementById('exerciseDbList');
      const search = document.getElementById('exerciseSearchInput');
      const partFilter = document.getElementById('dbPartFilter');
      const renderList = () => {
        state.ui.dbSearch = search.value;
        state.ui.dbPartFilter = partFilter.value;
        saveState();
        const q = search.value.trim().toLowerCase();
        const part = partFilter.value;
        const items = state.exercises.filter(ex => {
          const matchText = (`${ex.name} ${ex.part || ''}`).toLowerCase().includes(q);
          const matchPart = part === 'all' || (ex.part || '') === part;
          return matchText && matchPart;
        });
        if (!items.length) {
          list.innerHTML = `<div class="empty">Tady je zatím ticho po pěšině. Přidej první cvik. 🏋️</div>`;
          return;
        }
        const grouped = new Map();
        items.forEach(ex => {
          const part = ex.part || 'Bez partie';
          if (!grouped.has(part)) grouped.set(part, []);
          grouped.get(part).push(ex);
        });
        const orderedGroups = [...grouped.entries()].sort((a,b)=> a[0].localeCompare(b[0],'cs'));
        list.innerHTML = orderedGroups.map(([part, group]) => `
          <div class="part-group">
            <div class="part-group-head">${escapeHtml(part)} <span class="tiny">(${group.length})</span></div>
            ${group.map(renderDbItem).join('')}
          </div>
        `).join('');
        list.querySelectorAll('[data-del-ex]').forEach(btn => btn.addEventListener('click', () => deleteExercise(btn.dataset.delEx)));
        list.querySelectorAll('[data-edit-track]').forEach(sel => sel.addEventListener('change', () => updateExerciseConfig(sel.dataset.editTrack, { trackMode: sel.value })));
        list.querySelectorAll('[data-edit-value]').forEach(sel => sel.addEventListener('change', () => updateExerciseConfig(sel.dataset.editValue, { valueMode: sel.value })));
        list.querySelectorAll('[data-edit-part]').forEach(sel => sel.addEventListener('change', () => updateExerciseConfig(sel.dataset.editPart, { part: sel.value })));
      };
      document.getElementById('addExerciseBtn').addEventListener('click', () => {
        addExercise(
          document.getElementById('exerciseNameInput').value,
          document.getElementById('exercisePartInput').value,
          document.getElementById('exerciseTrackModeInput').value,
          document.getElementById('exerciseValueModeInput').value
        );
        document.getElementById('exerciseNameInput').value = '';
        document.getElementById('exercisePartInput').value = '';
      });
      search.addEventListener('input', renderList);
      partFilter.addEventListener('change', render);
      renderList();
    }

    function exercisesForDayFilter(dayKey) {
      const part = state.ui.dayPartFilters[dayKey] || 'all';
      return state.exercises.filter(ex => part === 'all' || (ex.part || '') === part);
    }

    function renderDayPanel(dayObj) {
      const filterPart = state.ui.dayPartFilters[dayObj.key] || 'all';
      const items = state.days[dayObj.key].items.filter(item => {
        const ex = findExercise(item.exerciseId);
        if (!ex) return false;
        return filterPart === 'all' || (ex.part || '') === filterPart;
      });
      return `
        <div class="toolbar">
          <div class="muted">Denní karta je teď čistší pro mobil. Kompletní historie je v Databázi cviků pod rozbalovací šipkou.</div>
          <div class="tiny">Sety se ukládají až jedním potvrzením dole.</div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Filtrovat podle partie</label>
            <select id="dayPartFilter">${renderPartOptions(filterPart)}</select>
          </div>
          <div class="field">
            <label>Přidat cvik do dne</label>
            <div class="row">
              <select id="assignExerciseSelect" style="flex:1"></select>
              <button id="assignExerciseBtn" class="primary">Přidat</button>
            </div>
          </div>
        </div>
        <div id="dayExerciseList" class="exercise-list" style="margin-top:14px">
          ${!items.length ? `<div class="empty">Pro zvolenou partii tu zatím nic není. Přidej cvik nebo přepni filtr.</div>` : items.map(item => renderDayExerciseCard(dayObj.key, item)).join('')}
        </div>
        <div class="save-wrap">
          <div class="card">
            <div class="row" style="justify-content:space-between">
              <div>
                <div><strong>Potvrdit trénink</strong></div>
                <div class="tiny">Uloží všechny vyplněné sety z aktuálního dne naráz.</div>
              </div>
              <button id="saveWorkoutBtn" class="primary">Uložit celý trénink</button>
            </div>
          </div>
        </div>
      `;
    }

function renderDayExerciseCard(dayKey, item) {
  const ex = findExercise(item.exerciseId);
  if (!ex) return '';
  ensureDraftSlots(dayKey, ex.id, item.setCount);
  const drafts = state.draftDays[dayKey][ex.id];
  const lastDate = latestWorkoutDate(ex.id);
  const isBW = ex.valueMode === 'bw';
  const itemIndex = state.days[dayKey].items.findIndex(x => x.exerciseId === ex.id);
  const canMoveUp = itemIndex > 0;
  const canMoveDown = itemIndex < state.days[dayKey].items.length - 1;
  return `
    <div class="exercise-card">
      <div class="exercise-head">
        <div>
          <div class="exercise-title">${escapeHtml(ex.name)}</div>
          <div class="mini">${escapeHtml(ex.part || 'Bez partie')} · ${ex.history.length} záznamů celkem${lastDate ? ` · poslední zápis ${lastDate}` : ''}</div>
        </div>
        <div class="row">
          <span class="badge">${isBW ? 'BW' : 'kg'} · ${ex.trackMode === 'weight' ? 'track váha' : ex.trackMode === 'reps' ? 'track reps' : 'track oboje'}</span>
          <span class="badge">${item.setCount} sérií</span>
          <button data-move-up="${ex.id}" class="secondary icon-btn" ${canMoveUp ? '' : 'disabled'}>↑</button>
          <button data-move-down="${ex.id}" class="secondary icon-btn" ${canMoveDown ? '' : 'disabled'}>↓</button>
          <button data-add-set="${ex.id}" class="good">+ série</button>
          <button data-remove-set="${ex.id}" class="warn">- série</button>
          <button data-removefromday="${ex.id}" class="danger">Odebrat</button>
        </div>
      </div>
      <div class="sets">
        ${Array.from({ length: item.setCount }, (_, i) => {
          const setNo = i + 1;
          const draft = drafts[i] || { weight: '', reps: '' };
          const trend = trendForInput(ex, setNo, draft.weight, draft.reps);
          return `
            <div class="set-row ${isBW ? 'bw' : ''}" data-exercise="${ex.id}" data-set="${setNo}">
              <div class="set-label">Série ${setNo}</div>
              ${isBW ? '' : `
                <div class="value-control">
                  <button type="button" class="step-btn secondary weight-minus">−</button>
                  <input type="number" min="0" step="0.5" placeholder="kg" class="weight-input" value="${escapeHtml(draft.weight)}" />
                  <button type="button" class="step-btn secondary weight-plus">+</button>
                </div>
              `}
              <div class="value-control">
                <button type="button" class="step-btn secondary reps-minus">−</button>
                <input type="number" min="0" step="1" placeholder="reps" class="reps-input" value="${escapeHtml(draft.reps)}" />
                <button type="button" class="step-btn secondary reps-plus">+</button>
              </div>
              <div class="trend ${trend.cls}"><span>${trend.icon}</span><span class="trend-text">${trend.text}</span></div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="history-box"><div class="tiny">Detailní a kompletní historii najdeš v Databázi cviků. Tady nechávám jen rychlý mobilní zápis bez zbytečnýho roztahování.</div></div>
    </div>
  `;
}

function renderAssignSelect(dayKey) {
      const select = document.getElementById('assignExerciseSelect');
      if (!select) return;
      const available = exercisesForDayFilter(dayKey);
      if (!available.length) {
        select.innerHTML = `<option value="">Nejdřív přidej cvik do databáze nebo změň filtr</option>`;
        return;
      }
      select.innerHTML = `<option value="">Vyber cvik</option>` + available.map(ex =>
        `<option value="${ex.id}">${escapeHtml(ex.name)}${ex.part ? ` · ${escapeHtml(ex.part)}` : ''}</option>`
      ).join('');
    }

function bindDayPanel(dayKey) {
  renderAssignSelect(dayKey);
  document.getElementById('dayPartFilter').addEventListener('change', (e) => {
    state.ui.dayPartFilters[dayKey] = e.target.value;
    saveState();
    render();
  });
  document.getElementById('assignExerciseBtn').addEventListener('click', () => {
    assignExerciseToDay(dayKey, document.getElementById('assignExerciseSelect').value);
  });
  document.getElementById('saveWorkoutBtn').addEventListener('click', () => saveWholeWorkout(dayKey));

  const wrap = document.getElementById('dayExerciseList');
  wrap.querySelectorAll('[data-removefromday]').forEach(btn => btn.addEventListener('click', () => unassignExerciseFromDay(dayKey, btn.dataset.removefromday)));
  wrap.querySelectorAll('[data-add-set]').forEach(btn => btn.addEventListener('click', () => addSetToDayExercise(dayKey, btn.dataset.addSet)));
  wrap.querySelectorAll('[data-remove-set]').forEach(btn => btn.addEventListener('click', () => removeSetFromDayExercise(dayKey, btn.dataset.removeSet)));
  wrap.querySelectorAll('[data-move-up]').forEach(btn => btn.addEventListener('click', () => moveExerciseInDay(dayKey, btn.dataset.moveUp, 'up')));
  wrap.querySelectorAll('[data-move-down]').forEach(btn => btn.addEventListener('click', () => moveExerciseInDay(dayKey, btn.dataset.moveDown, 'down')));

  wrap.querySelectorAll('.set-row').forEach(row => {
    const exerciseId = row.dataset.exercise;
    const setIndex = Number(row.dataset.set);
    const ex = findExercise(exerciseId);
    const weightInput = row.querySelector('.weight-input');
    const repsInput = row.querySelector('.reps-input');
    const trendBox = row.querySelector('.trend');
    const trendIcon = trendBox.querySelector('span');
    const trendText = row.querySelector('.trend-text');
    const updateTrend = () => {
      const tr = trendForInput(ex, setIndex, weightInput ? weightInput.value : null, repsInput.value);
      trendBox.className = `trend ${tr.cls}`;
      trendIcon.textContent = tr.icon;
      trendText.textContent = tr.text;
    };
    if (weightInput) {
      weightInput.addEventListener('input', () => { updateDraft(dayKey, exerciseId, setIndex, 'weight', weightInput.value); updateTrend(); });
      row.querySelector('.weight-minus').addEventListener('click', () => updateExerciseDraftValue(dayKey, exerciseId, setIndex, 'weight', -0.5));
      row.querySelector('.weight-plus').addEventListener('click', () => updateExerciseDraftValue(dayKey, exerciseId, setIndex, 'weight', 0.5));
    }
    repsInput.addEventListener('input', () => { updateDraft(dayKey, exerciseId, setIndex, 'reps', repsInput.value); updateTrend(); });
    row.querySelector('.reps-minus').addEventListener('click', () => updateExerciseDraftValue(dayKey, exerciseId, setIndex, 'reps', -1));
    row.querySelector('.reps-plus').addEventListener('click', () => updateExerciseDraftValue(dayKey, exerciseId, setIndex, 'reps', 1));
  });
}

function render() {
      renderTabs();
      renderPanel();
    }

    document.getElementById('resetBtn').addEventListener('click', () => {
      if (!confirm('Fakt smazat všechna data?')) return;
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      activeTab = DAYS[0].key;
      render();
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'training-log-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());

    document.getElementById('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state = migrateState(JSON.parse(await file.text()));
        saveState();
        render();
        alert('Import hotový.');
      } catch (err) {
        console.error(err);
        alert('Import selhal.');
      } finally {
        e.target.value = '';
      }
    });

    document.getElementById('seedDemoBtn').addEventListener('click', () => {
      state = defaultState();
      const ex1 = defaultExercise('Bench press', 'Hrudník', 'both', 'weight');
      ex1.history = [
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*9).toISOString(), dayKey: 'mon', setIndex: 1, weight: 80, reps: 8 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*6).toISOString(), dayKey: 'mon', setIndex: 1, weight: 82.5, reps: 8 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*3).toISOString(), dayKey: 'thu', setIndex: 1, weight: 82.5, reps: 9 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*3).toISOString(), dayKey: 'thu', setIndex: 2, weight: 80, reps: 8 }
      ];
      const ex2 = defaultExercise('Shyby', 'Záda', 'reps', 'bw');
      ex2.history = [
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*8).toISOString(), dayKey: 'tue', setIndex: 1, weight: null, reps: 10 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*5).toISOString(), dayKey: 'fri', setIndex: 1, weight: null, reps: 11 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*2).toISOString(), dayKey: 'fri', setIndex: 1, weight: null, reps: 9 }
      ];
      const ex3 = defaultExercise('Dřep', 'Nohy', 'weight', 'weight');
      ex3.history = [
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*7).toISOString(), dayKey: 'wed', setIndex: 1, weight: 100, reps: 6 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*4).toISOString(), dayKey: 'wed', setIndex: 1, weight: 102.5, reps: 6 },
        { id: uid(), date: new Date(Date.now()-1000*60*60*24*1).toISOString(), dayKey: 'wed', setIndex: 1, weight: 105, reps: 5 }
      ];
      state.exercises = [ex1, ex2, ex3];
      state.days.mon.items = [{ exerciseId: ex1.id, setCount: 2 }];
      state.days.tue.items = [{ exerciseId: ex2.id, setCount: 2 }];
      state.days.wed.items = [{ exerciseId: ex3.id, setCount: 1 }];
      for (const d of DAYS) {
        for (const item of state.days[d.key].items) ensureDraftSlots(d.key, item.exerciseId, item.setCount);
      }
      saveState();
      render();
    });

    render();
  
