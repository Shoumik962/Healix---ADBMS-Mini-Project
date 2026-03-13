// routes/prescriptions.js
import { Router as RxRouter } from 'express';
import {
    issuePrescription, getPrescription, getMyPrescriptions
} from '../controllers/doctorsController.js';

export const prescriptionsRouter = RxRouter();
prescriptionsRouter.use(authenticate);
prescriptionsRouter.post('/', authorize('doctor'), issuePrescription);
prescriptionsRouter.get('/my', getMyPrescriptions);
prescriptionsRouter.get('/:id', getPrescription);