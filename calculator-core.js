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
  const SCENARIO_LEVELS = Object.freeze([0, 2.5, 5, 7.5, 10]);

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

  // Define qual prova ainda pode ser simulada sem retroceder na ordem cronológica.
  function nextExamScenario(grades) {
    const normalized = normalizeGrades(grades);
    if (normalized.P1 === null && normalized.P2 !== null) {
      return { target: null, values: [], reason: 'p1-missing' };
    }
    if (normalized.P1 !== null && normalized.P2 !== null) {
      return { target: null, values: [], reason: 'exams-complete' };
    }
    if (normalized.P1 !== null) {
      return { target: 'P2', values: buildHalfPointScenarios(normalized.P1), reason: null };
    }
    return { target: 'P1', values: buildHalfPointScenarios(0), reason: null };
  }

  /*
   * Calcula a nota base necessária (antes do bônus, quando aplicável).
   * Para o modo apresentação, a P2 efetiva é min(10, P2 base + 0,5).
   */
  function requiredFor(target, grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const active = activeComponents(normalizedMode);
    if (!active.includes(target)) throw new TypeError(`Componente-alvo inválido para a modalidade selecionada: ${target}`);
    const normalized = normalizeGrades(grades);
    for (const key of active) {
      if (key !== target && !Number.isFinite(normalized[key])) {
        throw new TypeError(`A nota de ${key} precisa ser um número válido de 0 a 10 para calcular ${target}.`);
      }
    }
    const weights = weightsFor(normalizedMode);
    const effectiveOtherGrades = effectiveGrades({ ...normalized, [target]: null }, normalizedMode);
    let knownContribution = 0;
    active.forEach((key) => {
      if (key !== target) knownContribution += effectiveOtherGrades[key] * weights[key];
    });
    const requiredEffective = (PASS_TARGET - knownContribution) / weights[target];
    const rawRequired = target === 'P2' && normalizedMode === MODES.PRESENTATION
      ? requiredEffective - 0.5
      : requiredEffective;
    const possible = requiredEffective <= 10 + 1e-12;
    const effectiveBase = Math.max(0, Math.min(10, rawRequired));
    const resultingAverage = calculateAverageForMode({ ...normalized, [target]: effectiveBase }, normalizedMode);
    return {
      target,
      mode: normalizedMode,
      rawRequired,
      minimum: Math.max(0, rawRequired),
      effective: effectiveBase,
      possible,
      resultingAverage,
      rounded: customRound(resultingAverage),
      targetEffectiveScore: normalizedMode === MODES.PRESENTATION && target === 'P2' ? Math.min(10, effectiveBase + 0.5) : effectiveBase
    };
  }

  return {
    PASS_TARGET, MODES, COMPONENTS, SCENARIO_LEVELS, WEIGHTS: WEIGHTS_BY_MODE.pi,
    WEIGHTS_BY_MODE, normalizeMode, activeComponents, weightsFor, parseGrade,
    normalizeGrades, effectiveGrades, calculateAverage, calculateAverageForMode,
    partialForMode, prepareProjectionGrades, customRound, firstHalfPointAtOrAbove, buildHalfPointScenarios, nextExamScenario, requiredFor
  };
});
