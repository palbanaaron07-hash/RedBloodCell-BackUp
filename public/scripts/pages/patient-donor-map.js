const BOHOL_CENTER = [9.8500, 124.1800];
const BOHOL_BOUNDS = [
  [9.35, 123.55],
  [10.45, 124.75]
];
const BLOOD_TYPES = ['Compatible', 'All', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const RECEIVE_FROM = {
  'A+': ['A+', 'A-', 'O+', 'O-'], 'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'], 'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'], 'O+': ['O+', 'O-'], 'O-': ['O-']
};

// Complete 48 Bohol Municipalities & City coordinate mapping
const ZONES = [
  { area: 'Tagbilaran City', lat: 9.6500, lng: 123.8550 },
  { area: 'Alburquerque', lat: 9.6139, lng: 123.9583 },
  { area: 'Alicia', lat: 9.8978, lng: 124.4411 },
  { area: 'Anda', lat: 9.7444, lng: 124.5778 },
  { area: 'Antequera', lat: 9.7778, lng: 123.9000 },
  { area: 'Baclayon', lat: 9.6222, lng: 123.9139 },
  { area: 'Balilihan', lat: 9.7556, lng: 123.9722 },
  { area: 'Batuan', lat: 9.7889, lng: 124.1472 },
  { area: 'Bien Unido', lat: 10.1472, lng: 124.4250 },
  { area: 'Bilar', lat: 9.7167, lng: 124.1167 },
  { area: 'Buenavista', lat: 10.0764, lng: 124.1167 },
  { area: 'Calape', lat: 9.8917, lng: 123.8750 },
  { area: 'Candijay', lat: 9.8278, lng: 124.5500 },
  { area: 'Carmen', lat: 9.8242, lng: 124.1972 },
  { area: 'Catigbian', lat: 9.8333, lng: 123.9889 },
  { area: 'Clarin', lat: 9.9639, lng: 124.0250 },
  { area: 'Corella', lat: 9.6889, lng: 123.9194 },
  { area: 'Cortes', lat: 9.7194, lng: 123.8806 },
  { area: 'Dagohoy', lat: 9.9333, lng: 124.2833 },
  { area: 'Danao', lat: 9.9500, lng: 124.2000 },
  { area: 'Dauis', lat: 9.6225, lng: 123.8652 },
  { area: 'Dimiao', lat: 9.6056, lng: 124.1500 },
  { area: 'Duero', lat: 9.7083, lng: 124.4111 },
  { area: 'Garcia Hernandez', lat: 9.6139, lng: 124.2917 },
  { area: 'Getafe', lat: 10.1500, lng: 124.1500 },
  { area: 'Guindulman', lat: 9.7547, lng: 124.4925 },
  { area: 'Inabanga', lat: 10.0306, lng: 124.0750 },
  { area: 'Jagna', lat: 9.6528, lng: 124.3686 },
  { area: 'Lila', lat: 9.5972, lng: 124.1000 },
  { area: 'Loay', lat: 9.6000, lng: 124.0139 },
  { area: 'Loboc', lat: 9.6389, lng: 124.0333 },
  { area: 'Loon', lat: 9.7997, lng: 123.7917 },
  { area: 'Mabini', lat: 9.8667, lng: 124.5250 },
  { area: 'Maribojoc', lat: 9.7431, lng: 123.8403 },
  { area: 'Panglao', lat: 9.5780, lng: 123.7460 },
  { area: 'Pilar', lat: 9.8167, lng: 124.3167 },
  { area: 'Pres. Carlos P. Garcia', lat: 10.1167, lng: 124.5667 },
  { area: 'Sagbayan', lat: 9.9139, lng: 124.0917 },
  { area: 'San Isidro', lat: 9.8889, lng: 123.9389 },
  { area: 'San Miguel', lat: 10.0083, lng: 124.3417 },
  { area: 'Sevilla', lat: 9.7167, lng: 124.0250 },
  { area: 'Sierra Bullones', lat: 9.7917, lng: 124.2917 },
  { area: 'Sikatuna', lat: 9.6917, lng: 123.9722 },
  { area: 'Talibon', lat: 10.1497, lng: 124.3250 },
  { area: 'Trinidad', lat: 10.0861, lng: 124.3472 },
  { area: 'Tubigon', lat: 9.9528, lng: 123.9624 },
  { area: 'Ubay', lat: 10.0560, lng: 124.4720 },
  { area: 'Valencia', lat: 9.6083, lng: 124.2083 }
];

