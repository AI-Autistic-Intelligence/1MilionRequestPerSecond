provider "aws" {
  region = "us-east-1"
}

# VPC and Networking
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"

  name = "ferrox-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# EKS Cluster for Compute (Rust/Node/PHP/Java/Py)
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "19.16.0"

  cluster_name    = "ferrox-cluster"
  cluster_version = "1.28"

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.public_subnets

  eks_managed_node_groups = {
    general = {
      desired_size = 50 # massive scale
      min_size     = 10
      max_size     = 100
      
      instance_types = ["c7g.4xlarge"] # Graviton3 for high performance per watt
      capacity_type  = "ON_DEMAND"
    }
  }
}

# ElastiCache Redis Cluster for Rate Limiting & Caching
resource "aws_elasticache_replication_group" "ferrox_redis" {
  replication_group_id          = "ferrox-redis-cluster"
  description                   = "Redis cluster for rate limiting 1M RPS"
  node_type                     = "cache.r7g.4xlarge"
  port                          = 6379
  parameter_group_name          = "default.redis7.cluster.on"
  automatic_failover_enabled    = true

  cluster_mode {
    replicas_per_node_group = 1
    num_node_groups         = 10 # 10 Shards to distribute 1M RPS
  }

  subnet_group_name = aws_elasticache_subnet_group.ferrox_redis_subnets.name
}

resource "aws_elasticache_subnet_group" "ferrox_redis_subnets" {
  name       = "ferrox-redis-subnets"
  subnet_ids = module.vpc.private_subnets
}

# Aurora PostgreSQL for Core DB Operations
module "aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "8.3.1"

  name           = "ferrox-postgres"
  engine         = "aurora-postgresql"
  engine_version = "15.3"
  
  vpc_id               = module.vpc.vpc_id
  db_subnet_group_name = module.vpc.database_subnet_group
  
  instance_class = "db.r7g.8xlarge"
  instances = {
    1 = {}
    2 = {} # Read replica
    3 = {} # Read replica
  }
}

# AWS RDS Proxy (Critical for 1M RPS Connection Multiplexing)
resource "aws_db_proxy" "ferrox_proxy" {
  name                   = "ferrox-rds-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = false
  role_arn               = aws_iam_role.rds_proxy_role.arn
  vpc_security_group_ids = [module.vpc.default_security_group_id]
  vpc_subnet_ids         = module.vpc.private_subnets

  auth {
    auth_scheme = "SECRETS"
    description = "RDS Proxy auth"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_password.arn
  }
}

resource "aws_db_proxy_default_target_group" "ferrox_proxy_target" {
  db_proxy_name = aws_db_proxy.ferrox_proxy.name
  
  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "aurora_target" {
  db_cluster_identifier  = module.aurora.cluster_id
  db_proxy_name          = aws_db_proxy.ferrox_proxy.name
  target_group_name      = aws_db_proxy_default_target_group.ferrox_proxy_target.name
}

# Dummy Secrets for proxy auth
resource "aws_secretsmanager_secret" "db_password" {
  name = "ferrox-db-credentials"
}

resource "aws_iam_role" "rds_proxy_role" {
  name = "rds-proxy-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
    }]
  })
}
