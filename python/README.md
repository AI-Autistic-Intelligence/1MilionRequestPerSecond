# Ferrox-Py Architecture

The Python implementation of Ferrox, using `FastAPI` and the `Uvicorn` ASGI server.

## Architecture Deep Dive
- **Concurrency Model**: Single-threaded event loop. Python's Global Interpreter Lock (GIL) limits true parallelism, so concurrency is achieved via `asyncio`.
- **Data Layer**: Uses `asyncpg` for non-blocking PostgreSQL access.
- **Event Streaming**: Uses `aiokafka` to asynchronously publish messages.
- **Rate Limiting**: Integrates with a Redis Cluster using `redis.asyncio` to throttle requests globally across all 3 replicas.

## 1M RPS Strategy
Scaling Python to 1M RPS is generally discouraged due to extreme CPU overhead per request (JSON serialization, asyncio event loop overhead).
1. **Replication**: It requires thousands of pods. We deploy 3 replicas here to benchmark how quickly the Python workers saturate their CPU cores compared to compiled languages.
2. **Usage**: Python should be isolated to background queue workers (consuming Kafka) or AI/ML inference endpoints, rather than the frontline API gateway.





## Benchmark Results (8.0 vCPU)
- **Requests Per Second (Avg):** 7120.69
- **Average Latency:** 281.23 ms
- **99th Percentile Latency:** 815 ms
- **Errors:** 0
- **Timeouts:** 0

*(Test executed via autocannon for 60 seconds with 200 concurrent connections, hitting Redis and PostgreSQL per request.)*

