import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
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
  useTls?: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  body: string;
}): Promise<void> {
  const isSecure = options.port === 465;
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: isSecure,
    requireTLS: options.useTls !== false && !isSecure,
    auth: (options.user && options.pass) ? {
      user: options.user,
      pass: options.pass,
    } : undefined,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  await transporter.sendMail({
    from: options.from,
    to: options.to,
    replyTo: options.replyTo,
    subject: options.subject,
    text: options.body,
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

    const emailHost = process.env.EMAIL_HOST || env.EMAIL_HOST;
    const emailPort = parseInt(process.env.EMAIL_PORT || String(env.EMAIL_PORT), 10);
    const emailUseTls = process.env.EMAIL_USE_TLS !== undefined
      ? process.env.EMAIL_USE_TLS === 'true'
      : env.EMAIL_USE_TLS;
    const emailUser = process.env.EMAIL_HOST_USER || env.EMAIL_HOST_USER;
    const emailPass = process.env.EMAIL_HOST_PASSWORD || env.EMAIL_HOST_PASSWORD;
    const defaultFrom = process.env.DEFAULT_FROM_EMAIL || env.DEFAULT_FROM_EMAIL || 'noreply@insightloop.io';
    const adminEmail = process.env.ADMIN_EMAIL || env.ADMIN_EMAIL || defaultFrom;

    if (emailHost) {
      try {
        await sendMailSmtp({
          host: emailHost,
          port: emailPort,
          useTls: emailUseTls,
          user: emailUser,
          pass: emailPass,
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

