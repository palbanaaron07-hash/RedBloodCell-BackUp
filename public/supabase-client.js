/* ============================================================
   BloodConnect - Supabase Client Helpers
   ============================================================ */

const SUPABASE_URL = window.SUPABASE_URL || 'https://addntsuplwotkymkyboh.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZG50c3VwbHdvdGt5bWt5Ym9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNTU1NDgsImV4cCI6MjA5MDgzMTU0OH0.UJMvVp9g-kc4XzmcCtnVyTIsyvV1nZ0C0T4YuzOqNb0';
const SUPABASE_FUNCTIONS_BASE_URL = window.SUPABASE_FUNCTIONS_BASE_URL || `${SUPABASE_URL}/functions/v1`;
const ADMIN_EMAILS = Array.isArray(window.ADMIN_EMAILS)
  ? window.ADMIN_EMAILS.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
  : ['admin@bloodconnect.com', 'adminblood@gmail.com'];
const normalizedUrl = String(SUPABASE_URL || '').trim();
const normalizedKey = String(SUPABASE_ANON_KEY || '').trim();
const SUPABASE_CONFIGURED =
  normalizedUrl.length > 0 &&
  normalizedKey.length > 0 &&
  !normalizedUrl.includes('YOUR_PROJECT_ID') &&
  normalizedKey !== 'YOUR_SUPABASE_ANON_KEY';

if (!window.supabase) {
  throw new Error('Supabase JS SDK is not loaded. Include @supabase/supabase-js before supabase-client.js');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

function mapError(error, fallbackMessage) {
  return { message: error?.message || fallbackMessage };
}

function mapAuthError(error, fallbackMessage, context = 'auth') {
  const rawMessage = String(error?.message || '').toLowerCase();
  const isRateLimited =
    rawMessage.includes('email rate limit exceeded') ||
    rawMessage.includes('rate limit') ||
    Number(error?.status) === 429;

  if (isRateLimited && context === 'signup') {
    return {
      message:
        'Too many sign-up attempts were made recently, so Supabase temporarily paused confirmation emails. Please wait a few minutes, then try again (or use a different email while testing).'
    };
  }

  return mapError(error, fallbackMessage);
}

function validatePasswordPolicy(password, context = {}) {
  const raw = String(password || '');
  const value = raw.trim();
  const email = String(context.email || '').toLowerCase();
  const username = String(context.username || '').toLowerCase();

  if (value.length < 10) {
    return { ok: false, message: 'Password must be at least 10 characters long.' };
  }
  if (!/[A-Z]/.test(value)) {
    return { ok: false, message: 'Password must include at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(value)) {
    return { ok: false, message: 'Password must include at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(value)) {
    return { ok: false, message: 'Password must include at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return { ok: false, message: 'Password must include at least one special character.' };
  }

  const normalized = value.toLowerCase();
  const common = new Set([
    'password', 'password123', '12345678', '123456789', 'qwerty123',
    'admin123', 'letmein123', 'welcome123', 'bloodconnect123'
  ]);
  if (common.has(normalized)) {
    return { ok: false, message: 'Password is too common. Please choose a stronger password.' };
  }

  if (username && normalized.includes(username)) {
    return { ok: false, message: 'Password must not contain your username.' };
  }

  return { ok: true, message: '' };
}

function validateRegistrationEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const basicEmailPattern = /^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

  if (!value || value.length > 254 || !basicEmailPattern.test(value)) {
    return { ok: false, message: 'Enter a complete, valid email address, such as name@gmail.com.' };
  }

  const atIndex = value.lastIndexOf('@');
  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (!localPart || localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return { ok: false, message: 'Enter a valid email address without misplaced or repeated dots.' };
  }

  const commonDomainCorrections = {
    'gmail.co': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.cmo': 'gmail.com',
    'gmail.om': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gmil.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'yahoo.co': 'yahoo.com',
    'yahoo.con': 'yahoo.com',
    'outlook.co': 'outlook.com',
    'outlook.con': 'outlook.com',
    'hotmail.co': 'hotmail.com',
    'hotmail.con': 'hotmail.com'
  };
  const correctedDomain = commonDomainCorrections[domain];
  if (correctedDomain) {
    return {
      ok: false,
      message: `Email domain looks incorrect. Did you mean ${localPart}@${correctedDomain}?`
    };
  }

  return { ok: true, message: '', normalized: value };
}

function validateBirthDateValue(value, options = {}) {
  const raw = String(value || '').trim();
  const minimumYear = Number(options.minimumYear) || 1900;
  const minimumAge = Math.max(0, Number(options.minimumAge) || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, message: 'Enter a valid date with a four-digit year, such as 05/05/2000.' };
  }

  const [year, month, day] = raw.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const isRealDate = birthDate.getFullYear() === year &&
    birthDate.getMonth() === month - 1 &&
    birthDate.getDate() === day;

  if (!isRealDate) {
    return { ok: false, message: 'Enter a real calendar date.' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (year < minimumYear || birthDate > today) {
    return {
      ok: false,
      message: `Birth year must contain four digits and be between ${minimumYear} and ${today.getFullYear()}.`
    };
  }

  if (minimumAge > 0) {
    let age = today.getFullYear() - year;
    const monthDifference = today.getMonth() - (month - 1);
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < day)) age -= 1;
    if (age < minimumAge) {
      return { ok: false, message: `You must be at least ${minimumAge} years old to register as a donor.` };
    }
  }

  return { ok: true, message: '', normalized: raw };
}

function configError() {
  return {
    data: null,
    error: {
      message: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in supabase-client.js.'
    }
  };
}

async function syncPhpRegistration({ email, password, firstName, middleName, lastName, phone, dob, address, gender, bloodType, username, medicalNotes = "", role }) {
  try {
    const response = await fetch('/api/register.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName,
        middleName,
        lastName,
        phone,
        dob,
        address,
        gender,
        bloodType,
        username,
        medicalNotes,
        role
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: payload?.error || payload?.message || `PHP registration failed (HTTP ${response.status})`
        }
      };
    }

    return { data: payload?.data || null, error: null };
  } catch (_) {
    return {
      data: null,
      error: {
        message: 'Network error while contacting server.'
      }
    };
  }
}

function bloodBank() {
  return supabaseClient.schema('blood_bank');
}

const REQUEST_DOCUMENT_BUCKET = 'request-supporting-documents';
const REQUEST_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const REQUEST_DOCUMENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf'
};

function validateRequestSupportingDocument(file) {
  if (!file || !Number(file.size)) return { ok: true, file: null, message: '' };
  if (!REQUEST_DOCUMENT_TYPES[file.type]) {
    return { ok: false, file: null, message: 'Supporting document must be a JPG, PNG, or PDF.' };
  }
  if (Number(file.size) > REQUEST_DOCUMENT_MAX_BYTES) {
    return { ok: false, file: null, message: 'Supporting document must be 20 MB or smaller.' };
  }
  return { ok: true, file, message: '' };
}

async function saveRequestVerificationSupport(requestId, facilityContact, file) {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return { data: null, error: { message: 'Not authenticated' } };

  const validation = validateRequestSupportingDocument(file);
  if (!validation.ok) return { data: null, error: { message: validation.message } };

  const contact = String(facilityContact || '').trim();
  if (!contact && !validation.file) return { data: null, error: null };

  let storagePath = null;
  if (validation.file) {
    const extension = REQUEST_DOCUMENT_TYPES[validation.file.type];
    const uniquePart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storagePath = `${user.id}/${Number(requestId)}/${uniquePart}.${extension}`;
    const { error: uploadError } = await supabaseClient.storage
      .from(REQUEST_DOCUMENT_BUCKET)
      .upload(storagePath, validation.file, { cacheControl: '3600', contentType: validation.file.type, upsert: false });
    if (uploadError) return { data: null, error: mapError(uploadError, 'Failed to upload the supporting document.') };
  }

  const supportPayload = {
    request_id: Number(requestId),
    facility_contact: contact || null,
    storage_path: storagePath,
    file_name: validation.file ? String(validation.file.name || `supporting-document.${REQUEST_DOCUMENT_TYPES[validation.file.type]}`).slice(0, 255) : null,
    mime_type: validation.file?.type || null,
    file_size: validation.file ? Number(validation.file.size) : null,
    created_by: user.id
  };
  const { data, error } = await bloodBank()
    .from('request_verification_support')
    .insert(supportPayload)
    .select('*')
    .single();

  if (error && storagePath) {
    await supabaseClient.storage.from(REQUEST_DOCUMENT_BUCKET).remove([storagePath]);
  }
  return error
    ? { data: null, error: mapError(error, 'The request was saved, but its private verification support could not be saved.') }
    : { data, error: null };
}

async function listRequestVerificationSupport(requestIds) {
  const ids = [...new Set((requestIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await bloodBank()
    .from('request_verification_support')
    .select('request_id, facility_contact, storage_path, file_name, mime_type, file_size, verification_method, verification_note, verified_by, verified_by_email, verified_at, created_at')
    .in('request_id', ids);
  return error
    ? { data: [], error: mapError(error, 'Failed to load private verification support.') }
    : { data: data || [], error: null };
}

async function createRequestDocumentSignedUrl(storagePath) {
  const path = String(storagePath || '').trim();
  if (!path) return { data: null, error: { message: 'No supporting document is attached.' } };
  const { data, error } = await supabaseClient.storage
    .from(REQUEST_DOCUMENT_BUCKET)
    .createSignedUrl(path, 300);
  return error
    ? { data: null, error: mapError(error, 'Unable to open the supporting document.') }
    : { data, error: null };
}

const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BLOOD_TYPE_ORDER = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

function normalizeBloodType(value) {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^\w+-]/g, '')
    .replace(/POSITIVE/g, '+')
    .replace(/NEGATIVE/g, '-')
    .replace(/PLUS/g, '+')
    .replace(/MINUS/g, '-');

  const aliases = {
    APOS: 'A+',
    ANEG: 'A-',
    BPOS: 'B+',
    BNEG: 'B-',
    ABPOS: 'AB+',
    ABNEG: 'AB-',
    OPOS: 'O+',
    ONEG: 'O-'
  };

  return aliases[compact] || compact;
}

function isValidBloodType(value) {
  return VALID_BLOOD_TYPES.includes(normalizeBloodType(value));
}

async function getAdminByEmail(email) {
  if (!email) return { admin: null, error: null };

  const { data, error } = await supabaseClient
    .schema('blood_bank')
    .from('admin')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    return { admin: null, error: mapError(error, 'Failed to load admin account') };
  }

  return { admin: data || null, error: null };
}

function isStackDepthError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('stack depth limit exceeded');
}

function isKnownAdminEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value.length > 0 && ADMIN_EMAILS.includes(value);
}

function buildFallbackAdminProfile(email) {
  return {
    role: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    email,
    created_at: null
  };
}

function buildFallbackPatientProfile(user, profileFields = null) {
  const meta = user?.user_metadata || {};
  const rawPatientId = Number(meta.patient_id);
  const patientId = Number.isInteger(rawPatientId) && rawPatientId > 0 ? rawPatientId : null;
  const email = String(user?.email || '').trim();
  const firstName =
    profileFields?.firstName ||
    meta.first_name ||
    (email ? email.split('@')[0] : 'Patient');
  const middleName = profileFields?.middleName ?? meta.middle_name ?? '';
  const lastName = profileFields?.lastName || meta.last_name || 'User';

  return {
    patient_id: patientId,
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    blood_type_needed: normalizeBloodType(profileFields?.bloodType || meta.blood_type || 'O+') || 'O+',
    hospital_name: null,
    contact_number: profileFields?.phone || null,
    address: profileFields?.address || null,
    created_at: null,
    _fallback: true
  };
}

function isInvalidCredentialsError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('invalid login credentials') || message.includes('invalid email or password');
}

async function bootstrapAdminAuth(email, password) {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const endpoint = `${SUPABASE_FUNCTIONS_BASE_URL}/bootstrap-admin-auth`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = Number(response.status || 0);
      if (status === 404) {
        return {
          data: null,
          error: {
            message:
              'Admin auth bootstrap function is not deployed yet. Deploy Supabase function "bootstrap-admin-auth" and try again.'
          }
        };
      }

      return {
        data: null,
        error: {
          message: payload?.error || payload?.message || 'Unable to prepare admin login.'
        }
      };
    }

    return { data: payload?.data || { bootstrapped: true }, error: null };
  } catch (_) {
    return {
      data: null,
      error: {
        message: 'Could not reach admin bootstrap service. Please try again.'
      }
    };
  }
}

function normalizePatientProfile(user, patientProfile) {
  const meta = user?.user_metadata || {};
  const source = patientProfile || {};

  return {
    ...source,
    first_name: source.first_name || meta.first_name || 'Patient',
    middle_name: source.middle_name ?? meta.middle_name ?? null,
    last_name: source.last_name || meta.last_name || 'User',
    blood_type: source.blood_type || source.blood_type_needed || meta.blood_type || null,
    phone: source.phone || source.contact_number || meta.phone || null,
    gender: source.gender || meta.gender || null,
    date_of_birth: source.date_of_birth || source.dob || meta.dob || null,
    address: source.address || meta.address || null,
    created_at: source.created_at || user?.created_at || meta.created_at || null
  };
}

function isMissingMultiRoleRpc(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST202' ||
    (message.includes('could not find the function') && message.includes('blood_bank')) ||
    message.includes('schema cache');
}

function normalizeAccountRoles(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source
    .map((role) => String(role || '').trim().toLowerCase())
    .filter((role) => role === 'patient' || role === 'donor'))];
}

