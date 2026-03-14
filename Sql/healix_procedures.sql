-- =============================================================
-- HEALIX - UNIFIED HEALTHCARE PLATFORM
-- STORED PROCEDURES & FUNCTIONS (procedures.sql)
-- PostgreSQL 15+
-- Run AFTER schema.sql and triggers.sql
-- =============================================================

SET search_path TO healix, public;

-- =============================================================
-- SECTION 1: UTILITY FUNCTIONS
-- Small helpers used by other procedures
-- =============================================================

-- ── fn_get_slot_end_time ──────────────────────────────────────
-- Given a doctor_id and a start timestamp, returns the end
-- timestamp based on the doctor's configured slot_duration.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_get_slot_end_time(
  p_doctor_id     UUID,
  p_start_dt      TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_slot_minutes INTEGER;
  v_day_name     TEXT;
BEGIN
  v_day_name := LOWER(TRIM(TO_CHAR(p_start_dt AT TIME ZONE 'UTC', 'day')));

  SELECT slot_duration
  INTO   v_slot_minutes
  FROM   doctor_availability
  WHERE  doctor_id   = p_doctor_id
    AND  day_of_week = v_day_name::day_of_week
    AND  is_active   = TRUE
  LIMIT 1;

  -- Default to 30 minutes if no schedule found
  RETURN p_start_dt + (COALESCE(v_slot_minutes, 30) || ' minutes')::INTERVAL;
END;
$$;

