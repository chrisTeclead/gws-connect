// Which files a bundle for a given platform is built from. Pure - it resolves
// URLs and names, it never touches the network. Pinned versions rather than
// "latest", so a rebuild in six months produces the same bundle.

export const NODE_VERSION = '22.23.2'
export const GWS_VERSION = '0.22.5'

const GWS_RELEASES = 'https://github.com/googleworkspace/cli/releases/download'

const PLATFORMS = {
  'win-x64': {
    nodeArch: 'win-x64',
    nodeArchive: 'zip',
    nodeEntry: 'node.exe',
    gwsArtifact: 'google-workspace-cli-x86_64-pc-windows-msvc.zip',
    gwsBinary: 'gws.exe',
    mode: 0o644
  },
  'mac-arm64': {
    nodeArch: 'darwin-arm64',
    nodeArchive: 'tar.gz',
    nodeEntry: 'bin/node',
    gwsArtifact: 'google-workspace-cli-aarch64-apple-darwin.tar.gz',
    gwsBinary: 'gws',
    mode: 0o755
  },
  // Intel Macs are still common on desks that get a hand-me-down laptop.
  'mac-x64': {
    nodeArch: 'darwin-x64',
    nodeArchive: 'tar.gz',
    nodeEntry: 'bin/node',
    gwsArtifact: 'google-workspace-cli-x86_64-apple-darwin.tar.gz',
    gwsBinary: 'gws',
    mode: 0o755
  }
}

// googleworkspace/cli publishes no aarch64-pc-windows-msvc artifact. Saying so
// beats building a bundle whose gws cannot start.
const REFUSED = {
  'win-arm64': 'there is no ARM Windows build of gws to bundle'
}

export function platforms () {
  return Object.keys(PLATFORMS)
}

export function resolveTarget (platform, { nodeVersion = NODE_VERSION, gwsVersion = GWS_VERSION } = {}) {
  if (REFUSED[platform]) throw new Error(`${platform}: ${REFUSED[platform]}`)

  const spec = PLATFORMS[platform]
  if (!spec) {
    throw new Error(`unknown platform "${platform}". Known: ${platforms().join(', ')}`)
  }

  const nodeDir = `node-v${nodeVersion}-${spec.nodeArch}`
  const gwsUrl = `${GWS_RELEASES}/v${gwsVersion}/${spec.gwsArtifact}`

  return {
    platform,
    mode: spec.mode,
    node: {
      url: `https://nodejs.org/dist/v${nodeVersion}/${nodeDir}.${spec.nodeArchive}`,
      shasums: `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`,
      archive: `${nodeDir}.${spec.nodeArchive}`,
      entry: `${nodeDir}/${spec.nodeEntry}`,
      dest: `runtime/node/${spec.nodeEntry}`
    },
    gws: {
      url: gwsUrl,
      sha: `${gwsUrl}.sha256`,
      archive: spec.gwsArtifact,
      entry: spec.gwsBinary,
      dest: `runtime/gws/${spec.gwsBinary}`
    }
  }
}
