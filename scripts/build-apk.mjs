/**
 * Build the signed release APK with the JDK 21 + Android SDK on this machine and copy it to
 * release/forge.apk (+ .sha256). Run via `npm run apk` (which builds and syncs the web bundle first).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'

const home = os.homedir()
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME_21 ?? `${home}/.local/jdk-21`,
  ANDROID_HOME: process.env.ANDROID_HOME ?? `${home}/.bubblewrap/android_sdk`,
}
execFileSync('./gradlew', ['assembleRelease', '--no-daemon', '-q'], { cwd: 'android', env, stdio: 'inherit' })
const out = 'android/app/build/outputs/apk/release/app-release.apk'
if (!fs.existsSync(out)) throw new Error('APK not produced — is the signing key in ~/.forge-signing?')
fs.mkdirSync('release', { recursive: true })
fs.copyFileSync(out, 'release/forge.apk')
const sha = createHash('sha256').update(fs.readFileSync(out)).digest('hex')
fs.writeFileSync('release/forge.apk.sha256', `${sha}  forge.apk\n`)
console.log(`release/forge.apk  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB  sha256 ${sha}`)
