/**
 * Publish dist/ to the gh-pages branch.
 * GitHub Pages has no server side, so 404.html is a copy of index.html — that is how a
 * client-routed app survives a deep link, and .nojekyll keeps underscore-prefixed files.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dist = path.resolve('dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run the build first.')

fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'))
fs.writeFileSync(path.join(dist, '.nojekyll'), '')

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-pages-'))
fs.cpSync(dist, work, { recursive: true })

const git = (...args) => execFileSync('git', args, { cwd: work, stdio: 'inherit' })
const remote = execFileSync('git', ['remote', 'get-url', 'origin']).toString().trim()

git('init', '-q')
git('checkout', '-q', '-b', 'gh-pages')
git('add', '-A')
git('-c', 'user.email=noreply@anthropic.com', '-c', 'user.name=FORGE', 'commit', '-qm', 'FORGE static build')
git('remote', 'add', 'origin', remote)
git('push', '-qf', 'origin', 'gh-pages')

fs.rmSync(work, { recursive: true, force: true })
console.log('published to gh-pages')
