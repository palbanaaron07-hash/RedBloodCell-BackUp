/**
 * BloodConnect - Donor Pledge Details & Medical Screening Instructions Logic
 */

let currentRequest = null;
let currentDonor = null;
let currentStep = 1;

function showUncheckedHealthCriteriaNotice() {
  const dialog = document.getElementById('healthCriteriaDialog');
  const cancelButton = document.getElementById('cancelHealthCriteria');
  if (!dialog || !cancelButton || typeof dialog.showModal !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      cancelButton.removeEventListener('click', cancelAction);
      dialog.removeEventListener('cancel', cancelEvent);
      dialog.removeEventListener('click', backdropAction);
      if (dialog.open) dialog.close();
      resolve();
    };
    const cancelAction = () => finish();
    const cancelEvent = (event) => {
      event.preventDefault();
      finish();
    };
    const backdropAction = (event) => {
      if (event.target === dialog) finish();
    };

    cancelButton.addEventListener('click', cancelAction);
    dialog.addEventListener('cancel', cancelEvent);
    dialog.addEventListener('click', backdropAction);
    dialog.showModal();
    cancelButton.focus();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initializePerkCheckboxes();
  await loadRequestAndDonorData();
  setDefaultDonationDate();
});

/**
 * Initialize visual toggle for perk checkboxes
 */
function initializePerkCheckboxes() {
  const cards = document.querySelectorAll('.perk-checkbox-card');
  cards.forEach(card => {
    const input = card.querySelector('.perk-input');
    if (!input) return;

    // Set initial state
    card.classList.toggle('checked', input.checked);

    input.addEventListener('change', () => {
      card.classList.toggle('checked', input.checked);
      updatePassPerksList();
    });
  });
}

/**
 * Load Blood Request Details & Donor Info from Session / Supabase
 */
async function loadRequestAndDonorData() {
  // 1. Try to read from sessionStorage
  try {
    const saved = sessionStorage.getItem('veindrop_pledge_request');
    if (saved) {
      currentRequest = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Could not read session request:', e);
  }

  // 2. Check URL search params
  const urlParams = new URLSearchParams(window.location.search);
  const reqId = urlParams.get('id') || urlParams.get('requestId');

  if (!currentRequest && reqId && typeof listCommunityBloodRequests === 'function') {
    try {
      const { data } = await listCommunityBloodRequests();
      if (Array.isArray(data)) {
        currentRequest = data.find(r => String(r.id) === String(reqId));
      }
    } catch (e) {
      console.warn('Could not fetch request by ID:', e);
    }
  }

  // 3. Fallback default if opened without parameters
  if (!currentRequest) {
    currentRequest = {
      id: reqId || 'REQ-2026-BH88',
      requester_name: 'Maria Santos (Community Recipient)',
      blood_type: 'O+',
      units_needed: 2,
      urgency: 'urgent',
      donation_point: 'Governor Celestino Gallares Memorial Medical Center (Tagbilaran City)',
      hospital: 'Gov. Celestino Gallares Memorial Medical Center',
      notes: 'Urgent whole blood transfusion needed for scheduled surgical treatment. Hospital coordinator available on site.',
      patient_phone: '0917-889-1234'
    };
  }

  // 4. Render request data in UI
  renderRequestDetails(currentRequest);

  // 5. Try to load logged in profile
  try {
    if (typeof getCurrentUser === 'function') {
      const { profile } = await getCurrentUser();
      if (profile) {
        currentDonor = profile.donor_profile || profile;
        prefillDonorForm(currentDonor);
      }
    }
  } catch (e) {
    console.warn('Could not fetch user profile:', e);
  }
}

/**
 * Render Request Details in UI
 */
function renderRequestDetails(req) {
  const isUrgent = String(req.urgency || '').toLowerCase() === 'urgent' || String(req.urgency || '').toLowerCase() === 'critical';
  
  // Hero elements
  const urgencyPill = document.getElementById('heroUrgencyPill');
  const urgencyText = document.getElementById('heroUrgencyText');
  const refCode = document.getElementById('heroRefCode');
  const bloodType = document.getElementById('heroBloodType');
  const unitsNeeded = document.getElementById('heroUnitsNeeded');
  const recipientName = document.getElementById('heroRecipientName');
  const hospital = document.getElementById('heroHospital');
  const reasonContent = document.getElementById('heroReasonContent');

  if (urgencyText) urgencyText.textContent = isUrgent ? 'Urgent Blood Request' : 'Standard Routine Request';
  if (refCode) refCode.textContent = `REF-#${req.id || '2026-BH'}`;
  if (bloodType) bloodType.textContent = req.blood_type || 'O+';
  
  const units = Number(req.units_needed || 1);
  if (unitsNeeded) unitsNeeded.textContent = `${units} Unit${units !== 1 ? 's' : ''}`;
  
  if (recipientName) recipientName.textContent = req.requester_name || 'Community Recipient';
  
  const hospitalName = req.donation_point || req.hospital || 'Gov. Celestino Gallares Memorial Medical Center';
  if (hospital) hospital.innerHTML = `<i class="fa-solid fa-hospital"></i> ${escapeHtml(hospitalName)}`;
  
  if (reasonContent) {
    reasonContent.textContent = req.notes || 'Emergency transfusion required. All donor compatibility testing will be handled by the hospital blood bank.';
  }

  // Set default donor blood type match
  const donorBloodSelect = document.getElementById('donorBloodType');
  if (donorBloodSelect && req.blood_type) {
    donorBloodSelect.value = req.blood_type;
  }
}

/**
 * Pre-fill donor form if logged-in donor profile is found
 */
function prefillDonorForm(profile) {
  const nameInput = document.getElementById('donorFullName');
  const phoneInput = document.getElementById('donorPhone');
  const bloodInput = document.getElementById('donorBloodType');

  if (nameInput && (profile.name || profile.first_name)) {
    const fullName = profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    nameInput.value = fullName;
  }

  if (phoneInput && (profile.phone || profile.contact_number)) {
    phoneInput.value = profile.phone || profile.contact_number;
  }

  if (bloodInput && profile.blood_type) {
    bloodInput.value = profile.blood_type;
    bloodInput.disabled = true;
    bloodInput.title = 'Blood type is taken from your verified donor profile.';
  }
}

const compatibleDonorsByRecipient = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-']
};

