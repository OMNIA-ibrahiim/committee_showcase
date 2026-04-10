const router      = require('express').Router();
const pool        = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.creator_name,
         p.repo_url, p.demo_url, p.video_url, p.image_urls,
         p.submitted_at, u.name AS submitted_by_name
       FROM projects p
       JOIN users u ON u.id = p.submitted_by
       WHERE p.status = 'approved'
       ORDER BY p.submitted_at DESC`
    );
    res.json({ projects: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch projects.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, creator_name,
         repo_url, demo_url, video_url, image_urls,
         status, admin_feedback, submitted_at, reviewed_at
       FROM projects WHERE submitted_by = $1
       ORDER BY submitted_at DESC`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch your projects.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.creator_name,
         p.repo_url, p.demo_url, p.video_url, p.image_urls,
         p.submitted_at, u.name AS submitted_by_name
       FROM projects p
       JOIN users u ON u.id = p.submitted_by
       WHERE p.id = $1 AND p.status = 'approved'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found.' });
    res.json({ project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch project.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { title, description, creator_name, repo_url, demo_url, video_url, image_urls } = req.body;
  if (!title || !description || !creator_name)
    return res.status(400).json({ error: 'Title, description, and creator name are required.' });
  const images = Array.isArray(image_urls) ? image_urls : [];
  try {
    const result = await pool.query(
      `INSERT INTO projects (submitted_by, title, description, creator_name, repo_url, demo_url, video_url, image_urls)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, title, status, submitted_at`,
      [req.user.id, title.trim(), description.trim(), creator_name.trim(),
       repo_url||null, demo_url||null, video_url||null, images]
    );
    res.status(201).json({ message: 'Project submitted successfully. It will be visible after admin review.', project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not submit project.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { title, description, creator_name, repo_url, demo_url, video_url, image_urls } = req.body;
  if (!title || !description || !creator_name)
    return res.status(400).json({ error: 'Title, description, and creator name are required.' });
  const images = Array.isArray(image_urls) ? image_urls : [];
  try {
    const check = await pool.query(
      'SELECT id, status FROM projects WHERE id = $1 AND submitted_by = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Project not found or you do not own it.' });
    const wasApproved = check.rows[0].status === 'approved';
    const result = await pool.query(
      `UPDATE projects SET
         title=$1, description=$2, creator_name=$3, repo_url=$4,
         demo_url=$5, video_url=$6, image_urls=$7, status=$8,
         reviewed_at=NULL, reviewed_by=NULL, admin_feedback=NULL
       WHERE id=$9 RETURNING id, title, status, submitted_at`,
      [title.trim(), description.trim(), creator_name.trim(),
       repo_url||null, demo_url||null, video_url||null, images,
       wasApproved ? 'pending' : check.rows[0].status, req.params.id]
    );
    res.json({
      message: wasApproved ? 'Project updated and sent back for review.' : 'Project updated successfully.',
      project: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not update project.' });
  }
});

module.exports = router;