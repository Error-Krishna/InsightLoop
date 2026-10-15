import { type ObjectId } from 'mongodb';
import { AiRepository } from './ai.repository.js';
import type { TenantScope } from '../../types/tenant.js';
import { logger } from '../../utils/logger.js';

export class AiService {
  static getConfig() {
    return {
      websocket_path: '/ws/ai-assistant/',
      starter_prompts: [
        'Export business trends',
        'Show me revenue trends',
        'Show worker productivity',
      ],
    };
  }

  static async getInsightData(scope: TenantScope, insightType: string) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (insightType === 'revenue_trends') {
      const pipeline = [
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            total_revenue: { $sum: { $multiply: ['$quantity', '$selling_price'] } },
          },
        },
        { $sort: { _id: 1 as const } },
      ];

      const results = await AiRepository.aggregateBusinessData<{ _id: string; total_revenue: number }>(scope, pipeline);
      return results.map((r) => ({
        date: String(r._id),
        revenue: Number(r.total_revenue) || 0,
      }));
    }

    if (insightType === 'profit_analysis') {
      const pipeline = [
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
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
        { $sort: { _id: 1 as const } },
      ];

      const results = await AiRepository.aggregateBusinessData<{ _id: string; total_profit: number }>(scope, pipeline);
      return results.map((r) => ({
        date: String(r._id),
        profit: Number(r.total_profit) || 0,
      }));
    }

    if (insightType === 'worker_performance') {
      const workers = await AiRepository.findActiveWorkers(scope);
      const performanceData = [];

      for (const worker of workers) {
        const payments = await AiRepository.findWorkerPayRecords(scope, worker._id as ObjectId);
        const totalUnits = payments.reduce((sum, p) => sum + (Number(p.units_produced) || 0), 0);
        const avgPayRate = payments.length > 0
          ? payments.reduce((sum, p) => sum + (Number(p.rate_per_unit) || 0), 0) / payments.length
          : 0;

        const materials = await AiRepository.findWorkerMaterials(scope, worker._id as ObjectId);
        const materialCost = materials.reduce(
          (sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.price_per_unit) || 0),
          0
        );
        const revenueGenerated = payments.reduce(
          (sum, p) => sum + (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0),
          0
        );

        const efficiency = materialCost > 0 ? (revenueGenerated / materialCost) * 100 : 0;

        performanceData.push({
          name: (worker.name as string | undefined) ?? 'Unknown',
          total_units: totalUnits,
          avg_pay_rate: avgPayRate,
          efficiency: Math.round(efficiency * 100) / 100,
        });
      }

      return performanceData;
    }

    return [];
  }

  static async processAiCommand(scope: TenantScope, userEmail: string, command: string, assistantType = 'jarvis') {
    const cmd = (command || '').toLowerCase();
    const response: Record<string, unknown> = {
      assistant: assistantType,
      timestamp: new Date().toISOString(),
    };

    try {
      if (cmd.includes('export')) {
        let exportType: string | null = null;
        if (['business', 'sales', 'revenue'].some((kw) => cmd.includes(kw))) {
          exportType = 'business_trends';
        } else if (['worker', 'labor', 'staff'].some((kw) => cmd.includes(kw))) {
          exportType = 'worker_management';
        } else if (['salary', 'payment', 'payroll'].some((kw) => cmd.includes(kw))) {
          exportType = 'salary_payments';
        } else if (['complete', 'all', 'full'].some((kw) => cmd.includes(kw))) {
          exportType = 'complete_analytics';
        }

        if (exportType) {
          const fileUrl = `/api/v1/export/${exportType}/`;
          response.action = 'download';
          response.file_url = fileUrl;
          response.message = `Your ${exportType.replace('_', ' ')} export is ready!`;
        } else {
          response.action = 'message';
          response.content =
            'Please specify what to export: business trends, worker management, salary payments, or complete analytics';
        }
      } else if (['dashboard', 'home', 'overview'].some((kw) => cmd.includes(kw))) {
        response.action = 'navigate';
        response.url = '/dashboard';
      } else if (['insight', 'analysis', 'findings'].some((kw) => cmd.includes(kw))) {
        response.action = 'navigate';
        response.url = '/insights';
      } else if (['upload', 'import', 'data'].some((kw) => cmd.includes(kw))) {
        response.action = 'navigate';
        response.url = '/upload';
      } else if (['workers', 'staff'].some((kw) => cmd.includes(kw))) {
        response.action = 'navigate';
        response.url = '/workers';
      } else if (['bills', 'invoice'].some((kw) => cmd.includes(kw))) {
        response.action = 'navigate';
        response.url = '/bills/pakka';
      } else if (['inventory', 'stock'].some((kw) => cmd.includes(kw))) {
        response.action = 'navigate';
        response.url = '/inventory/finished';
      } else if (['show', 'display', 'what is', 'how much'].some((kw) => cmd.includes(kw))) {
        if (['revenue', 'income', 'sales'].some((kw) => cmd.includes(kw))) {
          const data = await this.getInsightData(scope, 'revenue_trends');
          response.action = 'display';
          response.content = JSON.stringify({ type: 'revenue_trends', data });
        } else if (['profit', 'earnings', 'margin'].some((kw) => cmd.includes(kw))) {
          const data = await this.getInsightData(scope, 'profit_analysis');
          response.action = 'display';
          response.content = JSON.stringify({ type: 'profit_analysis', data });
        } else if (['worker', 'staff', 'labor', 'productivity'].some((kw) => cmd.includes(kw))) {
          const data = await this.getInsightData(scope, 'worker_performance');
          response.action = 'display';
          response.content = JSON.stringify({ type: 'worker_performance', data });
        } else {
          response.action = 'message';
          response.content = 'I can show you revenue trends, profit analysis, or worker performance';
        }
      } else {
        response.action = 'message';
        response.content =
          "I can help with exports, navigation, or data analysis. Try: 'Export business trends' or 'Show me worker productivity'";
      }
    } catch (err: unknown) {
      logger.error({ err, companyId: scope.companyId, userEmail, command }, 'Error processing AI command');
      response.action = 'error';
      response.content = 'Error processing your request: An unexpected error occurred while processing your request.';
    }

    return response;
  }
}
