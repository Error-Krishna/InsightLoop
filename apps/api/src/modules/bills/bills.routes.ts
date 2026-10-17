import { Router } from 'express';
import { BillsController } from './bills.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const billsRouter = Router();

billsRouter.use(requireAuth);

// 1. Collections & Filters
billsRouter.get('/', asyncHandler(BillsController.listBills));
billsRouter.post('/', asyncHandler(BillsController.createBill));
billsRouter.post('/kacha', asyncHandler(BillsController.createKacha));
billsRouter.all('/kacha', (req, res) => {
  res.status(405).json({ detail: `Method "${req.method}" not allowed.` });
});
billsRouter.post('/pakka', asyncHandler(BillsController.createPakka));
billsRouter.all('/pakka', (req, res) => {
  res.status(405).json({ detail: `Method "${req.method}" not allowed.` });
});

// 2. Specific Bill Actions
billsRouter.get('/:id', asyncHandler(BillsController.getBill));
billsRouter.put('/:id', asyncHandler(BillsController.updateBill));
billsRouter.delete('/:id', asyncHandler(BillsController.deleteBill));
billsRouter.post('/:id/convert', asyncHandler(BillsController.convertToPakka));
billsRouter.post('/:id/record-payment', asyncHandler(BillsController.recordPayment));
billsRouter.get('/:id/profit-preview', asyncHandler(BillsController.getProfitPreview));
billsRouter.post('/:id/confirm-profit', asyncHandler(BillsController.confirmProfit));
billsRouter.post('/:id/reopen-profit', asyncHandler(BillsController.reopenProfit));
billsRouter.post('/:id/transportation-cost', asyncHandler(BillsController.addTransportationCost));
billsRouter.post('/:id/misc-cost', asyncHandler(BillsController.addMiscCost));
billsRouter.post('/:id/ready-to-deliver', asyncHandler(BillsController.addReadyToDeliver));
billsRouter.post('/:id/confirm-shipment', asyncHandler(BillsController.confirmShipment));
billsRouter.get('/:id/assignments', asyncHandler(BillsController.getBillAssignments));
billsRouter.get('/:id/pdf', asyncHandler(BillsController.getBillPdf));
billsRouter.post('/:id/share-whatsapp', asyncHandler(BillsController.shareWhatsApp));
