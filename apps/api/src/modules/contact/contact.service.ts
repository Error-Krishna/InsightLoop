import net from 'node:net';
import { logger } from '../../utils/logger.js';
import { ContactRepository } from './contact.repository.js';

export interface ContactInput {
  name?: string;
  email?: string;
  message?: string;
}

export async function sendMailSmtp(options: {
  host: string;
  port: number;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  body: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(options.port, options.host);
    socket.setEncoding('utf-8');
    let step = 0;
    let buffer = '';

    const send = (cmd: string) => {
      socket.write(cmd + '\r\n');
    };

    socket.on('data', (data) => {
      buffer += typeof data === 'string' ? data : data.toString('utf-8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const code = parseInt(line.slice(0, 3), 10);
        if (isNaN(code)) continue;
        if (line.charAt(3) === '-') continue;

        if (step === 0 && code === 220) {
          step++;
          send('EHLO localhost');
        } else if (step === 1 && code === 250) {
          step++;
          send(`MAIL FROM:<${options.from}>`);
        } else if (step === 2 && code === 250) {
          step++;
          send(`RCPT TO:<${options.to}>`);
        } else if (step === 3 && code === 250) {
          step++;
          send('DATA');
        } else if (step === 4 && code === 354) {
          step++;
          const headers = [
            `From: ${options.from}`,
            `To: ${options.to}`,
            options.replyTo ? `Reply-To: ${options.replyTo}` : '',
            `Subject: ${options.subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            options.body,
            '.',
          ].filter((h, i) => i === 5 || h.length > 0).join('\r\n');
          send(headers);
        } else if (step === 5 && code === 250) {
          step++;
          send('QUIT');
        } else if (step === 6 && code === 221) {
          socket.end();
          resolve();
        } else if (code >= 400) {
          socket.destroy();
          reject(new Error(`SMTP error ${code}: ${line}`));
        }
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.on('close', () => {
      if (step >= 5) resolve();
      else reject(new Error('SMTP socket closed prematurely'));
    });
  });
}

export class ContactService {
  static async submitMessage(data: ContactInput): Promise<{ status: string }> {
    await ContactRepository.insertMessage({
      name: data.name ?? '',
      email: data.email ?? '',
      message: data.message ?? '',
      created_at: new Date(),
    });

    const emailHost = process.env.EMAIL_HOST;
    const emailPort = parseInt(process.env.EMAIL_PORT || '587', 10);
    const defaultFrom = process.env.DEFAULT_FROM_EMAIL || 'noreply@localhost';
    const adminEmail = process.env.ADMIN_EMAIL || defaultFrom;

    if (emailHost) {
      try {
        await sendMailSmtp({
          host: emailHost,
          port: emailPort,
          from: defaultFrom,
          to: adminEmail,
          replyTo: data.email,
          subject: 'New Contact Message',
          body: `Name: ${data.name ?? ''}\nEmail: ${data.email ?? ''}\n\nMessage:\n${data.message ?? ''}`,
        });
      } catch (err) {
        // SILENT-FALLBACK-REASON: Failure in background SMTP delivery must not abort contact form receipt acknowledgment
        logger.warn({ err }, 'Contact form background email notification failed to send');
      }
    }

    return { status: 'ok' };
  }
}
