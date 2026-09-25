/**
 * Assemble the Vercel output: landing page at /, web app at /app (already built by Vite into
 * dist/app), the signed APK at /download/forge.apk. Fills the landing page's live numbers from
 * the real catalog and APK so nothing on it is made up.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const dist = 'dist'
const cp = (a, b) => { fs.mkdirSync(b.split('/').slice(0, -1).join('/'), { recursive: true }); fs.copyFileSync(a, b) }
for (const f of fs.readdirSync('site')) if (f !== 'index.html') fs.cpSync(`site/${f}`, `${dist}/${f}`, { recursive: true })
fs.cpSync('public/fonts', `${dist}/fonts`, { recursive: true })
cp('public/favicon.svg', `${dist}/favicon.svg`)

// Remote (git-triggered) Vercel builds have no release/ folder (it is gitignored), so pull the
// signed APK from the latest GitHub release instead of shipping a page with a dead download link.
if (!fs.existsSync('release/forge.apk')) {
  const res = await fetch('https://github.com/purvalsingh/forge-fitness-app/releases/latest/download/forge.apk')
  if (res.ok) { fs.mkdirSync('release', { recursive: true }); fs.writeFileSync('release/forge.apk', Buffer.from(await res.arrayBuffer())) }
  else console.warn(`assemble: GitHub release APK fetch failed (${res.status})`)
}

let size = '—', sha = 'not built yet'
if (fs.existsSync('release/forge.apk')) {
  cp('release/forge.apk', `${dist}/download/forge.apk`)
  const buf = fs.readFileSync('release/forge.apk')
  sha = createHash('sha256').update(buf).digest('hex')
  size = `${(buf.length / 1e6).toFixed(1)} MB`
  fs.writeFileSync(`${dist}/download/forge.apk.sha256`, `${sha}  forge.apk\n`)
} else console.warn('assemble: release/forge.apk missing — run `npm run apk` first')

const { foods } = JSON.parse(fs.readFileSync('public/food-catalog.json', 'utf8'))
const REGIONS = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry']
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const cards = REGIONS.map((r, i) => {
  const d = foods.filter(f => f.state === r)
  const sample = d.slice(0, 3).map(f => f.name.replace(/\s*\(.*\)$/, '')).join(', ')
  return `<article class="state"><span class="ut">${i < 28 ? 'STATE' : 'UNION TERRITORY'}</span><div class="n">${d.length}</div><h3>${esc(r)}</h3><p>${esc(sample)}</p></article>`
}).join('')

let html = fs.readFileSync('site/index.html', 'utf8')
html = html.replaceAll('{{APK_SIZE}}', size).replaceAll('{{APK_SHA256}}', sha).replaceAll('{{APK_SHA_SHORT}}', sha.slice(0, 16) + '…')
  .replace('{{STATE_CARDS}}', cards)
fs.writeFileSync(`${dist}/index.html`, html)
console.log(`assembled: landing + app + apk (${size}), ${REGIONS.length} regions, ${foods.length} foods`)
