import { ValidationError } from '../../utils/errors.js';
import { BillPdfService } from './pdf.service.js';
import { type BillDoc } from './bills.repository.js';
import { type CompanyPdfContext } from './pdf.service.js';

export class WhatsAppNotConfigured extends ValidationError {
  override name = 'WhatsAppNotConfigured';
  constructor(message?: string) {
    super(
      message ||
        'WhatsApp sharing is not configured yet. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN (and WHATSAPP_BUSINESS_ACCOUNT_ID) in your environment with real Meta credentials to enable this feature.'
    );
  }
}

export class WhatsAppSendError extends ValidationError {
  override name = 'WhatsAppSendError';
}

export class OpenWANotConfigured extends ValidationError {
  override name = 'OpenWANotConfigured';
  constructor(message?: string) {
    super(
      message ||
        'OpenWA sharing is not configured yet. Set OPENWA_BASE_URL and OPENWA_API_KEY in your environment.'
    );
  }
}

export class OpenWASendError extends ValidationError {
  override name = 'OpenWASendError';
}

export function normalizePhoneNumber(rawPhone?: string | null): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1);
  if (digits.length === 10) return '91' + digits;
  return digits;
}

export class WhatsAppService {
  static async shareBillPdf(
    bill: BillDoc,
    company: CompanyPdfContext,
    targetPhone?: string | null
  ): Promise<{ detail: string; whatsapp_response: unknown }> {
    const rawPhone = targetPhone || bill.buyer?.phone;
    if (!rawPhone?.trim()) {
      throw new ValidationError("No phone number on file for this bill's customer. Add one and try again.");
    }

    const phone = normalizePhoneNumber(rawPhone);
    const pdfBytes = await BillPdfService.renderBillPdf(bill, company);

    const provider = process.env.WHATSAPP_PROVIDER || 'meta';

    if (provider === 'openwa') {
      const apiKey = process.env.OPENWA_API_KEY;
      const baseUrl = process.env.OPENWA_BASE_URL;
      if (!apiKey || !baseUrl) {
        throw new OpenWANotConfigured();
      }

      // If configured, attempt OpenWA send
      try {
        const sessionRes = await fetch(`${baseUrl}/api/sessions`, {
          headers: { 'x-api-key': apiKey },
        });
        if (!sessionRes.ok) {
          throw new OpenWASendError(`OpenWA session query failed: ${sessionRes.statusText}`);
        }
        const sessions = (await sessionRes.json()) as { id: string; status: string }[];
        const activeSession = sessions.find((s) => s.status === 'ready') || sessions[0];
        if (!activeSession) {
          throw new OpenWASendError('No active OpenWA session found.');
        }

        const sendRes = await fetch(`${baseUrl}/api/sessions/${activeSession.id}/messages/send-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            chatId: `${phone}@c.us`,
            base64: pdfBytes.toString('base64'),
            filename: `${bill.invoice_number || 'invoice'}.pdf`,
            mimetype: 'application/pdf',
          }),
        });

        if (!sendRes.ok) {
          throw new OpenWASendError(`OpenWA send failed: ${sendRes.statusText}`);
        }
        const result = await sendRes.json();
        return { detail: 'Bill sent via WhatsApp.', whatsapp_response: result };
      } catch (err: unknown) {
        if (err instanceof ValidationError) throw err;
        throw new OpenWASendError(`Failed to send via OpenWA: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Default: Meta Cloud API
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const isEnabled = process.env.WHATSAPP_ENABLED === 'true';

    if (!isEnabled || !phoneNumberId || !accessToken) {
      throw new WhatsAppNotConfigured();
    }

    try {
      const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
      const templateName = process.env.WHATSAPP_BILL_TEMPLATE_NAME || 'bill_share';

      // 1. Upload media
      const mediaFormData = new FormData();
      mediaFormData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `${bill.invoice_number || 'invoice'}.pdf`);
      mediaFormData.append('messaging_product', 'whatsapp');
      mediaFormData.append('type', 'application/pdf');

      const uploadRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: mediaFormData,
      });

      if (!uploadRes.ok) {
        throw new WhatsAppSendError(`Failed to upload media to WhatsApp: ${uploadRes.statusText}`);
      }
      const { id: mediaId } = (await uploadRes.json()) as { id: string };

      // 2. Send template message
      const sendRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'header',
                parameters: [{ type: 'document', document: { id: mediaId, filename: `${bill.invoice_number || 'invoice'}.pdf` } }],
              },
              {
                type: 'body',
                parameters: [{ type: 'text', text: bill.invoice_number || 'invoice' }],
              },
            ],
          },
        }),
      });

      if (!sendRes.ok) {
        throw new WhatsAppSendError(`Failed to send WhatsApp message: ${sendRes.statusText}`);
      }
      const sendData = await sendRes.json();
      return { detail: 'Bill sent via WhatsApp.', whatsapp_response: sendData };
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      throw new WhatsAppSendError(`WhatsApp error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
