# Ferrox-PHP Architecture

The PHP implementation of Ferrox, supercharged by the `Swoole` extension.

## Architecture Deep Dive
- **Concurrency Model**: Swoole replaces the traditional blocking PHP-FPM model with a Node.js-style async event loop written in C. This allows PHP to handle thousands of concurrent TCP connections.
- **Data Layer**: Uses Swoole's async PostgreSQL client or standard PDO with connection pooling.
- **Event Streaming**: Integrates with Kafka using the `rdkafka` PHP extension.
- **Rate Limiting**: Connects to Redis via `phpredis` to apply rate limits globally.

## 1M RPS Strategy
1. **Replication**: We use 3 replicas to test how Swoole handles state distribution.
2. **Limitations**: While Swoole makes PHP incredibly fast, it introduces complexities regarding memory leaks since PHP scripts are usually designed to die after execution. At 1M RPS, garbage collection within the Swoole workers becomes a critical bottleneck.





## Benchmark Results (8.0 vCPU)
- **Requests Per Second (Avg):** 10627.04
- **Average Latency:** 188.42 ms
- **99th Percentile Latency:** 594 ms
- **Errors:** 0
- **Timeouts:** 0

*(Test executed via autocannon for 60 seconds with 200 concurrent connections, hitting Redis and PostgreSQL per request.)*

