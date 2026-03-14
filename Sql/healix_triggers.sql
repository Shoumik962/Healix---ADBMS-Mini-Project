-- =============================================================
-- HEALIX - UNIFIED HEALTHCARE PLATFORM
-- TRIGGERS (triggers.sql)
-- PostgreSQL 15+
-- Run AFTER schema.sql
-- =============================================================

SET search_path TO healix, public;

-- =============================================================
-- SECTION 1: UPDATED_AT AUTO-MAINTENANCE TRIGGERS
-- Automatically sets updated_at = NOW() on any row update.
-- One generic function, applied to every table that has updated_at.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to: users
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: patients
CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: doctors
CREATE TRIGGER trg_doctors_updated_at
  BEFORE UPDATE ON doctors
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: admins
CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: appointments
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: prescriptions
CREATE TRIGGER trg_prescriptions_updated_at
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: medical_records
CREATE TRIGGER trg_medical_records_updated_at
  BEFORE UPDATE ON medical_records
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Apply to: doctor_availability
CREATE TRIGGER trg_availability_updated_at
  BEFORE UPDATE ON doctor_availability
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================
-- SECTION 2: DOUBLE-BOOKING PREVENTION TRIGGER
-- Fires BEFORE INSERT or UPDATE on appointments.
-- Checks for any overlapping confirmed/pending appointment
-- for the same doctor in the same time window.
-- Uses an EXCLUSIVE lock strategy via advisory lock to be
-- safe under concurrent transactions.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_prevent_double_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_count  INTEGER;
  v_doctor_name     TEXT;
BEGIN
  -- Only check for active booking statuses
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- Acquire advisory lock keyed to the doctor_id to serialize
  -- concurrent booking attempts for the same doctor.
  -- hashtext() maps UUID -> integer for pg_advisory_xact_lock.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.doctor_id::TEXT));

  -- Check for time overlap using the half-open interval [start, end)
  -- Overlap condition: existing.start < NEW.end AND existing.end > NEW.start
  SELECT COUNT(*)
  INTO   v_conflict_count
  FROM   appointments
  WHERE  doctor_id    = NEW.doctor_id
    AND  id          != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND  status      IN ('pending', 'confirmed')
    AND  appointment_dt <  NEW.end_dt
    AND  end_dt         >  NEW.appointment_dt;

  IF v_conflict_count > 0 THEN
    SELECT first_name || ' ' || last_name
    INTO   v_doctor_name
    FROM   doctors
    WHERE  id = NEW.doctor_id;

    RAISE EXCEPTION
      'DOUBLE_BOOKING: Dr. % already has an appointment overlapping [% → %]. Please choose a different time slot.',
      v_doctor_name,
      NEW.appointment_dt,
      NEW.end_dt
      USING ERRCODE = 'P0001';
  END IF;

  -- Also verify the patient doesn't have a conflicting appointment
  SELECT COUNT(*)
  INTO   v_conflict_count
  FROM   appointments
  WHERE  patient_id   = NEW.patient_id
    AND  id          != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND  status      IN ('pending', 'confirmed')
    AND  appointment_dt <  NEW.end_dt
    AND  end_dt         >  NEW.appointment_dt;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION
      'PATIENT_CONFLICT: You already have an appointment overlapping [% → %].',
      NEW.appointment_dt,
      NEW.end_dt
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_double_booking
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_prevent_double_booking();

-- =============================================================
-- SECTION 3: DOCTOR AVAILABILITY VALIDATION TRIGGER
-- Fires BEFORE INSERT or UPDATE on appointments.
-- Ensures the booked slot falls within doctor's availability
-- and is not in a blocked (unavailability) window.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_validate_doctor_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_day_name        TEXT;
  v_avail_count     INTEGER;
  v_blocked_count   INTEGER;
  v_appt_time       TIME;
  v_appt_end_time   TIME;