async function getLinkedAccountProfiles(user) {
  if (!user) return { data: null, error: { message: 'Not authenticated' } };

  const { data, error } = await bloodBank().rpc('get_my_account_profiles');
  if (!error) {
    const context = data && typeof data === 'object' ? data : {};
    return {
      data: {
        patient: context.patient || null,
        donor: context.donor || null,
        roles: normalizeAccountRoles(context.roles)
      },
      error: null
    };
  }

  if (!isMissingMultiRoleRpc(error)) {
    return { data: null, error: mapError(error, 'Failed to load account capabilities.') };
  }

  // Backward-compatible lookup before the additive multi-role migration is run.
  const meta = user.user_metadata || {};
  const patientId = Number(meta.patient_id);
  let patient = null;
  let donor = null;

  if (Number.isInteger(patientId) && patientId > 0) {
    const patientResult = await bloodBank()
      .from('patient')
      .select('*')
      .eq('patient_id', patientId)
      .maybeSingle();
    if (!patientResult.error) patient = patientResult.data || null;
  }

  if (user.email) {
    const donorResult = await bloodBank()
      .from('donor')
      .select('*')
      .ilike('email', String(user.email).trim())
      .maybeSingle();
    if (!donorResult.error) donor = donorResult.data || null;
  }

  return {
    data: {
      patient,
      donor,
      roles: normalizeAccountRoles([
        patient ? 'patient' : null,
        donor ? 'donor' : null
      ])
    },
    error: null,
    migrationRequired: true
  };
}

function buildUnifiedAccountProfile(user, context = {}) {
  const patientProfile = context.patient || null;
  const donorProfile = context.donor || null;
  const meta = user?.user_metadata || {};
  let roles = normalizeAccountRoles(context.roles);
  const declaredRole = String(meta.role || '').trim().toLowerCase();

  if (!roles.length && (declaredRole === 'patient' || declaredRole === 'donor')) {
    roles = [declaredRole];
  }
  if (!roles.length) roles = ['patient'];

  const source = patientProfile || donorProfile || buildFallbackPatientProfile(user);
  const normalized = normalizePatientProfile(user, source);

  return {
    ...normalized,
    patient_id: patientProfile?.patient_id || null,
    donor_id: donorProfile?.donor_id || null,
    blood_type: normalizeBloodType(
      patientProfile?.blood_type_needed ||
      patientProfile?.blood_type ||
      donorProfile?.blood_type ||
      normalized.blood_type ||
      normalized.blood_type_needed ||
      user?.user_metadata?.blood_type ||
      null
    ) || null,
    role: roles.length > 1 ? 'patient_donor' : roles[0],
    roles,
    has_patient_profile: Boolean(patientProfile?.patient_id),
    has_donor_profile: Boolean(donorProfile?.donor_id),
    patient_profile: patientProfile,
    donor_profile: donorProfile,
    email: user?.email || donorProfile?.email || patientProfile?.email || null
  };
}

async function activateMyPatientProfile(payload = {}) {
  if (!SUPABASE_CONFIGURED) return configError();

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return { data: null, error: { message: 'Not authenticated' } };

  const bloodType = normalizeBloodType(payload.blood_type || user.user_metadata?.blood_type);
  if (!isValidBloodType(bloodType)) {
    return { data: null, error: { message: 'Please select a valid blood type.' } };
  }

  const { data, error } = await bloodBank().rpc('activate_my_patient_profile', {
    p_first_name: String(payload.first_name || user.user_metadata?.first_name || '').trim() || null,
    p_middle_name: String(payload.middle_name || user.user_metadata?.middle_name || '').trim() || null,
    p_last_name: String(payload.last_name || user.user_metadata?.last_name || '').trim() || null,
    p_blood_type: bloodType,
    p_contact_number: String(payload.phone || payload.contact_number || user.user_metadata?.phone || '').trim() || null,
    p_address: String(payload.address || user.user_metadata?.address || '').trim() || null
  });

  if (error) {
    return {
      data: null,
      error: {
        message: isMissingMultiRoleRpc(error)
          ? 'Database update required: apply migration 202608240001_multi_role_accounts.sql.'
          : (error.message || 'Unable to activate patient features.')
      },
      migrationRequired: isMissingMultiRoleRpc(error)
    };
  }

  const linkedProfiles = await getLinkedAccountProfiles(user);
  const currentRoles = normalizeAccountRoles([
    ...normalizeAccountRoles(user.user_metadata?.roles),
    ...normalizeAccountRoles(linkedProfiles.data?.roles)
  ]);
  const roles = normalizeAccountRoles([...currentRoles, 'patient']);
  await supabaseClient.auth.updateUser({
    data: {
      ...user.user_metadata,
      patient_id: data.patient_id,
      roles
    }
  });

  return { data, error: null };
}

async function activateMyDonorProfile(payload = {}) {
  if (!SUPABASE_CONFIGURED) return configError();

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return { data: null, error: { message: 'Not authenticated' } };

  const bloodType = normalizeBloodType(payload.blood_type || user.user_metadata?.blood_type);
  if (!isValidBloodType(bloodType)) {
    return { data: null, error: { message: 'Please select a valid blood type.' } };
  }

  const { data, error } = await bloodBank().rpc('activate_my_donor_profile', {
    p_first_name: String(payload.first_name || user.user_metadata?.first_name || '').trim() || null,
    p_middle_name: String(payload.middle_name || user.user_metadata?.middle_name || '').trim() || null,
    p_last_name: String(payload.last_name || user.user_metadata?.last_name || '').trim() || null,
    p_contact_number: String(payload.phone || payload.contact_number || user.user_metadata?.phone || '').trim() || null,
    p_blood_type: bloodType,
    p_gender: String(payload.gender || user.user_metadata?.gender || '').trim() || null,
    p_date_of_birth: payload.date_of_birth || payload.dob || user.user_metadata?.dob || null,
    p_address: String(payload.address || user.user_metadata?.address || '').trim() || null
  });

  if (error) {
    return {
      data: null,
      error: {
        message: isMissingMultiRoleRpc(error)
          ? 'Database update required: apply migration 202608240001_multi_role_accounts.sql.'
          : (error.message || 'Unable to activate donor features.')
      },
      migrationRequired: isMissingMultiRoleRpc(error)
    };
  }

  const linkedProfiles = await getLinkedAccountProfiles(user);
  const currentRoles = normalizeAccountRoles([
    ...normalizeAccountRoles(user.user_metadata?.roles),
    ...normalizeAccountRoles(linkedProfiles.data?.roles)
  ]);
  const roles = normalizeAccountRoles([...currentRoles, 'donor']);
  await supabaseClient.auth.updateUser({
    data: {
      ...user.user_metadata,
      donor_id: data.donor_id,
      roles
    }
  });

  return { data, error: null };
}

async function setMyDonorAvailability(isAvailable) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { data, error } = await bloodBank().rpc('set_my_donor_availability', {
    p_is_available: Boolean(isAvailable)
  });

  if (error) {
    return {
      data: null,
      error: {
        message: isMissingMultiRoleRpc(error)
          ? 'Database update required before donor availability can be changed.'
          : (error.message || 'Unable to update donor availability.')
      }
    };
  }
  return { data, error: null };
}

function getDonorRequestEligibility(donor) {
  const status = String(donor?.donor_status || 'registered').toLowerCase();
  if (!['approved', 'donated'].includes(status)) return {
    eligible: false, reason: status === 'deferred' ? 'Donation deferred. Staff clearance is required.' : 'Awaiting medical approval.'
  };
  if (!isEligibleToCheckIn(donor).eligible) return { eligible: false, reason: 'Your donation waiting period is not complete.' };
  if (String(donor?.availability_status || '').toLowerCase() !== 'available') return { eligible: false, reason: 'Availability is paused. Turn on Available for donor requests when you are ready.' };
  return { eligible: true, reason: '' };
}

async function getMyDonorDashboardData() {
  if (!SUPABASE_CONFIGURED) return configError();

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return { data: null, error: { message: 'Not authenticated' } };

  const contextResult = await getLinkedAccountProfiles(user);
  if (contextResult.error) return contextResult;
  const donor = contextResult.data?.donor || null;
  if (!donor?.donor_id) {
    return { data: { donor: null, donations: [], matching_requests: [] }, error: null };
  }

  let historyResult = await bloodBank().rpc('get_my_donation_history');
  if (historyResult.error && isMissingMultiRoleRpc(historyResult.error)) {
    // Attempt with status and notes first
    try {
      historyResult = await bloodBank()
        .from('donation_record')
        .select('donation_id, blood_type, quantity, donation_date, status, notes')
        .eq('donor_id', donor.donor_id)
        .order('donation_date', { ascending: false });
    } catch (_) {
      historyResult = await bloodBank()
        .from('donation_record')
        .select('donation_id, blood_type, quantity, donation_date')
        .eq('donor_id', donor.donor_id)
        .order('donation_date', { ascending: false });
    }
  }

  let matchingResult = await bloodBank().rpc('get_my_matching_requests');
  if (matchingResult.error && isMissingMultiRoleRpc(matchingResult.error)) {
    matchingResult = { data: null, error: { message: 'Matching requests require a database update. Please contact the coordinator.' } };
  }

  if (historyResult.error) {
    return { data: null, error: mapError(historyResult.error, 'Failed to load donation history.') };
  }
  if (matchingResult.error) {
    return { data: null, error: mapError(matchingResult.error, 'Failed to load matching requests.') };
  }

  const normalizedDonations = (historyResult.data || []).map((item) => ({
    donation_id: item.donation_id,
    blood_type: item.blood_type || donor.blood_type || '--',
    quantity: Number(item.quantity) || 1,
    donation_date: item.donation_date,
    status: String(item.status || 'completed').toLowerCase(),
    notes: item.notes || item.reason || ''
  }));

  return {
    data: {
      donor,
      donations: normalizedDonations,
      matching_requests: matchingResult.data || []
    },
    error: null
  };
}

async function resolveAdminProfile(email) {
  // Prevent unnecessary admin-table queries for regular users.
  // This avoids triggering recursive RLS/policy issues on projects
  // where admin policies are misconfigured.
  if (!isKnownAdminEmail(email)) {
    return { profile: null, error: null };
  }

  const { admin, error } = await getAdminByEmail(email);

  if (admin) {
    return {
      profile: {
        role: 'admin',
        first_name: admin.first_name,
        last_name: admin.last_name,
        email: admin.email,
        created_at: admin.created_at
      },
      error: null
    };
  }

  // If the admin table has a recursive policy/trigger issue, keep known admins functional.
  if (error && isStackDepthError(error) && isKnownAdminEmail(email)) {
    return { profile: buildFallbackAdminProfile(email), error: null };
  }

  return { profile: null, error };
}

async function ensurePatient(user, profileFields = null) {
  const meta = user?.user_metadata || {};
  const rawPatientId = Number(meta.patient_id);
  const patientId = Number.isInteger(rawPatientId) && rawPatientId > 0 ? rawPatientId : null;

  const linkedProfiles = await getLinkedAccountProfiles(user);
  if (!linkedProfiles.error && linkedProfiles.data?.patient) {
    return { profile: linkedProfiles.data.patient, error: null };
  }
  if (linkedProfiles.error && !isMissingMultiRoleRpc(linkedProfiles.error)) {
    return { profile: null, error: linkedProfiles.error };
  }

  const activated = await activateMyPatientProfile({
    first_name: profileFields?.firstName || meta.first_name,
    middle_name: profileFields?.middleName ?? meta.middle_name,
    last_name: profileFields?.lastName || meta.last_name,
    blood_type: profileFields?.bloodType || meta.blood_type || 'O+',
    phone: profileFields?.phone || meta.phone,
    address: profileFields?.address || meta.address
  });
  if (!activated.error && activated.data) {
    return { profile: activated.data, error: null };
  }
  if (activated.error && !activated.migrationRequired) {
    return { profile: null, error: activated.error };
  }

  if (patientId) {
    const { data: existingById, error: existingByIdError } = await supabaseClient
      .schema('blood_bank')
      .from('patient')
      .select('*')
      .eq('patient_id', patientId)
      .maybeSingle();

    if (existingByIdError) {
      if (isStackDepthError(existingByIdError)) {
        return { profile: buildFallbackPatientProfile(user, profileFields), error: null };
      }
      return { profile: null, error: mapError(existingByIdError, 'Failed to load patient profile') };
    }

    if (existingById) {
      return { profile: existingById, error: null };
    }
  }

  const firstName =
    profileFields?.firstName ||
    meta.first_name ||
    (user.email ? String(user.email).split('@')[0] : 'Patient');
  const middleName = profileFields?.middleName ?? meta.middle_name ?? '';
  const lastName = profileFields?.lastName || meta.last_name || 'User';
  const bloodType = normalizeBloodType(profileFields?.bloodType || meta.blood_type || 'O+') || 'O+';

  const { data: inserted, error: insertError } = await supabaseClient
    .schema('blood_bank')
    .from('patient')
    .insert({
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      blood_type_needed: bloodType,
      hospital_name: null,
      contact_number: profileFields?.phone || null,
      address: profileFields?.address || null
    })
    .select('*')
    .single();

  if (insertError) {
    if (isStackDepthError(insertError)) {
      return { profile: buildFallbackPatientProfile(user, profileFields), error: null };
    }
    return { profile: null, error: mapError(insertError, 'Failed to create patient profile') };
  }

  // Persist patient_id in auth metadata so future requests can map to patient rows.
  await supabaseClient.auth.updateUser({
    data: {
      ...meta,
      patient_id: inserted.patient_id,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName
    }
  });

  return { profile: inserted, error: null };
}

