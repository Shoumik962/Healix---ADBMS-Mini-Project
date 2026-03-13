// routes/admin.js
import { Router as ARouter } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
    adminApproveDoctor, adminManageUser, adminGetReport,
    adminGetDashboard, adminListUsers, adminGetActivityLogs,
    adminGetPendingDoctors,
} from '../controllers/doctorsController.js';


export const adminRouter = ARouter();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/dashboard', adminGetDashboard);
adminRouter.get('/report', adminGetReport);
adminRouter.get('/users', adminListUsers);
adminRouter.get('/doctors/pending', adminGetPendingDoctors);
adminRouter.get('/activity-logs', adminGetActivityLogs);
adminRouter.put('/doctors/:doctorId/status', adminApproveDoctor);
adminRouter.put('/users/:userId/manage', adminManageUser);