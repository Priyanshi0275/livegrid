import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, BarChart, Bar
} from "recharts";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

const AGENT_COLORS = ["#6ee7b7","#93c5fd","#fbbf24","#f87171","#a78bfa","#34d399","#60a5fa"];
const PROFILES = ["ramp","spike","soak"];

function useWebSocket(url) {
  const [messages, setMessages] = useState([]);
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function connect() {
      ws.current = new WebSocket(url);
      ws.current.onopen  = () => setConnected(true);
      ws.current.onclose = () => { setConnected(false); setTimeout(connect, 2000); };
      ws.current.onerror = () => ws.current.close();
      ws.current.onmessage = (e) => {
        try { setMessages((prev) => [...prev.slice(-500), JSON.parse(e.data)]); }
        catch (_) {}
      };
    }
    connect();
    return () => ws.current?.close();
  }, [url]);

  return { messages, connected };
}

function StatCard({ label, value, unit, color }) {
  return (
    <div style={{
      background:"#111827", border:"1px solid #1f2937", borderRadius:12,
      padding:"16px 20px", minWidth:130
    }}>
      <div style={{ fontSize:12, color:"#6b7280", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color: color || "#e2e8f0", fontVariantNumeric:"tabular-nums" }}>
        {value}<span style={{ fontSize:14, color:"#6b7280", marginLeft:4 }}>{unit}</span>
      </div>
    </div>
  );
}

function AgentCard({ id, metrics, color }) {
  const last = metrics[metrics.length - 1];
  if (!last) return null;
  const status = last.errorRate > 0.3 ? "🔴" : last.errorRate > 0.05 ? "🟡" : "🟢";
  return (
    <div style={{
      background:"#111827", border:`1px solid ${color}44`, borderRadius:10,
      padding:"12px 16px", minWidth:170
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontWeight:600, color, fontSize:14 }}>{id}</span>
        <span style={{ fontSize:12 }}>{status}</span>
      </div>
      <div style={{ fontSize:12, color:"#9ca3af", lineHeight:1.8 }}>
        <div>Latency: <b style={{ color:"#e2e8f0" }}>{last.avgLatency}ms</b></div>
        <div>Errors: <b style={{ color: last.errorRate > 0.05 ? "#f87171" : "#6ee7b7" }}>{(last.errorRate * 100).toFixed(1)}%</b></div>
        <div>Reqs: <b style={{ color:"#e2e8f0" }}>{last.reqCount}</b></div>
      </div>
    </div>
  );
}

