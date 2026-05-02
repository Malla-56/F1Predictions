const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

// GET /api/polls/active — authenticated users
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { rows: [poll] } = await pool.query(
      'SELECT * FROM polls WHERE is_active = true LIMIT 1'
    );
    if (!poll) return res.json({ poll: null });

    const [{ rows: votes }, { rows: [userVoteRow] }] = await Promise.all([
      pool.query(
        'SELECT option_id, COUNT(*)::int as votes FROM poll_votes WHERE poll_id = $1 GROUP BY option_id',
        [poll.id]
      ),
      pool.query(
        'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
        [poll.id, req.user.id]
      ),
    ]);

    res.json({
      poll: { id: poll.id, question: poll.question, options: poll.options, created_at: poll.created_at },
      results: votes,
      user_vote: userVoteRow ? userVoteRow.option_id : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/polls/:id/vote — authenticated users
router.post('/:id/vote', requireAuth, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id);
    const { option_id } = req.body;

    const { rows: [poll] } = await pool.query(
      'SELECT * FROM polls WHERE id = $1 AND is_active = true',
      [pollId]
    );
    if (!poll) return res.status(409).json({ error: 'Poll is not active' });

    if (!poll.options.some(o => o.id === option_id)) {
      return res.status(400).json({ error: 'Invalid option' });
    }

    await pool.query(`
      INSERT INTO poll_votes (poll_id, user_id, option_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, voted_at = NOW()
    `, [pollId, req.user.id, option_id]);

    const { rows: votes } = await pool.query(
      'SELECT option_id, COUNT(*)::int as votes FROM poll_votes WHERE poll_id = $1 GROUP BY option_id',
      [pollId]
    );

    res.json({ ok: true, results: votes, user_vote: option_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin routes ───────────────────────────────────────────────────────────

// GET /api/polls/ — list all polls with vote counts
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows: polls } = await pool.query('SELECT * FROM polls ORDER BY created_at DESC');
    const result = await Promise.all(polls.map(async p => {
      const { rows: votes } = await pool.query(
        'SELECT option_id, COUNT(*)::int as votes FROM poll_votes WHERE poll_id = $1 GROUP BY option_id',
        [p.id]
      );
      return { ...p, results: votes, total_votes: votes.reduce((s, v) => s + v.votes, 0) };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/polls/ — create a poll
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { question, options, is_active, force } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Question and at least 2 options required' });
    }

    if (is_active) {
      const { rows: [existing] } = await pool.query(
        'SELECT id FROM polls WHERE is_active = true LIMIT 1'
      );
      if (existing && !force) {
        return res.status(409).json({ error: 'Another poll is already active', active_id: existing.id });
      }
      if (existing) {
        await pool.query('UPDATE polls SET is_active = false, closed_at = NOW() WHERE is_active = true');
      }
    }

    const { rows: [poll] } = await pool.query(
      'INSERT INTO polls (question, options, is_active, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [question, JSON.stringify(options), !!is_active, req.user.id]
    );
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/polls/:id — update (close, reopen, edit)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id);
    const { is_active, question, options, force } = req.body;

    const { rows: [poll] } = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    if (is_active === true && !poll.is_active) {
      const { rows: [existing] } = await pool.query(
        'SELECT id FROM polls WHERE is_active = true AND id != $1 LIMIT 1',
        [pollId]
      );
      if (existing && !force) {
        return res.status(409).json({ error: 'Another poll is already active', active_id: existing.id });
      }
      if (existing) {
        await pool.query(
          'UPDATE polls SET is_active = false, closed_at = NOW() WHERE is_active = true AND id != $1',
          [pollId]
        );
      }
    }

    const closingNow = is_active === false && poll.is_active;

    await pool.query(`
      UPDATE polls SET
        is_active = COALESCE($1, is_active),
        question  = COALESCE($2, question),
        options   = COALESCE($3, options),
        closed_at = CASE WHEN $4 THEN NOW() ELSE closed_at END
      WHERE id = $5
    `, [
      is_active ?? null,
      question ?? null,
      options ? JSON.stringify(options) : null,
      closingNow,
      pollId,
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/polls/:id — only allowed if zero votes
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id);
    const { rows: [poll] } = await pool.query('SELECT id FROM polls WHERE id = $1', [pollId]);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const { rows: [{ c }] } = await pool.query(
      'SELECT COUNT(*)::int as c FROM poll_votes WHERE poll_id = $1',
      [pollId]
    );
    if (c > 0) return res.status(409).json({ error: 'Cannot delete a poll with existing votes' });

    await pool.query('DELETE FROM polls WHERE id = $1', [pollId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
