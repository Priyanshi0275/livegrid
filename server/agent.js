const fetch = require("node-fetch");

const AGENT_ID = process.env.AGENT_ID || "agent-1";
const TARGET_URL = process.env.TARGET_URL || "http://localhost:4000";
const RPS = parseInt(process.env.RPS || "10", 10);
const ENDPOINT = `${TARGET_URL}/api/data`;

const intervalMs = Math.floor(1000 / RPS);
let reqCount = 0;
let errorCount = 0;
let totalLatency = 0;
const window = [];

async function fireRequest() {
  const start = Date.now();
  try {
    const res = await fetch(ENDPOINT);
    const latency = Date.now() - start;
    const success = res.ok;
    if (!success) errorCount++;
    reqCount++;
    totalLatency += latency;
    window.push({ latency, success, ts: Date.now() });
    if (window.length > 50) window.shift();

    const avgLatency = window.reduce((s, r) => s + r.latency, 0) / window.length;
    const errorRate = window.filter((r) => !r.success).length / window.length;
    const throughput = window.length;

    const metric = {
      agentId: AGENT_ID,
      latency,
      avgLatency: Math.round(avgLatency),
      errorRate: parseFloat(errorRate.toFixed(3)),
      throughput,
      reqCount,
      errorCount,
      ts: Date.now(),
    };

    process.stdout.write(JSON.stringify(metric) + "\n");
  } catch (err) {
    errorCount++;
    reqCount++;
    const metric = {
      agentId: AGENT_ID,
      latency: Date.now() - start,
      avgLatency: 9999,
      errorRate: 1,
      throughput: 0,
      reqCount,
      errorCount,
      error: err.message,
      ts: Date.now(),
    };
    process.stdout.write(JSON.stringify(metric) + "\n");
  }
}

const timer = setInterval(fireRequest, intervalMs);

process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
process.on("SIGINT",  () => { clearInterval(timer); process.exit(0); });
