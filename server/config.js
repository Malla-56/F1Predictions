// Season the league is running. Override with SEASON=2027 when the next season starts.
const SEASON = parseInt(process.env.SEASON, 10) || 2026;

module.exports = { SEASON };
