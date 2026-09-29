const { z } = require('zod');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkId(req, res, next, id) {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Not found.' });
  next();
}

function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch (e) { return false; }
}

const optUrl = z.string().trim().max(500)
  .refine(v => v === '' || isHttpUrl(v), 'must be a valid http(s) URL')
  .nullish().transform(v => v || null);

const projectSchema = z.object({
  title:        z.string().trim().min(1, 'is required').max(200),
  description:  z.string().trim().min(1, 'is required').max(5000),
  creator_name: z.string().trim().min(1, 'is required').max(100),
  repo_url:     optUrl,
  demo_url:     optUrl,
  video_url:    optUrl,
  postman_url:  optUrl,
  image_urls:   z.array(z.string().trim().max(500).refine(isHttpUrl, 'must be a valid http(s) URL'))
                  .max(6).nullish().transform(v => v || []),
});

function firstError(err) {
  const i = err.issues[0];
  return i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message;
}

module.exports = { checkId, projectSchema, firstError };