// Vercel function: /api/upload — sound files uploaded from the sound editor go straight from the browser to Vercel Blob
// (so big files skip the 4.5 MB function limit). This route only hands out the upload token, and only with the PIN (BUG_PIN).
// GET = the uploaded files ({ files: [{ name, url, size }] }) for the editor's file picker.
import { handleUpload } from '@vercel/blob/client';
import { list } from '@vercel/blob';

const norm = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(501).json({ error: 'Uploads aren’t set up yet: create a Blob store in Vercel (Storage) and connect it to this project.' });
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'sfx/', limit: 1000 });
      return res.status(200).json({ files: blobs.map((b) => ({ name: b.pathname.replace(/^sfx\//, '').replace(/-[A-Za-z0-9]{21,}(\.\w+)$/, '$1'), url: b.url, size: b.size })) });
    }
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const json = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const expected = norm(process.env.BUG_PIN);
        if (!expected || norm(clientPayload) !== expected) throw new Error('Wrong PIN.');
        if (!pathname.startsWith('sfx/')) throw new Error('Bad path.');
        return { allowedContentTypes: ['audio/*'], maximumSizeInBytes: 60 * 1024 * 1024, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ error: e.message || String(e) });
  }
}
