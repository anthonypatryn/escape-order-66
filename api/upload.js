// Vercel function: /api/upload — sound files uploaded from the sound editor go straight from the browser to the owner's
// PRIVATE Vercel Blob store (any size; skips the 4.5 MB function limit). This route only hands out a presigned upload URL,
// and only with the PIN (BUG_PIN). Auth to the store: OIDC (BLOB_STORE_ID, set when the store was connected).
// GET = the uploaded files ({ files: [{ name, file, size }] }); a clip's file is 'blob:<pathname>' (played via /api/sfx).
import { handleUploadPresigned } from '@vercel/blob/client';
import { list, issueSignedToken } from '@vercel/blob';

const norm = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim();
const MAX = 60 * 1024 * 1024;
const configured = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured()) return res.status(501).json({ error: 'Uploads aren’t set up yet: create a Blob store in Vercel (Storage) and connect it to this project.' });
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'sfx/', limit: 1000 });
      return res.status(200).json({ files: blobs.map((b) => ({ name: b.pathname.replace(/^sfx\//, '').replace(/-[A-Za-z0-9]{21,}(\.\w+)$/, '$1'), file: `blob:${b.pathname}`, size: b.size })) });
    }
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const json = await handleUploadPresigned({
      body, request: req,
      getSignedToken: async (pathname, clientPayload) => {
        const expected = norm(process.env.BUG_PIN);
        if (!expected || norm(clientPayload) !== expected) throw new Error('Wrong PIN.');
        if (!pathname.startsWith('sfx/')) throw new Error('Bad path.');
        const token = await issueSignedToken({ pathname: 'sfx/*', operations: ['put'], allowedContentTypes: ['audio/*'], maximumSizeInBytes: MAX });
        return { token, urlOptions: { allowedContentTypes: ['audio/*'], maximumSizeInBytes: MAX, addRandomSuffix: true } };
      },
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ error: e.message || String(e) });
  }
}
