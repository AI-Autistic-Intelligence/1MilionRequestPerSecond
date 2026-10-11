# 1 Million RPS on AWS - Infrastructure as Code

This directory contains the Terraform blueprints required to scale the **Ferrox Ecosystem** to handle **1 Million Requests Per Second (1M RPS)** in a production AWS environment.

## Architecture

To support 1M RPS, we scale out the following components horizontally and vertically:

1. **Compute Layer (EKS)**: We use Amazon EKS with `c7g.4xlarge` (AWS Graviton3) instances. Graviton instances provide better performance-per-watt for Node, Rust, Java, Python, and PHP workloads.
2. **Database Layer (Aurora)**: We use Amazon Aurora PostgreSQL (`db.r7g.8xlarge`) with multiple read-replicas. Because 1M RPS creates immense database read-load, we offload SELECT queries to replicas.
3. **Database Proxy (RDS Proxy)**: *Critical Addition*. As demonstrated in our unbounded local load tests, a massive number of concurrent instances (Virtual Threads, Toko Tasks, Node Clusters) will crash the networking stack or Postgres connections. RDS Proxy multiplexes thousands of incoming connections into a manageable pool for Aurora.
4. **Caching & Rate Limiting (ElastiCache)**: We deploy a 10-shard ElastiCache Redis cluster (`cache.r7g.4xlarge`) to distribute the rate-limiting `INCR` commands across multiple nodes.

## Expected Costs (Monthly Estimate)

Running a 1M RPS infrastructure requires significant hardware. Here is a baseline estimation for 24/7 operation:

| Component | AWS Resource | Qty | Est. Monthly Cost |
| --- | --- | --- | --- |
| **Compute Nodes** | `c7g.4xlarge` (16 vCPUs, 32GB RAM) | ~40 | $6,800 |
| **Load Balancer** | Application Load Balancer (ALB) | 1 (high LCU) | $1,200 |
| **Database** | Aurora PostgreSQL `db.r7g.8xlarge` | 3 (1 W, 2 R) | $7,000 |
| **DB Multiplexer** | RDS Proxy | 10 endpoints | $1,500 |
| **Redis** | ElastiCache `cache.r7g.4xlarge` | 10 Shards | $9,500 |
| **Data Transfer** | AWS Egress bandwidth | ~500 TB | $25,000 |
| **Total** | | | **~$51,000 / month** |

*Note: Data transfer is often the most expensive component in a high-throughput API. Compressing payloads and utilizing AWS CloudFront (if applicable) can reduce these costs.*

## Deployment

To deploy this stack:

```bash
cd aws-terraform
terraform init
terraform plan
terraform apply
```

After deploying the infrastructure, use `kubectl` to apply the Kubernetes manifests for your chosen framework (e.g., Python FastAPI or PHP Swoole, which performed best in our localized 0.5 vCPU benchmarks).