async function resolveOrCreatePatientId(user, profileFields = null) {
  const ensured = await ensurePatient(user, profileFields);
  if (ensured.error) {
    return { patientId: null, profile: ensured.profile || null, error: ensured.error };
  }

  if (ensured.profile?.patient_id) {
    return { patientId: ensured.profile.patient_id, profile: ensured.profile, error: null };
  }

  const meta = user?.user_metadata || {};
  const firstName =
    profileFields?.firstName ||
    meta.first_name ||
    (user?.email ? String(user.email).split('@')[0] : 'Patient');
  const middleName = profileFields?.middleName ?? meta.middle_name ?? '';
  const lastName = profileFields?.lastName || meta.last_name || 'User';
  const bloodType = normalizeBloodType(profileFields?.bloodType || meta.blood_type || 'O+') || 'O+';
  const phone = profileFields?.phone || meta.phone || null;
  const address = profileFields?.address || meta.address || null;

  // If select policies are recursive, a plain insert without select may still succeed.
  const { error: insertOnlyError } = await supabaseClient
    .schema('blood_bank')
    .from('patient')
    .insert({
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      blood_type_needed: bloodType,
      hospital_name: null,
      contact_number: phone,
      address
    });

  if (insertOnlyError && !isStackDepthError(insertOnlyError)) {
    return {
      patientId: null,
      profile: ensured.profile || buildFallbackPatientProfile(user, profileFields),
      error: mapError(insertOnlyError, 'Failed to link patient profile')
    };
  }

  // Best-effort lookup for the most recent matching row.
  const { data: linkedPatient, error: lookupError } = await supabaseClient
    .schema('blood_bank')
    .from('patient')
    .select('patient_id, first_name, middle_name, last_name, blood_type_needed, contact_number, address, created_at')
    .eq('first_name', firstName)
    .eq('last_name', lastName)
    .order('patient_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lookupError && linkedPatient?.patient_id) {
    await supabaseClient.auth.updateUser({
      data: {
        ...meta,
        patient_id: linkedPatient.patient_id,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        blood_type: bloodType,
        phone,
        address
      }
    });

    return { patientId: linkedPatient.patient_id, profile: linkedPatient, error: null };
  }

  return {
    patientId: null,
    profile: ensured.profile || buildFallbackPatientProfile(user, profileFields),
    error: null
  };
}

async function resolveRegularUserProfile(user) {
  const meta = user?.user_metadata || {};
  const declaredRole = String(meta.role || '').trim().toLowerCase();
  const desiredRoles = normalizeAccountRoles(meta.roles);
  if (!desiredRoles.length && (declaredRole === 'patient' || declaredRole === 'donor')) {
    desiredRoles.push(declaredRole);
  }
  if (!desiredRoles.length) desiredRoles.push('patient');

  let contextResult = await getLinkedAccountProfiles(user);
  if (contextResult.error) return { profile: null, error: contextResult.error };
  let context = contextResult.data || { patient: null, donor: null, roles: [] };
  let donorSetupError = null;

  if (desiredRoles.includes('patient') && !context.patient) {
    const patientResult = await ensurePatient(user);
    if (patientResult.error) return { profile: null, error: patientResult.error };
    context = {
      ...context,
      patient: patientResult.profile || context.patient,
      roles: normalizeAccountRoles([...(context.roles || []), 'patient'])
    };
    contextResult = await getLinkedAccountProfiles(user);
    if (!contextResult.error && contextResult.data?.patient) context = contextResult.data;
  }

  if (desiredRoles.includes('donor') && !context.donor) {
    const donorResult = await activateMyDonorProfile({
      first_name: meta.first_name,
      middle_name: meta.middle_name,
      last_name: meta.last_name,
      phone: meta.phone,
      blood_type: meta.blood_type,
      gender: meta.gender,
      dob: meta.dob,
      address: meta.address
    });
    if (donorResult.error) {
      donorSetupError = donorResult.error.message;
    } else {
      context = {
        ...context,
        donor: donorResult.data || context.donor,
        roles: normalizeAccountRoles([...(context.roles || []), 'donor'])
      };
      contextResult = await getLinkedAccountProfiles(user);
      if (!contextResult.error && contextResult.data?.donor) context = contextResult.data;
    }
  }

  // Fallback: if the context still has no donor profile, do a direct email lookup.
  // This handles accounts whose auth metadata only declares 'patient' but whose email
  // matches an existing donor row (e.g. Barry registered as a donor separately).
  if (!context.donor && user.email) {
    const { data: donorRow, error: donorLookupError } = await bloodBank()
      .from('donor')
      .select('*')
      .ilike('email', String(user.email).trim())
      .maybeSingle();
    if (!donorLookupError && donorRow?.donor_id) {
      context = {
        ...context,
        donor: donorRow,
        roles: normalizeAccountRoles([...(context.roles || []), 'donor'])
      };
    }
  }

  return {
    profile: {
      ...buildUnifiedAccountProfile(user, context),
      donor_setup_error: donorSetupError
    },
    error: null
  };
}

/* ============================================================
   AUTH HELPERS  (same function signatures as before)
   ============================================================ */

async function signUp({ email, password, firstName, middleName, lastName, phone, dob, address, gender, bloodType, role, username, medicalNotes = "" }) {
  if (!SUPABASE_CONFIGURED) return configError();
  const startingRole = String(role || '').toLowerCase() === 'donor' ? 'donor' : 'patient';
  const emailCheck = validateRegistrationEmail(email);
  if (!emailCheck.ok) {
    return { data: null, error: { message: emailCheck.message } };
  }
  const birthDateCheck = validateBirthDateValue(dob, {
    minimumYear: 1900,
    minimumAge: startingRole === 'donor' ? 18 : 0
  });
  if (!birthDateCheck.ok) {
    return { data: null, error: { message: birthDateCheck.message } };
  }

  const passwordCheck = validatePasswordPolicy(password, { email, username });
  if (!passwordCheck.ok) {
    return { data: null, error: { message: passwordCheck.message } };
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
          role: startingRole,
          roles: [startingRole],
          phone: phone || null,
          gender: gender || null,
          address: address || null,
          blood_type: bloodType || null,
          dob: dob || null,
          username: username || null
        }
      }
    });

    if (error) return { data: null, error: mapAuthError(error, 'Sign-up failed', 'signup') };

    if (data?.user && data?.session) {
      if (startingRole === 'patient') {
        const profileResult = await ensurePatient(data.user, {
          firstName,
          middleName,
          lastName,
          phone,
          dob,
          address,
          gender,
          bloodType,
          role,
          username,
          medicalNotes
        });

        if (profileResult.error) {
          return { data: null, error: profileResult.error };
        }
      } else if (startingRole === 'donor') {
        const donorResult = await activateMyDonorProfile({
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          phone,
          blood_type: bloodType,
          gender,
          dob,
          address
        });
        if (donorResult.error) {
          console.warn('Donor profile activation will be completed after sign-in:', donorResult.error.message);
        }
      }
    }

    const phpSync = await syncPhpRegistration({
      email,
      password,
      firstName,
      middleName,
      lastName,
      phone,
      dob,
      address,
      gender,
      bloodType,
      username,
      medicalNotes,
      role: startingRole
    });

    if (phpSync.error) {
      console.warn('PHP registration sync failed', phpSync.error.message);
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while connecting to Supabase' } };
  }
}

async function resolveLoginEmail(identifier) {
  const clean = String(identifier || "").trim();
  if (!clean) return "";
  if (clean.includes("@")) return clean;
  if (clean.toLowerCase() === "admin") return "admin@bloodconnect.com";
  try {
    const { data, error } = await supabaseClient.rpc("resolve_login_identifier", { identifier: clean });
    if (!error && Array.isArray(data) && data[0]?.email) {
      return data[0].email;
    }
  } catch (e) {}
  return clean;
}

async function signIn(loginIdentifier, password) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const email = await resolveLoginEmail(loginIdentifier);
    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error && isInvalidCredentialsError(error)) {
      const bootstrap = await bootstrapAdminAuth(email, password);
      if (bootstrap.error && isKnownAdminEmail(email)) {
        return { data: null, error: bootstrap.error };
      }

      if (!bootstrap.error) {
        const retry = await supabaseClient.auth.signInWithPassword({ email, password });
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) return { data: null, error: mapError(error, 'Sign-in failed') };

    const userEmail = data.user?.email || '';
    const { profile: adminProfile, error: adminError } = await resolveAdminProfile(userEmail);

    if (adminError) {
      return { data: null, error: adminError };
    }

    let profile = null;
    if (adminProfile) {
      profile = adminProfile;
    } else {
      const accountResult = await resolveRegularUserProfile(data.user);
      if (accountResult.error) return { data: null, error: accountResult.error };
      profile = accountResult.profile;
    }

    return {
      data: {
        user: data.user,
        profile
      },
      error: null
    };
  } catch (err) {
    return { data: null, error: { message: 'Network error while connecting to Supabase' } };
  }
}

async function callPasswordResetService(body, accessToken = '') {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/password-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: payload.error || 'Password reset request failed.',
          attemptsRemaining: payload.attempts_remaining
        }
      };
    }

    return { data: payload, error: null };
  } catch (_) {
    return { data: null, error: { message: 'Network error. Check your connection and try again.' } };
  }
}

async function requestPasswordResetOtp(email) {
  return callPasswordResetService({ action: 'request', email });
}

async function verifyPasswordResetOtp(email, token) {
  const result = await callPasswordResetService({ action: 'verify', email, token });
  if (result.error) return result;

  const session = result.data?.session;
  if (!session?.access_token || !session?.refresh_token) {
    return { data: null, error: { message: 'Verification could not be completed. Request a new code.' } };
  }

  const { error } = await supabaseClient.auth.setSession(session);
  if (error) return { data: null, error: mapError(error, 'Verification session could not be started.') };
  return { data: { verified: true }, error: null };
}

async function syncPhpResetPassword(password, action, accessToken) {
  try {
    const response = await fetch('/api/sync-reset-password.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ action, password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { error: { message: payload.error || 'Legacy account sync failed.' } };
    return { data: payload, error: null };
  } catch (_) {
    // The PHP compatibility API is optional in Supabase-only deployments.
    return { data: { skipped: true }, error: null };
  }
}

async function completePasswordReset(password, email = '') {
  const passwordCheck = validatePasswordPolicy(password, { email });
  if (!passwordCheck.ok) return { data: null, error: { message: passwordCheck.message } };

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.access_token) {
    return { data: null, error: { message: 'Verification has expired. Request a new code.' } };
  }

  const legacyCheck = await syncPhpResetPassword(password, 'validate', session.access_token);
  if (legacyCheck.error) return { data: null, error: legacyCheck.error };

  const result = await callPasswordResetService({ action: 'reset', password }, session.access_token);
  if (result.error) return result;

  const legacySync = await syncPhpResetPassword(password, 'commit', session.access_token);
  if (legacySync.error) return { data: null, error: legacySync.error };

  const revokeResult = await callPasswordResetService({ action: 'revoke' }, session.access_token);
  await clearAuthSession();
  if (revokeResult.error) return { data: null, error: revokeResult.error };
  return result;
}

async function signOut() {
  try {
    await clearAuthSession();
  } catch (err) {
    console.warn('Error during signOut:', err);
  } finally {
    window.location.replace('login.html');
  }
}

async function clearAuthSession() {
  // 1. Immediately clear all auth tokens from localStorage and sessionStorage
  const clearStorageKeys = (storage) => {
    try {
      if (!storage) return;
      const keys = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token') || key.includes('veindrop'))) {
          keys.push(key);
        }
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch (_) { }
  };

  clearStorageKeys(window.localStorage);
  clearStorageKeys(window.sessionStorage);

  // 2. Safely call Supabase signOut with a strict 500ms timeout so UI never hangs
  if (SUPABASE_CONFIGURED && window.supabaseClient?.auth) {
    try {
      await Promise.race([
        supabaseClient.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 500))
      ]);
    } catch (_) { }
  }
}

async function getCurrentUser() {
  if (!SUPABASE_CONFIGURED) {
    return { user: null, profile: null };
  }
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data?.user) {
      return { user: null, profile: null };
    }

    const userEmail = data.user?.email || '';
    const { profile: adminProfile, error: adminError } = await resolveAdminProfile(userEmail);

    if (adminError) {
      return { user: null, profile: null };
    }

    let profile = null;
    if (adminProfile) {
      profile = adminProfile;
    } else {
      const accountResult = await resolveRegularUserProfile(data.user);
      if (accountResult.error) return { user: null, profile: null };
      profile = accountResult.profile;
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email
      },
      profile
    };
  } catch (_) {
    return { user: null, profile: null };
  }
}

async function requireAdmin() {
  const { user, profile } = await getCurrentUser();

  if (!user || !profile) {
    window.location.href = 'login.html';
    return null;
  }

  if (profile.role !== 'admin') {
    window.location.href = 'login.html';
    return null;
  }

  return { user, profile };
}

async function requireAuth() {
  const { user, profile } = await getCurrentUser();

  if (!user || !profile) {
    window.location.href = 'login.html';
    return null;
  }

  return { user, profile };
}

async function redirectIfLoggedIn() {
  const { user, profile } = await getCurrentUser();

  if (user && profile) {
    if (profile.role === 'admin') {
      window.location.href = 'admin_dashboard.html';
    } else {
      window.location.href = 'account_dashboard.html';
    }
  }
}

