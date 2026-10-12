// Vercel function: /api/sfx?p=<pathname> — plays an uploaded sound from the private Blob store: redirects to a signed,
// short-lived link to the file (the site itself is behind the password, so only signed-in players get here).
import { issueSignedToken, presignUrl } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    const p = String(req.query?.p ?? new URL(req.url, 'http://x').searchParams.get('p') ?? '');
    if (!/^sfx\/[\w./%-]{1,300}$/.test(p) || p.includes('..')) return res.status(400).json({ error: 'Bad path.' });
    const validUntil = Date.now() + 6 * 3600 * 1000;
    const token = await issueSignedToken({ pathname: p, operations: ['get'], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: p, access: 'private', validUntil });
    res.setHeader('Cache-Control', 'private, max-age=3000');
    res.writeHead(302, { Location: presignedUrl });
    return res.end();
  } catch (e) {
    return res.status(404).json({ error: e.message || String(e) });
  }
}
