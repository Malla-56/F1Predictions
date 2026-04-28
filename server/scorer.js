const db = require('./db');

function getScoringRules() {
  const rows = db.prepare('SELECT rule_key, points FROM scoring_rules').all();
  return Object.fromEntries(rows.map(r => [r.rule_key, r.points]));
}

function scorePrediction(pred, result, rules) {
  if (!result || !result.finishOrder) return { points: 0, breakdown: {} };

  const breakdown = {};
  let total = 0;

  const positions = [
    pred.pos_1, pred.pos_2, pred.pos_3, pred.pos_4, pred.pos_5,
    pred.pos_6, pred.pos_7, pred.pos_8, pred.pos_9, pred.pos_10,
  ];

  for (let i = 0; i < positions.length; i++) {
    const guessed = positions[i];
    if (!guessed) continue;
    const actual = result.finishOrder[i];
    const actualIdx = result.finishOrder.indexOf(guessed);

    if (actual === guessed) {
      const pts = rules.exact_position || 3;
      total += pts;
      breakdown.exact_position = (breakdown.exact_position || 0) + pts;
    } else if (actualIdx !== -1 && Math.abs(actualIdx - i) === 1) {
      const pts = rules.position_one_off || 1;
      total += pts;
      breakdown.position_one_off = (breakdown.position_one_off || 0) + pts;
    }
  }

  if (pred.pole && pred.pole === result.pole) {
    const pts = rules.pole_correct || 2;
    total += pts;
    breakdown.pole_correct = pts;
  }

  if (pred.dnf && result.dnfs && result.dnfs.includes(pred.dnf)) {
    const pts = rules.dnf_correct || 1;
    total += pts;
    breakdown.dnf_correct = pts;
  }

  if (pred.sprint_winner && pred.sprint_winner === result.sprintWinner) {
    const pts = rules.sprint_winner_correct || 2;
    total += pts;
    breakdown.sprint_winner_correct = pts;
  }

  return { points: total, breakdown };
}

function scoreRound(round, season, result) {
  const rules = getScoringRules();
  const preds = db.prepare(
    'SELECT * FROM predictions WHERE race_round = ? AND season = ?'
  ).all(round, season);

  const upsert = db.prepare(`
    INSERT INTO race_scores (user_id, race_round, season, points_total, breakdown, scored_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, race_round, season)
    DO UPDATE SET points_total = excluded.points_total,
                  breakdown    = excluded.breakdown,
                  scored_at    = excluded.scored_at
  `);

  const batch = db.transaction(() => {
    for (const pred of preds) {
      const { points, breakdown } = scorePrediction(pred, result, rules);
      upsert.run(pred.user_id, round, season, points, JSON.stringify(breakdown));
    }
  });
  batch();
}

function rescoreAll() {
  const results = db.prepare('SELECT * FROM race_results').all().catch?.() ?? [];
  // rescoreAll is called after rules change — re-run scoring for all stored results
  const stored = (() => {
    try {
      return db.prepare('SELECT * FROM race_results').all();
    } catch { return []; }
  })();
  for (const r of stored) {
    const result = JSON.parse(r.result_json);
    scoreRound(r.race_round, r.season, result);
  }
}

module.exports = { scorePrediction, scoreRound, getScoringRules, rescoreAll };
