import { parse } from 'csv-parse/sync';
import { getCollection } from '../../db/mongo.js';
import { BadRequestError } from '../../utils/errors.js';

export class UploadService {
  static async generateFinancialSummaries(companyId: string) {
    const bizCol = getCollection('business_data');
    const finCol = getCollection('financial_summaries');

    const hasData = await bizCol.findOne({ company_id: companyId });
    if (!hasData) {
      return;
    }

    await finCol.deleteMany({ company_id: companyId });

    const pipeline = [
      { $match: { company_id: companyId } },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
          },
        },
      },
    ];

    const distinctMonths = await bizCol.aggregate(pipeline).toArray();

    for (const m of distinctMonths) {
      const year = m._id.year;
      const month = m._id.month;

      const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const aggPipeline = [
        {
          $match: {
            company_id: companyId,
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

      const aggResults = await bizCol.aggregate(aggPipeline).toArray();
      const monthlyData = aggResults[0];

      if (monthlyData) {
        const totalRevenue = Number(monthlyData.total_revenue) || 0;
        const totalExpenses = Number(monthlyData.total_expenses) || 0;
        const totalProfit = totalRevenue - totalExpenses;

        await finCol.insertOne({
          company_id: companyId,
          timestamp: endDate,
          total_revenue: totalRevenue,
          total_profit: totalProfit,
          worker_payments: 0,
          active_workers: 0,
        });
      }
    }
  }

  static async manualUpload(companyId: string, data: any) {
    const bizCol = getCollection('business_data');

    if (!data.date || !data.product || data.quantity === undefined || data.production_cost === undefined || data.selling_price === undefined) {
      throw new BadRequestError('Missing required fields.');
    }

    const dateObj = new Date(data.date);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestError('Invalid date format. Expected YYYY-MM-DD.');
    }

    const doc = {
      company_id: companyId,
      date: dateObj,
      product: String(data.product),
      category: String(data.category || ''),
      quantity: parseInt(String(data.quantity), 10),
      production_cost: parseFloat(String(data.production_cost)),
      selling_price: parseFloat(String(data.selling_price)),
      region: String(data.region || ''),
      customer_type: String(data.customer_type || ''),
    };

    const result = await bizCol.insertOne(doc);
    await this.generateFinancialSummaries(companyId);

    const dateStr = dateObj.toISOString().split('T')[0];

    return {
      id: result.insertedId.toString(),
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

  static async csvUpload(companyId: string, buffer: Buffer, filename: string) {
    if (!filename.toLowerCase().endsWith('.csv')) {
      throw new BadRequestError('Please upload a valid CSV file.');
    }

    const bizCol = getCollection('business_data');
    let csvString = buffer.toString('utf-8');
    if (csvString.charCodeAt(0) === 0xfeff) {
      csvString = csvString.slice(1);
    }

    let records: Record<string, string>[];
    try {
      records = parse(csvString, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new BadRequestError('Failed to parse CSV file.');
    }

    if (!records || records.length === 0) {
      return { created: 0, warnings: [] };
    }

    const requiredColumns = ['date', 'product', 'quantity', 'production_cost', 'selling_price', 'region', 'customer_type'];
    const headers = Object.keys(records[0] || {});
    const headerSet = new Set(headers);
    const missing = requiredColumns.filter(c => !headerSet.has(c));

    if (missing.length > 0) {
      throw new BadRequestError(`Missing required columns: ${missing.sort().join(', ')}`);
    }

    let created = 0;
    const warnings: Array<{ row: number; detail: string }> = [];
    const sanitizeFormula = (val: string) => {
      if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
        return `'${val}`;
      }
      return val;
    };

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

        await bizCol.insertOne({
          company_id: companyId,
          date: dateObj,
          product: sanitizeFormula(row.product),
          category: sanitizeFormula(row.category || ''),
          quantity: qty,
          production_cost: prodCost,
          selling_price: sellPrice,
          region: sanitizeFormula(row.region),
          customer_type: sanitizeFormula(row.customer_type),
        });

        created++;
      } catch (err: any) {
        warnings.push({ row: rowNum, detail: err.message || String(err) });
      }
    }

    if (created > 0) {
      await this.generateFinancialSummaries(companyId);
    }

    return { created, warnings };
  }
}
