// routes/appointments.js
import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
    bookAppointment, cancelAppointment, completeAppointment,
    getAppointment, getMyAppointments, getDoctorAppointments,
    getAllAppointments,
} from '../controllers/appointmentsController.js';

const router = Router();

// All appointment routes require auth
router.use(authenticate);

// Patient: book
router.post('/',
    authorize('patient'),
    [
        body('doctor_id').isUUID(),
        body('appointment_dt').isISO8601().withMessage('Invalid datetime'),
        body('reason').trim().isLength({ min: 5, max: 500 }),
    ],
    validate,
    bookAppointment
);

// Patient: own appointments
router.get('/my', authorize('patient'), getMyAppointments);

// Doctor: own appointments
router.get('/doctor', authorize('doctor'), getDoctorAppointments);

// Admin: all appointments
router.get('/admin/all', authorize('admin'), getAllAppointments);

// Shared: get single appointment
router.get('/:id', getAppointment);

// Cancel (patient, doctor, admin)
router.put('/:id/cancel',
    authorize('patient', 'doctor', 'admin'),
    [body('cancel_reason').optional().trim()],
    validate,
    cancelAppointment
);

// Complete (doctor, admin only)
router.put('/:id/complete',
    authorize('doctor', 'admin'),
    [body('notes').optional().trim()],
    validate,
    completeAppointment
);

export default router;