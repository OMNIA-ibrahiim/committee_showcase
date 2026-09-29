const router = require('express').Router();
const pool   = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { checkId, projectSchema, firstError } = require('../validate');

router.param('id', checkId);

// GET /projects — public, approved only
router.get('/', optionalAuth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit, 10) || 200, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const userId = req.user ? req.user.id : null;
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.creator_name,
         p.repo_url, p.demo_url, p.video_url, p.image_urls,
         p.submitted_at, p.postman_url, u.name AS submitted_by_name,
         COUNT(l.user_id)::int AS likes,
         COALESCE(BOOL_OR(l.user_id = $1::uuid), false) AS user_liked
       FROM projects p
       JOIN users u ON u.id = p.submitted_by
       LEFT JOIN project_likes l ON l.project_id = p.id
       WHERE p.status = 'approved'
       GROUP BY p.id, u.name
       ORDER BY p.submitted_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Could not fetch projects.' });
  }
});

// GET /projects/mine
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, creator_name, repo_url, demo_url, video_url,
         postman_url, image_urls, status, admin_feedback, submitted_at, reviewed_at
       FROM projects WHERE submitted_by = $1 ORDER BY submitted_at DESC`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('My projects error:', err);
    res.status(500).json({ error: 'Could not fetch your projects.' });
  }
});

// GET /projects/:id — public, approved only
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.creator_name,
         p.repo_url, p.demo_url, p.video_url, p.image_urls, p.postman_url,
         p.submitted_at, u.name AS submitted_by_name,
         COUNT(l.user_id)::int AS likes
       FROM projects p
       JOIN users u ON u.id = p.submitted_by
       LEFT JOIN project_likes l ON l.project_id = p.id
       WHERE p.id = $1 AND p.status = 'approved'
       GROUP BY p.id, u.name`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Project not found.' });
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Could not fetch project.' });
  }
});

// POST /projects — submit
router.post('/', requireAuth, async (req, res) => {
  const parsed = projectSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const d = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO projects
         (submitted_by, title, description, creator_name, repo_url, demo_url, video_url, image_urls, postman_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, title, status, submitted_at`,
      [req.user.id, d.title, d.description, d.creator_name, d.repo_url, d.demo_url,
       d.video_url, d.image_urls, d.postman_url]
    );
    res.status(201).json({
      message: 'Project submitted successfully. It will be visible after admin review.',
      project: result.rows[0],
    });
  } catch (err) {
    console.error('Submit project error:', err);
    res.status(500).json({ error: 'Could not submit project.' });
  }
});

// PUT /projects/:id — edit own project (approved/rejected go back to pending)
router.put('/:id', requireAuth, async (req, res) => {
  const parsed = projectSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const d = parsed.data;
  try {
    const result = await pool.query(
      `UPDATE projects SET
         title=$1, description=$2, creator_name=$3, repo_url=$4, demo_url=$5,
         video_url=$6, image_urls=$7, postman_url=$8,
         status = CASE WHEN status IN ('approved','rejected')
                       THEN 'pending'::project_status ELSE status END,
         reviewed_at=NULL, reviewed_by=NULL, admin_feedback=NULL
       WHERE id=$9 AND submitted_by=$10
       RETURNING id, title, status, submitted_at`,
      [d.title, d.description, d.creator_name, d.repo_url, d.demo_url,
       d.video_url, d.image_urls, d.postman_url, req.params.id, req.user.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Project not found or you do not own it.' });
    const project = result.rows[0];
    res.json({
      message: project.status === 'pending'
        ? 'Project updated and sent for review.' : 'Project updated successfully.',
      project,
    });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Could not update project.' });
  }
});

// POST /projects/:id/like — toggle
router.post('/:id/like', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const del = await pool.query(
      'DELETE FROM project_likes WHERE project_id = $1 AND user_id = $2', [id, req.user.id]);
    let liked = false;
    if (del.rowCount === 0) {
      const ins = await pool.query(
        `INSERT INTO project_likes (project_id, user_id)
         SELECT $1::uuid, $2::uuid
         WHERE EXISTS (SELECT 1 FROM projects WHERE id = $1::uuid AND status = 'approved')
         ON CONFLICT DO NOTHING`,
        [id, req.user.id]
      );
      if (ins.rowCount === 0) return res.status(404).json({ error: 'Project not found.' });
      liked = true;
    }
    const count = await pool.query(
      'SELECT COUNT(*)::int AS likes FROM project_likes WHERE project_id = $1', [id]);
    res.json({ liked, likes: count.rows[0].likes });
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Could not process like.' });
  }
});

module.exports = router;