import { Router, type Request, type Response } from 'express';
import { getCollection } from '../../db/mongo.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const contactRouter = Router();

contactRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, message } = req.body;
    const contactCol = getCollection('contact_messages');

    await contactCol.insertOne({
      name: name || '',
      email: email || '',
      message: message || '',
      created_at: new Date(),
    });

    res.status(200).json({ status: 'ok' });
  })
);

contactRouter.all(
  '/',
  (_req: Request, res: Response) => {
    res.status(405).json({ detail: 'Use POST to submit the contact form.' });
  }
);
