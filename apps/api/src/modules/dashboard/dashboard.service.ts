import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function calcChange(oldVal: number, newVal: number): number {
  if (oldVal === 0 && newVal === 0) return 0.0;
  if (oldVal === 0) return newVal > 0 ? 100.0 : -100.0;
  return Math.round(((newVal - oldVal) / Math.abs(oldVal)) * 1000) / 10;
}

export class DashboardService {
  static async getBillFinancials(companyId: string, startDt?: Date, endDt?: Date) {
    const billsCol = getCollection('bills');
    const filter: Record<string, any> = {
      company_id: companyId,
      profit_confirmed: true,
    };

    if (startDt || endDt) {
      filter.profit_confirmed_at = {};
      if (startDt) filter.profit_confirmed_at.$gte = startDt;
      if (endDt) filter.profit_confirmed_at.$lte = endDt;
    }

    const bills = await billsCol
      .find(filter, { projection: { payments: 1, grand_total: 1, profit_confirmed_amount: 1 } })
      .toArray();

    let totalRevenue = 0.0;
    let totalProfit = 0.0;

    for (const b of bills) {
      let amountReceived = 0.0;
      if (Array.isArray(b.payments)) {
        for (const p of b.payments) {
          amountReceived += Number(p.amount) || 0;
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

  static async getUploadedDataFinancials(companyId: string, startDt?: Date, endDt?: Date) {
    const bizCol = getCollection('business_data');
    const match: Record<string, any> = { company_id: companyId };

    if (startDt || endDt) {
      match.date = {};
      if (startDt) match.date.$gte = startDt;
      if (endDt) match.date.$lte = endDt;
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

    const results = await bizCol.aggregate(pipeline).toArray();
    const result = results[0] || {};
    const totalRevenue = Number(result.total_revenue) || 0;
    const totalCost = Number(result.total_cost) || 0;

    return {
      revenue: Math.round(totalRevenue * 100) / 100,
      profit: Math.round((totalRevenue - totalCost) * 100) / 100,
    };
  }

  static async getWorkerPaymentsPaid(companyId: string, startDt?: Date, endDt?: Date) {
    const payCol = getCollection('pay_records');
    const match: Record<string, any> = { company_id: companyId };

    if (startDt || endDt) {
      match.date = {};
      if (startDt) match.date.$gte = startDt;
      if (endDt) match.date.$lte = endDt;
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

    const results = await payCol.aggregate(pipeline).toArray();
    const result = results[0] || {};
    return Math.round((Number(result.total_paid) || 0) * 100) / 100;
  }

  static async getLiveFinancialSummary(companyId: string) {
    const [bills, uploaded, workerPaid] = await Promise.all([
      this.getBillFinancials(companyId),
      this.getUploadedDataFinancials(companyId),
      this.getWorkerPaymentsPaid(companyId),
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

  static async getSummaryData(companyId: string) {
    const live = await this.getLiveFinancialSummary(companyId);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const prevMonthEnd = new Date(currentMonthStart.getTime() - 1);
    const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1, 0, 0, 0, 0);

    const [prevBills, prevUploaded, prevWorkerPaid] = await Promise.all([
      this.getBillFinancials(companyId, prevMonthStart, prevMonthEnd),
      this.getUploadedDataFinancials(companyId, prevMonthStart, prevMonthEnd),
      this.getWorkerPaymentsPaid(companyId, prevMonthStart, prevMonthEnd),
    ]);

    const prevRevenue = Math.round((prevBills.revenue + prevUploaded.revenue) * 100) / 100;
    const prevProfit = Math.round((prevBills.profit + prevUploaded.profit - prevWorkerPaid) * 100) / 100;

    const workersCol = getCollection('workers');
    const [activeWorkers, prevWorkers] = await Promise.all([
      workersCol.countDocuments({ company_id: companyId, is_active: true }),
      workersCol.countDocuments({
        company_id: companyId,
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
    const endDt = new Date();
    endDt.setHours(23, 59, 59, 999);
    const startDt = new Date(endDt.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    startDt.setHours(0, 0, 0, 0);
    return { startDt, endDt };
  }

  private static async getBillMonthlySeries(companyId: string, startDt: Date, endDt: Date) {
    const billsCol = getCollection('bills');
    const pipeline = [
      {
        $match: {
          company_id: companyId,
          profit_confirmed: true,
          profit_confirmed_at: { $gte: startDt, $lte: endDt },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$profit_confirmed_at' },
            month: { $month: '$profit_confirmed_at' },
          },
          revenue: { $sum: '$grand_total' },
          profit: { $sum: '$profit_confirmed_amount' },
        },
      },
    ];

    const results = await billsCol.aggregate(pipeline).toArray();
    const series: Record<string, { revenue: number; profit: number }> = {};
    for (const r of results) {
      const key = `${r._id.year}-${r._id.month}`;
      series[key] = {
        revenue: Number(r.revenue) || 0,
        profit: Number(r.profit) || 0,
      };
    }
    return series;
  }

  static async getRevExpData(companyId: string, months = 6) {
    const { startDt, endDt } = this.buildDateRange(months);
    const bizCol = getCollection('business_data');

    const pipeline = [
      {
        $match: {
          company_id: companyId,
          date: { $gte: startDt, $lte: endDt },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
          },
          total_revenue: { $sum: { $multiply: ['$quantity', '$selling_price'] } },
          total_expenses: { $sum: { $multiply: ['$quantity', '$production_cost'] } },
        },
      },
      { $sort: { '_id.year': 1 as const, '_id.month': 1 as const } },
    ];

    const [bizResults, billSeries] = await Promise.all([
      bizCol.aggregate(pipeline).toArray(),
      this.getBillMonthlySeries(companyId, startDt, endDt),
    ]);

    const combined: Record<string, [number, number]> = {};
    for (const r of bizResults) {
      const key = `${r._id.year}-${r._id.month}`;
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

  static async getProfitTrends(companyId: string, months = 6, interval = 'monthly') {
    const { startDt, endDt } = this.buildDateRange(months);
    const bizCol = getCollection('business_data');

    let groupId: Record<string, any>;
    if (interval === 'daily') {
      groupId = {
        year: { $year: '$date' },
        month: { $month: '$date' },
        day: { $dayOfMonth: '$date' },
      };
    } else if (interval === 'weekly') {
      groupId = {
        year: { $year: '$date' },
        week: { $week: '$date' },
      };
    } else {
      groupId = {
        year: { $year: '$date' },
        month: { $month: '$date' },
      };
    }

    const pipeline = [
      {
        $match: {
          company_id: companyId,
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

    const results = await bizCol.aggregate(pipeline).toArray();

    if (interval === 'monthly') {
      const billSeries = await this.getBillMonthlySeries(companyId, startDt, endDt);
      const combined: Record<string, number> = {};

      for (const r of results) {
        const key = `${r._id.year}-${r._id.month}`;
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
      if (interval === 'daily') {
        labels.push(`${r._id.day}/${r._id.month}`);
      } else if (interval === 'weekly') {
        labels.push(`Week ${r._id.week}`);
      } else {
        labels.push(`${MONTH_ABBR[r._id.month - 1]} ${r._id.year}`);
      }
      profit.push(Number(r.total_profit) || 0);
    }

    return { labels, profit, interval };
  }

  static async getWorkerPayments(companyId: string) {
    const payCol = getCollection('pay_records');
    const workersCol = getCollection('workers');

    const records = await payCol
      .find({ company_id: companyId })
      .sort({ date: -1 })
      .limit(10)
      .toArray();

    const workerIds = [
      ...new Set(
        records
          .map(r => {
            if (!r.worker) return r.worker_id || null;
            if (r.worker instanceof ObjectId) return r.worker.toString();
            if (typeof r.worker === 'string') return r.worker;
            if (r.worker._id) return r.worker._id.toString();
            return r.worker_id || null;
          })
          .filter(Boolean)
      ),
    ];

    const validObjectIds = workerIds
      .filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const workerDocs = await workersCol
      .find({ _id: { $in: validObjectIds } })
      .toArray();
    const workerMap = new Map(workerDocs.map(w => [w._id.toString(), w]));

    const results = [];
    for (const r of records) {
      let workerId: string | null = null;
      if (r.worker instanceof ObjectId) workerId = r.worker.toString();
      else if (typeof r.worker === 'string') workerId = r.worker;
      else if (r.worker?._id) workerId = r.worker._id.toString();
      else if (r.worker_id) workerId = r.worker_id;

      const worker = workerId ? workerMap.get(workerId) : null;
      const workerName = worker?.name || (workerId ? 'Deleted Worker' : 'Unknown');

      const unitsProduced = Number(r.units_produced) || 0;
      const ratePerUnit = Number(r.rate_per_unit) || 0;
      const totalOwed = unitsProduced * ratePerUnit;
      const amountPaid = Number(r.amount_paid) || 0;
      const isPaid = Boolean(r.paid) || amountPaid >= totalOwed;

      const dateObj = r.date instanceof Date ? r.date : new Date(r.date);
      const monthStr = `${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

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

  static async getTopWorkers(companyId: string) {
    const payCol = getCollection('pay_records');
    const pipeline = [
      { $match: { company_id: companyId } },
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

    const results = await payCol.aggregate(pipeline).toArray();
    return results.map(w => {
      const latest = w.latest_payment;
      let latestStr = 'N/A';
      if (latest instanceof Date) {
        latestStr = latest.toISOString();
      } else if (latest) {
        latestStr = new Date(latest).toISOString();
      }
      return {
        name: w.name || 'Unknown',
        total_payout: Number(w.total_payout) || 0,
        payment_count: Number(w.payment_count) || 0,
        latest_payment: latestStr,
      };
    });
  }

  static async getDashboardData(companyId: string) {
    const billsCol = getCollection('bills');
    const [summary, revExp, profitTrends, workers, topWorkers, billsCount] = await Promise.all([
      this.getSummaryData(companyId),
      this.getRevExpData(companyId, 6),
      this.getProfitTrends(companyId, 6, 'monthly'),
      this.getWorkerPayments(companyId),
      this.getTopWorkers(companyId),
      billsCol.countDocuments({ company_id: companyId }),
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
}
