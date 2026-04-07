//  GET    /admin/projects          → list all projects (all statuses)
//  PATCH  /admin/projects/:id      → approve or reject a project
//  DELETE /admin/projects/:id      → permanently delete a project

const router        = require('express').Router();
const pool          = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

router.get('/projects', async (req, res) => {
  const { status } = req.query; // optional filter

  const validStatuses = ['pending', 'approved', 'rejected'];

  try {
    let query = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.creator_name,
        p.repo_url,
        p.demo_url,
        p.video_url,
        p.image_urls,
        p.status,
        p.admin_feedback,
        p.submitted_at,
        p.reviewed_at,
        u.name  AS submitted_by_name,
        u.email AS submitted_by_email,
        r.name  AS reviewed_by_name
      FROM projects p
      JOIN users u ON u.id = p.submitted_by
      LEFT JOIN users r ON r.id = p.reviewed_by
    `;

    const params = [];

    if (status && validStatuses.includes(status)) {
      query += ' WHERE p.status = $1';
      params.push(status);
    }

    query += ' ORDER BY p.submitted_at DESC';

    const result = await pool.query(query, params);

    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Admin get projects error:', err);
    res.status(500).json({ error: 'Could not fetch projects.' });
  }
});

router.patch('/projects/:id', async (req, res) => {
  const { id }                   = req.params;
  const { status, feedback }     = req.body;

  const validStatuses = ['approved', 'rejected'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Status must be either "approved" or "rejected".',
    });
  }

  try {
    const result = await pool.query(
      `UPDATE projects
       SET
         status         = $1,
         admin_feedback = $2,
         reviewed_at    = NOW(),
         reviewed_by    = $3
       WHERE id = $4
       RETURNING id, title, status, admin_feedback, reviewed_at`,
      [status, feedback || null, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const project = result.rows[0];

    res.json({
      message: `Project "${project.title}" has been ${status}.`,
      project,
    });
  } catch (err) {
    console.error('Admin review error:', err);
    res.status(500).json({ error: 'Could not update project.' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 RETURNING title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    res.json({ message: `Project "${result.rows[0].title}" deleted.` });
  } catch (err) {
    console.error('Admin delete error:', err);
    res.status(500).json({ error: 'Could not delete project.' });
  }
});

module.exports = router;