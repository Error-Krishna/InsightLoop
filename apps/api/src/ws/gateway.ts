import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { URL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { getCollection } from '../db/mongo.js';
import { AiService } from '../modules/ai/ai.service.js';
import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const wsEvents = new EventEmitter();

export function setupWebSocketGateway(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      if (pathname.startsWith('/ws/dashboard/') || pathname.startsWith('/ws/ai-assistant/')) {
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request) => {
    const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. DASHBOARD CONSUMER: /ws/dashboard/:companyId/
    if (pathname.startsWith('/ws/dashboard/')) {
      const token = parsedUrl.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Authentication token required');
        return;
      }

      let email = '';
      try {
        const payload = verifyAccessToken(token);
        email = payload.email;
      } catch {
        ws.close(4001, 'Invalid or expired token');
        return;
      }

      const usersCol = getCollection('user');
      const user = await usersCol.findOne({ email });
      if (!user) {
        ws.close(4001, 'User not found');
        return;
      }

      const companyId = user.company?.company_id || user.company_id || '';
      if (!companyId) {
        ws.close(4001, 'No company associated with user');
        return;
      }

      // Initial snapshot
      try {
        const data = await DashboardService.getDashboardData(companyId);
        ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('Failed to send initial dashboard snapshot:', err);
      }

      // Live update listener
      const onUpdate = (event: { companyId: string; data?: any }) => {
        if (event.companyId === companyId && ws.readyState === WebSocket.OPEN) {
          if (event.data) {
            ws.send(JSON.stringify({ data: event.data }));
          } else {
            DashboardService.getDashboardData(companyId)
              .then(freshData => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ data: freshData }));
                }
              })
              .catch(() => {});
          }
        }
      };

      wsEvents.on('dashboard.update', onUpdate);
      ws.on('close', () => {
        wsEvents.off('dashboard.update', onUpdate);
      });
      return;
    }

    // 2. AI ASSISTANT CONSUMER: /ws/ai-assistant/
    if (pathname.startsWith('/ws/ai-assistant/')) {
      let authenticated = false;
      let companyId = '';
      let userEmail = '';

      const tokenParam = parsedUrl.searchParams.get('token');
      if (tokenParam) {
        try {
          const payload = verifyAccessToken(tokenParam);
          authenticated = true;
          companyId = payload.company_id || '';
          userEmail = payload.email || '';
        } catch {
          authenticated = false;
        }
      }

      // Status frame
      ws.send(
        JSON.stringify({
          type: 'session_status',
          authenticated,
          message: 'Connected to AI Assistant',
        })
      );

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Handle first-message auth if unauthenticated
          if (!authenticated) {
            if (msg.token) {
              try {
                const payload = verifyAccessToken(msg.token);
                authenticated = true;
                companyId = payload.company_id || '';
                userEmail = payload.email || '';
                ws.send(
                  JSON.stringify({
                    type: 'session_status',
                    authenticated: true,
                  })
                );
                return;
              } catch {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    content: 'Invalid or expired token.',
                  })
                );
                ws.close(4001, 'Invalid or expired token');
                return;
              }
            } else {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  content: 'Authentication required.',
                })
              );
              return;
            }
          }

          // Process AI Command (DEC-03: Scoped to requesting socket)
          const command = msg.command || '';
          const assistant = msg.assistant || 'jarvis';
          const response = await AiService.processAiCommand(companyId, userEmail, command, assistant);
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          ws.send(
            JSON.stringify({
              action: 'error',
              content: `Error processing message: ${err.message || String(err)}`,
            })
          );
        }
      });
    }
  });

  return wss;
}
