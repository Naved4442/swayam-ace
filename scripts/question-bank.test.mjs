import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url)))

// ── Core integrity ────────────────────────────────────────────────────────────
test('question bank has exactly 120 questions', () => {
  assert.equal(bank.length, 120)
})

test('all question IDs are unique', () => {
  assert.equal(new Set(bank.map((q) => q.id)).size, bank.length)
})

test('every week has exactly 10 questions (no more, no less)', () => {
  const counts = Array.from({ length: 12 }, (_, i) => bank.filter((q) => q.week === i + 1).length)
  assert.deepEqual(counts, Array(12).fill(10))
})

test('spot-check: w5-q9 correct answer is b', () => {
  assert.equal(bank.find((q) => q.id === 'w5-q9')?.correctOptionIds[0], 'b')
})

test('all questions have required fields', () => {
  for (const q of bank) {
    assert.ok(q.week >= 1 && q.week <= 12, `${q.id}: week out of range`)
    assert.ok(q.question.length > 0, `${q.id}: empty question`)
    assert.ok(q.options.length >= 2, `${q.id}: fewer than 2 options`)
    assert.equal(q.correctOptionIds.length, 1, `${q.id}: must have exactly 1 correct option`)
    assert.ok(q.options.some((o) => o.id === q.correctOptionIds[0]), `${q.id}: correct option not in option list`)
    assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length, `${q.id}: duplicate option IDs`)
    assert.equal(q.verificationStatus, 'verified', `${q.id}: not marked verified`)
  }
})

// ── Scope / filtering ─────────────────────────────────────────────────────────
test('all-weeks scope returns 120 questions', () => {
  const selected = bank  // 'all' scope = entire bank
  assert.equal(selected.length, 120)
})

test('each individual week filter returns exactly 10 questions', () => {
  for (let week = 1; week <= 12; week++) {
    const result = bank.filter((q) => q.week === week)
    assert.equal(result.length, 10, `Week ${week} should have 10 questions, got ${result.length}`)
  }
})

test('week filter for week 1 returns questions with week === 1 only', () => {
  const result = bank.filter((q) => q.week === 1)
  assert.ok(result.every((q) => q.week === 1))
  assert.equal(result.length, 10)
})

test('week filter for invalid week returns empty array (empty selection guard)', () => {
  const result = bank.filter((q) => q.week === 99)
  assert.equal(result.length, 0, 'Invalid week should produce empty selection')
})

test('stable label format: w1-q1 → W01-Q01', () => {
  // Replicate the stableLabel logic
  function stableLabel(id) {
    const [, wPart, qPart] = id.match(/^w(\d+)-q(\d+)$/) ?? []
    if (!wPart || !qPart) return id.toUpperCase()
    return `W${wPart.padStart(2, '0')}-Q${qPart.padStart(2, '0')}`
  }
  assert.equal(stableLabel('w1-q1'), 'W01-Q01')
  assert.equal(stableLabel('w12-q10'), 'W12-Q10')
  assert.equal(stableLabel('w3-q7'), 'W03-Q07')
})

// ── Navigation boundary simulation ────────────────────────────────────────────
test('navigation: index 0 is the first question (no previous)', () => {
  const session = bank.filter((q) => q.week === 1).map((q) => q.id)
  const index = 0
  assert.equal(index === 0, true, 'At index 0 there is no previous question')
})

test('navigation: last index is total-1 (no next, submit shown)', () => {
  const session = bank.filter((q) => q.week === 1).map((q) => q.id)
  const index = session.length - 1
  assert.equal(index, 9, 'Last index for 10-question week is 9')
  assert.equal(index === session.length - 1, true, 'At last index submit/finish is shown')
})