async function listDonors() {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    let { data, error } = await bloodBank()
      .from('donor')
      .select('donor_id, auth_user_id, first_name, middle_name, last_name, email, contact_number, blood_type, gender, date_of_birth, address, availability_status, donor_status, last_donation_date, created_at, show_on_map, location_status, map_area')
      .order('created_at', { ascending: false });

    if (error && String(error.message || '').toLowerCase().includes('show_on_map')) {
      const fallback = await bloodBank()
        .from('donor')
        .select('donor_id, auth_user_id, first_name, middle_name, last_name, email, contact_number, blood_type, gender, date_of_birth, address, availability_status, donor_status, last_donation_date, created_at')
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return { data: null, error: mapError(error, 'Failed to load donors.') };
    }

    const donors = (data || [])
      .filter((row) => {
        const email = String(row.email || '').toLowerCase();
        const first = String(row.first_name || '').toLowerCase();
        const last = String(row.last_name || '').toLowerCase();
        const isTempEmail = email.startsWith('donor.test.') && email.endsWith('@example.com');
        const isTempName = first === 'temp' && last === 'donor';
        return !isTempEmail && !isTempName;
      })
      .map((row) => ({
        id: row.donor_id,
        auth_user_id: row.auth_user_id,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.contact_number,
        blood_type: row.blood_type,
        gender: row.gender,
        date_of_birth: row.date_of_birth,
        address: row.address,
        availability_status: row.availability_status,
        donor_status: row.donor_status || 'registered',
        show_on_map: row.show_on_map === true,
        location_status: row.location_status || 'needs_review',
        map_area: row.map_area || row.address || null,
        area: row.map_area || null,
        last_donation_date: row.last_donation_date,
        created_at: row.created_at,
        is_eligible: String(row.availability_status || '').toLowerCase() === 'available'
      }));

    return { data: donors, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while loading donors.' } };
  }
}

function getDonorMapVisibilityState(donor) {
  const status = String(donor?.donor_status || 'registered').toLowerCase();
  if (!['approved', 'donated'].includes(status)) {
    return { visible: false, reason: status === 'deferred' ? 'Donation deferred; staff clearance required.' : 'Awaiting medical approval.' };
  }
  if (!isEligibleToCheckIn(donor).eligible) return { visible: false, reason: 'Donation waiting period is not complete.' };
  if (String(donor?.availability_status || '').toLowerCase() !== 'available') return { visible: false, reason: 'Availability is paused.' };
  if (donor?.show_on_map !== true) return { visible: false, reason: 'Map permission is off.' };
  if (!String(donor?.map_area || donor?.area || '').trim()) return { visible: false, reason: 'Location missing.' };
  if (donor?.location_status !== 'verified') return { visible: false, reason: 'Awaiting location verification.' };
  return { visible: true, reason: 'Your approximate area can appear on the donor map.' };
}

async function listVisibleDonors() {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const { data, error } = await bloodBank().rpc('list_visible_donors');

    const isScreenedAndEligibleRow = (row) => {
      if (!getDonorMapVisibilityState(row).visible) return false;
      const status = String(row?.donor_status || '').toLowerCase();
      if (['registered', 'checked_in', 'deferred', 'incomplete'].includes(status)) {
        return false;
      }
      if (status === 'approved') return true;
      if (row?.last_donation_date) {
        const next = new Date(row.last_donation_date);
        next.setDate(next.getDate() + 56);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (next > today) return false; // Still within 56-day waiting period
      }
      return status === 'donated' || status === 'available';
    };

    if (error) {
      if (isMissingMultiRoleRpc(error)) {
        // Preserve older deployments until the additive multi-role migration is applied.
        const fallback = await listDonors();
        if (fallback.error) return fallback;
        return {
          data: (fallback.data || [])
            .filter((d) => d.show_on_map === true && String(d.location_status).toLowerCase() === 'verified' && isScreenedAndEligibleRow(d))
            .map((donor) => ({
              id: donor.id,
              donor_id: donor.id,
              blood_type: donor.blood_type,
              availability_status: donor.availability_status,
              donor_status: donor.donor_status,
              show_on_map: donor.show_on_map,
              location_status: donor.location_status,
              map_area: donor.map_area,
              area: donor.area,
              last_donation_date: donor.last_donation_date
            })),
          error: null
        };
      }
      return { data: null, error: mapError(error, 'Failed to load donor zones.') };
    }

    const filtered = (data || [])
      .filter((row) => isScreenedAndEligibleRow(row))
      .map((row) => ({
        id: row.donor_id,
        donor_id: row.donor_id,
        blood_type: row.blood_type,
        availability_status: row.availability_status,
        donor_status: row.donor_status || 'approved',
        show_on_map: row.show_on_map === true,
        location_status: row.location_status || 'needs_review',
        map_area: row.map_area || null,
        area: row.map_area || null,
        last_donation_date: row.last_donation_date
      }));

    return {
      data: filtered,
      error: null
    };
  } catch (_) {
    return { data: null, error: { message: 'Network error while loading donor zones.' } };
  }
}

async function updateDonorMapSettings(donorId, payload) {
  if (!SUPABASE_CONFIGURED) return configError();

  const id = Number(donorId);
  if (!Number.isInteger(id) || id <= 0) {
    return { data: null, error: { message: 'Valid donor ID is required.' } };
  }

  const status = String(payload?.location_status || 'needs_review').trim();
  const allowedStatuses = ['verified', 'needs_review', 'missing'];
  if (!allowedStatuses.includes(status)) {
    return { data: null, error: { message: 'Invalid location status.' } };
  }

  const updates = {
    show_on_map: Boolean(payload?.show_on_map),
    location_status: status,
    map_area: String(payload?.map_area || '').trim() || null
  };

  try {
    const { data: current, error: readError } = await bloodBank()
      .from('donor')
      .select('map_area, location_status')
      .eq('donor_id', id)
      .single();
    if (readError) return { data: null, error: readError };
    // Location quality and map visibility are independent. A changed area
    // must be saved for review before it can be verified on a subsequent save.
    if (!updates.map_area) {
      updates.location_status = 'missing';
    } else if (updates.map_area !== String(current.map_area || '').trim()) {
      updates.location_status = 'needs_review';
    } else if (updates.location_status === 'missing') {
      updates.location_status = 'needs_review';
    }

    const { data, error } = await bloodBank()
      .from('donor')
      .update(updates)
      .eq('donor_id', id)
      .select('donor_id, show_on_map, location_status, map_area')
      .single();

    if (error) {
      const rawMessage = String(error.message || '').toLowerCase();
      const isSchemaCacheError =
        rawMessage.includes('schema cache') ||
        rawMessage.includes('location_status') ||
        rawMessage.includes('show_on_map') ||
        rawMessage.includes('map_area');

      return {
        data: null,
        error: {
          message: isSchemaCacheError
            ? 'Database setup needed: run supabase-donor-map-visibility.sql in Supabase SQL Editor, then refresh this page.'
            : (error.message || 'Failed to update donor map settings.')
        }
      };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while updating donor map settings.' } };
  }
}

async function setMyDonorMapVisibility(showOnMap) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { data: user } = await getCurrentUser();
    if (!user) return { data: null, error: { message: 'Authentication required.' } };

    const { data: donor, error: fetchErr } = await bloodBank()
      .from('donor')
      .select('donor_id, show_on_map, location_status, map_area')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (fetchErr || !donor) {
      return { data: null, error: mapError(fetchErr, 'Donor profile not found.') };
    }

    const { data, error } = await bloodBank()
      .from('donor')
      .update({
        show_on_map: Boolean(showOnMap),
        location_status: !String(donor.map_area || '').trim() ? 'missing'
          : donor.location_status === 'verified' ? 'verified' : 'needs_review'
      })
      .eq('donor_id', donor.donor_id)
      .select('donor_id, show_on_map, location_status, map_area')
      .single();

    if (error) return { data: null, error: mapError(error, 'Failed to update map visibility.') };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error updating map visibility.' } };
  }
}


async function addDonor(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return { data: null, error: { message: 'Admin authentication is required.' } };
    const endpoint = `${SUPABASE_FUNCTIONS_BASE_URL}/add-donor`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: {
          message:
            json.error ||
            json.message ||
            json.msg ||
            `Failed to add donor (HTTP ${res.status}).`
        }
      };
    }

    return { data: json?.data || null, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: 'Network error while calling add-donor function.'
      }
    };
  }
}

async function updateDonorEligibility(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return { data: null, error: { message: 'Admin authentication is required.' } };
    const endpoint = `${SUPABASE_FUNCTIONS_BASE_URL}/update-donor-eligibility`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: {
          message:
            json.error ||
            json.message ||
            `Failed to update donor eligibility (HTTP ${res.status}).`
        }
      };
    }

    return { data: json?.data || null, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: 'Network error while updating donor eligibility.'
      }
    };
  }
}

function normalizeCommunityRequestStatus(row) {
  const storedStatus = String(row?.community_status || '').trim().toLowerCase();
  const operationalStatus = String(row?.status || '').trim().toLowerCase();
  const isReplacement = String(row?.request_type || '').trim().toLowerCase() === 'replacement';
  if (['fulfilled', 'complete', 'completed', 'done', 'closed'].includes(operationalStatus) || storedStatus === 'fulfilled') {
    return 'fulfilled';
  }
  if (['rejected', 'declined', 'cancelled', 'canceled'].includes(operationalStatus)) {
    return 'expired';
  }

  const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;
  const timedOut = !isReplacement && expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
  if (storedStatus === 'expired' || timedOut) {
    return 'expired';
  }

  return storedStatus === 'covered' ? 'covered' : 'active';
}

async function listRequestPledges(requestIds = []) {
  if (!SUPABASE_CONFIGURED) return configError();
  const ids = [...new Set((requestIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return { data: [], error: null };

  const { data, error } = await bloodBank()
    .from('donor_pledge')
    .select('pledge_id, request_id, donor_id, units_pledged, status, pledged_at, updated_at, donor:donor_id(first_name,middle_name,last_name,blood_type)')
    .in('request_id', ids)
    .order('pledged_at', { ascending: true });

  if (error) return { data: [], error: mapError(error, 'Unable to load donor pledges.') };
  return {
    data: (data || []).map((row) => {
      const donor = Array.isArray(row.donor) ? row.donor[0] : (row.donor || {});
      return {
        pledge_id: row.pledge_id,
        request_id: row.request_id,
        donor_id: row.donor_id,
        donor_name: [donor.first_name, donor.middle_name, donor.last_name].filter(Boolean).join(' ') || 'Registered donor',
        blood_type: normalizeBloodType(donor.blood_type || ''),
        units_pledged: Number(row.units_pledged || 1),
        status: row.status || 'pledged',
        pledged_at: row.pledged_at || null,
        updated_at: row.updated_at || null
      };
    }),
    error: null
  };
}

async function listMyBloodRequests() {
  if (!SUPABASE_CONFIGURED) return configError();
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {
    return { data: null, error: { message: 'Not authenticated' } };
  }

  const patientResult = await ensurePatient(user);
  if (patientResult.error) {
    return { data: null, error: patientResult.error };
  }

  if (!patientResult.profile?.patient_id) {
    return { data: [], error: null };
  }

  const { data, error } = await bloodBank()
    .from('blood_request')
    .select('*, replacement_campaign(target_units, pledged_units, confirmed_units, status, confirmation_reference)')
    .eq('patient_id', patientResult.profile.patient_id)
    .order('request_date', { ascending: false });

  if (error) {
    if (isStackDepthError(error)) {
      return {
        data: null,
        error: {
          message:
            'Database RLS recursion is blocking request loading. Ask the admin to run supabase-patient-request-rls-fix.sql, then retry.'
        }
      };
    }
    return { data: null, error: mapError(error, 'Failed to load blood requests.') };
  }

  const normalized = (data || [])
    .filter((row) => !String(row.note || row.notes || '').includes('[DELETED]'))
    .map((row) => {
    const rawStatus = String(row.status || '').trim().toLowerCase();
    let normalizedStatus = rawStatus || 'pending';

    // Map variations to standard statuses
    if (['fulfilled', 'complete', 'completed', 'done'].includes(rawStatus)) {
      normalizedStatus = 'fulfilled';
    } else if (['processing', 'in_progress', 'in progress', 'ongoing'].includes(rawStatus)) {
      normalizedStatus = 'processing';
    } else if (['pending', 'requested', 'new', 'open'].includes(rawStatus)) {
      normalizedStatus = 'pending';
    } else if (['approved'].includes(rawStatus)) {
      normalizedStatus = 'approved';
    } else if (['needs_clarification', 'needs clarification'].includes(rawStatus)) {
      normalizedStatus = 'needs_clarification';
    } else if (['cancelled', 'canceled'].includes(rawStatus)) {
      normalizedStatus = 'cancelled';
    } else if (['rejected', 'declined'].includes(rawStatus)) {
      normalizedStatus = 'rejected';
    }

    // Parse structured tags from note field
    const rawNoteStr = String(row.note || row.notes || '');
    const hospitalTagMatch = rawNoteStr.match(/\[Hospital:([^\]]+)\]/);
    const parsedHospital = hospitalTagMatch ? hospitalTagMatch[1].trim() : null;
    const timeTagMatch = rawNoteStr.match(/\[NeededTime:([^\]]+)\]/);
    const parsedNeededTime = timeTagMatch ? timeTagMatch[1].trim() : (row.needed_time || row.needed_date || null);
    const cleanNote = rawNoteStr
      .replace(/\[Community Crowdsourced\]/g, '')
      .replace(/\[Hospital:[^\]]+\]/g, '')
      .replace(/\[NeededTime:[^\]]+\]/g, '')
      .trim();

    const communityStatus = normalizeCommunityRequestStatus(row);

    return {
      id: row.request_id,
      blood_type: normalizeBloodType(row.blood_type_needed),
      units_needed: Number(row.quantity || 1),
      urgency: row.urgency_level || 'normal',
      status: communityStatus,
      community_status: communityStatus,
      operational_status: normalizedStatus,
      status_raw: row.status || 'pending',
      expires_at: row.expires_at || null,
      created_at: row.request_date || row.created_at || null,
      needed_time: parsedNeededTime,
      hospital: parsedHospital || row.hospital_name || row.hospital || 'Blood Bank',
      donation_point: parsedHospital || row.hospital_name || row.hospital || 'Blood Bank',
      notes: cleanNote,
      raw_note: rawNoteStr,
      admin_note: row.admin_note || row.admin_message || row.admin_comment || '',
      request_type: row.request_type || 'unsure',
      verification_status: row.verification_status || 'pending',
      hospital_reference: row.hospital_reference || '',
      recipient_received_at: row.recipient_received_at || null,
      replacement_campaign: Array.isArray(row.replacement_campaign) ? row.replacement_campaign[0] : (row.replacement_campaign || null)
    };
  });

  const requestIds = normalized.map((request) => request.id);
  const [supportResult, pledgeResult] = await Promise.all([
    listRequestVerificationSupport(requestIds),
    listRequestPledges(requestIds)
  ]);
  const supportByRequest = new Map((supportResult.data || []).map((item) => [Number(item.request_id), item]));
  const pledgesByRequest = new Map();
  (pledgeResult.data || []).forEach((pledge) => {
    const key = Number(pledge.request_id);
    if (!pledgesByRequest.has(key)) pledgesByRequest.set(key, []);
    pledgesByRequest.get(key).push(pledge);
  });
  normalized.forEach((request) => {
    request.verification_support = supportByRequest.get(Number(request.id)) || null;
    request.pledges = pledgesByRequest.get(Number(request.id)) || [];
  });

  return { data: normalized, error: null };
}

