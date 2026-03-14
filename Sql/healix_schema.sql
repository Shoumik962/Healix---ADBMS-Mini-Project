-- =============================================================
-- HEALIX - UNIFIED HEALTHCARE PLATFORM
-- DATABASE SCHEMA (schema.sql)
-- PostgreSQL 15+
-- Normalized to 3NF
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- SCHEMA NAMESPACE
-- =============================================================
CREATE SCHEMA IF NOT EXISTS healix;
SET search_path TO healix, public;

-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE user_role         AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE gender_type       AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE appt_status       AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE day_of_week       AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
CREATE TYPE doctor_status     AS ENUM ('pending_approval', 'approved', 'suspended', 'rejected');
CREATE TYPE prescription_status AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE meeting_status    AS ENUM ('waiting', 'active', 'ended');
CREATE TYPE log_action        AS ENUM (
  'register', 'login', 'logout',
  'book_appointment', 'cancel_appointment', 'complete_appointment',
  'issue_prescription', 'update_profile',
  'approve_doctor', 'suspend_user', 'delete_user',
  'start_meeting', 'end_meeting',
  'create_record', 'update_record'
);

-- =============================================================
-- TABLE: roles
-- Stores system roles for RBAC
-- =============================================================
CREATE TABLE roles (
  id          SERIAL        PRIMARY KEY,
  name        user_role     NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed roles immediately
INSERT INTO roles (name, description) VALUES
  ('patient', 'End-user who books appointments and views prescriptions'),
  ('doctor',  'Medical professional who manages appointments and issues prescriptions'),
  ('admin',   'System administrator with full access');

-- =============================================================
-- TABLE: users
-- Central authentication table — all roles share this table
-- =============================================================
CREATE TABLE users (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role_id       INTEGER       NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  is_verified   BOOLEAN       NOT NULL DEFAULT FALSE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes on users
CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_role_id  ON users(role_id);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = TRUE;

-- =============================================================
-- TABLE: specializations
-- Medical specializations — separate table for normalization
-- =============================================================
CREATE TABLE specializations (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(120)  NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT specializations_name_unique UNIQUE (name)
);

-- Seed common specializations
INSERT INTO specializations (name, description) VALUES
  ('General Practice',    'Primary healthcare for all ages'),
  ('Cardiology',          'Heart and cardiovascular system'),
  ('Dermatology',         'Skin, hair, and nail conditions'),
  ('Neurology',           'Brain and nervous system disorders'),
  ('Orthopedics',         'Bones, joints, and muscles'),
  ('Pediatrics',          'Medical care for infants and children'),
  ('Psychiatry',          'Mental health and behavioral disorders'),
  ('Gynecology',          'Female reproductive system'),
  ('Ophthalmology',       'Eyes and vision'),
  ('ENT',                 'Ear, nose, and throat'),
  ('Oncology',            'Cancer diagnosis and treatment'),
  ('Endocrinology',       'Hormones and metabolic diseases'),
  ('Gastroenterology',    'Digestive system disorders'),
  ('Pulmonology',         'Lungs and respiratory system'),
  ('Nephrology',          'Kidney diseases and conditions'),
  ('Urology',             'Urinary tract and male reproductive system'),
  ('Rheumatology',        'Autoimmune and inflammatory diseases'),
  ('Anesthesiology',      'Anesthesia and pain management'),
  ('Radiology',           'Medical imaging and diagnostics'),
  ('Emergency Medicine',  'Acute and life-threatening conditions');

-- =============================================================
-- TABLE: patients
-- Patient-specific profile data (1:1 with users where role=patient)
-- =============================================================
CREATE TABLE patients (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name      VARCHAR(80)   NOT NULL,
  last_name       VARCHAR(80)   NOT NULL,
  date_of_birth   DATE          NOT NULL,
  gender          gender_type   NOT NULL,
  phone           VARCHAR(20),
  address         TEXT,
  city            VARCHAR(100),
  state           VARCHAR(100),
  country         VARCHAR(100)  NOT NULL DEFAULT 'US',
  blood_group     VARCHAR(5),
  allergies       TEXT[],       -- PostgreSQL array for list of known allergies
  emergency_contact_name  VARCHAR(160),
  emergency_contact_phone VARCHAR(20),
  profile_photo_url TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT patients_dob_check CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '1 year'),
  CONSTRAINT patients_phone_check CHECK (phone IS NULL OR phone ~ '^\+?[0-9\s\-\(\)]{7,20}$'),
  CONSTRAINT patients_blood_group_check CHECK (
    blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')
  )
);

-- Indexes
CREATE INDEX idx_patients_user_id    ON patients(user_id);
CREATE INDEX idx_patients_name       ON patients(last_name, first_name);
CREATE INDEX idx_patients_city       ON patients(city);
CREATE INDEX idx_patients_country    ON patients(country);

-- =============================================================
-- TABLE: doctors
-- Doctor-specific profile data (1:1 with users where role=doctor)
-- =============================================================
CREATE TABLE doctors (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialization_id     INTEGER       NOT NULL REFERENCES specializations(id) ON DELETE RESTRICT,
  first_name            VARCHAR(80)   NOT NULL,
  last_name             VARCHAR(80)   NOT NULL,
  date_of_birth         DATE,
  gender                gender_type,
  phone                 VARCHAR(20),
  license_number        VARCHAR(60)   NOT NULL,
  years_of_experience   INTEGER       NOT NULL DEFAULT 0,
  education             TEXT,
  bio                   TEXT,
  consultation_fee      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  hospital_name         VARCHAR(200),
  hospital_address      TEXT,
  city                  VARCHAR(100),
  state                 VARCHAR(100),
  country               VARCHAR(100)  NOT NULL DEFAULT 'US',
  rating                NUMERIC(3,2)  NOT NULL DEFAULT 0.00,
  total_reviews         INTEGER       NOT NULL DEFAULT 0,
  status                doctor_status NOT NULL DEFAULT 'pending_approval',
  profile_photo_url     TEXT,
  approved_by           UUID          REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT doctors_license_unique    UNIQUE (license_number),
  CONSTRAINT doctors_fee_check         CHECK (consultation_fee >= 0),
  CONSTRAINT doctors_experience_check  CHECK (years_of_experience >= 0),
  CONSTRAINT doctors_rating_check      CHECK (rating >= 0.00 AND rating <= 5.00),
  CONSTRAINT doctors_reviews_check     CHECK (total_reviews >= 0),
  CONSTRAINT doctors_phone_check       CHECK (phone IS NULL OR phone ~ '^\+?[0-9\s\-\(\)]{7,20}$')
);

-- Indexes
CREATE INDEX idx_doctors_user_id          ON doctors(user_id);
CREATE INDEX idx_doctors_specialization   ON doctors(specialization_id);
CREATE INDEX idx_doctors_status           ON doctors(status);
CREATE INDEX idx_doctors_city             ON doctors(city);
CREATE INDEX idx_doctors_country          ON doctors(country);
CREATE INDEX idx_doctors_rating           ON doctors(rating DESC);
CREATE INDEX idx_doctors_name             ON doctors(last_name, first_name);
-- Full-text search index on doctor name + bio for search feature
CREATE INDEX idx_doctors_fts ON doctors
  USING gin(to_tsvector('english', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(bio,'')));

-- =============================================================
-- TABLE: admins
-- Admin-specific profile data (1:1 with users where role=admin)
-- =============================================================
CREATE TABLE admins (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name  VARCHAR(80) NOT NULL,
  last_name   VARCHAR(80) NOT NULL,
  phone       VARCHAR(20),
  department  VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admins_user_id ON admins(user_id);

-- =============================================================
-- TABLE: doctor_availability
-- Stores recurring weekly schedule for each doctor
-- =============================================================
CREATE TABLE doctor_availability (
  id            SERIAL        PRIMARY KEY,
  doctor_id     UUID          NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week   day_of_week   NOT NULL,
  start_time    TIME          NOT NULL,
  end_time      TIME          NOT NULL,
  slot_duration INTEGER       NOT NULL DEFAULT 30, -- minutes per appointment slot
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT availability_time_check     CHECK (end_time > start_time),
  CONSTRAINT availability_slot_check     CHECK (slot_duration >= 10 AND slot_duration <= 120),
  CONSTRAINT availability_unique_day     UNIQUE (doctor_id, day_of_week) -- one schedule per day
);

CREATE INDEX idx_availability_doctor_id ON doctor_availability(doctor_id);
CREATE INDEX idx_availability_day       ON doctor_availability(day_of_week);

-- =============================================================
-- TABLE: doctor_unavailability
-- Stores specific dates/times when doctor is NOT available
-- (vacation, holiday overrides, etc.)
-- =============================================================
CREATE TABLE doctor_unavailability (
  id          SERIAL      PRIMARY KEY,
  doctor_id   UUID        NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_dt    TIMESTAMPTZ NOT NULL,
  end_dt      TIMESTAMPTZ NOT NULL,
  reason      VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unavailability_time_check CHECK (end_dt > start_dt)
);

CREATE INDEX idx_unavailability_doctor_id ON doctor_unavailability(doctor_id);
CREATE INDEX idx_unavailability_dates     ON doctor_unavailability(doctor_id, start_dt, end_dt);

-- =============================================================
-- TABLE: appointments
-- Core transactional table — bookings between patients and doctors
-- =============================================================
CREATE TABLE appointments (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID          NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id       UUID          NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  appointment_dt  TIMESTAMPTZ   NOT NULL,  -- exact scheduled date + time
  end_dt          TIMESTAMPTZ   NOT NULL,  -- calculated end time
  status          appt_status   NOT NULL DEFAULT 'pending',
  reason          TEXT          NOT NULL,  -- patient-provided reason for visit
  notes           TEXT,                    -- doctor's pre-visit notes
  meeting_status  meeting_status NOT NULL DEFAULT 'waiting',
  meeting_room_id VARCHAR(100)  UNIQUE,    -- socket.io room ID
  cancelled_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason   TEXT,
  cancelled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT appt_time_check       CHECK (end_dt > appointment_dt),
  CONSTRAINT appt_future_check     CHECK (appointment_dt > created_at - INTERVAL '1 minute'),
  CONSTRAINT appt_cancel_logic     CHECK (
    (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR status != 'cancelled'
  ),
  CONSTRAINT appt_complete_logic   CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR status != 'completed'
  )
);

-- Critical indexes for appointment queries
CREATE INDEX idx_appt_patient_id      ON appointments(patient_id);
CREATE INDEX idx_appt_doctor_id       ON appointments(doctor_id);
CREATE INDEX idx_appt_status          ON appointments(status);
CREATE INDEX idx_appt_datetime        ON appointments(appointment_dt);
CREATE INDEX idx_appt_doctor_datetime ON appointments(doctor_id, appointment_dt);  -- double-booking prevention
CREATE INDEX idx_appt_patient_status  ON appointments(patient_id, status);
CREATE INDEX idx_appt_meeting_room    ON appointments(meeting_room_id) WHERE meeting_room_id IS NOT NULL;
-- Partial index: upcoming confirmed appointments only
CREATE INDEX idx_appt_upcoming ON appointments(doctor_id, appointment_dt)
  WHERE status IN ('pending', 'confirmed');

-- =============================================================
-- TABLE: prescriptions
-- Prescriptions issued by doctors after appointments
-- =============================================================
CREATE TABLE prescriptions (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID              NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_id      UUID              NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id       UUID              NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  diagnosis       TEXT              NOT NULL,
  notes           TEXT,
  status          prescription_status NOT NULL DEFAULT 'active',
  issued_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT prescription_unique_per_appt UNIQUE (appointment_id), -- one prescription per appointment
  CONSTRAINT prescription_expire_check    CHECK (expires_at IS NULL OR expires_at > issued_at)
);

CREATE INDEX idx_prescriptions_patient_id    ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor_id     ON prescriptions(doctor_id);
CREATE INDEX idx_prescriptions_appointment   ON prescriptions(appointment_id);
CREATE INDEX idx_prescriptions_status        ON prescriptions(status);

-- =============================================================
-- TABLE: prescription_medications
-- Individual medications within a prescription (1:N with prescriptions)
-- Normalized: medications separated from prescription header
-- =============================================================
CREATE TABLE prescription_medications (
  id                SERIAL        PRIMARY KEY,
  prescription_id   UUID          NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medication_name   VARCHAR(200)  NOT NULL,
  dosage            VARCHAR(100)  NOT NULL,  -- e.g. "500mg"
  frequency         VARCHAR(100)  NOT NULL,  -- e.g. "Twice daily"
  duration          VARCHAR(100),            -- e.g. "7 days"
  instructions      TEXT,                   -- special instructions
  quantity          INTEGER,
  refills_allowed   INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT medications_quantity_check CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT medications_refills_check  CHECK (refills_allowed >= 0)
);

CREATE INDEX idx_medications_prescription ON prescription_medications(prescription_id);

-- =============================================================
-- TABLE: medical_records
-- Persistent health record per patient (auto-created after completed appointments)
-- =============================================================
CREATE TABLE medical_records (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID          NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id       UUID          NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  appointment_id  UUID          REFERENCES appointments(id) ON DELETE SET NULL,
  record_type     VARCHAR(80)   NOT NULL DEFAULT 'consultation', -- consultation, lab, imaging, etc.
  title           VARCHAR(255)  NOT NULL,
  description     TEXT          NOT NULL,
  vitals          JSONB,        -- flexible: { "bp": "120/80", "weight": "70kg", "temp": "98.6F" }
  attachments     TEXT[],       -- array of file URLs
  is_private      BOOLEAN       NOT NULL DEFAULT FALSE, -- doctor-only flag
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_records_patient_id     ON medical_records(patient_id);
CREATE INDEX idx_records_doctor_id      ON medical_records(doctor_id);
CREATE INDEX idx_records_appointment_id ON medical_records(appointment_id);
CREATE INDEX idx_records_type           ON medical_records(record_type);
CREATE INDEX idx_records_created_at     ON medical_records(patient_id, created_at DESC);
-- GIN index for JSONB vitals search
CREATE INDEX idx_records_vitals_gin     ON medical_records USING gin(vitals);

-- =============================================================
-- TABLE: activity_logs
-- Audit trail for all major system actions (for admin monitoring)
-- =============================================================
CREATE TABLE activity_logs (
  id          BIGSERIAL     PRIMARY KEY,
  user_id     UUID          REFERENCES users(id) ON DELETE SET NULL,
  action      log_action    NOT NULL,
  entity_type VARCHAR(60),  -- 'appointment', 'prescription', 'user', etc.
  entity_id   UUID,         -- ID of the affected entity
  metadata    JSONB,        -- additional context data
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Partition-friendly indexes (logs grow fast)
CREATE INDEX idx_logs_user_id    ON activity_logs(user_id);
CREATE INDEX idx_logs_action     ON activity_logs(action);
CREATE INDEX idx_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_logs_entity     ON activity_logs(entity_type, entity_id);

-- =============================================================
-- TABLE: refresh_tokens
-- JWT refresh token management for secure auth
-- =============================================================
CREATE TABLE refresh_tokens (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT refresh_token_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash       ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_active     ON refresh_tokens(user_id, revoked) WHERE revoked = FALSE;

-- =============================================================
-- TABLE: notifications
-- In-app notifications for users
-- =============================================================
CREATE TABLE notifications (
  id          BIGSERIAL     PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255)  NOT NULL,
  message     TEXT          NOT NULL,
  type        VARCHAR(60)   NOT NULL DEFAULT 'info', -- info, success, warning, error
  is_read     BOOLEAN       NOT NULL DEFAULT FALSE,
  entity_type VARCHAR(60),
  entity_id   UUID,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_unread     ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- =============================================================
-- VIEWS
-- =============================================================

-- View: full appointment details (joins all relevant tables)
CREATE OR REPLACE VIEW v_appointment_details AS
SELECT
  a.id                  AS appointment_id,
  a.appointment_dt,
  a.end_dt,
  a.status,
  a.reason,
  a.notes,
  a.meeting_status,
  a.meeting_room_id,
  a.cancelled_at,
  a.cancel_reason,
  a.completed_at,
  a.created_at,
  -- Patient info
  p.id                  AS patient_id,
  p.first_name          AS patient_first_name,
  p.last_name           AS patient_last_name,
  pu.email              AS patient_email,
  p.phone               AS patient_phone,
  p.blood_group,
  -- Doctor info
  d.id                  AS doctor_id,
  d.first_name          AS doctor_first_name,
  d.last_name           AS doctor_last_name,
  du.email              AS doctor_email,
  d.phone               AS doctor_phone,
  d.consultation_fee,
  s.name                AS specialization,
  d.hospital_name,
  d.city                AS doctor_city
FROM appointments a
JOIN patients p  ON a.patient_id = p.id
JOIN users pu    ON p.user_id    = pu.id
JOIN doctors d   ON a.doctor_id  = d.id
JOIN users du    ON d.user_id    = du.id
JOIN specializations s ON d.specialization_id = s.id;

-- View: doctor public profile (for patient search)
CREATE OR REPLACE VIEW v_doctor_public_profile AS
SELECT
  d.id,
  d.first_name,
  d.last_name,
  d.profile_photo_url,
  d.bio,
  d.years_of_experience,
  d.consultation_fee,
  d.hospital_name,
  d.city,
  d.state,
  d.country,
  d.rating,
  d.total_reviews,
  d.status,
  s.id          AS specialization_id,
  s.name        AS specialization_name,
  u.email,
  -- Availability summary (days active)
  ARRAY(
    SELECT da.day_of_week::TEXT
    FROM doctor_availability da
    WHERE da.doctor_id = d.id AND da.is_active = TRUE
    ORDER BY
      CASE da.day_of_week
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
        WHEN 'sunday' THEN 7
      END
  ) AS available_days
FROM doctors d
JOIN specializations s ON d.specialization_id = s.id
JOIN users u            ON d.user_id           = u.id
WHERE d.status = 'approved' AND u.is_active = TRUE;

-- View: patient full profile with user info
CREATE OR REPLACE VIEW v_patient_profile AS
SELECT
  p.id,
  p.first_name,
  p.last_name,
  p.date_of_birth,
  p.gender,
  p.phone,
  p.address,
  p.city,
  p.state,
  p.country,
  p.blood_group,
  p.allergies,
  p.emergency_contact_name,
  p.emergency_contact_phone,
  p.profile_photo_url,
  p.created_at,
  u.id      AS user_id,
  u.email,
  u.is_active,
  u.last_login,
  -- Appointment stats
  (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id)                             AS total_appointments,
  (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed')  AS completed_appointments,
  (SELECT COUNT(*) FROM prescriptions pr WHERE pr.patient_id = p.id)                          AS total_prescriptions
FROM patients p
JOIN users u ON p.user_id = u.id;

-- View: admin dashboard summary
CREATE OR REPLACE VIEW v_admin_dashboard AS
SELECT
  (SELECT COUNT(*) FROM users WHERE is_active = TRUE)                          AS total_active_users,
  (SELECT COUNT(*) FROM patients)                                               AS total_patients,
  (SELECT COUNT(*) FROM doctors WHERE status = 'approved')                      AS total_approved_doctors,
  (SELECT COUNT(*) FROM doctors WHERE status = 'pending_approval')              AS pending_doctor_approvals,
  (SELECT COUNT(*) FROM appointments WHERE DATE(appointment_dt) = CURRENT_DATE) AS appointments_today,
  (SELECT COUNT(*) FROM appointments WHERE status = 'pending')                  AS pending_appointments,
  (SELECT COUNT(*) FROM appointments WHERE status = 'completed')                AS completed_appointments,
  (SELECT COUNT(*) FROM prescriptions WHERE status = 'active')                  AS active_prescriptions,
  (SELECT COUNT(*) FROM activity_logs WHERE created_at > NOW() - INTERVAL '24 hours') AS actions_last_24h;

-- =============================================================
-- COMMENTS ON TABLES (Documentation)
-- =============================================================
COMMENT ON TABLE users                      IS 'Central auth table for all roles';
COMMENT ON TABLE roles                      IS 'RBAC role definitions';
COMMENT ON TABLE patients                   IS 'Patient profile data (1:1 with users)';
COMMENT ON TABLE doctors                    IS 'Doctor profile data (1:1 with users)';
COMMENT ON TABLE admins                     IS 'Admin profile data (1:1 with users)';
COMMENT ON TABLE specializations            IS 'Medical specialization lookup table';
COMMENT ON TABLE doctor_availability        IS 'Weekly recurring availability schedule for doctors';
COMMENT ON TABLE doctor_unavailability      IS 'Specific dates when doctor is not available';
COMMENT ON TABLE appointments               IS 'Core booking table — patient-doctor appointments';
COMMENT ON TABLE prescriptions              IS 'Prescription header issued after consultation';
COMMENT ON TABLE prescription_medications   IS 'Individual medication lines within a prescription';
COMMENT ON TABLE medical_records            IS 'Persistent medical records per patient';
COMMENT ON TABLE activity_logs              IS 'Audit log for all major system actions';
COMMENT ON TABLE refresh_tokens             IS 'JWT refresh token store for session management';
COMMENT ON TABLE notifications              IS 'In-app notification queue per user';

COMMENT ON COLUMN medical_records.vitals       IS 'JSONB: flexible vital signs storage';
COMMENT ON COLUMN appointments.meeting_room_id IS 'socket.io room identifier for video consultation';
COMMENT ON COLUMN doctors.status           IS 'Approval workflow state managed by admin';