BEGIN
  -- Skip cancelled/no_show appointments
  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  -- Get the day name from appointment datetime
  v_day_name      := LOWER(TO_CHAR(NEW.appointment_dt AT TIME ZONE 'UTC', 'day'));
  v_day_name      := TRIM(v_day_name);
  v_appt_time     := (NEW.appointment_dt AT TIME ZONE 'UTC')::TIME;
  v_appt_end_time := (NEW.end_dt AT TIME ZONE 'UTC')::TIME;

  -- Check doctor has availability on this day and within the time window
  SELECT COUNT(*)
  INTO   v_avail_count
  FROM   doctor_availability
  WHERE  doctor_id   = NEW.doctor_id
    AND  day_of_week = v_day_name::day_of_week
    AND  is_active   = TRUE
    AND  start_time <= v_appt_time
    AND  end_time   >= v_appt_end_time;

  IF v_avail_count = 0 THEN
    RAISE EXCEPTION
      'UNAVAILABLE: Doctor is not available on % between % and %.',
      v_day_name, v_appt_time, v_appt_end_time
      USING ERRCODE = 'P0003';
  END IF;

  -- Check doctor is not on leave / unavailability during this slot
  SELECT COUNT(*)
  INTO   v_blocked_count
  FROM   doctor_unavailability
  WHERE  doctor_id  = NEW.doctor_id
    AND  start_dt   < NEW.end_dt
    AND  end_dt     > NEW.appointment_dt;

  IF v_blocked_count > 0 THEN
    RAISE EXCEPTION
      'DOCTOR_BLOCKED: Doctor has marked this time as unavailable.'
      USING ERRCODE = 'P0004';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_doctor_availability
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_doctor_availability();

