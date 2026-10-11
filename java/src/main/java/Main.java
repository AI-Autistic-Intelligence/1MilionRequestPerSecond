import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.HashMap;
import java.util.Map;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.Jedis;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Random;
import io.prometheus.client.Histogram;
import io.prometheus.client.exporter.common.TextFormat;
import io.prometheus.client.CollectorRegistry;
import java.io.Writer;
import java.io.StringWriter;

public class Main {
    private static JedisPool pool;
    private static ObjectMapper mapper = new ObjectMapper();

    private static HikariDataSource dataSource;
    
    static final Histogram requestDuration = Histogram.build()
        .name("http_request_duration_seconds")
        .help("Duration of HTTP requests")
        .labelNames("method", "route", "code")
        .register();

    public static void main(String[] args) throws Exception {
        String redisHost = System.getenv("REDIS_HOST");
        if (redisHost == null) redisHost = "redis";
        JedisPoolConfig jedisConfig = new JedisPoolConfig();
        jedisConfig.setMaxTotal(2000);
        jedisConfig.setMaxIdle(100);
        pool = new JedisPool(jedisConfig, redisHost, 6379);

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:postgresql://postgres:5432/ferrox");
        config.setUsername("user");
        config.setPassword("password");
        config.setMaximumPoolSize(2000);
        dataSource = new HikariDataSource(config);

        HttpServer server = HttpServer.create(new InetSocketAddress(8081), 10000);
        server.createContext("/", new MyHandler());
        server.createContext("/actuator/prometheus", new MetricsHandler());
        server.setExecutor(java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        System.out.println("Ferrox-Java listening on port 8081");
    }

    static class MetricsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange t) throws IOException {
            try {
                StringWriter writer = new StringWriter();
                TextFormat.write004(writer, CollectorRegistry.defaultRegistry.metricFamilySamples());
                String response = writer.toString();
                t.getResponseHeaders().set("Content-Type", TextFormat.CONTENT_TYPE_004);
                t.sendResponseHeaders(200, response.length());
                OutputStream os = t.getResponseBody();
                os.write(response.getBytes());
                os.close();
            } catch(Exception e) {
                t.sendResponseHeaders(500, -1);
            }
        }
    }

    static class MyHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange t) throws IOException {
            long startTime = System.nanoTime();
            String ip = "127.0.0.1";
            String key = "rate:" + ip;
            
            try (Jedis jedis = pool.getResource()) {
                long current = jedis.incr(key);
                if (current == 1) {
                    jedis.expire(key, 1);
                }
                
                if (current > 1000) {
                    requestDuration.labels("GET", "/", "429").observe((System.nanoTime() - startTime) / 1e9);
                    String error = "{\"error\":\"Too Many Requests\"}";
                    t.getResponseHeaders().set("Content-Type", "application/json");
                    t.sendResponseHeaders(429, error.length());
                    OutputStream os = t.getResponseBody();
                    os.write(error.getBytes());
                    os.close();
                    return;
                }
            }

            Map<String, Object> resp = new HashMap<>();
            resp.put("status", "ok");
            resp.put("ecosystem", "ferrox-java");
            resp.put("replica", System.getenv("HOSTNAME"));
            
            try (Connection conn = dataSource.getConnection()) {
                int randomId = new Random().nextInt(100000) + 1;
                try (PreparedStatement stmt = conn.prepareStatement("SELECT id, username, email FROM users WHERE id = ?")) {
                    stmt.setInt(1, randomId);
                    try (ResultSet rs = stmt.executeQuery()) {
                        if (rs.next()) {
                            Map<String, Object> user = new HashMap<>();
                            user.put("id", rs.getInt("id"));
                            user.put("username", rs.getString("username"));
                            user.put("email", rs.getString("email"));
                            resp.put("data", user);
                        }
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            
            double duration = (System.nanoTime() - startTime) / 1e6;
            
            // Fire and forget telemetry push via Virtual Thread
            Thread.startVirtualThread(() -> {
                try (Jedis jedis = pool.getResource()) {
                    redis.clients.jedis.params.XAddParams params = redis.clients.jedis.params.XAddParams.xAddParams();
                    Map<String, String> hash = new HashMap<>();
                    hash.put("service", "ferrox-java");
                    hash.put("latency", String.format("%.3f", duration));
                    jedis.xadd("telemetry", params, hash);
                } catch (Exception e) {}
            });
            
            requestDuration.labels("GET", "/", "200").observe((System.nanoTime() - startTime) / 1e9);
            
            String response = mapper.writeValueAsString(resp);
            t.getResponseHeaders().set("Content-Type", "application/json");
            t.sendResponseHeaders(200, response.length());
            OutputStream os = t.getResponseBody();
            os.write(response.getBytes());
            os.close();
        }
    }
}
