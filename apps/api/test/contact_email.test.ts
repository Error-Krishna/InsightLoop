import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SMTPServer } from 'smtp-server';
import { ContactService, sendMailSmtp } from '../src/modules/contact/contact.service.js';
import { ContactRepository } from '../src/modules/contact/contact.repository.js';
import { setupTestDb, teardownTestDb, getDb } from './testHelper.js';

describe('Contact Email Nodemailer & SMTP Parity Suite', () => {
  let smtpServer: SMTPServer;
  let smtpPort: number;
  const receivedMails: {
    envelope: unknown;
    headers: Map<string, string>;
    raw: string;
  }[] = [];

  const validUser = 'mailer@example.com';
  const validPass = 'smtpSecretPassword123';

  beforeAll(async () => {
    await setupTestDb();
    smtpServer = new SMTPServer({
      secure: false, // port uses STARTTLS
      authOptional: false,
      onAuth(auth, _session, callback) {
        if (auth.username === validUser && auth.password === validPass) {
          callback(null, { user: auth.username });
        } else {
          callback(new Error('Invalid username or password'));
        }
      },
      onData(stream, session, callback) {
        let raw = '';
        stream.on('data', (chunk) => {
          raw += chunk;
        });
        stream.on('end', () => {
          const headers = new Map<string, string>();
          const headerSection = raw.split('\r\n\r\n')[0] || '';
          for (const line of headerSection.split('\r\n')) {
            const idx = line.indexOf(':');
            if (idx > 0) {
              const k = line.slice(0, idx).trim().toLowerCase();
              const v = line.slice(idx + 1).trim();
              headers.set(k, v);
            }
          }
          receivedMails.push({ envelope: session.envelope, headers, raw });
          callback(null);
        });
      },
    });

    await new Promise<void>((resolve) => {
      smtpServer.listen(0, '127.0.0.1', () => {
        const addr = (smtpServer as unknown as { server: { address: () => { port: number } } }).server.address();
        smtpPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      smtpServer.close(() => resolve());
    });
    await teardownTestDb();
  });

  beforeEach(async () => {
    receivedMails.length = 0;
    const db = getDb();
    await db.collection('contact_message').deleteMany({});
  });

  it('sends contact email successfully over STARTTLS with auth and saves to MongoDB', async () => {
    const oldEnv = { ...process.env };
    process.env.EMAIL_HOST = '127.0.0.1';
    process.env.EMAIL_PORT = String(smtpPort);
    process.env.EMAIL_USE_TLS = 'true';
    process.env.EMAIL_HOST_USER = validUser;
    process.env.EMAIL_HOST_PASSWORD = validPass;
    process.env.DEFAULT_FROM_EMAIL = 'noreply@insightloop.io';
    process.env.ADMIN_EMAIL = 'admin@insightloop.io';

    try {
      const result = await ContactService.submitMessage({
        name: 'Aarav Patel',
        email: 'aarav@textiles-ltd.in',
        message: 'Requesting live demo for textile ERP billing module.',
      });

      expect(result).toEqual({ status: 'ok' });

      // Verify MongoDB persistence
      const messages = await ContactRepository.findRecentMessages(10);
      expect(messages.length).toBe(1);
      expect(messages[0].name).toBe('Aarav Patel');
      expect(messages[0].email).toBe('aarav@textiles-ltd.in');
      expect(messages[0].message).toBe('Requesting live demo for textile ERP billing module.');

      // Verify SMTP receipt
      expect(receivedMails.length).toBe(1);
      const mail = receivedMails[0];
      expect(mail.headers.get('subject')).toBe('New Contact Message');
      expect(mail.headers.get('from')).toBe('noreply@insightloop.io');
      expect(mail.headers.get('to')).toBe('admin@insightloop.io');
      expect(mail.headers.get('reply-to')).toBe('aarav@textiles-ltd.in');

      // Verify body format matches Django's: "Name: {name}\nEmail: {email}\n\nMessage:\n{message}"
      expect(mail.raw).toContain('Name: Aarav Patel');
      expect(mail.raw).toContain('Email: aarav@textiles-ltd.in');
      expect(mail.raw).toContain('Message:\r\nRequesting live demo for textile ERP billing module.');
    } finally {
      process.env = oldEnv;
    }
  });

  it('handles wrong SMTP password gracefully: persists to DB and returns { status: "ok" } without throwing', async () => {
    const oldEnv = { ...process.env };
    process.env.EMAIL_HOST = '127.0.0.1';
    process.env.EMAIL_PORT = String(smtpPort);
    process.env.EMAIL_USE_TLS = 'true';
    process.env.EMAIL_HOST_USER = validUser;
    process.env.EMAIL_HOST_PASSWORD = 'WRONG_PASSWORD_XYZ';

    try {
      const result = await ContactService.submitMessage({
        name: 'Kavita Rao',
        email: 'kavita@rao-mills.com',
        message: 'Inquiring about bulk discount calculations.',
      });

      expect(result).toEqual({ status: 'ok' });

      // MongoDB still saved the message
      const messages = await ContactRepository.findRecentMessages(10);
      expect(messages.length).toBe(1);
      expect(messages[0].name).toBe('Kavita Rao');

      // No email delivered due to auth failure
      expect(receivedMails.length).toBe(0);
    } finally {
      process.env = oldEnv;
    }
  });

  it('handles SMTP server down: persists to DB and returns { status: "ok" } without crashing', async () => {
    const oldEnv = { ...process.env };
    process.env.EMAIL_HOST = '127.0.0.1';
    process.env.EMAIL_PORT = '65530'; // Unused port where nothing is listening
    process.env.EMAIL_USE_TLS = 'true';

    try {
      const result = await ContactService.submitMessage({
        name: 'Rohan Sharma',
        email: 'rohan@sharma-exports.in',
        message: 'Checking piece-rate wage calculation accuracy.',
      });

      expect(result).toEqual({ status: 'ok' });

      // MongoDB still saved the message
      const messages = await ContactRepository.findRecentMessages(10);
      expect(messages.length).toBe(1);
      expect(messages[0].name).toBe('Rohan Sharma');
    } finally {
      process.env = oldEnv;
    }
  });

  it('direct sendMailSmtp helper sends valid MIME format', async () => {
    await sendMailSmtp({
      host: '127.0.0.1',
      port: smtpPort,
      useTls: true,
      user: validUser,
      pass: validPass,
      from: 'alerts@insightloop.io',
      to: 'ops@insightloop.io',
      replyTo: 'support@insightloop.io',
      subject: 'Custom Subject',
      body: 'Custom Body Text',
    });

    expect(receivedMails.length).toBe(1);
    const mail = receivedMails[0];
    expect(mail.headers.get('subject')).toBe('Custom Subject');
    expect(mail.headers.get('from')).toBe('alerts@insightloop.io');
    expect(mail.headers.get('to')).toBe('ops@insightloop.io');
    expect(mail.headers.get('reply-to')).toBe('support@insightloop.io');
    expect(mail.raw).toContain('Custom Body Text');
  });
});
