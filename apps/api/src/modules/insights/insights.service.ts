import { ObjectId } from 'mongodb';
import { InsightsRepository } from './insights.repository.js';
import { NotFoundError } from '../../utils/errors.js';
import { formatDjangoIso } from '../../utils/timezone.js';
import type { TenantScope } from '../../types/tenant.js';

export class InsightsService {
  static async listInsights(scope: TenantScope) {
    const insights = await InsightsRepository.findInsights(scope);

    return insights.map((i) => ({
      id: i._id.toString(),
      title: i.title || '',
      description: i.description || '',
      labels: i.labels ?? [],
      data_points: i.data_points ?? [],
      note: i.note ?? '',
      created_at: i.created_at ? formatDjangoIso(i.created_at) : null,
    }));
  }

  static async analyzeSalesData(scope: TenantScope) {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const bizData = await InsightsRepository.findBusinessData(
      scope,
      { date: { $gte: startDate, $lte: endDate } },
      { date: 1, product: 1, quantity: 1, selling_price: 1 }
    );

    if (!bizData || bizData.length === 0) {
      return { count: 0, insights: [] };
    }

    const dailySales = new Map<string, number>();
    const productSales = new Map<string, number>();

    for (const record of bizData) {
      const qty = Number(record.quantity) || 0;
      const price = Number(record.selling_price) || 0;
      const revenue = qty * price;

      const dateObj = record.date instanceof Date ? record.date : new Date(record.date as string | Date);
      const dateKey = dateObj.toISOString().split('T')[0];

      dailySales.set(dateKey, (dailySales.get(dateKey) ?? 0) + revenue);
      const prod = (record.product as string) || 'Unknown';
      productSales.set(prod, (productSales.get(prod) ?? 0) + revenue);
    }

    const sortedDates = [...dailySales.keys()].sort();
    const amounts = sortedDates.map((d) => dailySales.get(d)!);

    const generatedInsights: {
      title: string;
      description: string;
      labels: string[];
      data_points: number[];
    }[] = [];

    // 1. Spikes / Drops detection
    if (amounts.length >= 5) {
      const movingAvg: number[] = [];
      for (let i = 0; i < amounts.length; i++) {
        const window = amounts.slice(Math.max(0, i - 2), i + 1);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        movingAvg.push(avg);
      }

      // Standard deviation
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      const threshold = Math.max(0.5 * stdDev, 5);

      for (let i = 2; i < amounts.length; i++) {
        const deviation = amounts[i] - movingAvg[i];
        if (Math.abs(deviation) > threshold) {
          const insightType = deviation > 0 ? 'spike' : 'drop';
          const [y, m, d] = sortedDates[i].split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const monthAbbr = dateObj.toLocaleString('en-US', { month: 'short' });
          const dayFormatted = String(d).padStart(2, '0');

          const insightTitle = `Sales ${insightType.charAt(0).toUpperCase() + insightType.slice(1)} on ${monthAbbr} ${dayFormatted}`;
          const insightDesc = `Detected sales ${insightType} ($${amounts[i].toFixed(2)}) vs $${movingAvg[i].toFixed(2)} average (Δ$${Math.abs(deviation).toFixed(2)})`;

          const startIdx = Math.max(0, i - 2);
          const endIdx = Math.min(sortedDates.length, i + 3);

          generatedInsights.push({
            title: insightTitle,
            description: insightDesc,
            labels: sortedDates.slice(startIdx, endIdx).map((dt) => {
              const [, mm, dd] = dt.split('-').map(Number);
              return `${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}`;
            }),
            data_points: amounts.slice(startIdx, endIdx),
          });
        }
      }
    }

    // 2. Product performance
    if (productSales.size > 0) {
      const sortedProducts = [...productSales.entries()].sort((a, b) => b[1] - a[1]);
      const topProducts = sortedProducts.slice(0, Math.min(5, sortedProducts.length));

      const insightTitle = 'Top Performing Products';
      const insightDesc = `${topProducts[0][0]} is the top performer with $${topProducts[0][1].toFixed(2)} in sales`;

      generatedInsights.push({
        title: insightTitle,
        description: insightDesc,
        labels: topProducts.map((p) => p[0]),
        data_points: topProducts.map((p) => p[1]),
      });
    }

    const createdInsights = [];
    for (const item of generatedInsights) {
      const created = await InsightsRepository.insertInsight(scope, {
        title: item.title,
        description: item.description,
        labels: item.labels,
        data_points: item.data_points,
        note: '',
        created_at: undefined,
      });

      // Characterization: created_at is null in the immediate POST /analyze/ response
      createdInsights.push({
        id: created._id.toString(),
        title: created.title,
        description: created.description,
        labels: created.labels,
        data_points: created.data_points,
        note: '',
        created_at: null,
      });
    }

    return {
      count: createdInsights.length,
      insights: createdInsights,
    };
  }

  static async deleteInsight(scope: TenantScope, insightId: string) {
    if (!ObjectId.isValid(insightId)) {
      throw new NotFoundError('Insight not found.');
    }

    const deleted = await InsightsRepository.deleteInsight(scope, insightId);
    if (!deleted) {
      throw new NotFoundError('Insight not found.');
    }
  }

  static async exportInsight(scope: TenantScope, insightId: string) {
    if (!ObjectId.isValid(insightId)) {
      throw new NotFoundError('Insight not found.');
    }

    const insight = await InsightsRepository.findInsightById(scope, insightId);
    if (!insight) {
      throw new NotFoundError('Insight not found.');
    }

    const lines: string[] = [];
    lines.push('Insight Title,Description,Note');
    lines.push(`${insight.title || ''},${insight.description || ''},${insight.note ?? ''}`);
    lines.push('');
    lines.push('Period,Value');

    const labels = (insight.labels) ?? [];
    const dataPoints = (insight.data_points as number[] | undefined) ?? [];
    for (let i = 0; i < Math.max(labels.length, dataPoints.length); i++) {
      const lbl = labels[i] ?? '';
      const val = dataPoints[i] !== undefined ? Number(dataPoints[i]).toFixed(1) : '';
      lines.push(`${lbl},${val}`);
    }

    return lines.join('\r\n') + '\r\n';
  }
}
