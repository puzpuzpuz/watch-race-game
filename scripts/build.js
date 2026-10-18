// Builds one variant of the game into dist/:
//   node scripts/build.js release   aiot release --enable-jsc: own signature, bytecode
//   node scripts/build.js debug     aiot build: debug signature, plain JS
// The variants get different package names, so both can be installed at once,
// and the title screen shows which one is running (with DEBUG on). Set AIOT to
// use a toolkit other than node_modules/.bin/aiot.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const manifestPath = path.join(root, 'src', 'manifest.json')
const buildInfoPath = path.join(root, 'src', 'common', 'js', 'buildinfo.js')
const signDir = path.join(root, 'sign')

const VARIANTS = {
  debug: { pkg: 'com.miamirush.gamedebug', name: 'Miami Rush dbg', label: 'debug', args: 'build' },
  release: {
    pkg: 'com.miamirush.game',
    name: 'Miami Rush',
    label: 'release+jsc',
    args: 'release --enable-jsc',
  },
}

// Release builds need a key pair in sign/; a self-signed one is fine for
// sideloading. Keep it: the watch may refuse an update signed with another key.
function ensureKeys() {
  const key = path.join(signDir, 'private.pem')
  const cert = path.join(signDir, 'certificate.pem')
  if (fs.existsSync(key) && fs.existsSync(cert)) return
  fs.mkdirSync(signDir, { recursive: true })
  execSync(
    `openssl req -newkey rsa:2048 -nodes -keyout "${key}" -x509 -days 3650 ` +
      `-subj "/CN=Miami Rush" -out "${cert}"`,
    { stdio: 'inherit' }
  )
}

const name = process.argv[2]
const variant = VARIANTS[name]
if (!variant) {
  console.error('usage: node scripts/build.js debug|release')
  process.exit(1)
}

// The toolkit empties dist/ on every build; keep the other variant's package.
const distDir = path.join(root, 'dist')
const kept = fs.existsSync(distDir)
  ? fs
      .readdirSync(distDir)
      .filter((f) => f.endsWith('.rpk') && !f.startsWith(variant.pkg + '.'))
      .map((f) => [f, fs.readFileSync(path.join(distDir, f))])
  : []

const manifestText = fs.readFileSync(manifestPath, 'utf8')
const buildInfoText = fs.readFileSync(buildInfoPath, 'utf8')
try {
  if (name === 'release') ensureKeys()
  const manifest = JSON.parse(manifestText)
  manifest.package = variant.pkg
  manifest.name = variant.name
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(
    buildInfoPath,
    `// Overwritten by scripts/build.js for each build and restored afterwards.\nexport default '${variant.label}'\n`
  )
  const aiot = process.env.AIOT || `"${path.join(root, 'node_modules', '.bin', 'aiot')}"`
  execSync(`${aiot} ${variant.args}`, { cwd: root, stdio: 'inherit' })
} finally {
  fs.writeFileSync(manifestPath, manifestText)
  fs.writeFileSync(buildInfoPath, buildInfoText)
  fs.mkdirSync(distDir, { recursive: true })
  for (const [file, data] of kept) {
    const target = path.join(distDir, file)
    if (!fs.existsSync(target)) fs.writeFileSync(target, data)
  }
}
