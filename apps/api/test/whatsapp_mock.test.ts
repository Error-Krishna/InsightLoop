import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { WhatsAppService, WhatsAppNotConfigured, OpenWANotConfigured, normalizePhoneNumber } from '../src/modules/bills/whatsapp.service.js';
import { type BillDoc } from '../src/modules/bills/bills.repository.js';
import { type CompanyPdfContext } from '../src/modules/bills/pdf.service.js';
import { ValidationError } from '../src/utils/errors.js';

describe('WhatsApp Integration Service Parity with Django', () => {
  let mockServer: http.Server;
  let serverPort: number;
  let receivedRequests: { url: string; method: string; headers: http.IncomingHttpHeaders; body?: string }[] = [];

  const company: CompanyPdfContext = {
    name: 'InsightLoop Engineering Works',
    address: '100 Feet Road, Indiranagar, Bengaluru 560038',
    bank_account_number: '50100012345678',
    ifsc_code: 'HDFC0001234',
  };

  const sampleBill = {
    bill_type: 'pakka',
    invoice_number: 'INV-2026-00001',
    created_at: new Date(2026, 9, 15),
    buyer: {
      name: 'Acme Industrial',
      phone: '9876543210',
    },
    products: [{ name: 'Bolt', quantity: 10, unit: 'pcs', rate: 10, total: 100 }],
    subtotal: 100,
    grand_total: 100,
  } as unknown as BillDoc;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({
          url: req.url || '',
          method: req.method || 'GET',
          headers: req.headers,
          body: data,
        });

        // Mock OpenWA endpoints
        if (req.url === '/api/sessions') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ id: 'mock-session-123', status: 'ready' }]));
          return;
        }
        if (req.url === '/api/sessions/mock-session-123/messages/send-document') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'sent', messageId: 'openwa-msg-1' }));
          return;
        }

        // Mock Meta endpoints
        if (req.url?.includes('/media')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'meta-media-id-999' }));
          return;
        }
        if (req.url?.includes('/messages')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ messages: [{ id: 'meta-msg-id-888' }] }));
          return;
        }

        res.writeHead(404);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  it('normalizes Indian phone numbers correctly', () => {
    expect(normalizePhoneNumber('9876543210')).toBe('919876543210');
    expect(normalizePhoneNumber('+919876543210')).toBe('919876543210');
    expect(normalizePhoneNumber('09876543210')).toBe('919876543210');
    expect(normalizePhoneNumber('919876543210')).toBe('919876543210');
    expect(normalizePhoneNumber('')).toBe('');
    expect(normalizePhoneNumber(null)).toBe('');
  });

  it('rejects with 400 validation error when buyer has no phone number', async () => {
    const billNoPhone = {
      ...sampleBill,
      buyer: { name: 'No Phone Buyer' },
    } as unknown as BillDoc;

    await expect(WhatsAppService.shareBillPdf(billNoPhone, company)).rejects.toThrow(
      "No phone number on file for this bill's customer. Add one and try again."
    );
  });

  it('throws exact Django unconfigured error message when Meta credentials missing', async () => {
    const oldEnv = { ...process.env };
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_ENABLED = 'false';

    try {
      await expect(WhatsAppService.shareBillPdf(sampleBill, company)).rejects.toThrow(WhatsAppNotConfigured);
      await expect(WhatsAppService.shareBillPdf(sampleBill, company)).rejects.toThrow(
        'WhatsApp sharing is not configured yet. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN'
      );
    } finally {
      process.env = oldEnv;
    }
  });

  it('throws exact Django unconfigured error message when OpenWA credentials missing', async () => {
    const oldEnv = { ...process.env };
    process.env.WHATSAPP_PROVIDER = 'openwa';
    delete process.env.OPENWA_API_KEY;
    delete process.env.OPENWA_BASE_URL;

    try {
      await expect(WhatsAppService.shareBillPdf(sampleBill, company)).rejects.toThrow(OpenWANotConfigured);
      await expect(WhatsAppService.shareBillPdf(sampleBill, company)).rejects.toThrow('OpenWA is not configured');
    } finally {
      process.env = oldEnv;
    }
  });

  it('successfully dispatches via OpenWA to local mock server', async () => {
    const oldEnv = { ...process.env };
    receivedRequests = [];
    process.env.WHATSAPP_PROVIDER = 'openwa';
    process.env.OPENWA_BASE_URL = `http://127.0.0.1:${serverPort}`;
    process.env.OPENWA_API_KEY = 'test-openwa-secret-key';

    try {
      const res = await WhatsAppService.shareBillPdf(sampleBill, company);
      expect(res.detail).toBe('Bill sent via WhatsApp.');
      expect(res.whatsapp_response).toEqual({ status: 'sent', messageId: 'openwa-msg-1' });

      // Verify server received session query and document send
      expect(receivedRequests.length).toBe(2);
      expect(receivedRequests[0].url).toBe('/api/sessions');
      expect(receivedRequests[0].headers['x-api-key']).toBe('test-openwa-secret-key');
      expect(receivedRequests[1].url).toBe('/api/sessions/mock-session-123/messages/send-document');

      const body = JSON.parse(receivedRequests[1].body || '{}');
      expect(body.chatId).toBe('919876543210@c.us');
      expect(body.filename).toBe('INV-2026-00001.pdf');
      expect(body.mimetype).toBe('application/pdf');
      expect(body.base64).toBeDefined();
    } finally {
      process.env = oldEnv;
    }
  });
});
