#!/bin/bash
# ============================================================
# LiveGrid — EC2 Setup Script
# Run once on a fresh Amazon Linux 2023 / Ubuntu 22.04 t2.micro
# Usage: bash setup-ec2.sh
# ============================================================

set -e
echo "🚀 Setting up LiveGrid on EC2..."

# ── 1. System update ─────────────────────────────────────────
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Install Docker ────────────────────────────────────────
sudo apt-get install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# ── 3. Install Docker Compose (standalone) ───────────────────
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# ── 4. Install Java (required by Jenkins) ────────────────────
sudo apt-get install -y fontconfig openjdk-17-jre

# ── 5. Install Jenkins ───────────────────────────────────────
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y jenkins
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo usermod -aG docker jenkins

# ── 6. Install Git ───────────────────────────────────────────
sudo apt-get install -y git

# ── 7. Open ports reminder ───────────────────────────────────
echo ""
echo "============================================================"
echo "✅ Setup complete! Ports to open in EC2 Security Group:"
echo "   - 22    (SSH)"
echo "   - 8080  (Jenkins UI)"
echo "   - 3000  (LiveGrid Dashboard)"
echo "   - 3001  (WebSocket server)"
echo "   - 3002  (REST API)"
echo "   - 4000  (Target API)"
echo ""
echo "Jenkins initial password:"
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
echo ""
echo "============================================================"
echo "Next: git clone your repo into /home/ubuntu/livegrid"
echo "Then: cd livegrid && docker-compose up -d"
echo "============================================================"
