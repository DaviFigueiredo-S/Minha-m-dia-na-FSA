/* Média Certa — interface, persistência e simulações. */
(() => {
  'use strict';

  const CORE = window.MediaCertaCore;
  const { COMPONENTS, MODES, parseGrade, activeComponents,
    effectiveGrades, calculateAverageForMode, partialForMode, prepareProjectionGrades, customRound, requiredFor,
    nextExamScenario: nextExamScenarioFromCore } = CORE;
  const LABELS = { P1: 'P1 · Prova 1', P2: 'P2 · Prova 2', PI: 'P.I · Prova integrada', ATV: 'ATV · Atividade' };
  const STORAGE_KEY = 'media-certa-state-v1';
  const INTRO_SEEN_KEY = 'media-certa-intro-seen-v1';
  const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const blankGrades = () => ({ P1: '', P2: '', PI: '', ATV: '' });
  const defaultSubject = (number = 1) => ({
    id: makeId(), name: `Disciplina ${number}`, grades: blankGrades(), mode: MODES.PI,
    target: 'P2', targetManual: false
  });

  let simulatorCollapsed = false;
  let selectedGradeScenario = null;
  let selectedImage = null;
  let imageObjectUrl = null;
  let ocrScriptPromise = null;
  let importReviewRows = [];

  function sanitizeSubject(subject, index = 1) {
    const grades = blankGrades();
    COMPONENTS.forEach((key) => {
      const value = subject?.grades?.[key];
      grades[key] = value === null || value === undefined ? '' : String(value);
    });
    const mode = Object.values(MODES).includes(subject?.mode) ? subject.mode : MODES.PI;
    const targetOptions = mode === MODES.PI ? ['P2', 'ATV', 'PI'] : ['P2', 'ATV'];
    return {
      id: String(subject?.id || makeId()),
      name: String(subject?.name || `Disciplina ${index}`).slice(0, 80),
      grades,
      mode,
      target: targetOptions.includes(subject?.target) ? subject.target : 'P2',
      targetManual: Boolean(subject?.targetManual)
    };
  }

  function initialState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.subjects) && saved.subjects.length) {
        const subjects = saved.subjects.map((subject, index) => sanitizeSubject(subject, index + 1));
        return {
          subjects,
          activeId: subjects.some((subject) => subject.id === saved.activeId) ? saved.activeId : subjects[0].id,
          history: Array.isArray(saved.history) ? saved.history.slice(-150) : []
        };
      }
    } catch (_) { /* A aplicação também funciona se o armazenamento local não estiver disponível. */ }
    const subject = defaultSubject();
    return { subjects: [subject], activeId: subject.id, history: [] };
  }

  const state = initialState();

  function activeSubject() {
    return state.subjects.find((subject) => subject.id === state.activeId) || state.subjects[0];
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function saveState() {
    const status = $('#save-status');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (status) {
        status.innerHTML = '<span class="status-dot"></span><span>Salvo</span>';
        status.title = 'Alterações salvas neste navegador.';
      }
    } catch (_) {
      if (status) {
        status.innerHTML = '<span class="status-dot warning-dot"></span><span>Não foi possível salvar</span>';
        status.title = 'O navegador não permitiu salvar os dados localmente.';
      }
    }
  }

  function toast(message, kind = '') {
    const region = $('#toast-region');
    if (!region) return;
    const node = document.createElement('div');
    node.className = `toast ${kind}`.trim();
    node.textContent = message;
    region.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }

  function formatNumber(value, digits = 3) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toFixed(digits).replace('.', ',');
  }

  function formatRounded(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toFixed(1).replace('.', ',');
  }

  function gradeIssue(raw) {
    const text = String(raw ?? '').trim();
    if (!text || /[.,]$/.test(text)) return '';
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return 'Use um número entre 0 e 10.';
    const number = Number(text.replace(',', '.'));
    if (number < 0 || number > 10) return 'A nota deve estar entre 0 e 10.';
    return '';
  }

  function getGrades(subject = activeSubject()) {
    const values = {};
    COMPONENTS.forEach((key) => { values[key] = parseGrade(subject.grades[key]); });
    return values;
  }

  function getIssues(subject = activeSubject()) {
    return activeComponents(subject.mode).map((key) => ({ key, issue: gradeIssue(subject.grades[key]) }))
      .filter((entry) => entry.issue && String(subject.grades[entry.key] ?? '').trim());
  }

  function isNumericGradeEntered(subject = activeSubject()) {
    const grades = getGrades(subject);
    return activeComponents(subject.mode).some((key) => grades[key] !== null);
  }

  function chooseTarget(subject, grades = getGrades(subject)) {
    const candidates = subject.mode === MODES.PI ? ['P2', 'ATV', 'PI'] : ['P2', 'ATV'];
    if (subject.targetManual && candidates.includes(subject.target)) return subject.target;
    if (grades.P1 !== null && grades.P2 === null) return 'P2';
    return candidates.find((key) => grades[key] === null) || (candidates.includes(subject.target) ? subject.target : 'P2');
  }

  function updateModePresentation(subject = activeSubject()) {
    $('#assessment-mode-select').value = subject.mode;
    $('#field-PI').hidden = subject.mode !== MODES.PI;
    $('#grade-fields').classList.toggle('without-pi', subject.mode !== MODES.PI);
    const hints = {
      pi: 'P1 e P2 valem 40% cada; P.I e atividade valem 10% cada.',
      presentation: 'P1 e P2 valem 40% cada; a ATV vale 20%. O bônus é aplicado à P2 uma única vez.',
      none: 'P1 e P2 valem 40% cada; a ATV vale 20%, sem P.I nem bônus.'
    };
    $('#mode-note').textContent = hints[subject.mode];
    $('#hint-P1').textContent = 'Peso 40%';
    $('#hint-P2').textContent = 'Peso 40%';
    $('#hint-PI').textContent = 'Peso 10%';
    $('#hint-ATV').textContent = subject.mode === MODES.PI ? 'Peso 10%' : 'Peso 20%';
    const p2raw = parseGrade(subject.grades.P2);
    const bonusNote = $('#p2-effective-note');
    if (subject.mode === MODES.PRESENTATION) {
      bonusNote.hidden = false;
      bonusNote.textContent = p2raw === null
        ? 'P2 considerada: aguardando nota + 0,5 de bônus.'
        : `P2 considerada: ${formatNumber(Math.min(10, p2raw + 0.5), 3)} (inclui +0,5; máximo 10,0).`;
    } else {
      bonusNote.hidden = true;
      bonusNote.textContent = '';
    }
  }

  function renderGradeInputs() {
    const subject = activeSubject();
    COMPONENTS.forEach((key) => {
      const input = $(`[data-grade="${key}"]`);
      input.value = subject.grades[key] ?? '';
      const issue = gradeIssue(subject.grades[key]);
      input.classList.toggle('invalid', Boolean(issue && String(subject.grades[key] ?? '').trim()));
      input.setAttribute('aria-invalid', String(Boolean(issue && String(subject.grades[key] ?? '').trim())));
    });
    updateModePresentation(subject);
  }

  function renderCurrentResult() {
    const subject = activeSubject();
    const host = $('#result-panel');
    const grades = getGrades(subject);
    const active = activeComponents(subject.mode);
    const issues = getIssues(subject);
    if (issues.length) {
      host.innerHTML = `<div class="result-message error-message"><strong>Confira as notas destacadas</strong><p>${issues.map((entry) => `${escapeHTML(entry.key)}: ${escapeHTML(entry.issue)}`).join(' ')}</p></div>`;
      return;
    }

    const activityAssumed = grades.ATV === null;
    const projectedGrades = prepareProjectionGrades(grades, subject.mode);
    const partial = partialForMode(projectedGrades, subject.mode);
    const average = calculateAverageForMode(projectedGrades, subject.mode);
    const actuallyEntered = active.filter((key) => grades[key] !== null).length;
    const activityNote = activityAssumed
      ? '<p class="assumption-note">ATV não informada: considerada como 0 no cálculo. Para simular uma média maior, informe uma nota estimada em Minhas notas.</p>'
      : '';
    if (average !== null) {
      const rounded = customRound(average);
      const approved = rounded >= 5;
      host.innerHTML = `<div class="score-overview"><div><span class="result-label">MÉDIA APÓS ARREDONDAMENTO</span><strong class="result-score">${formatRounded(rounded)}<small>/ 10</small></strong></div><span class="result-pill ${approved ? 'approved' : 'not-approved'}">${approved ? 'Atingiu a meta' : 'Abaixo da meta'}</span></div><div class="result-details"><div><span>Média bruta</span><strong>${formatNumber(average)}</strong></div><div><span>Notas preenchidas</span><strong>${actuallyEntered} de ${active.length}</strong></div></div><p class="result-subtext">Cálculo conforme a modalidade selecionada${subject.mode === MODES.PRESENTATION && grades.P2 !== null ? `; P2 considerada em ${formatNumber(effectiveGrades(grades, subject.mode).P2)} após o bônus.` : ''}</p>${activityNote}`;
    } else {
      const missingLabels = partial.missing.map((key) => LABELS[key] || key).join(', ');
      const knownContribution = `<div class="partial-points"><span>Contribuição parcial para a média</span><strong>${formatNumber(partial.points)} <small>pontos de 10</small></strong></div>`;
      host.innerHTML = `${knownContribution}<div class="result-details partial-details"><div><span>Notas preenchidas</span><strong>${actuallyEntered} de ${active.length}</strong></div><div><span>Ainda falta</span><strong class="missing-components">${escapeHTML(missingLabels || 'nenhuma')}</strong></div></div><p class="result-subtext">Esta é a soma ponderada das notas disponíveis; ainda não representa uma média final porque há componentes pendentes.</p>${activityNote}`;
    }
  }

  function renderTargetOptions(subject, grades) {
    const select = $('#target-select');
    const options = subject.mode === MODES.PI ? ['P2', 'ATV', 'PI'] : ['P2', 'ATV'];
    const labels = { P2: 'P2 · Prova 2', ATV: 'ATV · Atividade', PI: 'P.I · Prova integrada' };
    const current = chooseTarget(subject, grades);
    select.innerHTML = options.map((key) => `<option value="${key}">${labels[key]}</option>`).join('');
    select.value = current;
    subject.target = current;
  }

  function getNextExamScenario(subject, grades) {
    const scenario = nextExamScenarioFromCore(grades);
    if (scenario.reason === 'p1-missing') {
      return { ...scenario, message: 'A P2 está preenchida, mas a P1 ainda está vazia. Preencha a P1 em Minhas notas para manter a ordem cronológica; não calculamos a P1 retroativamente.' };
    }
    if (scenario.reason === 'exams-complete') {
      return { ...scenario, message: 'P1 e P2 já estão preenchidas. Para testar outra possibilidade de atividade, informe uma nota estimada diretamente no campo ATV em Minhas notas.' };
    }
    return { ...scenario, message: '' };
  }

  function renderGradeScenarios(subject, grades) {
    const section = $('#grade-scenarios');
    const optionsHost = $('#grade-scenario-options');
    const resultHost = $('#grade-scenario-result');
    const description = $('#grade-scenarios-description');
    if (getIssues(subject).length) {
      section.hidden = true;
      optionsHost.innerHTML = '';
      resultHost.innerHTML = '';
      return;
    }
    const scenario = getNextExamScenario(subject, grades);
    if (!scenario.target || !scenario.values.length) {
      section.hidden = true;
      optionsHost.innerHTML = '';
      resultHost.innerHTML = '';
      if (scenario.message) {
        $('#chronology-notice').hidden = false;
        $('#chronology-notice').textContent = scenario.message;
      }
      return;
    }
    section.hidden = false;
    $('#chronology-notice').hidden = true;
    description.textContent = scenario.target === 'P2'
      ? `Simule a P2 de ${formatNumber(scenario.values[0], 1)} a 10,0. O primeiro valor nunca fica abaixo da P1 informada.`
      : 'Como a P1 ainda não foi informada, veja os cenários possíveis para a primeira prova, de 0,0 a 10,0.';
    if (!scenario.values.includes(selectedGradeScenario)) selectedGradeScenario = scenario.values[0];
    optionsHost.innerHTML = scenario.values.map((value) => `<button type="button" class="grade-scenario-option${value === selectedGradeScenario ? ' selected' : ''}" data-grade-scenario="${value.toFixed(1)}" aria-pressed="${String(value === selectedGradeScenario)}">${formatRounded(value)}</button>`).join('');

    const activityAssumed = grades.ATV === null;
    const projectedGrades = prepareProjectionGrades({ ...grades, [scenario.target]: selectedGradeScenario }, subject.mode, scenario.target);
    const average = calculateAverageForMode(projectedGrades, subject.mode);
    const partial = partialForMode(projectedGrades, subject.mode);
    const simulatedLabel = `${scenario.target} = ${formatRounded(selectedGradeScenario)}`;
    const assumption = activityAssumed ? '<p class="assumption-note">ATV não informada: considerada como 0 neste cenário. O campo oficial continua vazio.</p>' : '';
    if (average !== null) {
      const rounded = customRound(average);
      const approved = rounded >= 5;
      resultHost.innerHTML = `<div class="grade-scenario-summary"><div><span class="result-label">CENÁRIO HIPOTÉTICO · ${simulatedLabel}</span><strong>${formatNumber(average)}<small> média bruta</small></strong></div><span class="result-pill ${approved ? 'approved' : 'not-approved'}">${approved ? 'Atingiria a meta' : 'Abaixo da meta'}</span></div><div class="scenario-summary-bottom"><span>Média arredondada</span><strong>${formatRounded(rounded)}</strong><span>Contribuição calculada sem alterar as notas oficiais.</span></div>${assumption}`;
    } else {
      const missing = partial.missing.map((key) => LABELS[key] || key).join(', ');
      resultHost.innerHTML = `<div class="grade-scenario-summary partial"><div><span class="result-label">CENÁRIO HIPOTÉTICO · ${simulatedLabel}</span><strong>${formatNumber(partial.points)}<small> pontos parciais</small></strong></div><span class="result-pill neutral-pill">Média pendente</span></div><p class="scenario-explainer">Para calcular a média final, ainda falta: ${escapeHTML(missing || 'nenhum componente')}. As notas desconhecidas, exceto a ATV considerada como zero, não são inventadas.</p>${assumption}`;
    }
  }

  function renderTargetResult() {
    const subject = activeSubject();
    const grades = getGrades(subject);
    const host = $('#target-result');
    const target = subject.target;
    const active = activeComponents(subject.mode);
    const issues = getIssues(subject);
    const activityAssumed = target !== 'ATV' && grades.ATV === null;
    const scenarioGrades = prepareProjectionGrades(grades, subject.mode, target);

    if (issues.length) {
      host.innerHTML = '<p class="inline-notice">Corrija as notas inválidas para calcular a nota necessária.</p>';
      return;
    }
    if (grades.P1 === null) {
      host.innerHTML = '<p class="inline-notice">Preencha a P1 antes de calcular notas necessárias. A aplicação respeita a ordem das provas e não calcula a P1 retroativamente.</p>';
      return;
    }
    if (!active.includes(target)) {
      host.innerHTML = '<p class="inline-notice">Escolha um componente válido para a modalidade selecionada.</p>';
      return;
    }

    const missingOthers = active.filter((key) => key !== target && scenarioGrades[key] === null);
    if (missingOthers.length) {
      const labels = missingOthers.map((key) => LABELS[key] || key).join(', ');
      host.innerHTML = `<div class="target-message"><strong>Para calcular a nota mínima de ${escapeHTML(target)}, ainda falta informação.</strong><p>Informe ${escapeHTML(labels)}. ${activityAssumed ? 'A ATV não informada é considerada 0 nesta projeção.' : 'A nota oficial não será alterada.'}</p></div>`;
      return;
    }

    let result;
    try { result = requiredFor(target, scenarioGrades, subject.mode); }
    catch (error) {
      host.innerHTML = `<p class="inline-notice">${escapeHTML(error.message || 'Não foi possível calcular esta nota.')}</p>`;
      return;
    }
    const need = Math.max(0, result.rawRequired);
    let extra = '';
    if (!result.possible) {
      extra = `Mesmo com 10,0 em ${target}, a média bruta máxima neste cenário seria ${formatNumber(result.resultingAverage)}.`;
    } else {
      const predictedGrades = { ...scenarioGrades, [target]: result.effective };
      if (target !== 'ATV' && predictedGrades.ATV === null) predictedGrades.ATV = 0;
      const predictedAverage = calculateAverageForMode(predictedGrades, subject.mode);
      extra = predictedAverage === null
        ? `A nota mínima calculada é ${formatNumber(need)}. A média final ainda depende das demais notas não informadas.`
        : `Com ${formatNumber(need)} em ${target}, a média bruta seria ${formatNumber(predictedAverage)} e arredondaria para ${formatRounded(customRound(predictedAverage))}.`;
      if (grades[target] !== null) {
        extra += grades[target] + 1e-9 >= need
          ? ` A nota atual informada (${formatNumber(grades[target])}) alcança essa referência.`
          : ` A nota atual informada (${formatNumber(grades[target])}) está ${formatNumber(need - grades[target])} ponto(s) abaixo.`;
      }
      if (activityAssumed) extra += ' A ATV vazia foi considerada 0 apenas nesta projeção; ela não foi gravada como nota oficial.';
    }
    host.innerHTML = `<div class="target-answer"><div><span class="result-label">NOTA MÍNIMA · ${escapeHTML(target)}</span><strong>${result.possible ? formatNumber(need) : '&gt;10,000'}<small>/ 10</small></strong></div><span class="result-pill ${!result.possible ? 'not-approved' : result.rawRequired < 0 ? 'approved' : 'neutral-pill'}">${!result.possible ? 'Fora da escala' : result.rawRequired < 0 ? '0 já seria suficiente' : 'Calculado'}</span><p>${escapeHTML(extra)}</p></div>`;
  }

  function renderSimulator() {
    const subject = activeSubject();
    const grades = getGrades(subject);
    const validEntered = isNumericGradeEntered(subject);
    const card = $('#simulator-card');
    card.hidden = !validEntered;
    $('#simulator-empty').hidden = validEntered;
    if (!validEntered) {
      $('#grade-scenarios').hidden = true;
      return;
    }

    $('#simulator-content').hidden = simulatorCollapsed;
    $('#toggle-simulator').setAttribute('aria-expanded', String(!simulatorCollapsed));
    $('#toggle-simulator-label').textContent = simulatorCollapsed ? 'Expandir' : 'Minimizar';
    $('#toggle-simulator-icon').textContent = simulatorCollapsed ? '+' : '−';
    const chronology = $('#chronology-notice');
    chronology.hidden = true;
    chronology.textContent = '';
    renderTargetOptions(subject, grades);
    renderCurrentResult();
    renderGradeScenarios(subject, grades);
    renderTargetResult();
  }

  function renderHistory() {
    const host = $('#history-list');
    const subject = activeSubject();
    const entries = state.history.filter((entry) => entry.subjectId === subject.id).sort((a, b) => b.createdAt - a.createdAt);
    if (!entries.length) {
      host.innerHTML = '<p class="history-empty">Nenhum cenário salvo para esta disciplina.</p>';
      return;
    }
    host.innerHTML = entries.map((entry) => {
      const date = new Date(entry.createdAt);
      const dateText = Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const gradesText = COMPONENTS.filter((key) => key !== 'PI' || entry.mode === MODES.PI)
        .map((key) => `${key}: ${entry.grades?.[key] === '' || entry.grades?.[key] == null ? '—' : escapeHTML(entry.grades[key])}`).join(' · ');
      const resultText = entry.raw !== null && entry.raw !== undefined
        ? `Média ${formatNumber(entry.raw)} · arredondada ${formatRounded(entry.rounded)}${entry.atvAssumedZero ? ' · ATV = 0 hipotética' : ''}`
        : `Alvo: ${escapeHTML(entry.target || 'P2')}`;
      return `<div class="history-item"><div><strong>${escapeHTML(entry.label || subject.name)}</strong><small>${dateText} · ${escapeHTML(entry.mode || MODES.PI)}</small></div><span class="history-result">${resultText}</span><span class="history-grades">${gradesText}</span><div class="history-actions"><button class="button button-secondary" type="button" data-restore-history="${escapeHTML(entry.id)}">Restaurar</button><button class="button button-quiet" type="button" data-delete-history="${escapeHTML(entry.id)}" aria-label="Excluir cenário">Excluir</button></div></div>`;
    }).join('');
  }

  function renderAll() {
    renderGradeInputs();
    renderSimulator();
    renderHistory();
  }

  function updateGradeFromInput(input) {
    const subject = activeSubject();
    const key = input.dataset.grade;
    if (!COMPONENTS.includes(key)) return;
    subject.grades[key] = input.value;
    const issue = gradeIssue(input.value);
    input.classList.toggle('invalid', Boolean(issue && input.value.trim()));
    input.setAttribute('aria-invalid', String(Boolean(issue && input.value.trim())));
    selectedGradeScenario = null;
    if (!subject.targetManual) subject.target = chooseTarget(subject, getGrades(subject));
    updateModePresentation(subject);
    saveState();
    renderSimulator();
  }

  function clearGrades() {
    const subject = activeSubject();
    subject.grades = blankGrades();
    subject.target = 'P2';
    subject.targetManual = false;
    selectedGradeScenario = null;
    saveState();
    renderAll();
    toast('Notas limpas. A modalidade selecionada foi mantida.');
  }

  function saveSnapshot() {
    const subject = activeSubject();
    const issues = getIssues(subject);
    if (issues.length) {
      toast('Corrija as notas inválidas antes de salvar.', 'error');
      return;
    }
    if (!isNumericGradeEntered(subject)) {
      toast('Preencha ao menos uma nota antes de salvar um cenário.', 'error');
      return;
    }
    const grades = getGrades(subject);
    const projected = prepareProjectionGrades(grades, subject.mode);
    const raw = calculateAverageForMode(projected, subject.mode);
    const target = chooseTarget(subject, grades);
    let required = null;
    const active = activeComponents(subject.mode);
    if (grades.P1 !== null) {
      const queryGrades = { ...prepareProjectionGrades(grades, subject.mode, target) };
      if (active.filter((key) => key !== target).every((key) => queryGrades[key] !== null)) {
        const req = requiredFor(target, queryGrades, subject.mode);
        required = req.possible ? Math.max(0, req.rawRequired) : null;
      }
    }
    state.history.push({
      id: makeId(), subjectId: subject.id, label: subject.name, createdAt: Date.now(),
      grades: { ...subject.grades }, mode: subject.mode, target,
      raw, rounded: raw === null ? null : customRound(raw), required,
      atvAssumedZero: grades.ATV === null
    });
    if (state.history.length > 150) state.history = state.history.slice(-150);
    saveState();
    renderHistory();
    $('#history-details').open = true;
    toast('Cenário salvo no histórico.', 'success');
  }

  function restoreSnapshot(id) {
    const entry = state.history.find((item) => item.id === id && item.subjectId === activeSubject().id);
    if (!entry) return;
    const subject = activeSubject();
    subject.grades = { ...blankGrades(), ...(entry.grades || {}) };
    subject.mode = Object.values(MODES).includes(entry.mode) ? entry.mode : MODES.PI;
    subject.target = ['P2', 'ATV', 'PI'].includes(entry.target) ? entry.target : 'P2';
    subject.targetManual = true;
    simulatorCollapsed = false;
    selectedGradeScenario = null;
    saveState();
    renderAll();
    toast('Cenário restaurado.', 'success');
  }

  function changeView(view) {
    const allowedViews = ['intro', 'notes', 'simulator', 'boletim'];
    if (!allowedViews.includes(view)) view = 'notes';
    $$('.nav-link').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    $$('.view').forEach((section) => {
      const selected = section.id === `view-${view}`;
      section.hidden = !selected;
      section.classList.toggle('active', selected);
    });
    if (view !== 'intro') {
      try { localStorage.setItem(INTRO_SEEN_KEY, 'true'); } catch (_) { /* localStorage opcional */ }
    }
    if (view === 'notes' || view === 'simulator') renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const temp = document.createElement('textarea');
        temp.value = text; temp.style.position = 'fixed'; temp.style.opacity = '0';
        document.body.appendChild(temp); temp.select();
        const copied = document.execCommand('copy'); temp.remove();
        if (!copied) throw new Error('O navegador não permitiu copiar.');
      }
      toast('Copiado.', 'success');
    } catch (_) { toast('Não foi possível copiar automaticamente.', 'error'); }
  }

  // ---------- OCR e importação assistida do boletim ----------
  function setOcrStatus(message, kind = '') {
    const status = $('#ocr-status');
    status.className = `ocr-status ${kind}`.trim();
    status.textContent = message;
  }

  function loadOcrLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (ocrScriptPromise) return ocrScriptPromise;
    ocrScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = OCR_SCRIPT_URL; script.async = true;
      script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('A biblioteca OCR carregou sem disponibilizar a API esperada.'));
      script.onerror = () => { ocrScriptPromise = null; reject(new Error('Não foi possível carregar o mecanismo OCR. Verifique a conexão com a internet.')); };
      document.head.appendChild(script);
    });
    return ocrScriptPromise;
  }

  function selectImage(file) {
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    selectedImage = null; imageObjectUrl = null;
    $('#run-ocr').disabled = true; $('#image-preview-wrap').hidden = true;
    $('#image-preview').removeAttribute('src'); $('#image-file-name').textContent = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setOcrStatus('O arquivo selecionado não parece ser uma imagem compatível.', 'error');
      $('#bulletin-image').value = ''; return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setOcrStatus('A imagem ultrapassa 15 MB. Escolha um arquivo menor.', 'error');
      $('#bulletin-image').value = ''; return;
    }
    selectedImage = file; imageObjectUrl = URL.createObjectURL(file);
    $('#image-preview').src = imageObjectUrl; $('#image-file-name').textContent = file.name;
    $('#image-preview-wrap').hidden = false; $('#run-ocr').disabled = false;
    setOcrStatus('Imagem selecionada. A leitura carrega o OCR e o idioma português pela internet.');
  }

  async function runOcr() {
    if (!selectedImage) { toast('Selecione uma imagem primeiro.', 'error'); return; }
    const button = $('#run-ocr'); button.disabled = true; button.textContent = 'Lendo imagem…';
    setOcrStatus('Carregando o OCR. Na primeira execução, o idioma português pode levar alguns instantes para baixar.');
    try {
      const Tesseract = await loadOcrLibrary();
      const result = await Tesseract.recognize(selectedImage, 'por', {
        logger: (message) => {
          if (message.status === 'recognizing text' && Number.isFinite(message.progress)) setOcrStatus(`Reconhecendo texto: ${Math.round(message.progress * 100)}%.`);
          else if (message.status) setOcrStatus(`OCR: ${message.status.replace(/-/g, ' ')}…`);
        }
      });
      $('#ocr-text').value = result?.data?.text || '';
      if (!$('#ocr-text').value.trim()) setOcrStatus('Nenhum texto foi reconhecido. Tente uma imagem mais nítida ou cole o texto manualmente.', 'error');
      else { setOcrStatus('Texto extraído. Confira e corrija antes de identificar as disciplinas.', 'success'); $('#ocr-text').focus(); }
    } catch (error) {
      setOcrStatus(`${error.message || 'O OCR falhou.'} Você ainda pode colar o texto manualmente.`, 'error');
    } finally { button.disabled = !selectedImage; button.textContent = 'Extrair texto da imagem'; }
  }

  function parseOcrRows(text) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/[|;]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const rows = []; const seen = new Set();
    const tokenPattern = '(?:10(?:[.,]0{1,3})?|[0-9](?:[.,][0-9]{1,3})?|[.,][0-9]{1,3}|--|—|-|\\?)';
    const trailingSequence = new RegExp(`^(.*?)\\s+(${tokenPattern}(?:\\s+${tokenPattern}){1,})\\s*$`);
    for (const line of lines) {
      if (/^(?:p1|p2|atv|pi|disciplina|mat[eé]ria|nome|nota|boletim|aluno|curso|semestre|m[eé]dia)(?:\s|$)/i.test(line) && !/\d[.,]\d/.test(line)) continue;
      const match = line.match(trailingSequence);
      if (!match) continue;
      const name = match[1].replace(/^\s*\d{1,3}[.)-]?\s+/, '').replace(/^[\s:._-]+|[\s:._-]+$/g, '').trim();
      if (!name || name.length < 2 || /^(p1|p2|atv|pi|disciplina|mat[eé]ria|nota|m[eé]dia)$/i.test(name)) continue;
      const tokens = match[2].trim().split(/\s+/).slice(-4);
      if (tokens.length < 2) continue;
      const grades = blankGrades(); const order = ['P1', 'P2', 'ATV', 'PI'];
      tokens.forEach((token, index) => {
        const key = order[index]; if (!key) return;
        if (/^(?:--|—|-|\?)$/.test(token)) { grades[key] = ''; return; }
        const number = parseGrade(token); grades[key] = number === null ? '' : String(number).replace('.', ',');
      });
      const signature = `${name.toLocaleLowerCase('pt-BR')}|${Object.values(grades).join('|')}`;
      if (seen.has(signature)) continue;
      seen.add(signature); rows.push({ id: makeId(), name: name.slice(0, 80), grades });
    }
    return rows;
  }

  function renderImportReview() {
    const card = $('#import-review-card'); const list = $('#import-review-list');
    card.hidden = importReviewRows.length === 0;
    if (!importReviewRows.length) { list.innerHTML = ''; return; }
    list.innerHTML = importReviewRows.map((row, index) => `<div class="import-row" data-import-row="${index}"><label class="import-name">DISCIPLINA<input type="text" maxlength="80" data-import-name="${index}" value="${escapeHTML(row.name)}" aria-label="Nome da disciplina ${index + 1}"></label>${COMPONENTS.map((key) => `<label>${key}<input type="text" inputmode="decimal" data-import-grade="${key}" data-import-index="${index}" value="${escapeHTML(row.grades[key] ?? '')}" placeholder="—" aria-label="Nota ${key} da disciplina ${index + 1}"></label>`).join('')}<button type="button" class="remove-import" data-remove-import="${index}" aria-label="Remover disciplina ${escapeHTML(row.name)}">×</button></div>`).join('') + `<div class="import-review-footer"><button class="button button-secondary" type="button" id="add-import-row">＋ Adicionar linha manual</button><span class="micro-copy">${importReviewRows.length} linha(s); campos vazios continuam desconhecidos.</span></div>`;
    $('#import-message').textContent = '';
  }

  function identifyImportRows() {
    const sourceText = $('#ocr-text').value;
    if (!sourceText.trim()) { toast('Cole o texto do boletim ou extraia uma imagem primeiro.', 'error'); return; }
    importReviewRows = parseOcrRows(sourceText); renderImportReview();
    if (importReviewRows.length) {
      $('#import-review-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(`${importReviewRows.length} possível(is) disciplina(s) encontrada(s). Revise antes de importar.`, 'success');
    } else {
      $('#import-review-card').hidden = true;
      toast('Não encontrei linhas com nome e notas. Revise o texto e tente novamente.', 'error');
      setOcrStatus('Cole uma linha por disciplina, com nome seguido pelas notas na ordem P1, P2, ATV, P.I.', 'error');
    }
  }

  function importReviewedRows() {
    if (!importReviewRows.length) return;
    const validRows = []; const errors = [];
    importReviewRows.forEach((row, index) => {
      const name = String(row.name || '').trim();
      if (!name) errors.push(`Linha ${index + 1}: informe o nome da disciplina.`);
      for (const key of COMPONENTS) {
        const raw = String(row.grades[key] ?? '').trim();
        if (raw && gradeIssue(raw)) errors.push(`Linha ${index + 1}, ${key}: nota inválida.`);
      }
      if (name && COMPONENTS.every((key) => !String(row.grades[key] ?? '').trim() || !gradeIssue(row.grades[key]))) validRows.push({ ...row, name, grades: { ...row.grades } });
    });
    if (errors.length) {
      $('#import-message').textContent = errors.slice(0, 5).join(' ');
      $('#import-message').style.color = 'var(--red)'; toast('Revise os campos destacados antes de importar.', 'error'); return;
    }
    if (!validRows.length) { toast('Não há disciplinas válidas para importar.', 'error'); return; }
    const created = validRows.map((row, index) => sanitizeSubject({
      id: makeId(), name: row.name, grades: row.grades, mode: MODES.PI, target: row.grades.P2 === '' ? 'P2' : row.grades.ATV === '' ? 'ATV' : row.grades.PI === '' ? 'PI' : 'P2'
    }, state.subjects.length + index + 1));
    state.subjects.push(...created); state.activeId = created[0].id;
    saveState(); importReviewRows = []; renderImportReview(); renderAll();
    $('#import-message').textContent = `${created.length} disciplina(s) importada(s). As notas não identificadas continuam vazias.`;
    $('#import-message').style.color = 'var(--green)';
    toast(`${created.length} disciplina(s) importada(s).`, 'success'); changeView('notes');
  }

  // APIs de cálculo ficam expostas apenas para testes automatizados e conferência.
  window.MediaCerta = CORE;

  // ---------- Eventos ----------
  $$('.nav-link').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.view)));
  $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.goView)));
  $('[data-brand-home]').addEventListener('click', (event) => { event.preventDefault(); changeView('intro'); });
  $('#clear-grades').addEventListener('click', () => {
    if (confirm('Limpar as notas desta disciplina? A modalidade e as outras disciplinas serão mantidas.')) clearGrades();
  });
  $('#save-snapshot').addEventListener('click', saveSnapshot);
  $('#assessment-mode-select').addEventListener('change', (event) => {
    const subject = activeSubject(); subject.mode = event.target.value;
    subject.targetManual = false;
    if (subject.mode !== MODES.PI && subject.target === 'PI') subject.target = 'ATV';
    subject.target = chooseTarget(subject, getGrades(subject));
    saveState(); renderAll();
  });
  $$('[data-grade]').forEach((input) => {
    input.addEventListener('input', () => updateGradeFromInput(input));
    input.addEventListener('blur', () => {
      const subject = activeSubject(); const key = input.dataset.grade;
      const parsed = parseGrade(subject.grades[key]);
      if (parsed !== null) {
        subject.grades[key] = String(parsed).replace('.', ','); input.value = subject.grades[key];
        saveState(); updateModePresentation(subject); renderSimulator();
      }
    });
  });
  $('#target-select').addEventListener('change', (event) => {
    const subject = activeSubject();
    const allowed = subject.mode === MODES.PI ? ['P2', 'ATV', 'PI'] : ['P2', 'ATV'];
    if (!allowed.includes(event.target.value)) return;
    subject.target = event.target.value; subject.targetManual = true;
    saveState(); renderTargetResult();
  });
  $('#toggle-simulator').addEventListener('click', () => {
    simulatorCollapsed = !simulatorCollapsed;
    $('#simulator-content').hidden = simulatorCollapsed;
    $('#toggle-simulator').setAttribute('aria-expanded', String(!simulatorCollapsed));
    $('#toggle-simulator-label').textContent = simulatorCollapsed ? 'Expandir' : 'Minimizar';
    $('#toggle-simulator-icon').textContent = simulatorCollapsed ? '+' : '−';
  });
  $('#grade-scenario-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-grade-scenario]');
    if (!button) return;
    selectedGradeScenario = Number(button.dataset.gradeScenario);
    renderSimulator();
  });
  $('#history-list').addEventListener('click', (event) => {
    const restore = event.target.closest('[data-restore-history]');
    const remove = event.target.closest('[data-delete-history]');
    if (restore) restoreSnapshot(restore.dataset.restoreHistory);
    if (remove) {
      const id = remove.dataset.deleteHistory;
      state.history = state.history.filter((entry) => entry.id !== id);
      saveState(); renderHistory(); toast('Cenário removido.');
    }
  });
  $('#year').textContent = String(new Date().getFullYear());

  $('#bulletin-image').addEventListener('change', (event) => selectImage(event.target.files?.[0] || null));
  $('#remove-image').addEventListener('click', () => {
    selectImage(null); $('#bulletin-image').value = ''; setOcrStatus('Imagem removida. Você ainda pode colar texto manualmente.');
  });
  $('#run-ocr').addEventListener('click', runOcr);
  $('#clear-ocr-text').addEventListener('click', () => {
    $('#ocr-text').value = ''; importReviewRows = []; renderImportReview();
    setOcrStatus('Texto limpo. Você pode extrair outra imagem ou colar um texto novo.');
  });
  $('#parse-ocr').addEventListener('click', identifyImportRows);
  $('#import-review-list').addEventListener('input', (event) => {
    const nameIndex = event.target.dataset.importName;
    if (nameIndex !== undefined && importReviewRows[Number(nameIndex)]) importReviewRows[Number(nameIndex)].name = event.target.value;
    const gradeIndex = event.target.dataset.importIndex;
    const gradeKey = event.target.dataset.importGrade;
    if (gradeIndex !== undefined && COMPONENTS.includes(gradeKey) && importReviewRows[Number(gradeIndex)]) {
      importReviewRows[Number(gradeIndex)].grades[gradeKey] = event.target.value;
      event.target.classList.toggle('invalid', Boolean(gradeIssue(event.target.value)) && Boolean(event.target.value.trim()));
    }
  });
  $('#import-review-list').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-import]');
    if (remove) { importReviewRows.splice(Number(remove.dataset.removeImport), 1); renderImportReview(); return; }
    if (event.target.closest('#add-import-row')) {
      importReviewRows.push({ id: makeId(), name: '', grades: blankGrades() }); renderImportReview();
      const names = $$('[data-import-name]'); names[names.length - 1]?.focus();
    }
  });
  $('#import-reviewed').addEventListener('click', importReviewedRows);

  renderAll();
  saveState();
  let introSeen = false;
  try { introSeen = localStorage.getItem(INTRO_SEEN_KEY) === 'true'; } catch (_) { /* localStorage opcional */ }
  changeView(introSeen ? 'notes' : 'intro');
})();
