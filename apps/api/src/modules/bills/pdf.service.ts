import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { type BillDoc } from './bills.repository.js';
import { ValidationError } from '../../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function resolveFont(fontFile: string): string | null {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts', fontFile),
    path.resolve(process.cwd(), 'apps/api/src/assets/fonts', fontFile),
    path.resolve(process.cwd(), 'src/assets/fonts', fontFile),
    path.resolve('/Library/Frameworks/Python.framework/Versions/3.13/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf', fontFile),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function formatInvoiceDate(d: string | Date | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

async function fetchImageBuffer(urlOrPath?: string): Promise<Buffer | null> {
  if (!urlOrPath) return null;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reason: verify existence of local image path before falling back to remote URL fetch
    if (fs.existsSync(urlOrPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- reason: read local image path buffer when verified safe
      return fs.readFileSync(urlOrPath);
    }
  } catch {
    // SILENT-FALLBACK-REASON: Not a readable local file path, continue to HTTP fetch check
  }
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    try {
      const res = await fetch(urlOrPath, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch {
      // SILENT-FALLBACK-REASON: Unreachable image URL does not fail the PDF (matches Django bills/pdf.py)
    }
  }
  return null;
}

export class BillPdfService {
  static async renderBillPdf(bill: BillDoc, companyInput?: CompanyPdfContext | null): Promise<Buffer> {
    const company = companyInput ?? {};
    const [logoBuf, stampBuf, signatureBuf] = await Promise.all([
      fetchImageBuffer(company.logo_url),
      fetchImageBuffer(company.stamp_url),
      fetchImageBuffer(company.signature_url),
    ]);
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4', // 595.28 x 841.89 pt
          margins: { top: 51, bottom: 51, left: 45.35, right: 45.35 },
          compress: false,
          autoFirstPage: true,
        });

        // Register DejaVu Sans for Unicode rupee and exact Django WeasyPrint font parity
        const fontRegular = resolveFont('DejaVuSans.ttf');
        const fontBold = resolveFont('DejaVuSans-Bold.ttf');
        const fontOblique = resolveFont('DejaVuSans-Oblique.ttf');

        if (fontRegular && fontBold) {
          doc.registerFont('DejaVuSans', fontRegular);
          doc.registerFont('DejaVuSans-Bold', fontBold);
          if (fontOblique) doc.registerFont('DejaVuSans-Oblique', fontOblique);
        }

        const regularFont = fontRegular ? 'DejaVuSans' : 'Helvetica';
        const boldFont = fontBold ? 'DejaVuSans-Bold' : 'Helvetica-Bold';

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

        const isPakka = (bill.bill_type || (bill as { type?: string }).type) === 'pakka';
        const leftMargin = 45.35;
        const rightEdge = 549.93;
        const contentWidth = rightEdge - leftMargin; // 504.58

        // Exact column boundaries matching Django invoice.html CSS:
        // col1 (#): 34px -> x: 45.35 .. 79.35
        // col2 (ITEM): remaining -> x: 79.35 .. 275.93
        // col3 (QTY): 60px -> x: 275.93 .. 335.93
        // col4 (UNIT): 44px -> x: 335.93 .. 379.93
        // col5 (RATE): 80px -> x: 379.93 .. 459.93
        // col6 (AMOUNT): 90px -> x: 459.93 .. 549.93
        const col1X = leftMargin;
        const col1W = 34;
        const col2X = col1X + col1W;
        const col3X = 275.93;
        const col3W = 60;
        const col4X = 335.93;
        const col4W = 44;
        const col5X = 379.93;
        const col5W = 80;
        const col6X = 459.93;
        const col6W = 90;
        const col2W = col3X - col2X; // ~196.58

        // ==========================================
        // 1. Header (Company details & Invoice Title)
        // ==========================================
        let curY = 51.02;

        if (logoBuf) {
          try {
            doc.image(logoBuf, leftMargin, curY, { fit: [160, 56] });
            curY += 60;
          } catch {
            // SILENT-FALLBACK-REASON: Unreachable or invalid image URL does not fail the PDF
          }
        }

        // Company Name (20px bold #1d4ed8 -> 15pt)
        const companyName = company.name || 'Company Name';
        doc.font(boldFont).fontSize(15).fillColor('#1d4ed8').text(companyName, leftMargin, curY, { width: 335 });
        curY += 18;

        const addressY = curY;
        // Company Metadata (10px #475569 -> 7.5pt)
        doc.font(regularFont).fontSize(8).fillColor('#475569');
        if (company.address) {
          doc.text(company.address, leftMargin, curY, { width: 335 });
          curY += 12;
        }
        if (company.gst_number) {
          doc.text(`GSTIN: ${company.gst_number}`, leftMargin, curY, { width: 335 });
          curY += 12;
        }
        if (company.phone || company.email) {
          const contact = [company.phone ? `Ph: ${company.phone}` : '', company.email].filter(Boolean).join(' · ');
          doc.text(contact, leftMargin, curY, { width: 335 });
          curY += 12;
        }

        // Title and Badge on Top-Right (22px bold #0f172a -> 16.5pt)
        const titleText = isPakka ? 'TAX INVOICE' : 'BILL';
        doc.font(boldFont).fontSize(16.5).fillColor('#0f172a').text(titleText, 350, 51.02, { align: 'right', width: rightEdge - 350 });

        const badgeText = isPakka ? 'PAKKA' : 'KACHA';
        const badgeBg = isPakka ? '#dcfce7' : '#fef3c7';
        const badgeColor = isPakka ? '#15803d' : '#b45309';
        doc.font(boldFont).fontSize(7);
        const textWidth = doc.widthOfString(badgeText);
        const badgePaddingX = 8;
        const badgeW = textWidth + (badgePaddingX * 2);
        const badgeH = 12;
        const badgeX = rightEdge - badgeW;
        const badgeY = addressY - 1;

        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 6).fill(badgeBg);
        doc.font(boldFont).fontSize(7).fillColor(badgeColor).text(badgeText, badgeX, badgeY + 2.5, { align: 'center', width: badgeW });

        const headerBottom = Math.max(curY + 8, 115);
        doc.moveTo(leftMargin, headerBottom).lineTo(rightEdge, headerBottom).strokeColor('#1d4ed8').lineWidth(2).stroke();

        // ==========================================
        // 2. Meta Grid (BILLED TO & INVOICE DETAILS)
        // ==========================================
        let metaY = headerBottom + 14;
        doc.font(boldFont).fontSize(7).fillColor('#94a3b8').text('BILLED TO', leftMargin, metaY);
        doc.text('INVOICE DETAILS', 350, metaY, { align: 'right', width: rightEdge - 350 });
        metaY += 12;

        const buyer = bill.buyer || {};
        doc.font(boldFont).fontSize(8.5).fillColor('#1e293b').text(buyer.name || '—', leftMargin, metaY);
        doc.text(bill.invoice_number || 'DRAFT', 350, metaY, { align: 'right', width: rightEdge - 350 });
        metaY += 12;

        let leftMetaY = metaY;
        let rightMetaY = metaY;

        doc.font(regularFont).fontSize(8).fillColor('#1e293b');
        if (buyer.address) {
          doc.text(buyer.address, leftMargin, leftMetaY, { width: 280 });
          leftMetaY += doc.heightOfString(buyer.address, { width: 280 }) + 3;
        }
        if (buyer.gst_number) {
          doc.text(`GSTIN: ${buyer.gst_number}`, leftMargin, leftMetaY);
          leftMetaY += 12;
        }
        if (buyer.phone) {
          doc.text(`Ph: ${buyer.phone}`, leftMargin, leftMetaY);
          leftMetaY += 12;
        }

        const dateStr = formatInvoiceDate(bill.created_at || (bill as { date?: string }).date);
        doc.text(`Date: ${dateStr}`, 350, rightMetaY, { align: 'right', width: rightEdge - 350 });
        rightMetaY += 12;

        curY = Math.max(leftMetaY, rightMetaY) + 14;

        // ==========================================
        // 3. Products Table
        // ==========================================
        const renderTableHeader = (y: number) => {
          doc.rect(leftMargin, y, contentWidth, 18).fill('#1d4ed8');
          doc.font(boldFont).fontSize(7.5).fillColor('#ffffff');
          doc.text('#', col1X + 6, y + 5);
          doc.text('ITEM', col2X + 6, y + 5);
          doc.text('QTY', col3X, y + 5, { align: 'right', width: col3W - 6 });
          doc.text('UNIT', col4X + 6, y + 5, { align: 'left', width: col4W });
          doc.text('RATE', col5X, y + 5, { align: 'right', width: col5W - 6 });
          doc.text('AMOUNT', col6X, y + 5, { align: 'right', width: col6W - 6 });
          return y + 18;
        };

        curY = renderTableHeader(curY);

        const products = bill.products || [];
        products.forEach((prod: { quantity?: unknown; rate?: unknown; name?: string; unit?: string; total?: unknown; description?: string }, idx: number) => {
          const qty = Number(prod.quantity) || 0;
          const rate = Number(prod.rate) || 0;
          const total = Number(prod.total ?? (qty * rate));

          const hasDesc = Boolean(prod.description);
          const rowHeight = hasDesc ? 34 : 20;

          if (curY + rowHeight > 780) {
            doc.addPage();
            curY = 51.02;
            curY = renderTableHeader(curY);
          }

          if (idx % 2 === 1) {
            doc.rect(leftMargin, curY, contentWidth, rowHeight).fill('#f8fafc');
          }

          doc.font(regularFont).fontSize(8).fillColor('#1e293b');
          doc.text(String(idx + 1), col1X + 8, curY + 4);
          doc.text(prod.name || 'Item', col2X + 8, curY + 4, { width: col2W - 12 });
          if (hasDesc) {
            doc.font(regularFont).fontSize(7).fillColor('#94a3b8').text(prod.description!, col2X + 8, curY + 16, { width: col2W - 12 });
          }

          doc.font(regularFont).fontSize(8).fillColor('#1e293b');
          doc.text(qty.toFixed(2), col3X, curY + 4, { align: 'right', width: col3W - 8 });
          doc.text(prod.unit || 'pcs', col4X + 8, curY + 4, { align: 'left', width: col4W });
          doc.text(rate.toFixed(2), col5X, curY + 4, { align: 'right', width: col5W - 8 });
          doc.text(total.toFixed(2), col6X, curY + 4, { align: 'right', width: col6W - 8 });

          doc.moveTo(leftMargin, curY + rowHeight).lineTo(rightEdge, curY + rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          curY += rowHeight;
        });

        // ==========================================
        // 4. Totals Block (Right Aligned, width: 260)
        // ==========================================
        curY += 12;
        if (curY + 90 > 780) {
          doc.addPage();
          curY = 51.02;
        }

        const subtotal = Number(bill.subtotal ?? 0);
        const discount = Number(bill.discount ?? bill.discount_amount ?? 0);
        const gstRate = Number(bill.gst_percentage ?? bill.tax_rate ?? 0);
        const gstAmount = Number(bill.gst_amount ?? bill.tax_amount ?? 0);
        const grandTotal = Number(bill.grand_total ?? bill.total_amount ?? 0);

        const totalsW = 260;
        const totalLabelX = rightEdge - totalsW;
        const totalValX = totalLabelX + 100;
        const totalValW = rightEdge - totalValX;

        doc.font(regularFont).fontSize(8.5).fillColor('#475569');
        doc.text('Subtotal', totalLabelX, curY);
        doc.font(boldFont).fillColor('#1e293b').text(subtotal.toFixed(2), totalValX, curY, { align: 'right', width: totalValW });
        curY += 14;

        if (discount > 0) {
          doc.font(regularFont).fillColor('#475569').text('Discount', totalLabelX, curY);
          doc.font(boldFont).fillColor('#1e293b').text(`-${discount.toFixed(2)}`, totalValX, curY, { align: 'right', width: totalValW });
          curY += 14;
        }

        if (isPakka && (gstRate > 0 || gstAmount > 0)) {
          doc.font(regularFont).fillColor('#475569').text(`GST (${gstRate.toFixed(0)}%)`, totalLabelX, curY);
          doc.font(boldFont).fillColor('#1e293b').text(gstAmount.toFixed(2), totalValX, curY, { align: 'right', width: totalValW });
          curY += 14;
        }

        doc.moveTo(totalLabelX, curY).lineTo(rightEdge, curY).strokeColor('#1d4ed8').lineWidth(2).stroke();
        curY += 6;

        doc.font(boldFont).fontSize(10).fillColor('#1d4ed8');
        doc.text('Grand Total', totalLabelX, curY);
        doc.text(`₹${grandTotal.toFixed(2)}`, totalValX, curY, { align: 'right', width: totalValW });
        curY += 28;

        // ==========================================
        // 5. Payment Details & Signatory Footer
        // ==========================================
        if (curY + 70 > 780) {
          doc.addPage();
          curY = 51.02;
        }

        const footerY = curY;
        if (company.bank_account_number) {
          doc.font(boldFont).fontSize(7).fillColor('#94a3b8').text('PAYMENT DETAILS', leftMargin, footerY);
          doc.font(regularFont).fontSize(8).fillColor('#1e293b');
          const bankLine = [company.bank_name, company.branch_name].filter(Boolean).join(', ');
          doc.text(bankLine, leftMargin, footerY + 12);
          doc.text(`A/C No: ${company.bank_account_number}`, leftMargin, footerY + 24);
          if (company.ifsc_code) {
            doc.text(`IFSC: ${company.ifsc_code}`, leftMargin, footerY + 36);
          }
        }

        // Authorized Signatory
        const sigLineW = 140;
        const sigX = rightEdge - sigLineW;
        const sigY = footerY + 36;

        // Stamp and Signature Images
        if (stampBuf) {
          try {
            doc.save();
            doc.opacity(0.85);
            doc.image(stampBuf, sigX + 20, sigY - 45, { fit: [90, 50] });
            doc.restore();
          } catch {
            // SILENT-FALLBACK-REASON: Invalid or unreadable stamp image file does not fail PDF generation
          }
        }
        if (signatureBuf) {
          try {
            doc.image(signatureBuf, sigX + 15, sigY - 35, { fit: [110, 40] });
          } catch {
            // SILENT-FALLBACK-REASON: Invalid or unreadable signature image file does not fail PDF generation
          }
        }

        doc.moveTo(sigX, footerY + 32).lineTo(rightEdge, footerY + 32).strokeColor('#475569').lineWidth(1).stroke();
        doc.font(regularFont).fontSize(8).fillColor('#1e293b').text('Authorized Signatory', sigX, footerY + 36, { align: 'center', width: sigLineW });

        // Informal Kacha Notice
        if (!isPakka) {
          doc.font(regularFont).fontSize(9).fillColor('#94a3b8').text(
            'This is an informal bill and does not carry GST liability.',
            leftMargin,
            780,
            { align: 'center', width: contentWidth }
          );
        }

        doc.end();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new BillPdfRenderError(`Could not generate the PDF for this bill: ${msg}`));
      }
    });
  }
}
