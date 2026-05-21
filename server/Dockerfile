FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Copy agent script so server can spawn it
COPY ../agents/agent.js /agents/agent.js
EXPOSE 3001 3002
CMD ["node", "index.js"]
