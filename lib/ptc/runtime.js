/** Runtime discovery is installation-relative; explicit selections never silently fall back. */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
/**
 * Native worker targets whose bytes this checkout can stage, and whose host
 * `resolveWorker` therefore accepts. Each entry still needs its own
 * `runtime/<platform>-<arch>/` build; listing a target is not a release claim.
 *
 * `linux-x64` is listed because the worker is platform-neutral Rust (its only
 * `#[cfg(unix)]` divergence is the directory-fsync call this change fixes) and
 * the suite passes on Linux. `darwin-*` is deliberately absent: cap-std does not
 * take the `O_PATH` path there, so nothing in this change was verified against a
 * macOS host and the matrix should not imply otherwise.
 */
export const PLATFORMS = Object.freeze(['win32-x64', 'linux-x64'])
export function workerName(platform = process.platform) { return platform === 'win32' ? 'dsh-ops-worker.exe' : 'dsh-ops-worker' }
export function resolveWorker(config = {}, { packageRoot = PACKAGE_ROOT, env = process.env, platform = process.platform, arch = process.arch } = {}) {
  if (!PLATFORMS.includes(`${platform}-${arch}`)) throw new Error(`dsh-ops supports ${PLATFORMS.join(', ')}; unsupported runtime target ${platform}-${arch}.`)
  const explicit = config.binaryPath ?? env.DSH_OPS_WORKER_BIN
  const candidates = explicit !== undefined ? [explicit] : [
    path.join(packageRoot, 'runtime', `${platform}-${arch}`, workerName(platform)),
    path.join(packageRoot, 'native', 'target', 'release', workerName(platform)),
  ]
  for (const file of candidates) {
    if (!path.isAbsolute(file)) throw new Error('Native worker selection must be an absolute path.')
    let stat
    try { stat = fs.statSync(file) } catch { continue }
    if (!stat.isFile()) continue
    if (file.includes(`${path.sep}runtime${path.sep}`)) {
      const receipt = JSON.parse(fs.readFileSync(path.join(path.dirname(file),'provenance.json'),'utf8'))
      const version = JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version
      if (receipt.target !== `${platform}-${arch}` || receipt.version !== version || receipt.executable !== workerName(platform)
        || receipt.sha256 !== createHash('sha256').update(fs.readFileSync(file)).digest('hex')) throw new Error('Native worker provenance mismatch.')
    }
    return file
  }
  throw new Error(`Native worker unavailable for ${platform}-${arch}. Install a runtime-bearing dsh-ops package, or run npm run build:ptc in the source checkout. No ACL repair, shell fallback or automatic download is performed.`)
}
