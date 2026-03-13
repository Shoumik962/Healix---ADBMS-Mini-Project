import { Router as NRouter } from 'express';
import { getNotifications, markNotificationRead } from '../controllers/doctorsController.js';

export const notificationsRouter = NRouter();
notificationsRouter.use(authenticate);
notificationsRouter.get('/', getNotifications);
notificationsRouter.put('/:id/read', markNotificationRead);