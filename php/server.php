<?php
$http = new Swoole\Http\Server("0.0.0.0", 8082);

$http->set([
    'worker_num' => 200,
]);

$metricsTable = new Swoole\Table(1024);
$metricsTable->column('count', Swoole\Table::TYPE_INT);
$metricsTable->column('sum', Swoole\Table::TYPE_FLOAT);
$metricsTable->create();
$metricsTable->set('req_200', ['count' => 0, 'sum' => 0.0]);
$metricsTable->set('req_429', ['count' => 0, 'sum' => 0.0]);

$db = null;
$redis = null;

$http->on('WorkerStart', function ($server, $workerId) use (&$db, &$redis) {
    $redis = new Redis();
    $redis->pconnect('redis', 6379);

    $db = new PDO('pgsql:host=postgres;port=5432;dbname=ferrox', 'user', 'password');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
});

$http->on("start", function ($server) {
    echo "Ferrox-PHP (Swoole) listening on port 8082\n";
});

$http->on("request", function ($request, $response) use (&$redis, &$db, $metricsTable) {
    $startTime = microtime(true);
    
    if ($request->server['request_uri'] === '/metrics') {
        $req200 = $metricsTable->get('req_200');
        $req429 = $metricsTable->get('req_429');
        $out = "# HELP http_request_duration_seconds Duration of HTTP requests\n";
        $out .= "# TYPE http_request_duration_seconds summary\n";
        $out .= "http_request_duration_seconds_count{method=\"GET\",route=\"/\",code=\"200\"} {$req200['count']}\n";
        $out .= "http_request_duration_seconds_sum{method=\"GET\",route=\"/\",code=\"200\"} {$req200['sum']}\n";
        $out .= "http_request_duration_seconds_count{method=\"GET\",route=\"/\",code=\"429\"} {$req429['count']}\n";
        $out .= "http_request_duration_seconds_sum{method=\"GET\",route=\"/\",code=\"429\"} {$req429['sum']}\n";
        
        $response->header("Content-Type", "text/plain");
        $response->end($out);
        return;
    }

    $ip = $request->header['x-real-ip'] ?? '127.0.0.1';
    $key = "rate:{$ip}";
    
    $current = $redis->incr($key);
    if ($current == 1) {
        $redis->expire($key, 1);
    }
    
    if ($current > 1000) {
        $duration = microtime(true) - $startTime;
        $metricsTable->incr('req_429', 'count');
        $metricsTable->incr('req_429', 'sum', $duration);
        
        $response->status(429);
        $response->end(json_encode(["error" => "Too Many Requests"]));
        return;
    }

    $randomId = rand(1, 100000);
    $stmt = $db->prepare("SELECT id, username, email FROM users WHERE id = :id");
    $stmt->execute(['id' => $randomId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    $duration = microtime(true) - $startTime;
    
    // Fire and forget telemetry
    go(function () use ($redis, $duration) {
        try {
            $redis->xAdd('telemetry', '*', ['service' => 'ferrox-php', 'latency' => sprintf("%.3f", $duration * 1000)], 10000, '~');
        } catch (\Throwable $e) {}
    });

    $metricsTable->incr('req_200', 'count');
    $metricsTable->incr('req_200', 'sum', $duration);

    $response->header("Content-Type", "application/json");
    $response->end(json_encode([
        "status" => "ok", 
        "ecosystem" => "ferrox-php",
        "replica" => getenv('HOSTNAME'),
        "data" => $user
    ]));
});

$http->start();
