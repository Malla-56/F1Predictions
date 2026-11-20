const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { requireLeague, requireLeagueAdmin } = require('../middleware/league');

// Polls belong to a league: members see and vote on their selected league's active
// poll, and that league's admins manage them.
const router = express.Router();
router.use(requireAuth);

const voteCounts = pollId => pool.query(
  'SELECT option_id, COUNT(*)::int as votes FROM poll_votes WHERE poll_id = $1 GROUP BY option_id',
  [pollId]
);

// GET /api/polls/active — the selected league's active poll
router.get('/active', requireLeague, async (req, res) => {
  try {
    const { rows: [poll] } = await pool.query(
      'SELECT * FROM polls WHERE is_active = true AND league_id = $1 LIMIT 1', [req.league.id]
    );
    if (!poll) return res.json({ poll: null });

    const [{ rows: votes }, { rows: [userVoteRow] }] = await Promise.all([
      voteCounts(poll.id),
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

// POST /api/polls/:id/vote
router.post('/:id/vote', requireLeague, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id);
    const { option_id } = req.body;

    const { rows: [poll] } = await pool.query(
      'SELECT * FROM polls WHERE id = $1 AND is_active = true AND league_id = $2',
      [pollId, req.league.id]
    );
    if (!poll) return res.status(409).json({ error: 'Poll is not active' });

    const option = poll.options.find(o => String(o.id) === String(option_id));
    if (!option) {
      return res.status(400).json({ error: 'Invalid option' });
    }

    await pool.query(`
      INSERT INTO poll_votes (poll_id, user_id, option_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, voted_at = NOW()
    `, [pollId, req.user.id, option.id]);

    const { rows: votes } = await voteCounts(pollId);
    res.json({ ok: true, results: votes, user_vote: option.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── League admin routes ──────────────────────────────────────────────────────

// GET /api/polls/ — the league's polls with vote counts
router.get('/', requireLeagueAdmin, async (req, res) => {
  try {
    const { rows: polls } = await pool.query(
      'SELECT * FROM polls WHERE league_id = $1 ORDER BY created_at DESC', [req.league.id]
    );
    const result = await Promise.all(polls.map(async p => {
      const { rows: votes } = await voteCounts(p.id);
      return { ...p, results: votes, total_votes: votes.reduce((s, v) => s + v.votes, 0) };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/polls/ — create a poll
router.post('/', requireLeagueAdmin, async (req, res) => {
  try {
    const { question, options, is_active, force } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Question and at least 2 options required' });
    }
    const leagueId = req.league.id;

    if (is_active) {
      const { rows: [existing] } = await pool.query(
        'SELECT id FROM polls WHERE is_active = true AND league_id = $1 LIMIT 1', [leagueId]
      );
      if (existing && !force) {
        return res.status(409).json({ error: 'Another poll is already active', active_id: existing.id });
      }
      if (existing) {
        await pool.query(
          'UPDATE polls SET is_active = false, closed_at = NOW() WHERE is_active = true AND league_id = $1',
          [leagueId]
        );
      }
    }

    const { rows: [poll] } = await pool.query(
      'INSERT INTO polls (question, options, is_active, created_by, league_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [question, JSON.stringify(options), !!is_active, req.user.id, leagueId]
    );
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/polls/:id — update (close, reopen, edit)
router.put('/:id', requireLeagueAdmin, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id);
    const leagueId = req.league.id;
    const { is_active, question, options, force } = req.body;

    const { rows: [poll] } = await pool.query(
      'SELECT * FROM polls WHERE id = $1 AND league_id = $2', [pollId, leagueId]
    );
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    if (is_active === true && !poll.is_active) {
      const { rows: [existing] } = await pool.query(
        'SELECT id FROM polls WHERE is_active = true AND league_id = $1 AND id != $2 LIMIT 1',
        [leagueId, pollId]
      );
      if (existing && !force) {
        return res.status(409).json({ error: 'Another poll is already active', active_id: existing.id });
      }
      if (existing) {
        await pool.query(
          'UPDATE polls SET is_active = false, closed_at = NOW() WHERE is_active = true AND league_id = $1 AND id != $2',
          [leagueId, pollId]
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
router.delete('/:id', requireLeagueAdmin, async (req, res) => {
  try {
    const pollId = parseInt(req.params.id);
    const { rows: [poll] } = await pool.query(
      'SELECT id FROM polls WHERE id = $1 AND league_id = $2', [pollId, req.league.id]
    );
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
