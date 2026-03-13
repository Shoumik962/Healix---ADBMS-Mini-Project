// db/seed.js
// =============================================================
// HEALIX Database Seed
// Creates test users for all 3 roles + sample data.
// Passwords are bcrypt-hashed (cost 12).
// Usage: node db/seed.js
//        node db/seed.js --clean   (truncates before seeding)
// =============================================================
import 'dotenv/config';
import pg     from 'pg';
import bcrypt from 'bcryptjs';

const args  = process.argv.slice(2);
const CLEAN = args.includes('--clean');

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'healix_db',
  user:     process.env.DB_USER     || 'healix_user',
  password: process.env.DB_PASSWORD,
  options:  '-c search_path=healix,public',
});

const HASH = (pw) => bcrypt.hash(pw, 12);

// ── Seed data definitions ──────────────────────────────────────
const SEED_USERS = [
  // ─ Admin ─────────────────────────────────────────────────────
  {
    email: 'admin@healix.dev', password: 'Admin@1234', role: 'admin',
    first_name: 'System', last_name: 'Admin',
  },

  // ─ Doctors ───────────────────────────────────────────────────
  {
    email: 'dr.sarah@healix.dev', password: 'Doctor@1234', role: 'doctor',
    first_name: 'Sarah', last_name: 'Mitchell',
    specialization: 'Cardiology',
    license_number: 'LIC-CARD-001',
    years_of_experience: 12,
    consultation_fee: 150.00,
    hospital_name: 'City Heart Institute',
    city: 'New York', state: 'NY', country: 'US',
    bio: 'Board-certified cardiologist with 12 years of experience in interventional cardiology.',
    availability: [
      { day: 'monday',    start: '09:00', end: '17:00', slot: 30 },
      { day: 'tuesday',   start: '09:00', end: '17:00', slot: 30 },
      { day: 'wednesday', start: '10:00', end: '16:00', slot: 30 },
      { day: 'thursday',  start: '09:00', end: '17:00', slot: 30 },
      { day: 'friday',    start: '09:00', end: '13:00', slot: 30 },
    ],
  },
  {
    email: 'dr.james@healix.dev', password: 'Doctor@1234', role: 'doctor',
    first_name: 'James', last_name: 'Okafor',
    specialization: 'General Practice',
    license_number: 'LIC-GP-002',
    years_of_experience: 8,
    consultation_fee: 80.00,
    hospital_name: 'Riverside Medical Centre',
    city: 'Los Angeles', state: 'CA', country: 'US',
    bio: 'Family physician providing comprehensive primary care for patients of all ages.',
    availability: [
      { day: 'monday',    start: '08:00', end: '18:00', slot: 20 },
      { day: 'wednesday', start: '08:00', end: '18:00', slot: 20 },
      { day: 'friday',    start: '08:00', end: '14:00', slot: 20 },
      { day: 'saturday',  start: '09:00', end: '13:00', slot: 20 },
    ],
  },
  {
    email: 'dr.priya@healix.dev', password: 'Doctor@1234', role: 'doctor',
    first_name: 'Priya', last_name: 'Sharma',
    specialization: 'Dermatology',
    license_number: 'LIC-DERM-003',
    years_of_experience: 6,
    consultation_fee: 120.00,
    hospital_name: 'SkinCare Clinic',
    city: 'Chicago', state: 'IL', country: 'US',
    bio: 'Dermatologist specialising in medical and cosmetic skin conditions.',
    availability: [
      { day: 'tuesday',  start: '10:00', end: '18:00', slot: 30 },
      { day: 'thursday', start: '10:00', end: '18:00', slot: 30 },
      { day: 'saturday', start: '10:00', end: '14:00', slot: 30 },
    ],
  },
  {
    email: 'dr.chen@healix.dev', password: 'Doctor@1234', role: 'doctor',
    first_name: 'Wei', last_name: 'Chen',
    specialization: 'Neurology',
    license_number: 'LIC-NEURO-004',
    years_of_experience: 15,
    consultation_fee: 200.00,
    hospital_name: 'NeuroCenter Hospital',
    city: 'Boston', state: 'MA', country: 'US',
    bio: 'Neurologist with expertise in movement disorders and epilepsy management.',
    availability: [
      { day: 'monday',   start: '09:00', end: '15:00', slot: 45 },
      { day: 'thursday', start: '09:00', end: '15:00', slot: 45 },
    ],
  },

  // ─ Patients ──────────────────────────────────────────────────
  {
    email: 'patient.alex@healix.dev', password: 'Patient@1234', role: 'patient',
    first_name: 'Alex', last_name: 'Turner',
    date_of_birth: '1990-05-15', gender: 'male',
    phone: '+1-555-0101', blood_group: 'O+',
    city: 'New York', country: 'US',
    allergies: ['Penicillin', 'Dust mites'],
  },
  {
    email: 'patient.maria@healix.dev', password: 'Patient@1234', role: 'patient',
    first_name: 'Maria', last_name: 'Garcia',
    date_of_birth: '1985-11-22', gender: 'female',
    phone: '+1-555-0102', blood_group: 'A+',
    city: 'Los Angeles', country: 'US',
    allergies: ['Sulfa drugs'],
  },
  {
    email: 'patient.sam@healix.dev', password: 'Patient@1234', role: 'patient',
    first_name: 'Sam', last_name: 'Patel',
    date_of_birth: '1998-03-08', gender: 'other',
    phone: '+1-555-0103', blood_group: 'B+',
    city: 'Chicago', country: 'US',
    allergies: [],
  },
];