// Accredited Hospitals & Blood Facilities in Bohol
const HOSPITALS = [
  { name: 'Governor Celestino Gallares Memorial Medical Center', area: 'Tagbilaran City', lat: 9.6467, lng: 123.8556 },
  { name: 'Ramiro Community Hospital', area: 'Tagbilaran City', lat: 9.6492, lng: 123.8585 },
  { name: 'ACE Medical Center Bohol', area: 'Tagbilaran City', lat: 9.6640, lng: 123.8704 },
  { name: 'Borja Family Hospital', area: 'Tagbilaran City', lat: 9.6489, lng: 123.8522 },
  { name: 'Medical Mission Group Hospital and Health Services Cooperative', area: 'Tagbilaran City', lat: 9.6526, lng: 123.8571 },
  { name: 'Congressman Natalio P. Castillo Sr. Memorial Hospital', area: 'Canhangdon, Loon', lat: 9.8385, lng: 123.8203 },
  { name: 'Talibon Community Hospital', area: 'Talibon', lat: 10.1497, lng: 124.3250 },
  { name: 'Don Emilio del Valle Memorial Hospital', area: 'Ubay', lat: 10.0551, lng: 124.4727 },
  { name: 'Teodoro B. Galagar District Hospital', area: 'Jagna', lat: 9.6528, lng: 124.3686 },
  { name: 'Candijay Community Hospital', area: 'Candijay', lat: 9.8278, lng: 124.5500 },
  { name: 'Clarin Community Hospital', area: 'Clarin', lat: 9.9639, lng: 124.0250 },
  { name: 'Calape Mother & Child Hospital', area: 'Calape', lat: 9.8945, lng: 123.8813 },
  { name: 'Inabanga Municipal Hospital', area: 'Inabanga', lat: 10.0306, lng: 124.0750 },
  { name: 'Carmen District Hospital', area: 'Carmen', lat: 9.8242, lng: 124.1972 }
];

let map;
let profile = null;
let donorMarkers = [];
let donorAreaSummaryMarkers = [];
let hospitalMarkers = [];
let townLabelMarkers = [];
let mapToastTimer = null;
let rawDonorsCache = [];
let recipientArea = null; // Detected from profile, used for proximity auto-filter
let displayedDonors = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

