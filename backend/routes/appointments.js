// routes/appointments.js (v2)
import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
    bookAppointment, confirmAppointment, cancelAppointment,
    completeAppointment, markNoShow, rescheduleAppointment,
    getAppointment, getMyAppointments, getDoctorAppointments,
    getTodaysAppointments, getUpcomingAppointments, getStats,
    getAllAppointments,
} from '../controllers/appointmentsController.js';

const router = Router();
router.use(authenticate);

router.get('/stats', getStats);
router.get('/my', authorize('patient'), getMyAppointments);
router.get('/upcoming', authorize('patient'), getUpcomingAppointments);
router.get('/doctor', authorize('doctor'), getDoctorAppointments);
router.get('/doctor/today', authorize('doctor'), getTodaysAppointments);
router.get('/admin/all', authorize('admin'), getAllAppointments);

router.post('/', authorize('patient'),
    [body('doctor_id').isUUID(),
    body('appointment_dt').isISO8601().custom(v => new Date(v) > new Date()),
    body('reason').trim().isLength({ min: 5, max: 500 })],
    validate, bookAppointment);

router.post('/:id/reschedule', authorize('patient'),
    [body('new_appointment_dt').isISO8601().custom(v => new Date(v) > new Date()),
    body('reason').optional().trim().isLength({ max: 500 })],
    validate, rescheduleAppointment);

router.put('/:id/confirm', authorize('doctor'), confirmAppointment);
router.put('/:id/complete', authorize('doctor', 'admin'), completeAppointment);
router.put('/:id/no-show', authorize('doctor', 'admin'), markNoShow);
router.put('/:id/cancel', authorize('patient', 'doctor', 'admin'),
    [body('cancel_reason').optional().trim().isLength({ max: 500 })],
    validate, cancelAppointment);

router.get('/:id', getAppointment);
export default router;