async function updateMyBloodRequest(requestId, payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return { data: null, error: { message: 'Not authenticated' } };

  const hospitalName = String(payload.hospital || '').trim();
  const hospitalTag = hospitalName ? `[Hospital:${hospitalName}]` : '';
  const neededTimeStr = String(payload.needed_time || payload.needed_date || payload.time_needed || '').trim();
  const timeTag = neededTimeStr ? `[NeededTime:${neededTimeStr}]` : '';
  const rawNote = String(payload.notes || '').trim();
  const note = [hospitalTag, timeTag, rawNote].filter(Boolean).join(' ') || null;

  const isReplacement = String(payload.request_type || '') === 'replacement';
  const updates = {
    quantity: Number(payload.units_needed) || 1,
    note
  };
  if (!isReplacement) {
    const bloodType = normalizeBloodType(payload.blood_type);
    if (!isValidBloodType(bloodType)) {
      return { data: null, error: { message: 'Please select a valid blood type.' } };
    }
    updates.blood_type_needed = bloodType;
    updates.urgency_level = payload.urgency || 'normal';
  }

  const { data, error } = await bloodBank()
    .from('blood_request')
    .update(updates)
    .eq('request_id', requestId)
    .select('*')
    .single();

  if (error) return { data: null, error: mapError(error, 'Failed to update request.') };
  return { data, error: null };
}

async function deleteMyBloodRequest(requestId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return { error: { message: 'Not authenticated' } };

  const numId = Number(requestId);
  const targetId = !isNaN(numId) ? numId : requestId;
  const supportResult = await listRequestVerificationSupport([targetId]);
  const support = supportResult.data?.[0] || null;

  const { data, error } = await bloodBank().rpc('manage_my_blood_request', {
    p_request_id: targetId,
    p_action: 'delete'
  });
  if (error) return { data: null, error: mapError(error, 'Failed to delete request.') };
  if (String(data?.action || '') !== 'deleted') {
    return { data: null, error: { message: 'The database did not confirm that the request was deleted.' } };
  }

  const storagePath = data?.storage_path || support?.storage_path;
  let warning = '';
  if (storagePath) {
    const { error: storageError } = await supabaseClient.storage
      .from(REQUEST_DOCUMENT_BUCKET)
      .remove([storagePath]);
    if (storageError) warning = 'The request was deleted, but its uploaded document could not be removed automatically.';
  }

  return { data, error: null, warning };
}

async function cancelMyBloodRequest(requestId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const targetId = Number(requestId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return { data: null, error: { message: 'Invalid blood request.' } };
  }

  const { data, error } = await bloodBank().rpc('manage_my_blood_request', {
    p_request_id: targetId,
    p_action: 'cancel'
  });
  if (error) return { data: null, error: mapError(error, 'Failed to cancel request.') };
  if (String(data?.action || '') !== 'cancelled') {
    return { data: null, error: { message: 'The database did not confirm that the request was cancelled.' } };
  }
  return { data, error: null };
}

async function listCommunityBloodRequests() {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    // Refreshing here makes expiration effective even without a background scheduler.
    await bloodBank().rpc('refresh_community_request_lifecycle');

    let requestsData = [];

    // First try query with patient foreign key join
    const { data, error } = await bloodBank()
      .from('blood_request')
      .select('*, patient(first_name, middle_name, last_name, hospital_name, address, blood_type_needed, contact_number), replacement_campaign(target_units, pledged_units, confirmed_units, status, confirmation_reference)')
      .order('request_date', { ascending: false })
      .limit(50);

    if (!error && Array.isArray(data)) {
      requestsData = data;
    } else {
      // Fallback query without relationship join
      const fallback = await bloodBank()
        .from('blood_request')
        .select('*')
        .order('request_date', { ascending: false })
        .limit(50);
      if (!fallback.error && Array.isArray(fallback.data)) {
        requestsData = fallback.data;
      }
    }

    const normalized = requestsData
      .filter((row) => !String(row.note || row.notes || row.description || '').includes('[DELETED]'))
      .map((row, idx) => {
      const patient = row.patient || {};
      const rawStatus = String(row.status || '').trim().toLowerCase();
      let normalizedStatus = rawStatus || 'pending';
      if (['fulfilled', 'complete', 'completed', 'done'].includes(rawStatus)) {
        normalizedStatus = 'fulfilled';
      } else if (['processing', 'in_progress', 'in progress', 'ongoing'].includes(rawStatus)) {
        normalizedStatus = 'processing';
      } else if (['approved'].includes(rawStatus)) {
        normalizedStatus = 'approved';
      } else if (['needs_clarification', 'needs clarification'].includes(rawStatus)) {
        normalizedStatus = 'needs_clarification';
      } else if (['cancelled', 'canceled'].includes(rawStatus)) {
        normalizedStatus = 'cancelled';
      } else if (['rejected', 'declined'].includes(rawStatus)) {
        normalizedStatus = 'rejected';
      } else {
        normalizedStatus = 'pending';
      }

      const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ') ||
        row.patient_name ||
        row.requester_name ||
        `Community Recipient #${row.patient_id || row.request_id || (idx + 1)}`;

      // Parse structured tags from note field
      const rawNoteStr = String(row.note || row.notes || row.description || '');
      const hospitalTagMatch = rawNoteStr.match(/\[Hospital:([^\]]+)\]/);
      const parsedHospital = hospitalTagMatch ? hospitalTagMatch[1].trim() : null;
      const timeTagMatch = rawNoteStr.match(/\[NeededTime:([^\]]+)\]/);
      const parsedNeededTime = timeTagMatch ? timeTagMatch[1].trim() : (row.needed_time || row.needed_date || null);
      const cleanNote = rawNoteStr
        .replace(/\[Community Crowdsourced\]/g, '')
        .replace(/\[Hospital:[^\]]+\]/g, '')
        .replace(/\[NeededTime:[^\]]+\]/g, '')
        .trim() || 'Blood transfusion support requested for hospitalized patient.';

      const hospital = parsedHospital || row.hospital_name || patient.hospital_name || patient.address || 'Metro Health Center';
      const urgency = String(row.urgency_level || row.urgency || 'normal').toLowerCase();
      const rawDate = row.request_date || row.created_at || new Date().toISOString();
      const communityStatus = normalizeCommunityRequestStatus(row);

      return {
        id: row.request_id || row.id || idx + 1,
        patient_id: row.patient_id || null,
        requester_name: patientName,
        patient_phone: patient.contact_number || row.contact_number || null,
        blood_type: normalizeBloodType(row.blood_type_needed || row.blood_type || 'O+'),
        units_needed: Number(row.quantity || row.units_needed || 1),
        urgency: urgency,
        status: communityStatus,
        community_status: communityStatus,
        operational_status: normalizedStatus,
        status_raw: row.status || 'pending',
        expires_at: row.expires_at || null,
        created_at: rawDate,
        needed_time: parsedNeededTime,
        hospital: hospital,
        donation_point: hospital,
        notes: cleanNote,
        admin_note: row.admin_note || row.admin_message || row.admin_comment || '',
        request_type: row.request_type || 'unsure',
        verification_status: row.verification_status || 'pending',
        hospital_reference: row.hospital_reference || '',
        recipient_received_at: row.recipient_received_at || null,
        replacement_campaign: Array.isArray(row.replacement_campaign) ? row.replacement_campaign[0] : (row.replacement_campaign || null)
      };
    });

    return { data: normalized, error: null };
  } catch (err) {
    console.warn('Community requests fetch error:', err);
    return { data: [], error: err };
  }
}

async function createDonorPledge(payload) {
  if (!SUPABASE_CONFIGURED) return configError();

  const requestId = Number(payload?.request_id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return { data: null, error: { message: 'A valid blood request is required.' } };
  }

  const { data, error } = await bloodBank().rpc('pledge_to_blood_request', {
    p_request_id: requestId,
    p_units: Math.max(1, Number(payload?.units_pledged) || 1),
    p_pass_reference: String(payload?.pass_reference || '').trim() || null,
    p_preferred_date: payload?.preferred_date || null,
    p_preferred_time: String(payload?.preferred_time || '').trim() || null,
    p_donor_phone: String(payload?.donor_phone || '').trim() || null,
    p_notes: String(payload?.notes || '').trim() || null,
    p_support_preferences: Array.isArray(payload?.support_preferences) ? payload.support_preferences : []
  });

  if (error) {
    const missingMigration = isMissingMultiRoleRpc(error);
    return {
      data: null,
      error: {
        message: missingMigration
          ? 'Database update required: apply migration 202609110001_community_request_lifecycle.sql.'
          : (error.message || 'Unable to record your donor response.')
      }
    };
  }

  return { data, error: null };
}

async function getMyRequestSupportPreferences(requestId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) return { data: [], error: { message: 'A valid blood request is required.' } };

  const { data, error } = await bloodBank().rpc('get_my_request_support_preferences', {
    p_request_id: id
  });
  return { data: data || [], error: error ? mapError(error, 'Unable to load donor support preferences.') : null };
}

async function completeMyBloodRequest(requestId) {
  if (!SUPABASE_CONFIGURED) return configError();

  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) {
    return { data: null, error: { message: 'A valid blood request is required.' } };
  }

  const { data, error } = await bloodBank().rpc('complete_my_blood_request', {
    p_request_id: id
  });

  if (error) {
    const missingMigration = isMissingMultiRoleRpc(error);
    return {
      data: null,
      error: {
        message: missingMigration
          ? 'Database update required: apply migration 202609110001_community_request_lifecycle.sql.'
          : (error.message || 'Unable to complete this request.')
      }
    };
  }

  return { data, error: null };
}

async function markMyRequestPledgeUnsuccessful(requestId, pledgeId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const request = Number(requestId);
  const pledge = Number(pledgeId);
  if (!Number.isInteger(request) || request <= 0 || !Number.isInteger(pledge) || pledge <= 0) {
    return { data: null, error: { message: 'A valid request and pledge are required.' } };
  }

  const { data, error } = await bloodBank().rpc('mark_my_request_pledge_unsuccessful', {
    p_request_id: request,
    p_pledge_id: pledge
  });
  return {
    data,
    error: error ? mapError(error, 'Unable to update this donor pledge.') : null
  };
}