-- ── fn_is_doctor_available ────────────────────────────────────
-- Returns TRUE if the doctor has no conflicts at the given slot.
-- Used by the frontend before presenting available slots.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_is_doctor_available(
  p_doctor_id   UUID,
  p_start_dt    TIMESTAMPTZ,
  p_end_dt      TIMESTAMPTZ,
  p_exclude_id  UUID DEFAULT NULL   -- exclude an existing appointment (for rescheduling)
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_conflict_count   INTEGER;
  v_blocked_count    INTEGER;
  v_doctor_status    doctor_status;
BEGIN
  -- Check doctor is approved
  SELECT status INTO v_doctor_status FROM doctors WHERE id = p_doctor_id;
  IF v_doctor_status != 'approved' THEN RETURN FALSE; END IF;

  -- Check no existing appointment overlap
  SELECT COUNT(*) INTO v_conflict_count
  FROM   appointments
  WHERE  doctor_id      = p_doctor_id
    AND  id            != COALESCE(p_exclude_id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND  status        IN ('pending', 'confirmed')
    AND  appointment_dt <  p_end_dt
    AND  end_dt         >  p_start_dt;

  IF v_conflict_count > 0 THEN RETURN FALSE; END IF;

  -- Check not in unavailability window
  SELECT COUNT(*) INTO v_blocked_count
  FROM   doctor_unavailability
  WHERE  doctor_id = p_doctor_id
    AND  start_dt  < p_end_dt
    AND  end_dt    > p_start_dt;

  IF v_blocked_count > 0 THEN RETURN FALSE; END IF;

  RETURN TRUE;
END;
$$;

-- ── fn_hash_password / fn_verify_password ─────────────────────
-- Thin wrappers around pgcrypto for consistent hashing.
-- Backend should use bcrypt (Node.js), but these are here for
-- pure-DB seeding / testing convenience.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_hash_password(p_plain TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT crypt(p_plain, gen_salt('bf', 10));
$$;

CREATE OR REPLACE FUNCTION fn_verify_password(p_plain TEXT, p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT (crypt(p_plain, p_hash) = p_hash);
$$;

-- =============================================================
-- SECTION 2: PROCEDURE — book_appointment()
-- Books an appointment inside a serializable transaction.
-- Steps:
--   1. Validate inputs
--   2. SET LOCAL session context (for audit trigger)
--   3. Compute end_dt from doctor's slot duration
--   4. INSERT appointment (triggers fire: double-booking check,
--      availability check, room-id generation, notifications,
--      audit log)
--   5. Return the new appointment record
-- =============================================================
CREATE OR REPLACE PROCEDURE book_appointment(
  p_patient_id    UUID,
  p_doctor_id     UUID,
  p_appointment_dt TIMESTAMPTZ,
  p_reason        TEXT,
  p_calling_user  UUID,          -- user performing the action (for audit)
  OUT p_result    JSONB           -- returns result as JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_end_dt        TIMESTAMPTZ;
  v_appt_id       UUID;
  v_room_id       VARCHAR(100);
  v_patient_exists BOOLEAN;
  v_doctor_exists  BOOLEAN;
BEGIN
  -- ── Input validation ────────────────────────────────────────
  IF p_patient_id IS NULL OR p_doctor_id IS NULL OR p_appointment_dt IS NULL THEN
    p_result := jsonb_build_object(
      'success', FALSE,
      'error',   'MISSING_PARAMS: patient_id, doctor_id, and appointment_dt are required.'
    );
    RETURN;
  END IF;

  IF p_appointment_dt < NOW() THEN
    p_result := jsonb_build_object(
      'success', FALSE,
      'error',   'PAST_DATE: Cannot book an appointment in the past.'
    );
    RETURN;
  END IF;

  IF LENGTH(TRIM(COALESCE(p_reason, ''))) < 5 THEN
    p_result := jsonb_build_object(
      'success', FALSE,
      'error',   'REASON_TOO_SHORT: Please provide a reason (min 5 characters).'
    );
    RETURN;
  END IF;

  -- Verify patient exists
  SELECT EXISTS(SELECT 1 FROM patients WHERE id = p_patient_id)
  INTO   v_patient_exists;

  IF NOT v_patient_exists THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'PATIENT_NOT_FOUND');
    RETURN;
  END IF;

  -- Verify doctor exists and is approved
  SELECT EXISTS(SELECT 1 FROM doctors WHERE id = p_doctor_id AND status = 'approved')
  INTO   v_doctor_exists;

  IF NOT v_doctor_exists THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'DOCTOR_NOT_FOUND_OR_NOT_APPROVED');
    RETURN;
  END IF;

  -- ── Set session context for audit triggers ──────────────────
  PERFORM set_config('healix.current_user_id', p_calling_user::TEXT, TRUE);

  -- ── Compute slot end time ───────────────────────────────────
  v_end_dt := fn_get_slot_end_time(p_doctor_id, p_appointment_dt);

  -- ── INSERT inside implicit transaction ─────────────────────
  -- Triggers fire here:
  --   trg_enforce_approved_doctor       → blocks unapproved
  --   trg_prevent_double_booking        → blocks overlap
  --   trg_validate_doctor_availability  → validates schedule
  --   trg_generate_meeting_room         → sets room ID
  --   trg_log_appointment_changes       → writes audit log
  --   trg_notify_appointment_booked     → sends notifications
  INSERT INTO appointments (
    patient_id,
    doctor_id,
    appointment_dt,
    end_dt,
    status,
    reason
  )
  VALUES (
    p_patient_id,
    p_doctor_id,
    p_appointment_dt,
    v_end_dt,
    'pending',
    TRIM(p_reason)
  )
  RETURNING id, meeting_room_id
  INTO v_appt_id, v_room_id;

  -- ── Return success payload ──────────────────────────────────
  p_result := jsonb_build_object(
    'success',         TRUE,
    'appointment_id',  v_appt_id,
    'meeting_room_id', v_room_id,
    'appointment_dt',  p_appointment_dt,
    'end_dt',          v_end_dt,
    'status',          'pending'
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN  -- double booking (doctor)
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN SQLSTATE 'P0002' THEN  -- double booking (patient)
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN SQLSTATE 'P0003' THEN  -- doctor not available on day/time
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN SQLSTATE 'P0004' THEN  -- doctor on leave
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN SQLSTATE 'P0008' THEN  -- doctor not approved
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN OTHERS THEN
    p_result := jsonb_build_object(
      'success', FALSE,
      'error',   'UNEXPECTED: ' || SQLERRM
    );
END;
$$;

-- =============================================================
-- SECTION 3: PROCEDURE — cancel_appointment()
-- Cancels an appointment with reason, enforcing role permissions:
--   - Patients can cancel their own appointments
--   - Doctors can cancel appointments assigned to them
--   - Admins can cancel any appointment
-- Must be > 1 hour before the scheduled time (patients only).
-- =============================================================
CREATE OR REPLACE PROCEDURE cancel_appointment(
  p_appointment_id UUID,
  p_cancelled_by   UUID,       -- user_id of person cancelling
  p_cancel_reason  TEXT,
  p_calling_role   user_role,  -- 'patient' | 'doctor' | 'admin'
  OUT p_result     JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt          RECORD;
  v_patient_user  UUID;
  v_doctor_user   UUID;
BEGIN
  -- ── Fetch appointment ───────────────────────────────────────
  SELECT a.*, p.user_id AS p_user_id, d.user_id AS d_user_id
  INTO   v_appt
  FROM   appointments a
  JOIN   patients p ON a.patient_id = p.id
  JOIN   doctors  d ON a.doctor_id  = d.id
  WHERE  a.id = p_appointment_id;

  IF NOT FOUND THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'APPOINTMENT_NOT_FOUND');
    RETURN;
  END IF;

  -- ── Already in terminal state? ──────────────────────────────
  IF v_appt.status IN ('cancelled', 'completed') THEN
    p_result := jsonb_build_object(
      'success', FALSE,
      'error',   'TERMINAL_STATE: Appointment is already ' || v_appt.status || '.'
    );
    RETURN;
  END IF;

  -- ── Role-based permission check ─────────────────────────────
  IF p_calling_role = 'patient' AND v_appt.p_user_id != p_cancelled_by THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'FORBIDDEN: Not your appointment.');
    RETURN;
  END IF;

  IF p_calling_role = 'doctor' AND v_appt.d_user_id != p_cancelled_by THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'FORBIDDEN: Not your appointment.');
    RETURN;
  END IF;

  -- ── Cancellation time window (patients only: must be >1hr before) ──
  IF p_calling_role = 'patient' THEN
    IF v_appt.appointment_dt < NOW() + INTERVAL '1 hour' THEN
      p_result := jsonb_build_object(
        'success', FALSE,
        'error',   'TOO_LATE: Patients must cancel at least 1 hour before the appointment.'
      );
      RETURN;
    END IF;
  END IF;

  -- ── Set session context ─────────────────────────────────────
  PERFORM set_config('healix.current_user_id', p_cancelled_by::TEXT, TRUE);

  -- ── Update status → cancelled ───────────────────────────────
  -- Triggers fire: trg_appointment_status_timestamps,
  --               trg_log_appointment_changes,
  --               trg_notify_appointment_cancelled
  UPDATE appointments
  SET
    status        = 'cancelled',
    cancelled_by  = p_cancelled_by,
    cancel_reason = TRIM(COALESCE(p_cancel_reason, 'No reason provided')),
    cancelled_at  = NOW()
  WHERE id = p_appointment_id;

  p_result := jsonb_build_object(
    'success',        TRUE,
    'appointment_id', p_appointment_id,
    'cancelled_at',   NOW(),
    'cancel_reason',  p_cancel_reason
  );

EXCEPTION
  WHEN SQLSTATE 'P0006' THEN
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN SQLSTATE 'P0007' THEN
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN OTHERS THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'UNEXPECTED: ' || SQLERRM);
END;
$$;

-- =============================================================
-- SECTION 4: PROCEDURE — complete_appointment()
-- Marks an appointment as completed. Only callable by doctor
-- or admin. Sets meeting_status → 'ended'.
-- =============================================================
CREATE OR REPLACE PROCEDURE complete_appointment(
  p_appointment_id UUID,
  p_calling_user   UUID,
  p_calling_role   user_role,
  p_notes          TEXT,
  OUT p_result     JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt    RECORD;
  v_doc_uid UUID;
BEGIN
  SELECT a.*, d.user_id AS doc_user_id
  INTO   v_appt
  FROM   appointments a
  JOIN   doctors d ON a.doctor_id = d.id
  WHERE  a.id = p_appointment_id;

  IF NOT FOUND THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'APPOINTMENT_NOT_FOUND');
    RETURN;
  END IF;

  -- Only doctor of this appointment or admin can complete
  IF p_calling_role = 'doctor' AND v_appt.doc_user_id != p_calling_user THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'FORBIDDEN');
    RETURN;
  END IF;

  IF v_appt.status NOT IN ('confirmed', 'pending') THEN
    p_result := jsonb_build_object(
      'success', FALSE,
      'error',   'INVALID_STATUS: Cannot complete an appointment with status: ' || v_appt.status
    );
    RETURN;
  END IF;

  PERFORM set_config('healix.current_user_id', p_calling_user::TEXT, TRUE);

  -- Triggers fire: trg_appointment_status_timestamps (sets completed_at),
  --               trg_auto_create_medical_record,
  --               trg_log_appointment_changes
  UPDATE appointments
  SET
    status         = 'completed',
    meeting_status = 'ended',
    completed_at   = NOW(),
    notes          = COALESCE(p_notes, notes)
  WHERE id = p_appointment_id;

  p_result := jsonb_build_object(
    'success',        TRUE,
    'appointment_id', p_appointment_id,
    'completed_at',   NOW()
  );

