import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { URL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthRepository } from '../modules/auth/auth.repository.js';
import { AiService } from '../modules/ai/ai.service.js';
import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { verifyAccessToken } from '../utils/jwt.js';
import type { TenantScope } from '../types/tenant.js';

export const wsEvents = new EventEmitter();

let globalWss: WebSocketServer | null = null;

export function closeWebSockets(code = 1001, reason = 'Server shutting down'): void {
  if (globalWss) {
    for (const client of globalWss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close(code, reason);
      }
    }
  }
}

export function setupWebSocketGateway(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  globalWss = wss;

  server.on('upgrade', (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
      const pathname = parsedUrl.pathname;

      if (pathname.startsWith('/ws/dashboard/') || pathname.startsWith('/ws/ai-assistant/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, request) => {
    void (async () => {
      const parsedUrl = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
      const pathname = parsedUrl.pathname;

      // 1. DASHBOARD CONSUMER: /ws/dashboard/:companyId/
      if (pathname.startsWith('/ws/dashboard/')) {
        const token = parsedUrl.searchParams.get('token');
        if (!token) {
          ws.close(4001, 'Authentication token required');
          return;
        }

        let email: string;
        try {
          const payload = verifyAccessToken(token);
          email = payload.email;
        } catch (err: unknown) {
          const errStr = String(err).toLowerCase();
          if (errStr.includes('expired')) {
            ws.close(4002, 'Token expired');
          } else {
            ws.close(4001, 'Invalid token');
          }
          return;
        }

        const user = await AuthRepository.findUserByEmail(email);
        if (!user) {
          ws.close(4001, 'User not found');
          return;
        }

        const companyId = user.company_id ? String(user.company_id) : '';
        if (!companyId) {
          ws.close(4001, 'No company associated with user');
          return;
        }

        const scope: TenantScope = { companyId };

        // Initial snapshot
        try {
          const data = await DashboardService.getDashboardData(scope);
          ws.send(JSON.stringify(data));
        } catch (err) {
          console.error('Failed to send initial dashboard snapshot:', err);
        }

        // Live update listener
        const onUpdate = (event: { companyId: string; data?: unknown }) => {
          if (event.companyId === companyId && ws.readyState === WebSocket.OPEN) {
            if (event.data) {
              ws.send(JSON.stringify({ data: event.data }));
            } else {
              DashboardService.getDashboardData(scope)
                .then((freshData) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ data: freshData }));
                  }
                })
                .catch((_err: unknown) => { /* ignore */ });
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
          companyId = payload.company_id ?? '';
          userEmail = payload.email ?? '';
        } catch (err: unknown) {
          const errStr = String(err).toLowerCase();
          if (errStr.includes('expired')) {
            ws.close(4002, 'Token expired');
            return;
          }
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

      ws.on('message', (data) => {
        void (async () => {
          try {
            const msgStr = typeof data === 'string' ? data : data.toString();
            const msg = JSON.parse(msgStr) as { token?: string; command?: string; assistant?: string };

            // Handle first-message auth if unauthenticated
            if (!authenticated) {
              if (msg.token) {
                try {
                  const payload = verifyAccessToken(msg.token);
                  authenticated = true;
                  companyId = payload.company_id ?? '';
                  userEmail = payload.email ?? '';
                  ws.send(
                    JSON.stringify({
                      type: 'session_status',
                      authenticated: true,
                    })
                  );
                  return;
                } catch (err: unknown) {
                  const errStr = String(err).toLowerCase();
                  const code = errStr.includes('expired') ? 4002 : 4001;
                  ws.send(
                    JSON.stringify({
                      type: 'error',
                      content: 'Invalid or expired token.',
                    })
                  );
                  ws.close(code, 'Invalid or expired token');
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

            // Process AI Command (Scoped to requesting socket)
            const command = msg.command ?? '';
            const assistant = msg.assistant ?? 'jarvis';
            const scope: TenantScope = { companyId };
            const response = await AiService.processAiCommand(scope, userEmail, command, assistant);
            ws.send(JSON.stringify(response));
          } catch (err: unknown) {
            ws.send(
              JSON.stringify({
                action: 'error',
                content: `Error processing message: ${err instanceof Error ? err.message : String(err)}`,
              })
            );
          }
        })();
      });
    }
  })();
});

  return wss;
}
