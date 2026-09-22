let requestSubmissionPending = false;
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const toggle = document.getElementById('menuToggle');
const notificationBtn = document.getElementById('notificationBtn');
const notificationPanel = document.getElementById('notificationPanel');
const notificationPreviewCount = document.getElementById('notificationPreviewCount');
const headerProfileBtn = document.getElementById('headerProfileBtn');
const headerDropdown = document.getElementById('headerProfileDropdown');
const headerDropdownOverlay = document.getElementById('headerDropdownOverlay');
let boholMap = null;

function formatFrontendBrand(value) {
  return String(value ?? '').replace(/veindrop/gi, 'BloodConnect');
}

function syncNotificationPreview() {
  const items = [...document.querySelectorAll('[data-notification-id]')];
  let savedState = { read: [], deleted: [] };
  try {
    savedState = JSON.parse(localStorage.getItem('veindropPatientNotificationState')) || savedState;
  } catch {
    // Use the default notification state when stored data is unavailable.
  }

  const readIds = Array.isArray(savedState.read) ? savedState.read : [];
  const deletedIds = Array.isArray(savedState.deleted) ? savedState.deleted : [];
  let visibleCount = 0;
  let unreadTotal = 0;

  items.forEach((item) => {
    const id = item.dataset.notificationId;
    const isDeleted = deletedIds.includes(id);
    const isUnread = item.classList.contains('unread') && !readIds.includes(id);
    item.classList.toggle('unread', isUnread);
    item.hidden = isDeleted || visibleCount >= 3;
    if (!isDeleted) visibleCount += 1;
    if (!isDeleted && isUnread) unreadTotal += 1;

    item.addEventListener('click', () => {
      const nextReadIds = [...new Set([...readIds, id])];
      localStorage.setItem('veindropPatientNotificationState', JSON.stringify({
        read: nextReadIds,
        deleted: deletedIds
      }));
    });
  });

  if (notificationPreviewCount) notificationPreviewCount.textContent = `${unreadTotal} new`;
  const notificationDot = notificationBtn?.querySelector('.notif-dot');
  if (notificationDot) notificationDot.hidden = unreadTotal === 0;
}

syncNotificationPreview();
async function loadInAppNotifications() {
  const list = notificationPanel?.querySelector('.notification-list');
  if (!list || typeof listMyNotifications !== 'function') return;
  const { data, error } = await listMyNotifications(20);
  if (error) {
    console.warn('Unable to load in-app notifications:', error);
    return;
  }

  list.querySelectorAll('[data-dynamic-notification]').forEach((item) => item.remove());
  const notifications = Array.isArray(data) ? data : [];
  [...notifications].reverse().forEach((notification) => {
    const item = document.createElement('a');
    item.className = `notification-item${notification.read_at ? '' : ' unread'}`;
    item.dataset.notificationId = `db-${notification.notification_id}`;
    item.dataset.dynamicNotification = 'true';
    item.href = (notification.drive_id || String(notification.notification_type || '').includes('drive') || String(notification.title || '').toLowerCase().includes('blood drive'))
      ? 'account_dashboard.html#section-drives'
      : 'account_dashboard.html#section-requests';
    item.innerHTML = `<i class="fa-solid fa-bell"></i><div><strong>${escapeHtml(formatFrontendBrand(notification.title || 'Coordinator donor appeal'))}</strong><p>${escapeHtml(formatFrontendBrand(notification.message || ''))}</p></div>`;
    item.addEventListener('click', () => {
      if (typeof markMyNotificationRead === 'function') markMyNotificationRead(notification.notification_id);
    });
    list.insertBefore(item, list.firstChild);
  });
  syncNotificationPreview();
}

function isMobileHeader() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function focusBoholMap() {
  if (!boholMap || typeof L === 'undefined') return;

  const boholCenter = [9.8500, 124.1800];
  const boholBounds = L.latLngBounds(
    [9.40, 123.65],
    [10.28, 124.68]
  );
  const boholViewBounds = boholBounds.pad(0.06);

  boholMap.setView(boholCenter, 10);
  boholMap.fitBounds(boholViewBounds, { padding: [36, 36] });
  boholMap.panTo(boholCenter);
  boholMap.invalidateSize();
}

function addFacilityMarkers() {
  if (!boholMap || typeof L === 'undefined') return;

  const facilities = [
    {
      name: 'Governor Celestino Gallares Memorial Hospital',
      type: 'hospital',
      icon: 'fa-hospital',
      lat: 9.6556,
      lng: 123.8503,
      description: 'Main government hospital'
    },
    {
      name: 'Bohol Doctors Hospital',
      type: 'hospital',
      icon: 'fa-kit-medical',
      lat: 9.6542,
      lng: 123.8560,
      description: 'Private medical center'
    },
    {
      name: 'Bohol Blood Center',
      type: 'blood-bank',
      icon: 'fa-droplet',
      lat: 9.6590,
      lng: 123.8605,
      description: 'Blood collection and storage'
    },
    {
      name: 'Panglao Community Clinic',
      type: 'clinic',
      icon: 'fa-stethoscope',
      lat: 9.5795,
      lng: 123.7543,
      description: 'Primary care facility'
    },
    {
      name: 'Talibon District Hospital',
      type: 'emergency',
      icon: 'fa-truck-medical',
      lat: 10.1500,
      lng: 124.3180,
      description: 'Emergency medical support'
    },
    {
      name: 'Ubay Medical Station',
      type: 'clinic',
      icon: 'fa-user-doctor',
      lat: 10.0400,
      lng: 124.4700,
      description: 'Rapid care facility'
    }
  ];

  facilities.forEach((facility) => {
    const iconHtml = `<div class="facility-marker ${facility.type}"><i class="fa-solid ${facility.icon}"></i></div>`;
    const marker = L.marker([facility.lat, facility.lng], {
      icon: L.divIcon({
        className: 'facility-marker-wrapper',
        html: iconHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
      })
    }).addTo(boholMap);

    marker.bindPopup(`<strong>${facility.name}</strong><br/>${facility.description}`);
  });
}

function initBoholMap() {
  const mapContainer = document.getElementById('boholMap');
  if (!mapContainer || boholMap || typeof L === 'undefined') return;

  const boholCenter = [9.8506, 124.1435];
  const boholBounds = L.latLngBounds(
    [9.30, 123.55],
    [10.35, 124.60]
  );

  boholMap = L.map('boholMap', {
    center: boholCenter,
    zoom: 10,
    attributionControl: false,
    maxBounds: boholBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 10,
    maxZoom: 14,
    zoomControl: true,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true,
    touchZoom: true,
    boxZoom: true,
    keyboard: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(boholMap);

  const boholPin = L.divIcon({
    className: 'bohol-pin',
    html: '<span class="bohol-pin-dot"></span><span class="bohol-pin-label">Bohol</span>',
    iconSize: [88, 42],
    iconAnchor: [44, 36]
  });

  L.marker(boholCenter, { icon: boholPin }).addTo(boholMap).bindPopup('<strong>Bohol</strong><br/>Centered patient coverage area');

  window.setTimeout(() => {
    if (boholMap) {
      addFacilityMarkers();
      focusBoholMap();
    }
  }, 220);
}

function closeHeaderDropdown() {
  if (!headerDropdown) return;
  headerDropdown.classList.remove('active');
  if (headerDropdownOverlay) headerDropdownOverlay.classList.remove('active');
  if (headerProfileBtn) headerProfileBtn.setAttribute('aria-expanded', 'false');
}

function openHeaderDropdown() {
  if (!headerDropdown) return;
  headerDropdown.classList.add('active');
  if (isMobileHeader() && headerDropdownOverlay) {
    headerDropdownOverlay.classList.add('active');
  }
  if (headerProfileBtn) headerProfileBtn.setAttribute('aria-expanded', 'true');
}

function closeNotificationPanel() {
  if (!notificationPanel) return;
  notificationPanel.classList.remove('active');
  if (notificationBtn) notificationBtn.setAttribute('aria-expanded', 'false');
}

function openNotificationPanel() {
  if (!notificationPanel) return;
  notificationPanel.classList.add('active');
  if (notificationBtn) notificationBtn.setAttribute('aria-expanded', 'true');
}

function toggleNotificationPanel(event) {
  if (event) event.stopPropagation();
  if (!notificationPanel) return;
  const isOpen = notificationPanel.classList.contains('active');
  if (isOpen) {
    closeNotificationPanel();
    return;
  }
  closeHeaderDropdown();
  openNotificationPanel();
}

function syncSidebarState() {
  const isOpen = sidebar.classList.contains('open');
  const isMobile = window.matchMedia('(max-width: 900px)').matches;

  document.body.classList.toggle('menu-open', isMobile && isOpen);
  document.body.classList.toggle('desktop-sidebar-open', !isMobile && isOpen);

  if (overlay) {
    overlay.classList.toggle('active', isMobile && isOpen);
  }
}

function setSidebarOpen(isOpen) {
  sidebar.classList.toggle('open', isOpen);
  syncSidebarState();
  closeHeaderDropdown();
  closeNotificationPanel();
}

toggle.addEventListener('click', () => {
  setSidebarOpen(!sidebar.classList.contains('open'));
});

overlay.addEventListener('click', () => {
  setSidebarOpen(false);
});

// ---- Section-based Navigation ----
const sectionTitles = {
  dashboard: { title: 'Recipient Overview' },
  donor: { title: 'Donor Center' },
  requests: { title: 'Blood Requests' },
  drives: { title: 'Blood Drives' },
  profile: { title: 'My Profile' }
};

function activateSectionView(sectionName) {
  if (sectionName === 'donor') sectionName = 'dashboard';
  const target = document.getElementById('section-' + sectionName);
  if (!target) return null;

  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  target.classList.add('active');

  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector('.nav-item[data-section="' + sectionName + '"]');
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.mobile-nav-item[data-mobile-section]').forEach((item) => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const activeMobileNav = document.querySelector('.mobile-nav-item[data-mobile-section="' + sectionName + '"]');
  if (activeMobileNav) {
    activeMobileNav.classList.add('active');
    activeMobileNav.setAttribute('aria-current', 'page');
  }

  const info = sectionTitles[sectionName];
  if (info) {
    const titleEl = document.querySelector('.header-title h1');
    if (titleEl) titleEl.textContent = info.title;
    const subEl = document.querySelector('.header-title p');
    if (subEl) subEl.remove();
  }

  return target;
}

function navigateToSection(sectionName) {
  if (sectionName === 'donor') sectionName = 'dashboard';
  const target = document.getElementById('section-' + sectionName);
  if (!target) return;

  if (sectionName === 'requests' && currentProfile && !currentProfile.has_patient_profile) {
    openPatientView('requests');
    return;
  }

  activateSectionView(sectionName);

  // Keep refreshes on the section the user is currently viewing.
  const sectionHash = '#section-' + sectionName;
  if (window.location.hash !== sectionHash) {
    window.history.replaceState(null, '', sectionHash);
  }

  // Load section-specific data
  if (sectionName === 'drives') {
    renderBloodDrives();
  }

  if (sectionName === 'dashboard' || sectionName === 'donor') {
    loadDonorDashboard();
  }

  if (sectionName === 'dashboard' && boholMap) {
    window.setTimeout(() => {
      boholMap.invalidateSize();
      focusBoholMap();
    }, 180);
  }

  setSidebarOpen(false);
  window.scrollTo({ top: 0, behavior: 'auto' });
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 120);
}

document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateToSection(item.dataset.section);
  });
});

document.querySelectorAll('.stat-card[data-stat-target]').forEach(card => {
  card.addEventListener('click', () => {
    navigateToSection(card.dataset.statTarget);
  });
});

document.querySelectorAll('.mobile-nav-item[data-mobile-section]').forEach(item => {
  item.addEventListener('click', () => {
    navigateToSection(item.dataset.mobileSection);
  });
});

const mobileDonorSearchBtn = document.getElementById('mobileDonorSearchBtn');
if (mobileDonorSearchBtn) {
  mobileDonorSearchBtn.addEventListener('click', openMobileDonorSearch);
}

const donorSearchAction = document.getElementById('donorSearchAction');
if (donorSearchAction) {
  donorSearchAction.addEventListener('click', searchDonorZones);
}

const linkedSection = window.location.hash.replace('#section-', '');
if (Object.prototype.hasOwnProperty.call(sectionTitles, linkedSection)) {
  activateSectionView(linkedSection);
  delete document.documentElement.dataset.initialSection;
  // Section IDs differ from the route hash, so native anchor scrolling is unnecessary.

  // Keep the section hash intact, including while authentication is loading.
}

window.addEventListener('hashchange', () => {
  const requestedSection = window.location.hash.replace('#section-', '');
  if (Object.prototype.hasOwnProperty.call(sectionTitles, requestedSection)) {
    navigateToSection(requestedSection);
  }
});

if (notificationBtn) {
  notificationBtn.addEventListener('click', toggleNotificationPanel);
}

window.addEventListener('resize', syncSidebarState);

window.addEventListener('resize', () => {
  if (boholMap) {
    boholMap.invalidateSize();
    focusBoholMap();
  }
});

initBoholMap();

// Blood type compatibility (who can receive from whom)
const receiveFrom = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-']
};

const donateTo = {
  'A+': ['A+', 'AB+'],
  'A-': ['A+', 'A-', 'AB+', 'AB-'],
  'B+': ['B+', 'AB+'],
  'B-': ['B+', 'B-', 'AB+', 'AB-'],
  'AB+': ['AB+'],
  'AB-': ['AB+', 'AB-'],
  'O+': ['A+', 'B+', 'AB+', 'O+'],
  'O-': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
};

// ---- Auth & Profile ----
let currentProfile = null;
let pendingProfilePhoto = '';
let quickProfilePhotoMode = false;
let profileUpdateToastTimer = null;
let heroGreetingTimer = null;
let allRequests = [];
let activeRequestFilter = 'all';
let requestSubscription = null;
let currentAccountRoles = new Set();
let donorDashboardData = null;
let donorDashboardLoading = false;

function profilePhotoStorageKey(profile = currentProfile) {
  const owner = profile?.patient_id || profile?.donor_id || profile?.id || profile?.email || 'patient';
  return `veindropProfilePhoto:${owner}`;
}

function getTimeBasedGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function updateDashboardGreeting(profile = currentProfile) {
  if (!profile) return;

  const now = new Date();
  const greeting = getTimeBasedGreeting(now);
  const firstName = String(profile.first_name || 'Patient').trim();
  const greetingName = String(profile.username || firstName).trim();
  const shortGreetingName = greetingName.length > 12 ? `${greetingName.slice(0, 12)}....` : greetingName;
  const heroTitle = document.getElementById('heroTitle');

  if (heroTitle) heroTitle.textContent = `${greeting}, ${shortGreetingName}`;
  const headerGreeting = document.getElementById('headerGreeting');
  if (headerGreeting) headerGreeting.remove();

  const nextPeriod = new Date(now);
  if (now.getHours() < 12) {
    nextPeriod.setHours(12, 0, 0, 0);
  } else if (now.getHours() < 18) {
    nextPeriod.setHours(18, 0, 0, 0);
  } else {
    nextPeriod.setDate(nextPeriod.getDate() + 1);
    nextPeriod.setHours(0, 0, 0, 0);
  }

  clearTimeout(heroGreetingTimer);
  heroGreetingTimer = setTimeout(() => updateDashboardGreeting(currentProfile), Math.max(1000, nextPeriod - now));
}

function getSavedProfilePhoto(profile) {
  try {
    return localStorage.getItem(profilePhotoStorageKey(profile)) || '';
  } catch (_) {
    return '';
  }
}

function saveProfilePhoto(profile, photoUrl) {
  try {
    const key = profilePhotoStorageKey(profile);
    if (photoUrl) localStorage.setItem(key, photoUrl);
    else localStorage.removeItem(key);
  } catch (_) {
    throw new Error('The photo could not be saved on this device. Please choose a smaller image.');
  }
}

function showProfileUpdateToast(message = 'Profile picture updated successfully.') {
  const toast = document.getElementById('profileUpdateToast');
  if (!toast) return;

  const text = toast.querySelector('span');
  if (text) text.textContent = message;
  clearTimeout(profileUpdateToastTimer);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('visible'));

  profileUpdateToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (!toast.classList.contains('visible')) toast.hidden = true;
    }, 220);
  }, 3000);
}
let showMissedDrives = false;
let activeDonorSearchType = 'compatible';
let donorZoneMarkers = [];

// Blood Drives data (Empty by default — populated dynamically when drives exist)
const BLOOD_DRIVE_PLAN = [];
const REGISTERED_BLOOD_DRIVE_IDS = new Set();