export default function App() {
  const { messages, connected } = useWebSocket(WS_URL);
  const [agentMetrics, setAgentMetrics]   = useState({});  // { agentId: [{...}] }
  const [agentStatuses, setAgentStatuses] = useState({});
  const [testRunning, setTestRunning]     = useState(false);
  const [profile, setProfile]             = useState("ramp");
  const [agentCount, setAgentCount]       = useState(3);
  const [rps, setRps]                     = useState(10);
  const [latencyHistory, setLatencyHistory] = useState([]);  // [{ts, agent1, agent2...}]
  const [targetConfig, setTargetConfig]   = useState({ latencyBase:50, errorRate:0.02, slowZone:false });
  const [activeTab, setActiveTab]         = useState("latency");
  const tickRef = useRef(0);

  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.type === "metric") {
        const { agentId, avgLatency, errorRate, throughput, reqCount, errorCount, ts } = msg.payload;
        setAgentMetrics((prev) => {
          const hist = prev[agentId] || [];
          return { ...prev, [agentId]: [...hist.slice(-120), msg.payload] };
        });
        tickRef.current++;
        if (tickRef.current % 3 === 0) {
          setLatencyHistory((prev) => {
            const last = prev[prev.length - 1] || {};
            const entry = { ...last, ts: new Date(ts).toLocaleTimeString(), [agentId]: avgLatency };
            return [...prev.slice(-80), entry];
          });
        }
      } else if (msg.type === "agentStatus") {
        setAgentStatuses((prev) => ({ ...prev, [msg.payload.agentId]: msg.payload.status }));
      } else if (msg.type === "testStarted") {
        setTestRunning(true);
      } else if (msg.type === "testStopped") {
        setTestRunning(false);
      }
    });
  }, [messages]);

  const startTest = useCallback(async () => {
    setAgentMetrics({});
    setLatencyHistory([]);
    await fetch(`${API_URL}/test/start`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ profile, agentCount, rps })
    });
  }, [profile, agentCount, rps]);

  const stopTest = useCallback(async () => {
    await fetch(`${API_URL}/test/stop`, { method:"POST" });
  }, []);

  const applyTargetConfig = useCallback(async () => {
    await fetch(`${API_URL}/target/config`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(targetConfig)
    });
  }, [targetConfig]);

  const agentIds  = Object.keys(agentMetrics);
  const allMetrics = agentIds.flatMap((id) => agentMetrics[id] || []);
  const avgLatency = allMetrics.length
    ? Math.round(allMetrics.reduce((s, m) => s + (m.avgLatency || 0), 0) / allMetrics.length) : 0;
  const totalReqs  = agentIds.reduce((s, id) => s + (agentMetrics[id]?.slice(-1)[0]?.reqCount || 0), 0);
  const totalErrs  = agentIds.reduce((s, id) => s + (agentMetrics[id]?.slice(-1)[0]?.errorCount || 0), 0);
  const errRate    = totalReqs ? ((totalErrs / totalReqs) * 100).toFixed(1) : "0.0";

  const throughputData = agentIds.map((id, i) => ({
    name: id,
    throughput: agentMetrics[id]?.slice(-1)[0]?.throughput || 0,
    color: AGENT_COLORS[i % AGENT_COLORS.length]
  }));

  return (
    <div style={{ minHeight:"100vh", background:"#0a0d14", padding:"24px" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:"#6ee7b7", letterSpacing:"-0.03em" }}>
            ⚡ LiveGrid
          </h1>
          <p style={{ color:"#4b5563", fontSize:13, marginTop:2 }}>Distributed Load Testing Visualizer</p>
        </div>
        <div style={{
          display:"flex", alignItems:"center", gap:8, background:"#111827",
          border:"1px solid #1f2937", borderRadius:20, padding:"6px 14px", fontSize:13
        }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background: connected ? "#6ee7b7" : "#f87171" }} />
          {connected ? "Connected" : "Reconnecting..."}
        </div>
      </div>

      {/* Control Panel */}
      <div style={{
        background:"#111827", border:"1px solid #1f2937", borderRadius:14,
        padding:"20px 24px", marginBottom:24
      }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:24, alignItems:"flex-end" }}>
          {/* Profile */}
          <div>
            <label style={{ display:"block", fontSize:12, color:"#6b7280", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>Profile</label>
            <div style={{ display:"flex", gap:6 }}>
              {PROFILES.map((p) => (
                <button key={p} onClick={() => setProfile(p)} style={{
                  padding:"6px 14px", borderRadius:8, border:"1px solid",
                  borderColor: profile===p ? "#6ee7b7" : "#374151",
                  background: profile===p ? "#064e3b" : "transparent",
                  color: profile===p ? "#6ee7b7" : "#9ca3af",
                  cursor:"pointer", fontSize:13, fontWeight:500, textTransform:"capitalize"
                }}>{p}</button>
              ))}
            </div>
          </div>
          {/* Agent count */}
          <div>
            <label style={{ display:"block", fontSize:12, color:"#6b7280", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>
              Agents ({agentCount})
            </label>
            <input type="range" min={1} max={6} value={agentCount}
              onChange={(e) => setAgentCount(Number(e.target.value))}
              style={{ accentColor:"#6ee7b7", width:120 }} />
          </div>
          {/* RPS */}
          <div>
            <label style={{ display:"block", fontSize:12, color:"#6b7280", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>
              RPS ({rps})
            </label>
            <input type="range" min={1} max={50} value={rps}
              onChange={(e) => setRps(Number(e.target.value))}
              style={{ accentColor:"#6ee7b7", width:120 }} />
          </div>
          {/* Buttons */}
          <div style={{ display:"flex", gap:10, marginLeft:"auto" }}>
            <button onClick={startTest} disabled={testRunning} style={{
              padding:"10px 28px", borderRadius:10, border:"none",
              background: testRunning ? "#064e3b88" : "#6ee7b7",
              color: testRunning ? "#6ee7b7" : "#022c22",
              cursor: testRunning ? "not-allowed" : "pointer",
              fontWeight:700, fontSize:14
            }}>
              {testRunning ? "▶ Running..." : "▶ Run Test"}
            </button>
            <button onClick={stopTest} disabled={!testRunning} style={{
              padding:"10px 20px", borderRadius:10, border:"1px solid #374151",
              background:"transparent", color: testRunning ? "#f87171" : "#374151",
              cursor: testRunning ? "pointer" : "not-allowed", fontWeight:600, fontSize:14
            }}>
              ■ Stop
            </button>
          </div>
        </div>

        {/* Target chaos controls */}
        <div style={{ marginTop:20, borderTop:"1px solid #1f2937", paddingTop:16, display:"flex", flexWrap:"wrap", gap:20, alignItems:"flex-end" }}>
          <span style={{ fontSize:12, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", alignSelf:"center" }}>
            🎛 Target API chaos
          </span>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#6b7280", marginBottom:4 }}>Base Latency {targetConfig.latencyBase}ms</label>
            <input type="range" min={10} max={500} value={targetConfig.latencyBase}
              onChange={(e) => setTargetConfig((c) => ({...c, latencyBase: Number(e.target.value)}))}
              style={{ accentColor:"#fbbf24", width:110 }} />
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#6b7280", marginBottom:4 }}>Error Rate {(targetConfig.errorRate*100).toFixed(0)}%</label>
            <input type="range" min={0} max={0.5} step={0.01} value={targetConfig.errorRate}
              onChange={(e) => setTargetConfig((c) => ({...c, errorRate: Number(e.target.value)}))}
              style={{ accentColor:"#f87171", width:110 }} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input type="checkbox" id="slowzone" checked={targetConfig.slowZone}
              onChange={(e) => setTargetConfig((c) => ({...c, slowZone: e.target.checked}))}
              style={{ accentColor:"#a78bfa", width:16, height:16 }} />
            <label htmlFor="slowzone" style={{ fontSize:13, color:"#9ca3af", cursor:"pointer" }}>Slow Zone (5×)</label>
          </div>
          <button onClick={applyTargetConfig} style={{
            padding:"7px 18px", borderRadius:8, border:"1px solid #374151",
            background:"#1f2937", color:"#e2e8f0", cursor:"pointer", fontSize:13, fontWeight:600
          }}>Apply Chaos</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginBottom:24 }}>
        <StatCard label="Avg Latency"   value={avgLatency} unit="ms"  color="#6ee7b7" />
        <StatCard label="Total Requests" value={totalReqs} unit="req" color="#93c5fd" />
        <StatCard label="Total Errors"   value={totalErrs} unit=""    color="#f87171" />
        <StatCard label="Error Rate"     value={errRate}   unit="%"   color={Number(errRate)>5?"#f87171":"#6ee7b7"} />
        <StatCard label="Active Agents"  value={agentIds.length} unit="" color="#fbbf24" />
      </div>

      {/* Agent cards */}
      {agentIds.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginBottom:24 }}>
          {agentIds.map((id, i) => (
            <AgentCard key={id} id={id} metrics={agentMetrics[id] || []} color={AGENT_COLORS[i % AGENT_COLORS.length]} />
          ))}
        </div>
      )}

      {/* Chart tabs */}
      <div style={{ background:"#111827", border:"1px solid #1f2937", borderRadius:14, padding:"20px 24px" }}>
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {["latency","throughput","errors"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding:"6px 16px", borderRadius:8, border:"1px solid",
              borderColor: activeTab===tab ? "#6ee7b7" : "#374151",
              background: activeTab===tab ? "#064e3b" : "transparent",
              color: activeTab===tab ? "#6ee7b7" : "#6b7280",
              cursor:"pointer", fontSize:13, fontWeight:500, textTransform:"capitalize"
            }}>{tab}</button>
          ))}
        </div>

        {activeTab === "latency" && (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={latencyHistory}>
              <defs>
                {agentIds.map((id, i) => (
                  <linearGradient key={id} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={AGENT_COLORS[i % AGENT_COLORS.length]} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={AGENT_COLORS[i % AGENT_COLORS.length]} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tick={{ fill:"#6b7280", fontSize:11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill:"#6b7280", fontSize:11 }} unit="ms" />
              <Tooltip contentStyle={{ background:"#1f2937", border:"1px solid #374151", borderRadius:8, color:"#e2e8f0" }} />
              <Legend wrapperStyle={{ color:"#9ca3af", fontSize:12 }} />
              {agentIds.map((id, i) => (
                <Area key={id} type="monotone" dataKey={id} stroke={AGENT_COLORS[i % AGENT_COLORS.length]}
                  fill={`url(#grad-${i})`} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeTab === "throughput" && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={throughputData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill:"#6b7280", fontSize:11 }} />
              <YAxis tick={{ fill:"#6b7280", fontSize:11 }} />
              <Tooltip contentStyle={{ background:"#1f2937", border:"1px solid #374151", borderRadius:8, color:"#e2e8f0" }} />
              <Bar dataKey="throughput" radius={[6,6,0,0]}>
                {throughputData.map((entry, i) => (
                  <rect key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {activeTab === "errors" && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={latencyHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tick={{ fill:"#6b7280", fontSize:11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill:"#6b7280", fontSize:11 }} />
              <Tooltip contentStyle={{ background:"#1f2937", border:"1px solid #374151", borderRadius:8, color:"#e2e8f0" }} />
              {agentIds.map((id, i) => (
                <Line key={id} type="monotone" dataKey={`${id}_err`} stroke="#f87171"
                  strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
              {agentIds.length === 0 && (
                <text x="50%" y="50%" textAnchor="middle" fill="#6b7280">Run a test to see error rates</text>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}

        {agentIds.length === 0 && (
          <div style={{ textAlign:"center", color:"#4b5563", fontSize:15, padding:"60px 0" }}>
            Configure a test above and click <b style={{ color:"#6ee7b7" }}>Run Test</b> to see live metrics
          </div>
        )}
      </div>
    </div>
  );
}
