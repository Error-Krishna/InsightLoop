import type { Request, Response } from 'express';
import {
  WorkersService,
  type BatchInput,
  type CompleteAssignmentInput,
  type MaterialInput,
  type PaymentInput,
  type RawIssueInput,
  type WorkerInput,
} from './workers.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class WorkersController {
  // Workers collection
  static async listWorkers(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const list = await WorkersService.listWorkers(scope);
    res.status(200).json(list);
  }

  static async createWorker(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const worker = await WorkersService.createWorker(scope, req.body as WorkerInput);
    res.status(201).json(worker);
  }

  // Specific actions (batches & complete)
  static async addBatch(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const assignmentId = req.params.assignment_id as string;
    const result = await WorkersService.addBatch(scope, assignmentId, req.body as BatchInput);
    res.status(201).json(result);
  }

  static async issueRawMaterial(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const assignmentId = req.params.assignment_id as string;
    const result = await WorkersService.issueRawMaterial(scope, assignmentId, req.body as RawIssueInput);
    res.status(201).json(result);
  }

  static async completeAssignment(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const assignmentId = req.params.assignment_id as string;
    const result = await WorkersService.completeAssignment(scope, assignmentId, req.body as CompleteAssignmentInput);
    res.status(200).json(result);
  }

  static async cancelAssignment(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const assignmentId = req.params.assignment_id as string;
    const result = await WorkersService.cancelAssignment(scope, assignmentId);
    res.status(200).json(result);
  }

  // Payments actions
  static async markPaymentPaid(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const paymentId = req.params.payment_id as string;
    const result = await WorkersService.markPaymentPaid(scope, paymentId);
    res.status(200).json(result);
  }

  static async recordPartialPayment(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const paymentId = req.params.payment_id as string;
    const amount = parseFloat(String((req.body as { amount?: number | string }).amount ?? 0)) || 0;
    const result = await WorkersService.recordPartialPayment(scope, paymentId, amount);
    res.status(201).json(result);
  }

  // Worker-scoped sub-routes
  static async listMaterials(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    const list = await WorkersService.listMaterials(scope, workerId);
    res.status(200).json(list);
  }

  static async createMaterial(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    const result = await WorkersService.createMaterial(scope, workerId, req.body as MaterialInput);
    res.status(201).json(result);
  }

  static async listPayments(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    const list = await WorkersService.listPayments(scope, workerId);
    res.status(200).json(list);
  }

  static async createPayment(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    const result = await WorkersService.createPayment(scope, workerId, req.body as PaymentInput);
    res.status(201).json(result);
  }

  // Worker detail
  static async getWorker(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    const worker = await WorkersService.getWorker(scope, workerId);
    res.status(200).json(worker);
  }

  static async updateWorker(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    const worker = await WorkersService.updateWorker(scope, workerId, req.body as WorkerInput);
    res.status(200).json(worker);
  }

  static async deleteWorker(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const workerId = req.params.worker_id as string;
    await WorkersService.deleteWorker(scope, workerId);
    res.status(204).send();
  }
}