const DONOR_SEARCH_BLOOD_TYPES = ['Compatible', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const DONOR_SEARCH_ZONES = [
  { name: 'Tagbilaran care zone', area: 'Tagbilaran City', lat: 9.6500, lng: 123.8550 },
  { name: 'Panglao coastal zone', area: 'Panglao', lat: 9.5780, lng: 123.7460 },
  { name: 'Dauis response zone', area: 'Dauis', lat: 9.6225, lng: 123.8652 },
  { name: 'Tubigon north zone', area: 'Tubigon', lat: 9.9528, lng: 123.9624 },
  { name: 'Talibon emergency zone', area: 'Talibon', lat: 10.1497, lng: 124.3250 },
  { name: 'Ubay east zone', area: 'Ubay', lat: 10.0560, lng: 124.4720 }
];

const FALLBACK_DONOR_COUNTS = {
  'O+': [4, 2, 3, 1, 2, 2],
  'O-': [1, 0, 1, 0, 1, 0],
  'A+': [3, 2, 1, 2, 1, 1],
  'A-': [1, 1, 0, 1, 0, 1],
  'B+': [2, 1, 2, 1, 2, 1],
  'B-': [0, 1, 1, 0, 1, 0],
  'AB+': [1, 0, 1, 0, 0, 1],
  'AB-': [0, 1, 0, 0, 1, 0]
};

function formatDateShort(dateStr) {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDriveTime(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

function getDriveStatusBadge(status) {
  const statusLower = String(status || '').toLowerCase();
  if (statusLower === 'missed') return '<span class="badge missed">Missed</span>';
  if (statusLower === 'completed') return '<span class="badge completed">Completed</span>';
  if (statusLower === 'full') return '<span class="badge approved">Full</span>';
  if (statusLower === 'recruiting') return '<span class="badge pending">Recruiting</span>';
  return '<span class="badge processing">' + (status || 'Unknown') + '</span>';
}

function getDriveStatusClass(status) {
  const statusLower = String(status || '').toLowerCase();
  if (statusLower === 'missed') return 'missed';
  if (statusLower === 'completed') return 'completed';
  if (statusLower === 'full') return 'full';
  if (statusLower === 'recruiting') return 'recruiting';
  return 'scheduled';
}

function isDrivePast(drive) {
  if (!drive?.date) return false;
  const driveDate = new Date(`${drive.date}T23:59:59`);
  if (Number.isNaN(driveDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return driveDate < today;
}

function getVisibleDriveStatus(drive) {
  return isDrivePast(drive) ? 'missed' : drive.status;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US') : '--';
}

function formatPatientDisplayName(profile) {
  const firstName = String(profile?.first_name || '').trim();
  const middleName = String(profile?.middle_name || '').trim();
  const lastName = String(profile?.last_name || '').trim();
  const middleInitial = middleName ? `${middleName.charAt(0).toUpperCase()}.` : '';
  return [firstName, middleInitial, lastName].filter(Boolean).join(' ') || 'Patient';
}

function getCurrentSearchTypes() {
  if (activeDonorSearchType !== 'compatible') return [activeDonorSearchType];
  const patientType = currentProfile?.blood_type || currentProfile?.blood_type_needed || '';
  return receiveFrom[patientType] || DONOR_SEARCH_BLOOD_TYPES.filter((type) => type !== 'Compatible');
}

function getDonorSearchLabel() {
  if (activeDonorSearchType !== 'compatible') return activeDonorSearchType;
  const patientType = currentProfile?.blood_type || currentProfile?.blood_type_needed || '';
  return patientType ? `Compatible for ${patientType}` : 'Compatible donors';
}

function renderDonorTypeFilters() {
  const filters = document.getElementById('donorTypeFilters');
  if (!filters) return;

  filters.innerHTML = DONOR_SEARCH_BLOOD_TYPES.map((type) => {
    const value = type.toLowerCase();
    const active = activeDonorSearchType === value || activeDonorSearchType === type;
    return `<button type="button" class="${active ? 'active' : ''}" data-donor-type="${value === 'compatible' ? 'compatible' : type}">${type}</button>`;
  }).join('');

  filters.querySelectorAll('[data-donor-type]').forEach((button) => {
    button.addEventListener('click', () => {
      activeDonorSearchType = button.dataset.donorType;
      renderDonorTypeFilters();
      searchDonorZones();
    });
  });
}

function hashDonorToZone(donor) {
  const area = String(donor?.map_area || donor?.area || donor?.city || '').trim().toLowerCase();
  const areaIndex = DONOR_SEARCH_ZONES.findIndex((zone) => zone.area.toLowerCase() === area);
  if (areaIndex >= 0) return areaIndex;
  const source = String(donor?.id || donor?.donor_id || donor?.email || donor?.name || donor?.first_name || 'donor');
  return source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % DONOR_SEARCH_ZONES.length;
}

function buildDonorZonesFromList(donors) {
  const targetTypes = getCurrentSearchTypes();
  if (!targetTypes.length) return [];

  const zoneCounts = DONOR_SEARCH_ZONES.map((zone) => ({ ...zone, count: 0 }));
  (donors || []).forEach((donor) => {
    const bloodType = String(donor?.blood_type || '').trim().toUpperCase();
    const availability = String(donor?.availability_status || '').toLowerCase();
    const status = String(donor?.donor_status || '').toLowerCase();
    const showOnMap = donor?.show_on_map === true;
    const locationStatus = String(donor?.location_status || 'needs_review').toLowerCase();
    const isAvailable = availability === 'available' || status === 'approved' || status === 'registered';
    if (!targetTypes.includes(bloodType) || !isAvailable || !showOnMap || locationStatus !== 'verified') return;
    zoneCounts[hashDonorToZone(donor)].count += 1;
  });

  return zoneCounts.filter((zone) => zone.count > 0);
}

function buildFallbackDonorZones() {
  const targetTypes = getCurrentSearchTypes();
  const zoneCounts = DONOR_SEARCH_ZONES.map((zone, index) => {
    const count = targetTypes.reduce((sum, type) => sum + Number(FALLBACK_DONOR_COUNTS[type]?.[index] || 0), 0);
    return { ...zone, count };
  });
  return zoneCounts.filter((zone) => zone.count > 0);
}

function clearDonorZoneMarkers() {
  if (!boholMap || !donorZoneMarkers.length) {
    donorZoneMarkers = [];
    return;
  }
  donorZoneMarkers.forEach((marker) => {
    try { marker.remove(); } catch (_) { }
  });
  donorZoneMarkers = [];
}

function renderDonorZoneResults(zones, usedFallback = false) {
  const title = document.getElementById('donorSearchTitle');
  const results = document.getElementById('donorSearchResults');
  if (title) title.textContent = getDonorSearchLabel();
  if (!results) return;

  clearDonorZoneMarkers();

  if (!zones.length) {
    results.innerHTML = '<p>No active donor zones found for this blood type. Submit a request so admins can coordinate support.</p>';
    return;
  }

  results.innerHTML = zones.map((zone) => `
        <button type="button" class="donor-zone-result" data-zone="${escapeHtml(zone.name)}">
          <span><i class="fa-solid fa-location-crosshairs"></i> ${escapeHtml(zone.area)}</span>
          <strong>${formatNumber(zone.count)} donor${zone.count === 1 ? '' : 's'}</strong>
        </button>
      `).join('') + (usedFallback ? '<small>Showing privacy-safe sample zones until live donor access is available.</small>' : '<small>Exact donor locations are hidden for privacy.</small>');

  if (boholMap && typeof L !== 'undefined') {
    const bounds = [];
    zones.forEach((zone) => {
      const marker = L.marker([zone.lat, zone.lng], {
        icon: L.divIcon({
          className: 'donor-zone-marker-wrapper',
          html: `<div class="donor-zone-marker"><i class="fa-solid fa-user-group"></i><span>${zone.count}</span></div>`,
          iconSize: [42, 42],
          iconAnchor: [21, 42]
        })
      }).addTo(boholMap);
      marker.bindPopup(`<strong>${escapeHtml(zone.area)}</strong><br/>${formatNumber(zone.count)} compatible donor${zone.count === 1 ? '' : 's'} nearby`);
      donorZoneMarkers.push(marker);
      bounds.push([zone.lat, zone.lng]);
    });

    if (bounds.length) {
      boholMap.fitBounds(bounds, { padding: [54, 54], maxZoom: 12 });
    }
  }

  results.querySelectorAll('[data-zone]').forEach((button, index) => {
    button.addEventListener('click', () => {
      const zone = zones[index];
      if (boholMap && zone) boholMap.setView([zone.lat, zone.lng], 12);
    });
  });
}

async function searchDonorZones() {
  const results = document.getElementById('donorSearchResults');
  if (results) results.innerHTML = '<p>Searching donor zones...</p>';

  if (typeof listVisibleDonors === 'function') {
    try {
      const { data, error } = await listVisibleDonors();
      if (!error && Array.isArray(data)) {
        const zones = buildDonorZonesFromList(data);
        renderDonorZoneResults(zones, false);
        return;
      }
    } catch (_) { }
  }

  renderDonorZoneResults(buildFallbackDonorZones(), true);
}

function openMobileDonorSearch() {
  window.location.href = 'recipient_donor_map.html';
}

function renderBloodDrives() {
  const tableBody = document.getElementById('drivesTableBody');
  if (!tableBody) return;

  const drives = BLOOD_DRIVE_PLAN.slice();
  const missedDrives = drives.filter(isDrivePast);
  const activeDrives = drives.filter((drive) => !isDrivePast(drive));
  const visibleDrives = showMissedDrives ? missedDrives : activeDrives;
  const missedToggle = document.getElementById('missedDrivesToggle');
  const missedCount = document.getElementById('missedDrivesCount');

  if (missedToggle) {
    missedToggle.classList.toggle('active', showMissedDrives);
    missedToggle.setAttribute('aria-pressed', showMissedDrives ? 'true' : 'false');
  }
  if (missedCount) missedCount.textContent = formatNumber(missedDrives.length);

  if (!drives.length) {
    tableBody.innerHTML = '<p class="drive-empty">No blood drives scheduled.</p>';
    return;
  }

  if (!visibleDrives.length) {
    tableBody.innerHTML = showMissedDrives
      ? '<p class="drive-empty">No missed blood drive opportunities.</p>'
      : '<p class="drive-empty">No upcoming blood drives right now. Use <strong>Past Blood Drives</strong> to review previous campaigns.</p>';
    return;
  }

  tableBody.innerHTML = visibleDrives.map((drive) => {
    const target = Number(drive.target_units) || 0;
    const registered = Number(drive.registered_donors) || 0;
    const percent = target > 0 ? Math.min(100, Math.round((registered / target) * 100)) : 0;
    const open = Math.max(0, target - registered);
    const visibleStatus = getVisibleDriveStatus(drive);
    const statusClass = getDriveStatusClass(visibleStatus);
    const driveId = escapeHtml(drive.drive_id || '');
    const isRegistered = REGISTERED_BLOOD_DRIVE_IDS.has(String(drive.drive_id));
    const timeRange = [formatDriveTime(drive.start_time), formatDriveTime(drive.end_time)].filter(Boolean).join(' - ');
    const focusLabel = String(drive.focus_type || '').toLowerCase() === 'all'
      ? 'All blood types'
      : `${drive.focus_type || '--'} focus`;
    return `<article class="drive-card ${statusClass}" role="button" tabindex="0" data-drive-id="${driveId}" onclick="openDriveDetailsModal('${driveId}')" onkeydown="handleDriveCardKeydown(event, '${driveId}')" aria-label="View details for ${escapeHtml(drive.drive_name || 'blood drive')}">
          <div class="drive-card-top">
            <div class="drive-date">
              <strong>${formatDateShort(drive.date).split(',')[0]}</strong>
              <span>${formatDateShort(drive.date).split(',')[1] || ''}</span>
            </div>
            ${getDriveStatusBadge(visibleStatus)}
          </div>
          <div class="drive-main">
            <h3>${escapeHtml(drive.drive_name || '--')}</h3>
            <p><i class="fa-solid fa-location-dot"></i> ${escapeHtml(drive.venue || '--')}</p>
          </div>
          <div class="drive-meta">
            <span class="drive-focus-pill"><i class="fa-solid fa-droplet"></i> ${escapeHtml(focusLabel)}</span>
            ${isRegistered ? '<span class="drive-registered-pill"><i class="fa-solid fa-circle-check"></i> Registered</span>' : ''}
          </div>
          <div class="drive-capacity" aria-label="${percent}% of donor slots filled">
            <div class="drive-capacity-item">
              <span>Registered</span>
              <strong>${formatNumber(registered)}</strong>
            </div>
            <div class="drive-capacity-item open">
              <span>Open slots</span>
              <strong>${formatNumber(open)}</strong>
            </div>
            <div class="drive-capacity-item target">
              <span>Target units</span>
              <strong>${formatNumber(target)}</strong>
            </div>
          </div>
          <div class="drive-card-footer">
            <span><i class="fa-regular fa-clock"></i> ${escapeHtml(timeRange || 'Time to be announced')}</span>
          </div>
        </article>`;
  }).join('');
}

function toggleMissedDrives() {
  showMissedDrives = !showMissedDrives;
  renderBloodDrives();
}

function getBloodDriveById(driveId) {
  const normalizedId = String(driveId || '');
  return BLOOD_DRIVE_PLAN.find((drive) => String(drive.drive_id || '') === normalizedId) || null;
}

function handleDriveCardKeydown(event, driveId) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openDriveDetailsModal(driveId);
}

function openDriveDetailsModal(driveId) {
  const drive = getBloodDriveById(driveId);
  const modal = document.getElementById('driveDetailsModal');
  const title = document.getElementById('driveDetailsTitle');
  const content = document.getElementById('driveDetailsContent');
  if (!drive || !modal || !content) return;

  const target = Number(drive.target_units) || 0;
  const registered = Number(drive.registered_donors) || 0;
  const open = Math.max(0, target - registered);
  const percent = target > 0 ? Math.min(100, Math.round((registered / target) * 100)) : 0;
  const isRegistered = REGISTERED_BLOOD_DRIVE_IDS.has(String(drive.drive_id));
  const canRegister = !isDrivePast(drive) && !['completed', 'cancelled', 'full'].includes(String(drive.status || '').toLowerCase());
  const timeRange = [formatDriveTime(drive.start_time), formatDriveTime(drive.end_time)].filter(Boolean).join(' - ');
  const formattedDriveDate = formatDateShort(drive.date);
  const [driveDateLabel, driveYearLabel = ''] = formattedDriveDate.split(',').map((part) => part.trim());
  const focusLabel = String(drive.focus_type || '').toLowerCase() === 'all'
    ? 'All blood types'
    : `${drive.focus_type || '--'} focus`;

  if (title) {
    title.innerHTML = '<i class="fa-solid fa-vial"></i> Blood Drive Details';
  }

  content.innerHTML = `
        <div class="drive-detail-hero">
          <div class="drive-detail-date" aria-label="${escapeHtml(formattedDriveDate)}">
            <strong>${escapeHtml(driveDateLabel)}</strong>
            <span>${escapeHtml(driveYearLabel)}</span>
          </div>
          <div class="drive-detail-summary">
            <span class="drive-focus-pill"><i class="fa-solid fa-droplet"></i> ${escapeHtml(focusLabel)}</span>
            <h4>${escapeHtml(drive.drive_name || '--')}</h4>
          </div>
          <div class="drive-detail-status">${getDriveStatusBadge(getVisibleDriveStatus(drive))}</div>
        </div>

        <div class="drive-detail-breakdown">
          <section class="drive-detail-section">
            <h5><i class="fa-regular fa-calendar"></i> Schedule</h5>
            <div class="drive-detail-line">
              <span>Date</span>
              <strong>${escapeHtml(formattedDriveDate)}</strong>
            </div>
            <div class="drive-detail-line">
              <span>Time</span>
              <strong>${escapeHtml(timeRange || 'To be announced')}</strong>
            </div>
          </section>

          <section class="drive-detail-section">
            <h5><i class="fa-solid fa-location-dot"></i> Location</h5>
            <div class="drive-detail-line">
              <span>Venue</span>
              <strong>${escapeHtml(drive.venue || '--')}</strong>
            </div>
            <div class="drive-detail-line">
              <span>Complete address</span>
              <strong>${escapeHtml(drive.address || 'No additional address provided')}</strong>
            </div>
          </section>
        </div>

        <section class="drive-detail-section drive-donation-section">
          <h5><i class="fa-solid fa-hand-holding-droplet"></i> Donation availability</h5>
          <div class="drive-detail-line drive-blood-types-line">
            <span>Accepted blood types</span>
            <strong>${escapeHtml(focusLabel)}</strong>
          </div>
          <div class="drive-capacity drive-capacity-detail">
            <div class="drive-capacity-item">
              <span>Registered</span>
              <strong>${formatNumber(registered)}</strong>
            </div>
            <div class="drive-capacity-item open">
              <span>Open slots</span>
              <strong>${formatNumber(open)}</strong>
            </div>
            <div class="drive-capacity-item target">
              <span>Target units</span>
              <strong>${formatNumber(target)}</strong>
            </div>
          </div>
        </section>

        <section class="drive-detail-section drive-notes-section">
          <h5><i class="fa-solid fa-clipboard-list"></i> Coordinator notes</h5>
          <div class="drive-notes-content">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <p>${escapeHtml(drive.notes || 'No special instructions were provided. Please bring a valid ID and follow the coordinator’s instructions at the venue.')}</p>
          </div>
        </section>
        <div id="driveRegistrationMsg" class="form-msg" role="status" aria-live="polite"></div>
        ${isRegistered
          ? '<button type="button" class="btn-submit" disabled><i class="fa-solid fa-circle-check"></i> You are registered</button>'
          : (canRegister
            ? `<button type="button" class="btn-submit" id="registerDriveBtn" onclick="registerForSelectedBloodDrive('${escapeHtml(drive.drive_id)}')"><i class="fa-solid fa-user-plus"></i> Register for this drive</button>`
            : '')}
      `;

  modal.classList.add('active');
  document.body.classList.add('modal-open');
}

async function refreshBloodDrives() {
  if (typeof listBloodDrives !== 'function') {
    renderBloodDrives();
    return;
  }

  const [drivesResult, registrationsResult] = await Promise.all([
    listBloodDrives(),
    typeof listMyBloodDriveRegistrations === 'function'
      ? listMyBloodDriveRegistrations()
      : Promise.resolve({ data: [], error: null })
  ]);

  if (drivesResult.error) {
    const tableBody = document.getElementById('drivesTableBody');
    if (tableBody) tableBody.innerHTML = `<p class="drive-empty">${escapeHtml(drivesResult.error.message || 'Unable to load blood drives.')}</p>`;
    return;
  }

  BLOOD_DRIVE_PLAN.splice(0, BLOOD_DRIVE_PLAN.length, ...(Array.isArray(drivesResult.data) ? drivesResult.data : []));
  REGISTERED_BLOOD_DRIVE_IDS.clear();
  if (!registrationsResult.error) {
    (registrationsResult.data || []).forEach((registration) => {
      REGISTERED_BLOOD_DRIVE_IDS.add(String(registration.drive_id));
    });
  }
  renderBloodDrives();
}

async function registerForSelectedBloodDrive(driveId) {
  const button = document.getElementById('registerDriveBtn');
  const msg = document.getElementById('driveRegistrationMsg');
  if (typeof registerForBloodDrive !== 'function') return;
  if (button) button.disabled = true;
  if (msg) {
    msg.textContent = 'Registering your donor slot...';
    msg.className = 'form-msg info';
  }

  const { data, error } = await registerForBloodDrive(driveId);
  if (error) {
    if (msg) {
      msg.textContent = error.message || 'Unable to register for this drive.';
      msg.className = 'form-msg error';
    }
    if (button) button.disabled = false;
    return;
  }

  REGISTERED_BLOOD_DRIVE_IDS.add(String(driveId));
  if (msg) {
    msg.textContent = data?.already_registered
      ? 'You are already registered for this drive.'
      : 'Registration confirmed. Thank you for volunteering to donate!';
    msg.className = 'form-msg success';
  }
  if (button) {
    button.innerHTML = '<i class="fa-solid fa-circle-check"></i> You are registered';
    button.disabled = true;
  }
  await refreshBloodDrives();
}

function closeDriveDetailsModal() {
  const modal = document.getElementById('driveDetailsModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
}

async function refreshDashboardData(options = {}) {
  try {
    if (typeof getCurrentUserProfile === 'function') {
      const { profile } = await getCurrentUserProfile();
      if (profile) {
        currentProfile = profile;
        applyProfileToUI(profile);
      }
    }
    if (currentProfile?.has_patient_profile) {
      loadRequests();
    }
    if (currentProfile?.has_donor_profile) {
      loadDonorDashboard();
    }
    await refreshBloodDrives();
    if (typeof updateUnreadBadge === 'function') {
      updateUnreadBadge();
    }
  } catch (err) {
    console.warn('Dashboard background refresh warning:', err);
  }
}

function initRequestsRealtime() {
  // Unsubscribe existing
  if (requestSubscription && typeof requestSubscription.unsubscribe === 'function') {
    try { requestSubscription.unsubscribe(); } catch (_) { }
  }
  const patientId = currentProfile?.patient_id || currentProfile?.id || null;
  const userId = currentProfile?.user_id || currentProfile?.id || null;

  if (typeof subscribeToPatientDashboard === 'function') {
    requestSubscription = subscribeToPatientDashboard({ patientId, userId }, (change) => {
      if (change.type === 'blood_request' || change.type === 'donor_pledge') {
        if (currentProfile?.has_patient_profile) loadRequests();
        if (currentProfile?.has_donor_profile) loadDonorDashboard();
      } else if (change.type === 'blood_drive') {
        refreshBloodDrives();
      } else if (change.type === 'blood_inventory') {
        if (currentProfile?.has_patient_profile) loadRequests();
      } else if (change.type === 'notifications') {
        loadInAppNotifications();
      }
    });
  } else if (typeof subscribeToRequestChanges === 'function' && patientId) {
    requestSubscription = subscribeToRequestChanges(patientId, () => {
      loadRequests();
    });
  }
}

function hasAccountRole(role) {
  return currentAccountRoles.has(String(role || '').toLowerCase());
}

function showAccountRoleMessage(message = '', type = 'info') {
  const element = document.getElementById('accountRoleMessage');
  if (!element) return;
  element.hidden = !message;
  element.textContent = message;
  element.className = `form-msg account-role-message${message ? ` ${type}` : ''}`;
}

function preferredViewStorageKey() {
  return `veindropDashboardView:${String(currentProfile?.email || 'account').toLowerCase()}`;
}

function savePreferredDashboardView(view) {
  try { localStorage.setItem(preferredViewStorageKey(), view); } catch (_) { }
}

function getPreferredDashboardView() {
  try { return localStorage.getItem(preferredViewStorageKey()) || ''; } catch (_) { return ''; }
}

function renderAccountRoleControls(profile) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  currentAccountRoles = new Set(roles.map((role) => String(role).toLowerCase()));
  if (profile?.has_patient_profile) currentAccountRoles.add('patient');
  if (profile?.has_donor_profile) currentAccountRoles.add('donor');

  const hasPatient = currentAccountRoles.has('patient') && Boolean(profile?.has_patient_profile);
  const hasDonor = currentAccountRoles.has('donor') && Boolean(profile?.has_donor_profile);
  const roleSummary = document.getElementById('accountRoleSummary');
  const headerRoleDisplay = document.getElementById('headerRoleDisplay');
  const portalRoleLabel = document.getElementById('portalRoleLabel');
  const donorViewText = document.getElementById('donorViewBtnText');
  const donorSetupMessage = document.getElementById('donorSetupMessage');
  const donorEnrollment = document.getElementById('donorEnrollmentState');
  const donorDashboard = document.getElementById('donorDashboardState');

  let label = 'Patient';
  let icon = 'fa-hand-holding-medical';
  if (hasPatient && hasDonor) {
    label = 'Patient & Donor';
    icon = 'fa-user-group';
  } else if (hasDonor) {
    label = 'Donor';
    icon = 'fa-heart-pulse';
  }

  if (roleSummary) {
    roleSummary.classList.toggle('dual-role', hasPatient && hasDonor);
    roleSummary.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }
  if (headerRoleDisplay) headerRoleDisplay.textContent = label;
  if (portalRoleLabel) portalRoleLabel.textContent = `${label} Portal`;
  if (donorViewText) donorViewText.textContent = hasDonor ? 'Donor View' : 'Become a Donor';

  const overviewLoading = document.getElementById('accountOverviewLoading');
  if (overviewLoading) { overviewLoading.hidden = true; overviewLoading.style.display = 'none'; }
  const recipientOverview = document.getElementById('recipientOverviewState');
  if (recipientOverview) recipientOverview.hidden = hasDonor;
  sectionTitles.dashboard.title = hasDonor ? 'Donor Center' : 'Recipient Overview';
  const homeSection = document.getElementById('section-dashboard');
  const headerTitle = document.querySelector('.header-title h1');
  if (homeSection?.classList.contains('active') && headerTitle) {
    headerTitle.textContent = sectionTitles.dashboard.title;
  }
  if (donorEnrollment) donorEnrollment.hidden = hasDonor;
  if (donorDashboard) donorDashboard.hidden = !hasDonor;
  if (donorSetupMessage) {
    const setupError = !hasDonor ? String(profile?.donor_setup_error || '') : '';
    donorSetupMessage.hidden = !setupError;
    donorSetupMessage.textContent = setupError;
  }
}

async function openPatientView(destination = 'dashboard') {
  savePreferredDashboardView('patient');
  if (currentProfile?.has_patient_profile) {
    navigateToSection(destination);
    return;
  }

  showAccountRoleMessage('Activating patient features on this account...', 'info');

  try {
    const { error } = await activateMyPatientProfile({
      first_name: currentProfile?.first_name,
      middle_name: currentProfile?.middle_name,
      last_name: currentProfile?.last_name,
      blood_type: currentProfile?.blood_type || currentProfile?.blood_type_needed,
      phone: currentProfile?.phone || currentProfile?.contact_number,
      address: currentProfile?.address
    });
    if (error) {
      showAccountRoleMessage(error.message || 'Unable to activate patient features.', 'error');
      return;
    }

    const account = await getCurrentUser();
    if (!account?.profile) throw new Error('The updated account could not be loaded.');
    applyProfileToUI(account.profile);
    await loadRequests();
    initRequestsRealtime();
    showAccountRoleMessage('Patient features are now active on your existing account.', 'success');
    navigateToSection(destination);
  } catch (error) {
    showAccountRoleMessage(error?.message || 'Unable to activate patient features.', 'error');
  }
}

function openDonorView() {
  if (currentProfile?.has_donor_profile) {
    savePreferredDashboardView('donor');
    navigateToSection('donor');
    return;
  }
  window.location.href = 'donor_registration.html?return=account_dashboard.html%23section-donor';
}

function formatDonorStatus(value) {
  if (typeof getDonorLifecycleLabel === 'function') return getDonorLifecycleLabel(value);
  return String(value || 'registered')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getDonationStatusBadge(status) {
  const normalized = String(status || 'completed').toLowerCase();
  switch (normalized) {
    case 'completed':
      return '<span class="badge completed"><i class="fa-solid fa-circle-check"></i> Completed</span>';
    case 'pending':
      return '<span class="badge pending"><i class="fa-solid fa-clock"></i> Pending</span>';
    case 'failed':
      return '<span class="badge failed"><i class="fa-solid fa-circle-xmark"></i> Failed</span>';
    case 'cancelled':
      return '<span class="badge cancelled"><i class="fa-solid fa-ban"></i> Cancelled</span>';
    default:
      return `<span class="badge pending"><i class="fa-solid fa-circle-notch"></i> ${escapeHtml(normalized.charAt(0).toUpperCase() + normalized.slice(1))}</span>`;
  }
}

function renderDonorDashboard(data) {
  const donor = data?.donor;
  if (!donor) return;

  donorDashboardData = data;
  const status = String(donor.donor_status || 'registered').toLowerCase();
  const availability = String(donor.availability_status || 'unavailable').toLowerCase();
  const history = Array.isArray(data.donations) ? data.donations : [];

  // 1. Calculate Real Statistics from database records
  const totalCount = history.length;
  const completedList = history.filter((d) => String(d.status || 'completed').toLowerCase() === 'completed');
  const completedCount = completedList.length;
  const pendingCount = history.filter((d) => String(d.status || '').toLowerCase() === 'pending').length;
  const failedCount = history.filter((d) => String(d.status || '').toLowerCase() === 'failed').length;
  const cancelledCount = history.filter((d) => String(d.status || '').toLowerCase() === 'cancelled').length;

  // 2. Determine last donation date from completed records or donor profile
  let latestDonationDateStr = donor.last_donation_date || null;
  if (completedList.length > 0 && completedList[0].donation_date) {
    latestDonationDateStr = completedList[0].donation_date;
  }
  const lastDonation = latestDonationDateStr ? new Date(`${latestDonationDateStr}T00:00:00`) : null;
  const nextEligible = lastDonation ? new Date(lastDonation.getTime() + 56 * 24 * 60 * 60 * 1000) : null;

  // 3. Evaluate eligibility
  const eligibility = typeof isEligibleToCheckIn === 'function'
    ? isEligibleToCheckIn({ ...donor, last_donation_date: latestDonationDateStr })
    : { eligible: !latestDonationDateStr, daysRemaining: 0 };
  const medicallyDeferred = status === 'deferred';
  const eligible = eligibility.eligible && !medicallyDeferred;

  // 4. Update Summary Stat Cards
  const elStat = document.getElementById('donorEligibilityStat');
  const elSub = document.getElementById('donorEligibilitySub');
  const elCard = document.getElementById('donorEligibilityCard');
  if (elStat) elStat.textContent = medicallyDeferred ? 'Deferred' : (eligible ? 'Eligible' : 'Waiting');
  if (elCard) elCard.dataset.state = medicallyDeferred ? 'alert' : (eligible ? 'positive' : 'waiting');
  if (elSub) {
    elSub.textContent = medicallyDeferred
      ? (donor.deferred_reason || 'Staff clearance required')
      : (eligible ? 'Cleared for donor check-in' : `${eligibility.daysRemaining || 0} day(s) until eligible`);
  }

  const avStat = document.getElementById('donorAvailabilityStat');
  const avSub = document.getElementById('donorAvailabilitySub');
  const avCard = document.getElementById('donorAvailabilityCard');
  if (avStat) avStat.textContent = availability === 'available' ? 'Available' : 'Paused';
  if (avCard) avCard.dataset.state = availability === 'available' ? 'positive' : 'waiting';
  if (avSub) avSub.textContent = availability === 'available' ? 'Donor alerts are enabled' : 'Donor alerts are paused';

  const lastStat = document.getElementById('donorLastDonationStat');
  const lastSub = document.getElementById('donorLastDonationSub');
  const lastCard = document.getElementById('donorLastDonationCard');
  if (lastStat) {
    lastStat.textContent = lastDonation
      ? lastDonation.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'No history';
  }
  if (lastSub) {
    lastSub.textContent = completedCount > 0
      ? `${completedCount} completed donation${completedCount === 1 ? '' : 's'}`
      : 'No completed records';
  }
  if (lastCard) lastCard.dataset.state = lastDonation ? 'recorded' : 'neutral';

  const nextStat = document.getElementById('donorNextEligibleStat');
  const nextSub = document.getElementById('donorNextEligibleSub');
  const nextCard = document.getElementById('donorNextEligibleCard');
  if (nextStat) {
    nextStat.textContent = nextEligible
      ? nextEligible.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Now';
  }
  if (nextSub) nextSub.textContent = nextEligible ? 'After the 56-day recovery period' : 'Donation window is open';
  if (nextCard) nextCard.dataset.state = !nextEligible || eligible ? 'positive' : 'waiting';

  // 5. Update Activity Breakdown Summary Pills
  const statTotal = document.getElementById('statTotalDonations');
  const statCompleted = document.getElementById('statCompletedDonations');
  const statPending = document.getElementById('statPendingDonations');
  const statFailed = document.getElementById('statFailedDonations');
  const statCancelled = document.getElementById('statCancelledDonations');
  const countBadge = document.getElementById('donorHistoryCountBadge');

  if (statTotal) statTotal.textContent = String(totalCount);
  if (statCompleted) statCompleted.textContent = String(completedCount);
  if (statPending) statPending.textContent = String(pendingCount);
  if (statFailed) statFailed.textContent = String(failedCount);
  if (statCancelled) statCancelled.textContent = String(cancelledCount);
  if (countBadge) countBadge.textContent = `${totalCount} recorded`;

  // 6. Profile Info
  const bt = document.getElementById('donorBloodType');
  const pname = document.getElementById('donorProfileName');
  const pid = document.getElementById('donorProfileId');
  if (bt) bt.textContent = donor.blood_type || '--';
  if (pname) pname.textContent = formatPatientDisplayName(donor);
  if (pid) pid.textContent = `Donor ID ${donor.donor_id || '--'}`;

  const lifecycleBadge = document.getElementById('donorLifecycleBadge');
  if (lifecycleBadge) {
    lifecycleBadge.textContent = formatDonorStatus(status);
    lifecycleBadge.className = `badge ${typeof getDonorLifecycleBadgeClass === 'function' ? getDonorLifecycleBadgeClass(status) : status}`;
  }

  const availabilityToggle = document.getElementById('donorAvailabilityToggle');
  if (availabilityToggle) {
    const isAvailable = availability === 'available';
    availabilityToggle.setAttribute('aria-pressed', isAvailable ? 'true' : 'false');
    const label = availabilityToggle.querySelector('strong');
    if (label) label.textContent = isAvailable ? 'On' : 'Off';
    availabilityToggle.disabled = medicallyDeferred || (!eligible && !isAvailable);
  }

  const mapVisibilityToggle = document.getElementById('donorMapVisibilityToggle');
  if (mapVisibilityToggle) {
    const isMapVisible = donor.show_on_map === true;
    mapVisibilityToggle.setAttribute('aria-pressed', isMapVisible ? 'true' : 'false');
    const mapLabel = mapVisibilityToggle.querySelector('strong');
    if (mapLabel) mapLabel.textContent = isMapVisible ? 'On' : 'Off';
  }

  const avHelp = document.getElementById('donorAvailabilityHelp');
  if (avHelp) {
    avHelp.textContent = medicallyDeferred
      ? 'Availability is locked until staff clears the deferral.'
      : (!eligible && availability !== 'available'
        ? 'Availability unlocks after the 56-day waiting period.'
        : (['registered', 'checked_in', 'incomplete'].includes(status)
          ? 'Awaiting medical approval. On records your willingness, not eligibility.'
          : 'Receive donor appeals when you meet eligibility requirements.'));
  }
  const mapHelp = document.getElementById('donorMapPrivacyHelp');
  if (mapHelp) {
    mapHelp.textContent = getDonorMapVisibilityState(donor).reason + ' Permission alone does not make you visible.';
  }

  // 7. Render Rich Donation History List
  const historyElement = document.getElementById('donorDonationHistory');
  if (historyElement) {
    if (history.length === 0) {
      historyElement.innerHTML = `
        <div class="donor-empty-state">
          <i class="fa-solid fa-hand-holding-heart"></i>
          <p>No donations recorded yet.</p>
          <small>Your history will appear after staff records your donation.</small>
        </div>`;
    } else {
      historyElement.innerHTML = history.map((item) => {
        const itemBloodType = item.blood_type || donor.blood_type || '--';
        const itemUnits = Number(item.quantity) || 1;
        const itemStatus = String(item.status || 'completed').toLowerCase();
        const hasNotes = Boolean(item.notes && String(item.notes).trim() !== '');

        return `
          <article class="donor-activity-item status-${escapeHtml(itemStatus)}">
            <div class="donor-activity-icon ${escapeHtml(itemStatus)}">
              <i class="fa-solid fa-droplet" aria-hidden="true"></i>
            </div>
            <div class="donor-activity-main">
              <div class="donor-activity-headline">
                <strong>${escapeHtml(itemBloodType)} Donation (${formatNumber(itemUnits)} unit${itemUnits === 1 ? '' : 's'})</strong>
                ${getDonationStatusBadge(itemStatus)}
              </div>
              <div class="donor-activity-sub">
                <time datetime="${escapeHtml(item.donation_date || '')}">
                  <i class="fa-regular fa-calendar" aria-hidden="true"></i> ${formatDateShort(item.donation_date)}
                </time>
              </div>
              ${hasNotes ? `
                <div class="donation-reason-note">
                  <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                  <span>${escapeHtml(item.notes)}</span>
                </div>
              ` : ''}
            </div>
          </article>`;
      }).join('');
    }
  }

  // 8. Render Matching Requests
  const requestEligibility = getDonorRequestEligibility(donor);
  const matches = requestEligibility.eligible && Array.isArray(data.matching_requests) ? data.matching_requests : [];
  const matchCount = document.getElementById('donorMatchCount');
  if (matchCount) matchCount.textContent = `${matches.length} match${matches.length === 1 ? '' : 'es'}`;

  const matchElement = document.getElementById('donorMatchingRequests');
  if (matchElement) {
    matchElement.innerHTML = matches.length ? matches.map((request) => {
      const isReplacement = request.request_type === 'replacement';
      const urgency = String(request.urgency_level || 'normal').toLowerCase();
      return `<article class="request-card donor-match-card">
            <div class="request-type" aria-hidden="true">${isReplacement ? '<i class="fa-solid fa-rotate"></i>' : escapeHtml(request.blood_type_needed || '--')}</div>
            <div class="request-info">
              <strong>Request #${Number(request.request_id)}</strong>
              <span>${isReplacement
                ? `${formatNumber(request.quantity || 0)} replacement donor(s) · Any eligible blood type`
                : `${formatNumber(request.quantity || 0)} unit(s) of ${escapeHtml(request.blood_type_needed || '--')}`}</span>
            </div>
            <div class="request-meta">
              <div class="request-meta-details">
                ${isReplacement
                  ? '<span class="badge approved">Replacement</span>'
                  : `<span class="badge ${escapeHtml(urgency)}">${escapeHtml(urgency.charAt(0).toUpperCase() + urgency.slice(1))}</span>`}
                <small><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${formatDateShort(request.request_date)}</small>
              </div>
              <button type="button" class="btn-feed-details" onclick="viewMatchingRequest(${Number(request.request_id)}, this)">
                <span>View Request</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
              </button>
            </div>
          </article>`;
    }).join('') : `<p class="donor-empty-state">${escapeHtml(requestEligibility.eligible ? 'No open, verified requests you can help with right now.' : requestEligibility.reason)}</p>`;
  }
}

async function viewMatchingRequest(requestId, button) {
  if (button) button.disabled = true;
  const message = document.getElementById('donorDashboardMessage');
  try {
    const eligibility = getDonorRequestEligibility(donorDashboardData?.donor);
    if (!eligibility.eligible) throw new Error(eligibility.reason);
    const { data, error } = await listCommunityBloodRequests();
    if (error) throw error;
    const request = (data || []).find(item => Number(item.id) === Number(requestId));
    if (!request || request.verification_status !== 'verified' || getCommunityLifecycle(request).status !== 'active' || isMyOwnRequest(request)) {
      throw new Error('This request is no longer accepting responses. Refresh your donor requests.');
    }
    allCommunityRequests = (data || []).filter(item => item.verification_status === 'verified' && !isMyOwnRequest(item));
    openCommunityRequestDetails(request.id);
  } catch (error) {
    if (message) { message.textContent = error?.message || 'Unable to load request details.'; message.className = 'form-msg error'; }
  } finally {
    if (button) button.disabled = false;
  }
}
window.viewMatchingRequest = viewMatchingRequest;

async function loadDonorDashboard(force = false) {
  if (!currentProfile) return;
  const enrollment = document.getElementById('donorEnrollmentState');
  const dashboard = document.getElementById('donorDashboardState');
  if (!currentProfile?.has_donor_profile) {
    if (enrollment) enrollment.hidden = false;
    if (dashboard) dashboard.hidden = true;
    return;
  }

  if (enrollment) enrollment.hidden = true;
  if (dashboard) dashboard.hidden = false;
  if (donorDashboardLoading) return;
  if (donorDashboardData && !force) {
    renderDonorDashboard(donorDashboardData);
    return;
  }

  donorDashboardLoading = true;
  const historyElement = document.getElementById('donorDonationHistory');
  if (historyElement && (!donorDashboardData || force)) {
    historyElement.innerHTML = `
      <div class="skeleton-history-row"><span class="skeleton skeleton-circle" style="width:32px;height:32px;flex-shrink:0"></span><div style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="skeleton skeleton-text" style="width:55%"></span><span class="skeleton skeleton-text-sm" style="width:38%"></span></div></div>
      <div class="skeleton-history-row"><span class="skeleton skeleton-circle" style="width:32px;height:32px;flex-shrink:0"></span><div style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="skeleton skeleton-text" style="width:50%"></span><span class="skeleton skeleton-text-sm" style="width:33%"></span></div></div>`;
  }
  const matchElement = document.getElementById('donorMatchingRequests');
  if (matchElement && (!donorDashboardData || force)) {
    matchElement.innerHTML = `
      <div class="skeleton-request-card"><div class="skeleton-request-header"><span class="skeleton skeleton-circle" style="width:40px;height:40px"></span><div style="flex:1;display:flex;flex-direction:column;gap:7px"><span class="skeleton skeleton-text-lg" style="width:55%"></span><span class="skeleton skeleton-text" style="width:40%"></span></div></div><div class="skeleton-request-pills"><span class="skeleton skeleton-pill" style="width:60px;height:20px"></span><span class="skeleton skeleton-pill" style="width:80px;height:20px"></span></div><span class="skeleton skeleton-text" style="width:90%"></span></div>
      <div class="skeleton-request-card"><div class="skeleton-request-header"><span class="skeleton skeleton-circle" style="width:40px;height:40px"></span><div style="flex:1;display:flex;flex-direction:column;gap:7px"><span class="skeleton skeleton-text-lg" style="width:48%"></span><span class="skeleton skeleton-text" style="width:36%"></span></div></div><div class="skeleton-request-pills"><span class="skeleton skeleton-pill" style="width:56px;height:20px"></span><span class="skeleton skeleton-pill" style="width:74px;height:20px"></span></div><span class="skeleton skeleton-text" style="width:85%"></span></div>`;
  }

  const message = document.getElementById('donorDashboardMessage');
  if (message) {
    message.textContent = 'Loading your donor information...';
    message.className = 'form-msg info';
  }

  try {
    const { data, error } = await getMyDonorDashboardData();
    if (error) throw error;
    renderDonorDashboard(data);
    if (message) {
      message.textContent = '';
      message.className = 'form-msg';
    }
  } catch (error) {
    if (message) {
      message.textContent = error?.message || 'Unable to load donor information. Please try again.';
      message.className = 'form-msg error';
    }
    if (historyElement) {
      historyElement.innerHTML = `
        <div class="donor-empty-state error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>Failed to load donation history.</p>
          <button type="button" class="btn-sm btn-secondary" onclick="loadDonorDashboard(true)" style="margin-top:8px;cursor:pointer;">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
        </div>`;
    }
  } finally {
    donorDashboardLoading = false;
  }
}

async function toggleMyDonorAvailability() {
  const button = document.getElementById('donorAvailabilityToggle');
  const message = document.getElementById('donorDashboardMessage');
  const nextAvailable = button.getAttribute('aria-pressed') !== 'true';
  button.disabled = true;
  if (message) {
    message.textContent = 'Updating availability...';
    message.className = 'form-msg info';
  }

  try {
    const { data, error } = await setMyDonorAvailability(nextAvailable);
    if (error) throw error;
    donorDashboardData = { ...(donorDashboardData || {}), donor: data };
    renderDonorDashboard(donorDashboardData);
    if (currentProfile) currentProfile.donor_profile = data;
    if (message) {
      message.textContent = nextAvailable
        ? 'Availability preference saved. Donor appeals still depend on eligibility checks.'
        : 'Your donor availability is paused.';
      message.className = 'form-msg success';
    }
  } catch (error) {
    if (message) {
      message.textContent = error?.message || 'Unable to update availability.';
      message.className = 'form-msg error';
    }
  } finally {
    if (donorDashboardData?.donor) renderDonorDashboard(donorDashboardData);
    else button.disabled = false;
  }
}

async function toggleMyDonorMapVisibility() {
  const button = document.getElementById('donorMapVisibilityToggle');
  const message = document.getElementById('donorDashboardMessage');
  const nextVisible = button.getAttribute('aria-pressed') !== 'true';
  button.disabled = true;
  if (message) {
    message.textContent = 'Updating map privacy settings...';
    message.className = 'form-msg info';
  }

  try {
    const { data, error } = await setMyDonorMapVisibility(nextVisible);
    if (error) throw error;
    if (donorDashboardData?.donor) {
      donorDashboardData.donor = { ...donorDashboardData.donor, ...data };
    }
    renderDonorDashboard(donorDashboardData);
    if (currentProfile?.donor_profile) Object.assign(currentProfile.donor_profile, data);
    if (message) {
      message.textContent = nextVisible
        ? 'Map permission saved. ' + getDonorMapVisibilityState(donorDashboardData?.donor).reason
        : 'Your profile is now hidden from the Find Blood map.';
      message.className = 'form-msg success';
    }
  } catch (error) {
    if (message) {
      message.textContent = error?.message || 'Unable to update map privacy setting.';
      message.className = 'form-msg error';
    }
  } finally {
    button.disabled = false;
  }
}
window.toggleMyDonorMapVisibility = toggleMyDonorMapVisibility;
window.toggleMyDonorAvailability = toggleMyDonorAvailability;

function applyProfileToUI(profile) {
  if (!profile) return;

  currentProfile = profile;
  renderAccountRoleControls(profile);

  const profileSkeleton = document.getElementById('profileLoadingSkeleton');
  if (profileSkeleton) {
    profileSkeleton.hidden = true;
    profileSkeleton.style.display = 'none';
  }
  const profileSnap = document.getElementById('profileSnapContent');
  if (profileSnap) {
    profileSnap.hidden = false;
    profileSnap.style.display = '';
  }
  const compatSkeleton = document.getElementById('compatLoadingSkeleton');
  if (compatSkeleton) {
    compatSkeleton.hidden = true;
    compatSkeleton.style.display = 'none';
  }
  const compatContent = document.getElementById('compatContent');
  if (compatContent) {
    compatContent.hidden = false;
    compatContent.style.display = '';
  }
  const patientBloodType = (
    profile.blood_type ||
    profile.blood_type_needed ||
    profile.donor_profile?.blood_type ||
    profile.patient_profile?.blood_type_needed ||
    profile.patient_profile?.blood_type ||
    ''
  ).trim().toUpperCase().replace(/\s+/g, '');
  const patientPhone = profile.phone || profile.contact_number || '';
  const patientAddress = profile.address || '';
  const patientGender = profile.gender || '';
  const fullName = formatPatientDisplayName(profile);

  // Header
  const headerNameDisplay = document.getElementById('headerNameDisplay');
  if (headerNameDisplay) headerNameDisplay.textContent = fullName;

  const dropdownFullName = document.getElementById('dropdownFullName');
  if (dropdownFullName) dropdownFullName.textContent = fullName;

  const dropdownEmail = document.getElementById('dropdownEmail');
  if (dropdownEmail) dropdownEmail.textContent = profile.email;

  updateDashboardGreeting(profile);

  // Initials
  const initials = (profile.first_name?.[0] || '') + (profile.last_name?.[0] || '');
  const headerInitials = document.getElementById('headerInitials');
  if (headerInitials) headerInitials.textContent = initials.toUpperCase();
  const sidebarInitials = document.getElementById('sidebarInitials');
  if (sidebarInitials) sidebarInitials.textContent = initials.toUpperCase();
  const requestsQuickInitial = document.getElementById('requestsQuickInitial');
  if (requestsQuickInitial) requestsQuickInitial.textContent = (initials || 'U').toUpperCase();

  const avatarUrl = String(profile.avatar_url || getSavedProfilePhoto(profile)).trim();
  currentProfile.avatar_url = avatarUrl;
  if (headerInitials) {
    headerInitials.classList.toggle('has-photo', Boolean(avatarUrl));
    headerInitials.style.backgroundImage = avatarUrl ? `url("${avatarUrl}")` : '';
    if (!avatarUrl) headerInitials.textContent = initials.toUpperCase();
  }
  if (requestsQuickInitial) {
    const quickAvatarBox = document.getElementById('requestsQuickAvatar');
    if (quickAvatarBox) {
      if (avatarUrl) {
        quickAvatarBox.style.backgroundImage = `url("${avatarUrl}")`;
        quickAvatarBox.style.backgroundSize = 'cover';
        quickAvatarBox.style.backgroundPosition = 'center';
        requestsQuickInitial.textContent = '';
      } else {
        quickAvatarBox.style.backgroundImage = '';
        requestsQuickInitial.textContent = (initials || 'U').toUpperCase();
      }
    }
  }
  const profileAvatar = document.getElementById('profileInitials');
  if (profileAvatar) {
    profileAvatar.classList.toggle('has-photo', Boolean(avatarUrl));
    profileAvatar.style.backgroundImage = avatarUrl ? `url("${avatarUrl}")` : '';
    const avatarContent = profileAvatar.querySelector('.profile-avatar-content');
    if (avatarContent) avatarContent.textContent = initials.toUpperCase();
  }

  // Sidebar
  const sidebarName = document.getElementById('sidebarName');
  if (sidebarName) sidebarName.textContent = fullName;
  const sidebarEmail = document.getElementById('sidebarEmail');
  if (sidebarEmail) sidebarEmail.textContent = profile.email;

  // Profile card
  const profileNameEl = document.getElementById('profileName');
  if (profileNameEl) profileNameEl.textContent = fullName;
  const profileEmailEl = document.getElementById('profileEmail');
  if (profileEmailEl) profileEmailEl.textContent = profile.email;
  const profileBloodTypeEl = document.getElementById('profileBloodType');
  if (profileBloodTypeEl) profileBloodTypeEl.textContent = patientBloodType || '-';
  const profilePhoneEl = document.getElementById('profilePhone');
  if (profilePhoneEl) profilePhoneEl.textContent = patientPhone || '-';
  const profileGenderEl = document.getElementById('profileGender');
  if (profileGenderEl) {
    profileGenderEl.textContent = patientGender
      ? patientGender.charAt(0).toUpperCase() + patientGender.slice(1) : '-';
  }
  const profileAddressEl = document.getElementById('profileAddress');
  if (profileAddressEl) profileAddressEl.textContent = patientAddress || '-';
  const profileSinceEl = document.getElementById('profileSince');
  if (profileSinceEl) {
    profileSinceEl.textContent = profile.created_at
      ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '-';
  }

  // Blood type stat
  const statBloodType = document.getElementById('statBloodType');
  if (statBloodType) statBloodType.textContent = patientBloodType || '-';
  const statBloodType2 = document.getElementById('statBloodType2');
  if (statBloodType2) statBloodType2.textContent = patientBloodType || '-';


  // Blood compatibility - dashboard quick actions
  const section = document.getElementById('compatSection');
  const tags = document.getElementById('compatTags');
  if (section && tags) {
    if (patientBloodType && receiveFrom[patientBloodType]) {
      section.style.display = '';
      tags.innerHTML = receiveFrom[patientBloodType]
        .map(t => '<span class="compat-tag receive">' + t + '</span>')
        .join('');
    } else {
      section.style.display = 'none';
      tags.innerHTML = '';
    }
  }

  // Blood compatibility - profile section
  const profileBloodType2El = document.getElementById('profileBloodType2');
  if (profileBloodType2El) profileBloodType2El.textContent = patientBloodType || '-';
  const cs2 = document.getElementById('compatSection2');
  const ct2 = document.getElementById('compatTags2');
  const dt = document.getElementById('donateTo');
  const dtTags = document.getElementById('donateToTags');

  if (cs2 && ct2) {
    if (patientBloodType && receiveFrom[patientBloodType]) {
      cs2.style.display = '';
      ct2.innerHTML = receiveFrom[patientBloodType]
        .map(t => '<span class="compat-tag receive">' + t + '</span>')
        .join('');
    } else {
      cs2.style.display = 'none';
      ct2.innerHTML = '';
    }
  }

  if (dt && dtTags) {
    if (patientBloodType && donateTo[patientBloodType]) {
      dt.style.display = '';
      dtTags.innerHTML = donateTo[patientBloodType]
        .map(t => '<span class="compat-tag receive">' + t + '</span>')
        .join('');
    } else {
      dt.style.display = 'none';
      dtTags.innerHTML = '';
    }
  }
}

(async () => {
  const result = await requireAuth();
  if (!result) return;

  const { profile } = result;
  applyProfileToUI(profile);
  renderDonorTypeFilters();
  loadInAppNotifications();

  if (profile.has_patient_profile) {
    // Load requests and keep existing realtime status behavior for patients.
    loadRequests();
    initRequestsRealtime();
  } else {
    const patientOnlyMessage = '<p style="text-align:center;color:var(--slate-400);padding:24px 0;">Enable Patient View to submit and track blood requests with this account.</p>';
    const requestList = document.getElementById('requestList');
    const dashboardRequestList = document.getElementById('dashboardRequestList');
    if (requestList) requestList.innerHTML = patientOnlyMessage;
    if (dashboardRequestList) dashboardRequestList.innerHTML = patientOnlyMessage;
  }

  if (profile.has_donor_profile) loadDonorDashboard();
  // Load blood drives
  refreshBloodDrives();

  const currentSection = window.location.hash.replace('#section-', '');
  if (Object.prototype.hasOwnProperty.call(sectionTitles, currentSection)) {
    navigateToSection(currentSection);
  } else {
    navigateToSection('dashboard');
  }
})();

window.addEventListener('beforeunload', () => {
  if (requestSubscription && typeof requestSubscription.unsubscribe === 'function') {
    requestSubscription.unsubscribe();
  }
});


if (typeof attachPageRefreshListeners === 'function') {
  attachPageRefreshListeners({
    onRefresh: (info) => {
      refreshDashboardData(info);
    },
    debounceMs: 2500
  });
}


// ---- Profile Edit ----
function openProfileModal() {
  if (!currentProfile) return;
  if (!currentProfile.has_patient_profile) {
    showAccountRoleMessage('Enable Patient View before editing patient profile information.', 'info');
    openPatientView('profile');
    return;
  }

  const currentBloodType = (
    currentProfile.blood_type ||
    currentProfile.blood_type_needed ||
    currentProfile.donor_profile?.blood_type ||
    currentProfile.patient_profile?.blood_type_needed ||
    currentProfile.patient_profile?.blood_type ||
    ''
  ).trim().toUpperCase().replace(/\s+/g, '');
  const currentPhone = currentProfile.phone || currentProfile.contact_number || '';

  const fnInput = document.getElementById('profileFirstNameInput');
  if (fnInput) fnInput.value = currentProfile.first_name || '';
  const mnInput = document.getElementById('profileMiddleNameInput');
  if (mnInput) mnInput.value = currentProfile.middle_name || '';
  const lnInput = document.getElementById('profileLastNameInput');
  if (lnInput) lnInput.value = currentProfile.last_name || '';
  const btInput = document.getElementById('profileBloodTypeInput');
  if (btInput) btInput.value = currentBloodType;
  const genInput = document.getElementById('profileGenderInput');
  if (genInput) genInput.value = currentProfile.gender || '';
  const phInput = document.getElementById('profilePhoneInput');
  if (phInput) phInput.value = currentPhone;
  const addrInput = document.getElementById('profileAddressInput');
  if (addrInput) addrInput.value = currentProfile.address || '';
  pendingProfilePhoto = String(currentProfile.avatar_url || '');
  updateProfilePhotoPreview(pendingProfilePhoto);

  const msg = document.getElementById('profileMsg');
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
  const formEl = document.getElementById('profileForm');
  if (formEl) {
    formEl.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  }
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('active');
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('active');
}

function updateProfilePhotoPreview(photoUrl) {
  const preview = document.getElementById('profilePhotoPreview');
  const previewInitials = document.getElementById('profilePhotoPreviewInitials');
  const initials = ((currentProfile?.first_name?.[0] || '') + (currentProfile?.last_name?.[0] || '')).toUpperCase() || 'P';
  previewInitials.textContent = initials;
  preview.classList.toggle('has-photo', Boolean(photoUrl));
  preview.style.backgroundImage = photoUrl ? `url("${photoUrl}")` : '';
}

function prepareProfilePhoto(file) {
  const msg = quickProfilePhotoMode
    ? document.getElementById('profilePhotoQuickMsg')
    : document.getElementById('profileMsg');
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    msg.textContent = 'Please select an image file.';
    msg.className = 'form-msg error';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    msg.textContent = 'Please choose a photo smaller than 10 MB.';
    msg.className = 'form-msg error';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      pendingProfilePhoto = canvas.toDataURL('image/jpeg', .82);
      updateProfilePhotoPreview(pendingProfilePhoto);
      if (quickProfilePhotoMode) {
        try {
          saveProfilePhoto(currentProfile, pendingProfilePhoto);
          applyProfileToUI({ ...currentProfile, avatar_url: pendingProfilePhoto });
          closeProfilePhotoOptions();
          showProfileUpdateToast();
        } catch (error) {
          msg.textContent = error.message;
          msg.className = 'form-msg error';
        }
      } else {
        msg.textContent = 'Photo ready. Select Save Changes to apply it.';
        msg.className = 'form-msg info';
      }
    };
    image.onerror = () => {
      msg.textContent = 'That image could not be opened. Please try another photo.';
      msg.className = 'form-msg error';
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

document.getElementById('chooseProfilePhotoBtn').addEventListener('click', () => {
  quickProfilePhotoMode = false;
  document.getElementById('profilePhotoFileInput').click();
});
document.getElementById('takeProfilePhotoBtn').addEventListener('click', () => {
  quickProfilePhotoMode = false;
  document.getElementById('profilePhotoCameraInput').click();
});
['profilePhotoFileInput', 'profilePhotoCameraInput', 'quickProfilePhotoFileInput', 'quickProfilePhotoCameraInput'].forEach((inputId) => {
  document.getElementById(inputId).addEventListener('change', (event) => {
    prepareProfilePhoto(event.target.files?.[0]);
    event.target.value = '';
  });
});

function openProfilePhotoOptions() {
  if (!currentProfile) return;
  const msg = document.getElementById('profilePhotoQuickMsg');
  msg.textContent = '';
  msg.className = 'form-msg';
  document.getElementById('profilePhotoModal').classList.add('active');
}

function closeProfilePhotoOptions() {
  document.getElementById('profilePhotoModal').classList.remove('active');
  quickProfilePhotoMode = false;
}

document.getElementById('profileInitials').addEventListener('click', openProfilePhotoOptions);
document.getElementById('closeProfilePhotoModal').addEventListener('click', closeProfilePhotoOptions);
document.getElementById('cancelProfilePhotoBtn').addEventListener('click', closeProfilePhotoOptions);
document.getElementById('avatarChoosePhotoBtn').addEventListener('click', () => {
  quickProfilePhotoMode = true;
  document.getElementById('quickProfilePhotoFileInput').click();
});
document.getElementById('avatarTakePhotoBtn').addEventListener('click', () => {
  quickProfilePhotoMode = true;
  document.getElementById('quickProfilePhotoCameraInput').click();
});
document.getElementById('profilePhotoModal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeProfilePhotoOptions();
});

// ---- Logout ----
const sidebarLogoutBtn = document.getElementById('logoutBtn');
if (sidebarLogoutBtn) {
  sidebarLogoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openLogoutModal(e);
  });
}

// ---- Blood Requests & Community Feed State ----
let allCommunityRequests = [];
let activeRequestsTab = 'community';
let activeCommunityFilter = 'all';
let activeMyFilter = 'all';
let selectedCommunityRequest = null;
let communityDetailScrollPosition = 0;
let ignoredCommunityIds = new Set();
try {
  ignoredCommunityIds = new Set(JSON.parse(sessionStorage.getItem('veindrop_ignored_requests') || '[]'));
} catch (_) { }

function syncRequestTypeFields() {
  const requestType = document.getElementById('requestType')?.value || '';
  const isReplacement = requestType === 'replacement';
  const bloodTypeGroup = document.getElementById('requestBloodTypeGroup');
  const bloodType = document.getElementById('requestBloodType');
  const urgencyGroup = document.getElementById('requestUrgencyGroup');
  const urgency = document.getElementById('requestUrgency');
  const requirementsNote = document.getElementById('replacementRequirementsNote');
  const requirementsLegend = document.getElementById('requestRequirementsLegend');
  const unitsLabel = document.getElementById('requestUnitsLabel');

  if (bloodTypeGroup) bloodTypeGroup.hidden = isReplacement;
  if (bloodType) {
    bloodType.disabled = isReplacement;
    bloodType.required = !isReplacement;
    if (isReplacement) bloodType.value = '';
  }
  if (urgencyGroup) urgencyGroup.hidden = isReplacement;
  if (urgency) { urgency.disabled = isReplacement; urgency.required = !isReplacement; if (isReplacement) urgency.value = 'normal'; }
  if (requirementsNote) requirementsNote.hidden = !isReplacement;
  if (requirementsLegend) requirementsLegend.textContent = isReplacement ? '2. Replacement details' : '2. Blood requirements';
  if (unitsLabel) unitsLabel.textContent = isReplacement ? 'Replacement units needed' : 'Units needed';
  document.getElementById('requestBloodRequirementsRow')?.classList.toggle('request-single-field', isReplacement);
  document.getElementById('requestTimingRow')?.classList.toggle('request-single-field', isReplacement);
}

document.getElementById('requestType')?.addEventListener('change', syncRequestTypeFields);

function openRequestModal() {
  if (!requestSubmissionPending) {
    const form = document.getElementById('requestForm');
    delete form.dataset.requestSaved;
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = false; button.textContent = 'Submit Request'; }
  }
  if (typeof syncRequestTypeFields === 'function') syncRequestTypeFields();
  document.getElementById('requestModal').classList.add('active');
}
function closeRequestModal() {
  document.getElementById('requestModal').classList.remove('active');
  document.getElementById('requestForm').reset();
  if (typeof syncRequestTypeFields === 'function') syncRequestTypeFields();
  syncRequestDocumentLabel();
  document.getElementById('requestMsg').textContent = '';
  document.getElementById('requestMsg').className = 'form-msg';
}

function syncRequestDocumentLabel() {
  const input = document.getElementById('requestSupportingDocument');
  const name = document.getElementById('requestDocumentName');
  const picker = document.getElementById('requestDocumentPicker');
  if (!input || !name || !picker) return;

  const selectedFile = input.files?.[0];
  name.textContent = selectedFile?.name || 'No document attached';
  picker.classList.toggle('has-file', Boolean(selectedFile));
}

document.getElementById('requestSupportingDocument')?.addEventListener('change', syncRequestDocumentLabel);


function switchRequestsTab(tab) {
  activeRequestsTab = tab;
  const tabCommunityBtn = document.getElementById('tabCommunityRequests');
  const tabMyBtn = document.getElementById('tabMyRequests');
  const communityContent = document.getElementById('communityRequestsTabContent');
  const myContent = document.getElementById('myRequestsTabContent');

  if (tab === 'community') {
    tabCommunityBtn?.classList.add('active');
    tabCommunityBtn?.setAttribute('aria-selected', 'true');
    tabMyBtn?.classList.remove('active');
    tabMyBtn?.setAttribute('aria-selected', 'false');
    if (communityContent) { communityContent.hidden = false; communityContent.classList.add('active'); }
    if (myContent) { myContent.hidden = true; myContent.classList.remove('active'); }
    applyCommunityFilter();
  } else {
    tabMyBtn?.classList.add('active');
    tabMyBtn?.setAttribute('aria-selected', 'true');
    tabCommunityBtn?.classList.remove('active');
    tabCommunityBtn?.setAttribute('aria-selected', 'false');
    if (myContent) { myContent.hidden = false; myContent.classList.add('active'); }
    if (communityContent) { communityContent.hidden = true; communityContent.classList.remove('active'); }
    applyRequestFilter();
  }
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'Recently';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${timeStr}, ${dateStr}`;
}

function getCommunityLifecycle(r) {
  const status = String(r?.community_status || r?.status || 'active').toLowerCase();
  const states = {
    active: { status: 'active', label: 'Active' },
    covered: { status: 'covered', label: 'Pledged / Covered' },
    fulfilled: { status: 'fulfilled', label: 'Completed / Fulfilled' },
    expired: { status: 'expired', label: 'Expired' }
  };
  return states[status] || states.active;
}

function getRequestProgressTone(current, target) {
  const required = Math.max(1, Number(target) || 1);
  return Number(current || 0) >= required ? 'progress-complete' : 'progress-incomplete';
}

function renderCommunityCard(r) {
  const isReplacement = r.request_type === 'replacement';
  const isUrgent = !isReplacement && (String(r.urgency || '').toLowerCase() === 'urgent' || String(r.urgency || '').toLowerCase() === 'critical');
  const bloodTypeStr = escapeHtml(r.blood_type || 'O+');
  const units = Number(r.units_needed || 1);
  const donationPoint = escapeHtml(r.donation_point || r.hospital || 'General Hospital Blood Bank');
  const postedTime = formatTimeAgo(r.created_at);
  const description = escapeHtml(r.notes || 'Patient requires urgent blood transfusion support.');
  const reqId = r.id;
  const timeDateDisplay = escapeHtml(r.needed_time || (isUrgent ? 'As soon as possible' : 'Within 24-48 Hours'));
  const lifecycle = getCommunityLifecycle(r);
  const communityStateBadge = '<span class="feed-status-pill ' + lifecycle.status + '" style="margin-left:0;">' + lifecycle.label + '</span>';
  const requestTypeBadge = r.request_type === 'replacement'
    ? '<span class="request-arrangement-text">Blood Replacement</span>'
    : (r.request_type === 'emergency_donor'
      ? '<span class="request-arrangement-text">Emergency Donor Assistance</span>'
      : '');
  const campaign = r.replacement_campaign || {};
  const replacementTarget = Number(campaign.target_units || units);
  const replacementPledged = Number(campaign.pledged_units || 0);
  const replacementConfirmed = Number(campaign.confirmed_units || 0);
  const progressText = isReplacement
    ? `${Number(campaign.pledged_units || 0)}/${Number(campaign.target_units || units)} donors pledged · ${Number(campaign.confirmed_units || 0)}/${Number(campaign.target_units || units)} units confirmed`
    : '';

  return `
        <article class="feed-request-card" id="feedCard-${reqId}" data-request-id="${reqId}">
          <div class="feed-card-header">
            <div class="feed-requester-info">
              <div class="feed-requester-avatar" style="background:#fee2e2; color:#991b1b; display:flex; align-items:center; justify-content:center; font-weight:700;">
                <i class="fa-solid fa-droplet" aria-hidden="true"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div class="request-card-heading">
                <h4 class="feed-requester-name" style="font-size:1.02rem; font-weight:700; color:#1e293b; margin:0 0 2px;">
                  Request #${reqId}
                </h4>
                ${communityStateBadge}
                </div>
                ${requestTypeBadge}
                <span class="feed-post-time"><i class="fa-regular fa-clock"></i> Posted on ${postedTime}</span>
              </div>
            </div>
          </div>

          <div class="feed-inner-box">
            <div class="feed-requirement-row">
              <div class="feed-blood-badge-wrap">
                <div class="feed-blood-droplet" aria-hidden="true">
                  <i class="fa-solid fa-droplet"></i>
                </div>
                <div>
                  <span class="feed-looking-label">${isReplacement ? 'REPLACEMENT DONORS NEEDED' : 'LOOKING FOR'}</span>
                  <h3 class="feed-blood-title">${isReplacement
                    ? `${units} replacement donor${units !== 1 ? 's' : ''} · Any eligible blood type`
                    : `${units} unit${units !== 1 ? 's' : ''} of ${bloodTypeStr} blood`}</h3>
                </div>
              </div>
              ${isUrgent ? `<span class="feed-urgent-badge"><i class="fa-solid fa-triangle-exclamation"></i> URGENT</span>` : ''}
            </div>

            <div class="feed-info-grid">
              <div class="feed-info-col">
                <span class="feed-info-label"><i class="fa-solid fa-location-dot"></i> Donation point</span>
                <p class="feed-info-val">${donationPoint}</p>
              </div>
              <div class="feed-info-col">
                <span class="feed-info-label"><i class="fa-regular fa-calendar-days"></i> Needed by</span>
                <p class="feed-info-val">${timeDateDisplay}</p>
              </div>
            </div>

            <div class="feed-desc-section">
              <span class="feed-desc-label">Reason for request</span>
              <p class="feed-desc-text">${description}</p>
              ${isReplacement ? `<div class="request-progress-summary"><span class="${getRequestProgressTone(replacementPledged, replacementTarget)}"><strong>${replacementPledged}/${replacementTarget}</strong> donors pledged</span><span class="${getRequestProgressTone(replacementConfirmed, replacementTarget)}"><strong>${replacementConfirmed}/${replacementTarget}</strong> units confirmed</span></div>` : ''}
            </div>
          </div>

          <div class="feed-actions-row">
            ${activeCommunityFilter === 'hidden'
      ? `<button type="button" class="btn-feed-ignore" onclick="unhideFeedCard('${reqId}')"><i class="fa-solid fa-eye"></i> Unhide</button>`
      : `<button type="button" class="btn-feed-ignore" onclick="hideFeedCard('${reqId}')">Hide</button>`
    }
            <button type="button" class="btn-feed-details" onclick="openCommunityRequestDetails('${reqId}')">View Details</button>
          </div>
        </article>
      `;
}

function hideFeedCard(reqId) {
  const card = document.getElementById(`feedCard-${reqId}`) || document.getElementById(`myReqCard-${reqId}`);
  if (card) {
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95) translateY(10px)';
    setTimeout(() => {
      ignoredCommunityIds.add(String(reqId));
      try {
        sessionStorage.setItem('veindrop_ignored_requests', JSON.stringify(Array.from(ignoredCommunityIds)));
      } catch (_) { }
      applyCommunityFilter();
      if (typeof applyRequestFilter === 'function') applyRequestFilter();
      showToastWithAction('Request hidden from feed.', 'Undo', () => {
        unhideFeedCard(reqId);
      });
    }, 300);
  } else {
    ignoredCommunityIds.add(String(reqId));
    try {
      sessionStorage.setItem('veindrop_ignored_requests', JSON.stringify(Array.from(ignoredCommunityIds)));
    } catch (_) { }
    applyCommunityFilter();
    if (typeof applyRequestFilter === 'function') applyRequestFilter();
  }
}

function unhideFeedCard(reqId) {
  ignoredCommunityIds.delete(String(reqId));
  try {
    sessionStorage.setItem('veindrop_ignored_requests', JSON.stringify(Array.from(ignoredCommunityIds)));
  } catch (_) { }
  applyCommunityFilter();
  if (typeof applyRequestFilter === 'function') applyRequestFilter();
  showToast('Request restored to feed.');
}

window.hideFeedCard = hideFeedCard;
window.unhideFeedCard = unhideFeedCard;

function openCommunityRequestDetails(reqId) {
  const req = allCommunityRequests.find(r => String(r.id) === String(reqId)) ||
    (Array.isArray(allRequests) ? allRequests.find(r => String(r.id || r.request_id) === String(reqId)) : null);
  if (!req) return;
  selectedCommunityRequest = req;

  const modal = document.getElementById('communityRequestDetailModal');
  const body = document.getElementById('communityRequestDetailBody');
  const isReplacement = req.request_type === 'replacement';
  const isUrgent = !isReplacement && (String(req.urgency || '').toLowerCase() === 'urgent' || String(req.urgency || '').toLowerCase() === 'critical');
  const bloodType = escapeHtml(req.blood_type || req.blood_type_needed || 'O+');
  const units = Number(req.units_needed || req.quantity || 1);
  const hospital = escapeHtml(req.donation_point || req.hospital || req.hospital_name || 'Blood Bank Center');
  const description = escapeHtml(req.notes || req.note || 'Emergency blood transfusion required.');
  const contact = escapeHtml(req.patient_phone || 'Available via Hospital Blood Coordinator');
  const timeDateDisplay = escapeHtml(req.needed_time || (isUrgent ? 'As soon as possible' : 'Within 24-48 Hours'));
  const lifecycle = getCommunityLifecycle(req);
  const ownRequest = isMyOwnRequest(req);
  const donor = donorDashboardData?.donor || currentProfile?.donor_profile || null;
  const donorEligibility = getDonorRequestEligibility(donor);
  const donorBloodType = String(donor?.blood_type || '').trim().toUpperCase().replace(/\s+/g, '');
  const requestedBloodType = String(req.blood_type || req.blood_type_needed || '').trim().toUpperCase().replace(/\s+/g, '');
  const bloodCompatible = isReplacement || Boolean(
    donorBloodType && requestedBloodType && receiveFrom[requestedBloodType]?.includes(donorBloodType)
  );
  const campaign = req.replacement_campaign || {};
  const targetUnits = Number(campaign.target_units || units);
  const pledgedUnits = Number(campaign.pledged_units || 0);
  const confirmedUnits = Number(campaign.confirmed_units || 0);
  const guidanceByStatus = {
    active: ownRequest
      ? (isReplacement
        ? 'Your request stays active and accepts donor pledges until all required replacement units are confirmed, or you cancel it. The Blood Donation Coordinator records verified donations.'
        : 'Your request is live on the community feed and accepting donor responses. You cannot respond to your own request.')
      : (isReplacement
        ? 'This replacement campaign stays active until the required units are confirmed. Tap respond below if you can help replace blood used for the patient.'
        : 'As a registered blood donor, your donation can directly save this recipient. Tap respond below to pledge your support.'),
    covered: isReplacement
      ? 'The pledge target has been reached, so new responses are paused. The request remains open until the Blood Donation Coordinator confirms all replacement units.'
      : 'Enough donors have pledged to help. This request is no longer accepting responses.',
    fulfilled: isReplacement
      ? 'The Blood Donation Coordinator confirmed all required replacement units. This campaign is complete.'
      : 'The recipient confirmed that blood was received. This request is closed.',
    expired: 'This request expired and has been archived from the community feed.'
  };
  let responseGuidance = guidanceByStatus[lifecycle.status];
  if (!ownRequest && lifecycle.status === 'active' && !donor?.donor_id) {
    responseGuidance = 'Enable Donor View and complete your donor profile before responding.';
  } else if (!ownRequest && lifecycle.status === 'active' && !donorEligibility.eligible) {
    responseGuidance = donorEligibility.reason;
  } else if (!ownRequest && lifecycle.status === 'active' && !bloodCompatible) {
    responseGuidance = `Your ${donorBloodType || 'registered'} blood type cannot donate red cells to a ${requestedBloodType} recipient.`;
  }
  const emergencyPledges = Array.isArray(req.pledges) ? req.pledges : [];
  const activeEmergencyPledgeUnits = emergencyPledges
    .filter((pledge) => ['pledged', 'request_fulfilled', 'recipient_confirmed'].includes(String(pledge.status).toLowerCase()))
    .reduce((total, pledge) => total + Number(pledge.units_pledged || 1), 0);
  const progressSummary = isReplacement
    ? `<div class="community-detail-progress" aria-label="Replacement donation progress">
        <div class="community-progress-card community-progress-card--pledged ${getRequestProgressTone(pledgedUnits, targetUnits)}">
          <span><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> Donor pledges</span>
          <strong>${pledgedUnits}/${targetUnits} unit${targetUnits !== 1 ? 's' : ''} pledged</strong>
        </div>
        <div class="community-progress-card community-progress-card--confirmed ${getRequestProgressTone(confirmedUnits, targetUnits)}">
          <span><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Facility-confirmed donations</span>
          <strong>${confirmedUnits}/${targetUnits} unit${targetUnits !== 1 ? 's' : ''} confirmed</strong>
        </div>
      </div>`
    : req.request_type === 'emergency_donor' && ownRequest
      ? `<div class="community-detail-progress" aria-label="Emergency donor pledge progress">
          <div class="community-progress-card community-progress-card--pledged ${getRequestProgressTone(activeEmergencyPledgeUnits, units)}">
            <span><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> ${lifecycle.status === 'fulfilled' ? 'Recorded donor pledges' : 'Active donor pledges'}</span>
            <strong>${activeEmergencyPledgeUnits}/${units} donor${activeEmergencyPledgeUnits === 1 ? '' : 's'} pledged</strong>
          </div>
        </div>`
      : '';
  const verificationSupport = ownRequest ? req.verification_support : null;
  const requesterVerificationLabels = {
    uploaded_document: 'Supporting document reviewed',
    physical_document: 'Physical document reviewed in person',
    facility_confirmation: 'Confirmed with facility representative',
    other: 'Other documented verification'
  };
  const privateSupportSummary = verificationSupport
    ? `<section class="patient-private-support">
        <strong class="patient-private-support__title"><i class="fa-solid fa-lock" aria-hidden="true"></i> Private verification support</strong>
        <div class="patient-private-support__details">
          <div class="patient-private-support__item"><span>Facility contact</span><b>${escapeHtml(verificationSupport.facility_contact || 'Not provided')}</b></div>
          <div class="patient-private-support__item"><span>Coordinator verification</span><b>${escapeHtml(verificationSupport.verification_method ? (requesterVerificationLabels[verificationSupport.verification_method] || 'Verified') : 'Pending')}</b></div>
          ${verificationSupport.verification_note ? `<div class="patient-private-support__item patient-private-support__item--wide"><span>Verification note</span><b>${escapeHtml(verificationSupport.verification_note)}</b></div>` : ''}
        </div>
        ${verificationSupport.storage_path
          ? `<a id="patientRequestDocumentLink" href="#" aria-disabled="true"><i class="fa-solid fa-paperclip" aria-hidden="true"></i> Preparing ${escapeHtml(verificationSupport.file_name || 'supporting document')}...</a>`
          : '<span class="patient-private-support__document-state">No supporting document attached.</span>'}
      </section>`
    : '';
  const donorSupportSummary = ownRequest
    ? `<section class="requester-donor-support" aria-labelledby="requesterDonorSupportTitle">
        <strong id="requesterDonorSupportTitle"><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> Donor support preferences</strong>
        <p id="requesterDonorSupportContent">Loading donor preferences...</p>
      </section>`
    : '';
  const pledgeStatusLabels = {
    pledged: 'Active pledge',
    request_fulfilled: 'Request fulfilled',
    recipient_confirmed: 'Receipt confirmed',
    unable_to_donate: 'Unable to donate',
    cancelled: 'Cancelled'
  };
  const requesterPledgeList = ownRequest && ['emergency_donor', 'replacement'].includes(req.request_type)
    ? `<section class="requester-donor-support" aria-labelledby="requesterPledgeListTitle">
        <strong id="requesterPledgeListTitle"><i class="fa-solid fa-users" aria-hidden="true"></i> Donors who pledged</strong>
        ${emergencyPledges.length
          ? emergencyPledges.map((pledge) => `<span class="requester-donor-support__pledge"><span><b>${escapeHtml(pledge.donor_name || 'Registered donor')}</b> · ${escapeHtml(pledge.blood_type || 'Blood type unavailable')} · ${escapeHtml(pledgeStatusLabels[String(pledge.status).toLowerCase()] || pledge.status || 'Pledged')}<br><small>Pledged ${escapeHtml(formatDateShort(pledge.pledged_at))}</small></span>${String(pledge.status).toLowerCase() === 'pledged' ? `<button type="button" class="request-pledge-unsuccessful" onclick="openPledgeUnsuccessfulModal(${Number(req.id || req.request_id)}, ${Number(pledge.pledge_id)})"><i class="fa-solid fa-user-xmark" aria-hidden="true"></i> Did not complete</button>` : ''}</span>`).join('')
          : '<p>No donors have pledged yet.</p>'}
      </section>`
    : '';

  body.innerHTML = `
        <div class="community-detail-info-card">
          <div class="community-detail-item">
            <span class="label"><i class="fa-solid fa-file-waveform"></i> Request</span>
            <span class="val">Request #${req.id || req.request_id}</span>
          </div>
          <div class="community-detail-item community-detail-need">
            <span class="label"><i class="fa-solid ${isReplacement ? 'fa-rotate' : 'fa-droplet'}"></i> ${isReplacement ? 'Replacement Needed' : 'Blood Needed'}</span>
            <span class="val">${isReplacement
              ? `${units} replacement donor${units !== 1 ? 's' : ''} · Any eligible blood type`
              : `${units} Unit${units !== 1 ? 's' : ''} (${bloodType})`}</span>
          </div>
          ${isReplacement ? '' : `<div class="community-detail-item">
            <span class="label"><i class="fa-solid fa-shield-heart"></i> Urgency</span>
            <span class="val">${isUrgent ? '<span class="feed-urgent-badge"><i class="fa-solid fa-triangle-exclamation"></i> URGENT</span>' : 'Standard Routine'}</span>
          </div>`}
          <div class="community-detail-item">
            <span class="label"><i class="fa-solid fa-hospital"></i> Donation Point</span>
            <span class="val">${hospital}</span>
          </div>
          <div class="community-detail-item">
            <span class="label"><i class="fa-regular fa-calendar-days"></i> Time &amp; Date Needed</span>
            <span class="val">${timeDateDisplay}</span>
          </div>
          <div class="community-detail-item">
            <span class="label"><i class="fa-solid fa-phone"></i> Contact</span>
            <span class="val">${contact}</span>
          </div>
        </div>
        <section class="community-detail-description" aria-labelledby="communityDetailDescriptionTitle">
          <h4 id="communityDetailDescriptionTitle"><i class="fa-regular fa-clipboard" aria-hidden="true"></i> Reason / Problem Description</h4>
          <p>
            ${description}
          </p>
        </section>
        ${progressSummary}
        ${requesterPledgeList}
        ${privateSupportSummary}
        ${donorSupportSummary}
        <div class="community-response-guidance community-response-guidance--${lifecycle.status}">
          <i class="fa-solid fa-circle-info" style="margin-top:2px;"></i>
          <span>${responseGuidance}</span>
        </div>
      `;

  const pledgeButton = document.getElementById('btnPledgeHelp');
  const canRespond = !ownRequest
    && lifecycle.status === 'active'
    && Boolean(donor?.donor_id)
    && donorEligibility.eligible
    && bloodCompatible;
  if (pledgeButton) {
    pledgeButton.hidden = !canRespond;
    pledgeButton.style.display = canRespond ? '' : 'none';
    pledgeButton.disabled = !canRespond;
    pledgeButton.innerHTML = '<i class="fa-solid fa-heart-pulse"></i> Respond / Offer Blood Donation';
  }
  modal?.classList.add('active');
  if (!document.body.classList.contains('community-detail-open')) {
    communityDetailScrollPosition = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${communityDetailScrollPosition}px`;
    document.body.classList.add('community-detail-open');
  }
  if (verificationSupport?.storage_path) preparePatientRequestDocument(verificationSupport);
  if (ownRequest) loadRequesterDonorSupportPreferences(req.id || req.request_id);
}

const donorSupportPreferenceLabels = {
  meals: 'Meals and packed snacks',
  travel: 'Travel allowance',
  allowance: 'Donor allowance / token',
  screening: 'Medical and blood screening'
};

async function loadRequesterDonorSupportPreferences(requestId) {
  const target = document.getElementById('requesterDonorSupportContent');
  if (!target || typeof getMyRequestSupportPreferences !== 'function') return;

  const { data, error } = await getMyRequestSupportPreferences(requestId);
  if (!document.body.contains(target)) return;
  if (error) {
    target.textContent = 'Donor support preferences are temporarily unavailable.';
    return;
  }

  const pledges = data || [];
  if (!pledges.length) {
    target.textContent = 'No support preferences were recorded for the current pledge(s).';
    return;
  }

  target.innerHTML = pledges.map((pledge) => {
    const choices = (Array.isArray(pledge.support_preferences) ? pledge.support_preferences : [])
      .map((choice) => donorSupportPreferenceLabels[choice])
      .filter(Boolean)
      .map(escapeHtml)
      .join(', ');
    return choices
      ? `<span class="requester-donor-support__pledge"><b>${escapeHtml(pledge.donor_name || 'A donor')}</b> requested: ${choices}</span>`
      : '<span class="requester-donor-support__pledge">The donor did not select any support preferences.</span>';
  }).join('');
}

async function preparePatientRequestDocument(support) {
  const link = document.getElementById('patientRequestDocumentLink');
  if (!link || typeof createRequestDocumentSignedUrl !== 'function') return;
  const { data, error } = await createRequestDocumentSignedUrl(support.storage_path);
  if (!document.body.contains(link)) return;
  if (error || !data?.signedUrl) {
    link.textContent = 'Document temporarily unavailable';
    link.setAttribute('aria-disabled', 'true');
    return;
  }
  link.href = data.signedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.removeAttribute('aria-disabled');
  link.innerHTML = `<i class="fa-solid fa-paperclip" aria-hidden="true"></i> View ${escapeHtml(support.file_name || 'supporting document')}`;
}

function closeCommunityRequestDetailModal() {
  closePledgeUnsuccessfulModal();
  document.getElementById('communityRequestDetailModal')?.classList.remove('active');
  if (document.body.classList.contains('community-detail-open')) {
    document.body.classList.remove('community-detail-open');
    document.body.style.top = '';
    window.scrollTo(0, communityDetailScrollPosition);
  }
  selectedCommunityRequest = null;
}

function handlePledgeHelp() {
  if (!selectedCommunityRequest) return;
  const req = selectedCommunityRequest;
  if (isMyOwnRequest(req)) {
    showToast('You cannot respond to your own blood request.');
    return;
  }
  if (getCommunityLifecycle(req).status !== 'active') {
    showToast('This request is no longer accepting donor responses.');
    return;
  }
  closeCommunityRequestDetailModal();

  try {
    sessionStorage.setItem('veindrop_pledge_request', JSON.stringify(req));
  } catch (e) {
    console.warn('Could not store pledge request in session:', e);
  }

  const reqId = encodeURIComponent(req.id || '');
  window.location.href = `donor_pledge_details.html?id=${reqId}`;
}


function isMyOwnRequest(r) {
  if (!r) return false;
  const myIds = new Set(
    (Array.isArray(allRequests) ? allRequests : [])
      .map(x => String(x.id || x.request_id))
      .filter(Boolean)
  );
  const reqId = String(r.id || r.request_id || '');
  if (reqId && myIds.has(reqId)) return true;

  const currentPatientId = currentProfile?.patient_id || currentProfile?.id;
  if (currentPatientId && String(r.patient_id) === String(currentPatientId)) return true;

  const currentUserId = currentProfile?.user_id;
  if (currentUserId && String(r.user_id) === String(currentUserId)) return true;

  return false;
}

function applyCommunityFilter() {
  const feed = document.getElementById('communityRequestFeed');
  if (!feed) return;

  const hiddenCountEl = document.getElementById('hiddenCount');
  if (hiddenCountEl) hiddenCountEl.textContent = ignoredCommunityIds.size;

  // Filter out own requests from the public community feed
  const liveRequests = allCommunityRequests.filter(r => ['active', 'covered'].includes(getCommunityLifecycle(r).status));
  const othersRequests = liveRequests.filter(r => !isMyOwnRequest(r));

  if (activeCommunityFilter === 'hidden') {
    const hiddenList = othersRequests.filter(r => ignoredCommunityIds.has(String(r.id)));
    const countEl = document.getElementById('communityCount');
    if (countEl) countEl.textContent = othersRequests.filter(r => !ignoredCommunityIds.has(String(r.id))).length;

    if (!hiddenList.length) {
      feed.innerHTML = `
            <div style="text-align:center; padding:48px 16px; background:#fff; border-radius:18px; border:1px solid rgba(0,0,0,0.06);">
              <i class="fa-solid fa-eye-slash" style="font-size:2.8rem; color:#800000; opacity:0.3; margin-bottom:12px;"></i>
              <h3 style="font-size:1.1rem; color:var(--slate-800); margin-bottom:6px;">No hidden requests</h3>
              <p style="color:var(--slate-500); font-size:0.88rem; max-width:320px; margin:0 auto;">You have not hidden any community requests.</p>
            </div>
          `;
      return;
    }

    feed.innerHTML = hiddenList.map(renderCommunityCard).join('');
    return;
  }

  const visible = othersRequests.filter(r => !ignoredCommunityIds.has(String(r.id)));
  const filtered = visible.filter(r => {
    if (activeCommunityFilter === 'urgent') {
      return String(r.urgency || '').toLowerCase() === 'urgent' || String(r.urgency || '').toLowerCase() === 'critical';
    }
    if (activeCommunityFilter !== 'all') {
      return r.request_type === 'replacement'
        || normalizeBloodType(r.blood_type) === normalizeBloodType(activeCommunityFilter);
    }
    return true;
  });

  const countEl = document.getElementById('communityCount');
  if (countEl) countEl.textContent = visible.length;

  if (!filtered.length) {
    feed.innerHTML = `
          <div style="text-align:center; padding:48px 16px; background:#fff; border-radius:18px; border:1px solid rgba(0,0,0,0.06);">
            <i class="fa-solid fa-heart-circle-check" style="font-size:2.8rem; color:#800000; opacity:0.3; margin-bottom:12px;"></i>
            <h3 style="font-size:1.1rem; color:var(--slate-800); margin-bottom:6px;">No requests found</h3>
            <p style="color:var(--slate-500); font-size:0.88rem; max-width:320px; margin:0 auto;">There are no active community requests matching this filter right now.</p>
          </div>
        `;
    return;
  }

  feed.innerHTML = filtered.map(renderCommunityCard).join('');
}

async function loadCommunityRequests() {
  try {
    if (typeof listCommunityBloodRequests === 'function') {
      const { data } = await listCommunityBloodRequests();
      const rawList = Array.isArray(data) ? data : [];
      // Exclude user's own requests from the Community feed
      allCommunityRequests = rawList.filter(r => r.verification_status === 'verified' && !isMyOwnRequest(r));
    }
  } catch (err) {
    console.warn('Failed to load community requests:', err);
  }
  applyCommunityFilter();
}

function getRequestHeaderStatus(request, lifecycle) {
  const operational = String(request.operational_status || request.status_raw || '').toLowerCase();
  if (['cancelled', 'canceled'].includes(operational)) {
    return { label: 'Cancelled', tone: 'cancelled' };
  }
  if (['expired', 'fulfilled'].includes(lifecycle.status)) {
    return { label: lifecycle.label, tone: lifecycle.status };
  }
  const verification = String(request.verification_status || 'pending').toLowerCase();
  if (verification === 'rejected' || operational === 'rejected') {
    return { label: 'Not approved', tone: 'rejected' };
  }
  if (verification === 'needs_clarification' || operational === 'needs_clarification') {
    return { label: 'Needs clarification', tone: 'needs_clarification' };
  }
  if (verification !== 'verified' || operational === 'pending') {
    return { label: 'Pending verification', tone: 'pending' };
  }
  return { label: lifecycle.label, tone: lifecycle.status };
}

function getFulfillmentAttribution(request, lifecycle) {
  if (lifecycle?.status !== 'fulfilled') return null;

  const fulfilledByRequester = Boolean(request?.recipient_received_at);
  return fulfilledByRequester
    ? {
        source: 'requester',
        label: 'Marked fulfilled by requester',
        icon: 'fa-user-check'
      }
    : {
        source: 'admin',
        label: 'Marked fulfilled by admin',
        icon: 'fa-user-shield'
      };
}

function renderRequestCard(r) {
  const reqId = r.id;
  const bloodTypeStr = escapeHtml(r.blood_type || 'O+');
  const units = Number(r.units_needed || 1);
  const isReplacement = r.request_type === 'replacement';
  const isUrgent = !isReplacement && (String(r.urgency || '').toLowerCase() === 'urgent' || String(r.urgency || '').toLowerCase() === 'critical');
  const donationPoint = escapeHtml(r.donation_point || r.hospital || 'Blood Bank');
  const description = escapeHtml(r.notes || 'Blood transfusion support requested.');
  const postedTime = formatTimeAgo(r.created_at);
  const lifecycle = getCommunityLifecycle(r);
  const status = lifecycle.status;
  const headerStatus = getRequestHeaderStatus(r, lifecycle);
  const fulfillmentAttribution = getFulfillmentAttribution(r, lifecycle);
  const arrangementLabel = isReplacement ? 'Blood Replacement' : (r.request_type === 'emergency_donor' ? 'Emergency Donor Assistance' : '');
  const pledges = Array.isArray(r.pledges) ? r.pledges : [];
  const activePledgedUnits = pledges
    .filter((pledge) => ['pledged', 'request_fulfilled', 'recipient_confirmed'].includes(String(pledge.status).toLowerCase()))
    .reduce((total, pledge) => total + Number(pledge.units_pledged || 1), 0);

  const campaign = r.replacement_campaign || {};
  const replacementTarget = Number(campaign.target_units || units);
  const replacementPledged = Number(campaign.pledged_units || 0);
  const replacementConfirmed = Number(campaign.confirmed_units || 0);
  const progressText = isReplacement
    ? `${Number(campaign.pledged_units || 0)}/${Number(campaign.target_units || units)} donors pledged · ${Number(campaign.confirmed_units || 0)}/${Number(campaign.target_units || units)} units confirmed`
    : '';
  const operationalStatus = String(r.operational_status || r.status_raw || '').toLowerCase();
  const verificationStatus = String(r.verification_status || 'pending').toLowerCase();
  const isClosedHistory = ['fulfilled', 'expired'].includes(status)
    || ['cancelled', 'canceled', 'rejected', 'fulfilled'].includes(operationalStatus);
  const canEdit = status === 'active' && r.verification_status !== 'verified';
  const canDelete = !isClosedHistory
    && ['pending', 'needs_clarification'].includes(operationalStatus)
    && verificationStatus !== 'verified';
  const canCancel = !isClosedHistory && !canDelete
    && (operationalStatus === 'approved' || verificationStatus === 'verified')
    && ['active', 'covered'].includes(status);
  const hasRequestMenu = canEdit || canDelete || canCancel;
  const hasActivePledge = pledges.some((pledge) => String(pledge.status).toLowerCase() === 'pledged');
  const canComplete = hasActivePledge && (status === 'active' || status === 'covered') && !r.recipient_received_at;
  const completionAction = canComplete
    ? '<button type="button" class="btn-feed-received" onclick="markBloodReceived(' + Number(reqId) + ')"><i class="fa-solid fa-heart-circle-check"></i> Mark Blood Received</button>'
    : '';
  const menuId = `myReqMenu-${reqId}`;
  const timeDateDisplay = escapeHtml(r.needed_time || (isUrgent ? 'As soon as possible' : 'Within 24-48 Hours'));

  return `
    <article class="feed-request-card my-request-card" id="myReqCard-${reqId}" data-request-id="${reqId}">
      <div class="feed-card-header">
        <div class="feed-requester-info">
          <div class="feed-requester-avatar my-request-avatar">
            <i class="fa-solid fa-droplet" aria-hidden="true"></i>
          </div>
          <div style="flex:1; min-width:0;">
            <div class="request-card-heading">
              <h4 class="feed-requester-name">
                Request #${reqId}
              </h4>
              <span class="feed-status-pill ${headerStatus.tone}">${headerStatus.label}</span>
            </div>
            ${arrangementLabel ? `<span class="request-arrangement-text">${arrangementLabel}</span>` : ''}
            <span class="feed-post-time"><i class="fa-regular fa-clock"></i> Submitted ${postedTime}</span>
            ${fulfillmentAttribution ? `<span class="request-fulfillment-attribution ${fulfillmentAttribution.source}"><i class="fa-solid ${fulfillmentAttribution.icon}" aria-hidden="true"></i> ${fulfillmentAttribution.label}</span>` : ''}
          </div>
        </div>
        ${hasRequestMenu ? `<div class="my-req-menu-wrap" style="position:relative;">
          <button type="button" class="feed-options-btn" onclick="toggleMyReqMenu('${reqId}')" aria-label="Options" title="Options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
          <div class="my-req-dropdown" id="${menuId}" style="display:none;position:absolute;right:0;top:100%;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:140px;z-index:200;overflow:hidden;">
            ${canEdit ? `<button type="button" class="my-req-menu-item" onclick="openEditRequestModal(${reqId})" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 16px;background:none;border:none;cursor:pointer;font-size:0.875rem;color:#1e293b;"><i class="fa-solid fa-pen-to-square" style="color:var(--accent);"></i> Edit Request</button>` : ''}
            ${canDelete ? `<button type="button" class="my-req-menu-item" onclick="openRequestActionModal(${reqId}, 'delete')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 16px;background:none;border:none;cursor:pointer;font-size:0.875rem;color:var(--accent, #800000);"><i class="fa-solid fa-trash"></i> Delete Request</button>` : ''}
            ${canCancel ? `<button type="button" class="my-req-menu-item" onclick="openRequestActionModal(${reqId}, 'cancel')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 16px;background:none;border:none;cursor:pointer;font-size:0.875rem;color:var(--accent, #800000);"><i class="fa-solid fa-ban"></i> Cancel Request</button>` : ''}
          </div>
        </div>` : ''}
      </div>

      <div class="feed-inner-box">
        <div class="feed-requirement-row">
          <div class="feed-blood-badge-wrap">
            <div class="feed-blood-droplet" aria-hidden="true">
              <i class="fa-solid fa-droplet"></i>
            </div>
            <div>
              <span class="feed-looking-label">${isReplacement ? 'REPLACEMENT DONORS NEEDED' : 'LOOKING FOR'}</span>
              <h3 class="feed-blood-title">${isReplacement
                ? `${units} replacement donor${units !== 1 ? 's' : ''} · Any eligible blood type`
                : `${units} unit${units !== 1 ? 's' : ''} of ${bloodTypeStr} blood`}</h3>
            </div>
          </div>
          ${isUrgent ? `<span class="feed-urgent-badge"><i class="fa-solid fa-triangle-exclamation"></i> URGENT</span>` : ''}
        </div>

        <div class="feed-info-grid">
          <div class="feed-info-col">
            <span class="feed-info-label"><i class="fa-solid fa-location-dot"></i> Donation point</span>
            <p class="feed-info-val">${donationPoint}</p>
          </div>
          <div class="feed-info-col">
            <span class="feed-info-label"><i class="fa-regular fa-calendar-days"></i> Needed by</span>
            <p class="feed-info-val">${timeDateDisplay}</p>
          </div>
        </div>

        <div class="feed-desc-section">
          <span class="feed-desc-label">Reason for request</span>
          <p class="feed-desc-text">${description || 'No description provided.'}</p>
          ${isReplacement ? `<div class="request-progress-summary my-request-progress" aria-label="Replacement donation progress">
            <span class="${getRequestProgressTone(replacementPledged, replacementTarget)}"><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i><strong>${replacementPledged}/${replacementTarget}</strong> donors pledged</span>
            <span class="${getRequestProgressTone(replacementConfirmed, replacementTarget)}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><strong>${replacementConfirmed}/${replacementTarget}</strong> units confirmed</span>
          </div>` : r.request_type === 'emergency_donor' ? `<div class="request-progress-summary my-request-progress" aria-label="Emergency donor pledge progress">
            <span class="${getRequestProgressTone(activePledgedUnits, units)}"><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i><strong>${activePledgedUnits}/${units}</strong> donors pledged</span>
          </div>` : ''}
        </div>
      </div>

      <div class="feed-actions-row">
        ${completionAction}
        <button type="button" class="btn-feed-details" onclick="openCommunityRequestDetails('${reqId}')">View Details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
      </div>
    </article>
  `;
}

let pendingBloodReceipt = null;
let bloodReceiptSaving = false;
let bloodReceiptReturnFocus = null;

function markBloodReceived(reqId) {
  if (bloodReceiptSaving) return;
  const request = (allRequests || []).find(r => String(r.id) === String(reqId));
  if (!request) { showToast('Request not found. Refresh My Requests and try again.'); return; }
  const hasActivePledge = (request.pledges || []).some((pledge) => String(pledge.status).toLowerCase() === 'pledged');
  if (!hasActivePledge) { showToast('A donor must pledge before blood receipt can be confirmed.', 'error'); return; }
  if (request.recipient_received_at || !['active', 'covered'].includes(getCommunityLifecycle(request).status)) {
    showToast('This request no longer accepts blood receipt confirmation.');
    return;
  }
  pendingBloodReceipt = request;
  bloodReceiptReturnFocus = document.activeElement;
  document.getElementById('bloodReceivedRequestLabel').textContent = 'Request #' + request.id;
  document.getElementById('bloodReceivedGuidance').textContent = request.request_type === 'replacement'
    ? 'Your replacement request will remain open until the coordinator confirms the required replacement donations.'
    : 'Confirming will close this community request. This cannot be undone here.';
  document.getElementById('bloodReceivedMessage').textContent = '';
  const dialog = document.getElementById('bloodReceivedDialog');
  if (!dialog.open) dialog.showModal();
  document.getElementById('cancelBloodReceived').focus();
}

function closeBloodReceivedDialog() {
  if (bloodReceiptSaving) return;
  document.getElementById('bloodReceivedDialog').close();
  pendingBloodReceipt = null;
  if (bloodReceiptReturnFocus?.isConnected) bloodReceiptReturnFocus.focus();
}

async function confirmBloodReceipt() {
  if (bloodReceiptSaving || !pendingBloodReceipt) return;
  const request = pendingBloodReceipt;
  const confirm = document.getElementById('confirmBloodReceived');
  const cancel = document.getElementById('cancelBloodReceived');
  const message = document.getElementById('bloodReceivedMessage');
  bloodReceiptSaving = true;
  confirm.disabled = true;
  cancel.disabled = true;
  confirm.textContent = 'Saving…';
  message.textContent = '';
  let saved = false;
  try {
    const { error } = await completeMyBloodRequest(request.id);
    if (error) throw error;
    saved = true;
    request.recipient_received_at = new Date().toISOString();
    showToast(request.request_type === 'replacement'
      ? 'Blood receipt recorded. Replacement coordination remains active.'
      : 'Blood received — thank you! Pledged donors and coordinators have been notified.');
  } catch (error) {
    message.textContent = error?.message || 'Unable to confirm blood receipt. Please try again.';
  } finally {
    bloodReceiptSaving = false;
    confirm.disabled = false;
    cancel.disabled = false;
    confirm.textContent = 'Confirm Blood Received';
  }
  if (saved) {
    closeBloodReceivedDialog();
    // A list refresh failure must not allow another receipt submission.
    try { await loadRequests(); } catch (_) { showToast('Blood receipt saved. Refresh My Requests to see the update.'); }
  }
}
document.getElementById('confirmBloodReceived')?.addEventListener('click', confirmBloodReceipt);
document.getElementById('cancelBloodReceived')?.addEventListener('click', closeBloodReceivedDialog);
document.getElementById('bloodReceivedDialog')?.addEventListener('cancel', event => {
  event.preventDefault();
  closeBloodReceivedDialog();
});

function toggleMyReqMenu(reqId) {
  const menuId = `myReqMenu-${reqId}`;
  document.querySelectorAll('.my-req-dropdown').forEach(m => {
    if (m.id !== menuId) m.style.display = 'none';
  });
  const menu = document.getElementById(menuId);
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.my-req-menu-wrap')) {
    document.querySelectorAll('.my-req-dropdown').forEach(m => m.style.display = 'none');
  }
}, true);

