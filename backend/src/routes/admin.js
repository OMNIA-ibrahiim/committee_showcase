// GET    /admin/projects      → list all projects (optional ?status=)
// PATCH  /admin/projects/:id  → approve or reject
// DELETE /admin/projects/:id  → delete
const router = require('express').Router();
const { z }  = require('zod');
const pool   = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { checkId, firstError } = require('../validate');

router.use(requireAdmin);
router.param('id', checkId);

const reviewSchema = z.object({
  status:   z.enum(['approved', 'rejected'], { errorMap: () => ({ message: 'must be "approved" or "rejected"' }) }),
  feedback: z.string().trim().max(1000).nullish(),
});

router.get('/projects', async (req, res) => {
  const { status } = req.query;
  const valid = ['pending', 'approved', 'rejected'];
  try {
    const params = [];
    let where = '';
    if (status && valid.includes(status)) { where = 'WHERE p.status = $1'; params.push(status); }
    const result = await pool.query(
      `SELECT p.id, p.title, p.description, p.creator_name, p.repo_url, p.demo_url,
         p.video_url, p.postman_url, p.image_urls, p.status, p.admin_feedback,
         p.submitted_at, p.reviewed_at,
         u.name AS submitted_by_name, u.email AS submitted_by_email,
         r.name AS reviewed_by_name
       FROM projects p
       JOIN users u ON u.id = p.submitted_by
       LEFT JOIN users r ON r.id = p.reviewed_by
       ${where}
       ORDER BY p.submitted_at DESC`,
      params
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Admin get projects error:', err);
    res.status(500).json({ error: 'Could not fetch projects.' });
  }
});

router.patch('/projects/:id', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const { status, feedback } = parsed.data;
  try {
    const result = await pool.query(
      `UPDATE projects SET status=$1, admin_feedback=$2, reviewed_at=NOW(), reviewed_by=$3
       WHERE id=$4 RETURNING id, title, status, admin_feedback, reviewed_at`,
      [status, feedback || null, req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Project not found.' });
    const project = result.rows[0];
    console.log(`AUDIT admin=${req.user.id} ${status} project=${project.id}`);
    res.json({ message: `Project "${project.title}" has been ${status}.`, project });
  } catch (err) {
    console.error('Admin review error:', err);
    res.status(500).json({ error: 'Could not update project.' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 RETURNING id, title', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Project not found.' });
    console.log(`AUDIT admin=${req.user.id} deleted project=${result.rows[0].id}`);
    res.json({ message: `Project "${result.rows[0].title}" deleted.` });
  } catch (err) {
    console.error('Admin delete error:', err);
    res.status(500).json({ error: 'Could not delete project.' });
  }
});

module.exports = router;