-- =============================================================
-- SECTION 4: AUTO-CREATE MEDICAL RECORD AFTER APPOINTMENT COMPLETES
-- Fires AFTER UPDATE on appointments.
-- When status transitions to 'completed', automatically inserts
-- a base medical_record row for the patient.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_auto_create_medical_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- Only fire when status changes TO 'completed'
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Idempotency guard: don't create duplicates
  SELECT COUNT(*)
  INTO   v_existing_count
  FROM   medical_records
  WHERE  appointment_id = NEW.id;

  IF v_existing_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Insert base consultation record
  INSERT INTO medical_records (
    patient_id,
    doctor_id,
    appointment_id,
    record_type,
    title,
    description,
    created_at,
    updated_at
  )
  VALUES (
    NEW.patient_id,
    NEW.doctor_id,
    NEW.id,
    'consultation',
    'Consultation on ' || TO_CHAR(NEW.appointment_dt, 'Mon DD, YYYY'),
    COALESCE(NEW.notes, 'Consultation completed. See prescription for details.'),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_medical_record
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_create_medical_record();

-- =============================================================
-- SECTION 5: APPOINTMENT CANCELLATION TIMESTAMP TRIGGER
-- Fires BEFORE UPDATE on appointments.
-- Auto-sets cancelled_at when status is set to 'cancelled'.
-- Auto-sets completed_at when status is set to 'completed'.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_appointment_status_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Status transition: → cancelled
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    NEW.cancelled_at = COALESCE(NEW.cancelled_at, NOW());

    IF NEW.cancelled_by IS NULL THEN
      RAISE EXCEPTION
        'CANCEL_ERROR: cancelled_by must be set when cancelling an appointment.'
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  -- Status transition: → completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = COALESCE(NEW.completed_at, NOW());
  END IF;

  -- Prevent re-opening a completed appointment
  IF OLD.status = 'completed' AND NEW.status NOT IN ('completed') THEN
    RAISE EXCEPTION
      'STATUS_ERROR: A completed appointment cannot be re-opened.'
      USING ERRCODE = 'P0006';
  END IF;

  -- Prevent modifying a cancelled appointment
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    RAISE EXCEPTION
      'STATUS_ERROR: A cancelled appointment cannot be changed.'
      USING ERRCODE = 'P0007';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_status_timestamps
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_appointment_status_timestamps();

-- =============================================================
-- SECTION 6: MEETING ROOM ID AUTO-GENERATION TRIGGER
-- Fires BEFORE INSERT on appointments.
-- Generates a unique meeting_room_id if not supplied.
-- Format: HEALIX-<8-char-random>
-- =============================================================

CREATE OR REPLACE FUNCTION fn_generate_meeting_room()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.meeting_room_id IS NULL THEN
    NEW.meeting_room_id := 'HEALIX-' ||
      UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_meeting_room
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_generate_meeting_room();

-- =============================================================
-- SECTION 7: ACTIVITY LOG TRIGGERS
-- Fires AFTER INSERT/UPDATE/DELETE on key tables.
-- Writes audit entries to activity_logs.
-- Note: user context is passed via SET LOCAL for each transaction.
-- =============================================================

-- Helper function: safely read session variable
CREATE OR REPLACE FUNCTION fn_get_session_user_id()
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid TEXT;
BEGIN
  BEGIN
    v_uid := current_setting('healix.current_user_id', TRUE);
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL OR v_uid = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_uid::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ---- 7a: Log user registrations ----
CREATE OR REPLACE FUNCTION fn_log_user_register()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    NEW.id,
    'register',
    'user',
    NEW.id,
    jsonb_build_object(
      'email', NEW.email,
      'role_id', NEW.role_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_user_register
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_user_register();

-- ---- 7b: Log appointment bookings ----
CREATE OR REPLACE FUNCTION fn_log_appointment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action  log_action;
  v_meta    JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'book_appointment';
    v_meta   := jsonb_build_object(
      'doctor_id',      NEW.doctor_id,
      'patient_id',     NEW.patient_id,
      'appointment_dt', NEW.appointment_dt,
      'status',         NEW.status
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      v_action := 'cancel_appointment';
      v_meta   := jsonb_build_object(
        'cancel_reason', NEW.cancel_reason,
        'cancelled_by',  NEW.cancelled_by,
        'previous_status', OLD.status
      );

    ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      v_action := 'complete_appointment';
      v_meta   := jsonb_build_object(
        'completed_at', NEW.completed_at,
        'doctor_id',    NEW.doctor_id,
        'patient_id',   NEW.patient_id
      );

    ELSE
      -- Generic appointment update — skip logging minor changes
      RETURN NEW;
    END IF;

  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    fn_get_session_user_id(),
    v_action,
    'appointment',
    COALESCE(NEW.id, OLD.id),
    v_meta
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_appointment_changes
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_appointment_changes();

-- ---- 7c: Log prescription issuance ----
CREATE OR REPLACE FUNCTION fn_log_prescription_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    fn_get_session_user_id(),
    'issue_prescription',
    'prescription',
    NEW.id,
    jsonb_build_object(
      'patient_id',    NEW.patient_id,
      'doctor_id',     NEW.doctor_id,
      'appointment_id',NEW.appointment_id,
      'diagnosis',     LEFT(NEW.diagnosis, 100)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_prescription_issued
  AFTER INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_prescription_issued();

-- ---- 7d: Log medical record creation ----
CREATE OR REPLACE FUNCTION fn_log_medical_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      fn_get_session_user_id(),
      'create_record',
      'medical_record',
      NEW.id,
      jsonb_build_object(
        'patient_id',   NEW.patient_id,
        'record_type',  NEW.record_type,
        'title',        NEW.title
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      fn_get_session_user_id(),
      'update_record',
      'medical_record',
      NEW.id,
      jsonb_build_object(
        'patient_id',  NEW.patient_id,
        'record_type', NEW.record_type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_medical_record
  AFTER INSERT OR UPDATE ON medical_records
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_medical_record();

-- ---- 7e: Log doctor approval / suspension ----
CREATE OR REPLACE FUNCTION fn_log_doctor_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action log_action;
BEGIN
  -- Only log when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    v_action := 'approve_doctor';
  ELSIF NEW.status = 'suspended' THEN
    v_action := 'suspend_user';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    fn_get_session_user_id(),
    v_action,
    'doctor',
    NEW.id,
    jsonb_build_object(
      'doctor_user_id', NEW.user_id,
      'old_status',     OLD.status,
      'new_status',     NEW.status,
      'approved_by',    NEW.approved_by
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_doctor_status_change
  AFTER UPDATE ON doctors
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_doctor_status_change();

-- ---- 7f: Log user active status changes (suspend / delete) ----
CREATE OR REPLACE FUNCTION fn_log_user_active_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_active = NEW.is_active THEN
    RETURN NEW;
  END IF;

  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    fn_get_session_user_id(),
    CASE WHEN NEW.is_active = FALSE THEN 'suspend_user' ELSE 'update_profile' END,
    'user',
    NEW.id,
    jsonb_build_object(
      'email',      NEW.email,
      'is_active',  NEW.is_active
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_user_active_change
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_user_active_change();

-- =============================================================
-- SECTION 8: DOCTOR RATING AUTO-UPDATE TRIGGER
-- Fires AFTER INSERT OR UPDATE on prescriptions.
-- (Placeholder hook for a rating system — recalculates
-- average rating on doctors table when new reviews come in.
-- Actual reviews table would extend this in production.)
-- Here we demonstrate the pattern with a simulated recalculation.
-- =============================================================

-- Separate reviews table for the rating system
CREATE TABLE IF NOT EXISTS doctor_reviews (
  id          BIGSERIAL     PRIMARY KEY,
  doctor_id   UUID          NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id  UUID          NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID       NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  rating      SMALLINT      NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT review_rating_range CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT review_unique_per_appt UNIQUE (appointment_id) -- one review per appointment
);

CREATE INDEX idx_reviews_doctor_id  ON doctor_reviews(doctor_id);
CREATE INDEX idx_reviews_patient_id ON doctor_reviews(patient_id);

CREATE OR REPLACE FUNCTION fn_update_doctor_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_avg_rating    NUMERIC(3,2);
  v_total_reviews INTEGER;
BEGIN
  -- Recalculate from scratch for accuracy
  SELECT
    ROUND(AVG(rating)::NUMERIC, 2),
    COUNT(*)
  INTO
    v_avg_rating,
    v_total_reviews
  FROM doctor_reviews
  WHERE doctor_id = COALESCE(NEW.doctor_id, OLD.doctor_id);

  UPDATE doctors
  SET
    rating        = COALESCE(v_avg_rating, 0.00),
    total_reviews = v_total_reviews
  WHERE id = COALESCE(NEW.doctor_id, OLD.doctor_id);

  -- On DELETE triggers NEW is NULL; return OLD to satisfy the trigger contract
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_doctor_rating
  AFTER INSERT OR UPDATE OR DELETE ON doctor_reviews
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_doctor_rating();

-- =============================================================
-- SECTION 9: PRESCRIPTION EXPIRY AUTO-SET TRIGGER
-- Fires BEFORE INSERT on prescriptions.
-- If expires_at is not provided, defaults to 30 days from now.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_set_prescription_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_prescription_expiry
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_prescription_expiry();

-- =============================================================
-- SECTION 10: NOTIFICATION AUTO-CREATE TRIGGERS
-- Fires AFTER key events to insert notifications for relevant users.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_notify_appointment_booked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_patient_user_id UUID;
  v_doctor_user_id  UUID;
  v_patient_name    TEXT;
  v_doctor_name     TEXT;
  v_appt_time       TEXT;
BEGIN
  IF TG_OP != 'INSERT' THEN RETURN NEW; END IF;

  -- Resolve user IDs and names
  SELECT u.id, p.first_name || ' ' || p.last_name
  INTO   v_patient_user_id, v_patient_name
  FROM   patients p JOIN users u ON p.user_id = u.id
  WHERE  p.id = NEW.patient_id;

  SELECT u.id, 'Dr. ' || d.first_name || ' ' || d.last_name
  INTO   v_doctor_user_id, v_doctor_name
  FROM   doctors d JOIN users u ON d.user_id = u.id
  WHERE  d.id = NEW.doctor_id;

  v_appt_time := TO_CHAR(NEW.appointment_dt, 'Mon DD, YYYY at HH12:MI AM');

  -- Notify patient
  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_patient_user_id,
    'Appointment Booked',
    'Your appointment with ' || v_doctor_name || ' is confirmed for ' || v_appt_time || '.',
    'success',
    'appointment',
    NEW.id
  );

  -- Notify doctor
  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_doctor_user_id,
    'New Appointment Request',
    v_patient_name || ' has booked an appointment for ' || v_appt_time || '.',
    'info',
    'appointment',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_appointment_booked
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_appointment_booked();

-- ---- Notify on cancellation ----
CREATE OR REPLACE FUNCTION fn_notify_appointment_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_patient_user_id UUID;
  v_doctor_user_id  UUID;
  v_appt_time       TEXT;
BEGIN
  IF NEW.status != 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT u.id INTO v_patient_user_id
  FROM patients p JOIN users u ON p.user_id = u.id
  WHERE p.id = NEW.patient_id;

  SELECT u.id INTO v_doctor_user_id
  FROM doctors d JOIN users u ON d.user_id = u.id
  WHERE d.id = NEW.doctor_id;

  v_appt_time := TO_CHAR(NEW.appointment_dt, 'Mon DD, YYYY at HH12:MI AM');

  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_patient_user_id,
    'Appointment Cancelled',
    'Your appointment for ' || v_appt_time || ' has been cancelled. Reason: ' || COALESCE(NEW.cancel_reason, 'Not specified') || '.',
    'warning',
    'appointment',
    NEW.id
  );

  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_doctor_user_id,
    'Appointment Cancelled',
    'An appointment scheduled for ' || v_appt_time || ' has been cancelled.',
    'warning',
    'appointment',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_appointment_cancelled
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_appointment_cancelled();

-- ---- Notify doctor when prescription is issued ----
CREATE OR REPLACE FUNCTION fn_notify_prescription_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_patient_user_id UUID;
  v_doctor_name     TEXT;
BEGIN
  SELECT u.id INTO v_patient_user_id
  FROM patients p JOIN users u ON p.user_id = u.id
  WHERE p.id = NEW.patient_id;

  SELECT 'Dr. ' || d.first_name || ' ' || d.last_name INTO v_doctor_name
  FROM doctors d WHERE d.id = NEW.doctor_id;

  INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_patient_user_id,
    'New Prescription Available',
    v_doctor_name || ' has issued a new prescription for you. Diagnosis: ' || LEFT(NEW.diagnosis, 80) || '.',
    'info',
    'prescription',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_prescription_issued
  AFTER INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_prescription_issued();

-- ---- Notify doctor when their account is approved ----
CREATE OR REPLACE FUNCTION fn_notify_doctor_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_doctor_user_id UUID;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  SELECT u.id INTO v_doctor_user_id
  FROM users u WHERE u.id = NEW.user_id;

  IF NEW.status = 'approved' THEN
    INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      v_doctor_user_id,
      'Account Approved',
      'Congratulations! Your HEALIX doctor account has been approved. You can now accept appointments.',
      'success',
      'doctor',
      NEW.id
    );
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      v_doctor_user_id,
      'Account Application Update',
      'Your HEALIX doctor account application requires further review. Please contact support.',
      'warning',
      'doctor',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_doctor_approved
  AFTER UPDATE ON doctors
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_doctor_approved();

-- =============================================================
-- SECTION 11: ENFORCE APPROVED DOCTOR BEFORE BOOKING
-- Prevents booking appointments with doctors not yet approved.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_enforce_approved_doctor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_doctor_status doctor_status;
BEGIN
  SELECT status INTO v_doctor_status
  FROM doctors WHERE id = NEW.doctor_id;

  IF v_doctor_status != 'approved' THEN
    RAISE EXCEPTION
      'DOCTOR_NOT_APPROVED: Cannot book an appointment with a doctor whose status is: %.',
      v_doctor_status
      USING ERRCODE = 'P0008';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_approved_doctor
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_approved_doctor();

-- =============================================================
-- SECTION 12: PRESCRIPTION ONLY FOR COMPLETED APPOINTMENTS
-- Prevents issuing a prescription for a non-completed appointment.
-- =============================================================

CREATE OR REPLACE FUNCTION fn_enforce_prescription_on_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt_status appt_status;
BEGIN
  SELECT status INTO v_appt_status
  FROM appointments WHERE id = NEW.appointment_id;

  IF v_appt_status != 'completed' THEN
    RAISE EXCEPTION
      'PRESCRIPTION_ERROR: Prescriptions can only be issued for completed appointments. Current status: %.',
      v_appt_status
      USING ERRCODE = 'P0009';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_prescription_completed
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_prescription_on_completed();

-- =============================================================
-- TRIGGER SUMMARY (for documentation)
-- =============================================================
-- trg_*_updated_at              → 8 triggers, auto-maintain updated_at
-- trg_prevent_double_booking    → Block overlapping appointments per doctor/patient
-- trg_validate_doctor_availability → Ensure slot is within doctor's schedule
-- trg_auto_create_medical_record   → Auto-create record on appointment completion
-- trg_appointment_status_timestamps→ Auto-set cancelled_at, completed_at, guard transitions
-- trg_generate_meeting_room     → Auto-generate HEALIX-XXXXXXXX room ID
-- trg_log_user_register         → Audit: user registration
-- trg_log_appointment_changes   → Audit: book/cancel/complete
-- trg_log_prescription_issued   → Audit: prescription issued
-- trg_log_medical_record        → Audit: record create/update
-- trg_log_doctor_status_change  → Audit: approve/suspend doctor
-- trg_log_user_active_change    → Audit: user suspend
-- trg_update_doctor_rating      → Recalculate doctor rating on new review
-- trg_set_prescription_expiry   → Default prescription expiry to +30 days
-- trg_notify_appointment_booked    → Notify patient + doctor on booking
-- trg_notify_appointment_cancelled → Notify both parties on cancellation
-- trg_notify_prescription_issued   → Notify patient on new prescription
-- trg_notify_doctor_approved       → Notify doctor on approval/rejection
-- trg_enforce_approved_doctor      → Block bookings with unapproved doctors
-- trg_enforce_prescription_completed → Block prescriptions on incomplete appointments
-- =============================================================