// ──────────────────────────────────────────────────────────────────────
//  Comprehensive Bohol municipality & city resolution helper
// ──────────────────────────────────────────────────────────────────────
function findZoneForLocation(rawAddress) {
  if (!rawAddress || typeof rawAddress !== 'string') return null;
  const str = rawAddress.trim().toLowerCase();
  if (!str) return null;

  // 1. Specific aliases and multi-word towns first
  if (str.includes('tagbilaran')) {
    return ZONES.find((z) => z.area === 'Tagbilaran City') || null;
  }
  if (str.includes('jetafe') || str.includes('getafe')) {
    return ZONES.find((z) => z.area === 'Getafe') || null;
  }
  if (str.includes('pitogo') || str.includes('carlos p') || str.includes('c.p.g') || str.includes('cpg')) {
    return ZONES.find((z) => z.area === 'Pres. Carlos P. Garcia') || null;
  }
  if (str.includes('garcia hernandez') || str.includes('garcia-hernandez')) {
    return ZONES.find((z) => z.area === 'Garcia Hernandez') || null;
  }
  if (str.includes('sierra bullones') || str.includes('sierra-bullones')) {
    return ZONES.find((z) => z.area === 'Sierra Bullones') || null;
  }
  if (str.includes('bien unido') || str.includes('bien-unido')) {
    return ZONES.find((z) => z.area === 'Bien Unido') || null;
  }
  if (str.includes('san isidro')) {
    return ZONES.find((z) => z.area === 'San Isidro') || null;
  }
  if (str.includes('san miguel')) {
    return ZONES.find((z) => z.area === 'San Miguel') || null;
  }

  // 2. Check all remaining zones sorted by name length descending
  const sortedZones = [...ZONES].sort((a, b) => b.area.length - a.area.length);
  for (const zone of sortedZones) {
    const cleanName = zone.area.toLowerCase().replace(/\bcity\b/g, '').trim();
    if (!cleanName) continue;
    const regex = new RegExp(`\\b${cleanName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(str)) {
      return zone;
    }
  }

  // 3. Substring match fallback for partial matches
  for (const zone of sortedZones) {
    const cleanName = zone.area.toLowerCase().replace(/\bcity\b/g, '').trim();
    if (cleanName && cleanName.length >= 4 && str.includes(cleanName)) {
      return zone;
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────
//  Detect the recipient's Bohol municipality from their profile address
// ──────────────────────────────────────────────────────────────────────
function detectRecipientArea(prof) {
  if (!prof) return null;

  const candidates = [
    prof.map_area,
    prof.address,
    prof.city,
    prof.patient_profile?.address,
    prof.patient_profile?.map_area,
    prof.donor_profile?.map_area,
    prof.donor_profile?.address,
    prof.user_metadata?.address,
    prof.user_metadata?.city,
    prof.user_metadata?.map_area
  ];

  for (const cand of candidates) {
    if (cand && typeof cand === 'string' && cand.trim()) {
      const zone = findZoneForLocation(cand);
      if (zone) return zone.area;
    }
  }

  return null;
}

function getSelectedBloodTypes() {
  const select = document.getElementById('filterBloodType');
  const val = (select?.value || 'all').trim();

  if (val === 'all') {
    return ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  }
  if (val === 'compatible') {
    const patientType = profile?.blood_type || profile?.blood_type_needed || '';
    return RECEIVE_FROM[patientType] || ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  }
  return [val.toUpperCase()];
}

function getSelectedLocation() {
  const searchInput = document.getElementById('searchAreaInput');
  const typed = (searchInput?.value || '').trim();
  if (typed) return typed;
  const select = document.getElementById('filterLocation');
  return (select?.value || 'all').trim();
}

function getSelectedAvailability() {
  const select = document.getElementById('filterAvailability');
  return (select?.value || 'available').trim().toLowerCase();
}

function normalizeBoholArea(raw) {
  const zone = findZoneForLocation(raw);
  if (zone) return zone.area.toLowerCase();
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\bjetafe\b/g, 'getafe')
    .replace(/\bpitogo\b/g, 'pres. carlos p. garcia');
}

function donorZoneIndex(donor) {
  const zone = findZoneForLocation(donor?.map_area || donor?.area || donor?.city || donor?.address || '');
  if (zone) {
    const idx = ZONES.findIndex((z) => z.area === zone.area);
    if (idx >= 0) return idx;
  }

  // Hash fallback zone for unknown location in Bohol
  const value = String(donor?.id || donor?.donor_id || donor?.blood_type || 'donor');
  return value.split('').reduce((total, char) => total + char.charCodeAt(0), 0) % ZONES.length;
}

function isDonorScreenedAndEligible(donor) {
  if (!getDonorMapVisibilityState(donor).visible) return false;
  const status = String(donor?.donor_status || '').toLowerCase();
  const showOnMap = donor?.show_on_map === true;
  const locationStatus = String(donor?.location_status || 'needs_review').toLowerCase();

  // 1. Must have explicit map visibility and verified location status
  if (!showOnMap || locationStatus !== 'verified') return false;

  // 2. Must not be un-screened (registered, checked_in) or deferred
  if (['registered', 'checked_in', 'deferred', 'incomplete'].includes(status)) {
    return false;
  }

  // 3. If approved, medical screening is completed and ready to donate!
  if (status === 'approved') return true;

  // 4. If status is donated (or has last donation date), verify 56-day rule
  if (donor?.last_donation_date) {
    const next = new Date(donor.last_donation_date);
    next.setDate(next.getDate() + 56);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (next > today) return false; // Still in 56-day waiting period
  }

  return status === 'donated' || status === 'available';
}

function isDonorMatchingFilters(donor, allowedTypes, filterLocation, filterAvailability) {
  const bloodType = String(donor?.blood_type || '').trim().toUpperCase();
  const status = String(donor?.donor_status || '').toLowerCase();

  // 1. Blood type match
  if (!allowedTypes.includes(bloodType)) return false;

  // 2. Must be medically screened and currently eligible to donate
  if (!isDonorScreenedAndEligible(donor)) return false;

  // 3. Availability filter
  if (filterAvailability === 'approved' && status !== 'approved') {
    return false;
  }

  // 4. Location filter
  if (filterLocation !== 'all') {
    const targetZone = findZoneForLocation(filterLocation);
    const donorZoneIdx = donorZoneIndex(donor);
    const donorZone = ZONES[donorZoneIdx];

    if (targetZone) {
      if (donorZone?.area !== targetZone.area) return false;
    } else {
      const targetLoc = filterLocation.toLowerCase().trim();
      const donorArea = String(donor?.map_area || donor?.area || donor?.city || donor?.address || '').toLowerCase();
      if (!donorArea.includes(targetLoc) && !(donorZone?.area.toLowerCase().includes(targetLoc))) {
        return false;
      }
    }
  }

  return true;
}

function donorAvailabilityBadge(donor) {
  const status = String(donor?.donor_status || '').toLowerCase();
  if (status === 'approved') {
    return '<span class="blood-status-badge available"><i class="fa-solid fa-circle-check"></i> Screened &amp; Ready</span>';
  }
  return '<span class="blood-status-badge available"><i class="fa-solid fa-circle-check"></i> Eligible to Donate</span>';
}

// ──────────────────────────────────────────────────────────────────────
//  Blood-type teardrop PIN icon for individual donors on the map
// ──────────────────────────────────────────────────────────────────────
function makeDonorPinIcon(bloodType) {
  const label = escapeHtml(String(bloodType || '?').toUpperCase());
  return L.divIcon({
    className: 'donor-pin-wrap',
    html: `<div class="donor-pin">
      <div class="donor-pin-body"></div>
      <span class="donor-pin-type">${label}</span>
      <div class="donor-pin-tail"></div>
    </div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 52],
    popupAnchor: [0, -54]
  });
}

