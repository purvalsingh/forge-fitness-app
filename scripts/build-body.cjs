/**
 * Extract anatomical body SVG paths (male/female, front/back) from react-native-body-highlighter
 * (MIT, © ELABBASSI Hicham — see scripts/vendor/body-highlighter-LICENSE) into src/lib/body.json.
 *   node scripts/build-body.cjs <path-to-package/dist>
 */
const fs = require('fs'), path = require('path')
const dist = process.argv[2]
const load = f => require(path.join(dist, 'assets', f))
const outline = (file, side) => {
  const src = fs.readFileSync(path.join(dist, 'components', file), 'utf8')
  const re = new RegExp('side === "' + side + '" && \\(<react_native_svg_1\\.Path[^>]*? d="([^"]+)"')
  return (src.match(re) || [])[1] || ''
}
const viewBox = (file, side) => {
  const src = fs.readFileSync(path.join(dist, 'components', file), 'utf8')
  const m = src.match(/viewBox = side === "front" \? "([^"]+)" : "([^"]+)"/)
  return side === 'front' ? m[1] : m[2]
}
const parts = arr => arr.filter(p => !['hair'].includes(p.slug)).map(p => ({
  slug: p.slug, d: [...(p.path.common || []), ...(p.path.left || []), ...(p.path.right || [])],
}))
const out = {
  male: {
    front: { viewBox: viewBox('SvgMaleWrapper.js', 'front'), outline: outline('SvgMaleWrapper.js', 'front'), parts: parts(load('bodyFront.js').bodyFront) },
    back: { viewBox: viewBox('SvgMaleWrapper.js', 'back'), outline: outline('SvgMaleWrapper.js', 'back'), parts: parts(load('bodyBack.js').bodyBack) },
  },
  female: {
    front: { viewBox: viewBox('SvgFemaleWrapper.js', 'front'), outline: outline('SvgFemaleWrapper.js', 'front'), parts: parts(load('bodyFemaleFront.js').bodyFemaleFront) },
    back: { viewBox: viewBox('SvgFemaleWrapper.js', 'back'), outline: outline('SvgFemaleWrapper.js', 'back'), parts: parts(load('bodyFemaleBack.js').bodyFemaleBack) },
  },
}
fs.writeFileSync(path.join(__dirname, '../src/lib/body.json'), JSON.stringify(out))
for (const g of ['male', 'female']) for (const s of ['front', 'back'])
  console.log(g, s, out[g][s].viewBox, 'outline', out[g][s].outline.length, 'parts', out[g][s].parts.map(p => p.slug).join(','))
