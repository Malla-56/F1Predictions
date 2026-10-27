// Usage: node test-sprint-data.js [round] — prints the result OpenF1 would give for a round.
require('dotenv').config();
const openf1 = require('./server/openf1');
const { getRace } = require('./server/calendar');
const pool = require('./server/db');

async function test() {
  const round = parseInt(process.argv[2] || '2', 10);
  try {
    const race = await getRace(round);
    if (!race) throw new Error(`Round ${round} not found in calendar`);
    console.log(`Fetching R${round} ${race.meeting.meeting_name}${race.isSprint ? ' (sprint)' : ''}...\n`);
    console.log(JSON.stringify(await openf1.buildResult(race), null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

test();
