const fs = require('fs');

async function fetchPrometheusData(query, start, end, step) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://localhost:9090/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        return data.data.result;
    } catch (e) {
        console.error("Prometheus error:", e.message);
        return [];
    }
}

async function generate() {
    if (!fs.existsSync('results/summary.json')) {
        console.error("No results found. Run test_runner.js first.");
        return;
    }
    
    const summary = JSON.parse(fs.readFileSync('results/summary.json', 'utf-8'));
    
    // Enrich with prometheus data
    for (const r of summary) {
        if (r.startTs && r.endTs) {
            console.log(`Fetching Prometheus data for ${r.name}...`);
            // RPS per second
            const rpsQuery = `sum(rate(http_request_duration_seconds_count{instance=~"${r.name}.*"}[5s]))`;
            r.timeseriesRPS = await fetchPrometheusData(rpsQuery, r.startTs, r.endTs, '2s');
            
            // Memory usage (MB)
            const memQuery = `sum(container_memory_usage_bytes{name=~"${r.name}.*"}) / 1024 / 1024`;
            r.timeseriesMem = await fetchPrometheusData(memQuery, r.startTs, r.endTs, '2s');
            
            // Average Latency
            const latQuery = `sum(rate(http_request_duration_seconds_sum{instance=~"${r.name}.*"}[5s])) / sum(rate(http_request_duration_seconds_count{instance=~"${r.name}.*"}[5s])) * 1000`;
            r.timeseriesLat = await fetchPrometheusData(latQuery, r.startTs, r.endTs, '2s');
        }
    }

    let rows = summary.map(r => `
        <tr>
            <td><strong>${r.name}</strong></td>
            <td>${r.reqPerSec}</td>
            <td>${r.latencyAvg}</td>
            <td>${r.p99}</td>
            <td>${r.errors}</td>
            <td>${r.telemetryEvents || 0}</td>
        </tr>
    `).join('\n');

    let chartsHTML = '';
    
    summary.forEach((r, idx) => {
        let rpsData = r.timeseriesRPS?.[0]?.values?.map(v => v[1]) || [];
        let memData = r.timeseriesMem?.[0]?.values?.map(v => v[1]) || [];
        let latData = r.timeseriesLat?.[0]?.values?.map(v => v[1] === "NaN" ? 0 : parseFloat(v[1]).toFixed(2)) || [];
        
        let labels = rpsData.map((_, i) => i * 2 + 's');
        
        chartsHTML += `
            <div class="page-break"></div>
            <h2>${r.name} - Detailed Curves</h2>
            <div class="chart-container">
                <div class="chart-card"><canvas id="rpsChart_${idx}"></canvas></div>
                <div class="chart-card"><canvas id="memChart_${idx}"></canvas></div>
                <div class="chart-card"><canvas id="latChart_${idx}"></canvas></div>
            </div>
            
            <script>
                new Chart(document.getElementById('rpsChart_${idx}'), {
                    type: 'line',
                    data: { labels: ${JSON.stringify(labels)}, datasets: [{ label: 'Requests per Second (RPS)', data: ${JSON.stringify(rpsData)}, borderColor: '#38bdf8', fill: false }] },
                    options: { tension: 0.2, scales: { y: { beginAtZero: true } } }
                });
                new Chart(document.getElementById('memChart_${idx}'), {
                    type: 'line',
                    data: { labels: ${JSON.stringify(labels)}, datasets: [{ label: 'Memory Usage (MB)', data: ${JSON.stringify(memData)}, borderColor: '#fbbf24', fill: false }] },
                    options: { tension: 0.2, scales: { y: { beginAtZero: true } } }
                });
                new Chart(document.getElementById('latChart_${idx}'), {
                    type: 'line',
                    data: { labels: ${JSON.stringify(labels)}, datasets: [{ label: 'Avg Latency (ms)', data: ${JSON.stringify(latData)}, borderColor: '#ef4444', fill: false }] },
                    options: { tension: 0.2, scales: { y: { beginAtZero: true } } }
                });
            </script>
        `;
    });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>1 Million RPS - Advanced Telemetry Report</title>
    <style>
        body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
        .container { max-width: 1200px; margin: auto; background: #1e293b; padding: 40px; border-radius: 12px; }
        h1 { text-align: center; color: #38bdf8; font-size: 2.5rem; }
        h2 { border-bottom: 2px solid #334155; padding-bottom: 10px; margin-top: 40px; color: #7dd3fc; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { text-align: left; padding: 16px; border-bottom: 1px solid #334155; }
        th { background: #0f172a; color: #e2e8f0; font-weight: 600; }
        .chart-container { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; }
        .chart-card { flex: 1 1 30%; min-width: 300px; background: #0f172a; padding: 20px; border-radius: 8px; border: 1px solid #334155; }
        @media print {
            body { background: white; color: black; }
            .container { background: white; box-shadow: none; padding: 0; }
            h1, h2 { color: black; }
            th { background: #f1f5f9; color: black; }
            .chart-card { background: white; border: 1px solid #ccc; break-inside: avoid; }
            .page-break { page-break-before: always; }
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
</head>
<body>
    <div class="container">
        <h1>Advanced Ecosystem Benchmark & Telemetry</h1>
        
        <h2>Execution Architecture Flow</h2>
        <div class="mermaid">
        graph TD
            Client[Autocannon 200 Conn] -->|HTTP GET /| HAProxy[HAProxy Load Balancer]
            HAProxy -->|Round Robin| Replica1[Replica 1]
            HAProxy -->|Round Robin| Replica2[Replica 2]
            HAProxy -->|Round Robin| Replica3[Replica 3]
            
            Replica1 -->|1. INCR rate:ip| Redis[Redis 6.2]
            Replica1 -->|2. SELECT users| Postgres[Postgres 14]
            Replica1 -->|3. XADD telemetry| Redis
        </div>

        <h2>Summary Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Framework</th>
                    <th>Avg Requests/sec (RPS)</th>
                    <th>Avg Latency (ms)</th>
                    <th>p99 Latency (ms)</th>
                    <th>Errors (429/500)</th>
                    <th>Telemetry Pushed</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="page-break"></div>
        
        <h2>Optimization & Architecture Guide</h2>
        <div style="background: #334155; padding: 20px; border-radius: 8px; margin-top: 20px;">
            <h3>Java (Virtual Threads & Connection Pools)</h3>
            <p>During testing, Java showed nearly identical performance on 0.5 vCPUs as on 8.0 vCPUs. This indicated a severe bottleneck: <strong>Connection Pooling</strong>. Even though Java 21's Virtual Threads allow creating millions of concurrent lightweight threads, if the underlying <code>JedisPool</code> or <code>HikariCP</code> is limited to 8 or 100 connections, all those virtual threads will simply block waiting for an available socket. By bumping <code>JedisPoolConfig.setMaxTotal(500)</code> and <code>HttpServer</code> backlog to <code>10000</code>, Java can now fully saturate 8 CPU cores without getting stuck.</p>
            
            <h3>PHP (Swoole & Coroutines)</h3>
            <p>PHP with Swoole defaults to synchronous PDO. A worker gets blocked while querying Postgres. If <code>worker_num</code> is set to 8, PHP can only process 8 simultaneous requests! By increasing <code>worker_num</code> to 100, we mimic FPM's behavior in memory, allowing 100 concurrent DB queries. For true zero-blocking, Swoole Coroutine hooks (<code>Swoole\Runtime::enableCoroutine</code>) can be enabled to yield execution natively during PDO calls.</p>
            
            <h3>Rust (Tokio Async Executor) & Node.js (V8 Event Loop)</h3>
            <p>Both Rust and Node.js use a non-blocking asynchronous event loop. Rust uses a single Tokio runtime per instance, so setting the <code>deadpool</code> size to 400 allows the single event loop to multiplex thousands of requests across 400 active TCP sockets to Postgres/Redis. Node.js leverages the <code>cluster</code> module to fork 8 identical V8 engines, each maintaining a 100-connection pool, resulting in 800 total connections perfectly balanced across the 8 vCPUs.</p>
            
            <h3>Hardware Utilization (RAM & CPU)</h3>
            <p>Java's JVM footprint requires assigning at least 512MB to 1GB of RAM for optimal Garbage Collection pauses during 1M RPS peaks. Rust and Node.js are extremely memory efficient (often < 100MB), allowing them to maximize CPU L3 cache hits. Python (FastAPI + asyncpg) bridges the gap by offering great async IO within a heavier interpreter footprint, requiring about 250MB per worker.</p>
        </div>

        ${chartsHTML}
    </div>
    <script>mermaid.initialize({startOnLoad:true, theme: 'dark'});</script>
</body>
</html>
    `;
    
    fs.writeFileSync('detailed_report.html', html);
    console.log("detailed_report.html generated successfully! Open it in a browser and print to PDF.");
}

generate();
