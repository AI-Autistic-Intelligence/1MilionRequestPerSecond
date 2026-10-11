# Ferrox-Rust Architecture

This is the core Ferrox implementation based on Rust (`axum` and `tokio`).
The objective is to offer bare-metal performance with zero Garbage Collection latency.

## Architecture Deep Dive
- **Concurrency Model**: Asynchronous thread-pool via Tokio. Rust's ownership model ensures memory safety without GC pauses, making it ideal for sustained high-throughput systems.
- **Data Layer**: Connects to PostgreSQL using `tokio-postgres` or `sqlx` for async DB operations.
- **Event Streaming**: Uses `rdkafka` to push high-volume events to Kafka.
- **Rate Limiting**: Implements a Redis-based distributed rate limiter (using a token bucket or fixed window algorithm) to prevent abuse across the 3 horizontally scaled replicas.

## 1M RPS Strategy
In a production Kubernetes or EC2 environment, this service scales linearly. To achieve 1M RPS:
1. **Compute**: Deploy on compute-optimized nodes (e.g., AWS Graviton3 `c7g`).
2. **Replicas**: With 3 replicas, we test the load balancer's ability to distribute traffic and the Redis cluster's ability to handle distributed rate-limiting locks.
3. **Isolation**: Docker instances are allowed to utilize the host's maximum unreserved CPU cycles for benchmarking maximum raw throughput.





## Benchmark Results (8.0 vCPU)
- **Requests Per Second (Avg):** 13469.2
- **Average Latency:** 148.87 ms
- **99th Percentile Latency:** 333 ms
- **Errors:** 0
- **Timeouts:** 0

*(Test executed via autocannon for 60 seconds with 200 concurrent connections, hitting Redis and PostgreSQL per request.)*