// ── Helpers ────────────────────────────────────────────────────
async function getRoleId(client, roleName) {
  const { rows } = await client.query(
    'SELECT id FROM roles WHERE name=$1', [roleName]
  );
  return rows[0]?.id;
}

async function getSpecId(client, specName) {
  const { rows } = await client.query(
    'SELECT id FROM specializations WHERE name=$1', [specName]
  );
  return rows[0]?.id;
}

async function cleanSeedData(client) {
  console.log('🧹 Cleaning seed data...');
  // Only remove test emails — preserve production data
  const testEmails = SEED_USERS.map(u => u.email);
  for (const email of testEmails) {
    const { rows } = await client.query(
      'SELECT id FROM users WHERE email=$1', [email]
    );
    if (rows.length) {
      // CASCADE deletes all child records
      await client.query('DELETE FROM users WHERE id=$1', [rows[0].id]);
    }
  }
  console.log('✅ Seed data cleaned');
}

// ── Main seed function ─────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  console.log('\n🌱 HEALIX Database Seeder\n');

  try {
    await client.query('BEGIN');

    if (CLEAN) await cleanSeedData(client);

    const created = { admins: 0, doctors: 0, patients: 0 };

    for (const u of SEED_USERS) {
      // Skip if already exists
      const { rows: existing } = await client.query(
        'SELECT id FROM users WHERE email=$1', [u.email]
      );
      if (existing.length) {
        console.log(`  ⏭  ${u.email} — already exists`);
        continue;
      }

      const roleId       = await getRoleId(client, u.role);
      const passwordHash = await HASH(u.password);

      // Create user
      const { rows: userRows } = await client.query(
        `INSERT INTO users (email, password_hash, role_id, is_verified)
         VALUES ($1,$2,$3,TRUE) RETURNING id`,
        [u.email, passwordHash, roleId]
      );
      const userId = userRows[0].id;

      // Create profile
      if (u.role === 'admin') {
        await client.query(
          `INSERT INTO admins (user_id, first_name, last_name)
           VALUES ($1,$2,$3)`,
          [userId, u.first_name, u.last_name]
        );
        created.admins++;

      } else if (u.role === 'doctor') {
        const specId = await getSpecId(client, u.specialization);

        const { rows: docRows } = await client.query(
          `INSERT INTO doctors
             (user_id, specialization_id, first_name, last_name, license_number,
              years_of_experience, consultation_fee, hospital_name,
              city, state, country, bio, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'approved')
           RETURNING id`,
          [userId, specId, u.first_name, u.last_name, u.license_number,
           u.years_of_experience, u.consultation_fee, u.hospital_name,
           u.city, u.state, u.country, u.bio]
        );
        const doctorId = docRows[0].id;

        // Seed availability
        for (const avail of u.availability) {
          await client.query(
            `INSERT INTO doctor_availability
               (doctor_id, day_of_week, start_time, end_time, slot_duration)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (doctor_id, day_of_week) DO NOTHING`,
            [doctorId, avail.day, avail.start, avail.end, avail.slot]
          );
        }

        created.doctors++;

      } else if (u.role === 'patient') {
        await client.query(
          `INSERT INTO patients
             (user_id, first_name, last_name, date_of_birth, gender,
              phone, blood_group, city, country, allergies)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [userId, u.first_name, u.last_name, u.date_of_birth, u.gender,
           u.phone, u.blood_group, u.city, u.country,
           u.allergies?.length ? u.allergies : null]
        );
        created.patients++;
      }

      console.log(`  ✅ Created ${u.role}: ${u.email}`);
    }

    await client.query('COMMIT');

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Seed complete

  Admins   created: ${created.admins}
  Doctors  created: ${created.doctors}
  Patients created: ${created.patients}

Test credentials (all use same password format):
  admin@healix.dev       → Admin@1234
  dr.sarah@healix.dev    → Doctor@1234
  dr.james@healix.dev    → Doctor@1234
  dr.priya@healix.dev    → Doctor@1234
  dr.chen@healix.dev     → Doctor@1234
  patient.alex@healix.dev  → Patient@1234
  patient.maria@healix.dev → Patient@1234
  patient.sam@healix.dev   → Patient@1234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
