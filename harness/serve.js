// Serves the desktop harness: http://localhost:8080 (or PORT). The game's own
// files are served at the paths the watch uses, so /common/... works as is.
//   /            harness/index.html
//   /harness/*   harness/
//   /common/*    src/common/
//   /pages/*     src/pages/ (the harness reads the page's styles from it)

const http = require('http')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const port = Number(process.env.PORT) || 8080
const ROUTES = [
  ['/harness/', path.join(root, 'harness')],
  ['/common/', path.join(root, 'src', 'common')],
  ['/pages/', path.join(root, 'src', 'pages')],
]
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ux': 'text/plain',
  '.css': 'text/css',
}

function resolve(url) {
  const p = decodeURIComponent(url.split('?')[0])
  if (p === '/') return path.join(root, 'harness', 'index.html')
  for (const [prefix, dir] of ROUTES) {
    if (!p.startsWith(prefix)) continue
    const file = path.normalize(path.join(dir, p.slice(prefix.length)))
    return file.startsWith(dir) ? file : null
  }
  return null
}

http
  .createServer((req, res) => {
    const file = resolve(req.url)
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, () => console.log(`Miami Rush harness: http://localhost:${port}`))
