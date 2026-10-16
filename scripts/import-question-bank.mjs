import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const root = process.cwd()
const files = readdirSync(root).filter((file) => /^Wildlife Ecology Assignment \d+ Solutions.*\.pdf$/.test(file)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
const clean = (value) => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
const questions = []; const report = { files: [], weeks: {}, totalQuestions: 0, issues: [] }
for (const file of files) {
  const week = Number(file.match(/\d+/)[0]); const xml = execFileSync('pdftohtml', ['-xml', '-i', '-stdout', join(root, file)], { encoding: 'utf8' })
  const texts = [...xml.matchAll(/<text[^>]*left="(\d+)"[^>]*font="(\d+)"[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({ left: m[1], font: m[2], text: clean(m[3]) }))
  for (let j = 0; j < texts.length - 1; j += 1) { if (texts[j].left === '108' && /^\d{1,2}$/.test(texts[j].text)) { let next = j + 1; while (next < texts.length && !texts[next].text.trim()) texts.splice(next, 1); if (next < texts.length && !/^\(?[a-d]\)?[.)]?$/.test(texts[next].text)) { texts[j].text = `${texts[j].text}. ${texts[next].text}`; texts.splice(next, 1) } } }
  const starts = texts.map((item, index) => item.left === '108' && item.text.match(/^(\d{1,2})(?:\.|\s)\s+(.{5,})/) ? index : -1).filter((index) => index >= 0); const weekQuestions = []
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]; const end = starts[i + 1] ?? texts.length; const head = texts[start].text.match(/^(\d{1,2})(?:\.|\s)\s+(.{5,})/)
    const optionItems = texts.slice(start + 1, end); const options = []; let markedText = ''
    for (let j = 0; j < optionItems.length; j += 1) { const label = optionItems[j].text.match(/^\(?([a-d])\)?[.)]?$/i); if (!label) continue; const textItem = optionItems[j + 1]; if (!textItem) continue; options.push({ id: label[1].toLowerCase(), text: textItem.text }); if (textItem.font === '2') markedText = textItem.text }
    const week6Answers = ['c', 'c', 'b', 'b', 'c', 'c', 'b', 'c', 'd', 'a']; const answer = options.find((option) => markedText.includes(option.text)) || (week === 6 && week6Answers[Number(head[1]) - 1] ? options.find((option) => option.id === week6Answers[Number(head[1]) - 1]) : undefined)
    if (!head || options.length < 2 || !answer) { report.issues.push(`${file}: question ${i + 1} needs review`); continue }
    weekQuestions.push({ id: `w${week}-q${head[1]}`, week, question: head[2], type: 'single-choice', options, correctOptionIds: [answer.id], explanation: '', sourceReference: `${file}, question ${head[1]}`, tags: [], verificationStatus: 'verified' })
  }
  report.files.push(file); report.weeks[week] = weekQuestions.length; if (weekQuestions.length !== 10) report.issues.push(`${file}: imported ${weekQuestions.length}/10 questions`); questions.push(...weekQuestions)
}
report.totalQuestions = questions.length; mkdirSync(join(root, 'src/data'), { recursive: true }); writeFileSync(join(root, 'src/data/questions.json'), JSON.stringify(questions, null, 2) + '\n'); writeFileSync(join(root, 'SOURCE-VALIDATION.md'), `# Source validation\n\n- Files inspected: ${report.files.length}\n- Questions imported: ${report.totalQuestions}\n- Questions per week: ${Object.entries(report.weeks).map(([week, count]) => `Week ${week}: ${count}`).join(', ')}\n- Answer authority: bold option text in the supplied solution PDFs; Week 6 was visually verified because its PDF font metadata does not preserve the bold marker consistently\n- Missing or ambiguous entries: ${report.issues.length ? report.issues.join('; ') : 'None detected by the importer'}\n\nThe source PDFs are assignment solution papers. The importer excludes records when a question has fewer than two options or no authoritative answer marker.\n`); console.log(`Imported ${questions.length} questions from ${files.length} PDFs.`)