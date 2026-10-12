import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import { makeStore, handleBugs } from './lib/bugs.js'
import { makeSoundStore, handleSounds } from './lib/sounds.js'

// Dev-only: /api/bugs runs the same code as the Vercel function, saving to .data/bugs.json (PIN 1234)
function bugsApi() {
  return {
    name: 'bugs-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/bugs', (req, res) => {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            const store = makeStore(join(server.config.root, '.data'))
            const [status, json] = await handleBugs(store, req.method, body ? JSON.parse(body) : null, req.headers['x-bug-pin'], process.env.BUG_PIN || '1234')
            res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(json))
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })) }
        })
      })
    },
  }
}

// Dev-only: /api/sounds (the sound editor's saved settings), saving to .data/sounds.json (PIN 1234)
function soundsApi() {
  return {
    name: 'sounds-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/sounds', (req, res) => {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            const [status, json] = await handleSounds(makeSoundStore(join(server.config.root, '.data')), req.method, body ? JSON.parse(body) : null, req.headers['x-bug-pin'], process.env.BUG_PIN || '1234')
            res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(json))
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })) }
        })
      })
    },
  }
}

// `import files from 'virtual:sfx-files'` = every mp3 in public/sfx (names without .mp3), for the sound editor's file picker
function sfxFiles() {
  const id = 'virtual:sfx-files', resolved = '/@virtual/sfx-files.js'
  return {
    name: 'sfx-files',
    resolveId: (s) => (s === id ? resolved : null),
    load(s) {
      if (s !== resolved) return null
      const files = readdirSync(join(process.cwd(), 'public', 'sfx')).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort()
      return `export default ${JSON.stringify(files)}`
    },
  }
}

export default defineConfig({
  plugins: [react(), bugsApi(), soundsApi(), sfxFiles()],
})
