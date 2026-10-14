import { Router, type Request, type Response } from 'express';
import { BillsService } from './bills.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const billsRouter = Router();

billsRouter.use(requireAuth);

// 1. Collections & Filters
billsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const billType = req.query.type as string | undefined;
    const list = await BillsService.listBills(req.companyId!, billType);
    res.status(200).json(list);
  })
);

billsRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const billType = req.body.bill_type || 'kacha';
    const bill = await BillsService.createBill(req.companyId!, billType, req.body);
    res.status(201).json(bill);
  })
);

billsRouter.post(
  '/kacha',
  asyncHandler(async (req: Request, res: Response) => {
    const bill = await BillsService.createBill(req.companyId!, 'kacha', req.body);
    res.status(201).json(bill);
  })
);

billsRouter.post(
  '/pakka',
  asyncHandler(async (req: Request, res: Response) => {
    const bill = await BillsService.createBill(req.companyId!, 'pakka', req.body);
    res.status(201).json(bill);
  })
);

// 2. Specific Bill Actions
billsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.getBill(req.companyId!, id);
    res.status(200).json(bill);
  })
);

billsRouter.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.updateBill(req.companyId!, id, req.body);
    res.status(200).json(bill);
  })
);

billsRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await BillsService.deleteBill(req.companyId!, id);
    res.status(204).send();
  })
);

billsRouter.post(
  '/:id/convert',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.convertToPakka(req.companyId!, id, req.body);
    res.status(200).json(bill);
  })
);

billsRouter.post(
  '/:id/record-payment',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.recordPayment(req.companyId!, id, req.body);
    res.status(201).json(bill);
  })
);

billsRouter.get(
  '/:id/profit-preview',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const preview = await BillsService.getProfitPreview(req.companyId!, id);
    res.status(200).json(preview);
  })
);

billsRouter.post(
  '/:id/confirm-profit',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const override = req.body.confirmed_amount !== undefined ? parseFloat(req.body.confirmed_amount) : undefined;
    const bill = await BillsService.confirmProfit(req.companyId!, id, override);
    res.status(200).json(bill);
  })
);

billsRouter.post(
  '/:id/reopen-profit',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.reopenProfit(req.companyId!, id);
    res.status(200).json(bill);
  })
);

billsRouter.post(
  '/:id/transportation-cost',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.addTransportationCost(req.companyId!, id, req.body);
    res.status(201).json(bill);
  })
);

billsRouter.post(
  '/:id/misc-cost',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.addMiscCost(req.companyId!, id, req.body);
    res.status(201).json(bill);
  })
);

billsRouter.post(
  '/:id/ready-to-deliver',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.addReadyToDeliver(req.companyId!, id, req.body);
    res.status(201).json(bill);
  })
);

billsRouter.post(
  '/:id/confirm-shipment',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const bill = await BillsService.confirmShipment(req.companyId!, id);
    res.status(200).json(bill);
  })
);
