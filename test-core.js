'use strict';
const assert = require('node:assert/strict');
const core = require('./calculator-core.js');
const { MODES, weightsFor, calculateAverageForMode, customRound, firstHalfPointAtOrAbove,
  buildHalfPointScenarios, nextExamScenario, prepareProjectionGrades, requiredFor } = core;

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Esperado ${expected}; recebido ${actual}`);
}

// Escala de cenários: sempre passos de 0,5 e primeiro valor maior ou igual à base.
const expectedFirst = [[3,3], [3.4,3.5], [2.2,2.5], [6.7,7], [9.8,10], [10,10], [0,0]];
for (const [input, expected] of expectedFirst) assert.equal(firstHalfPointAtOrAbove(input), expected);
for (const [input, expected] of expectedFirst) assert.equal(buildHalfPointScenarios(input)[0], expected);
for (const start of [0, 0.3, 3, 3.4, 6.7, 9.8, 10]) {
  const values = buildHalfPointScenarios(start);
  assert.ok(values.length > 0);
  assert.ok(values.every((value) => value >= 0 && value <= 10));
  assert.ok(values.every((value) => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9));
  assert.ok(values.every((value, i) => i === 0 || Math.abs(value - values[i - 1] - 0.5) < 1e-9));
  assert.equal(values.at(-1), 10);
}


// Ordem cronológica das avaliações.
assert.equal(nextExamScenario({ P1:null, P2:null, PI:10, ATV:5 }).target, 'P1');
assert.deepEqual(nextExamScenario({ P1:null, P2:6, PI:10, ATV:5 }), { target:null, values:[], reason:'p1-missing' });
assert.equal(nextExamScenario({ P1:3, P2:null, PI:10, ATV:5 }).target, 'P2');
assert.equal(nextExamScenario({ P1:3.4, P2:null, PI:10, ATV:5 }).values[0], 3.5);
assert.deepEqual(nextExamScenario({ P1:4, P2:7, PI:10, ATV:5 }), { target:null, values:[], reason:'exams-complete' });

// Arredondamento personalizado e limite de aprovação.
for (const [raw, rounded] of [[4.24,4],[4.25,4.5],[4.74,4.5],[4.75,5],[5.25,5.5],[6.74,6.5],[6.75,7],[8.99,9]]) {
  assert.equal(customRound(raw), rounded);
}

// Pesos permanecem em 100% nas três modalidades.
for (const mode of Object.values(MODES)) {
  approx(Object.values(weightsFor(mode)).reduce((sum, weight) => sum + weight, 0), 1);
}
assert.deepEqual(weightsFor(MODES.PI), { P1:.4, P2:.4, PI:.1, ATV:.1 });
assert.deepEqual(weightsFor(MODES.PRESENTATION), { P1:.4, P2:.4, ATV:.2 });
assert.deepEqual(weightsFor(MODES.NONE), { P1:.4, P2:.4, ATV:.2 });

// A P.I é ignorada nas modalidades sem integrada; o bônus de apresentação é limitado e aplicado uma vez.
const base = { P1:5, P2:9.8, PI:1, ATV:8 };
approx(calculateAverageForMode(base, MODES.PRESENTATION), 5*.4 + 10*.4 + 8*.2);
approx(calculateAverageForMode({ ...base, PI:10 }, MODES.NONE), calculateAverageForMode({ ...base, PI:0 }, MODES.NONE));
assert.equal(core.effectiveGrades({ P1:5, P2:9.8, PI:10, ATV:8 }, MODES.PRESENTATION).P2, 10);

// A ATV vazia vira hipótese 0 apenas na projeção, sem preencher o estado original.
const official = { P1:3, P2:null, PI:10, ATV:null };
const projected = prepareProjectionGrades(official, MODES.PI, 'P2');
assert.equal(projected.ATV, 0);
assert.equal(official.ATV, null);
assert.equal(projected.PI, 10);
const req = requiredFor('P2', projected, MODES.PI);
approx(req.rawRequired, 6.375);
assert.equal(prepareProjectionGrades({ P1:4, P2:5, PI:10, ATV:null }, MODES.NONE).ATV, 0);
assert.equal(prepareProjectionGrades({ P1:4, P2:5, PI:10, ATV:null }, MODES.PRESENTATION).PI, null);

// Referência original: P1=3, PI=10, ATV=6,4 requer P2=4,775.
const scenarioA = requiredFor('P2', { P1:3, P2:null, PI:10, ATV:6.4 }, MODES.PI);
approx(scenarioA.rawRequired, 4.775);
// P1=4,8 e P2=3,0, PI=10 requer ATV=6,3.
const scenarioF = requiredFor('ATV', { P1:4.8, P2:3, PI:10, ATV:null }, MODES.PI);
approx(scenarioF.rawRequired, 6.3);

console.log('PASSOU: todos os testes do núcleo matemático.');
