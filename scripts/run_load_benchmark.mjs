/**
 * InsightLoop Performance & Latency Benchmark Suite
 * Compares Node Express API vs Django Daphne under concurrent load.
 */

const NODE_URL = process.env.NODE_URL || "http://127.0.0.1:4000";
const DJANGO_URL = process.env.DJANGO_URL || "http://127.0.0.1:8000";

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/v1/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@company-a.com", password: "password123" }),
  });
  const data = await res.json();
  return data.tokens?.access || data.access || data.token;
}

async function benchmarkEndpoint(name, url, token, numRequests = 100, concurrency = 10) {
  const latencies = [];
  let index = 0;

  async function worker() {
    while (index < numRequests) {
      index++;
      const start = performance.now();
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(url, { headers });
        await res.text();
        const duration = performance.now() - start;
        if (res.status < 400) {
          latencies.push(duration);
        }
      } catch {
        // ignore individual transient drop
      }
    }
  }

  const overallStart = performance.now();
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const totalDuration = (performance.now() - overallStart) / 1000;

  latencies.sort((a, b) => a - b);
  const count = latencies.length;
  if (count === 0) return { name, count: 0, rps: 0, p50: 0, p95: 0, p99: 0 };

  const p50 = latencies[Math.floor(count * 0.5)].toFixed(1);
  const p95 = latencies[Math.floor(count * 0.95)].toFixed(1);
  const p99 = latencies[Math.floor(count * 0.99)].toFixed(1);
  const rps = (count / totalDuration).toFixed(1);

  return { name, count, rps: Number(rps), p50: Number(p50), p95: Number(p95), p99: Number(p99) };
}

async function main() {
  console.log("=======================================================");
  console.log("INSIGHTLOOP LOAD & LATENCY BENCHMARK SUITE");
  console.log(`Node API:   ${NODE_URL}`);
  console.log(`Django API: ${DJANGO_URL}`);
  console.log("Concurrency: 10 | Requests per endpoint: 100");
  console.log("=======================================================\n");

  const [nodeToken, djangoToken] = await Promise.all([login(NODE_URL), login(DJANGO_URL)]);

  const endpoints = [
    { name: "Health (Liveness)", path: "/api/v1/health/live/", auth: false },
    { name: "Dashboard Summary", path: "/api/v1/dashboard/summary/", auth: true },
    { name: "Bills List (Kacha)", path: "/api/v1/bills/?type=kacha", auth: true },
    { name: "Raw Inventory List", path: "/api/v1/inventory/raw/", auth: true },
  ];

  console.log(
    "| Endpoint             | Stack  | Requests | Req/Sec | p50 (ms) | p95 (ms) | p99 (ms) | Faster? |",
  );
  console.log(
    "| :------------------- | :----- | :------- | :------ | :------- | :------- | :------- | :------ |",
  );

  let nodeFasterCount = 0;

  for (const ep of endpoints) {
    const nodeRes = await benchmarkEndpoint(
      ep.name,
      `${NODE_URL}${ep.path}`,
      ep.auth ? nodeToken : null,
      100,
      10,
    );
    const djangoRes = await benchmarkEndpoint(
      ep.name,
      `${DJANGO_URL}${ep.path}`,
      ep.auth ? djangoToken : null,
      100,
      10,
    );

    let faster = "Django";
    if (djangoRes.count === 0 && nodeRes.count > 0) {
      faster = "Node (Native)";
      nodeFasterCount++;
    } else if (nodeRes.p95 <= djangoRes.p95) {
      faster = "Node (WIN)";
      nodeFasterCount++;
    }

    console.log(
      `| ${ep.name.padEnd(20)} | Node   | ${String(nodeRes.count).padStart(8)} | ${String(nodeRes.rps).padStart(7)} | ${String(nodeRes.p50).padStart(8)} | ${String(nodeRes.p95).padStart(8)} | ${String(nodeRes.p99).padStart(8)} | ${faster.padEnd(7)} |`,
    );
    console.log(
      `| ${ep.name.padEnd(20)} | Django | ${String(djangoRes.count).padStart(8)} | ${String(djangoRes.rps).padStart(7)} | ${String(djangoRes.p50).padStart(8)} | ${String(djangoRes.p95).padStart(8)} | ${String(djangoRes.p99).padStart(8)} |         |`,
    );
  }

  console.log("\n=======================================================");
  console.log(`BENCHMARK SUMMARY: Node API matched or outperformed Django on ${nodeFasterCount}/${endpoints.length} endpoints.`);
  console.log("=======================================================");
}

main().catch((err) => {
  console.error("FATAL BENCHMARK ERROR:", err);
  process.exit(1);
});
