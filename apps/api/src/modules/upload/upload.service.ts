import { parse } from 'csv-parse/sync';
import { UploadRepository } from './upload.repository.js';
import { BadRequestError } from '../../utils/errors.js';
import type { TenantScope } from '../../types/tenant.js';

export interface ManualUploadInput {
  date?: string;
  product?: string;
  category?: string;
  quantity?: number | string;
  production_cost?: number | string;
  selling_price?: number | string;
  region?: string;
  customer_type?: string;
}

export class UploadService {
  static async generateFinancialSummaries(scope: TenantScope) {
    const hasData = await UploadRepository.findOneBusinessData(scope);
    if (!hasData) {
      return;
    }

    await UploadRepository.deleteFinancialSummaries(scope);

    const pipeline = [
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
          },
        },
      },
    ];

    const distinctMonths = await UploadRepository.aggregateBusinessData(scope, pipeline);

    for (const m of distinctMonths) {
      const year = (m._id as { year: number }).year;
      const month = (m._id as { month: number }).month;

      const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const aggPipeline = [
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            total_revenue: { $sum: { $multiply: ['$quantity', '$selling_price'] } },
            total_expenses: { $sum: { $multiply: ['$quantity', '$production_cost'] } },
          },
        },
      ];

      const aggResults = await UploadRepository.aggregateBusinessData(scope, aggPipeline);
      const monthlyData = aggResults[0];

      if (monthlyData) {
        const totalRevenue = Number(monthlyData.total_revenue) || 0;
        const totalExpenses = Number(monthlyData.total_expenses) || 0;
        const totalProfit = totalRevenue - totalExpenses;

        await UploadRepository.insertFinancialSummary(scope, {
          timestamp: endDate,
          total_revenue: totalRevenue,
          total_profit: totalProfit,
          worker_payments: 0,
          active_workers: 0,
        });
      }
    }
  }

  static async manualUpload(scope: TenantScope, data: ManualUploadInput) {
    if (
      !data.date ||
      !data.product ||
      data.quantity === undefined ||
      data.production_cost === undefined ||
      data.selling_price === undefined
    ) {
      throw new BadRequestError('Missing required fields.');
    }

    const dateObj = new Date(data.date);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestError('Invalid date format. Expected YYYY-MM-DD.');
    }

    const doc = {
      date: dateObj,
      product: String(data.product),
      category: String(data.category ?? ''),
      quantity: parseInt(String(data.quantity), 10),
      production_cost: parseFloat(String(data.production_cost)),
      selling_price: parseFloat(String(data.selling_price)),
      region: String(data.region ?? ''),
      customer_type: String(data.customer_type ?? ''),
    };

    const insertedId = await UploadRepository.insertBusinessData(scope, doc);
    await this.generateFinancialSummaries(scope);

    const dateStr = dateObj.toISOString().split('T')[0];

    return {
      id: insertedId.toString(),
      date: dateStr,
      product: doc.product,
      category: doc.category,
      quantity: doc.quantity,
      production_cost: doc.production_cost,
      selling_price: doc.selling_price,
      region: doc.region,
      customer_type: doc.customer_type,
    };
  }

  static async csvUpload(scope: TenantScope, buffer: Buffer, filename: string) {
    // Security check 1: Path traversal / zip slip check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestError('Invalid or insecure filename.');
    }

    if (!filename.toLowerCase().endsWith('.csv')) {
      throw new BadRequestError('Please upload a valid CSV file.');
    }

    if (!buffer || buffer.length === 0) {
      throw new BadRequestError('CSV file is empty.');
    }

    let csvString = buffer.toString('utf-8');
    if (csvString.charCodeAt(0) === 0xfeff) {
      csvString = csvString.slice(1);
    }

    if (csvString.trim().length === 0) {
      throw new BadRequestError('CSV file is empty.');
    }

    let records: Record<string, string>[];
    try {
      records = parse(csvString, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch {
      throw new BadRequestError('Failed to parse CSV file.');
    }

    if (!records || records.length === 0) {
      throw new BadRequestError('CSV file contains no data rows.');
    }

    const MAX_CSV_ROWS = 10000;
    if (records.length > MAX_CSV_ROWS) {
      throw new BadRequestError(`CSV file exceeds maximum limit of ${MAX_CSV_ROWS} rows.`);
    }

    const requiredColumns = ['date', 'product', 'quantity', 'production_cost', 'selling_price', 'region', 'customer_type'];
    const headers = Object.keys(records[0] || {});
    const headerSet = new Set(headers);
    const missing = requiredColumns.filter((c) => !headerSet.has(c));

    if (missing.length > 0) {
      throw new BadRequestError(`Missing required columns: ${missing.sort().join(', ')}`);
    }

    const numericColumns = ['quantity', 'production_cost', 'selling_price'];

    // Security check 2: Negative numbers in numeric columns & formula injection detection
    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 1;
      const row = records[i];

      // Negative number check on numeric columns
      for (const col of numericColumns) {
        const rawVal = row[col];
        if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
          const numVal = parseFloat(String(rawVal));
          if (!isNaN(numVal) && numVal < 0) {
            throw new BadRequestError(`Row ${rowNum}: column '${col}' cannot be negative.`);
          }
        }
      }

      // Formula injection check:
      for (const [col, val] of Object.entries(row)) {
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (numericColumns.includes(col)) {
            if (/^[=+\-@]/.test(trimmed)) {
              if (/^[=@]/.test(trimmed) || isNaN(Number(trimmed)) || /[a-zA-Z|!']/.test(trimmed)) {
                throw new BadRequestError('CSV contains disallowed formula expression.');
              }
            }
          } else {
            if (/^[=+\-@]/.test(trimmed)) {
              throw new BadRequestError('CSV contains disallowed formula expression.');
            }
          }
        }
      }
    }

    let created = 0;
    const warnings: { row: number; detail: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 1;
      const row = records[i];

      try {
        const dateObj = new Date(row.date);
        if (isNaN(dateObj.getTime())) {
          throw new Error(`Invalid date '${row.date}'`);
        }

        const qty = parseInt(row.quantity, 10);
        if (isNaN(qty)) throw new Error(`Invalid quantity '${row.quantity}'`);

        const prodCost = parseFloat(row.production_cost);
        if (isNaN(prodCost)) throw new Error(`Invalid production_cost '${row.production_cost}'`);

        const sellPrice = parseFloat(row.selling_price);
        if (isNaN(sellPrice)) throw new Error(`Invalid selling_price '${row.selling_price}'`);

        await UploadRepository.insertBusinessData(scope, {
          date: dateObj,
          product: row.product,
          category: row.category ?? '',
          quantity: qty,
          production_cost: prodCost,
          selling_price: sellPrice,
          region: row.region,
          customer_type: row.customer_type,
        });

        created++;
      } catch (err: unknown) {
        // SILENT-FALLBACK-REASON: Individual row insertion errors collected into warnings array returned to caller
        warnings.push({ row: rowNum, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    if (created > 0) {
      await this.generateFinancialSummaries(scope);
    }

    return { created, warnings };
  }
}
