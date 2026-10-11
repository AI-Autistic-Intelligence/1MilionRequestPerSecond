const { execSync } = require('child_process');
const fs = require('fs');
const Redis = require('ioredis');

const redis = new Redis('redis://redis:6379');

const services = [
    { name: 'ferrox-node', port: 13000 },
    { name: 'ferrox-py', port: 18000 },
    { name: 'ferrox-rust', port: 18080 },
    { name: 'ferrox-java', port: 18081 },
    { name: 'ferrox-php', port: 18082 }
];

// In test-runner, we connect via haproxy hostname
const host = 'haproxy';
const duration = 60;
const connections = 1000;
const pipelining = 20;
const DURATION = duration + 's';

async function runTest() {
    console.log('--- STARTING 60-SECOND DEEP TESTS ---');
    console.log('Each framework will query Postgres & Redis per request.');
    
    let results = [];

    for (const s of services) {
        console.log(`\nStarting test for ${s.name} on port ${s.port}...`);
        
        // Reset telemetry stream before test
        try {
            await redis.xtrim('telemetry', 'MAXLEN', 0);
        } catch(e) {}
        
        try {
            const url = `http://${host}:${s.port}/?id=[<id>]`;
            const cmd = `npx autocannon -c ${connections} -p ${pipelining} -d ${duration} -j "${url}"`;
            console.log(`Running: autocannon -c ${connections} -p ${pipelining} -d ${duration} "${url}"...`);
            
            // Randomize IDs between 1 and 100000 in requests via autocannon's dynamic requests capability?
            // Actually autocannon supports `[<id>]` if we use a specific ID replacement plugin, but a simpler way is to just let the backend randomize.
            // Wait, we can't easily make the backend randomize if it expects an ID. We can just hit `/` and let the backend randomly pick an ID from 1 to 100000!
            const realUrl = `http://${host}:${s.port}/`;
            const realCmd = `npx autocannon -c ${connections} -p ${pipelining} -d ${duration} -j "${realUrl}"`;
            
            const startTimestamp = Math.floor(Date.now() / 1000);
            const output = execSync(realCmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
            const endTimestamp = Math.floor(Date.now() / 1000);
            
            // The output is JSON
            const data = JSON.parse(output);
            
            const rps = data.requests.average;
            const latencyAvg = data.latency.average;
            const p99 = data.latency.p99;
            const errors = data.errors || 0;
            const timeouts = data.timeouts || 0;
            
            console.log(`${s.name} results: ${rps} req/sec avg | Latency: ${latencyAvg}ms (p99: ${p99}ms) | Errors: ${errors}`);
            
            // Get Telemetry Queue Length
            let telemetryCount = 0;
            try {
                telemetryCount = await redis.xlen('telemetry');
                console.log(`[Store and Forward] ${telemetryCount} telemetry events pushed to Redis asynchronously.`);
            } catch(e) {
                console.error("Failed to read telemetry queue", e);
            }

            results.push({
                name: s.name,
                reqPerSec: rps,
                latencyAvg: latencyAvg,
                p99: p99,
                errors: errors,
                timeouts: timeouts,
                telemetryEvents: telemetryCount,
                startTs: startTimestamp,
                endTs: endTimestamp
            });

            // Save full data for charts
            if (!fs.existsSync('results')) {
                fs.mkdirSync('results');
            }
            fs.writeFileSync(`results/${s.name}.json`, JSON.stringify({ ...data, telemetryEvents: telemetryCount }, null, 2));
            
        } catch (e) {
            console.error(`Failed to test ${s.name}`, e.message);
            results.push({ name: s.name, reqPerSec: 0, latencyAvg: 0, p99: 0, errors: -1, telemetryEvents: 0 });
        }
        
        // Wait 5 seconds between tests to let TCP ports and CPU cool down
        console.log('Cooling down...');
        execSync('sleep 5');
    }
    
    // Close redis connection
    redis.quit();

    console.log('\n--- FINAL RESULTS ---');
    console.table(results);
    if (!fs.existsSync('results')) {
        fs.mkdirSync('results');
    }
    fs.writeFileSync('results/summary.json', JSON.stringify(results, null, 2));
}

runTest();
