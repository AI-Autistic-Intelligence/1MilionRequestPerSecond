const fs = require('fs');
const path = require('path');

function updateReadmes() {
    if (!fs.existsSync('results/summary.json')) return;
    
    const summary = JSON.parse(fs.readFileSync('results/summary.json', 'utf-8'));
    
    summary.forEach(res => {
        // e.g. ferrox-node -> folder 'node'
        let folder = res.name.split('-')[1];
        if (folder === 'py') folder = 'python'; // Special case
        
        const readmePath = path.join(__dirname, folder, 'README.md');
        if (fs.existsSync(readmePath)) {
            let content = fs.readFileSync(readmePath, 'utf-8');
            
            // Generate benchmark text
            const benchText = `
## Benchmark Results (8.0 vCPU)
- **Requests Per Second (Avg):** ${res.reqPerSec}
- **Average Latency:** ${res.latencyAvg} ms
- **99th Percentile Latency:** ${res.p99} ms
- **Errors:** ${res.errors}
- **Timeouts:** ${res.timeouts}

*(Test executed via autocannon for 60 seconds with 200 concurrent connections, hitting Redis and PostgreSQL per request.)*
`;
            
            // Replace old results or append
            if (content.includes("## Benchmark Results")) {
                content = content.replace(/## Benchmark Results[\s\S]*?(?=(## |$))/g, benchText + "\n");
            } else {
                content += "\n" + benchText;
            }
            
            fs.writeFileSync(readmePath, content);
            console.log(`Updated ${folder}/README.md`);
        }
    });
}

updateReadmes();