async function createBloodRequest(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {
    return { data: null, error: { message: 'Not authenticated' } };
  }

  const patientResult = await resolveOrCreatePatientId(user, {
    firstName: payload.first_name,
    middleName: payload.middle_name,
    lastName: payload.last_name,
    phone: payload.contact_number,
    address: payload.address,
    bloodType: payload.blood_type
  });

  if (patientResult.error) {
    return { data: null, error: patientResult.error };
  }

  const meta = user.user_metadata || {};
  const metaPatientId = Number(meta.patient_id);
  const linkedPatientId = Number(patientResult.patientId || patientResult.profile?.patient_id);
  const effectivePatientId = Number.isInteger(linkedPatientId) && linkedPatientId > 0
    ? linkedPatientId
    : (Number.isInteger(metaPatientId) && metaPatientId > 0 ? metaPatientId : null);

  if (!effectivePatientId) {
    return {
      data: null,
      error: {
        message:
          'Patient linkage is blocked by database RLS policies. Ask the admin to run supabase-patient-request-rls-fix.sql in Supabase SQL Editor, then try again.'
      }
    };
  }

  const requestType = ['replacement', 'emergency_donor'].includes(payload.request_type)
    ? payload.request_type
    : 'emergency_donor';
  const isReplacementRequest = requestType === 'replacement';
  const requestedBloodType = normalizeBloodType(
    isReplacementRequest
      ? (patientResult.profile.blood_type_needed || patientResult.profile.blood_type || user.user_metadata?.blood_type || 'O+')
      : payload.blood_type
  );
  if (!requestedBloodType) {
    return {
      data: null,
      error: { message: isReplacementRequest ? 'Your recipient profile needs a valid blood type record.' : 'Blood type is required for emergency donor matching.' }
    };
  }
  if (!isValidBloodType(requestedBloodType)) {
    return {
      data: null,
      error: { message: 'Please select a valid blood type.' }
    };
  }

  const supportingDocument = payload.supporting_document;
  const documentValidation = validateRequestSupportingDocument(supportingDocument);
  if (!documentValidation.ok) {
    return { data: null, error: { message: documentValidation.message } };
  }

  // Blood donation coordinators do not own or dispatch a treating hospital's inventory.
  // The request remains unallocated while the coordinator verifies and mobilizes donors.
  const inventoryId = null;
  const isCrowdsourced = true;

  const rawNote = String(payload.notes || payload.note || payload.description || '').trim();
  const hospitalName = String(payload.hospital || payload.donation_point || '').trim();
  const neededTimeStr = String(payload.needed_time || payload.needed_date || payload.time_needed || payload.schedule_date || '').trim();
  const hospitalTag = hospitalName ? `[Hospital:${hospitalName}]` : '';
  const timeTag = neededTimeStr ? `[NeededTime:${neededTimeStr}]` : '';
  const crowdsourcedTag = isCrowdsourced ? '[Community Crowdsourced]' : '';
  const baseNote = rawNote || (isCrowdsourced ? 'Sourced on-demand via community donor mobilization.' : null);
  const requestNote = [crowdsourcedTag, hospitalTag, timeTag, baseNote].filter(Boolean).join(' ') || null;

  const requestPayload = {
    patient_id: effectivePatientId,
    blood_type_needed: requestedBloodType,
    quantity: Number(payload.quantity || payload.units_needed) || 1,
    urgency_level: isReplacementRequest ? 'normal' : (payload.urgency_level || payload.urgency || 'normal'),
    status: payload.status || 'pending',
    note: requestNote,
    request_type: requestType,
    verification_status: 'pending',
    hospital_reference: String(payload.hospital_reference || '').trim() || null
  };

  if (inventoryId && Number.isInteger(inventoryId) && inventoryId > 0) {
    requestPayload.inventory_id = inventoryId;
  }

  let { data, error } = await bloodBank()
    .from('blood_request')
    .insert(requestPayload)
    .select('*')
    .single();

  if (error && isStackDepthError(error)) {
    return {
      data: null,
      error: {
        message:
          'Database RLS recursion is blocking request submission. Ask the admin to run supabase-patient-request-rls-fix.sql, then retry.'
      }
    };
  }

  if (!error && data?.request_id) {
    const supportResult = await saveRequestVerificationSupport(
      data.request_id,
      payload.facility_contact,
      documentValidation.file
    );
    if (supportResult.error) {
      return { data, error: null, warning: supportResult.error.message };
    }
    if (supportResult.data) data.verification_support = supportResult.data;
  }

  return { data, error };
}

async function recordReplacementDonation(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { data, error } = await bloodBank().rpc('record_replacement_donation', {
    p_request_id: Number(payload.request_id),
    p_units: Number(payload.units),
    p_donation_date: payload.donation_date,
    p_receiving_facility: String(payload.receiving_facility || '').trim(),
    p_confirmation_reference: String(payload.confirmation_reference || '').trim(),
    p_donor_source: payload.donor_source,
    p_donor_id: payload.donor_source === 'app' ? Number(payload.donor_id) : null,
    p_note: String(payload.note || '').trim() || null
  });
  return error ? { data: null, error: mapError(error, 'Failed to record replacement donation.') } : { data, error: null };
}

async function listReplacementDonations(requestId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { data, error } = await bloodBank().rpc('list_replacement_donations', { p_request_id: Number(requestId) });
  return error ? { data: null, error: mapError(error, 'Failed to load replacement confirmations.') } : { data: data || [], error: null };
}

async function updateMyPatientProfile(payload) {
  if (!SUPABASE_CONFIGURED) return configError();

  try {

    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const patientResult = await ensurePatient(user, {
      firstName: payload.first_name,
      middleName: payload.middle_name,
      lastName: payload.last_name,
      phone: payload.phone,
      address: payload.address,
      bloodType: payload.blood_type
    });

    if (patientResult.error) {
      return { data: null, error: patientResult.error };
    }

    const updates = {
      first_name: String(payload.first_name || '').trim(),
      middle_name: String(payload.middle_name || '').trim() || null,
      last_name: String(payload.last_name || '').trim(),
      blood_type_needed: normalizeBloodType(payload.blood_type),
      contact_number: String(payload.phone || '').trim() || null,
      address: String(payload.address || '').trim() || null
    };

    if (!isValidBloodType(updates.blood_type_needed)) {
      return { data: null, error: { message: 'Please select a valid blood type.' } };
    }

    const normalizedGender = String(payload.gender || '').trim() || null;
    const meta = user.user_metadata || {};
    const metadataPatch = {
      first_name: updates.first_name,
      middle_name: updates.middle_name,
      last_name: updates.last_name,
      blood_type: updates.blood_type_needed,
      phone: updates.contact_number,
      address: updates.address,
      gender: normalizedGender
    };

    if (!patientResult.profile?.patient_id) {
      await supabaseClient.auth.updateUser({
        data: {
          ...meta,
          ...metadataPatch
        }
      });

      const updatedUser = {
        ...user,
        user_metadata: {
          ...meta,
          ...metadataPatch,
          roles: normalizeAccountRoles([...normalizeAccountRoles(meta.roles), 'patient'])
        }
      };
      const normalized = normalizePatientProfile(
        updatedUser,
        buildFallbackPatientProfile(updatedUser, {
          firstName: updates.first_name,
          middleName: updates.middle_name,
          lastName: updates.last_name,
          phone: updates.contact_number,
          address: updates.address,
          bloodType: updates.blood_type_needed
        })
      );

      return {
        data: {
          profile: {
            ...normalized,
            role: 'patient',
            roles: normalizeAccountRoles([...normalizeAccountRoles(meta.roles), 'patient']),
            has_patient_profile: false,
            email: user.email
          }
        },
        error: null
      };
    }

    const { data: updatedPatient, error: updateError } = await bloodBank()
      .from('patient')
      .update(updates)
      .eq('patient_id', patientResult.profile.patient_id)
      .select('*')
      .single();

    if (updateError) {
      return { data: null, error: mapError(updateError, 'Failed to update patient profile') };
    }

    await supabaseClient.auth.updateUser({
      data: {
        ...meta,
        ...metadataPatch
      }
    });

    const updatedUser = {
      ...user,
      user_metadata: {
        ...meta,
        ...metadataPatch,
        roles: normalizeAccountRoles([...normalizeAccountRoles(meta.roles), 'patient'])
      }
    };
    const contextResult = await getLinkedAccountProfiles(updatedUser);
    const context = contextResult.error
      ? { patient: updatedPatient, donor: null, roles: ['patient'] }
      : { ...contextResult.data, patient: updatedPatient };
    const unifiedProfile = buildUnifiedAccountProfile(updatedUser, context);

    return {
      data: {
        profile: unifiedProfile
      },
      error: null
    };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err?.message || 'Network error while updating profile.'
      }
    };
  }
}

async function getAdminOverviewStats() {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const endpoint = `${SUPABASE_FUNCTIONS_BASE_URL}/overview-stats`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: {
          message:
            json.error ||
            json.message ||
            `Failed to load admin overview stats (HTTP ${res.status}).`
        }
      };
    }

    return { data: json.data || null, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while loading admin overview stats.' } };
  }
}

async function getOverviewInventoryByBloodType() {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const { data, error } = await bloodBank()
      .from('blood_inventory')
      .select('blood_type, units_available');

    if (error) {
      return { data: null, error: mapError(error, 'Failed to load overview inventory') };
    }

    const totalsByType = (data || []).reduce((acc, row) => {
      const type = normalizeBloodType(row.blood_type) || 'Unknown';
      const units = Number(row.units_available);
      acc[type] = (acc[type] || 0) + (Number.isFinite(units) ? units : 0);
      return acc;
    }, {});

    const ordered = BLOOD_TYPE_ORDER
      .filter(type => Object.prototype.hasOwnProperty.call(totalsByType, type))
      .map(type => ({ blood_type: type, units_available: totalsByType[type] }));

    const unordered = Object.keys(totalsByType)
      .filter(type => !BLOOD_TYPE_ORDER.includes(type))
      .sort()
      .map(type => ({ blood_type: type, units_available: totalsByType[type] }));

    return { data: [...ordered, ...unordered], error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while loading overview inventory.' } };
  }
}

async function getInventoryDashboardData() {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const { data, error } = await bloodBank()
      .from('blood_inventory')
      .select('inventory_id, donor_id, blood_type, units_available, date_stock, status, last_updated')
      .order('last_updated', { ascending: false });

    if (error) {
      return { data: null, error: mapError(error, 'Failed to load inventory dashboard data.') };
    }

    const totalsByType = (data || []).reduce((acc, row) => {
      const type = normalizeBloodType(row.blood_type) || 'Unknown';
      const units = Number(row.units_available);
      const value = Number.isFinite(units) ? units : 0;

      if (!acc[type]) {
        acc[type] = {
          blood_type: type,
          units_available: 0,
          records_count: 0,
          last_updated: row.last_updated || row.date_stock || null,
          date_stock: row.date_stock || null
        };
      }

      acc[type].units_available += value;
      acc[type].records_count += 1;

      const existingUpdated = acc[type].last_updated ? new Date(acc[type].last_updated).getTime() : 0;
      const rowUpdated = row.last_updated ? new Date(row.last_updated).getTime() : 0;
      if (rowUpdated > existingUpdated) {
        acc[type].last_updated = row.last_updated;
        acc[type].date_stock = row.date_stock;
      }

      return acc;
    }, {});

    const rows = Object.values(totalsByType);
    const ordered = BLOOD_TYPE_ORDER
      .map((type) => rows.find((row) => row.blood_type === type))
      .filter(Boolean);
    const unordered = rows
      .filter((row) => !BLOOD_TYPE_ORDER.includes(row.blood_type))
      .sort((a, b) => String(a.blood_type).localeCompare(String(b.blood_type)));

    const byType = [...ordered, ...unordered];
    const totalUnits = byType.reduce((sum, row) => sum + (Number(row.units_available) || 0), 0);

    const counts = byType.reduce(
      (acc, row) => {
        const units = Number(row.units_available) || 0;
        if (units <= 5) acc.critical += 1;
        else if (units <= 15) acc.low += 1;
        else acc.adequate += 1;
        return acc;
      },
      { adequate: 0, low: 0, critical: 0 }
    );

    return {
      data: {
        total_units: totalUnits,
        adequate_count: counts.adequate,
        low_count: counts.low,
        critical_count: counts.critical,
        by_type: byType
      },
      error: null
    };
  } catch (err) {
    return { data: null, error: { message: 'Network error while loading inventory dashboard.' } };
  }
}

function subscribeToInventoryChanges(onChange) {
  if (!SUPABASE_CONFIGURED) {
    return {
      unsubscribe() { }
    };
  }

  const channelName = `inventory-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabaseClient
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'blood_bank',
        table: 'blood_inventory'
      },
      () => {
        if (typeof onChange === 'function') {
          onChange();
        }
      }
    )
    .subscribe();

  return {
    unsubscribe() {
      try {
        supabaseClient.removeChannel(channel);
      } catch (_) {
        // Ignore channel cleanup errors during page unload.
      }
    }
  };
}

function subscribeToRequestChanges(patientId, onChange) {
  if (!SUPABASE_CONFIGURED) {
    return {
      unsubscribe() { }
    };
  }

  const chanName = `requests-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabaseClient
    .channel(chanName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'blood_bank',
        table: 'blood_request',
        filter: `patient_id=eq.${Number(patientId)}`
      },
      () => {
        if (typeof onChange === 'function') onChange();
      }
    )
    .subscribe();

  return {
    unsubscribe() {
      try {
        supabaseClient.removeChannel(channel);
      } catch (_) {
        // ignore
      }
    }
  };
}

