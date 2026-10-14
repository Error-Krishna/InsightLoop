import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './db/mongo.js';
import { setupWebSocketGateway } from './ws/gateway.js';

const server = http.createServer(app);

// Attach WebSocket gateway
setupWebSocketGateway(server);

async function start() {
  await connectMongo();
  server.listen(env.PORT, env.HOST, () => {
    console.log(`InsightLoop Node API listening on http://${env.HOST}:${env.PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start Node API server:', err);
  process.exit(1);
});

export { server };
