# Ferrox-Java Architecture

The Java implementation of Ferrox for Enterprise environments.

## Architecture Deep Dive
- **Concurrency Model**: Virtual Threads (Project Loom, Java 21+) or NIO Thread Pools. Delivers massive throughput but is heavily dependent on JVM garbage collection tuning (ZGC / Shenandoah).
- **Data Layer**: Connects to PostgreSQL via standard JDBC or R2DBC for reactive access.
- **Event Streaming**: Uses `kafka-clients` for rock-solid Kafka integration.
- **Rate Limiting**: Connects to the Redis Cluster via `Jedis` or `Lettuce` to enforce strict rate limits across the 3 replicas.

## 1M RPS Strategy
Java is highly capable of reaching 1M RPS, but it comes at a steep memory cost.
1. **Warmup**: The JVM's Just-In-Time (JIT) compiler requires a warmup phase. Initial requests will have high latency.
2. **Replication**: Deploying 3 replicas demonstrates how Java nodes share state via Redis. The hardware must be memory-optimized, unlike Rust which only needs compute-optimized instances.





## Benchmark Results (8.0 vCPU)
- **Requests Per Second (Avg):** 3639.44
- **Average Latency:** 548 ms
- **99th Percentile Latency:** 657 ms
- **Errors:** 0
- **Timeouts:** 0

*(Test executed via autocannon for 60 seconds with 200 concurrent connections, hitting Redis and PostgreSQL per request.)*