function normalizePledgeBloodType(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function donorCanServeRequest(donor, request) {
  if (String(request?.request_type || '').toLowerCase() === 'replacement') return true;
  const donorType = normalizePledgeBloodType(donor?.blood_type);
  const recipientType = normalizePledgeBloodType(request?.blood_type || request?.blood_type_needed);
  return Boolean(donorType && compatibleDonorsByRecipient[recipientType]?.includes(donorType));
}

/**
 * Set default donation appointment date to today or tomorrow
 */
function setDefaultDonationDate() {
  const dateInput = document.getElementById('donorPreferredDate');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * Step Navigation Handler
 */
function goToStep(stepNumber) {
  if (stepNumber < 1 || stepNumber > 3) return;

  // If trying to go to step 2, ensure perks are acknowledged
  if (stepNumber === 2 && currentStep === 1) {
    // smooth transition
  }

  currentStep = stepNumber;

  // Update views
  document.querySelectorAll('.pledge-section-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`viewStep${stepNumber}`);
  if (targetView) targetView.classList.add('active');

  // Update stepper navigation
  for (let i = 1; i <= 3; i++) {
    const indicator = document.getElementById(`stepIndicator${i}`);
    if (!indicator) continue;

    indicator.classList.remove('active', 'completed');
    if (i === currentStep) {
      indicator.classList.add('active');
    } else if (i < currentStep) {
      indicator.classList.add('completed');
    }
  }

  // Update connectors
  const conn1 = document.getElementById('stepConnector1');
  const conn2 = document.getElementById('stepConnector2');
  if (conn1) conn1.classList.toggle('filled', currentStep >= 2);
  if (conn2) conn2.classList.toggle('filled', currentStep >= 3);

  // Scroll to top of section
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Update Selected Perks List on the Final Donation Pass
 */
function updatePassPerksList() {
  const container = document.getElementById('passPerksList');
  if (!container) return;

  const perks = [];
  if (document.getElementById('perkMeals')?.checked) {
    perks.push({ icon: 'fa-utensils', label: 'Nutritious Meal & Refreshments' });
  }
  if (document.getElementById('perkTravel')?.checked) {
    perks.push({ icon: 'fa-van-shuttle', label: 'Travel Fare / Gas Reimbursed' });
  }
  if (document.getElementById('perkToken')?.checked) {
    perks.push({ icon: 'fa-hand-holding-dollar', label: 'Donor Appreciation Allowance' });
  }
  if (document.getElementById('perkLabs')?.checked) {
    perks.push({ icon: 'fa-microscope', label: '100% Free Screening Labs' });
  }


  if (perks.length === 0) {
    container.innerHTML = `<span class="pass-perk-badge"><i class="fa-solid fa-heart"></i> Standard Hospital Donor Care</span>`;
    return;
  }

  container.innerHTML = perks.map(p => `
    <span class="pass-perk-badge"><i class="fa-solid ${p.icon}"></i> ${escapeHtml(p.label)}</span>
  `).join('');
}

/**
 * Handle Confirmation Form Submission (Step 2 -> Step 3)
 */
async function handleConfirmPledge(event) {
  event.preventDefault();

  if (!currentDonor?.donor_id) {
    showToast('A registered donor profile is required before you can pledge.');
    return;
  }
  if (!donorCanServeRequest(currentDonor, currentRequest)) {
    const donorType = normalizePledgeBloodType(currentDonor.blood_type) || 'Your blood type';
    const neededType = normalizePledgeBloodType(currentRequest?.blood_type || currentRequest?.blood_type_needed) || 'the requested type';
    showToast(`${donorType} blood is not compatible with this ${neededType} request.`);
    return;
  }

  // 1. Verify eligibility checkboxes
  const eligibilityInputs = document.querySelectorAll('.eligibility-input');
  let allEligible = true;
  eligibilityInputs.forEach(input => {
    if (!input.checked) allEligible = false;
  });

  if (!allEligible) {
    await showUncheckedHealthCriteriaNotice();
    return;
  }

  // 2. Read form fields
  const donorName = document.getElementById('donorFullName')?.value.trim() || 'Hero Blood Donor';
  const donorBlood = document.getElementById('donorBloodType')?.value || 'O+';
  const donorPhone = document.getElementById('donorPhone')?.value.trim() || '';
  const donorDate = document.getElementById('donorPreferredDate')?.value || new Date().toISOString().split('T')[0];
  const donorTime = document.getElementById('donorPreferredTime')?.value || 'Morning (8:00 AM - 11:30 AM)';
  const donorNotes = document.getElementById('donorNotes')?.value.trim() || '';
  const supportPreferences = [
    ['perkMeals', 'meals'],
    ['perkTravel', 'travel'],
    ['perkToken', 'allowance'],
    ['perkLabs', 'screening']
  ].filter(([id]) => document.getElementById(id)?.checked).map(([, value]) => value);

  // 3. Generate unique Donation Pass Reference ID
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const passId = `VD-PLG-${randomSuffix}`;

  // Persist the response before showing a confirmed donation pass.
  const submitButton = document.getElementById('btnSubmitPledge');
  const originalButtonHtml = submitButton?.innerHTML || '';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Confirming response...</span>';
  }

  try {
    if (typeof createDonorPledge !== 'function') {
      throw new Error('The donor response service is unavailable. Please refresh and try again.');
    }

    const { error } = await createDonorPledge({
      request_id: currentRequest?.id || currentRequest?.request_id,
      units_pledged: 1,
      pass_reference: passId,
      preferred_date: donorDate,
      preferred_time: donorTime,
      donor_phone: donorPhone,
      notes: donorNotes,
      support_preferences: supportPreferences
    });

    if (error) throw error;
  } catch (error) {
    showToast(error?.message || 'Unable to confirm your response. Please try again.');
    return;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonHtml;
    }
  }
  // 4. Populate Donation Pass on Step 3
  const passRefEl = document.getElementById('passRefId');
  const passRecipEl = document.getElementById('passRecipientName');
  const passBloodEl = document.getElementById('passBloodType');
  const passHospEl = document.getElementById('passHospital');
  const passDonorEl = document.getElementById('passDonorName');
  const passDateTimeEl = document.getElementById('passDateTime');

  if (passRefEl) passRefEl.textContent = passId;
  if (passRecipEl) passRecipEl.textContent = currentRequest?.requester_name || 'Maria Santos';
  if (passBloodEl) passBloodEl.textContent = currentRequest?.blood_type || donorBlood;
  if (passHospEl) passHospEl.textContent = currentRequest?.donation_point || currentRequest?.hospital || 'Gov. Celestino Gallares Memorial Medical Center';
  if (passDonorEl) passDonorEl.textContent = `${donorName} (${donorBlood})`;
  
  // Format Date
  const dateObj = new Date(donorDate);
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : donorDate;
  if (passDateTimeEl) passDateTimeEl.textContent = `${formattedDate} • ${donorTime}`;

  updatePassPerksList();

  // 5. Store Pledge Notification in System
  savePledgeNotification({
    passId,
    recipientName: currentRequest?.requester_name || 'Recipient',
    bloodType: currentRequest?.blood_type || donorBlood,
    hospital: currentRequest?.donation_point || currentRequest?.hospital,
    donorName,
    donorPhone,
    scheduledDate: formattedDate,
    scheduledTime: donorTime,
    notes: donorNotes
  });

  // 6. Navigate to Step 3
  goToStep(3);
  showToast('Donation pledge confirmed! Medical screening instructions ready.');
}

/**
 * Save pledge notification into local system notifications
 */
function savePledgeNotification(pledge) {
  try {
    let savedState = { read: [], deleted: [] };
    try {
      savedState = JSON.parse(localStorage.getItem('veindropPatientNotificationState')) || savedState;
    } catch (_) {}

    const newNotif = {
      id: `pledge-${Date.now()}`,
      title: 'Blood Donation Pledge Registered',
      message: `You pledged to donate ${pledge.bloodType} blood for ${pledge.recipientName} at ${pledge.hospital} (${pledge.scheduledDate}). Pass Ref: ${pledge.passId}`,
      time: new Date().toISOString(),
      type: 'match'
    };

    let userNotifs = [];
    try {
      userNotifs = JSON.parse(localStorage.getItem('veindrop_custom_notifications')) || [];
    } catch (_) {}

    userNotifs.unshift(newNotif);
    localStorage.setItem('veindrop_custom_notifications', JSON.stringify(userNotifs.slice(0, 30)));
  } catch (e) {
    console.warn('Could not store notification:', e);
  }
}

/**
 * Copy Pass Details to Clipboard
 */
function copyPassDetails() {
  const passId = document.getElementById('passRefId')?.textContent || '';
  const recip = document.getElementById('passRecipientName')?.textContent || '';
  const blood = document.getElementById('passBloodType')?.textContent || '';
  const hosp = document.getElementById('passHospital')?.textContent || '';
  const donor = document.getElementById('passDonorName')?.textContent || '';
  const time = document.getElementById('passDateTime')?.textContent || '';

  const text = `🩸 BLOODCONNECT BLOOD DONATION PASS\n` +
    `Reference ID: ${passId}\n` +
    `Recipient: ${recip}\n` +
    `Blood Type Needed: ${blood}\n` +
    `Designated Hospital: ${hosp}\n` +
    `Donor: ${donor}\n` +
    `Schedule: ${time}\n` +
    `Status: Priority Confirmed\n\n` +
    `Please present this pass at the Blood Bank Admissions Counter.`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Donation Pass details copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy to clipboard.');
  });
}

/**
 * Helper to show toast messages
 */
function showToast(message) {
  const toastBox = document.getElementById('toastBox');
  const toastMsg = document.getElementById('toastMessage');
  if (!toastBox || !toastMsg) return;

  toastMsg.textContent = message;
  toastBox.classList.add('active');

  setTimeout(() => {
    toastBox.classList.remove('active');
  }, 3500);
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.goToStep = goToStep;
window.handleConfirmPledge = handleConfirmPledge;
window.copyPassDetails = copyPassDetails;
window.showToast = showToast;

if (typeof attachPageRefreshListeners === 'function') {
  attachPageRefreshListeners({
    onRefresh: async () => {
      try {
        if (typeof loadRequestAndDonorData === 'function') {
          await loadRequestAndDonorData();
        }
      } catch (_) { }
    },
    debounceMs: 2500
  });
}
