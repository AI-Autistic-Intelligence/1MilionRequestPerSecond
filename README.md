# 1 Million Requests Per Second (RPS) Project

Welcome to the **1M RPS Benchmark Project**, an architectural exercise exploring how different languages in the **Ferrox Ecosystem** perform under high-concurrency database queries and rate-limiting constraints, and what it takes to scale them to a million requests per second.

## Overview
This repository contains real implementations of a backend API in five distinct languages/frameworks:
- **Node.js** (Fastify + pg + Native Cluster)
- **Python** (FastAPI + Asyncpg + Gunicorn Workers)
- **Rust** (Axum + Tokio + Deadpool max 100)
- **Java** (Virtual Threads + HikariCP)
- **PHP** (Swoole Event Loop + PDO + 8 Workers)

Each backend is tasked with:
1. Connecting to **Redis** to execute a rate-limiting check (`INCR`).
2. Connecting to **PostgreSQL** to fetch a random user out of 100,000 seeded rows (`SELECT`).

## The Benchmark (8.0 vCPU limit, Fully Optimized)
We ran a deep stress test (`autocannon`) for 60 seconds on each framework inside a Docker environment, allocating **8.0 vCPUs** per instance (3 replicas). We applied **multi-processing** techniques to unlock the usage of all physical cores and expanded the PostgreSQL connection pool to **100 connections** per replica (max 2000 connections in the DB).

### Final Results
| Framework | Avg Requests/sec (RPS) | Avg Latency (ms) | p99 Latency (ms) | Errors |
| --- | --- | --- | --- | --- |
| **ferrox-node** | 14,781.99 | 138.13 | 677 | 0 |
| **ferrox-rust** | 13,469.20 | 148.87 | 333 | 0 |
| **ferrox-php** | 10,627.04 | 188.42 | 594 | 0 |
| **ferrox-py** | 7,120.69 | 281.23 | 815 | 0 |
| **ferrox-java** | 3,639.44 | 548.00 | 657 | 0 |

*Note: Rust has the lowest p99 latency, showing unmatched consistency under heavy load. Node.js tops the raw throughput chart thanks to Fastify and Native Node Clustering over 8 CPU cores.*

## Documentation & Reports

We have generated a fully interactive **HTML Dashboard** that you can open locally and export as a PDF.
- 📊 **[Open Interactive Report Dashboard (report.html)](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/report.html)** 

To read about the cloud deployment strategies on AWS to scale this architecture to a true 1,000,000 RPS, check out:
- ☁️ **[AWS Terraform Deployment Guide](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/aws-terraform/README.md)**

For individual language setups and specific sub-metrics, visit their respective directories:
- [Java Specs](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/java/README.md)
- [Python Specs](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/python/README.md)
- [Rust Specs](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/rust/README.md)
- [PHP Specs](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/php/README.md)
- [Node.js Specs](file:///c:/Users/nn/Desktop/code/1MilionRequestPerSecond/node/README.md)

## How to run the benchmark yourself
1. `docker-compose up --build -d`
2. Wait a few seconds for the DB seeder to populate 100,000 records.
3. `docker-compose exec test-runner node test_runner.js`
4. The output will automatically update `results/summary.json`. You can run `node report_generator.js ; node update_readmes.js` to regenerate the documentation.
