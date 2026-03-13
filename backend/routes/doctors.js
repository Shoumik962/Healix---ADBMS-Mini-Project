// routes/doctors.js
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
    searchDoctors, getDoctorProfile, getDoctorSchedule,
    getAvailableSlots, updateDoctorProfile, setAvailability,
    getSpecializations,
} from '../controllers/doctorsController.js';

const router = Router();

router.get('/specializations', getSpecializations);
router.get('/search', searchDoctors);
router.get('/:id', getDoctorProfile);
router.get('/:id/schedule', getDoctorSchedule);
router.get('/:id/available-slots', getAvailableSlots);

router.put('/profile', authenticate, authorize('doctor'), updateDoctorProfile);
router.put('/availability', authenticate, authorize('doctor'), setAvailability);

export default router;

// // ─────────────────────────────────────────────────────────────
// // routes/patients.js
// import { Router as PRouter } from 'express';
// import { authenticate as auth, authorize as authz } from '../middleware/auth.js';
// import { getPatientProfile, updatePatientProfile } from '../controllers/doctorsController.js';

// export const patientsRouter = PRouter();
// patientsRouter.get('/profile', auth, authz('patient'), getPatientProfile);
// patientsRouter.put('/profile', auth, authz('patient'), updatePatientProfile);
// patientsRouter.get('/:userId', auth, authz('admin'), getPatientProfile);

// // ─────────────────────────────────────────────────────────────
// // routes/prescriptions.js
// import { Router as RxRouter } from 'express';
// import {
//     issuePrescription, getPrescription, getMyPrescriptions
// } from '../controllers/doctorsController.js';

// export const prescriptionsRouter = RxRouter();
// prescriptionsRouter.use(authenticate);
// prescriptionsRouter.post('/', authorize('doctor'), issuePrescription);
// prescriptionsRouter.get('/my', getMyPrescriptions);
// prescriptionsRouter.get('/:id', getPrescription);

// // ─────────────────────────────────────────────────────────────
// // routes/admin.js
// import { Router as ARouter } from 'express';
// import {
//     adminApproveDoctor, adminManageUser, adminGetReport,
//     adminGetDashboard, adminListUsers, adminGetActivityLogs,
//     adminGetPendingDoctors,
// } from '../controllers/doctorsController.js';

// export const adminRouter = ARouter();
// adminRouter.use(authenticate);
// adminRouter.use(authorize('admin'));

// adminRouter.get('/dashboard', adminGetDashboard);
// adminRouter.get('/report', adminGetReport);
// adminRouter.get('/users', adminListUsers);
// adminRouter.get('/doctors/pending', adminGetPendingDoctors);
// adminRouter.get('/activity-logs', adminGetActivityLogs);
// adminRouter.put('/doctors/:doctorId/status', adminApproveDoctor);
// adminRouter.put('/users/:userId/manage', adminManageUser);

// // ─────────────────────────────────────────────────────────────
// // routes/notifications.js
// import { Router as NRouter } from 'express';
// import { getNotifications, markNotificationRead } from '../controllers/doctorsController.js';

// export const notificationsRouter = NRouter();
// notificationsRouter.use(authenticate);
// notificationsRouter.get('/', getNotifications);
// notificationsRouter.put('/:id/read', markNotificationRead);