function subscribeToPatientDashboard(options, onChange) {
  if (!SUPABASE_CONFIGURED) {
    return { unsubscribe() { } };
  }

  const patientId = typeof options === 'object' ? options?.patientId : options;
  const userId = typeof options === 'object' ? options?.userId : null;
  const cb = typeof onChange === 'function' ? onChange : (typeof options === 'function' ? options : null);
  if (!cb) return { unsubscribe() { } };

  const chanName = `patient-dash-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let channel = supabaseClient.channel(chanName);

  // 1. Blood requests (all community requests and patient's requests)
  channel = channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'blood_bank',
      table: 'blood_request'
    },
    (payload) => {
      cb({ type: 'blood_request', payload });
    }
  );

  // 2. Donor pledges (when donor pledges to a request or donation status changes)
  channel = channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'blood_bank',
      table: 'donor_pledge'
    },
    (payload) => {
      cb({ type: 'donor_pledge', payload });
    }
  );

  // 3. Blood drives
  channel = channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'blood_bank',
      table: 'blood_drive'
    },
    (payload) => {
      cb({ type: 'blood_drive', payload });
    }
  );

  // 4. Blood inventory
  channel = channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'blood_bank',
      table: 'blood_inventory'
    },
    (payload) => {
      cb({ type: 'blood_inventory', payload });
    }
  );

  // 5. Notifications for this user/patient if available
  if (userId) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'blood_bank',
        table: 'notifications'
      },
      (payload) => {
        cb({ type: 'notifications', payload });
      }
    );
  }

  channel.subscribe();

  return {
    unsubscribe() {
      try {
        supabaseClient.removeChannel(channel);
      } catch (_) { }
    }
  };
}

async function listMyNotifications(limit = 20) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return { data: null, error: { message: 'Not authenticated' } };

  const { data, error } = await bloodBank()
    .from('notifications')
    .select('notification_id, request_id, drive_id, notification_type, title, message, read_at, created_at')
    .eq('recipient_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 20, 50)));

  return error
    ? { data: null, error: mapError(error, 'Failed to load notifications.') }
    : { data: data || [], error: null };
}

async function listBloodDrives() {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { data, error } = await bloodBank()
      .from('blood_drive')
      .select('drive_id, drive_name, drive_date, start_time, end_time, venue, address, target_units, registered_donors, focus_type, status, notes, created_at, updated_at')
      .order('drive_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false });

    return error
      ? { data: null, error: mapError(error, 'Failed to load blood drives.') }
      : {
        data: (data || []).map((drive) => ({ ...drive, date: drive.drive_date })),
        error: null
      };
  } catch (_) {
    return { data: null, error: { message: 'Network error while loading blood drives.' } };
  }
}

async function scheduleBloodDrive(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  const values = payload || {};
  try {
    const { data, error } = await bloodBank().rpc('schedule_blood_drive', {
      p_drive_name: values.drive_name,
      p_drive_date: values.date || values.drive_date,
      p_start_time: values.start_time || null,
      p_end_time: values.end_time || null,
      p_venue: values.venue,
      p_address: values.address || null,
      p_target_units: Number(values.target_units),
      p_focus_type: values.focus_type || 'All',
      p_notes: values.notes || null
    });
    return error
      ? { data: null, error: mapError(error, 'Failed to schedule the blood drive.') }
      : { data, error: null };
  } catch (_) {
    return { data: null, error: { message: 'Network error while scheduling the blood drive.' } };
  }
}

async function updateBloodDrive(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  const values = payload || {};
  const driveId = Number(values.drive_id || values.id);
  if (!Number.isInteger(driveId) || driveId <= 0) {
    return { data: null, error: { message: 'Invalid blood drive ID.' } };
  }

  try {
    const { data, error } = await bloodBank().rpc('update_blood_drive', {
      p_drive_id: driveId,
      p_drive_name: values.drive_name,
      p_drive_date: values.date || values.drive_date,
      p_start_time: values.start_time || null,
      p_end_time: values.end_time || null,
      p_venue: values.venue,
      p_address: values.address || null,
      p_target_units: Number(values.target_units),
      p_focus_type: values.focus_type || 'All',
      p_status: values.status || 'scheduled',
      p_notes: values.notes || null
    });

    if (!error) {
      return {
        data: data && typeof data === 'object' ? { ...data, date: data.drive_date } : data,
        error: null
      };
    }

    // Fallback to direct update if RPC is not yet created in existing instance
    const { data: directData, error: directErr } = await bloodBank()
      .from('blood_drive')
      .update({
        drive_name: String(values.drive_name || '').trim(),
        drive_date: values.date || values.drive_date,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        venue: String(values.venue || '').trim(),
        address: values.address ? String(values.address).trim() : null,
        target_units: Number(values.target_units),
        focus_type: values.focus_type || 'All',
        status: values.status || 'scheduled',
        notes: values.notes ? String(values.notes).trim() : null,
        updated_at: new Date().toISOString()
      })
      .eq('drive_id', driveId)
      .select('*')
      .maybeSingle();

    return directErr
      ? { data: null, error: mapError(error || directErr, 'Failed to update the blood drive.') }
      : {
        data: directData ? { ...directData, date: directData.drive_date } : directData,
        error: null
      };
  } catch (_) {
    return { data: null, error: { message: 'Network error while updating the blood drive.' } };
  }
}

async function deleteBloodDrive(driveId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const id = Number(driveId);
  if (!Number.isInteger(id) || id <= 0) {
    return { data: null, error: { message: 'Invalid blood drive ID.' } };
  }

  try {
    const { data, error } = await bloodBank().rpc('delete_blood_drive', { p_drive_id: id });
    if (!error) return { data, error: null };

    // Fallback to direct delete if RPC is not yet created in existing instance
    const { error: directErr } = await bloodBank()
      .from('blood_drive')
      .delete()
      .eq('drive_id', id);

    return directErr
      ? { data: null, error: mapError(error || directErr, 'Failed to delete the blood drive.') }
      : { data: { success: true, drive_id: id }, error: null };
  } catch (_) {
    return { data: null, error: { message: 'Network error while deleting the blood drive.' } };
  }
}

async function listMyBloodDriveRegistrations() {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { data, error } = await bloodBank()
      .from('blood_drive_registration')
      .select('drive_id, status, registered_at')
      .eq('status', 'registered');
    return error
      ? { data: null, error: mapError(error, 'Failed to load drive registrations.') }
      : { data: data || [], error: null };
  } catch (_) {
    return { data: null, error: { message: 'Network error while loading drive registrations.' } };
  }
}

async function registerForBloodDrive(driveId) {
  if (!SUPABASE_CONFIGURED) return configError();
  const id = Number(driveId);
  if (!Number.isInteger(id) || id <= 0) {
    return { data: null, error: { message: 'Invalid blood drive.' } };
  }
  try {
    const { data, error } = await bloodBank().rpc('register_for_blood_drive', { p_drive_id: id });
    return error
      ? { data: null, error: mapError(error, 'Failed to register for the blood drive.') }
      : { data, error: null };
  } catch (_) {
    return { data: null, error: { message: 'Network error while registering for the blood drive.' } };
  }
}

async function markMyNotificationRead(notificationId) {
  return setMyNotificationReadState(notificationId, true);
}

async function setMyNotificationReadState(notificationId, isRead) {
  if (!SUPABASE_CONFIGURED) return configError();
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id <= 0) return { data: null, error: { message: 'Invalid notification.' } };
  const { data, error } = await bloodBank()
    .from('notifications')
    .update({ read_at: isRead ? new Date().toISOString() : null })
    .eq('notification_id', id)
    .select('notification_id, read_at')
    .maybeSingle();
  return error
    ? { data: null, error: mapError(error, 'Failed to update notification.') }
    : { data, error: null };
}
function subscribeToNotifications(userId, onChange) {
  if (!SUPABASE_CONFIGURED || !userId) {
    return { unsubscribe() { } };
  }

  const chanName = `notif-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabaseClient
    .channel(chanName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'blood_bank',
        table: 'notifications'
      },
      (payload) => {
        if (typeof onChange === 'function') onChange(payload);
      }
    )
    .subscribe();

  return {
    unsubscribe() {
      try {
        supabaseClient.removeChannel(channel);
      } catch (_) { }
    }
  };
}

function subscribeToDonorPledges(donorId, onChange) {
  if (!SUPABASE_CONFIGURED) {
    return { unsubscribe() { } };
  }

  const chanName = `pledge-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filter = donorId ? `donor_id=eq.${Number(donorId)}` : undefined;
  const channel = supabaseClient
    .channel(chanName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'blood_bank',
        table: 'donor_pledge',
        ...(filter ? { filter } : {})
      },
      (payload) => {
        if (typeof onChange === 'function') onChange(payload);
      }
    )
    .subscribe();

  return {
    unsubscribe() {
      try {
        supabaseClient.removeChannel(channel);
      } catch (_) { }
    }
  };
}

function attachPageRefreshListeners(options = {}) {
  const onRefresh = typeof options === 'function' ? options : options?.onRefresh;
  if (typeof onRefresh !== 'function') return () => { };

  const debounceMs = typeof options?.debounceMs === 'number' ? options.debounceMs : 2500;
  let lastRefreshTime = Date.now();
  let refreshTimer = null;
  let lastViewportWidth = window.innerWidth;
  let resizeTimer = null;

  function triggerRefresh(reason) {
    const now = Date.now();
    if (now - lastRefreshTime < debounceMs) {
      if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          lastRefreshTime = Date.now();
          onRefresh({ reason: 'debounced', timestamp: lastRefreshTime });
        }, debounceMs - (now - lastRefreshTime));
      }
      return;
    }
    lastRefreshTime = now;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    onRefresh({ reason: reason || 'landing', timestamp: lastRefreshTime });
  }

  function handlePageShow(event) {
    triggerRefresh(event?.persisted ? 'bfcache_landing' : 'pageshow');
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      triggerRefresh('tab_focus');
    }
  }

  function handleWindowFocus() {
    triggerRefresh('window_focus');
  }

  function handleOnline() {
    triggerRefresh('network_online');
  }

  function handleCustomRefresh() {
    triggerRefresh('pull_to_refresh');
  }

  // Fires when switching between DevTools simulator and desktop mode (viewport width changes)
  function handleResize() {
    const newWidth = window.innerWidth;
    if (newWidth === lastViewportWidth) return; // height-only change (mobile keyboard), ignore
    const diff = Math.abs(newWidth - lastViewportWidth);
    lastViewportWidth = newWidth;
    if (diff < 120) return; // ignore minor drag-resizes, only trigger on simulator <-> desktop toggle
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      triggerRefresh('viewport_resize');
    }, 500);
  }

  window.addEventListener('pageshow', handlePageShow);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('online', handleOnline);
  window.addEventListener('veindrop:refresh', handleCustomRefresh);
  window.addEventListener('resize', handleResize);

  return function detach() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('pageshow', handlePageShow);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('veindrop:refresh', handleCustomRefresh);
    window.removeEventListener('resize', handleResize);
  };
}

async function updateInventoryStock(payload) {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const bloodType = normalizeBloodType(payload?.blood_type);
    const units = Number(payload?.units);

    if (!isValidBloodType(bloodType)) {
      return { data: null, error: { message: 'Invalid blood type.' } };
    }
    if (!Number.isFinite(units) || units <= 0) {
      return { data: null, error: { message: 'Units must be a positive number.' } };
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    // Find the most recently updated record for this blood type to add onto
    const { data: existingRows, error: existingError } = await bloodBank()
      .from('blood_inventory')
      .select('inventory_id, donor_id, blood_type, units_available, status, date_stock, last_updated')
      .order('last_updated', { ascending: false })
      .limit(50);

    if (existingError) {
      return { data: null, error: mapError(existingError, 'Failed to load existing inventory row.') };
    }

    const existing = Array.isArray(existingRows)
      ? existingRows.find((row) => normalizeBloodType(row.blood_type) === bloodType)
      : null;
    let updated;

    if (existing) {
      // Add to the existing record
      const nextUnits = (Number(existing.units_available) || 0) + units;
      const { data: updatedRow, error: updateErr } = await bloodBank()
        .from('blood_inventory')
        .update({
          blood_type: bloodType,
          units_available: nextUnits,
          status: 'available',
          date_stock: todayStr
        })
        .eq('inventory_id', existing.inventory_id)
        .select('inventory_id, donor_id, blood_type, units_available, status, date_stock, last_updated')
        .single();

      if (updateErr) {
        return { data: null, error: mapError(updateErr, 'Failed to add stock to inventory.') };
      }
      updated = updatedRow;
    } else {
      // No record yet - create one, linking to a donor of this blood type
      const requestedDonorId = Number(payload?.donor_id);
      let donorId = Number.isInteger(requestedDonorId) && requestedDonorId > 0 ? requestedDonorId : null;

      if (!donorId) {
        const { data: donorByType, error: donorTypeErr } = await bloodBank()
          .from('donor')
          .select('donor_id, blood_type')
          .order('created_at', { ascending: false })
          .limit(50);

        if (donorTypeErr) {
          return { data: null, error: mapError(donorTypeErr, 'Failed to find a donor for this blood type.') };
        }

        const matchingDonor = Array.isArray(donorByType)
          ? donorByType.find((row) => normalizeBloodType(row.blood_type) === bloodType)
          : null;
        donorId = matchingDonor ? Number(matchingDonor.donor_id) : null;
      }

      if (!donorId) {
        return {
          data: null,
          error: { message: 'No donor found for this blood type. Add a donor first, then add stock.' }
        };
      }

      const { data: insertedRow, error: insertErr } = await bloodBank()
        .from('blood_inventory')
        .insert({
          donor_id: donorId,
          blood_type: bloodType,
          units_available: units,
          date_stock: todayStr,
          status: 'available'
        })
        .select('inventory_id, donor_id, blood_type, units_available, status, date_stock, last_updated')
        .single();

      if (insertErr) {
        return { data: null, error: mapError(insertErr, 'Failed to create inventory record.') };
      }
      updated = insertedRow;
    }

    return { data: updated, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while adding inventory stock.' } };
  }
}

async function getOverviewRecentRequests(limit = 100) {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    let requestsData = [];

    // 1. Direct PostgREST query with patient relation join
    const { data, error } = await bloodBank()
      .from('blood_request')
      .select('*, patient(auth_user_id, first_name, middle_name, last_name, email, hospital_name, contact_number, address), replacement_campaign(target_units, pledged_units, confirmed_units, status, confirmation_reference)')
      .order('request_date', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length > 0) {
      requestsData = data;
    } else {
      // 2. Direct fallback without foreign key join in case schema join errors
      const fallback = await bloodBank()
        .from('blood_request')
        .select('*')
        .order('request_date', { ascending: false })
        .limit(limit);

      if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length > 0) {
        requestsData = fallback.data;
      } else {
        // 3. Try Edge Function if PostgREST was blocked by RLS
        const { data: { session } } = await supabaseClient.auth.getSession();
        const accessToken = session?.access_token;
        if (accessToken) {
          const endpoint = `${SUPABASE_FUNCTIONS_BASE_URL}/list-requests?limit=${limit}`;
          const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`
            }
          }).catch(() => null);

          if (res && res.ok) {
            const json = await res.json().catch(() => ({}));
            if (Array.isArray(json.data) && json.data.length > 0) {
              requestsData = json.data;
            }
          }
        }
      }
    }

    const normalized = (requestsData || [])
      .filter((row) => !String(row.note || row.notes || '').includes('[DELETED]'))
      .map((row) => {
        const rawNote = String(row.note || row.notes || row.description || '');
        const hospMatch = rawNote.match(/\[Hospital:([^\]]+)\]/);
        const timeMatch = rawNote.match(/\[NeededTime:([^\]]+)\]/);
        const patient = Array.isArray(row.patient) ? row.patient[0] : (row.patient || {});
        return {
          ...row,
          patient,
          hospital_name: hospMatch ? hospMatch[1].trim() : (row.hospital_name || patient.hospital_name || patient.address || 'Hospital'),
          needed_time: timeMatch ? timeMatch[1].trim() : (row.needed_time || row.needed_date || '')
        };
      });

    const requestIds = normalized.map((request) => request.request_id || request.id);
    const [supportResult, pledgeResult] = await Promise.all([
      listRequestVerificationSupport(requestIds),
      listRequestPledges(requestIds)
    ]);
    const supportByRequest = new Map((supportResult.data || []).map((item) => [Number(item.request_id), item]));
    const pledgesByRequest = new Map();
    (pledgeResult.data || []).forEach((pledge) => {
      const key = Number(pledge.request_id);
      if (!pledgesByRequest.has(key)) pledgesByRequest.set(key, []);
      pledgesByRequest.get(key).push(pledge);
    });
    normalized.forEach((request) => {
      request.verification_support = supportByRequest.get(Number(request.request_id || request.id)) || null;
      request.pledges = pledgesByRequest.get(Number(request.request_id || request.id)) || [];
    });

    return { data: normalized, error: null };
  } catch (err) {
    return { data: [], error: { message: 'Network error while loading overview requests.' } };
  }
}

