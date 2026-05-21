# ⚡ LiveGrid — Distributed Load Testing Visualizer

Watch your API break in real-time, before production does.

A full-stack load testing tool with a live dashboard, WebSocket-powered metrics, containerized agents, and Jenkins CI/CD — all runnable on a free AWS EC2 t2.micro.

---

## 🗂 Project Structure

```
livegrid/
├── dashboard/          # React + Recharts frontend (Vite)
├── server/             # Node.js WebSocket + REST orchestrator
├── agents/             # Load agent script (runs per container)
├── target-api/         # Express dummy API (the thing being tested)
├── jenkins/            # Jenkinsfile reference copy
├── docker-compose.yml          # Production (all services in Docker)
├── docker-compose.dev.yml      # Dev (dashboard runs via Vite)
├── Jenkinsfile                  # CI/CD pipeline
└── setup-ec2.sh                # One-time EC2 setup script
```

---

## 🚀 Option A — Run Locally (Fastest, ~5 minutes)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/livegrid.git
cd livegrid

# 2. Start everything with Docker Compose
docker compose up --build

# 3. Open the dashboard
open http://localhost:3000
```

That's it. All four services start together:
| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| WebSocket server | ws://localhost:3001 |
| REST API | http://localhost:3002 |
| Target API | http://localhost:4000 |

### To stop
```bash
docker compose down
```

---

## 💻 Option B — Local Dev Mode (Hot reload)

Run the dashboard with Vite (instant hot reload) and the backend in Docker.

```bash
# Terminal 1 — start backend services
docker compose -f docker-compose.dev.yml up --build

# Terminal 2 — start frontend with hot reload
cd dashboard
npm install
npm run dev
# open http://localhost:5173
```

---

## ☁️ Option C — Deploy on AWS EC2 (Free Tier)

### Step 1 — Create EC2 instance
1. Go to AWS Console → EC2 → Launch Instance
2. Choose **Ubuntu 22.04 LTS** (free tier eligible)
3. Instance type: **t2.micro** (free tier)
4. Create a key pair, download the `.pem` file
5. Security Group — open these inbound ports:
   - 22 (SSH)
   - 8080 (Jenkins)
   - 3000 (Dashboard)
   - 3001 (WebSocket)
   - 3002 (REST API)
   - 4000 (Target API)
6. Launch the instance
7. Allocate an **Elastic IP** and associate it (so the IP doesn't change on restart)

### Step 2 — SSH into EC2 and setup
```bash
# SSH in
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# Run the setup script (installs Docker, Jenkins, Git)
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/livegrid/main/setup-ec2.sh | bash

# Log out and back in so docker group takes effect
exit
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### Step 3 — Clone and run
```bash
git clone https://github.com/YOUR_USERNAME/livegrid.git
cd livegrid

# Set your EC2 IP in dashboard env
echo "VITE_WS_URL=ws://YOUR_EC2_IP:3001" > dashboard/.env
echo "VITE_API_URL=http://YOUR_EC2_IP:3002" >> dashboard/.env

docker compose up --build -d
```

### Step 4 — Open dashboard
```
http://YOUR_EC2_IP:3000
```

---

## 🔧 Set Up Jenkins CI/CD

1. Open `http://YOUR_EC2_IP:8080`
2. Get initial password: `sudo cat /var/lib/jenkins/secrets/initialAdminPassword`
3. Install suggested plugins
4. Create admin user
5. New Item → Pipeline → name it `livegrid`
6. Under Pipeline: select **Pipeline script from SCM**
7. SCM: Git → your repo URL
8. Script path: `Jenkinsfile`
9. Save → Build Now

From now on, every push to your GitHub repo can trigger Jenkins to rebuild and redeploy automatically (add a GitHub webhook pointing to `http://YOUR_EC2_IP:8080/github-webhook/`).

---

## 🎮 Using the Dashboard

1. **Choose a profile**
   - `ramp` — agents spin up one by one (great for showing auto-scale visually)
   - `spike` — all agents start simultaneously
   - `soak` — single agent, sustained load

2. **Set agent count** (1–6) and **RPS** per agent

3. **Click Run Test** — watch the latency heatmap light up per agent

4. **Apply Chaos** — mid-test, crank up base latency, error rate, or enable Slow Zone to see the dashboard react in real time

5. **Stop Test** — kills all agent containers

---

## 🏗 Architecture (what's actually happening)

```
Browser (React dashboard)
    ↕ WebSocket (ws://server:3001)   ← live metric stream
    ↕ REST (http://server:3002)      ← start/stop/config

Node.js Orchestrator (server)
    ↳ spawn("node agent.js") × N     ← one process per agent
         ↳ fires HTTP → target-api:4000
         ↳ stdout → JSON metrics → WebSocket broadcast

Target API (Express)
    ← configurable latency, errors, slow zone
```

On EC2, each "agent" is a Node.js child process. In a real AWS setup, these would be separate EC2 instances in an Auto Scaling Group — the architecture is identical, just the process boundary changes.

---

## 🧪 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Recharts |
| WebSocket server | Node.js, `ws` |
| Load agents | Node.js, `node-fetch` |
| Target API | Express |
| Containers | Docker, Docker Compose |
| CI/CD | Jenkins (Pipeline) |
| Hosting | AWS EC2 t2.micro (free tier) |

---

## 💡 Interview Talking Points

- "Each agent is isolated in its own process — in production this maps to separate EC2 instances in an Auto Scaling Group"
- "Metrics flow through a WebSocket pub/sub pattern — the server is the broker, agents are producers, the dashboard is the consumer"
- "The Jenkins pipeline rebuilds Docker images, runs a smoke test against the target API, and only deploys if health checks pass"
- "The chaos controls let you inject latency and errors mid-test — similar to Netflix Chaos Monkey but scoped to a single endpoint"

---

## 📝 License
MIT