function openEditRequestModal(reqId) {
  const r = (allRequests || []).find(x => String(x.id) === String(reqId));
  if (!r) return;
  const isReplacement = r.request_type === 'replacement';
  document.getElementById('editReqId').value = reqId;
  document.getElementById('editReqType').value = r.request_type || 'emergency_donor';
  const btSel = document.getElementById('editReqBloodType');
  if (btSel) { btSel.value = r.blood_type || ''; btSel.disabled = isReplacement; btSel.required = !isReplacement; }
  const bloodTypeGroup = document.getElementById('editReqBloodTypeGroup');
  if (bloodTypeGroup) bloodTypeGroup.hidden = isReplacement;
  const unitIn = document.getElementById('editReqUnits');
  if (unitIn) unitIn.value = r.units_needed || 1;
  const urgSel = document.getElementById('editReqUrgency');
  if (urgSel) { urgSel.value = isReplacement ? 'normal' : (r.urgency || 'normal'); urgSel.disabled = isReplacement; urgSel.required = !isReplacement; }
  const urgencyGroup = document.getElementById('editReqUrgencyGroup');
  if (urgencyGroup) urgencyGroup.hidden = isReplacement;
  const hospIn = document.getElementById('editReqHospital');
  if (hospIn) hospIn.value = r.donation_point || r.hospital || '';
  const timeIn = document.getElementById('editReqNeededTime');
  if (timeIn) timeIn.value = r.needed_time || '';
  const notesIn = document.getElementById('editReqNotes');
  if (notesIn) notesIn.value = r.notes || '';
  const msgEl = document.getElementById('editReqMsg');
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'form-msg'; }
  document.getElementById('editRequestModal').classList.add('active');
}

