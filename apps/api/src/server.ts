import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';

const server = http.createServer(app);

server.listen(env.PORT, env.HOST, () => {
  console.log(`InsightLoop Node API listening on http://${env.HOST}:${env.PORT}`);
});

export { server };