function makeAreaSummaryIcon(count, bloodTypes) {
  const typePreview = bloodTypes.slice(0, 3).join(' · ');
  const moreTypes = bloodTypes.length > 3 ? ` +${bloodTypes.length - 3}` : '';
  return L.divIcon({
    className: 'donor-area-summary-wrap',
    html: `<div class="donor-area-summary" aria-label="${count} donor/s: ${escapeHtml(bloodTypes.join(', '))}">
      <strong>${count}</strong>
      <span>donor${count === 1 ? '' : 's'}</span>
      <small>${escapeHtml(typePreview)}${moreTypes}</small>
    </div>`,
    iconSize: [58, 58],
    iconAnchor: [29, 29]
  });
}

// ──────────────────────────────────────────────────────────────────────
//  Popup content for a single donor pin
// ──────────────────────────────────────────────────────────────────────
function renderDonorPinPopup(donor, zone) {
  const bloodType = String(donor?.blood_type || '').trim().toUpperCase() || '--';
  const location = zone?.area || donor?.map_area || donor?.area || 'Bohol';
  const badgeHtml = donorAvailabilityBadge(donor);

  return `
    <div style="padding:12px 14px;min-width:200px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <span class="blood-type-pill"><i class="fa-solid fa-droplet"></i> ${escapeHtml(bloodType)}</span>
        ${badgeHtml}
      </div>
      <div style="font-size:0.82rem;color:#475569;display:flex;flex-direction:column;gap:3px;">
        <span style="font-weight:700;color:#0f172a;font-size:0.88rem;">
          <i class="fa-solid fa-location-dot" style="color:var(--accent,#800000);"></i>
          ${escapeHtml(location)}, Bohol
        </span>
        <span style="color:#059669;font-weight:600;font-size:0.78rem;">
          <i class="fa-solid fa-shield-check"></i> Coordinated through the donation coordinator
        </span>
      </div>
    </div>
  `;
}

