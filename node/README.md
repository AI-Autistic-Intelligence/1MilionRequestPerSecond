# Ferrox-Node Architecture

The Ferrox implementation for the JavaScript/TypeScript ecosystem, built on `Fastify`.

## Architecture Deep Dive
- **Concurrency Model**: V8 Engine with a single-threaded asynchronous Event Loop. While excellent for I/O-bound tasks, it becomes CPU-bound under heavy payload serialization or complex rate-limiting cryptography.
- **Data Layer**: Uses `pg` for PostgreSQL connection pooling.
- **Event Streaming**: Uses `kafkajs` for producing messages.
- **Rate Limiting**: Uses `ioredis` to maintain distributed state for rate limits across the 3 instances in the cluster.

## 1M RPS Strategy
Scaling Node.js to 1M RPS requires massive horizontal scaling because each replica is bound to a single vCPU thread by default.
1. **Replication**: In Kubernetes, you must run hundreds of pods, or use the Node `cluster` module to fork processes for every available core.
2. **Bottlenecks**: The primary bottleneck in this test will be the V8 garbage collector under extreme memory pressure and the Event Loop lagging when waiting for Redis/Kafka ACKs.





## Benchmark Results (8.0 vCPU)
- **Requests Per Second (Avg):** 14781.99
- **Average Latency:** 138.13 ms
- **99th Percentile Latency:** 677 ms
- **Errors:** 0
- **Timeouts:** 0

*(Test executed via autocannon for 60 seconds with 200 concurrent connections, hitting Redis and PostgreSQL per request.)*

