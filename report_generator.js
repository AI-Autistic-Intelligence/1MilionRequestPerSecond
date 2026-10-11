const fs = require('fs');

function generateHTML() {
    if (!fs.existsSync('results/summary.json')) {
        console.error("No results found. Please run the benchmark first.");
        return;
    }
    
    const summary = JSON.parse(fs.readFileSync('results/summary.json', 'utf-8'));
    
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

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>1 Million RPS - Ferrox Benchmark Report</title>
    <style>
        body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
        .container { max-width: 1000px; margin: auto; background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        h1 { text-align: center; color: #38bdf8; font-size: 2.5rem; margin-bottom: 5px; }
        h2 { border-bottom: 2px solid #334155; padding-bottom: 10px; margin-top: 40px; color: #7dd3fc; }
        p.subtitle { text-align: center; color: #94a3b8; font-size: 1.2rem; margin-bottom: 40px; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { text-align: left; padding: 16px; border-bottom: 1px solid #334155; }
        th { background: #0f172a; color: #e2e8f0; font-weight: 600; }
        tr:hover { background: #334155; }
        
        .chart-container { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 40px; }
        .chart-card { flex: 1 1 45%; background: #0f172a; padding: 20px; border-radius: 8px; border: 1px solid #334155; page-break-inside: avoid; }
        
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
</head>
<body>
    <div class="container">
        <h1>Ferrox Ecosystem Benchmark</h1>
        <p class="subtitle">Simulating 1 Million RPS Workload (8.0 vCPU limits)</p>
        
        <h2>Overview & Methodology</h2>
        <p>This benchmark measures the performance of 5 different backend frameworks under a Dockerized environment. Each backend instance (replica) was constrained to <strong>8.0 vCPUs</strong> to allow Node.js and Rust to fully leverage multiple threads and connection pooling, ensuring they can express their maximum potential without OS throttling.</p>
        
        <p>Each request performs:</p>
        <ul>
            <li>A Redis <code>INCR</code> command for IP-based rate limiting (1000 max).</li>
            <li>A Postgres <code>SELECT</code> query reading a random record from a 100k seeded table.</li>
            <li>A Redis <code>XADD</code> telemetry stream push representing an asynchronous "Store and Forward" pattern.</li>
        </ul>

        <h2>Final Results (Throughput & Latency)</h2>
        <table>
            <thead>
                    <th>Framework</th>
                    <th>Avg Requests/sec (RPS)</th>
                    <th>Avg Latency (ms)</th>
                    <th>p99 Latency (ms)</th>
                    <th>Errors</th>
                    <th>Telemetry Pushed</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="page-break"></div>

        <h2>Performance Visualizations</h2>
        <div class="chart-container">
            <div class="chart-card">
                <canvas id="rpsChart"></canvas>
            </div>
            <div class="chart-card">
                <canvas id="latencyChart"></canvas>
            </div>
        </div>

        <div class="page-break"></div>
        <h2>Detailed Execution Metrics</h2>
        <p>The following detailed percentiles showcase how latency varied over the 60 seconds duration for each framework.</p>
        <div class="chart-container" id="latencyHistograms">
            <!-- Dynamically injected -->
        </div>

    </div>

    <script>
        const summaryData = ${JSON.stringify(summary)};
        const labels = summaryData.map(d => d.name);
        
        // RPS Chart
        new Chart(document.getElementById('rpsChart'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg Requests/sec',
                    data: summaryData.map(d => d.reqPerSec),
                    backgroundColor: '#38bdf8'
                }]
            },
            options: { plugins: { title: { display: true, text: 'Throughput (RPS) - Higher is Better', color: '#fff' } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } }
        });

        // Latency Chart
        new Chart(document.getElementById('latencyChart'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Avg Latency (ms)',
                        data: summaryData.map(d => d.latencyAvg),
                        backgroundColor: '#fbbf24'
                    },
                    {
                        label: 'p99 Latency (ms)',
                        data: summaryData.map(d => d.p99),
                        backgroundColor: '#ef4444'
                    }
                ]
            },
            options: { plugins: { title: { display: true, text: 'Latency - Lower is Better', color: '#fff' } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } }
        });
        
        // Ensure chart text colors adapt for print
        window.addEventListener('beforeprint', () => {
            Chart.helpers.each(Chart.instances, (instance) => {
                instance.options.plugins.title.color = '#000';
                instance.update();
            });
        });
    </script>
</body>
</html>
    `;
    
    fs.writeFileSync('report.html', html);
    console.log("report.html generated successfully! Open it in a browser and print to PDF.");
}

generateHTML();
