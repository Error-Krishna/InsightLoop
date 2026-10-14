import { Router, type Request, type Response } from 'express';
import { WorkersService } from './workers.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const workersRouter = Router();

workersRouter.use(requireAuth);

// 1. Workers Collection
workersRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const list = await WorkersService.listWorkers(req.companyId!);
    res.status(200).json(list);
  })
);

workersRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const worker = await WorkersService.createWorker(req.companyId!, req.body);
    res.status(201).json(worker);
  })
);

// 2. Specific actions (payments & material batches)
workersRouter.post(
  '/materials/:assignment_id/batches',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignment_id as string;
    const result = await WorkersService.addBatch(req.companyId!, assignmentId, req.body);
    res.status(201).json(result);
  })
);

workersRouter.put(
  '/materials/:assignment_id/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignment_id as string;
    const result = await WorkersService.completeAssignment(req.companyId!, assignmentId);
    res.status(200).json(result);
  })
);

workersRouter.put(
  '/payments/:payment_id/mark-paid',
  asyncHandler(async (req: Request, res: Response) => {
    const paymentId = req.params.payment_id as string;
    const result = await WorkersService.markPaymentPaid(req.companyId!, paymentId);
    res.status(200).json(result);
  })
);

workersRouter.post(
  '/payments/:payment_id/record-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const paymentId = req.params.payment_id as string;
    const amount = parseFloat(req.body.amount) || 0;
    const result = await WorkersService.recordPartialPayment(req.companyId!, paymentId, amount);
    res.status(201).json(result);
  })
);

// 3. Worker-scoped sub-routes
workersRouter.get(
  '/:worker_id/materials',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    const list = await WorkersService.listMaterials(req.companyId!, workerId);
    res.status(200).json(list);
  })
);

workersRouter.post(
  '/:worker_id/materials',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    const result = await WorkersService.createMaterial(req.companyId!, workerId, req.body);
    res.status(201).json(result);
  })
);

workersRouter.get(
  '/:worker_id/payments',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    const list = await WorkersService.listPayments(req.companyId!, workerId);
    res.status(200).json(list);
  })
);

workersRouter.post(
  '/:worker_id/payments',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    const result = await WorkersService.createPayment(req.companyId!, workerId, req.body);
    res.status(201).json(result);
  })
);

// 4. Worker Detail
workersRouter.get(
  '/:worker_id',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    const worker = await WorkersService.getWorker(req.companyId!, workerId);
    res.status(200).json(worker);
  })
);

workersRouter.put(
  '/:worker_id',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    const worker = await WorkersService.updateWorker(req.companyId!, workerId, req.body);
    res.status(200).json(worker);
  })
);

workersRouter.delete(
  '/:worker_id',
  asyncHandler(async (req: Request, res: Response) => {
    const workerId = req.params.worker_id as string;
    await WorkersService.deleteWorker(req.companyId!, workerId);
    res.status(204).send();
  })
);
