const pool = require('./db');
const { SEASON } = require('./config');

async function getScoringRules() {
  const { rows } = await pool.query('SELECT rule_key, points FROM scoring_rules');
  return Object.fromEntries(rows.map(r => [r.rule_key, r.points]));
}

// Older stored results called the sprint winner "sprintPole".
function sprintWinnerOf(result) {
  return result.sprintWinner || result.sprintFinishOrder?.[0] || result.sprintPole || null;
}

function scorePrediction(pred, result, rules, multiplier = 1) {
  if (!result || !result.finishOrder) return { points: 0, breakdown: {} };

  const breakdown = {};
  let total = 0;

  const positions = [
    pred.pos_1, pred.pos_2, pred.pos_3, pred.pos_4, pred.pos_5,
    pred.pos_6, pred.pos_7, pred.pos_8, pred.pos_9, pred.pos_10,
  ];

  const counted = new Set();
  for (let i = 0; i < positions.length; i++) {
    const guessed = positions[i];
    // A driver only scores once, even if an imported/legacy tip lists them twice.
    if (!guessed || counted.has(guessed)) continue;
    counted.add(guessed);
    const actual = result.finishOrder[i];
    const actualIdx = result.finishOrder.indexOf(guessed);

    if (actual === guessed) {
      const pts = rules.exact_position ?? 3;
      total += pts;
      breakdown.exact_position = (breakdown.exact_position || 0) + pts;
    } else if (actualIdx !== -1 && Math.abs(actualIdx - i) === 1) {
      const pts = rules.position_one_off ?? 1;
      total += pts;
      breakdown.position_one_off = (breakdown.position_one_off || 0) + pts;
    }
  }

  if (pred.pole && pred.pole === result.pole) {
    const pts = rules.pole_correct ?? 2;
    total += pts;
    breakdown.pole_correct = pts;
  }

  if (pred.dnf && result.dnfs && result.dnfs.includes(pred.dnf)) {
    const pts = rules.dnf_correct ?? 1;
    total += pts;
    breakdown.dnf_correct = pts;
  }

  if (pred.sprint_winner && pred.sprint_winner === sprintWinnerOf(result)) {
    const pts = rules.sprint_winner_correct ?? 2;
    total += pts;
    breakdown.sprint_winner_correct = pts;
  }

  // Joker round: the breakdown keeps the per-rule values, only the total is multiplied.
  if (multiplier !== 1) {
    total *= multiplier;
    breakdown.joker = multiplier;
  }

  return { points: total, breakdown };
}

async function isJokerRound(round, season) {
  const { rows: [cfg] } = await pool.query(
    'SELECT is_joker FROM race_config WHERE race_round = $1 AND season = $2', [round, season]
  );
  return cfg?.is_joker === 1;
}

async function scoreRound(round, season, result) {
  const rules = await getScoringRules();
  const multiplier = (await isJokerRound(round, season)) ? 2 : 1;
  const { rows: preds } = await pool.query(
    'SELECT * FROM predictions WHERE race_round = $1 AND season = $2',
    [round, season]
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const pred of preds) {
      const { points, breakdown } = scorePrediction(pred, result, rules, multiplier);
      await client.query(`
        INSERT INTO race_scores (user_id, race_round, season, points_total, breakdown, scored_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id, race_round, season) DO UPDATE SET
          points_total = EXCLUDED.points_total,
          breakdown    = EXCLUDED.breakdown,
          scored_at    = EXCLUDED.scored_at
        -- Scores set by an admin override are kept when a round is rescored.
        WHERE race_scores.breakdown NOT LIKE '%"override":true%'
      `, [pred.user_id, round, season, points, JSON.stringify(breakdown)]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function rescoreAll() {
  const { rows: stored } = await pool.query('SELECT * FROM race_results WHERE season = $1', [SEASON]);
  for (const r of stored) {
    await scoreRound(r.race_round, r.season, JSON.parse(r.result_json));
  }
}

module.exports = { scorePrediction, scoreRound, getScoringRules, rescoreAll };