function closeEditRequestModal() {
  document.getElementById('editRequestModal').classList.remove('active');
}

let pendingRequestAction = null;

function openRequestActionModal(reqId, action) {
  const normalizedAction = action === 'cancel' ? 'cancel' : 'delete';
  pendingRequestAction = { requestId: reqId, action: normalizedAction };
  document.querySelectorAll('.my-req-dropdown').forEach(m => m.style.display = 'none');
  const isCancellation = normalizedAction === 'cancel';
  const titleIcon = document.getElementById('requestActionTitleIcon');
  if (titleIcon) titleIcon.className = `fa-solid ${isCancellation ? 'fa-ban' : 'fa-trash'}`;
  const title = document.getElementById('requestActionTitle');
  if (title) title.textContent = isCancellation ? 'Cancel Blood Request' : 'Delete Blood Request';
  const heading = document.getElementById('requestActionHeading');
  if (heading) heading.textContent = isCancellation ? 'Cancel this request?' : 'Delete this request?';
  const message = document.getElementById('requestActionMessage');
  if (message) message.textContent = isCancellation
    ? 'This stops further community responses and keeps the request in your history.'
    : 'This permanently removes the request and cannot be undone.';
  const confirmButton = document.getElementById('confirmDeleteReqBtn');
  if (confirmButton) confirmButton.textContent = isCancellation ? 'Yes, cancel request' : 'Yes, delete';
  const modal = document.getElementById('deleteRequestModal');
  if (modal) modal.classList.add('active');
}

