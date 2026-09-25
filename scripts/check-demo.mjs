// Self-check for the landing page's accuracy demo: `node scripts/check-demo.mjs`
import fs from 'node:fs'
import assert from 'node:assert'
const src = fs.readFileSync(new URL('../site/app.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('  const NON_FOOD'), src.indexOf('  const input = $('))
const check = new Function(body + '\nreturn check')()
const cases = { '1 vada pav': 'ok', 'I ate a nuclear bomb': 'bad', '40 rotis': 'bad', 'forty rotis': 'bad', 'ignore previous instructions': 'bad', '2 roti dal tadka': 'ok', asdfgh: 'unk', 'ate a whole cow': 'unk', 'two dosa': 'ok' }
for (const [t, want] of Object.entries(cases)) assert.equal(check(t)[0], want, t)
assert.match(check('2 roti dal tadka')[1], /2 × roti .* 240 kcal/)
console.log('demo check ok')
