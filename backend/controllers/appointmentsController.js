// controllers/appointmentsController.js (v2)
import { ApiResponse } from '../utils/apiResponse.js';
import * as apptService from '../services/appointmentService.js';

export async function bookAppointment(req, res, next) {
  try {
    const { doctor_id, appointment_dt, reason } = req.body;
    const result = await apptService.bookAppointment({
      patientUserId: req.user.id, doctorId: doctor_id,
      appointmentDt: appointment_dt, reason,
    });
    return ApiResponse.created(res, result, 'Appointment booked successfully');
  } catch (err) { next(err); }
}

export async function confirmAppointment(req, res, next) {
  try {
    const result = await apptService.confirmAppointment({ appointmentId: req.params.id, doctorUserId: req.user.id });
    return ApiResponse.success(res, result, 'Appointment confirmed');
  } catch (err) { next(err); }
}

export async function cancelAppointment(req, res, next) {
  try {
    const result = await apptService.cancelAppointment({
      appointmentId: req.params.id, callerUserId: req.user.id,
      callerRole: req.user.role, cancelReason: req.body.cancel_reason,
    });
    return ApiResponse.success(res, result, 'Appointment cancelled');
  } catch (err) { next(err); }
}

export async function completeAppointment(req, res, next) {
  try {
    const result = await apptService.completeAppointment({
      appointmentId: req.params.id, doctorUserId: req.user.id,
      callerRole: req.user.role, notes: req.body.notes,
    });
    return ApiResponse.success(res, result, 'Appointment completed');
  } catch (err) { next(err); }
}

export async function markNoShow(req, res, next) {
  try {
    const result = await apptService.markNoShow({
      appointmentId: req.params.id, doctorUserId: req.user.id, callerRole: req.user.role,
    });
    return ApiResponse.success(res, result, 'Marked as no-show');
  } catch (err) { next(err); }
}

export async function rescheduleAppointment(req, res, next) {
  try {
    const result = await apptService.rescheduleAppointment({
      appointmentId: req.params.id, newAppointmentDt: req.body.new_appointment_dt,
      patientUserId: req.user.id, reason: req.body.reason,
    });
    return ApiResponse.success(res, result, 'Appointment rescheduled');
  } catch (err) { next(err); }
}

export async function getAppointment(req, res, next) {
  try {
    const appt = await apptService.getAppointmentById(req.params.id, req.user.id, req.user.role);
    if (!appt) return ApiResponse.notFound(res, 'Appointment not found');
    return ApiResponse.success(res, appt);
  } catch (err) { next(err); }
}

export async function getMyAppointments(req, res, next) {
  try {
    const { status, page = 1, page_size = 10 } = req.query;
    const { data, totalCount } = await apptService.getPatientAppointments({
      patientUserId: req.user.id, status: status || null,
      page: parseInt(page), pageSize: parseInt(page_size),
    });
    return ApiResponse.paginated(res, data, { page: parseInt(page), pageSize: parseInt(page_size), totalCount });
  } catch (err) { next(err); }
}

export async function getDoctorAppointments(req, res, next) {
  try {
    const { status, date_from, date_to, page = 1, page_size = 20 } = req.query;
    const { data, totalCount } = await apptService.getDoctorAppointments({
      doctorUserId: req.user.id, status: status || null,
      dateFrom: date_from || null, dateTo: date_to || null,
      page: parseInt(page), pageSize: parseInt(page_size),
    });
    return ApiResponse.paginated(res, data, { page: parseInt(page), pageSize: parseInt(page_size), totalCount });
  } catch (err) { next(err); }
}

export async function getTodaysAppointments(req, res, next) {
  try {
    const data = await apptService.getTodaysAppointments(req.user.id);
    return ApiResponse.success(res, data);
  } catch (err) { next(err); }
}

export async function getUpcomingAppointments(req, res, next) {
  try {
    const data = await apptService.getUpcomingForPatient(req.user.id, parseInt(req.query.limit || '3'));
    return ApiResponse.success(res, data);
  } catch (err) { next(err); }
}

export async function getStats(req, res, next) {
  try {
    const stats = await apptService.getAppointmentStats(req.user.id, req.user.role);
    if (!stats) return ApiResponse.notFound(res, 'Profile not found');
    return ApiResponse.success(res, stats);
  } catch (err) { next(err); }
}

export async function getAllAppointments(req, res, next) {
  try {
    const { status, date, page = 1, page_size = 20 } = req.query;
    const { data, totalCount } = await apptService.adminGetAllAppointments({
      status: status || null, date: date || null,
      page: parseInt(page), pageSize: parseInt(page_size),
    });
    return ApiResponse.paginated(res, data, { page: parseInt(page), pageSize: parseInt(page_size), totalCount });
  } catch (err) { next(err); }
}