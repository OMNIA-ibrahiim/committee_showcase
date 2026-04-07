//  GET  /projects        → public, returns only approved projects (for the showcase page)
//  POST /projects        → member only, submit a new project
//  GET  /projects/mine   → member only, see their own submissions + status

const router      = require('express').Router();
const pool        = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.description,
         p.creator_name,
         p.repo_url,
         p.demo_url,
         p.video_url,
         p.image_urls,
         p.submitted_at,
         u.name AS submitted_by_name
       FROM projects p
       JOIN users u ON u.id = p.submitted_by
       WHERE p.status = 'approved'
       ORDER BY p.submitted_at DESC`,
    );

    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Could not fetch projects.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id, title, description, creator_name,
         repo_url, demo_url, video_url, image_urls,
         status, admin_feedback, submitted_at, reviewed_at
       FROM projects
       WHERE submitted_by = $1
       ORDER BY submitted_at DESC`,
      [req.user.id]
    );

    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Get my projects error:', err);
    res.status(500).json({ error: 'Could not fetch your projects.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const {
    title,
    description,
    creator_name,
    repo_url,
    demo_url,
    video_url,
    image_urls, // array of URL strings: ["https://...", "https://..."]
  } = req.body;

  if (!title || !description || !creator_name) {
    return res.status(400).json({
      error: 'Title, description, and creator name are required.',
    });
  }

  const images = Array.isArray(image_urls) ? image_urls : [];

  try {
    const result = await pool.query(
      `INSERT INTO projects
         (submitted_by, title, description, creator_name, repo_url, demo_url, video_url, image_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, status, submitted_at`,
      [
        req.user.id,
        title.trim(),
        description.trim(),
        creator_name.trim(),
        repo_url   || null,
        demo_url   || null,
        video_url  || null,
        images,
      ]
    );

    const project = result.rows[0];

    res.status(201).json({
      message: 'Project submitted successfully. It will be visible after admin review.',
      project,
    });
  } catch (err) {
    console.error('Submit project error:', err);
    res.status(500).json({ error: 'Could not submit project.' });
  }
});

module.exports = router;