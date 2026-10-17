import { Router } from 'express';
import { WorkersController } from './workers.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const workersRouter = Router();

workersRouter.use(requireAuth);

// 1. Workers Collection
workersRouter.get('/', asyncHandler(WorkersController.listWorkers));
workersRouter.post('/', asyncHandler(WorkersController.createWorker));

// 2. Specific actions (batches & complete)
workersRouter.post('/materials/:assignment_id/batches', asyncHandler(WorkersController.addBatch));
workersRouter.put('/materials/:assignment_id/complete', asyncHandler(WorkersController.completeAssignment));
workersRouter.put('/payments/:payment_id/mark-paid', asyncHandler(WorkersController.markPaymentPaid));
workersRouter.post('/payments/:payment_id/record-payment', asyncHandler(WorkersController.recordPartialPayment));

// 3. Worker-scoped sub-routes
workersRouter.get('/:worker_id/materials', asyncHandler(WorkersController.listMaterials));
workersRouter.post('/:worker_id/materials', asyncHandler(WorkersController.createMaterial));
workersRouter.get('/:worker_id/payments', asyncHandler(WorkersController.listPayments));
workersRouter.post('/:worker_id/payments', asyncHandler(WorkersController.createPayment));

// 4. Worker Detail
workersRouter.get('/:worker_id', asyncHandler(WorkersController.getWorker));
workersRouter.put('/:worker_id', asyncHandler(WorkersController.updateWorker));
workersRouter.delete('/:worker_id', asyncHandler(WorkersController.deleteWorker));