EXCEPTION WHEN OTHERS THEN
  p_result := jsonb_build_object('success', FALSE, 'error', 'UNEXPECTED: ' || SQLERRM);
END;
$$;

-- =============================================================
-- SECTION 5: PROCEDURE — issue_prescription()
-- Issues a prescription for a completed appointment.
-- Uses a transaction: inserts prescription header + all
-- medication lines atomically. Rolls back if any line fails.
-- =============================================================
CREATE OR REPLACE PROCEDURE issue_prescription(
  p_appointment_id  UUID,
  p_doctor_user_id  UUID,
  p_diagnosis       TEXT,
  p_notes           TEXT,
  p_medications     JSONB,   -- array of medication objects
  p_expires_at      TIMESTAMPTZ,
  OUT p_result      JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prescription_id UUID;
  v_patient_id      UUID;
  v_doctor_id       UUID;
  v_doctor_user_id  UUID;
  v_med             JSONB;
  v_med_count       INTEGER := 0;
  v_appt_status     appt_status;
BEGIN
  -- ── Validate appointment ────────────────────────────────────
  SELECT
    a.patient_id,
    a.doctor_id,
    a.status,
    d.user_id
  INTO v_patient_id, v_doctor_id, v_appt_status, v_doctor_user_id
  FROM appointments a
  JOIN doctors d ON a.doctor_id = d.id
  WHERE a.id = p_appointment_id;

  IF NOT FOUND THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'APPOINTMENT_NOT_FOUND');
    RETURN;
  END IF;

  -- Only the treating doctor or admin can issue prescription
  IF v_doctor_user_id != p_doctor_user_id THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'FORBIDDEN: Not your appointment.');
    RETURN;
  END IF;

  -- Validate medications array
  IF p_medications IS NULL OR jsonb_array_length(p_medications) = 0 THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'NO_MEDICATIONS: At least one medication is required.');
    RETURN;
  END IF;

  IF LENGTH(TRIM(COALESCE(p_diagnosis, ''))) < 3 THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'DIAGNOSIS_REQUIRED');
    RETURN;
  END IF;

  PERFORM set_config('healix.current_user_id', p_doctor_user_id::TEXT, TRUE);

  -- ── BEGIN atomic block ──────────────────────────────────────
  -- Trigger trg_enforce_prescription_completed fires here
  -- and will RAISE if appointment status != 'completed'
  INSERT INTO prescriptions (
    appointment_id,
    patient_id,
    doctor_id,
    diagnosis,
    notes,
    expires_at
  )
  VALUES (
    p_appointment_id,
    v_patient_id,
    v_doctor_id,
    TRIM(p_diagnosis),
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    p_expires_at
  )
  RETURNING id INTO v_prescription_id;

  -- ── Insert each medication line ─────────────────────────────
  FOR v_med IN SELECT * FROM jsonb_array_elements(p_medications)
  LOOP
    -- Validate required fields per medication
    IF v_med->>'medication_name' IS NULL OR v_med->>'dosage' IS NULL OR v_med->>'frequency' IS NULL THEN
      RAISE EXCEPTION 'INVALID_MEDICATION: medication_name, dosage, and frequency are required for each medication.'
        USING ERRCODE = 'P0010';
    END IF;

    INSERT INTO prescription_medications (
      prescription_id,
      medication_name,
      dosage,
      frequency,
      duration,
      instructions,
      quantity,
      refills_allowed
    )
    VALUES (
      v_prescription_id,
      TRIM(v_med->>'medication_name'),
      TRIM(v_med->>'dosage'),
      TRIM(v_med->>'frequency'),
      NULLIF(TRIM(COALESCE(v_med->>'duration', '')), ''),
      NULLIF(TRIM(COALESCE(v_med->>'instructions', '')), ''),
      (v_med->>'quantity')::INTEGER,
      COALESCE((v_med->>'refills_allowed')::INTEGER, 0)
    );

    v_med_count := v_med_count + 1;
  END LOOP;

  p_result := jsonb_build_object(
    'success',         TRUE,
    'prescription_id', v_prescription_id,
    'appointment_id',  p_appointment_id,
    'medications_added', v_med_count,
    'expires_at',      COALESCE(p_expires_at, NOW() + INTERVAL '30 days')
  );