function showMapToast(message) {
  const toast = document.getElementById('mapToast');
  if (!toast) return;
  window.clearTimeout(mapToastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  mapToastTimer = window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}

function renderHospitals() {
  hospitalMarkers.forEach((marker) => marker.remove());
  hospitalMarkers = HOSPITALS.map((hospital) => {
    const marker = L.marker([hospital.lat, hospital.lng], {
      icon: L.divIcon({
        className: 'hospital-marker-wrap',
        html: '<span class="hospital-marker" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;background:#0284c7;color:#fff;border-radius:50%;box-shadow:0 3px 8px rgba(2,132,199,0.4);"><i class="fa-solid fa-hospital"></i></span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(map);

    marker.bindPopup(`
          <div style="padding:10px 12px;">
            <strong style="color:#0f172a;font-size:0.92rem;">${escapeHtml(hospital.name)}</strong>
            <p style="margin:4px 0 0;font-size:0.78rem;color:#64748b;"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(hospital.area)}, Bohol</p>
            <span style="display:inline-block;margin-top:6px;font-size:0.72rem;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:6px;font-weight:700;">Accredited Facility</span>
          </div>
        `);
    return marker;
  });
}

// ──────────────────────────────────────────────────────────────────────
//  Render subtle town name labels for all 48 LGUs
// ──────────────────────────────────────────────────────────────────────
function renderTownLabels() {
  townLabelMarkers.forEach((m) => m.remove());
  townLabelMarkers = ZONES.map((zone) => {
    const marker = L.marker([zone.lat, zone.lng], {
      icon: L.divIcon({
        className: 'town-label-wrap',
        html: `<span class="town-label">${escapeHtml(zone.area)}</span>`,
        iconSize: [120, 20],
        iconAnchor: [60, 10]
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -100
    }).addTo(map);
    return marker;
  });
}

// ──────────────────────────────────────────────────────────────────────
//  Render individual blood-type pin markers (one per donor).
//  Uses fixed geographic lat/lng offsets so pins never move on zoom.
// ──────────────────────────────────────────────────────────────────────
function renderDonorPins(filteredDonors) {
  donorMarkers.forEach((m) => m.remove());
  donorMarkers = [];

  // Group donors by zone first so we can fan them out deterministically
  const zoneDonors = new Map();
  filteredDonors.forEach((donor) => {
    const idx = donorZoneIndex(donor);
    const zone = ZONES[idx];
    if (!zone) return;
    const list = zoneDonors.get(zone.area) || [];
    list.push(donor);
    zoneDonors.set(zone.area, list);
  });

  zoneDonors.forEach((donors) => {
    const total = donors.length;
    donors.forEach((donor, i) => {
      const idx = donorZoneIndex(donor);
      const zone = ZONES[idx];
      const bloodType = String(donor?.blood_type || '').trim().toUpperCase() || '?';

      // Fixed geographic offsets (~500-700 m) — anchored to the earth, never drift on zoom
      let lat = zone.lat;
      let lng = zone.lng;
      if (total > 1) {
        const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
        const radiusLat = 0.0055;  // ~610 m north-south
        const radiusLng = 0.0065;  // ~620 m east-west at Bohol latitude
        lat = zone.lat + Math.sin(angle) * radiusLat;
        lng = zone.lng + Math.cos(angle) * radiusLng;
      }

      const marker = L.marker([lat, lng], {
        icon: makeDonorPinIcon(bloodType),
        zIndexOffset: 500
      }).addTo(map);

      marker.bindPopup(renderDonorPinPopup(donor, zone), {
        className: 'donor-map-popup',
        maxWidth: 280,
        minWidth: 200,
        offset: [0, -38]
      });

      donorMarkers.push(marker);
    });
  });
}

function clearDonorDisplay() {
  donorMarkers.forEach((marker) => marker.remove());
  donorMarkers = [];
  donorAreaSummaryMarkers.forEach((marker) => marker.remove());
  donorAreaSummaryMarkers = [];
}

// Always show every donor as an individual blood-type pin at every zoom level.
function renderDonorDisplay(filteredDonors) {
  clearDonorDisplay();
  renderDonorPins(filteredDonors);
}

async function searchDonors(forceRefresh = false) {
  const summaryEl = document.getElementById('searchSummary');
  const searchBtn = document.getElementById('btnSearchBlood');

  if (searchBtn) searchBtn.disabled = true;
  if (summaryEl) summaryEl.textContent = 'Searching blood availability & verified donors...';

  // Clear existing donor markers and low-zoom area summaries.
  clearDonorDisplay();

  const allowedTypes = getSelectedBloodTypes();
  const filterLocation = getSelectedLocation();
  const filterAvailability = getSelectedAvailability();

  try {
    let donors = rawDonorsCache;
    if (forceRefresh || !donors || donors.length === 0) {
      if (typeof listVisibleDonors === 'function') {
        const { data, error } = await listVisibleDonors();
        if (error) throw error;
        donors = Array.isArray(data) ? data : [];
        rawDonorsCache = donors;
      }
    }

    const filtered = donors.filter((donor) =>
      isDonorMatchingFilters(donor, allowedTypes, filterLocation, filterAvailability)
    );

    const totalMatches = filtered.length;

    const typeStr = allowedTypes.length === 8 ? 'All types' : allowedTypes.join(', ');
    const locStr = filterLocation === 'all' ? 'Bohol' : filterLocation;
    if (summaryEl) {
      summaryEl.textContent = totalMatches > 0
        ? `Found ${totalMatches} available donor(s) / units in ${locStr} (${typeStr}).`
        : `No blood found matching ${typeStr} in ${locStr}.`;
    }

    const donorCountSummaryEl = document.getElementById('donorCountSummary');
    if (donorCountSummaryEl) {
      donorCountSummaryEl.textContent = `${totalMatches} Donor/s`;
    }

    displayedDonors = filtered;
    renderDonorDisplay(filtered);

    // Auto-pan: if a location filter is active, center on that area
    if (filterLocation !== 'all') {
      const targetNorm = normalizeBoholArea(filterLocation);
      const matched = ZONES.find((z) => {
        const zn = z.area.toLowerCase();
        return targetNorm.includes(zn) || zn.includes(targetNorm);
      });
      if (matched) {
        map.flyTo([matched.lat, matched.lng], 13, { duration: 0.7 });
      }
    }
  } catch (err) {
    console.error('Find blood search error:', err);
    if (summaryEl) summaryEl.textContent = 'Search encountered an error.';
  } finally {
    if (searchBtn) searchBtn.disabled = false;
  }
}
window.searchDonors = searchDonors;

// ──────────────────────────────────────────────────────────────────────
//  Show a small "your area" chip BELOW the search card (outside it)
// ──────────────────────────────────────────────────────────────────────
function showAreaChip(areaName) {
  const existingChip = document.getElementById('recipientAreaChip');
  if (existingChip) existingChip.remove();
  if (!areaName) return;

  const searchCard = document.getElementById('donorSearchCard');
  if (!searchCard) return;

  const chip = document.createElement('div');
  chip.id = 'recipientAreaChip';
  chip.className = 'recipient-area-chip';
  chip.innerHTML = `<i class="fa-solid fa-location-dot"></i> Near <strong>${escapeHtml(areaName)}</strong>`;
  chip.title = 'Showing donors nearest to your registered area. Search above to change.';

  // Insert after the search card (outside it, below)
  searchCard.insertAdjacentElement('afterend', chip);
}

function openFilterModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('open');
  const triggerBtn = document.getElementById('bloodTypePickerBtn');
  if (triggerBtn) {
    triggerBtn.classList.add('active');
    triggerBtn.setAttribute('aria-expanded', 'true');
  }
}

function closeFilterModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('open');
  const triggerBtn = document.getElementById('bloodTypePickerBtn');
  if (triggerBtn) {
    triggerBtn.classList.remove('active');
    triggerBtn.setAttribute('aria-expanded', 'false');
  }
}

function closeAllFilterModals() {
  closeFilterModal('bloodTypeModal');
}

function updateFilterPickerDisplays() {
  const typeVal = (document.getElementById('filterBloodType')?.value || 'all').trim();

  const typeLabels = {
    compatible: 'Compatible with me',
    all: 'All Blood Types',
    'A+': 'A+', 'A-': 'A-', 'B+': 'B+', 'B-': 'B-',
    'AB+': 'AB+', 'AB-': 'AB-', 'O+': 'O+', 'O-': 'O-'
  };

  const displayText = typeLabels[typeVal] || typeVal;

  const bloodTypeDisplay = document.getElementById('bloodTypeDisplay');
  if (bloodTypeDisplay) bloodTypeDisplay.textContent = displayText;

  document.querySelectorAll('[data-type="blood"]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.value === typeVal);
  });
}

function setBloodTypeFilter(val, label) {
  const input = document.getElementById('filterBloodType');
  if (input) {
    input.value = val;
  }
  updateFilterPickerDisplays();
  closeFilterModal('bloodTypeModal');
  searchDonors();
}

function clearAllFilters() {
  const searchInput = document.getElementById('searchAreaInput');
  const clearBtn = document.getElementById('btnClearSearchText');
  const typeSelect = document.getElementById('filterBloodType');
  const locSelect = document.getElementById('filterLocation');

  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (typeSelect) typeSelect.value = 'all';
  if (locSelect) locSelect.value = 'all';

  showAreaChip(null);
  if (map) map.setView(BOHOL_CENTER, 10.1);

  updateFilterPickerDisplays();
  searchDonors(true);
}
window.clearAllFilters = clearAllFilters;

function initMap() {
  map = L.map('donorMap', {
    center: BOHOL_CENTER,
    zoom: 10.1,
    zoomSnap: 0.1,
    minZoom: 9.8,
    maxZoom: 16,
    maxBounds: BOHOL_BOUNDS,
    maxBoundsViscosity: 0.8,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    noWrap: true
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  map.on('zoomend', () => {
    // Pins are geographically anchored; no re-render needed on zoom
  });

  renderHospitals();
  // Note: OSM tile layer already renders place names — no extra town labels needed
  setTimeout(() => map && map.invalidateSize(), 150);
  window.addEventListener('resize', () => map && map.invalidateSize());
}

// Bind event listeners
document.getElementById('locateButton')?.addEventListener('click', () => {
  const locateBtn = document.getElementById('locateButton');
  locateBtn?.classList.add('locating');
  setTimeout(() => locateBtn?.classList.remove('locating'), 800);

  // If recipientArea is not yet detected, try detecting it now from current profile
  if (!recipientArea && profile) {
    recipientArea = detectRecipientArea(profile);
  }

  if (recipientArea) {
    const zone = ZONES.find((z) => z.area.toLowerCase() === recipientArea.toLowerCase()) || findZoneForLocation(recipientArea);
    if (zone) {
      map?.flyTo([zone.lat, zone.lng], 13, { duration: 0.8 });
      return;
    }
  }

  map?.flyTo(BOHOL_CENTER, 10.1, { duration: 0.8 });
});

// Bottom filter buttons
document.getElementById('btnSearchBlood')?.addEventListener('click', () => searchDonors(true));
document.getElementById('btnClearFilters')?.addEventListener('click', clearAllFilters);

// Real-time Search input handling
const searchAreaInput = document.getElementById('searchAreaInput');
const btnClearSearchText = document.getElementById('btnClearSearchText');
let searchDebounceTimer = null;

searchAreaInput?.addEventListener('input', () => {
  if (btnClearSearchText) {
    btnClearSearchText.style.display = searchAreaInput.value.trim() ? 'flex' : 'none';
  }
  // Hide area chip when user types
  const chip = document.getElementById('recipientAreaChip');
  if (chip && searchAreaInput.value.trim()) {
    chip.style.opacity = '0.4';
  } else if (chip) {
    chip.style.opacity = '1';
  }
  window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    searchDonors();
  }, 250);
});

searchAreaInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    window.clearTimeout(searchDebounceTimer);
    searchDonors();
  }
});

btnClearSearchText?.addEventListener('click', () => {
  if (searchAreaInput) {
    searchAreaInput.value = '';
    searchAreaInput.focus();
  }
  if (btnClearSearchText) {
    btnClearSearchText.style.display = 'none';
  }
  showAreaChip(null);
  const locEl = document.getElementById('filterLocation');
  if (locEl) locEl.value = 'all';
  window.clearTimeout(searchDebounceTimer);
  searchDonors();
});

// Filter popup modal triggers
document.getElementById('bloodTypePickerBtn')?.addEventListener('click', () => {
  openFilterModal('bloodTypeModal');
});

document.getElementById('closeBloodTypeModal')?.addEventListener('click', () => {
  closeFilterModal('bloodTypeModal');
});

// Close when clicking modal backdrop overlay
document.querySelectorAll('.filter-modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeAllFilterModals();
    }
  });
});

