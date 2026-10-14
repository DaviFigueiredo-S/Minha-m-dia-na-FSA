/* Núcleo matemático do Média Certa. Sem dependência do DOM. */
(function exposeCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MediaCertaCore = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, function createCore() {
  'use strict';

  const PASS_TARGET = 4.75;
  const MODES = Object.freeze({ PI: 'pi', PRESENTATION: 'presentation', NONE: 'none' });
  const COMPONENTS = Object.freeze(['P1', 'P2', 'PI', 'ATV']);
  const WEIGHTS_BY_MODE = Object.freeze({
    pi: Object.freeze({ P1: 0.4, P2: 0.4, PI: 0.1, ATV: 0.1 }),
    presentation: Object.freeze({ P1: 0.4, P2: 0.4, ATV: 0.2 }),
    none: Object.freeze({ P1: 0.4, P2: 0.4, ATV: 0.2 })
  });

  function normalizeMode(mode) {
    return Object.values(MODES).includes(mode) ? mode : MODES.PI;
  }

  function activeComponents(mode = MODES.PI) {
    return normalizeMode(mode) === MODES.PI ? ['P1', 'P2', 'PI', 'ATV'] : ['P1', 'P2', 'ATV'];
  }

  function weightsFor(mode = MODES.PI) {
    return WEIGHTS_BY_MODE[normalizeMode(mode)];
  }

  function parseGrade(raw) {
    const text = String(raw ?? '').trim();
    if (!text || /[.,]$/.test(text)) return null;
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return null;
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 10) return null;
    return value;
  }

  function normalizeGrades(grades = {}) {
    const result = {};
    COMPONENTS.forEach((key) => { result[key] = parseGrade(grades[key]); });
    return result;
  }

  function effectiveGrades(grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const result = normalizeGrades(grades);
    if (normalizedMode !== MODES.PI) result.PI = null;
    if (normalizedMode === MODES.PRESENTATION && result.P2 !== null) {
      result.P2 = Math.min(10, result.P2 + 0.5);
    }
    return result;
  }

  function calculateAverage(grades) {
    return ((grades.P1 + grades.P2) * 0.8) / 2 + ((grades.PI + grades.ATV) * 0.2) / 2;
  }

  function calculateAverageForMode(grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const effective = effectiveGrades(grades, normalizedMode);
    const active = activeComponents(normalizedMode);
    if (!active.every((key) => Number.isFinite(effective[key]))) return null;
    if (normalizedMode === MODES.PI) return calculateAverage(effective);
    const weights = weightsFor(normalizedMode);
    return active.reduce((sum, key) => sum + effective[key] * weights[key], 0);
  }

  function partialForMode(grades, mode = MODES.PI) {
    const effective = effectiveGrades(grades, mode);
    const active = activeComponents(mode);
    const weights = weightsFor(mode);
    let points = 0;
    const known = [];
    const missing = [];
    active.forEach((key) => {
      if (Number.isFinite(effective[key])) {
        points += effective[key] * weights[key];
        known.push(key);
      } else missing.push(key);
    });
    return { points, known, missing, total: active.length, weights, effective };
  }

  // Prepara notas para uma projeção sem gravar hipóteses nos dados oficiais.
  // Por especificação, ATV vazia equivale a 0 apenas nas projeções que não calculam a própria ATV.
  function prepareProjectionGrades(grades, mode = MODES.PI, target = null) {
    const normalized = normalizeGrades(grades);
    const normalizedMode = normalizeMode(mode);
    if (normalizedMode !== MODES.PI) normalized.PI = null;
    if (target !== 'ATV' && normalized.ATV === null) normalized.ATV = 0;
    return normalized;
  }

  function customRound(raw) {
    if (!Number.isFinite(raw)) return null;
    const integer = Math.floor(raw);
    const fraction = raw - integer;
    const epsilon = 1e-12;
    if (fraction >= 0.75 - epsilon) return Math.min(10, integer + 1);
    if (fraction >= 0.25 - epsilon) return Math.min(10, integer + 0.5);
    return Math.max(0, Math.min(10, integer));
  }

  // Primeiro valor da escala de 0,5 que seja maior ou igual à nota-base.
  function firstHalfPointAtOrAbove(value) {
    if (!Number.isFinite(Number(value))) return 0;
    const bounded = Math.max(0, Math.min(10, Number(value)));
    return Math.max(0, Math.min(10, Math.ceil((bounded - 1e-10) * 2) / 2));
  }

  function buildHalfPointScenarios(start = 0) {
    const first = firstHalfPointAtOrAbove(start);
    const count = Math.floor((10 - first) * 2 + 1e-9) + 1;
    return Array.from({ length: Math.max(0, count) }, (_, index) => Number((first + index * 0.5).toFixed(1)))
      .filter((grade) => grade >= first - 1e-9 && grade <= 10 + 1e-9);
  }

  // Todas as P2 hipotéticas entre 0 e 10, mesmo quando a P1 é maior.
  // Se a P.I estiver vazia, as faixas com P.I=0 e P.I=10 classificam
  // apenas resultados matematicamente garantidos, sem inventar nota oficial.
  function buildP2OutcomeScenarios(grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const known = normalizeGrades(grades);
    if (known.P1 === null) return { rows: [], counts: { approved: 0, failed: 0, undetermined: 0 }, firstApproval: null, assumedATV: known.ATV === null, missingPI: normalizedMode === MODES.PI && known.PI === null };
    const assumedATV = known.ATV === null;
    const missingPI = normalizedMode === MODES.PI && known.PI === null;
    const projected = prepareProjectionGrades(known, normalizedMode, 'P2');
    const rows = buildHalfPointScenarios(0).map((p2) => {
      const trial = { ...projected, P2: p2 };
      let raw = calculateAverageForMode(trial, normalizedMode);
      let minRaw = raw;
      let maxRaw = raw;
      if (missingPI) {
        minRaw = calculateAverageForMode({ ...trial, PI: 0 }, normalizedMode);
        maxRaw = calculateAverageForMode({ ...trial, PI: 10 }, normalizedMode);
      }
      const rounded = raw === null ? null : customRound(raw);
      const guaranteedApproved = customRound(minRaw) >= 5;
      const guaranteedFailed = customRound(maxRaw) < 5;
      const status = guaranteedApproved ? 'approved' : guaranteedFailed ? 'failed' : 'undetermined';
      return {
        p2, effectiveP2: effectiveGrades(trial, normalizedMode).P2,
        raw, rounded, minRaw, maxRaw,
        minRounded: customRound(minRaw), maxRounded: customRound(maxRaw), status
      };
    });
    const counts = { approved: 0, failed: 0, undetermined: 0 };
    rows.forEach((row) => { counts[row.status] += 1; });
    return {
      rows, counts, firstApproval: rows.find((row) => row.status === 'approved')?.p2 ?? null,
      assumedATV, missingPI
    };
  }

  return {
    PASS_TARGET, MODES, COMPONENTS, WEIGHTS: WEIGHTS_BY_MODE.pi,
    WEIGHTS_BY_MODE, normalizeMode, activeComponents, weightsFor, parseGrade,
    normalizeGrades, effectiveGrades, calculateAverage, calculateAverageForMode,
    partialForMode, prepareProjectionGrades, customRound, firstHalfPointAtOrAbove, buildHalfPointScenarios, buildP2OutcomeScenarios
  };
});