let pendingPledgeUnsuccessful = null;
let pledgeUnsuccessfulSaving = false;

function openPledgeUnsuccessfulModal(requestId, pledgeId) {
  pendingPledgeUnsuccessful = { requestId, pledgeId };
  const inline = document.getElementById('pledgeUnsuccessfulInline');
  const message = document.getElementById('pledgeUnsuccessfulMessage');
  if (message) message.textContent = '';
  if (inline) inline.hidden = false;
  document.getElementById('cancelPledgeUnsuccessful')?.focus();
}

function closePledgeUnsuccessfulModal() {
  if (pledgeUnsuccessfulSaving) return;
  const inline = document.getElementById('pledgeUnsuccessfulInline');
  if (inline) inline.hidden = true;
  pendingPledgeUnsuccessful = null;
}

document.getElementById('confirmPledgeUnsuccessful')?.addEventListener('click', async () => {
  if (pledgeUnsuccessfulSaving || !pendingPledgeUnsuccessful) return;
  const { requestId, pledgeId } = pendingPledgeUnsuccessful;
  const submit = document.getElementById('confirmPledgeUnsuccessful');
  const cancel = document.getElementById('cancelPledgeUnsuccessful');
  const message = document.getElementById('pledgeUnsuccessfulMessage');
  pledgeUnsuccessfulSaving = true;
  submit.disabled = true;
  cancel.disabled = true;
  submit.textContent = 'Updating pledge...';
  if (message) message.textContent = '';
  try {
    const { error } = await markMyRequestPledgeUnsuccessful(requestId, pledgeId);
    if (error) throw error;
    pledgeUnsuccessfulSaving = false;
    closePledgeUnsuccessfulModal();
    closeCommunityRequestDetailModal();
    showToast('The unsuccessful pledge was released. The request remains available.');
    await loadRequests();
  } catch (error) {
    if (message) message.textContent = error?.message || 'Unable to update this pledge. Please try again.';
  } finally {
    pledgeUnsuccessfulSaving = false;
    submit.disabled = false;
    cancel.disabled = false;
    submit.textContent = 'Mark unsuccessful';
  }
});

