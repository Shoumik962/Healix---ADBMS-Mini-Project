import { Router as PRouter } from 'express';
import { authenticate as auth, authorize as authz } from '../middleware/auth.js';
import { getPatientProfile, updatePatientProfile } from '../controllers/doctorsController.js';

export const patientsRouter = PRouter();
patientsRouter.get('/profile', auth, authz('patient'), getPatientProfile);
patientsRouter.put('/profile', auth, authz('patient'), updatePatientProfile);
patientsRouter.get('/:userId', auth, authz('admin'), getPatientProfile);