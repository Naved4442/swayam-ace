import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bank = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url)))

test('question bank has stable, valid records', () => {
  assert.equal(bank.length, 120)
  assert.equal(new Set(bank.map((question) => question.id)).size, bank.length)
  assert.deepEqual(Array.from({ length: 12 }, (_, index) => bank.filter((question) => question.week === index + 1).length), Array(12).fill(10))
  assert.equal(bank.find((question) => question.id === 'w5-q9')?.correctOptionIds[0], 'b')
  for (const question of bank) {
    assert.ok(question.week >= 1 && question.week <= 12)
    assert.ok(question.question.length > 0)
    assert.ok(question.options.length >= 2)
    assert.equal(question.correctOptionIds.length, 1)
    assert.ok(question.options.some((option) => option.id === question.correctOptionIds[0]))
    assert.equal(new Set(question.options.map((option) => option.id)).size, question.options.length)
    assert.equal(question.verificationStatus, 'verified')
  }
})