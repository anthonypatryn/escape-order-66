// Vercel function: /api/sfx?p=<pathname> — plays an uploaded sound from the owner's PRIVATE Blob store by streaming it
// through the site (same origin: the page can always read it; a redirect to the store's signed link was blocked by the
// browser). Anyone with the site link can play these (the password gate was removed 2026-10-16 at the owner's request).
import { get } from '@vercel/blob';
import { Readable } from 'node:stream';

export default async function handler(req, res) {
  try {
    const p = String(new URL(req.url, 'http://x').searchParams.get('p') ?? '');
    if (!p.startsWith('sfx/') || p.length > 300 || p.includes('..')) return res.status(400).json({ error: 'Bad path.' });
    const r = await get(p, { access: 'private' });
    if (!r || r.statusCode !== 200 || !r.stream) return res.status(404).json({ error: 'Not found.' });
    res.statusCode = 200;
    res.setHeader('Content-Type', r.blob.contentType || 'audio/mpeg');
    if (r.blob.size) res.setHeader('Content-Length', String(r.blob.size));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    Readable.fromWeb(r.stream).pipe(res);
  } catch (e) {
    console.error('sfx failed:', e?.message || e);
    if (!res.headersSent) res.status(404).json({ error: e.message || String(e) });
  }
}
