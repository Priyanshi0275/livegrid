const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let config = {
  latencyBase: 50,    // ms
  latencyJitter: 30,  // ms random add
  errorRate: 0.02,    // 2% errors
  slowZone: false,    // simulate a slow endpoint
};

function randomLatency() {
  const base = config.slowZone ? config.latencyBase * 5 : config.latencyBase;
  return base + Math.random() * config.latencyJitter;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/api/data", async (req, res) => {
  const delay = randomLatency();
  await new Promise((r) => setTimeout(r, delay));

  if (Math.random() < config.errorRate) {
    return res.status(500).json({ error: "internal server error" });
  }

  res.json({
    id: Math.random().toString(36).slice(2),
    value: Math.random() * 100,
    ts: Date.now(),
  });
});

app.post("/api/config", (req, res) => {
  const { latencyBase, latencyJitter, errorRate, slowZone } = req.body;
  if (latencyBase !== undefined) config.latencyBase = Number(latencyBase);
  if (latencyJitter !== undefined) config.latencyJitter = Number(latencyJitter);
  if (errorRate !== undefined) config.errorRate = Number(errorRate);
  if (slowZone !== undefined) config.slowZone = Boolean(slowZone);
  res.json({ ok: true, config });
});

app.get("/api/config", (req, res) => res.json(config));

app.listen(4000, () => console.log("[target-api] listening on :4000"));