EXCEPTION
  WHEN SQLSTATE 'P0009' THEN  -- prescription on non-completed appointment
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN SQLSTATE 'P0010' THEN  -- invalid medication data
    p_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
  WHEN UNIQUE_VIOLATION THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'DUPLICATE: A prescription already exists for this appointment.');
  WHEN OTHERS THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'UNEXPECTED: ' || SQLERRM);
END;
$$;

-- =============================================================
-- SECTION 6: FUNCTION — get_doctor_schedule()
-- Returns all available time slots for a doctor on a given date.
-- Slots already booked are excluded.
-- Returns a table of slot records.
-- =============================================================
CREATE OR REPLACE FUNCTION get_doctor_schedule(
  p_doctor_id   UUID,
  p_date        DATE
)
RETURNS TABLE (
  slot_start      TIMESTAMPTZ,
  slot_end        TIMESTAMPTZ,
  is_available    BOOLEAN,
  appointment_id  UUID,
  appt_status     appt_status
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_day_name      TEXT;
  v_avail         RECORD;
  v_slot_start    TIMESTAMPTZ;
  v_slot_end      TIMESTAMPTZ;
  v_appt          RECORD;
BEGIN
  v_day_name := LOWER(TRIM(TO_CHAR(p_date, 'day')));

  -- Get availability for this day
  SELECT da.*
  INTO   v_avail
  FROM   doctor_availability da
  WHERE  da.doctor_id   = p_doctor_id
    AND  da.day_of_week = v_day_name::day_of_week
    AND  da.is_active   = TRUE;

  -- No availability configured for this day
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Walk through slots from start_time to end_time
  v_slot_start := (p_date::TIMESTAMPTZ AT TIME ZONE 'UTC') +
                   (EXTRACT(EPOCH FROM v_avail.start_time) || ' seconds')::INTERVAL;

  WHILE v_slot_start < (p_date::TIMESTAMPTZ AT TIME ZONE 'UTC') +
                        (EXTRACT(EPOCH FROM v_avail.end_time) || ' seconds')::INTERVAL
  LOOP
    v_slot_end := v_slot_start + (v_avail.slot_duration || ' minutes')::INTERVAL;

    -- Check if slot is occupied
    SELECT a.id, a.status
    INTO   v_appt
    FROM   appointments a
    WHERE  a.doctor_id      = p_doctor_id
      AND  a.status        IN ('pending', 'confirmed')
      AND  a.appointment_dt <  v_slot_end
      AND  a.end_dt         >  v_slot_start
    LIMIT 1;

    -- Only return future slots
    IF v_slot_start > NOW() THEN
      slot_start     := v_slot_start;
      slot_end       := v_slot_end;
      is_available   := NOT FOUND;
      appointment_id := v_appt.id;
      appt_status    := v_appt.status;
      RETURN NEXT;
    END IF;

    v_slot_start := v_slot_end;
  END LOOP;

  RETURN;
END;
$$;

-- =============================================================
-- SECTION 7: FUNCTION — search_doctors()
-- Full-featured doctor search with filters.
-- Supports: specialization, city, name (full-text), rating,
--           availability day, fee range.
-- Returns paginated results.
-- =============================================================
CREATE OR REPLACE FUNCTION search_doctors(
  p_specialization_id INTEGER    DEFAULT NULL,
  p_city              VARCHAR    DEFAULT NULL,
  p_search_query      VARCHAR    DEFAULT NULL,   -- full-text name/bio search
  p_min_rating        NUMERIC    DEFAULT NULL,
  p_max_fee           NUMERIC    DEFAULT NULL,
  p_available_day     day_of_week DEFAULT NULL,
  p_page              INTEGER    DEFAULT 1,
  p_page_size         INTEGER    DEFAULT 10
)
RETURNS TABLE (
  doctor_id           UUID,
  first_name          VARCHAR,
  last_name           VARCHAR,
  specialization_name VARCHAR,
  city                VARCHAR,
  country             VARCHAR,
  consultation_fee    NUMERIC,
  rating              NUMERIC,
  total_reviews       INTEGER,
  years_of_experience INTEGER,
  hospital_name       VARCHAR,
  profile_photo_url   TEXT,
  available_days      TEXT[],
  total_count         BIGINT     -- for pagination
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_offset INTEGER := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      d.id,
      d.first_name,
      d.last_name,
      s.name              AS specialization_name,
      d.city,
      d.country,
      d.consultation_fee,
      d.rating,
      d.total_reviews,
      d.years_of_experience,
      d.hospital_name,
      d.profile_photo_url,
      ARRAY(
        SELECT da.day_of_week::TEXT
        FROM   doctor_availability da
        WHERE  da.doctor_id = d.id AND da.is_active = TRUE
        ORDER BY
          CASE da.day_of_week
            WHEN 'monday'    THEN 1 WHEN 'tuesday'  THEN 2
            WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4
            WHEN 'friday'    THEN 5 WHEN 'saturday' THEN 6
            WHEN 'sunday'    THEN 7
          END
      ) AS available_days,
      COUNT(*) OVER() AS total_count
    FROM  doctors d
    JOIN  specializations s ON d.specialization_id = s.id
    JOIN  users u            ON d.user_id           = u.id
    WHERE
      -- Only approved, active doctors
      d.status    = 'approved'
      AND u.is_active = TRUE

      -- Specialization filter
      AND (p_specialization_id IS NULL OR d.specialization_id = p_specialization_id)

      -- City filter (case-insensitive partial match)
      AND (p_city IS NULL OR d.city ILIKE '%' || p_city || '%')

      -- Full-text search on name + bio
      AND (
        p_search_query IS NULL
        OR to_tsvector('english',
             COALESCE(d.first_name,'') || ' ' ||
             COALESCE(d.last_name,'')  || ' ' ||
             COALESCE(d.bio,'')
           ) @@ plainto_tsquery('english', p_search_query)
        OR (d.first_name || ' ' || d.last_name) ILIKE '%' || p_search_query || '%'
      )

      -- Minimum rating filter
      AND (p_min_rating IS NULL OR d.rating >= p_min_rating)

      -- Maximum fee filter
      AND (p_max_fee IS NULL OR d.consultation_fee <= p_max_fee)

      -- Available on specific day
      AND (
        p_available_day IS NULL
        OR EXISTS (
          SELECT 1 FROM doctor_availability da
          WHERE  da.doctor_id   = d.id
            AND  da.day_of_week = p_available_day
            AND  da.is_active   = TRUE
        )
      )

    ORDER BY d.rating DESC, d.total_reviews DESC, d.years_of_experience DESC
    LIMIT  GREATEST(p_page_size, 1)
    OFFSET v_offset
  )
  SELECT
    f.id,
    f.first_name,
    f.last_name,
    f.specialization_name,
    f.city,
    f.country,
    f.consultation_fee,
    f.rating,
    f.total_reviews,
    f.years_of_experience,
    f.hospital_name,
    f.profile_photo_url,
    f.available_days,
    f.total_count
  FROM filtered f;
END;
$$;

-- =============================================================
-- SECTION 8: FUNCTION — get_patient_history()
-- Returns full appointment + prescription history for a patient.
-- Supports pagination and status filtering.
-- =============================================================
CREATE OR REPLACE FUNCTION get_patient_history(
  p_patient_id  UUID,
  p_status      appt_status DEFAULT NULL,
  p_page        INTEGER     DEFAULT 1,
  p_page_size   INTEGER     DEFAULT 10
)
RETURNS TABLE (
  appointment_id    UUID,
  appointment_dt    TIMESTAMPTZ,
  end_dt            TIMESTAMPTZ,
  status            appt_status,
  reason            TEXT,
  notes             TEXT,
  meeting_room_id   VARCHAR,
  doctor_id         UUID,
  doctor_name       TEXT,
  specialization    VARCHAR,
  hospital_name     VARCHAR,
  has_prescription  BOOLEAN,
  prescription_id   UUID,
  diagnosis         TEXT,
  total_count       BIGINT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_offset INTEGER := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
BEGIN
  RETURN QUERY
  SELECT
    a.id                AS appointment_id,
    a.appointment_dt,
    a.end_dt,
    a.status,
    a.reason,
    a.notes,
    a.meeting_room_id,
    d.id                AS doctor_id,
    ('Dr. ' || d.first_name || ' ' || d.last_name)::TEXT AS doctor_name,
    s.name              AS specialization,
    d.hospital_name,
    (rx.id IS NOT NULL) AS has_prescription,
    rx.id               AS prescription_id,
    rx.diagnosis,
    COUNT(*) OVER()     AS total_count
  FROM  appointments a
  JOIN  doctors d        ON a.doctor_id          = d.id
  JOIN  specializations s ON d.specialization_id  = s.id
  LEFT JOIN prescriptions rx ON rx.appointment_id = a.id
  WHERE a.patient_id = p_patient_id
    AND (p_status IS NULL OR a.status = p_status)
  ORDER BY a.appointment_dt DESC
  LIMIT  GREATEST(p_page_size, 1)
  OFFSET v_offset;
END;
$$;

-- =============================================================
-- SECTION 9: FUNCTION — get_doctor_appointments()
-- Returns appointment list for a doctor with patient info.
-- Supports date range, status filter, pagination.
-- =============================================================
CREATE OR REPLACE FUNCTION get_doctor_appointments(
  p_doctor_id   UUID,
  p_status      appt_status DEFAULT NULL,
  p_date_from   DATE        DEFAULT CURRENT_DATE,
  p_date_to     DATE        DEFAULT CURRENT_DATE + 30,
  p_page        INTEGER     DEFAULT 1,
  p_page_size   INTEGER     DEFAULT 20
)
RETURNS TABLE (
  appointment_id    UUID,
  appointment_dt    TIMESTAMPTZ,
  end_dt            TIMESTAMPTZ,
  status            appt_status,
  reason            TEXT,
  meeting_status    meeting_status,
  meeting_room_id   VARCHAR,
  patient_id        UUID,
  patient_name      TEXT,
  patient_email     VARCHAR,
  patient_phone     VARCHAR,
  blood_group       VARCHAR,
  allergies         TEXT[],
  has_prescription  BOOLEAN,
  total_count       BIGINT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_offset INTEGER := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
BEGIN
  RETURN QUERY
  SELECT
    a.id                AS appointment_id,
    a.appointment_dt,
    a.end_dt,
    a.status,
    a.reason,
    a.meeting_status,
    a.meeting_room_id,
    p.id                AS patient_id,
    (p.first_name || ' ' || p.last_name)::TEXT AS patient_name,
    u.email             AS patient_email,
    p.phone             AS patient_phone,
    p.blood_group,
    p.allergies,
    (EXISTS(SELECT 1 FROM prescriptions rx WHERE rx.appointment_id = a.id)) AS has_prescription,
    COUNT(*) OVER()     AS total_count
  FROM  appointments a
  JOIN  patients p ON a.patient_id = p.id
  JOIN  users u    ON p.user_id    = u.id
  WHERE a.doctor_id = p_doctor_id
    AND (p_status IS NULL OR a.status = p_status)
    AND a.appointment_dt >= p_date_from::TIMESTAMPTZ
    AND a.appointment_dt <  (p_date_to + 1)::TIMESTAMPTZ
  ORDER BY a.appointment_dt ASC
  LIMIT  GREATEST(p_page_size, 1)
  OFFSET v_offset;
END;
$$;

-- =============================================================
-- SECTION 10: FUNCTION — get_prescription_detail()
-- Returns full prescription with all medication lines
-- for a given prescription ID.
-- =============================================================
CREATE OR REPLACE FUNCTION get_prescription_detail(
  p_prescription_id UUID,
  p_requesting_user UUID,   -- for access control
  p_requesting_role user_role
)
RETURNS TABLE (
  prescription_id   UUID,
  diagnosis         TEXT,
  notes             TEXT,
  status            prescription_status,
  issued_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  doctor_name       TEXT,
  doctor_email      VARCHAR,
  specialization    VARCHAR,
  patient_name      TEXT,
  patient_email     VARCHAR,
  medication_id     INTEGER,
  medication_name   VARCHAR,
  dosage            VARCHAR,
  frequency         VARCHAR,
  duration          VARCHAR,
  instructions      TEXT,
  quantity          INTEGER,
  refills_allowed   INTEGER
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_rx        RECORD;
  v_pat_uid   UUID;
  v_doc_uid   UUID;
BEGIN
  -- Fetch prescription with ownership info
  SELECT
    rx.*,
    p.user_id AS patient_user_id,
    d.user_id AS doctor_user_id
  INTO v_rx
  FROM prescriptions rx
  JOIN patients p ON rx.patient_id = p.id
  JOIN doctors  d ON rx.doctor_id  = d.id
  WHERE rx.id = p_prescription_id;

  IF NOT FOUND THEN
    RETURN;  -- Empty result set = not found (caller checks)
  END IF;

  -- Access control: patient sees own, doctor sees own, admin sees all
  IF p_requesting_role = 'patient' AND v_rx.patient_user_id != p_requesting_user THEN
    RETURN;
  END IF;

  IF p_requesting_role = 'doctor' AND v_rx.doctor_user_id != p_requesting_user THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    rx.id             AS prescription_id,
    rx.diagnosis,
    rx.notes,
    rx.status,
    rx.issued_at,
    rx.expires_at,
    ('Dr. ' || d.first_name || ' ' || d.last_name)::TEXT AS doctor_name,
    du.email          AS doctor_email,
    s.name            AS specialization,
    (p.first_name || ' ' || p.last_name)::TEXT AS patient_name,
    pu.email          AS patient_email,
    pm.id             AS medication_id,
    pm.medication_name,
    pm.dosage,
    pm.frequency,
    pm.duration,
    pm.instructions,
    pm.quantity,
    pm.refills_allowed
  FROM prescriptions rx
  JOIN patients p             ON rx.patient_id        = p.id
  JOIN users pu               ON p.user_id            = pu.id
  JOIN doctors d              ON rx.doctor_id         = d.id
  JOIN users du               ON d.user_id            = du.id
  JOIN specializations s      ON d.specialization_id  = s.id
  JOIN prescription_medications pm ON pm.prescription_id = rx.id
  WHERE rx.id = p_prescription_id
  ORDER BY pm.id;
END;
$$;

-- =============================================================
-- SECTION 11: FUNCTION — get_admin_report()
-- Generates a summary report for admin dashboard.
-- Covers: appointments by status, registrations per month,
--         top doctors by appointment count, activity log summary.
-- =============================================================
CREATE OR REPLACE FUNCTION get_admin_report(
  p_from_date DATE DEFAULT CURRENT_DATE - 30,
  p_to_date   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_report JSONB;
BEGIN
  SELECT jsonb_build_object(

    -- Appointment breakdown by status
    'appointments_by_status', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT status, COUNT(*) AS count
        FROM   appointments
        WHERE  appointment_dt::DATE BETWEEN p_from_date AND p_to_date
        GROUP  BY status
        ORDER  BY count DESC
      ) t
    ),

    -- New user registrations per day
    'registrations_per_day', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          DATE(created_at) AS reg_date,
          COUNT(*)          AS total,
          COUNT(*) FILTER (WHERE role_id = (SELECT id FROM roles WHERE name = 'patient')) AS patients,
          COUNT(*) FILTER (WHERE role_id = (SELECT id FROM roles WHERE name = 'doctor'))  AS doctors
        FROM  users
        WHERE created_at::DATE BETWEEN p_from_date AND p_to_date
        GROUP BY DATE(created_at)
        ORDER BY reg_date DESC
      ) t
    ),

    -- Top 10 doctors by appointment volume
    'top_doctors', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          d.id,
          d.first_name || ' ' || d.last_name AS doctor_name,
          s.name        AS specialization,
          COUNT(a.id)   AS total_appointments,
          COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed,
          ROUND(d.rating, 2) AS rating
        FROM  doctors d
        JOIN  specializations s ON d.specialization_id = s.id
        LEFT JOIN appointments a ON a.doctor_id = d.id
          AND a.appointment_dt::DATE BETWEEN p_from_date AND p_to_date
        WHERE d.status = 'approved'
        GROUP BY d.id, d.first_name, d.last_name, s.name, d.rating
        ORDER BY total_appointments DESC
        LIMIT 10
      ) t
    ),

    -- Activity log summary (top actions)
    'activity_summary', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT action, COUNT(*) AS count
        FROM   activity_logs
        WHERE  created_at::DATE BETWEEN p_from_date AND p_to_date
        GROUP  BY action
        ORDER  BY count DESC
      ) t
    ),

    -- Overall platform metrics
    'platform_metrics', jsonb_build_object(
      'total_users',            (SELECT COUNT(*) FROM users),
      'active_users',           (SELECT COUNT(*) FROM users WHERE is_active = TRUE),
      'total_doctors_approved', (SELECT COUNT(*) FROM doctors WHERE status = 'approved'),
      'pending_approvals',      (SELECT COUNT(*) FROM doctors WHERE status = 'pending_approval'),
      'total_appointments',     (SELECT COUNT(*) FROM appointments
                                 WHERE appointment_dt::DATE BETWEEN p_from_date AND p_to_date),
      'total_prescriptions',    (SELECT COUNT(*) FROM prescriptions
                                 WHERE issued_at::DATE BETWEEN p_from_date AND p_to_date),
      'report_from',            p_from_date,
      'report_to',              p_to_date
    )

  ) INTO v_report;

  RETURN v_report;
