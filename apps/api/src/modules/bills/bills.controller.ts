import type { Request, Response } from 'express';
import {
  BillsService,
  type BillInput,
  type CostInput,
  type PaymentInput,
  type ShipmentInput,
} from './bills.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class BillsController {
  // Collections & filters
  static async listBills(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const billType = req.query.type as string | undefined;
    const list = await BillsService.listBills(scope, billType);
    res.status(200).json(list);
  }

  static async createBill(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const billType = (req.body as { bill_type?: string }).bill_type ?? 'kacha';
    const bill = await BillsService.createBill(scope, billType, req.body as BillInput);
    res.status(201).json(bill);
  }

  static async createKacha(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const bill = await BillsService.createBill(scope, 'kacha', req.body as BillInput);
    res.status(201).json(bill);
  }

  static async createPakka(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const bill = await BillsService.createBill(scope, 'pakka', req.body as BillInput);
    res.status(201).json(bill);
  }

  // Specific Bill Actions
  static async getBill(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.getBill(scope, id);
    res.status(200).json(bill);
  }

  static async updateBill(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.updateBill(scope, id, req.body as BillInput);
    res.status(200).json(bill);
  }

  static async deleteBill(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    await BillsService.deleteBill(scope, id);
    res.status(204).send();
  }

  static async convertToPakka(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.convertToPakka(scope, id, req.body as { gst_number?: string; gst_percentage?: number | string; products?: BillInput['products'] });
    res.status(200).json(bill);
  }

  static async recordPayment(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.recordPayment(scope, id, req.body as PaymentInput);
    res.status(201).json(bill);
  }

  static async getProfitPreview(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const preview = await BillsService.getProfitPreview(scope, id);
    res.status(200).json(preview);
  }

  static async confirmProfit(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const override = (req.body as { confirmed_amount?: number | string }).confirmed_amount !== undefined
      ? parseFloat(String((req.body as { confirmed_amount?: number | string }).confirmed_amount))
      : undefined;
    const bill = await BillsService.confirmProfit(scope, id, override);
    res.status(200).json(bill);
  }

  static async reopenProfit(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.reopenProfit(scope, id);
    res.status(200).json(bill);
  }

  static async addTransportationCost(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.addTransportationCost(scope, id, req.body as CostInput);
    res.status(201).json(bill);
  }

  static async addMiscCost(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.addMiscCost(scope, id, req.body as CostInput);
    res.status(201).json(bill);
  }

  static async createShipment(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const bill = await BillsService.createShipment(scope, id, req.body as ShipmentInput);
    res.status(201).json(bill);
  }

  static async getBillAssignments(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const assignments = await BillsService.getBillAssignments(scope, id);
    res.status(200).json(assignments);
  }

  static async getBillPdf(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const { pdf, filename } = await BillsService.getBillPdf(scope, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.status(200).send(pdf);
  }

  static async shareWhatsApp(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const body = req.body as { phone?: string } | undefined;
    const phone = typeof body?.phone === 'string' ? body.phone : undefined;
    const result = await BillsService.shareWhatsApp(scope, id, phone);
    res.status(200).json(result);
  }
}
