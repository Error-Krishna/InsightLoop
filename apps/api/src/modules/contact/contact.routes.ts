import { Router } from 'express';
import { ContactController } from './contact.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const contactRouter = Router();

contactRouter.post('/', asyncHandler(ContactController.submit));
contactRouter.all('/', ContactController.methodNotAllowed);
