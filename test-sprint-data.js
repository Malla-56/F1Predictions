const openf1 = require('./server/openf1');

async function test() {
  try {
    console.log('Fetching race 2 with full sprint data...\n');
    const result = await openf1.fetchAndBuildResult(2, 2026);
    console.log('Complete Race 2 Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
