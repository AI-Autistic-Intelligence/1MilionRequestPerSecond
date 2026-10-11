const autocannon = require('autocannon');

const ports = {
  'ferrox-node': 13000,
  'ferrox-py': 18000,
  'ferrox-rust': 18080,
  'ferrox-java': 18081,
  'ferrox-php': 18082
};

async function runTest(name, port) {
  return new Promise((resolve) => {
    console.log(`Starting test for ${name} on port ${port}...`);
    const instance = autocannon({
      url: `http://localhost:${port}/`,
      connections: 100,
      pipelining: 1,
      duration: 10
    }, (err, result) => {
      if (err) {
        console.error(`Error on ${name}:`, err.message);
        resolve({ name, error: err.message });
      } else {
        console.log(`${name} results: ${result.requests.average} req/sec avg`);
        resolve({
          name,
          reqPerSec: result.requests.average,
          latencyAvg: result.latency.average
        });
      }
    });
  });
}

async function main() {
  const results = [];
  for (const [name, port] of Object.entries(ports)) {
    const res = await runTest(name, port);
    results.push(res);
    // wait a bit between tests
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('--- FINAL RESULTS ---');
  console.table(results);
}

main();
