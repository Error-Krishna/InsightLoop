import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { URL } from 'node:url';
import { ObjectId } from 'mongodb';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthRepository } from '../modules/auth/auth.repository.js';
import { AiService } from '../modules/ai/ai.service.js';
import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
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
        const authHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
        const token =
          parsedUrl.searchParams.get('token') ||
          (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

        if (!token) {
          ws.close(4001, 'Authentication token required');
          return;
        }

        let email: string;
        try {
          const payload = verifyAccessToken(token);
          email = payload.email;
        } catch {
          // Django closes 4001 for all token errors (expired or invalid)
          ws.close(4001, 'Invalid or expired token');
          return;
        }

        const user = await AuthRepository.findUserByEmail(email);
        if (!user) {
          ws.close(4001, 'User not found');
          return;
        }

        let companyId = '';
        if (user.company) {
          const companyQuery = ObjectId.isValid(user.company)
            ? { _id: new ObjectId(user.company) }
            : { company_id: String(user.company) };
          const company = await AuthRepository.findCompany(companyQuery);
          companyId = company?.company_id ?? '';
        }
        if (!companyId && user.company_id) {
          companyId = String(user.company_id);
        }

        if (!companyId) {
          ws.close(4001, 'No company associated with user');
          return;
        }

        // Cross-company verification: check URL companyId against resolved companyId
        const match = /^\/ws\/dashboard\/([^/]+)\/?$/.exec(pathname);
        if (match?.[1] && match[1] !== companyId) {
          ws.close(4001, 'Cross-company dashboard access forbidden');
          return;
        }

        const scope: TenantScope = { companyId };

        // Initial snapshot
        try {
          const data = await DashboardService.getDashboardData(scope);
          ws.send(JSON.stringify(data));
        } catch (err) {
          logger.error({ err }, 'Failed to send initial dashboard snapshot');
        }

        // Live update listener (sending data directly matching Django)
        const onUpdate = (event: { companyId: string; data?: unknown }) => {
          if (event.companyId === companyId && ws.readyState === WebSocket.OPEN) {
            if (event.data) {
              ws.send(JSON.stringify(event.data));
            } else {
              DashboardService.getDashboardData(scope)
                .then((freshData) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(freshData));
                  }
                })
                .catch((_err: unknown) => {
                  // SILENT-FALLBACK-REASON: Live dashboard update drop handled on next broadcast
                });
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

        const authHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
        const tokenParam =
          parsedUrl.searchParams.get('token') ||
          (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

        if (tokenParam) {
          try {
            const payload = verifyAccessToken(tokenParam);
            const user = await AuthRepository.findUserByEmail(payload.email);
            if (!user) {
              ws.close(4001, 'User not found or deleted');
              return;
            }

            let compId = '';
            if (user.company) {
              const companyQuery = ObjectId.isValid(user.company)
                ? { _id: new ObjectId(user.company) }
                : { company_id: String(user.company) };
              const company = await AuthRepository.findCompany(companyQuery);
              compId = company?.company_id ?? '';
            }
            if (!compId && user.company_id) {
              compId = String(user.company_id);
            }

            if (!compId) {
              ws.close(4001, 'No company associated with user');
              return;
            }

            authenticated = true;
            companyId = compId;
            userEmail = user.email;
          } catch {
            ws.close(4001, 'Invalid or expired token');
            return;
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
                    const user = await AuthRepository.findUserByEmail(payload.email);
                    if (!user) {
                      ws.send(JSON.stringify({ type: 'error', content: 'User not found or deactivated.' }));
                      ws.close(4001, 'User deactivated');
                      return;
                    }

                    let compId = '';
                    if (user.company) {
                      const companyQuery = ObjectId.isValid(user.company)
                        ? { _id: new ObjectId(user.company) }
                        : { company_id: String(user.company) };
                      const company = await AuthRepository.findCompany(companyQuery);
                      compId = company?.company_id ?? '';
                    }
                    if (!compId && user.company_id) {
                      compId = String(user.company_id);
                    }

                    if (!compId) {
                      ws.send(JSON.stringify({ type: 'error', content: 'No company associated with user.' }));
                      ws.close(4001, 'No company');
                      return;
                    }

                    authenticated = true;
                    companyId = compId;
                    userEmail = user.email;
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

              // Tenancy Check: Live verification before command processing
              const liveUser = await AuthRepository.findUserByEmail(userEmail);
              if (!liveUser) {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    action: 'error',
                    content: 'User account has been deactivated.',
                  })
                );
                ws.close(4001, 'User revoked');
                return;
              }

              // Process AI Command (Scoped to requesting socket)
              const command = msg.command ?? '';
              const assistant = msg.assistant ?? 'jarvis';
              const scope: TenantScope = { companyId };
              const response = await AiService.processAiCommand(scope, userEmail, command, assistant);
              ws.send(JSON.stringify(response));
            } catch {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  action: 'error',
                  content: 'Error processing your request: An unexpected error occurred while processing your command.',
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