async function getOverviewRecentDonations(limit = 5) {
  if (!SUPABASE_CONFIGURED) return configError();

  try {
    const { data, error } = await bloodBank()
      .from('donation_record')
      .select('donation_id, blood_type, quantity, donation_date, donor:donor_id(first_name,middle_name,last_name,email), inventory:inventory_id(status)')
      .order('donation_date', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: null, error: mapError(error, 'Failed to load overview donations') };
    }

    return { data: data || [], error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while loading overview donations.' } };
  }
}

/* ============================================================
   DONOR LIFECYCLE HELPERS
   ============================================================ */

/**
 * Client-side check: has the donor passed the mandatory 56-day waiting period?
 * Returns { eligible: bool, daysRemaining: number }
 */
function isEligibleToCheckIn(donor) {
  if (!donor?.last_donation_date) {
    return { eligible: true, daysRemaining: 0 };
  }
  const lastDate = new Date(donor.last_donation_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
  const remaining = Math.max(0, 56 - diffDays);
  return { eligible: remaining === 0, daysRemaining: remaining };
}

/**
 * Returns the CSS badge class for a donor_status value.
 */
function getDonorLifecycleBadgeClass(status) {
  const map = {
    registered: 'registered',
    checked_in: 'checked-in',
    approved: 'approved',
    donated: 'donated',
    deferred: 'deferred',
    incomplete: 'incomplete'
  };
  return map[String(status || '').toLowerCase()] || 'registered';
}

/**
 * Returns a human-readable label for a donor_status value.
 */
function getDonorLifecycleLabel(status) {
  const map = {
    registered: 'Registered',
    checked_in: 'Checked-in',
    approved: 'Approved (Medical)',
    donated: 'Donated',
    deferred: 'Deferred',
    incomplete: 'Incomplete'
  };
  return map[String(status || '').toLowerCase()] || 'Registered';
}

/**
 * Check in a donor at the clinic.
 * Sets donor_status -> 'checked_in' and records check_in_date.
 * payload: { donor_id, notes? }
 * NOTE: Audit inserts (donor_status_log, donor_checkin) are best-effort
 *       and will not block the primary status update if RLS recursion occurs.
 */
async function checkInDonor(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { donor_id, notes } = payload;
    if (!donor_id) {
      return { data: null, error: { message: 'donor_id is required.' } };
    }

    // Primary update - the only call that must succeed
    const { data, error } = await bloodBank()
      .from('donor')
      .update({
        donor_status: 'checked_in',
        check_in_date: new Date().toISOString()
      })
      .eq('donor_id', donor_id)
      .select('*')
      .single();

    if (error) {
      // If RLS stack-depth issue on the donor table itself, there is nothing
      // we can do client-side - surface the message clearly.
      return { data: null, error: mapError(error, 'Failed to check in donor.') };
    }

    // Audit inserts - best-effort, silent on failure
    try {
      await bloodBank().from('donor_status_log').insert({
        donor_id,
        old_status: 'registered',
        new_status: 'checked_in',
        notes: notes || 'Checked in at clinic'
      });
    } catch (_) { /* audit failure is non-blocking */ }

    try {
      await bloodBank().from('donor_checkin').insert({
        donor_id,
        notes: notes || null
      });
    } catch (_) { /* audit failure is non-blocking */ }

    return { data: { ...data, id: data.donor_id }, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while checking in donor.' } };
  }
}

/**
 * Approve a donor after medical screening.
 */
async function approveDonorMedical(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { donor_id, notes } = payload;
    if (!donor_id) {
      return { data: null, error: { message: 'donor_id is required.' } };
    }

    const { data, error } = await bloodBank()
      .from('donor')
      .update({
        donor_status: 'approved'
      })
      .eq('donor_id', donor_id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: mapError(error, 'Failed to approve donor.') };
    }

    try {
      await bloodBank().from('donor_status_log').insert({
        donor_id,
        old_status: 'checked_in',
        new_status: 'approved',
        notes: notes || 'Medical screening completed and approved.'
      });
    } catch (_) { /* audit failure is non-blocking */ }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while approving donor.' } };
  }
}

/**
 * Mark a donor donation with status tracking (completed, failed, cancelled, pending).
 * payload: { donor_id, units, blood_type, status, notes, reason }
 */
async function markDonorDonated(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { donor_id, units = 1, blood_type, status = 'completed', notes = '', reason = '' } = payload;
    const donationBloodType = normalizeBloodType(blood_type);
    const donationStatus = String(status || 'completed').toLowerCase();
    const finalNotes = String(notes || reason || '').trim();

    if (!donor_id || !donationBloodType) {
      return { data: null, error: { message: 'donor_id and blood_type are required.' } };
    }
    if (!isValidBloodType(donationBloodType)) {
      return { data: null, error: { message: 'Invalid blood type.' } };
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch donor for eligibility check (best-effort)
    let existingDonor = null;
    try {
      const { data: fetched } = await bloodBank()
        .from('donor')
        .select('donor_id, donor_status, last_donation_date, blood_type')
        .eq('donor_id', donor_id)
        .single();
      existingDonor = fetched;
    } catch (_) { /* ignore - proceed */ }

    // 2. Client-side 56-day rule check only for completed donations
    if (donationStatus === 'completed' && existingDonor) {
      const eligibility = isEligibleToCheckIn(existingDonor);
      if (!eligibility.eligible) {
        return {
          data: null,
          error: { message: `Donor must wait ${eligibility.daysRemaining} more day(s) before donating again (56-day rule).` }
        };
      }
    }

    let updatedDonor = existingDonor;
    let inventoryRow = null;
    const nextDate = new Date(todayStr);
    nextDate.setDate(nextDate.getDate() + 56);

    if (donationStatus === 'completed') {
      // 3. Primary donor status update for completed donation
      const { data: donorData, error: updateErr } = await bloodBank()
        .from('donor')
        .update({
          donor_status: 'donated',
          last_donation_date: todayStr,
          availability_status: 'donated'
        })
        .eq('donor_id', donor_id)
        .select('*')
        .single();

      if (updateErr) {
        return { data: null, error: mapError(updateErr, 'Failed to update donor status.') };
      }
      updatedDonor = donorData;

      // 4. Create blood_inventory record
      const { data: invData, error: invErr } = await bloodBank()
        .from('blood_inventory')
        .insert({
          donor_id,
          blood_type: donationBloodType || normalizeBloodType(updatedDonor?.blood_type),
          units_available: Number(units) || 1,
          date_stock: todayStr,
          status: 'available'
        })
        .select('inventory_id')
        .single();

      if (invErr) {
        return { data: null, error: mapError(invErr, 'Donor status updated but failed to create inventory record.') };
      }
      inventoryRow = invData;
    } else if (donationStatus === 'failed') {
      // For failed donation, defer donor if clinical failure
      const { data: donorData } = await bloodBank()
        .from('donor')
        .update({
          donor_status: 'deferred',
          deferred_reason: finalNotes || 'Screening/donation issue'
        })
        .eq('donor_id', donor_id)
        .select('*')
        .single();
      if (donorData) updatedDonor = donorData;
    }

    // 5. Create donation_record row (with status & notes)
    try {
      const recordPayload = {
        donor_id,
        inventory_id: inventoryRow?.inventory_id || null,
        blood_type: donationBloodType || normalizeBloodType(updatedDonor?.blood_type),
        quantity: Number(units) || 1,
        donation_date: todayStr,
        status: donationStatus,
        notes: finalNotes || null
      };

      // Try inserting with status/notes
      const { error: insertErr } = await bloodBank()
        .from('donation_record')
        .insert(recordPayload);

      if (insertErr) {
        // Fallback for legacy schema without status/notes columns
        await bloodBank()
          .from('donation_record')
          .insert({
            donor_id,
            inventory_id: inventoryRow?.inventory_id || null,
            blood_type: donationBloodType || normalizeBloodType(updatedDonor?.blood_type),
            quantity: Number(units) || 1,
            donation_date: todayStr
          });
      }
    } catch (_) { /* non-blocking */ }

    // 6. Audit log (best-effort)
    try {
      await bloodBank().from('donor_status_log').insert({
        donor_id,
        old_status: existingDonor?.donor_status || 'checked_in',
        new_status: donationStatus === 'completed' ? 'donated' : (donationStatus === 'failed' ? 'deferred' : 'registered'),
        notes: `Donation ${donationStatus}. ${units} unit(s). ${finalNotes ? 'Reason/Notes: ' + finalNotes : ''}`
      });
    } catch (_) { /* non-blocking */ }

    return {
      data: {
        donor: updatedDonor ? { ...updatedDonor, id: updatedDonor.donor_id } : null,
        inventory_id: inventoryRow?.inventory_id || null,
        donation_date: todayStr,
        status: donationStatus,
        notes: finalNotes,
        next_eligible_date: donationStatus === 'completed' ? nextDate.toISOString().split('T')[0] : null
      },
      error: null
    };
  } catch (err) {
    return { data: null, error: { message: 'Network error while recording donation.' } };
  }
}

/**
 * Update donation record status and notes (Admin/Staff only)
 */
async function updateDonationRecordStatus(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  const { donation_id, status, notes = '', reason = '' } = payload || {};
  if (!donation_id || !status) {
    return { data: null, error: { message: 'donation_id and status are required.' } };
  }
  try {
    const finalNotes = notes || reason || null;
    const { data, error } = await bloodBank()
      .from('donation_record')
      .update({
        status: String(status).toLowerCase(),
        notes: finalNotes
      })
      .eq('donation_id', donation_id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: mapError(error, 'Failed to update donation record.') };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while updating donation record.' } };
  }
}

/**
 * Defer a donor (medically ineligible at this time).
 * Sets donor_status -> 'deferred' and stores the reason.
 * payload: { donor_id, reason }
 * NOTE: Preliminary SELECT and audit log are best-effort.
 */
async function deferDonor(payload) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { donor_id, reason } = payload;
    if (!donor_id) {
      return { data: null, error: { message: 'donor_id is required.' } };
    }

    // Fetch current status for the log (best-effort)
    let oldStatus = 'unknown';
    try {
      const { data: current } = await bloodBank()
        .from('donor')
        .select('donor_status')
        .eq('donor_id', donor_id)
        .single();
      if (current?.donor_status) oldStatus = current.donor_status;
    } catch (_) { /* non-blocking */ }

    // Primary update
    const { data, error } = await bloodBank()
      .from('donor')
      .update({
        donor_status: 'deferred',
        deferred_reason: reason || 'No reason provided',
        availability_status: 'deferred'
      })
      .eq('donor_id', donor_id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: mapError(error, 'Failed to defer donor.') };
    }

    // Audit log (best-effort)
    try {
      await bloodBank().from('donor_status_log').insert({
        donor_id,
        old_status: oldStatus,
        new_status: 'deferred',
        notes: reason || 'Deferred by admin'
      });
    } catch (_) { /* non-blocking */ }

    return { data: { ...data, id: data.donor_id }, error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while deferring donor.' } };
  }
}

/**
 * Fetch the status change history for a donor.
 * Returns rows from donor_status_log ordered by most recent first.
 */
async function getDonorLifecycleHistory(donor_id) {
  if (!SUPABASE_CONFIGURED) return configError();
  try {
    const { data, error } = await bloodBank()
      .from('donor_status_log')
      .select('*')
      .eq('donor_id', donor_id)
      .order('changed_at', { ascending: false })
      .limit(10);

    if (error) {
      return { data: null, error: mapError(error, 'Failed to load lifecycle history.') };
    }

    return { data: data || [], error: null };
  } catch (err) {
    return { data: null, error: { message: 'Network error while loading lifecycle history.' } };
  }
}