// Close with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllFilterModals();
  }
});

// Option item selection delegation
document.querySelectorAll('[data-type="blood"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.value;
    const label = btn.querySelector('.option-card-title')?.textContent || btn.querySelector('.blood-grid-type')?.textContent || val;
    setBloodTypeFilter(val, label);
  });
});

// Auto-search on change if input values update programmatically
document.getElementById('filterBloodType')?.addEventListener('change', searchDonors);
document.getElementById('filterLocation')?.addEventListener('change', searchDonors);

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (typeof signOut === 'function') await signOut();
    window.location.href = 'index.html';
  });
}

(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  profile = auth.profile;
  initMap();

  // ── Auto-detect recipient's municipality from profile ──
  recipientArea = detectRecipientArea(profile);

  // Start without blood-type or location restrictions.
  const typeSelect = document.getElementById('filterBloodType');
  if (typeSelect) typeSelect.value = 'all';
  const locEl = document.getElementById('filterLocation');
  if (locEl) locEl.value = 'all';
  showAreaChip(null);

  updateFilterPickerDisplays();
  await searchDonors();
})();

if (typeof attachPageRefreshListeners === 'function') {
  attachPageRefreshListeners({
    onRefresh: async () => {
      try {
        if (typeof searchDonors === 'function') await searchDonors(true);
      } catch (_) { }
    },
    debounceMs: 2500
  });
}
