import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

function getFileExtension(contentType: string, fallbackName?: string): string {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
  };

  if (byType[contentType]) return byType[contentType];

  const fileExt = fallbackName?.split('.').pop()?.toLowerCase();
  if (fileExt) return fileExt.replace(/[^a-z0-9]/g, '');
  return 'jpg';
}

function getPublicImageUrl(requestUrl: string, key: string, publicBaseUrl?: string): string {
  if (publicBaseUrl && publicBaseUrl.trim() !== '') {
    return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  const origin = new URL(requestUrl).origin;
  return `${origin}/upload/files/${key}`;
}

const upload = new Hono<{
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    R2_BUCKET: R2Bucket;
    R2_PUBLIC_BASE_URL?: string;
  };
  Variables: { userId: string };
}>();

upload.post('/image', authMiddleware, async (c) => {
  const formData = await c.req.formData();
  const fileEntry = formData.get('file');

  if (!fileEntry || typeof fileEntry === 'string') {
    return c.json({ error: 'file is required (multipart/form-data)' }, 400);
  }

  const file = fileEntry as Blob & {
    name?: string;
    type: string;
    size: number;
  };

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return c.json({ error: 'Invalid content type' }, 400);
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
    return c.json({ error: 'Image size must be between 1B and 8MB' }, 400);
  }

  const userId = c.get('userId');
  const ext = getFileExtension(file.type, file.name);
  const key = `items/${userId}/${crypto.randomUUID()}.${ext}`;

  await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      uploadedBy: userId,
      originalName: file.name || '',
    },
  });

  return c.json({
    key,
    url: getPublicImageUrl(c.req.url, key, c.env.R2_PUBLIC_BASE_URL),
    size: file.size,
    contentType: file.type,
  });
});

upload.get('/files/*', async (c) => {
  const prefix = '/upload/files/';
  if (!c.req.path.startsWith(prefix)) {
    return c.json({ error: 'Invalid file path' }, 400);
  }

  const key = decodeURIComponent(c.req.path.slice(prefix.length));
  const object = await c.env.R2_BUCKET.get(key);
  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
});

export default upload;
