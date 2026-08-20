// Pulling exactly one file out of a downloaded archive. Uses the tools that are
// already on every build machine, the same way gws's own install.js does, so
// the build stays dependency-free.
//
// Cross-building matters here: a Windows machine has to open a darwin .tar.gz
// to build the macOS bundle. Windows 10+ ships bsdtar as tar.exe, which does.
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function run (cmd, args, cwd) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd })
  if (r.error) return { ok: false, why: r.error.message }
  if ((r.status ?? 1) !== 0) return { ok: false, why: (r.stderr || r.stdout || '').trim() }
  return { ok: true }
}

// GNU tar reads "C:\path" as a remote host and tries to open a connection.
// Naming the archive relative to its own directory avoids the colon entirely,
// and works the same under bsdtar.
function localArchive (archive) {
  return { dir: path.dirname(archive), name: path.basename(archive) }
}

function unpackZip (archive, into) {
  const { dir, name } = localArchive(archive)
  const attempts = process.platform === 'win32'
    ? [
        ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${into.replace(/'/g, "''")}' -Force`]],
        ['tar', ['-xf', name, '-C', into]]
      ]
    : [
        ['unzip', ['-q', '-o', archive, '-d', into]],
        ['tar', ['-xf', name, '-C', into]]
      ]

  const why = []
  for (const [cmd, args] of attempts) {
    const r = run(cmd, args, dir)
    if (r.ok) return
    why.push(`${cmd}: ${r.why}`)
  }
  throw new Error(`could not unpack ${name}\n  ${why.join('\n  ')}`)
}

function unpackTar (archive, into) {
  const { dir, name } = localArchive(archive)
  const r = run('tar', ['-xzf', name, '-C', into], dir)
  if (!r.ok) throw new Error(`could not unpack ${name}\n  tar: ${r.why}`)
}

export async function extractOne (archive, entry, workDir) {
  const into = await fs.mkdtemp(path.join(workDir, 'unpack-'))
  try {
    if (archive.endsWith('.zip')) unpackZip(archive, into)
    else unpackTar(archive, into)

    const wanted = path.join(into, ...entry.split('/'))
    try {
      return await fs.readFile(wanted)
    } catch {
      throw new Error(`${path.basename(archive)} does not contain ${entry}`)
    }
  } finally {
    await fs.rm(into, { recursive: true, force: true })
  }
}
