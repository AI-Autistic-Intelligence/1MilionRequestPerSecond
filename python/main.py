import os
from fastapi import FastAPI, Request, HTTPException
import uvicorn
import redis.asyncio as redis
import asyncpg
import time
import asyncio
from prometheus_client import Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response

REQUEST_TIME = Histogram('http_request_duration_seconds', 'Duration of HTTP requests', ['method', 'route', 'code'])

app = FastAPI()
redis_pool = None

@app.on_event("startup")
async def startup_event():
    global redis_pool, db_pool
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    redis_pool = redis.from_url(redis_url, encoding="utf8", decode_responses=True)
    db_url = os.getenv("DB_URL", "postgres://user:password@postgres:5432/ferrox")
    db_pool = await asyncpg.create_pool(db_url, min_size=10, max_size=100)

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/")
async def read_root(request: Request):
    start_time = time.perf_counter()
    ip = request.client.host if request.client else "127.0.0.1"
    key = f"rate:{ip}"
    
    current = await redis_pool.incr(key)
    if current == 1:
        await redis_pool.expire(key, 1)
    
    if current > 1000:
        REQUEST_TIME.labels(method='GET', route='/', code='429').observe(time.perf_counter() - start_time)
        raise HTTPException(status_code=429, detail="Too Many Requests")
        
    import random
    random_id = random.randint(1, 100000)
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow('SELECT id, username, email FROM users WHERE id = $1', random_id)
        user = dict(row) if row else None
        
    duration = time.perf_counter() - start_time
    # Fire and forget telemetry push to Redis stream
    asyncio.create_task(redis_pool.xadd('telemetry', {'service': 'ferrox-py', 'latency': str(round(duration * 1000, 3))}, maxlen=10000))
    
    REQUEST_TIME.labels(method='GET', route='/', code='200').observe(duration)
    return {"status": "ok", "ecosystem": "ferrox-py", "replica": os.getenv("HOSTNAME"), "data": user}

if __name__ == "__main__":
    import multiprocessing
    cores = multiprocessing.cpu_count()
    uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="warning", workers=cores)
