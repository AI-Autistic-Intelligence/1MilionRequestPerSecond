use axum::{routing::get, Router, Json, extract::State, http::StatusCode};
use deadpool_redis::{Config as RedisConfig, Pool as RedisPool, Runtime};
use deadpool_postgres::{Config as PgConfig, Pool as PgPool, Runtime as PgRuntime};
use tokio_postgres::NoTls;
use serde::{Serialize, Deserialize};
use std::env;
use std::time::Instant;
use tokio::net::TcpListener;
use redis::AsyncCommands;
use rand::Rng;
use prometheus::{HistogramVec, Registry, TextEncoder, Encoder, HistogramOpts};
use lazy_static::lazy_static;

lazy_static! {
    static ref REGISTRY: Registry = Registry::new();
    static ref REQUEST_DURATION: HistogramVec = HistogramVec::new(
        HistogramOpts::new("http_request_duration_seconds", "Duration of HTTP requests"),
        &["method", "route", "code"]
    ).unwrap();
}

#[derive(Clone)]
struct AppState {
    redis_pool: RedisPool,
    pg_pool: PgPool,
}

#[derive(Serialize)]
struct User {
    id: i32,
    username: String,
    email: String,
}

#[derive(Serialize)]
struct Response {
    status: &'static str,
    ecosystem: &'static str,
    replica: String,
    data: Option<User>,
}

async fn metrics() -> String {
    let mut buffer = vec![];
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}

async fn root(State(state): State<AppState>) -> Result<Json<Response>, (StatusCode, &'static str)> {
    let start_time = Instant::now();
    let mut conn = state.redis_pool.get().await.map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Redis Connection Failed"))?;
    
    // Hardcoded IP for benchmark simplicity
    let key = "rate:127.0.0.1";
    let current: i64 = conn.incr(key, 1).await.unwrap_or(0);
    
    if current == 1 {
        let _: () = conn.expire(key, 1).await.unwrap_or(());
    }
    
    if current > 1000 {
        REQUEST_DURATION.with_label_values(&["GET", "/", "429"]).observe(start_time.elapsed().as_secs_f64());
        return Err((StatusCode::TOO_MANY_REQUESTS, "Too Many Requests"));
    }

    let mut random_id = 1;
    {
        let mut rng = rand::thread_rng();
        random_id = rng.gen_range(1..100000);
    }

    let pg_client = state.pg_pool.get().await.map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "PG Connection Failed"))?;
    let row_opt = pg_client.query_opt("SELECT id, username, email FROM users WHERE id = $1", &[&(random_id as i32)]).await.unwrap_or(None);
    
    let user = row_opt.map(|row| User {
        id: row.get(0),
        username: row.get(1),
        email: row.get(2),
    });

    let duration_ms = start_time.elapsed().as_secs_f64() * 1000.0;
    
    // Fire and forget telemetry
    let redis_pool_clone = state.redis_pool.clone();
    tokio::spawn(async move {
        if let Ok(mut c) = redis_pool_clone.get().await {
            let _: () = redis::cmd("XADD")
                .arg("telemetry")
                .arg("MAXLEN").arg("~").arg("10000")
                .arg("*")
                .arg("service").arg("ferrox-rust")
                .arg("latency").arg(duration_ms.to_string())
                .query_async(&mut c).await.unwrap_or(());
        }
    });

    REQUEST_DURATION.with_label_values(&["GET", "/", "200"]).observe(start_time.elapsed().as_secs_f64());
    
    Ok(Json(Response {
        status: "ok",
        ecosystem: "ferrox-rust",
        replica: env::var("HOSTNAME").unwrap_or_else(|_| "unknown".to_string()),
        data: user,
    }))
}

#[tokio::main]
async fn main() {
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://redis:6379".to_string());
    let mut cfg = RedisConfig::from_url(redis_url);
    cfg.pool = Some(deadpool_redis::PoolConfig::new(2000));
    let redis_pool = cfg.create_pool(Some(Runtime::Tokio1)).unwrap();

    let db_url = env::var("DB_URL").unwrap_or_else(|_| "postgres://user:password@postgres:5432/ferrox".to_string());
    let mut pg_cfg = PgConfig::new();
    pg_cfg.url = Some(db_url);
    pg_cfg.manager = Some(deadpool_postgres::ManagerConfig { recycling_method: deadpool_postgres::RecyclingMethod::Fast });
    let pool_cfg = deadpool_postgres::PoolConfig::new(2000);
    pg_cfg.pool = Some(pool_cfg);
    let pg_pool = pg_cfg.create_pool(Some(PgRuntime::Tokio1), NoTls).unwrap();

    let state = AppState {
        redis_pool,
        pg_pool,
    };

    REGISTRY.register(Box::new(REQUEST_DURATION.clone())).unwrap();

    let app = Router::new()
        .route("/", get(root))
        .route("/metrics", get(metrics))
        .with_state(state);
        
    let listener = TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("Ferrox listening on port 8080");
    axum::serve(listener, app).await.unwrap();
}