function closeDeleteRequestModal() {
  pendingRequestAction = null;
  const modal = document.getElementById('deleteRequestModal');
  if (modal) modal.classList.remove('active');
}

const deleteReqModal = document.getElementById('deleteRequestModal');
if (deleteReqModal) {
  deleteReqModal.addEventListener('click', (e) => {
    if (e.target === deleteReqModal) closeDeleteRequestModal();
  });
}

function showToast(message, type = 'success') {
  let container = document.getElementById('patientToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'patientToastContainer';
    container.className = 'patient-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `patient-toast ${type}`;
  const iconHtml = type === 'success'
    ? '<i class="fa-solid fa-circle-check"></i>'
    : '<i class="fa-solid fa-circle-exclamation"></i>';
  toast.innerHTML = `${iconHtml} <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showToastWithAction(message, actionText, actionCallback) {
  let container = document.getElementById('patientToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'patientToastContainer';
    container.className = 'patient-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'patient-toast info';
  toast.innerHTML = `
    <i class="fa-solid fa-eye-slash"></i>
    <span>${escapeHtml(message)}</span>
    <button type="button" class="patient-toast-action-btn">${escapeHtml(actionText)}</button>
  `;
  container.appendChild(toast);

  const actionBtn = toast.querySelector('.patient-toast-action-btn');
  let isActionClicked = false;
  if (actionBtn && typeof actionCallback === 'function') {
    actionBtn.addEventListener('click', () => {
      isActionClicked = true;
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
      actionCallback();
    });
  }

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    if (!isActionClicked && toast.parentElement) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 4500);
}

const confirmDeleteReqBtn = document.getElementById('confirmDeleteReqBtn');
if (confirmDeleteReqBtn) {
  confirmDeleteReqBtn.addEventListener('click', async () => {
    if (!pendingRequestAction?.requestId) return;
    const { requestId, action } = pendingRequestAction;
    const isCancellation = action === 'cancel';
    confirmDeleteReqBtn.disabled = true;
    confirmDeleteReqBtn.textContent = isCancellation ? 'Cancelling...' : 'Deleting...';
    try {
      const result = isCancellation
        ? await cancelMyBloodRequest(requestId)
        : await deleteMyBloodRequest(requestId);
      const { error, warning } = result;
      if (error) {
        showToast(error.message || `Failed to ${action} request.`, 'error');
      } else {
        if (!isCancellation) {
          allRequests = (allRequests || []).filter(r => String(r.id) !== String(requestId));
          document.getElementById(`myReqCard-${requestId}`)?.remove();
          applyRequestFilter();
        }
        closeDeleteRequestModal();
        showToast(isCancellation ? 'Blood request cancelled.' : 'Blood request deleted successfully.');
        if (warning) showToast(warning, 'error');
        await loadRequests();
      }
    } catch (err) {
      console.error('Request action error:', err);
      showToast(`Network error. Failed to ${action} request.`, 'error');
    } finally {
      confirmDeleteReqBtn.disabled = false;
      if (pendingRequestAction) {
        confirmDeleteReqBtn.textContent = pendingRequestAction.action === 'cancel' ? 'Yes, cancel request' : 'Yes, delete';
      }
    }
  });
}

window.toggleMyReqMenu = toggleMyReqMenu;
window.openEditRequestModal = openEditRequestModal;
window.closeEditRequestModal = closeEditRequestModal;
window.openRequestActionModal = openRequestActionModal;
window.openPledgeUnsuccessfulModal = openPledgeUnsuccessfulModal;
window.closePledgeUnsuccessfulModal = closePledgeUnsuccessfulModal;
window.closeDeleteRequestModal = closeDeleteRequestModal;

function applyRequestFilter() {
  const fullList = document.getElementById('requestList');
  const emptyMsg = '<p style="text-align:center;color:var(--slate-400);padding:24px 0;">No requests for this filter yet.</p>';

  const filtered = (allRequests || []).filter((r) => {
    if (activeMyFilter === 'active') {
      return r.status === 'active';
    }
    if (activeMyFilter === 'covered') {
      return r.status === 'covered';
    }
    if (activeMyFilter === 'fulfilled') {
      return r.status === 'fulfilled';
    }
    if (activeMyFilter === 'expired') {
      return r.status === 'expired';
    }
    return true;
  });

  if (fullList) fullList.innerHTML = filtered.length ? filtered.map(renderRequestCard).join('') : emptyMsg;
}

async function loadRequests() {
  const emptyMsg = '<p style="text-align:center;color:var(--slate-400);padding:24px 0;">No blood requests yet. Click Create Request above to submit one.</p>';

  // Load community feed as well
  loadCommunityRequests();

  try {
    const { data: requests, error } = await listMyBloodRequests();
    const fullList = document.getElementById('requestList');
    const dashList = document.getElementById('dashboardRequestList');

    if (error) {
      throw error;
    }

    if (!requests || requests.length === 0) {
      allRequests = [];
      if (fullList) fullList.innerHTML = emptyMsg;
      if (dashList) dashList.innerHTML = emptyMsg;
      const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setCount('myRequestsCount', '0');
      setCount('requestBadge', '0');
      return;
    }

    allRequests = requests;

    const fulfilled = requests.filter(r => r.status === 'fulfilled').length;
    const pending = requests.filter(r => r.status === 'active').length;

    // Update stats on dashboard and requests section
    ['statTotalRequests', 'statTotalRequests2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = requests.length;
    });
    ['statFulfilled', 'statFulfilled2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = fulfilled;
    });
    ['statPending', 'statPending2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = pending;
    });

    // Update filter menu counts (null-safe)
    const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setCount('myRequestsCount', requests.length);
    setCount('requestBadge', requests.length);

    const badge = document.getElementById('requestBadge');
    if (badge) badge.textContent = requests.length;

    // Full list in My Requests section (filtered)
    applyRequestFilter();
    applyCommunityFilter();

    // Recent 3 on dashboard
    if (dashList) dashList.innerHTML = requests.slice(0, 3).map(renderRequestCard).join('');
    return true;
  } catch (err) {
    console.error('Failed to load requests:', err);
    const readable = err?.message ? `Failed to load requests: ${err.message}` : 'Failed to load requests. Please try again.';
    const fullList = document.getElementById('requestList');
    const dashList = document.getElementById('dashboardRequestList');
    if (fullList) fullList.innerHTML = `<p style="text-align:center;color:var(--accent);padding:24px 0;">${readable}</p>`;
    if (dashList) dashList.innerHTML = `<p style="text-align:center;color:var(--accent);padding:24px 0;">${readable}</p>`;
    return false;
  }
}

// Filter dropdown toggle and option selection for Community Blood Requests
const filterDropdown = document.getElementById('filterDropdown');
const filterTrigger = document.getElementById('filterTrigger');

if (filterTrigger) {
  filterTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = filterDropdown.classList.contains('open');
    filterDropdown.classList.toggle('open', !isOpen);
    filterTrigger.setAttribute('aria-expanded', !isOpen);
  });
}

document.addEventListener('click', (e) => {
  if (filterDropdown && !filterDropdown.contains(e.target)) {
    filterDropdown.classList.remove('open');
    filterTrigger?.setAttribute('aria-expanded', 'false');
  }
  // Close myFilterDropdown on outside click
  if (myFilterDropdown && !myFilterDropdown.contains(e.target)) {
    myFilterDropdown.classList.remove('open');
    myFilterTrigger?.setAttribute('aria-expanded', 'false');
  }
});

// Community filter items — scoped to #filterMenu only
document.querySelectorAll('#filterMenu .filter-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filterMenu .filter-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    activeCommunityFilter = btn.getAttribute('data-request-filter') || 'all';
    applyCommunityFilter();

    // Sync trigger text
    const triggerText = document.getElementById('selectedFilterText');
    if (triggerText) triggerText.textContent = btn.querySelector('span')?.textContent?.trim() || btn.textContent.trim();

    filterDropdown?.classList.remove('open');
    filterTrigger?.setAttribute('aria-expanded', 'false');
  });
});

// My Requests Filter Dropdown
const myFilterDropdown = document.getElementById('myFilterDropdown');
const myFilterTrigger = document.getElementById('myFilterTrigger');

if (myFilterTrigger) {
  myFilterTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = myFilterDropdown?.classList.contains('open');
    myFilterDropdown?.classList.toggle('open', !isOpen);
    myFilterTrigger.setAttribute('aria-expanded', String(!isOpen));
  });
}

document.querySelectorAll('#myFilterMenu .my-filter-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#myFilterMenu .my-filter-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeMyFilter = btn.getAttribute('data-my-filter') || 'all';

    // Update trigger label to selected option name
    const label = btn.querySelector('span')?.textContent?.trim() || 'All Requests';
    const selectedText = document.getElementById('selectedMyFilterText');
    if (selectedText) selectedText.textContent = label;

    applyRequestFilter();
    myFilterDropdown?.classList.remove('open');
    myFilterTrigger?.setAttribute('aria-expanded', 'false');
  });
});

// Expose functions globally for inline HTML handlers
window.switchRequestsTab = switchRequestsTab;
// Hide/unhide handlers are exported alongside their definitions.
window.openCommunityRequestDetails = openCommunityRequestDetails;
window.closeCommunityRequestDetailModal = closeCommunityRequestDetailModal;
window.handlePledgeHelp = handlePledgeHelp;
window.markBloodReceived = markBloodReceived;
window.openRequestModal = openRequestModal;
window.closeRequestModal = closeRequestModal;


document.getElementById('requestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (requestSubmissionPending) return;
  const msg = document.getElementById('requestMsg');
  const form = e.target;
  const button = form.querySelector('button[type="submit"]');
  requestSubmissionPending = true;
  if (button) button.disabled = true;
  let saved = form.dataset.requestSaved === 'true';
  let submissionWarning = '';
  let refreshTimer;
  const slowTimer = setTimeout(() => {
    msg.textContent = 'Still waiting for confirmation. You may close this form and check My Requests. Do not submit again while this request is pending.';
  }, 20000);
  try {
    if (!saved) {
      msg.textContent = 'Submitting request...';
      msg.className = 'form-msg info';
      const result = await createBloodRequest(Object.fromEntries(new FormData(form)));
      if (result?.error) throw new Error(result.error.message || 'Failed to submit request.');
      if (!result?.data?.request_id) throw new Error('Submission not confirmed. Check My Requests before trying again.');
      submissionWarning = String(result.warning || '');
      saved = true;
      form.dataset.requestSaved = 'true';
    }
    clearTimeout(slowTimer);
    msg.textContent = 'Request saved for coordinator verification. Refreshing My Requests...';
    msg.className = 'form-msg success';
    activeMyFilter = 'all';
    document.querySelectorAll('#myFilterMenu .my-filter-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-my-filter') === 'all');
    });
    const label = document.getElementById('selectedMyFilterText');
    if (label) label.textContent = 'All Requests';
    switchRequestsTab('my');
    const loaded = await Promise.race([
      loadRequests(),
      new Promise((_, reject) => {
        refreshTimer = setTimeout(() => reject(new Error('List refresh timed out.')), 20000);
      })
    ]);
    if (loaded === false) throw new Error('List refresh failed.');
    closeRequestModal();
    if (submissionWarning) showToast(submissionWarning);
  } catch (err) {
    msg.textContent = saved
      ? 'Your request was saved, but the list could not refresh. Click Check My Requests below; do not submit a duplicate.'
      : (err?.message || 'Submission not confirmed. Check My Requests before trying again.');
    msg.className = 'form-msg error';
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(refreshTimer);
    requestSubmissionPending = false;
    if (button) {
      button.disabled = false;
      button.textContent = saved ? 'Check My Requests' : 'Submit Request';
    }
  }
});

document.getElementById('editRequestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('editReqMsg');
  const reqId = document.getElementById('editReqId').value;
  const payload = {
    request_type: document.getElementById('editReqType').value,
    blood_type: document.getElementById('editReqBloodType').value,
    units_needed: document.getElementById('editReqUnits').value,
    urgency: document.getElementById('editReqUrgency').value,
    hospital: document.getElementById('editReqHospital').value,
    needed_time: document.getElementById('editReqNeededTime')?.value || '',
    notes: document.getElementById('editReqNotes').value
  };

  msg.textContent = 'Saving changes...';
  msg.className = 'form-msg info';

  try {
    const { error } = await updateMyBloodRequest(reqId, payload);
    if (error) {
      msg.textContent = error.message || 'Failed to update request.';
      msg.className = 'form-msg error';
      return;
    }
    msg.textContent = 'Request updated successfully!';
    msg.className = 'form-msg success';
    loadRequests();
    setTimeout(closeEditRequestModal, 1500);
  } catch (err) {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'form-msg error';
  }
});

// Real-time phone sanitizer for profile form
const profilePhoneInput = document.getElementById('profilePhoneInput');
if (profilePhoneInput) {
  profilePhoneInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.classList.remove('is-invalid');
  });
}

// Clear is-invalid on input / change for profile form fields
['profileFirstNameInput', 'profileMiddleNameInput', 'profileLastNameInput', 'profileBloodTypeInput', 'profileGenderInput', 'profileAddressInput'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => el.classList.remove('is-invalid'));
    el.addEventListener('change', () => el.classList.remove('is-invalid'));
  }
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const msg = document.getElementById('profileMsg');
  const saveBtn = document.getElementById('profileSaveBtn');
  const formData = new FormData(e.target);

  const payload = {
    first_name: String(formData.get('first_name') || '').trim(),
    middle_name: String(formData.get('middle_name') || '').trim(),
    last_name: String(formData.get('last_name') || '').trim(),
    blood_type: String(formData.get('blood_type') || '').trim(),
    gender: String(formData.get('gender') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    address: String(formData.get('address') || '').trim()
  };

  const fnInput = document.getElementById('profileFirstNameInput');
  const mnInput = document.getElementById('profileMiddleNameInput');
  const lnInput = document.getElementById('profileLastNameInput');
  const btInput = document.getElementById('profileBloodTypeInput');
  const phInput = document.getElementById('profilePhoneInput');
  const addrInput = document.getElementById('profileAddressInput');

  // Reset any previous invalid highlights
  e.target.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

  const showProfileError = (errorMessage, inputEl) => {
    msg.textContent = errorMessage;
    msg.className = 'form-msg error';
    if (inputEl) {
      inputEl.classList.add('is-invalid');
      inputEl.focus();
    }
  };

  const NAME_REGEX = /^[a-zA-Z\u00C0-\u024F\s'-]+$/;
  const MIDDLE_NAME_REGEX = /^[a-zA-Z\u00C0-\u024F\s'.-]*$/;
  const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const PH_MOBILE_REGEX = /^09\d{9}$/;

  // 1. First Name validation
  if (!payload.first_name) {
    showProfileError('First name is required.', fnInput);
    return;
  }
  if (payload.first_name.length < 2) {
    showProfileError('First name must be at least 2 characters.', fnInput);
    return;
  }
  if (payload.first_name.length > 50) {
    showProfileError('First name cannot exceed 50 characters.', fnInput);
    return;
  }
  if (!NAME_REGEX.test(payload.first_name)) {
    showProfileError('First name can only contain letters, spaces, and hyphens.', fnInput);
    return;
  }

  // 2. Middle Name validation (optional)
  if (payload.middle_name) {
    if (payload.middle_name.length > 50) {
      showProfileError('Middle name cannot exceed 50 characters.', mnInput);
      return;
    }
    if (!MIDDLE_NAME_REGEX.test(payload.middle_name)) {
      showProfileError('Middle name can only contain letters, spaces, hyphens, and periods.', mnInput);
      return;
    }
  }

  // 3. Last Name validation
  if (!payload.last_name) {
    showProfileError('Last name is required.', lnInput);
    return;
  }
  if (payload.last_name.length < 2) {
    showProfileError('Last name must be at least 2 characters.', lnInput);
    return;
  }
  if (payload.last_name.length > 50) {
    showProfileError('Last name cannot exceed 50 characters.', lnInput);
    return;
  }
  if (!NAME_REGEX.test(payload.last_name)) {
    showProfileError('Last name can only contain letters, spaces, and hyphens.', lnInput);
    return;
  }

  // 4. Blood Type validation
  if (!payload.blood_type || !VALID_BLOOD_TYPES.includes(payload.blood_type.toUpperCase())) {
    showProfileError('Please select a valid blood type.', btInput);
    return;
  }

  // 5. Phone Number validation (if provided, must be valid 11-digit Philippine mobile starting with 09)
  if (payload.phone) {
    if (!PH_MOBILE_REGEX.test(payload.phone)) {
      showProfileError('Phone number must be an 11-digit mobile number starting with 09 (e.g., 09123456789).', phInput);
      return;
    }
  }

  // 6. Address validation (optional, but if provided must be reasonable length and format)
  if (payload.address) {
    if (payload.address.length < 5) {
      showProfileError('Address must be at least 5 characters long.', addrInput);
      return;
    }
    if (payload.address.length > 150) {
      showProfileError('Address cannot exceed 150 characters.', addrInput);
      return;
    }
    if (!/[a-zA-Z]/.test(payload.address)) {
      showProfileError('Please enter a valid address with street or location name.', addrInput);
      return;
    }
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  msg.textContent = 'Saving profile...';
  msg.className = 'form-msg info';

  try {
    if (typeof updateMyPatientProfile !== 'function') {
      throw new Error('Profile update module not loaded. Please hard refresh the page and try again.');
    }

    const { data, error } = await updateMyPatientProfile(payload);

    if (error) {
      msg.textContent = error.message || 'Failed to update profile.';
      msg.className = 'form-msg error';
      return;
    }

    saveProfilePhoto(data.profile, pendingProfilePhoto);
    applyProfileToUI({ ...data.profile, avatar_url: pendingProfilePhoto });
    msg.textContent = 'Profile updated successfully.';
    msg.className = 'form-msg success';
    setTimeout(closeProfileModal, 900);
  } catch (err) {
    console.error('Failed to update profile:', err);
    msg.textContent = err?.message || 'Network error. Please try again.';
    msg.className = 'form-msg error';
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
  }
});

// ---- Logout Functionality ----
function toggleHeaderDropdown(event) {
  if (event) event.stopPropagation();
  if (!headerDropdown) return;
  const isOpen = headerDropdown.classList.contains('active');
  if (isOpen) {
    closeHeaderDropdown();
    return;
  }
  setSidebarOpen(false);
  openHeaderDropdown();
}

if (headerDropdownOverlay) {
  headerDropdownOverlay.addEventListener('click', closeHeaderDropdown);
}

function openProfileFromDropdown(event) {
  if (event) event.stopPropagation();
  closeHeaderDropdown();
  closeNotificationPanel();
  navigateToSection('profile');
}

// Close dropdown when clicking outside
window.addEventListener('click', (event) => {
  const target = event.target;
  if (headerDropdown && headerProfileBtn && (headerProfileBtn.contains(target) || headerDropdown.contains(target))) return;
  if (notificationPanel && notificationBtn && (notificationBtn.contains(target) || notificationPanel.contains(target))) return;
  closeHeaderDropdown();
  closeNotificationPanel();
});

window.addEventListener('scroll', () => {
  closeHeaderDropdown();
  closeNotificationPanel();
}, { passive: true });

function openLogoutModal(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }
  const dropdown = document.getElementById('headerProfileDropdown');
  if (dropdown) dropdown.classList.remove('active');
  if (typeof closeNotificationPanel === 'function') closeNotificationPanel();
  if (typeof setSidebarOpen === 'function') setSidebarOpen(false);
  document.body.classList.add('modal-open');
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.add('active');
}
window.openLogoutModal = openLogoutModal;

function closeLogoutModal(event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
}
window.closeLogoutModal = closeLogoutModal;

async function handleConfirmLogout(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }
  const btn = document.getElementById('confirmLogoutBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
  }

  // Guaranteed fallback redirect if anything delays
  const fallbackRedirect = setTimeout(() => {
    window.location.replace('index.html');
  }, 700);

  try {
    if (typeof signOut === 'function') {
      await signOut();
    } else {
      if (typeof clearAuthSession === 'function') {
        await clearAuthSession();
      }
      window.location.replace('index.html');
    }
  } catch (err) {
    console.warn('Logout error:', err);
    window.location.replace('index.html');
  } finally {
    clearTimeout(fallbackRedirect);
  }
}
window.handleConfirmLogout = handleConfirmLogout;

const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');
if (confirmLogoutBtn) {
  confirmLogoutBtn.addEventListener('click', handleConfirmLogout);
}


// ----- Request admin-note modal -----
function openRequestNoteModal(requestId, noteText) {
  const modal = document.getElementById('requestNoteModal');
  const noteBody = document.getElementById('requestNoteContent');
  const noteTitle = document.getElementById('requestNoteTitle');
  if (noteTitle) noteTitle.textContent = `Admin note - Request ${requestId || ''}`;
  if (noteBody) noteBody.textContent = noteText || 'No note available.';
  if (modal) modal.classList.add('active');
}

function closeRequestNoteModal() {
  const modal = document.getElementById('requestNoteModal');
  if (modal) modal.classList.remove('active');
}
