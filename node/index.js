const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  const fastify = require('fastify')({ logger: false })
  const Redis = require('ioredis')
  const { Pool } = require('pg')

  const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379')
  const pool = new Pool({ 
      connectionString: process.env.DB_URL || 'postgres://user:password@postgres:5432/ferrox',
      max: 100 // increased pool size per worker
  })

  // Prometheus Metrics
  const client = require('prom-client');
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ register: client.register });

  const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in microseconds',
    labelNames: ['method', 'route', 'code']
  });

  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return await client.register.metrics();
  });

  fastify.get('/', async (request, reply) => {
    const end = httpRequestDurationMicroseconds.startTimer();
    const startTime = performance.now();
    try {
      const ip = request.ip || '127.0.0.1'
      const key = `rate:${ip}`
      const current = await redis.incr(key)
      if (current === 1) await redis.expire(key, 1)
      if (current > 1000) {
        end({ method: 'GET', route: '/', code: 429 });
        return reply.status(429).send({ error: 'Too Many Requests' })
      }

      const randomId = Math.floor(Math.random() * 100000) + 1;
      const { rows } = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [randomId]);
      const user = rows[0] || null;

      const duration = (performance.now() - startTime).toFixed(3);
      // Fire and forget telemetry push to Redis stream
      redis.xadd('telemetry', 'MAXLEN', '~', '10000', '*', 'service', 'ferrox-node', 'latency', duration).catch(console.error);

      end({ method: 'GET', route: '/', code: 200 });
      return { status: 'ok', ecosystem: 'ferrox-node', replica: process.env.HOSTNAME, data: user }
    } catch (err) {
      end({ method: 'GET', route: '/', code: 500 });
      return reply.status(500).send({ error: 'Internal Server Error' })
    }
  })

  const start = async () => {
    try {
      await fastify.listen({ port: 3000, host: '0.0.0.0' })
      console.log(`Worker ${process.pid} listening on port 3000`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  start()
}
