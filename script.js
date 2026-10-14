/* Média Certa FSA — interface sobre o núcleo matemático original. */
(() => {
  'use strict';
  const CORE = window.MediaCertaCore;
  const { COMPONENTS, MODES, parseGrade, activeComponents, effectiveGrades,
    calculateAverageForMode, partialForMode, prepareProjectionGrades, customRound,
    buildP2OutcomeScenarios } = CORE;
  const STORAGE_KEY = 'media-certa-state-v1'; // Compatível com dados de versões anteriores.
  const INTRO_SEEN_KEY = 'media-certa-intro-seen-v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const blankGrades = () => ({ P1: '', P2: '', PI: '', ATV: '' });
  const defaultSubject = () => ({ id: makeId(), name: 'Minha disciplina', grades: blankGrades(), mode: MODES.PI, target: 'P2', targetManual: false });
  let simulatorCollapsed = false;

  function sanitizeSubject(subject, index) {
    const grades = blankGrades();
    COMPONENTS.forEach((key) => { grades[key] = subject?.grades?.[key] == null ? '' : String(subject.grades[key]); });
    return {
      id: String(subject?.id || makeId()), name: String(subject?.name || `Disciplina ${index}`).slice(0, 80),
      grades, mode: Object.values(MODES).includes(subject?.mode) ? subject.mode : MODES.PI
    };
  }
  function initialState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.subjects) && saved.subjects.length) {
        const subjects = saved.subjects.map((s, i) => sanitizeSubject(s, i + 1));
        return { subjects, activeId: subjects.some((s) => s.id === saved.activeId) ? saved.activeId : subjects[0].id,
          history: Array.isArray(saved.history) ? saved.history.slice(-150) : [] };
      }
    } catch (_) { /* Continua sem armazenamento local. */ }
    const subject = defaultSubject();
    return { subjects: [subject], activeId: subject.id, history: [] };
  }
  const state = initialState();
  function activeSubject() { return state.subjects.find((s) => s.id === state.activeId) || state.subjects[0]; }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function saveState() {
    const host = $('#save-status');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      host.innerHTML = '<span class="status-dot"></span><span>Salvo</span>';
      host.title = 'As notas estão salvas neste navegador.';
    } catch (_) {
      host.innerHTML = '<span class="status-dot warning-dot"></span><span>Sem salvamento</span>';
      host.title = 'O navegador não permitiu o armazenamento local.';
    }
  }
  function toast(message, kind = '') {
    const node = document.createElement('div');
    node.className = `toast ${kind}`.trim(); node.textContent = message;
    $('#toast-region').appendChild(node);
    window.setTimeout(() => node.remove(), 3300);
  }
  function formatNumber(value, places = 3) {
    return Number.isFinite(value) ? value.toFixed(places).replace('.', ',') : '—';
  }
  function formatGrade(value) { return formatNumber(value, 1); }
  function gradeIssue(raw) {
    const text = String(raw ?? '').trim();
    if (!text || /[.,]$/.test(text)) return '';
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return 'Informe uma nota válida entre 0 e 10.';
    if (parseGrade(text) === null) return 'A nota deve estar entre 0 e 10.';
    return '';
  }
  function getGrades(subject = activeSubject()) {
    return Object.fromEntries(COMPONENTS.map((key) => [key, parseGrade(subject.grades[key])]));
  }
  function getIssues(subject = activeSubject()) {
    return activeComponents(subject.mode).map((key) => ({ key, issue: gradeIssue(subject.grades[key]) }))
      .filter(({ issue, key }) => Boolean(issue && String(subject.grades[key] ?? '').trim()));
  }
  function markInput(input, raw) {
    const invalid = Boolean(gradeIssue(raw) && String(raw).trim());
    input.classList.toggle('invalid', invalid);
    input.setAttribute('aria-invalid', String(invalid));
  }
  function updateModePresentation(subject = activeSubject()) {
    $('#assessment-mode-select').value = subject.mode;
    $('#field-PI').hidden = subject.mode !== MODES.PI;
    $('#grade-fields').classList.toggle('without-pi', subject.mode !== MODES.PI);
    const hint = {
      pi: 'Provas: 40% cada · P.I: 10% · ATV: 10%.',
      presentation: 'Provas: 40% cada · ATV: 20% · bônus único de até 0,5 na P2.',
      none: 'Provas: 40% cada · ATV: 20% · sem integrada nem bônus.'
    };
    $('#mode-note').textContent = hint[subject.mode];
    $('#hint-ATV').textContent = subject.mode === MODES.PI ? 'Peso 10%' : 'Peso 20%';
    const rawP2 = parseGrade(subject.grades.P2);
    const bonus = $('#p2-effective-note');
    bonus.hidden = subject.mode !== MODES.PRESENTATION;
    bonus.textContent = rawP2 === null
      ? 'A P2 receberá até +0,5 quando for informada.'
      : `P2 considerada: ${formatNumber(Math.min(10, rawP2 + 0.5))} (com bônus, até 10).`;
  }
  function renderGradeInputs() {
    const subject = activeSubject();
    COMPONENTS.forEach((key) => {
      const input = $(`[data-grade="${key}"]`);
      input.value = subject.grades[key] || '';
      markInput(input, input.value);
    });
    $('#simulator-ATV').value = subject.grades.ATV || '';
    markInput($('#simulator-ATV'), subject.grades.ATV);
    updateModePresentation(subject);
  }
  function activityAssumption(grades) {
    return grades.ATV === null
      ? '<p class="assumption-note">ATV não informada: usada como 0 apenas na projeção. O campo oficial permanece vazio.</p>' : '';
  }
  function renderCurrentResult(subject, grades) {
    const host = $('#result-panel');
    const active = activeComponents(subject.mode);
    const projected = prepareProjectionGrades(grades, subject.mode);
    const raw = calculateAverageForMode(projected, subject.mode);
    const actualCount = active.filter((key) => grades[key] !== null).length;
    if (raw !== null) {
      const rounded = customRound(raw);
      const approved = rounded >= 5;
      const actualP2 = grades.P2 !== null;
      const statusLabel = actualP2 ? (approved ? 'Aprovado na projeção' : 'Abaixo da média') : 'Projeção';
      host.innerHTML = `<div class="current-result-label">${actualP2 ? 'MÉDIA COM SUAS NOTAS' : 'MÉDIA PROVISÓRIA'}</div>
        <div class="current-result-main"><strong>${formatGrade(rounded)}<small> / 10</small></strong><span class="result-pill ${actualP2 ? (approved ? 'approved' : 'not-approved') : 'neutral-pill'}">${statusLabel}</span></div>
        <p>Média bruta: <strong>${formatNumber(raw)}</strong> · ${actualCount}/${active.length} notas informadas.${actualP2 ? '' : ' A P2 ainda não foi informada.'}</p>
        ${subject.mode === MODES.PRESENTATION && actualP2 ? `<p>P2 efetiva com bônus: ${formatNumber(effectiveGrades(grades, subject.mode).P2)}.</p>` : ''}
        ${activityAssumption(grades)}`;
    } else {
      const partial = partialForMode(projected, subject.mode);
      const missing = partial.missing.map((key) => key === 'PI' ? 'P.I' : key).join(', ');
      host.innerHTML = `<div class="current-result-label">SUA SITUAÇÃO ATUAL</div>
        <div class="current-result-main"><strong>${formatNumber(partial.points)}<small> pontos parciais</small></strong><span class="result-pill neutral-pill">Pendente</span></div>
        <p>${actualCount} de ${active.length} notas informadas. Falta: <strong>${escapeHTML(missing)}</strong>. Esta soma não representa uma média final.</p>${activityAssumption(grades)}`;
    }
  }
  function pct(count, total) { return total ? formatNumber(100 * count / total, 1) : '0,0'; }
  function statusHTML(row) {
    if (row.status === 'approved') return '<span class="status-label approved"><span class="status-indicator"></span>Aprovado</span>';
    if (row.status === 'failed') return '<span class="status-label failed"><span class="status-indicator"></span>Reprovado</span>';
    return '<span class="status-label undetermined"><span class="status-indicator"></span>Depende da P.I</span>';
  }
  function renderScenarioTable(subject, grades) {
    const data = buildP2OutcomeScenarios(grades, subject.mode);
    const { rows, counts } = data;
    const total = rows.length;
    const first = data.firstApproval;
    const summary = $('#scenario-summary');
    const body = $('#scenario-table-body');
    $('#scenarios-total').textContent = `${total} cenários`;
    $('#simulator-notice').textContent = grades.P2 === null
      ? 'A P2 ainda está vazia. Os valores abaixo são hipóteses, não notas registradas.'
      : `P2 oficial: ${formatNumber(grades.P2)}. Os cenários abaixo não alteram sua nota.`;
    $('#scenarios-description').textContent = data.missingPI
      ? 'Sem nota de P.I, usamos uma faixa possível de médias e destacamos apenas situações garantidas.'
      : 'De 0,0 a 10,0, em ordem crescente e de 0,5 em 0,5.';
    const columns = [
      { key: 'approved', text: 'Aprovação', color: 'approved' },
      { key: 'failed', text: 'Reprovação', color: 'failed' },
      ...(counts.undetermined ? [{ key: 'undetermined', text: 'Indeterminados', color: 'undetermined' }] : [])
    ];
    summary.innerHTML = `<div class="scenario-kpis${columns.length === 2 ? ' two-kpis' : ''}">${columns.map((col) => `<div class="kpi ${col.color}"><span>${col.text}</span><strong>${pct(counts[col.key], total)}%</strong><small>${counts[col.key]} de ${total} cenários</small></div>`).join('')}</div>
      <div class="distribution" role="img" aria-label="Aprovação em ${pct(counts.approved, total)} por cento dos cenários, reprovação em ${pct(counts.failed, total)} por cento${counts.undetermined ? ` e indeterminados em ${pct(counts.undetermined, total)} por cento` : ''}">
      ${columns.map((col) => `<span class="distribution-part ${col.color}" style="width:${(100 * counts[col.key] / total).toFixed(6)}%"></span>`).join('')}</div>
      <p class="first-approval">${first !== null ? `<strong>Primeira P2 que garante aprovação: ${formatGrade(first)}</strong>${subject.mode === MODES.PRESENTATION ? ' (antes do bônus de 0,5)' : ''}.` : data.missingPI ? '<strong>Nenhuma aprovação garantida</strong> sem conhecer a P.I.' : '<strong>Nenhuma P2 de 0 a 10 permite aprovação</strong> com as demais notas atuais.'}</p>`;
    body.innerHTML = rows.map((row) => {
      const isFirst = first === row.p2;
      const rawText = row.raw !== null ? formatNumber(row.raw) : `${formatNumber(row.minRaw)}–${formatNumber(row.maxRaw)}`;
      const finalText = row.rounded !== null ? formatGrade(row.rounded) : `${formatGrade(row.minRounded)}–${formatGrade(row.maxRounded)}`;
      const actual = grades.P2 !== null && Math.abs(row.p2 - grades.P2) < 1e-9;
      return `<tr class="scenario-row ${row.status}${isFirst ? ' first-pass' : ''}" ${isFirst ? 'aria-label="Primeiro cenário que garante aprovação"' : ''}>
        <td><strong>${formatGrade(row.p2)}</strong>${isFirst ? '<span class="row-flag">Primeira aprovação</span>' : ''}${actual ? '<span class="row-flag actual-flag">Sua nota</span>' : ''}</td>
        <td class="number">${rawText}</td><td class="number final-score">${finalText}</td><td>${statusHTML(row)}</td></tr>`;
    }).join('');
    $('#scenario-footnote').textContent = data.missingPI
      ? 'A P.I não foi informada. Faixas usam P.I entre 0 e 10; resultados indeterminados não são classificados como aprovação nem reprovação. ATV vazia = 0 hipotético. As porcentagens representam os 21 cenários, não probabilidades reais.'
      : 'Cada linha é um cenário hipotético de P2. Média bruta com três casas; resultado após o arredondamento personalizado. As porcentagens contam os 21 cenários, não são probabilidades reais.';
  }
  function renderSimulator() {
    const subject = activeSubject();
    const grades = getGrades(subject);
    const p1Ready = grades.P1 !== null;
    $('#simulator-card').hidden = !p1Ready;
    $('#simulator-gate').hidden = p1Ready;
    if (!p1Ready) return;
    $('#simulator-content').hidden = simulatorCollapsed;
    $('#toggle-simulator').setAttribute('aria-expanded', String(!simulatorCollapsed));
    $('#toggle-simulator-label').textContent = simulatorCollapsed ? 'Expandir' : 'Minimizar';
    $('#toggle-simulator-icon').textContent = simulatorCollapsed ? '+' : '−';
    const issues = getIssues(subject);
    if (issues.length) {
      $('#result-panel').innerHTML = `<div class="error-message"><strong>Corrija as notas inválidas.</strong> ${escapeHTML(issues.map((x) => `${x.key}: ${x.issue}`).join(' '))}</div>`;
      $('#scenario-content').hidden = true;
      $('#simulator-notice').textContent = 'A simulação será atualizada quando as notas forem válidas.';
      return;
    }
    $('#scenario-content').hidden = false;
    renderCurrentResult(subject, grades);
    renderScenarioTable(subject, grades);
  }
  function renderHistory() {
    const subject = activeSubject();
    const entries = state.history.filter((entry) => entry.subjectId === subject.id).sort((a, b) => b.createdAt - a.createdAt);
    const host = $('#history-list');
    if (!entries.length) { host.innerHTML = '<p class="history-empty">Nenhum cenário salvo ainda.</p>'; return; }
    host.innerHTML = entries.map((entry) => {
      const date = new Date(entry.createdAt);
      const when = Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem data';
      const summary = COMPONENTS.filter((k) => k !== 'PI' || entry.mode === MODES.PI)
        .map((key) => `${key === 'PI' ? 'P.I' : key}: ${entry.grades?.[key] ? escapeHTML(entry.grades[key]) : '—'}`).join(' · ');
      return `<article class="history-item"><div><strong>${escapeHTML(entry.label || subject.name)}</strong><small>${when}</small></div><p>${summary}</p><p>${entry.raw == null ? 'Média pendente' : `Média: ${formatNumber(entry.raw)} · arredondada: ${formatGrade(entry.rounded)}`}</p>
        <div class="history-actions"><button class="button button-secondary" type="button" data-restore-history="${escapeHTML(entry.id)}">Restaurar</button><button class="button button-quiet" type="button" data-delete-history="${escapeHTML(entry.id)}">Excluir</button></div></article>`;
    }).join('');
  }
  function renderAll() { renderGradeInputs(); renderSimulator(); renderHistory(); }
  function updateGradeFromInput(input, key) {
    const subject = activeSubject();
    if (!COMPONENTS.includes(key)) return;
    subject.grades[key] = input.value;
    markInput(input, input.value);
    if (key === 'ATV') {
      const paired = input.id === 'simulator-ATV' ? $('#grade-ATV') : $('#simulator-ATV');
      paired.value = input.value;
      markInput(paired, input.value);
    }
    if (key === 'P2') updateModePresentation(subject);
    saveState(); renderSimulator();
  }
  function normalizeGradeOnBlur(input, key) {
    const subject = activeSubject();
    const valid = parseGrade(subject.grades[key]);
    if (valid === null) return;
    subject.grades[key] = String(valid).replace('.', ',');
    input.value = subject.grades[key];
    if (key === 'ATV') {
      const paired = input.id === 'simulator-ATV' ? $('#grade-ATV') : $('#simulator-ATV');
      paired.value = input.value;
    }
    saveState(); updateModePresentation(subject); renderSimulator();
  }
  function clearGrades() {
    activeSubject().grades = blankGrades();
    saveState(); renderAll();
    toast('Notas limpas. A modalidade foi mantida.', 'success');
  }
  function saveSnapshot() {
    const subject = activeSubject();
    if (getIssues(subject).length) { toast('Corrija as notas inválidas antes de salvar.', 'error'); return; }
    if (!activeComponents(subject.mode).some((key) => parseGrade(subject.grades[key]) !== null)) {
      toast('Preencha alguma nota antes de salvar.', 'error'); return;
    }
    const grades = getGrades(subject);
    const projected = prepareProjectionGrades(grades, subject.mode);
    const raw = calculateAverageForMode(projected, subject.mode);
    state.history.push({
      id: makeId(), subjectId: subject.id, label: subject.name, createdAt: Date.now(),
      grades: { ...subject.grades }, mode: subject.mode, target: 'P2', raw,
      rounded: raw === null ? null : customRound(raw), atvAssumedZero: grades.ATV === null
    });
    if (state.history.length > 150) state.history = state.history.slice(-150);
    saveState(); renderHistory(); $('#history-details').open = true;
    toast('Cenário salvo no histórico.', 'success');
  }
  function restoreSnapshot(id) {
    const entry = state.history.find((item) => item.id === id && item.subjectId === activeSubject().id);
    if (!entry) return;
    const subject = activeSubject();
    subject.grades = { ...blankGrades(), ...entry.grades };
    subject.mode = Object.values(MODES).includes(entry.mode) ? entry.mode : MODES.PI;
    simulatorCollapsed = false;
    saveState(); renderAll();
    toast('Cenário restaurado.', 'success');
  }
  function changeView(view) {
    const selectedView = ['intro', 'notes'].includes(view) ? view : 'notes';
    $$('.nav-link').forEach((button) => {
      const active = button.dataset.view === selectedView;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $$('.view').forEach((section) => {
      const active = section.id === `view-${selectedView}`;
      section.hidden = !active; section.classList.toggle('active', active);
    });
    if (selectedView === 'notes') {
      try { localStorage.setItem(INTRO_SEEN_KEY, 'true'); } catch (_) { /* opcional */ }
      renderAll();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Eventos: nenhum elemento removido do boletim ou da ferramenta de nota mínima é referenciado.
  $$('.nav-link').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.view)));
  $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.goView)));
  $('[data-brand-home]').addEventListener('click', (event) => { event.preventDefault(); changeView('intro'); });
  $('#assessment-mode-select').addEventListener('change', (event) => {
    activeSubject().mode = event.target.value;
    saveState(); renderAll();
  });
  $('#clear-grades').addEventListener('click', () => {
    if (window.confirm('Limpar todas as notas da disciplina atual?')) clearGrades();
  });
  $('#save-snapshot').addEventListener('click', saveSnapshot);
  $$('[data-grade]').forEach((input) => {
    input.addEventListener('input', () => updateGradeFromInput(input, input.dataset.grade));
    input.addEventListener('blur', () => normalizeGradeOnBlur(input, input.dataset.grade));
  });
  const simulatorActivity = $('#simulator-ATV');
  simulatorActivity.addEventListener('input', () => updateGradeFromInput(simulatorActivity, 'ATV'));
  simulatorActivity.addEventListener('blur', () => normalizeGradeOnBlur(simulatorActivity, 'ATV'));
  $('#toggle-simulator').addEventListener('click', () => {
    simulatorCollapsed = !simulatorCollapsed;
    renderSimulator();
  });
  $('#history-list').addEventListener('click', (event) => {
    const restore = event.target.closest('[data-restore-history]');
    const remove = event.target.closest('[data-delete-history]');
    if (restore) restoreSnapshot(restore.dataset.restoreHistory);
    if (remove) {
      state.history = state.history.filter((item) => item.id !== remove.dataset.deleteHistory);
      saveState(); renderHistory(); toast('Cenário excluído.');
    }
  });
  window.MediaCerta = CORE; // Núcleo disponível para validação matemática.
  renderAll(); saveState();
  let hasSeenIntro = false;
  try { hasSeenIntro = localStorage.getItem(INTRO_SEEN_KEY) === 'true'; } catch (_) { /* opcional */ }
  changeView(hasSeenIntro ? 'notes' : 'intro');
})();
