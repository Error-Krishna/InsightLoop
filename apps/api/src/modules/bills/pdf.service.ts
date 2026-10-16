import PDFDocument from 'pdfkit';
import { type BillDoc } from './bills.repository.js';
import { ValidationError } from '../../utils/errors.js';

export class BillPdfRenderError extends ValidationError {
  override name = 'BillPdfRenderError';
}

export interface CompanyPdfContext {
  name?: string;
  address?: string;
  gst_number?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  stamp_url?: string;
  signature_url?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  bank_name?: string;
  branch_name?: string;
}

export class BillPdfService {
  static async renderBillPdf(bill: BillDoc, company: CompanyPdfContext = {}): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 45, compress: false });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => {
          buffers.push(chunk);
        });
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
        doc.on('error', (err) => {
          reject(new BillPdfRenderError(`Failed to generate PDF: ${err.message}`));
        });

        // Header / Company Details
        const companyName = company.name || 'Company Invoice';
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#1d4ed8').text(companyName, 45, 45);
        doc.fontSize(9).font('Helvetica').fillColor('#475569');

        let metaY = 70;
        if (company.address) {
          doc.text(company.address, 45, metaY);
          metaY += 12;
        }
        if (company.gst_number) {
          doc.text(`GSTIN: ${company.gst_number}`, 45, metaY);
          metaY += 12;
        }
        if (company.phone || company.email) {
          doc.text(`Contact: ${[company.phone, company.email].filter(Boolean).join(' | ')}`, 45, metaY);
          metaY += 12;
        }

        // Invoice Title & Details (Top Right)
        const isPakka = bill.type === 'pakka';
        const invoiceTitle = isPakka ? 'TAX INVOICE' : 'ESTIMATE / INVOICE';
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text(invoiceTitle, 350, 45, { align: 'right' });
        doc.fontSize(9).font('Helvetica').fillColor('#334155');
        doc.text(`Invoice No: ${bill.invoice_number || 'DRAFT'}`, 350, 68, { align: 'right' });
        const rawDate = (bill as { date?: string | number | Date }).date ?? bill.created_at;
        const dateStr = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        doc.text(`Date: ${dateStr}`, 350, 80, { align: 'right' });
        const rawDueDate = (bill as { due_date?: string | number | Date }).due_date;
        if (rawDueDate) {
          doc.text(`Due Date: ${new Date(rawDueDate).toISOString().slice(0, 10)}`, 350, 92, { align: 'right' });
        }
        doc.text(`Type: ${isPakka ? 'PAKKA (GST)' : 'KACHA'}`, 350, 104, { align: 'right' });

        // Divider
        doc.moveTo(45, 125).lineTo(550, 125).strokeColor('#e2e8f0').lineWidth(1).stroke();

        // Bill To section
        const buyer = bill.buyer || {};
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('BILL TO:', 45, 135);
        doc.fontSize(9).font('Helvetica').fillColor('#475569');
        let buyerY = 150;
        if (buyer.name) {
          doc.text(buyer.name, 45, buyerY);
          buyerY += 12;
        }
        if (buyer.address) {
          doc.text(buyer.address, 45, buyerY);
          buyerY += 12;
        }
        if (buyer.gst_number) {
          doc.text(`GSTIN: ${buyer.gst_number}`, 45, buyerY);
          buyerY += 12;
        }
        if (buyer.phone) {
          doc.text(`Phone: ${buyer.phone}`, 45, buyerY);
          buyerY += 12;
        }

        // Product Line Items Table
        const tableTop = Math.max(buyerY + 15, 205);
        doc.rect(45, tableTop, 505, 20).fill('#1d4ed8');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
        doc.text('#', 55, tableTop + 5);
        doc.text('Item Description', 80, tableTop + 5);
        doc.text('Qty', 330, tableTop + 5, { align: 'right', width: 40 });
        doc.text('Rate', 380, tableTop + 5, { align: 'right', width: 60 });
        doc.text('Amount', 450, tableTop + 5, { align: 'right', width: 90 });

        let itemY = tableTop + 24;
        const products = bill.products || [];
        doc.font('Helvetica').fillColor('#1e293b').fontSize(9);

        products.forEach((prod: { quantity?: unknown; rate?: unknown; name?: string; unit?: string }, idx: number) => {
          const qty = Number(prod.quantity) || 0;
          const rate = Number(prod.rate) || 0;
          const amount = Math.round(qty * rate * 100) / 100;

          if (idx % 2 === 1) {
            doc.rect(45, itemY - 2, 505, 18).fill('#f8fafc');
          }

          doc.fillColor('#1e293b');
          doc.text(String(idx + 1), 55, itemY);
          doc.text(prod.name || 'Item', 80, itemY);
          doc.text(`${qty} ${prod.unit || 'pcs'}`, 330, itemY, { align: 'right', width: 40 });
          doc.text(rate.toFixed(2), 380, itemY, { align: 'right', width: 60 });
          doc.text(amount.toFixed(2), 450, itemY, { align: 'right', width: 90 });
          itemY += 18;
        });

        // Totals Section
        doc.moveTo(45, itemY + 5).lineTo(550, itemY + 5).strokeColor('#e2e8f0').lineWidth(1).stroke();
        let totalY = itemY + 12;

        const subtotal = Number(bill.subtotal) || 0;
        const discount = Number(bill.discount_amount) || 0;
        const taxRate = Number(bill.tax_rate) || 0;
        const taxAmount = Number(bill.tax_amount) || 0;
        const total = Number(bill.total_amount) || 0;

        doc.fontSize(9).font('Helvetica').fillColor('#475569');
        doc.text('Subtotal:', 380, totalY, { align: 'right', width: 60 });
        doc.text(subtotal.toFixed(2), 450, totalY, { align: 'right', width: 90 });
        totalY += 14;

        if (discount > 0) {
          doc.text('Discount:', 380, totalY, { align: 'right', width: 60 });
          doc.text(`-${discount.toFixed(2)}`, 450, totalY, { align: 'right', width: 90 });
          totalY += 14;
        }

        if (isPakka && (taxRate > 0 || taxAmount > 0)) {
          doc.text(`GST (${taxRate}%):`, 380, totalY, { align: 'right', width: 60 });
          doc.text(taxAmount.toFixed(2), 450, totalY, { align: 'right', width: 90 });
          totalY += 14;
        }

        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
        doc.text('Total Amount:', 350, totalY, { align: 'right', width: 90 });
        doc.text(`INR ${total.toFixed(2)}`, 450, totalY, { align: 'right', width: 90 });
        totalY += 20;

        // Bank Details & Footer
        if (company.bank_account_number || company.ifsc_code) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text('Bank & Payment Details:', 45, totalY);
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569');
          totalY += 12;
          if (company.bank_name) {
            doc.text(`Bank: ${company.bank_name}`, 45, totalY);
            totalY += 10;
          }
          if (company.bank_account_number) {
            doc.text(`Account No: ${company.bank_account_number}`, 45, totalY);
            totalY += 10;
          }
          if (company.ifsc_code) {
            doc.text(`IFSC: ${company.ifsc_code}`, 45, totalY);
            totalY += 10;
          }
          if (company.branch_name) {
            doc.text(`Branch: ${company.branch_name}`, 45, totalY);
            totalY += 10;
          }
        }

        // Terms / Footer Notice
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#94a3b8').text(
          'This is a computer-generated invoice and does not require a physical signature.',
          45,
          760,
          { align: 'center', width: 505 }
        );

        doc.end();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new BillPdfRenderError(`Could not generate the PDF for this bill: ${msg}`));
      }
    });
  }
}