END;
$$;

-- =============================================================
-- SECTION 12: PROCEDURE — approve_doctor()
-- Admin approves or rejects a doctor registration.
-- =============================================================
CREATE OR REPLACE PROCEDURE approve_doctor(
  p_doctor_id    UUID,
  p_admin_user   UUID,
  p_new_status   doctor_status,   -- 'approved' | 'rejected' | 'suspended'
  OUT p_result   JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_doctor RECORD;
BEGIN
  SELECT d.*, u.id AS user_uid
  INTO   v_doctor
  FROM   doctors d JOIN users u ON d.user_id = u.id
  WHERE  d.id = p_doctor_id;

  IF NOT FOUND THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'DOCTOR_NOT_FOUND');
    RETURN;
  END IF;

  IF p_new_status NOT IN ('approved', 'rejected', 'suspended') THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'INVALID_STATUS');
    RETURN;
  END IF;

  PERFORM set_config('healix.current_user_id', p_admin_user::TEXT, TRUE);

  UPDATE doctors
  SET
    status      = p_new_status,
    approved_by = CASE WHEN p_new_status = 'approved' THEN p_admin_user ELSE approved_by END,
    approved_at = CASE WHEN p_new_status = 'approved' THEN NOW() ELSE approved_at END
  WHERE id = p_doctor_id;

  -- If suspended, also deactivate their user account
  IF p_new_status = 'suspended' THEN
    UPDATE users SET is_active = FALSE WHERE id = v_doctor.user_uid;
  END IF;

  p_result := jsonb_build_object(
    'success',    TRUE,
    'doctor_id',  p_doctor_id,
    'new_status', p_new_status,
    'actioned_by', p_admin_user,
    'actioned_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  p_result := jsonb_build_object('success', FALSE, 'error', 'UNEXPECTED: ' || SQLERRM);
END;
$$;

-- =============================================================
-- SECTION 13: PROCEDURE — manage_user()
-- Admin suspend / reactivate a user account.
-- =============================================================
CREATE OR REPLACE PROCEDURE manage_user(
  p_target_user_id UUID,
  p_admin_user_id  UUID,
  p_action         TEXT,    -- 'suspend' | 'activate'
  OUT p_result     JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'USER_NOT_FOUND');
    RETURN;
  END IF;

  IF p_action NOT IN ('suspend', 'activate') THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'INVALID_ACTION');
    RETURN;
  END IF;

  PERFORM set_config('healix.current_user_id', p_admin_user_id::TEXT, TRUE);

  UPDATE users
  SET is_active = (p_action = 'activate')
  WHERE id = p_target_user_id;

  -- If suspending a doctor, also update their doctor record status
  IF p_action = 'suspend' THEN
    UPDATE doctors SET status = 'suspended'
    WHERE user_id = p_target_user_id AND status = 'approved';
  END IF;

  p_result := jsonb_build_object(
    'success',    TRUE,
    'user_id',    p_target_user_id,
    'action',     p_action,
    'is_active',  (p_action = 'activate'),
    'actioned_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  p_result := jsonb_build_object('success', FALSE, 'error', 'UNEXPECTED: ' || SQLERRM);
END;
$$;

-- =============================================================
-- SECTION 14: FUNCTION — get_available_slots()
-- Convenience wrapper — returns only AVAILABLE slots
-- for a doctor between two dates.
-- =============================================================
CREATE OR REPLACE FUNCTION get_available_slots(
  p_doctor_id  UUID,
  p_from_date  DATE DEFAULT CURRENT_DATE,
  p_to_date    DATE DEFAULT CURRENT_DATE + 7
)
RETURNS TABLE (
  slot_date    DATE,
  slot_start   TIMESTAMPTZ,
  slot_end     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_date DATE := p_from_date;
BEGIN
  WHILE v_date <= p_to_date LOOP
    RETURN QUERY
      SELECT
        v_date,
        s.slot_start,
        s.slot_end
      FROM get_doctor_schedule(p_doctor_id, v_date) s
      WHERE s.is_available = TRUE;

    v_date := v_date + 1;
  END LOOP;
END;
$$;

-- =============================================================
-- SECTION 15: PROCEDURE — revoke_refresh_token()
-- Invalidates a specific refresh token on logout.
-- =============================================================
CREATE OR REPLACE PROCEDURE revoke_refresh_token(
  p_token_hash VARCHAR,
  p_user_id    UUID,
  OUT p_result JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  UPDATE refresh_tokens
  SET    revoked = TRUE
  WHERE  token_hash = p_token_hash
    AND  user_id    = p_user_id
    AND  revoked    = FALSE;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    p_result := jsonb_build_object('success', FALSE, 'error', 'TOKEN_NOT_FOUND_OR_ALREADY_REVOKED');
  ELSE
    -- Log logout
    INSERT INTO activity_logs (user_id, action, entity_type, metadata)
    VALUES (p_user_id, 'logout', 'user', jsonb_build_object('token_revoked', TRUE));

    p_result := jsonb_build_object('success', TRUE, 'revoked', TRUE);
  END IF;

EXCEPTION WHEN OTHERS THEN
  p_result := jsonb_build_object('success', FALSE, 'error', 'UNEXPECTED: ' || SQLERRM);
END;
$$;

-- =============================================================
-- USAGE EXAMPLES (comments for reference)
-- =============================================================
--
-- Book an appointment:
--   CALL book_appointment(
--     'patient-uuid', 'doctor-uuid',
--     '2025-06-15 10:00:00+00',
--     'Headache and fever for 3 days',
--     'calling-user-uuid',
--     NULL
--   );
--
-- Cancel an appointment:
--   CALL cancel_appointment(
--     'appt-uuid', 'user-uuid',
--     'Schedule conflict', 'patient', NULL
--   );
--
-- Issue a prescription:
--   CALL issue_prescription(
--     'appt-uuid', 'doctor-user-uuid',
--     'Acute sinusitis',
--     'Follow up in 7 days',
--     '[
--       {"medication_name":"Amoxicillin","dosage":"500mg","frequency":"3x daily",
--        "duration":"7 days","quantity":21,"refills_allowed":0},
--       {"medication_name":"Ibuprofen","dosage":"400mg","frequency":"As needed",
--        "duration":"5 days","quantity":15,"refills_allowed":1}
--     ]'::jsonb,
--     NULL, NULL
--   );
--
-- Get doctor schedule for a date:
--   SELECT * FROM get_doctor_schedule('doctor-uuid', '2025-06-15');
--
-- Search doctors:
--   SELECT * FROM search_doctors(
--     p_specialization_id := 2,
--     p_city              := 'New York',
--     p_min_rating        := 4.0,
--     p_available_day     := 'monday'
--   );
--
-- Get admin report (last 30 days):
--   SELECT get_admin_report();
-- =============================================================
