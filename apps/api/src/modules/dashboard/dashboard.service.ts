import { ObjectId } from 'mongodb';
import { DashboardRepository } from './dashboard.repository.js';
import { StorageService } from '../upload/storage.service.js';
import { env } from '../../config/env.js';
import {
  calcChange,
  getMonthBoundaries,
  buildZonedDateRange,
  getZonedDateParts,
  formatDjangoIso,
} from '../../utils/timezone.js';
import type { TenantScope } from '../../types/tenant.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export class DashboardService {
  static async getBillFinancials(scope: TenantScope, startDt?: Date, endDt?: Date) {
    const filter: Record<string, unknown> = {
      profit_confirmed: true,
    };

    if (startDt || endDt) {
      const dateRange: Record<string, unknown> = {};
      if (startDt) dateRange.$gte = startDt;
      if (endDt) dateRange.$lte = endDt;
      filter.profit_confirmed_at = dateRange;
    }

    const bills = await DashboardRepository.findBills(scope, filter, {
      payments: 1,
      grand_total: 1,
      profit_confirmed_amount: 1,
    });

    let totalRevenue = 0.0;
    let totalProfit = 0.0;

    for (const b of bills) {
      let amountReceived = 0.0;
      if (Array.isArray(b.payments)) {
        for (const p of b.payments) {
          amountReceived += Number((p as { amount?: unknown }).amount) || 0;
        }
      }
      totalRevenue += amountReceived;
      totalProfit += Number(b.profit_confirmed_amount) || 0.0;
    }

    return {
      revenue: Math.round(totalRevenue * 100) / 100,
      profit: Math.round(totalProfit * 100) / 100,
    };
  }

  static async getUploadedDataFinancials(scope: TenantScope, startDt?: Date, endDt?: Date) {
    const match: Record<string, unknown> = {};

    if (startDt || endDt) {
      const dateRange: Record<string, unknown> = {};
      if (startDt) dateRange.$gte = startDt;
      if (endDt) dateRange.$lte = endDt;
      match.date = dateRange;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          total_revenue: { $sum: { $multiply: ['$quantity', '$selling_price'] } },
          total_cost: { $sum: { $multiply: ['$quantity', '$production_cost'] } },
        },
      },
    ];

    const results = await DashboardRepository.aggregateBusinessData(scope, pipeline);
    const result = results[0] || {};
    const totalRevenue = Number(result.total_revenue) || 0;
    const totalCost = Number(result.total_cost) || 0;

    return {
      revenue: Math.round(totalRevenue * 100) / 100,
      profit: Math.round((totalRevenue - totalCost) * 100) / 100,
    };
  }

  static async getWorkerPaymentsPaid(scope: TenantScope, startDt?: Date, endDt?: Date) {
    const match: Record<string, unknown> = {};

    if (startDt || endDt) {
      const dateRange: Record<string, unknown> = {};
      if (startDt) dateRange.$gte = startDt;
      if (endDt) dateRange.$lte = endDt;
      match.date = dateRange;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          total_paid: { $sum: '$amount_paid' },
        },
      },
    ];

    const results = await DashboardRepository.aggregatePayRecords(scope, pipeline);
    const result = results[0] || {};
    return Math.round((Number(result.total_paid) || 0) * 100) / 100;
  }

  static async getLiveFinancialSummary(scope: TenantScope) {
    const [bills, uploaded, workerPaid] = await Promise.all([
      this.getBillFinancials(scope),
      this.getUploadedDataFinancials(scope),
      this.getWorkerPaymentsPaid(scope),
    ]);

    const totalRevenue = Math.round((bills.revenue + uploaded.revenue) * 100) / 100;
    const totalProfit = Math.round((bills.profit + uploaded.profit - workerPaid) * 100) / 100;

    return {
      total_revenue: totalRevenue,
      total_profit: totalProfit,
      worker_payments: workerPaid,
      breakdown: {
        bills: { revenue: bills.revenue, profit: bills.profit },
        uploaded_data: { revenue: uploaded.revenue, profit: uploaded.profit },
      },
    };
  }

  static async getSummaryData(scope: TenantScope) {
    const live = await this.getLiveFinancialSummary(scope);

    const { currentMonthStart, prevMonthStart, prevMonthEnd } = getMonthBoundaries(
      new Date(),
      env.APP_TIME_ZONE
    );

    const [prevBills, prevUploaded, prevWorkerPaid] = await Promise.all([
      this.getBillFinancials(scope, prevMonthStart, prevMonthEnd),
      this.getUploadedDataFinancials(scope, prevMonthStart, prevMonthEnd),
      this.getWorkerPaymentsPaid(scope, prevMonthStart, prevMonthEnd),
    ]);

    const prevRevenue = Math.round((prevBills.revenue + prevUploaded.revenue) * 100) / 100;
    const prevProfit = Math.round((prevBills.profit + prevUploaded.profit - prevWorkerPaid) * 100) / 100;

    const [activeWorkers, prevWorkers] = await Promise.all([
      DashboardRepository.countWorkers(scope, { is_active: true }),
      DashboardRepository.countWorkers(scope, {
        is_active: true,
        created_at: { $lt: currentMonthStart },
      }),
    ]);

    return {
      total_revenue: live.total_revenue,
      total_profit: live.total_profit,
      worker_payments: live.worker_payments,
      breakdown: live.breakdown,
      active_workers: activeWorkers,
      revenue_change: calcChange(prevRevenue, live.total_revenue),
      profit_change: calcChange(prevProfit, live.total_profit),
      workers_change: calcChange(prevWorkers, activeWorkers),
    };
  }

  private static buildDateRange(months: number) {
    return buildZonedDateRange(months, new Date(), env.APP_TIME_ZONE);
  }

  private static async getBillMonthlySeries(scope: TenantScope, startDt: Date, endDt: Date) {
    const pipeline = [
      {
        $match: {
          profit_confirmed: true,
          profit_confirmed_at: { $gte: startDt, $lte: endDt },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { date: '$profit_confirmed_at', timezone: env.APP_TIME_ZONE } },
            month: { $month: { date: '$profit_confirmed_at', timezone: env.APP_TIME_ZONE } },
          },
          revenue: { $sum: '$grand_total' },
          profit: { $sum: '$profit_confirmed_amount' },
        },
      },
    ];

    const results = await DashboardRepository.aggregateBills(scope, pipeline);
    const series: Record<string, { revenue: number; profit: number }> = {};
    for (const r of results) {
      const idObj = r._id as { year: number; month: number };
      const key = `${idObj.year}-${idObj.month}`;
      series[key] = {
        revenue: Number(r.revenue) || 0,
        profit: Number(r.profit) || 0,
      };
    }
    return series;
  }

  static async getRevExpData(scope: TenantScope, months = 6) {
    const { startDt, endDt } = this.buildDateRange(months);

    const pipeline = [
      {
        $match: {
          date: { $gte: startDt, $lte: endDt },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { date: '$date', timezone: env.APP_TIME_ZONE } },
            month: { $month: { date: '$date', timezone: env.APP_TIME_ZONE } },
          },
          total_revenue: { $sum: { $multiply: ['$quantity', '$selling_price'] } },
          total_expenses: { $sum: { $multiply: ['$quantity', '$production_cost'] } },
        },
      },
      { $sort: { '_id.year': 1 as const, '_id.month': 1 as const } },
    ];

    const [bizResults, billSeries] = await Promise.all([
      DashboardRepository.aggregateBusinessData(scope, pipeline),
      this.getBillMonthlySeries(scope, startDt, endDt),
    ]);

    const combined: Record<string, [number, number]> = {};
    for (const r of bizResults) {
      const idObj = r._id as { year: number; month: number };
      const key = `${idObj.year}-${idObj.month}`;
      combined[key] = [Number(r.total_revenue) || 0, Number(r.total_expenses) || 0];
    }

    for (const [key, bill] of Object.entries(billSeries)) {
      if (!combined[key]) {
        combined[key] = [0.0, 0.0];
      }
      combined[key][0] += bill.revenue;
      combined[key][1] += Math.max(bill.revenue - bill.profit, 0);
    }

    const sortedKeys = Object.keys(combined).sort((a, b) => {
      const [y1, m1] = a.split('-').map(Number);
      const [y2, m2] = b.split('-').map(Number);
      return y1 !== y2 ? y1 - y2 : m1 - m2;
    });

    const labels: string[] = [];
    const revenue: number[] = [];
    const expenses: number[] = [];

    for (const key of sortedKeys) {
      const [year, month] = key.split('-').map(Number);
      labels.push(`${MONTH_ABBR[month - 1]} ${year}`);
      revenue.push(Math.round(combined[key][0] * 100) / 100);
      expenses.push(Math.round(combined[key][1] * 100) / 100);
    }

    return { labels, revenue, expenses };
  }

  static async getProfitTrends(scope: TenantScope, months = 6, interval = 'monthly') {
    const { startDt, endDt } = this.buildDateRange(months);

    let groupId: Record<string, unknown>;
    if (interval === 'daily') {
      groupId = {
        year: { $year: { date: '$date', timezone: env.APP_TIME_ZONE } },
        month: { $month: { date: '$date', timezone: env.APP_TIME_ZONE } },
        day: { $dayOfMonth: { date: '$date', timezone: env.APP_TIME_ZONE } },
      };
    } else if (interval === 'weekly') {
      groupId = {
        year: { $year: { date: '$date', timezone: env.APP_TIME_ZONE } },
        week: { $week: { date: '$date', timezone: env.APP_TIME_ZONE } },
      };
    } else {
      groupId = {
        year: { $year: { date: '$date', timezone: env.APP_TIME_ZONE } },
        month: { $month: { date: '$date', timezone: env.APP_TIME_ZONE } },
      };
    }

    const pipeline = [
      {
        $match: {
          date: { $gte: startDt, $lte: endDt },
        },
      },
      {
        $group: {
          _id: groupId,
          total_profit: {
            $sum: {
              $subtract: [
                { $multiply: ['$quantity', '$selling_price'] },
                { $multiply: ['$quantity', '$production_cost'] },
              ],
            },
          },
        },
      },
      {
        $sort: {
          '_id.year': 1 as const,
          '_id.month': 1 as const,
          '_id.week': 1 as const,
          '_id.day': 1 as const,
        },
      },
    ];

    const results = await DashboardRepository.aggregateBusinessData(scope, pipeline);

    if (interval === 'monthly') {
      const billSeries = await this.getBillMonthlySeries(scope, startDt, endDt);
      const combined: Record<string, number> = {};

      for (const r of results) {
        const idObj = r._id as { year: number; month: number };
        const key = `${idObj.year}-${idObj.month}`;
        combined[key] = Number(r.total_profit) || 0;
      }

      for (const [key, bill] of Object.entries(billSeries)) {
        combined[key] = (combined[key] || 0) + bill.profit;
      }

      const sortedKeys = Object.keys(combined).sort((a, b) => {
        const [y1, m1] = a.split('-').map(Number);
        const [y2, m2] = b.split('-').map(Number);
        return y1 !== y2 ? y1 - y2 : m1 - m2;
      });

      const labels: string[] = [];
      const profit: number[] = [];

      for (const key of sortedKeys) {
        const [year, month] = key.split('-').map(Number);
        labels.push(`${MONTH_ABBR[month - 1]} ${year}`);
        profit.push(Math.round(combined[key] * 100) / 100);
      }

      return { labels, profit, interval };
    }

    const labels: string[] = [];
    const profit: number[] = [];

    for (const r of results) {
      const idObj = r._id as { day?: number; month?: number; week?: number; year?: number };
      if (interval === 'daily') {
        labels.push(`${idObj.day}/${idObj.month}`);
      } else if (interval === 'weekly') {
        labels.push(`Week ${idObj.week}`);
      } else {
        labels.push(`${MONTH_ABBR[(idObj.month ?? 1) - 1]} ${idObj.year}`);
      }
      profit.push(Number(r.total_profit) || 0);
    }

    return { labels, profit, interval };
  }

  static async getWorkerPayments(scope: TenantScope) {
    const records = await DashboardRepository.findRecentPayRecords(scope, 10);

    const workerIds = [
      ...new Set(
        records
          .map((r) => {
            if (!r.worker) return (r.worker_id as string | undefined) ?? null;
            if (r.worker instanceof ObjectId) return r.worker.toString();
            if (typeof r.worker === 'string') return r.worker;
            if ((r.worker as { _id?: unknown })._id) return String((r.worker as { _id: unknown })._id);
            return (r.worker_id as string | undefined) ?? null;
          })
          .filter(Boolean)
      ),
    ] as string[];

    const validObjectIds = workerIds
      .filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const workerDocs = await DashboardRepository.findWorkersByIds(scope, validObjectIds);
    const workerMap = new Map(workerDocs.map((w) => [w._id.toString(), w]));

    const results = [];
    for (const r of records) {
      let workerId: string | null = null;
      if (r.worker instanceof ObjectId) workerId = r.worker.toString();
      else if (typeof r.worker === 'string') workerId = r.worker;
      else if ((r.worker as { _id?: unknown })?._id) workerId = String((r.worker as { _id: unknown })._id);
      else if (r.worker_id) workerId = String(r.worker_id);

      const worker = workerId ? workerMap.get(workerId) : null;
      const workerName = worker?.name ?? (workerId ? 'Deleted Worker' : 'Unknown');

      const unitsProduced = Number(r.units_produced) || 0;
      const ratePerUnit = Number(r.rate_per_unit) || 0;
      const totalOwed = unitsProduced * ratePerUnit;
      const amountPaid = Number(r.amount_paid) || 0;
      const isPaid = Boolean(r.paid) || amountPaid >= totalOwed;

      const dateObj = r.date instanceof Date ? r.date : new Date(r.date as string | Date);
      const zoned = getZonedDateParts(dateObj, env.APP_TIME_ZONE);
      const monthStr = `${MONTH_NAMES[zoned.month - 1]} ${zoned.year}`;

      results.push({
        name: workerName,
        month: monthStr,
        amount: totalOwed,
        amount_paid: amountPaid,
        balance_due: Math.max(totalOwed - amountPaid, 0),
        status: isPaid ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Pending',
      });
    }

    return results;
  }

  static async getTopWorkers(scope: TenantScope) {
    const pipeline = [
      {
        $group: {
          _id: '$worker',
          total_payout: { $sum: '$amount_paid' },
          payment_count: { $sum: 1 },
          latest_payment: { $max: '$date' },
        },
      },
      { $sort: { total_payout: -1 as const } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'workers',
          localField: '_id',
          foreignField: '_id',
          as: 'worker_info',
        },
      },
      { $unwind: '$worker_info' },
      {
        $project: {
          name: '$worker_info.name',
          total_payout: 1,
          payment_count: 1,
          latest_payment: 1,
        },
      },
    ];

    const results = await DashboardRepository.aggregatePayRecords<{
      name?: string;
      total_payout?: number;
      payment_count?: number;
      latest_payment?: Date | string | null;
    }>(scope, pipeline);
    return results.map((w) => {
      const latest = w.latest_payment;
      const latestStr = latest ? formatDjangoIso(latest) : 'N/A';
      return {
        name: w.name ?? 'Unknown',
        total_payout: Number(w.total_payout) || 0,
        payment_count: Number(w.payment_count) || 0,
        latest_payment: latestStr,
      };
    });
  }

  static async getDashboardData(scope: TenantScope) {
    const [summary, revExp, profitTrends, workers, topWorkers, billsCount] = await Promise.all([
      this.getSummaryData(scope),
      this.getRevExpData(scope, 6),
      this.getProfitTrends(scope, 6, 'monthly'),
      this.getWorkerPayments(scope),
      this.getTopWorkers(scope),
      DashboardRepository.countBills(scope),
    ]);

    return {
      summary,
      revExp,
      profitTrends,
      workers,
      topWorkers,
      billsCount,
    };
  }

  static async generateExportFile(scope: TenantScope, reportType: string): Promise<string> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `exports/${scope.companyId}/${reportType}_${timestamp}.csv`;

    const toCsvCell = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const toCsvRow = (arr: unknown[]): string => arr.map(toCsvCell).join(',');
    const formatDate = (val: unknown): string => {
      if (!val) return '';
      if (val instanceof Date) {
        return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}`;
      }
      if (typeof val === 'string' && val.length >= 10) {
        return val.slice(0, 10);
      }
      return String(val);
    };

    const lines: string[] = [];

    if (reportType === 'business_trends') {
      const dataList = await DashboardRepository.findBusinessData(scope);
      lines.push(toCsvRow(['Date', 'Product', 'Category', 'Quantity Sold', 'Production Cost', 'Selling Price', 'Revenue', 'Profit']));
      for (const d of dataList) {
        const qty = Number(d.quantity) || 0;
        const prodCost = Number(d.production_cost) || 0;
        const sellPrice = Number(d.selling_price) || 0;
        const rev = qty * sellPrice;
        const profit = rev - (qty * prodCost);
        lines.push(toCsvRow([
          formatDate(d.date),
          d.product ?? '',
          d.category ?? '',
          qty,
          prodCost,
          sellPrice,
          rev,
          profit,
        ]));
      }
    } else if (reportType === 'worker_management') {
      const workers = await DashboardRepository.findAllWorkers(scope);
      lines.push(toCsvRow(['Worker Name', 'Contact', 'Status', 'Total Materials Assigned', 'Total Value', 'Total Units Produced', 'Total Pay Due']));
      for (const w of workers) {
        const wid = w._id as ObjectId;
        const [materials, payRecords] = await Promise.all([
          DashboardRepository.findAssignmentsForWorker(scope, wid),
          DashboardRepository.findPayRecordsForWorker(scope, wid),
        ]);
        const totalMaterials = materials.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);
        const totalValue = materials.reduce((sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.price_per_unit) || 0), 0);
        const totalUnits = payRecords.reduce((sum, p) => sum + (Number(p.units_produced) || 0), 0);
        const totalPay = payRecords.reduce((sum, p) => sum + (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0), 0);
        lines.push(toCsvRow([
          w.name ?? 'Unknown',
          w.phone ?? '',
          w.is_active ? 'Active' : 'Inactive',
          totalMaterials,
          totalValue,
          totalUnits,
          totalPay,
        ]));
      }
    } else if (reportType === 'salary_payments') {
      const rawPayments = await DashboardRepository.findAllPayRecords(scope);
      interface ExportPayRecord {
        worker?: ObjectId | string | null;
        date?: unknown;
        product_name?: string;
        units_produced?: number;
        rate_per_unit?: number;
        paid?: boolean;
      }
      const payments = rawPayments as unknown as ExportPayRecord[];
      lines.push(toCsvRow(['Date', 'Worker', 'Product', 'Units Produced', 'Rate per Unit', 'Amount Due', 'Payment Status']));
      const workerIds: (string | ObjectId)[] = [];
      for (const p of payments) {
        if (p.worker) {
          workerIds.push(p.worker);
        }
      }
      const workers = await DashboardRepository.findWorkersByIds(scope, workerIds);
      const workerMap = new Map<string, string>(workers.map((w) => [w._id.toString(), w.name ?? 'Unknown']));

      for (const p of payments) {
        const widStr = p.worker ? String(p.worker) : null;
        const wName = widStr ? workerMap.get(widStr) ?? 'Unknown' : 'Unknown';
        const units = Number(p.units_produced) || 0;
        const rate = Number(p.rate_per_unit) || 0;
        lines.push(toCsvRow([
          formatDate(p.date),
          wName,
          p.product_name ?? '',
          units,
          rate,
          units * rate,
          p.paid ? 'Paid' : 'Pending',
        ]));
      }
    } else if (reportType === 'complete_analytics') {
      const [financials, insights] = await Promise.all([
        DashboardRepository.findFinancialSummaries(scope),
        DashboardRepository.findInsights(scope),
      ]);
      lines.push('Financial Summary');
      lines.push(toCsvRow(['Timestamp', 'Total Revenue', 'Total Profit', 'Worker Payments', 'Active Workers']));
      for (const fin of financials) {
        lines.push(toCsvRow([
          formatDate(fin.timestamp),
          Number(fin.total_revenue) || 0,
          Number(fin.total_profit) || 0,
          Number(fin.worker_payments) || 0,
          Number(fin.active_workers) || 0,
        ]));
      }
      lines.push('');
      lines.push('Business Insights');
      lines.push(toCsvRow(['Title', 'Description', 'Created At']));
      for (const ins of insights) {
        const desc = String(ins.description ?? '');
        lines.push(toCsvRow([
          ins.title ?? '',
          desc.length > 100 ? desc.slice(0, 100) + '...' : desc,
          formatDate(ins.created_at),
        ]));
      }
    }

    const csvContent = lines.join('\n') + '\n';
    return StorageService.save(filename, Buffer.from(csvContent, 'utf8'), 'text/csv');
  }
}
