const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const { execSync, spawn } = require("child_process");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const TARGET_URL = process.env.TARGET_URL || "http://localhost:4000";

// ── In-memory state ──────────────────────────────────────────────
const agents = {};      // agentId → { id, pid, status, metrics[] }
const testState = {
  running: false,
  profile: "ramp",     // ramp | spike | soak
  agentCount: 3,
  rps: 10,
  startTime: null,
};

// ── WebSocket server ─────────────────────────────────────────────
const wss = new WebSocket.Server({ port: 3001 });
console.log("[server] WebSocket listening on :3001");

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// ── Agent processes ──────────────────────────────────────────────
function spawnAgent(agentId) {
  const env = {
    ...process.env,
    AGENT_ID: agentId,
    TARGET_URL,
    RPS: String(testState.rps),
  };

  const proc = spawn("node", ["/agents/agent.js"], { env });
  agents[agentId] = { id: agentId, status: "running", metrics: [], pid: proc.pid };

  proc.stdout.on("data", (raw) => {
    try {
      const lines = raw.toString().trim().split("\n");
      lines.forEach((line) => {
        const metric = JSON.parse(line);
        const entry = agents[agentId];
        if (!entry) return;
        entry.metrics.push(metric);
        if (entry.metrics.length > 300) entry.metrics.shift();
        broadcast("metric", { agentId, ...metric });
      });
    } catch (_) {}
  });

  proc.stderr.on("data", (d) => console.error(`[agent:${agentId}]`, d.toString()));
  proc.on("exit", () => {
    if (agents[agentId]) agents[agentId].status = "stopped";
    broadcast("agentStatus", { agentId, status: "stopped" });
  });

  broadcast("agentStatus", { agentId, status: "running" });
  return proc;
}

const agentProcs = {};

function startTest() {
  if (testState.running) return;
  testState.running = true;
  testState.startTime = Date.now();
  Object.keys(agents).forEach((id) => delete agents[id]);
  broadcast("testStarted", { ...testState });

  // ramp: add agents one by one, spike: all at once, soak: 1 agent long-running
  const count = testState.agentCount;
  if (testState.profile === "ramp") {
    for (let i = 0; i < count; i++) {
      const id = `agent-${i + 1}`;
      setTimeout(() => { agentProcs[id] = spawnAgent(id); }, i * 1500);
    }
  } else if (testState.profile === "spike") {
    for (let i = 0; i < count; i++) {
      const id = `agent-${i + 1}`;
      agentProcs[id] = spawnAgent(id);
    }
  } else {
    // soak: 1 agent, high rps
    testState.rps = 30;
    agentProcs["agent-1"] = spawnAgent("agent-1");
  }
}

function stopTest() {
  Object.values(agentProcs).forEach((p) => { try { p.kill(); } catch (_) {} });
  Object.keys(agentProcs).forEach((k) => delete agentProcs[k]);
  testState.running = false;
  broadcast("testStopped", {});
}

// ── REST API ─────────────────────────────────────────────────────
app.post("/test/start", (req, res) => {
  const { profile, agentCount, rps } = req.body || {};
  if (profile) testState.profile = profile;
  if (agentCount) testState.agentCount = Number(agentCount);
  if (rps) testState.rps = Number(rps);
  startTest();
  res.json({ ok: true, state: testState });
});

app.post("/test/stop", (req, res) => {
  stopTest();
  res.json({ ok: true });
});

app.get("/test/state", (req, res) => res.json({ testState, agents }));

app.post("/target/config", async (req, res) => {
  try {
    const r = await fetch(`${TARGET_URL}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/target/config", async (req, res) => {
  try {
    const r = await fetch(`${TARGET_URL}/api/config`);
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3002, () => console.log("[server] REST API on :3002"));
