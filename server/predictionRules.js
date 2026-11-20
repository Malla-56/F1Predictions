// Shared tip validation for user submissions and admin edits.

const isPick = v => v === null || v === undefined || (typeof v === 'string' && /^[A-Z]{3}$/.test(v));

// known: Set of valid driver codes, or null to check format only.
function validatePrediction({ pole, positions, dnf, sprintWinner }, known) {
  if (!Array.isArray(positions) || positions.length !== 10) return 'positions must have exactly 10 entries';
  const picks = [...positions, pole, dnf, sprintWinner];
  if (!picks.every(isPick)) return 'Invalid driver code';
  const placed = positions.filter(Boolean);
  if (new Set(placed).size !== placed.length) return 'A driver can only be picked once in the top 10';
  if (known && !picks.filter(Boolean).every(code => known.has(code))) return 'Unknown driver';
  return null;
}

const UPSERT_PREDICTION = `
  INSERT INTO predictions
    (user_id, race_round, season, pole, pos_1, pos_2, pos_3, pos_4, pos_5, pos_6, pos_7, pos_8, pos_9, pos_10, dnf, sprint_winner, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
  ON CONFLICT (user_id, race_round, season) DO UPDATE SET
    pole = EXCLUDED.pole,
    pos_1 = EXCLUDED.pos_1, pos_2 = EXCLUDED.pos_2, pos_3 = EXCLUDED.pos_3,
    pos_4 = EXCLUDED.pos_4, pos_5 = EXCLUDED.pos_5, pos_6 = EXCLUDED.pos_6,
    pos_7 = EXCLUDED.pos_7, pos_8 = EXCLUDED.pos_8, pos_9 = EXCLUDED.pos_9,
    pos_10 = EXCLUDED.pos_10,
    dnf = EXCLUDED.dnf,
    sprint_winner = EXCLUDED.sprint_winner,
    updated_at = EXCLUDED.updated_at
`;

function predictionParams(userId, round, season, { pole, positions, dnf, sprintWinner }) {
  return [userId, round, season, pole || null, ...positions.map(p => p || null), dnf || null, sprintWinner || null];
}

module.exports = { validatePrediction, UPSERT_PREDICTION, predictionParams };
