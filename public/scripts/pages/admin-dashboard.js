const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const toggle = document.getElementById('menuToggle');
const pageBody = document.body;

toggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
  pageBody.classList.toggle('menu-open');
});

overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  pageBody.classList.remove('menu-open');
});

// ---- Section-based Navigation ----
const sectionTitles = {
  dashboard: { title: 'Admin Dashboard' },
  donors: { title: 'Donor Management' },
  requests: { title: 'Blood Requests' },
  inventory: { title: 'Blood Inventory' },
  drives: { title: 'Blood Drives' },
  reports: { title: 'Reports' },
  appointments: { title: 'Appointments' },
  notifications: { title: 'Notifications' },
  activity: { title: 'Activity Logs' }
};

const globalSearchInput = document.getElementById('globalSearchInput');
let activeSection = 'dashboard';
let overviewInventoryCache = [];
let overviewRequestsCache = [];
let overviewExpirationsCache = [];
let overviewActivityCache = [];
let requestsSectionCache = [];
let inventoryByTypeCache = [];
let latestOverviewStats = null;
let donorCache = [];
let requestFilter = 'all';
let currentAdminContext = { userId: '', email: '', fullName: '' };
let requestTransitionState = { requestId: null, targetStatus: '', oldStatus: '' };
let reportsTrendPeriod = 'month';
let reportsTrendChart = null;
let reportsTrendPayload = null;
let reportsRefreshPromise = null;
let overviewMiniLineChart = null;
let overviewMiniBarChart = null;
let reportsRealtimeChannel = null;
let reportsRealtimeTimer = null;
let bloodDrivesRealtimeChannel = null;
let overviewExpirationsCollapsed = false;
const INVENTORY_TARGET_UNITS = 50;
const BLOOD_DRIVE_PLAN = [];

function getSearchQuery() {
  return String(globalSearchInput?.value || '').trim().toLowerCase();
}

function includesQuery(values, query) {
  if (!query) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(query));
}

function normalizeBloodType(value) {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^\w+-]/g, '')
    .replace(/MINUS/g, '-')
    .replace(/PLUS/g, '+');
  const aliases = {
    APOSITIVE: 'A+',
    ANEGATIVE: 'A-',
    BPOSITIVE: 'B+',
    BNEGATIVE: 'B-',
    ABPOSITIVE: 'AB+',
    ABNEGATIVE: 'AB-',
    OPOSITIVE: 'O+',
    ONEGATIVE: 'O-'
  };
  return aliases[compact] || compact;
}

function updateSearchPlaceholder(sectionName) {
  if (!globalSearchInput) return;
  const placeholders = {
    dashboard: 'Search donors, requests, inventory, or pages...',
    donors: 'Search donors by name, ID, blood type, email...',
    requests: 'Search requests by patient, hospital, blood type...',
    inventory: 'Search inventory by blood type, stock...',
    drives: 'Search drives by venue, status, or title...',
    reports: 'Search reports by status, metric, or type...',
    appointments: 'Search appointments...',
    notifications: 'Search notifications...',
    activity: 'Search activity logs by action, target, actor...'
  };
  globalSearchInput.placeholder = placeholders[sectionName] || 'Search donors, requests, inventory, or pages...';
}

function applySearchToVisibleSection() {
  if (activeSection === 'dashboard') {
    updateOverviewMiniStats();
    renderOverviewInventoryPanel();
    renderOverviewActivityFeed();
    renderOverviewExpirationsTable();
    return;
  }
  if (activeSection === 'donors') {
    renderDonorRows();
    return;
  }
  if (activeSection === 'requests') {
    renderRequestsSection();
    return;
  }
  if (activeSection === 'inventory') {
    renderInventorySection();
    return;
  }
  if (activeSection === 'drives') {
    renderBloodDrivesSection();
    return;
  }
  if (activeSection === 'reports') {
    renderReportsSection();
    return;
  }
  if (activeSection === 'notifications') {
    renderNotificationsSection();
    return;
  }
  if (activeSection === 'activity') {
    renderActivityLogsSection();
  }
}

function navigateToSection(sectionName) {
  activeSection = sectionName;
  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  // Show target section
  const target = document.getElementById('section-' + sectionName);
  if (target) target.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector('.nav-item[data-section="' + sectionName + '"]');
  if (activeNav) activeNav.classList.add('active');

  // Update header title
  const info = sectionTitles[sectionName];
  if (info) {
    const titleEl = document.querySelector('.header-title h1');
    if (titleEl) titleEl.textContent = info.title;
    const headerSub = document.querySelector('.header-title p');
    if (headerSub) headerSub.remove();
  }

  updateSearchPlaceholder(sectionName);
  applySearchToVisibleSection();

  if (sectionName === 'requests') {
    refreshRequestsSection();
  } else if (sectionName === 'donors') {
    loadDonors();
  } else if (sectionName === 'inventory') {
    refreshInventorySection();
  } else if (sectionName === 'dashboard') {
    refreshOverviewStats();
    refreshOverviewPanels();
  } else if (sectionName === 'drives') {
    refreshBloodDrives();
  } else if (sectionName === 'reports') {
    refreshReportsSection();
  } else if (sectionName === 'activity') {
    refreshActivityLogsSection();
  }

  // Close mobile sidebar and clear all menu-open state
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  pageBody.classList.remove('menu-open');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} hours ago`;
  return `${Math.floor(diffMs / day)} days ago`;
}

function getBloodBarClass(percent) {
  if (percent <= 25) return 'critical';
  if (percent <= 50) return 'low';
  if (percent <= 80) return 'ok';
  return 'high';
}

function getCapacityPercent(units) {
  const value = Number(units) || 0;
  const percent = Math.round((value / INVENTORY_TARGET_UNITS) * 100);
  return Math.max(0, Math.min(100, percent));
}

function getInventoryLevelClass(units) {
  const value = Number(units) || 0;
  if (value <= 5) return 'critical';
  if (value <= 15) return 'low';
  return 'ok';
}

function updateOverviewMiniStats() {
  if (typeof Chart === 'undefined') return;

  // ---- Build last-7-days buckets ----
  const DAYS = 7;
  const dayStarts = [];
  const labels = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    dayStarts.push(d);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }

  const donorsSeries = new Array(DAYS).fill(0);
  const requestsSeries = new Array(DAYS).fill(0);
  const fulfilledSeries = new Array(DAYS).fill(0);

  function bucketIndex(dateVal) {
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return -1;
    for (let i = dayStarts.length - 1; i >= 0; i--) {
      if (d >= dayStarts[i]) return i;
    }
    return -1;
  }

  donorCache.forEach(row => {
    const idx = bucketIndex(row?.created_at);
    if (idx >= 0) donorsSeries[idx]++;
  });

  requestsSectionCache.forEach(row => {
    const idx = bucketIndex(row?.request_date || row?.created_at);
    if (idx >= 0) {
      requestsSeries[idx]++;
      if (normalizeRequestStatus(row.status) === 'fulfilled') fulfilledSeries[idx]++;
    }
  });

  // ---- Line Chart: Donors / Requests / Fulfilled ----
  const lineCanvas = document.getElementById('overviewMiniLineChart');
  if (lineCanvas) {
    if (overviewMiniLineChart) {
      overviewMiniLineChart.data.labels = labels;
      overviewMiniLineChart.data.datasets[0].data = donorsSeries;
      overviewMiniLineChart.data.datasets[1].data = requestsSeries;
      overviewMiniLineChart.data.datasets[2].data = fulfilledSeries;
      overviewMiniLineChart.update();
    } else {
      overviewMiniLineChart = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Donors', data: donorsSeries, borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.08)', pointRadius: 2.5, tension: 0.35, fill: true, borderWidth: 1.8 },
            { label: 'Requests', data: requestsSeries, borderColor: '#0284C7', backgroundColor: 'rgba(2,132,199,0.08)', pointRadius: 2.5, tension: 0.35, fill: true, borderWidth: 1.8 },
            { label: 'Fulfilled', data: fulfilledSeries, borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.08)', pointRadius: 2.5, tension: 0.35, fill: true, borderWidth: 1.8 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 9 }, maxTicksLimit: 4 }, grid: { color: 'rgba(148,163,184,0.15)' } },
            x: { ticks: { font: { size: 9 }, maxTicksLimit: 7 }, grid: { display: false } }
          }
        }
      });
    }
  }

  // ---- Bar Chart: Blood stock levels ----
  const allTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const inventoryRows = getInventoryRowsWithAllTypes();
  const barData = allTypes.map(t => Number(inventoryRows.find(r => r.blood_type === t)?.units_available || 0));
  const barColors = barData.map(u => u <= 5 ? 'rgba(239,68,68,0.78)' : u <= 15 ? 'rgba(251,191,36,0.85)' : 'rgba(16,185,129,0.75)');

  const barCanvas = document.getElementById('overviewMiniBarChart');
  if (barCanvas) {
    if (overviewMiniBarChart) {
      overviewMiniBarChart.data.datasets[0].data = barData;
      overviewMiniBarChart.data.datasets[0].backgroundColor = barColors;
      overviewMiniBarChart.update();
    } else {
      overviewMiniBarChart = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: allTypes,
          datasets: [{ label: 'Units', data: barData, backgroundColor: barColors, borderRadius: 4, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw} unit(s)` } } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 9 }, maxTicksLimit: 4 }, grid: { color: 'rgba(148,163,184,0.15)' } },
            x: { ticks: { font: { size: 9 } }, grid: { display: false } }
          }
        }
      });
    }
  }

  // ---- Low stock note ----
  const lowTypes = inventoryRows.filter(r => Number(r.units_available || 0) <= 15).map(r => r.blood_type);
  const noteEl = document.getElementById('overviewMiniLowTypesNote');
  if (noteEl) {
    noteEl.textContent = lowTypes.length > 0
      ? `${formatNumber(lowTypes.length)} blood type(s) need replenishment`
      : 'Inventory status is stable';
  }
}

function getStartOfHour(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function getStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getStartOfWeek(date) {
  const d = getStartOfDay(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function buildTrendAxis(period) {
  const now = new Date();
  const labels = [];
  const bucketStarts = [];

  if (period === 'day') {
    const startHour = getStartOfHour(now);
    startHour.setHours(startHour.getHours() - 23);
    for (let i = 0; i < 24; i++) {
      const point = new Date(startHour);
      point.setHours(startHour.getHours() + i);
      bucketStarts.push(point);
      labels.push(point.toLocaleTimeString('en-US', { hour: 'numeric' }));
    }
  } else if (period === 'quarter') {
    const startWeek = getStartOfWeek(now);
    startWeek.setDate(startWeek.getDate() - (12 * 7));
    for (let i = 0; i < 13; i++) {
      const point = new Date(startWeek);
      point.setDate(startWeek.getDate() + (i * 7));
      bucketStarts.push(point);
      labels.push(point.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
  } else if (period === 'annual') {
    const startMonth = getStartOfMonth(now);
    startMonth.setMonth(startMonth.getMonth() - 11);
    for (let i = 0; i < 12; i++) {
      const point = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      bucketStarts.push(point);
      labels.push(point.toLocaleDateString('en-US', { month: 'short' }));
    }
  } else {
    const startDay = getStartOfDay(now);
    startDay.setDate(startDay.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const point = new Date(startDay);
      point.setDate(startDay.getDate() + i);
      bucketStarts.push(point);
      labels.push(point.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
  }

  return {
    labels,
    bucketStarts,
    startDate: bucketStarts[0] || new Date()
  };
}

function getTrendBucketIndex(value, bucketStarts) {
  if (!value || !bucketStarts.length) return -1;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return -1;

  for (let i = bucketStarts.length - 1; i >= 0; i--) {
    if (date >= bucketStarts[i]) {
      return i;
    }
  }
  return -1;
}

async function loadReportsTrendSeries(period) {
  const axis = buildTrendAxis(period);
  const donorsSeries = new Array(axis.labels.length).fill(0);
  const requestsSeries = new Array(axis.labels.length).fill(0);
  const fulfilledSeries = new Array(axis.labels.length).fill(0);

  if (typeof bloodBank !== 'function') {
    return {
      axis,
      donorsSeries,
      requestsSeries,
      fulfilledSeries
    };
  }

  const startIso = axis.startDate.toISOString();

  const [donorResult, requestResult] = await Promise.all([
    bloodBank()
      .from('donor')
      .select('created_at')
      .gte('created_at', startIso),
    bloodBank()
      .from('blood_request')
      .select('request_date, status')
      .gte('request_date', startIso)
  ]);

  if (donorResult?.error || requestResult?.error) {
    const messages = [donorResult?.error?.message, requestResult?.error?.message].filter(Boolean);
    throw new Error(messages.join(' ') || 'Unable to load report activity.');
  }

  const donorRows = Array.isArray(donorResult?.data) ? donorResult.data : [];
  const requestRows = Array.isArray(requestResult?.data) ? requestResult.data : [];

  donorRows.forEach((row) => {
    const idx = getTrendBucketIndex(row.created_at, axis.bucketStarts);
    if (idx >= 0 && idx < donorsSeries.length) {
      donorsSeries[idx] += 1;
    }
  });

  requestRows.forEach((row) => {
    const idx = getTrendBucketIndex(row.request_date, axis.bucketStarts);
    if (idx >= 0 && idx < requestsSeries.length) {
      requestsSeries[idx] += 1;
      if (normalizeRequestStatus(row.status) === 'fulfilled') {
        fulfilledSeries[idx] += 1;
      }
    }
  });

  return {
    axis,
    donorsSeries,
    requestsSeries,
    fulfilledSeries
  };
}

function renderReportsTrendChart(seriesPayload) {
  const canvas = document.getElementById('reportsTrendChart');
  if (!canvas || typeof Chart === 'undefined') return false;

  const datasets = [
    {
      label: 'Donors',
      data: seriesPayload.donorsSeries,
      borderColor: '#7C3AED',
      backgroundColor: 'rgba(124, 58, 237, 0.14)',
      pointRadius: 2.2,
      pointHoverRadius: 4,
      tension: 0.35,
      fill: false
    },
    {
      label: 'Requests',
      data: seriesPayload.requestsSeries,
      borderColor: '#0284C7',
      backgroundColor: 'rgba(2, 132, 199, 0.14)',
      pointRadius: 2.2,
      pointHoverRadius: 4,
      tension: 0.35,
      fill: false
    },
    {
      label: 'Fulfilled',
      data: seriesPayload.fulfilledSeries,
      borderColor: '#059669',
      backgroundColor: 'rgba(5, 150, 105, 0.14)',
      pointRadius: 2.2,
      pointHoverRadius: 4,
      tension: 0.35,
      fill: false
    }
  ];

  if (reportsTrendChart) {
    reportsTrendChart.data.labels = seriesPayload.axis.labels;
    reportsTrendChart.data.datasets = datasets;
    reportsTrendChart.update();
    reportsTrendChart.resize();
    return true;
  }

  reportsTrendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: seriesPayload.axis.labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 10
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.22)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
  return true;
}

function setReportsChartState(message = '', state = '') {
  const status = document.getElementById('reportsChartState');
  if (!status) return;

  if (!message) {
    status.hidden = true;
    status.className = 'reports-chart-state';
    return;
  }

  const icon = state === 'loading'
    ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>'
    : (state === 'error' ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' : '<i class="fa-solid fa-chart-line" aria-hidden="true"></i>');
  status.hidden = false;
  status.className = `reports-chart-state${state === 'error' ? ' error' : ''}`;
  status.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
}

async function refreshReportsTrendChart({ showLoading = true } = {}) {
  const chartEl = document.getElementById('reportsTrendChart');
  if (!chartEl) return null;

  if (showLoading && !reportsTrendChart) {
    setReportsChartState('Loading report activity...', 'loading');
  }

  try {
    const payload = await loadReportsTrendSeries(reportsTrendPeriod);
    reportsTrendPayload = payload;
    const rendered = renderReportsTrendChart(payload);
    if (!rendered) {
      throw new Error('The chart library could not be loaded. Check your internet connection and reload the page.');
    }

    const activityCount = [...payload.donorsSeries, ...payload.requestsSeries, ...payload.fulfilledSeries]
      .reduce((sum, value) => sum + (Number(value) || 0), 0);
    setReportsChartState(activityCount > 0 ? '' : `No donor or request activity found for this ${getReportPeriodLabel(reportsTrendPeriod).toLowerCase()} view.`);

    requestAnimationFrame(() => reportsTrendChart?.resize());
    return payload;
  } catch (error) {
    console.error('Failed to refresh reports trend chart:', error);
    setReportsChartState(error?.message || 'Unable to load report activity.', 'error');
    return null;
  }
}

function setupReportsPeriodFilters() {
  document.querySelectorAll('[data-report-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = String(btn.getAttribute('data-report-period') || 'month').toLowerCase();
      reportsTrendPeriod = next;

      document.querySelectorAll('[data-report-period]').forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      refreshReportsTrendChart();
    });
  });
}

function scheduleRealtimeReportsRefresh() {
  if (reportsRealtimeTimer) {
    clearTimeout(reportsRealtimeTimer);
  }
  reportsRealtimeTimer = setTimeout(() => {
    if (activeSection === 'reports') {
      refreshReportsSection();
    } else {
      refreshReportsTrendChart({ showLoading: false });
    }
  }, 500);
}

function initReportsRealtime() {
  if (typeof supabaseClient === 'undefined') return;

  reportsRealtimeChannel = supabaseClient
    .channel('reports-live-trends')
    .on('postgres_changes', {
      event: '*',
      schema: 'blood_bank',
      table: 'donor'
    }, scheduleRealtimeReportsRefresh)
    .on('postgres_changes', {
      event: '*',
      schema: 'blood_bank',
      table: 'blood_request'
    }, scheduleRealtimeReportsRefresh)
    .on('postgres_changes', {
      event: '*',
      schema: 'blood_bank',
      table: 'blood_inventory'
    }, () => {
      scheduleRealtimeReportsRefresh();
      refreshOverviewExpirationsTable();
      refreshInventorySection();
      refreshOverviewInventoryPanel();
    })
    .subscribe();
}

function formatCompleteName(person, fallback = '') {
  const fullName = [person?.first_name, person?.middle_name, person?.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return fullName || fallback;
}

function getInventoryRowsWithAllTypes() {
  const allTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  return allTypes.map((type) => {
    const match = inventoryByTypeCache.find((row) => row.blood_type === type);
    return match || { blood_type: type, units_available: 0, last_updated: null, date_stock: null };
  });
}

function getDriveStatusBadge(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'completed') return '<span class="badge completed">Completed</span>';
  if (key === 'full') return '<span class="badge approved">Full</span>';
  if (key === 'urgent') return '<span class="badge urgent">Urgent Recruitment</span>';
  if (key === 'scheduled') return '<span class="badge processing">Scheduled</span>';
  return '<span class="badge pending">Recruiting</span>';
}

function getReportPeriodLabel(period) {
  return ({ day: 'Day', month: 'Month', quarter: 'Quarter', annual: 'Annual' })[period] || 'Month';
}

function formatDriveTime(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const hours = Number(match[1]);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${period}`;
}

// Drive sort state
let drivesSortField = 'date';
let drivesSortAsc = true;

function applyDrivesSort(drives) {
  return [...drives].sort((a, b) => {
    let va, vb;
    switch (drivesSortField) {
      case 'name':
        va = String(a.drive_name || '').toLowerCase();
        vb = String(b.drive_name || '').toLowerCase();
        break;
      case 'target':
        va = Number(a.target_units || 0);
        vb = Number(b.target_units || 0);
        break;
      case 'registered':
        va = Number(a.registered_donors || 0);
        vb = Number(b.registered_donors || 0);
        break;
      case 'status':
        va = String(a.status || '').toLowerCase();
        vb = String(b.status || '').toLowerCase();
        break;
      case 'date':
      default:
        va = a.driveDate ? a.driveDate.getTime() : 0;
        vb = b.driveDate ? b.driveDate.getTime() : 0;
        break;
    }
    if (va < vb) return drivesSortAsc ? -1 : 1;
    if (va > vb) return drivesSortAsc ? 1 : -1;
    return 0;
  });
}


function renderBloodDrivesSection() {
  const tableBody = document.getElementById('drivesTableBody');
  const readinessList = document.getElementById('drivesReadinessList');
  if (!tableBody || !readinessList) return;

  const query = getSearchQuery();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const drives = BLOOD_DRIVE_PLAN.map((drive) => {
    const driveDate = new Date(drive.date);
    driveDate.setHours(0, 0, 0, 0);
    const openSlots = Math.max(0, Number(drive.target_units || 0) - Number(drive.registered_donors || 0));
    const status = String(drive.status || '').toLowerCase();
    const isUpcoming = driveDate >= today && !['completed', 'cancelled'].includes(status);
    return { ...drive, openSlots, isUpcoming, driveDate };
  });

  const upcoming = drives.filter((drive) => drive.isUpcoming);
  const upcomingCount = upcoming.length;
  const targetUnits = upcoming.reduce((sum, drive) => sum + (Number(drive.target_units) || 0), 0);
  const openSlots = upcoming.reduce((sum, drive) => sum + (Number(drive.openSlots) || 0), 0);

  document.getElementById('drivesUpcomingCount').textContent = formatNumber(upcomingCount);
  document.getElementById('drivesTargetUnits').textContent = formatNumber(targetUnits);
  document.getElementById('drivesOpenSlots').textContent = formatNumber(openSlots);
  document.getElementById('drivesPriorityType').textContent = 'All';

  document.getElementById('drivesUpcomingNote').textContent =
    upcomingCount > 0 ? `${formatNumber(upcomingCount)} campaign(s) in pipeline` : 'No scheduled drives';
  document.getElementById('drivesTargetUnitsNote').textContent =
    targetUnits > 0 ? `${formatNumber(targetUnits)} planned unit/s collection goal` : 'No unit targets yet';
  document.getElementById('drivesOpenSlotsNote').textContent =
    openSlots > 0 ? `${formatNumber(openSlots)} donor slot(s) still open` : 'No pending donor slots';
  document.getElementById('drivesPriorityTypeNote').textContent = 'All blood types are welcome';

  const filteredDrives = drives.filter((drive) => includesQuery([
    drive.drive_id,
    drive.drive_name,
    drive.venue,
    drive.focus_type,
    drive.status,
    drive.target_units,
    drive.registered_donors
  ], query));

  const sortedDrives = applyDrivesSort(filteredDrives);

  if (!sortedDrives.length) {
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:32px;">No drive records match the current search.</td></tr>';
  } else {
    tableBody.innerHTML = sortedDrives.map((drive) => {
      return `<tr class="clickable-row" data-drive-id="${escapeHtml(drive.drive_id)}" tabindex="0" role="button" title="Click to view details for ${escapeHtml(drive.drive_name)}">
            <td><strong>${escapeHtml(drive.drive_name)}</strong></td>
            <td>${escapeHtml(formatDateShort(drive.date))}${drive.start_time || drive.end_time ? `<br><small style="color:var(--gray-400);">${escapeHtml([formatDriveTime(drive.start_time), formatDriveTime(drive.end_time)].filter(Boolean).join(' - '))}</small>` : ''}</td>
            <td>${escapeHtml(drive.venue)}</td>
            <td>${formatNumber(drive.target_units)}</td>
            <td>${formatNumber(drive.registered_donors)}</td>
            <td><span class="type-pill">${escapeHtml(drive.focus_type || '--')}</span></td>
            <td>${getDriveStatusBadge(drive.status)}</td>
          </tr>`;
    }).join('');
  }

  const readinessRows = getInventoryRowsWithAllTypes().filter((row) =>
    includesQuery([row.blood_type, row.units_available], query)
  );

  if (!readinessRows.length) {
    readinessList.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:24px 12px;">No readiness rows match the current search.</div>';
    return;
  }

  const headerHtml = `
        <div class="blood-list-header">
          <div class="header-type">Type</div>
          <div class="header-units-wrap">
            <span>BLOOD UNIT/S</span>
            <span>Drive readiness</span>
          </div>
        </div>
      `;

  readinessList.innerHTML = headerHtml + readinessRows.map((row) => {
    const units = Number(row.units_available) || 0;
    const percent = getCapacityPercent(units);
    const barClass = getBloodBarClass(percent);
    const levelClass = getInventoryLevelClass(units);
    const levelText = levelClass === 'critical' ? 'Critical replenishment' : (levelClass === 'low' ? 'Low supply' : 'Ready for campaign');

    return `<div class="blood-row">
          <div class="blood-type-badge">${escapeHtml(row.blood_type || '-')}</div>
          <div class="blood-bar-wrap">
            <div class="blood-bar-top"><span>${formatNumber(units)} unit/s</span><strong>${percent}% readiness</strong></div>
            <div class="blood-bar"><div class="blood-bar-fill ${barClass}" style="width:${percent}%"></div></div>
            <div class="inventory-row-meta">
              <small>${levelText}</small>
              <small>Updated ${escapeHtml(formatRelativeTime(row.last_updated || row.date_stock))}</small>
            </div>
          </div>
        </div>`;
  }).join('');
}

async function refreshBloodDrives() {
  const tableBody = document.getElementById('drivesTableBody');
  if (typeof listBloodDrives !== 'function') {
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:32px;">Blood-drive service is unavailable.</td></tr>';
    return;
  }

  const { data, error } = await listBloodDrives();
  if (error) {
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:32px;">${escapeHtml(error.message || 'Failed to load blood drives.')}</td></tr>`;
    return;
  }

  BLOOD_DRIVE_PLAN.splice(0, BLOOD_DRIVE_PLAN.length, ...(Array.isArray(data) ? data : []));
  renderBloodDrivesSection();
}

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openScheduleDriveModal() {
  const form = document.getElementById('scheduleDriveForm');
  const modal = document.getElementById('scheduleDriveModal');
  const dateInput = document.getElementById('driveDate');
  const msg = document.getElementById('scheduleDriveMsg');
  const submitBtn = document.getElementById('saveScheduleDriveBtn');

  if (form) {
    // Keep default values if freshly opened
    if (!form.dataset.initialized) {
      form.dataset.initialized = 'true';
    }
  }

  if (dateInput) {
    const today = getLocalDateInputValue();
    dateInput.min = today;
    if (!dateInput.value) dateInput.value = today;
  }
  const startTimeInput = document.getElementById('driveStartTime');
  const endTimeInput = document.getElementById('driveEndTime');
  if (startTimeInput && !startTimeInput.value) startTimeInput.value = '08:00';
  if (endTimeInput && !endTimeInput.value) endTimeInput.value = '17:00';
  const targetUnitsInput = document.getElementById('driveTargetUnits');
  if (targetUnitsInput && !targetUnitsInput.value) targetUnitsInput.value = '30';

  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
  if (submitBtn) submitBtn.disabled = false;

  modal?.classList.add('active');
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('driveName')?.focus(), 50);
}

function closeScheduleDriveModal() {
  document.getElementById('scheduleDriveModal')?.classList.remove('active');
  document.body.classList.remove('modal-open');
}

async function handleScheduleDriveSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const msg = document.getElementById('scheduleDriveMsg');
  const submitBtn = document.getElementById('saveScheduleDriveBtn');

  // Trigger native browser validity checks
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const formData = new FormData(form);
  const driveName = String(formData.get('drive_name') || '').trim();
  const driveDate = String(formData.get('drive_date') || '').trim();
  const targetUnits = Number(formData.get('target_units'));
  const startTime = String(formData.get('start_time') || '').trim();
  const endTime = String(formData.get('end_time') || '').trim();
  const venue = String(formData.get('venue') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const focusType = String(formData.get('focus_type') || 'All').trim();
  const notes = String(formData.get('notes') || '').trim();

  const minDate = getLocalDateInputValue();

  if (!driveName) {
    if (msg) {
      msg.textContent = 'Drive name is required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveName');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (!driveDate) {
    if (msg) {
      msg.textContent = 'Drive date is required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveDate');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (driveDate < minDate) {
    if (msg) {
      msg.textContent = 'Drive date cannot be in the past.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveDate');
    input?.focus();
    return;
  }

  if (!targetUnits || isNaN(targetUnits) || targetUnits < 1 || targetUnits > 10000) {
    if (msg) {
      msg.textContent = 'Target donor slots must be a valid number between 1 and 10,000.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveTargetUnits');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (!startTime) {
    if (msg) {
      msg.textContent = 'Start time is required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveStartTime');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (!endTime) {
    if (msg) {
      msg.textContent = 'End time is required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveEndTime');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (endTime <= startTime) {
    if (msg) {
      msg.textContent = 'End time must be later than start time.';
      msg.className = 'form-msg error';
    }
    document.getElementById('driveEndTime')?.focus();
    return;
  }

  if (!venue) {
    if (msg) {
      msg.textContent = 'Venue or collection site is required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveVenue');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (!notes) {
    if (msg) {
      msg.textContent = 'Donor instructions are required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('driveNotes');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  submitBtn.disabled = true;
  if (msg) {
    msg.textContent = 'Scheduling the drive and notifying donors...';
    msg.className = 'form-msg info';
  }

  const payload = {
    drive_name: driveName,
    date: driveDate,
    start_time: startTime || null,
    end_time: endTime || null,
    venue: venue,
    address: address,
    target_units: targetUnits,
    focus_type: focusType || 'All',
    notes: notes
  };

  try {
    const { data, error } = await scheduleBloodDrive(payload);
    if (error) throw new Error(error.message);
    const notified = Number(data?.notified_count || 0);
    if (msg) {
      msg.textContent = `Drive scheduled successfully. ${formatNumber(notified)} donor${notified === 1 ? '' : 's'} notified.`;
      msg.className = 'form-msg success';
    }

    // Activity log
    recordAdminActivity({
      category: 'drives',
      action: 'Scheduled Blood Drive',
      target: payload.drive_name || 'Blood Drive',
      details: `${formatDateShort(payload.date)} · ${payload.venue} · Target: ${formatNumber(payload.target_units)} unit(s) · ${formatNumber(notified)} donor(s) notified`
    });

    form.reset();
    await refreshBloodDrives();
    setTimeout(closeScheduleDriveModal, 1500);
  } catch (error) {
    if (msg) {
      msg.textContent = error?.message || 'Failed to schedule the blood drive.';
      msg.className = 'form-msg error';
    }
  } finally {
    submitBtn.disabled = false;
  }
}

let currentSelectedDriveId = null;

function getDriveTimingInfo(dateStr) {
  if (!dateStr) return { label: 'Scheduled', className: '', icon: 'fa-calendar-check' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { label: 'Happening Today', className: 'timing-today', icon: 'fa-bolt' };
  if (diffDays === 1) return { label: 'Tomorrow', className: '', icon: 'fa-calendar-day' };
  if (diffDays > 1 && diffDays <= 7) return { label: `In ${diffDays} days`, className: '', icon: 'fa-calendar-days' };
  if (diffDays > 7) return { label: `In ${Math.ceil(diffDays / 7)} weeks`, className: '', icon: 'fa-calendar-week' };
  if (diffDays === -1) return { label: 'Yesterday', className: '', icon: 'fa-clock-rotate-left' };
  return { label: `${Math.abs(diffDays)} days ago`, className: '', icon: 'fa-clock-rotate-left' };
}

function openAdminDriveDetails(driveId) {
  const id = Number(driveId);
  const drive = BLOOD_DRIVE_PLAN.find((d) => Number(d.drive_id || d.id) === id);
  if (!drive) return;

  currentSelectedDriveId = id;
  const modal = document.getElementById('adminDriveDetailModal');
  const body = document.getElementById('adminDriveDetailBody');
  const menu = document.getElementById('driveDetailMenu');
  const menuBtn = document.getElementById('driveDetailMenuBtn');

  if (menu) menu.classList.remove('active');
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.classList.remove('active');
  }

  const targetUnits = Math.max(1, Number(drive.target_units || 30));
  const registeredDonors = Math.max(0, Number(drive.registered_donors || 0));
  const openSlots = Math.max(0, targetUnits - registeredDonors);
  const percentFilled = Math.min(100, Math.round((registeredDonors / targetUnits) * 100));
  const timeFormatted = [formatDriveTime(drive.start_time), formatDriveTime(drive.end_time)].filter(Boolean).join(' – ') || 'All day';
  const notesText = drive.notes ? String(drive.notes).trim() : '';
  const timing = getDriveTimingInfo(drive.date);
  const focusLabel = drive.focus_type && drive.focus_type !== 'All' ? `${drive.focus_type} Type Focus` : 'All Blood Types';

  if (body) {
    body.innerHTML = `
      <!-- Hero Campaign Card -->
      <div class="drive-hero-card">
        <div class="drive-hero-top">
          <div class="drive-hero-chips">
            <span class="drive-id-chip"><i class="fa-solid fa-hashtag"></i> Drive #${escapeHtml(drive.drive_id)}</span>
            <span class="drive-timing-chip ${timing.className}"><i class="fa-solid ${timing.icon}"></i> ${escapeHtml(timing.label)}</span>
          </div>
          <div>${getDriveStatusBadge(drive.status)}</div>
        </div>
        <h4 class="drive-hero-title">${escapeHtml(drive.drive_name)}</h4>
        <div class="drive-hero-schedule">
          <span><i class="fa-solid fa-calendar-days"></i> ${escapeHtml(formatDateShort(drive.date))}</span>
          <span><i class="fa-solid fa-clock"></i> ${escapeHtml(timeFormatted)}</span>
        </div>
      </div>

      <!-- 3 Metrics Cards -->
      <div class="drive-stats-grid">
        <div class="drive-stat-card">
          <div class="drive-stat-card-icon stat-icon-target">
            <i class="fa-solid fa-bullseye"></i>
          </div>
          <div class="drive-stat-card-info">
            <span class="drive-stat-card-label">Target Slots</span>
            <strong class="drive-stat-card-val">${formatNumber(targetUnits)}</strong>
            <span class="drive-stat-card-unit">slots planned</span>
          </div>
        </div>

        <div class="drive-stat-card">
          <div class="drive-stat-card-icon stat-icon-registered">
            <i class="fa-solid fa-users"></i>
          </div>
          <div class="drive-stat-card-info">
            <span class="drive-stat-card-label">Registered Donors</span>
            <strong class="drive-stat-card-val stat-val-registered">${formatNumber(registeredDonors)}</strong>
            <span class="drive-stat-card-unit">${registeredDonors === 1 ? 'donor signed up' : 'donors signed up'}</span>
          </div>
        </div>

        <div class="drive-stat-card">
          <div class="drive-stat-card-icon stat-icon-open">
            <i class="fa-solid fa-user-clock"></i>
          </div>
          <div class="drive-stat-card-info">
            <span class="drive-stat-card-label">Open Slots</span>
            <strong class="drive-stat-card-val stat-val-open">${formatNumber(openSlots)}</strong>
            <span class="drive-stat-card-unit">${openSlots === 1 ? 'slot available' : 'slots available'}</span>
          </div>
        </div>
      </div>

      <!-- Location and Focus Type Grid -->
      <div class="drive-info-grid">
        <div class="drive-info-card">
          <div class="drive-info-icon"><i class="fa-solid fa-location-dot"></i></div>
          <div class="drive-info-content">
            <span class="drive-info-label">Venue / Site</span>
            <strong class="drive-info-val">${escapeHtml(drive.venue || 'Facility / Site')}</strong>
            <span class="drive-info-sub">${drive.address ? escapeHtml(drive.address) : '<span style="font-style:italic;color:#9ca3af;">No street address specified</span>'}</span>
          </div>
        </div>

        <div class="drive-info-card">
          <div class="drive-info-icon"><i class="fa-solid fa-droplet"></i></div>
          <div class="drive-info-content">
            <span class="drive-info-label">Focus Blood Type</span>
            <span class="blood-focus-badge"><i class="fa-solid fa-heart-pulse"></i> ${escapeHtml(focusLabel)}</span>
            <span class="drive-info-sub">${drive.focus_type === 'All' ? 'All eligible donors may participate' : `Prioritizing ${escapeHtml(drive.focus_type)} donors`}</span>
          </div>
        </div>
      </div>

      <!-- Instructions Section -->
      <div class="drive-instructions-card">
        <div class="drive-instructions-header">
          <i class="fa-solid fa-clipboard-list"></i>
          <span>Donor Instructions</span>
        </div>
        ${notesText ? `<p class="drive-instructions-body">${escapeHtml(notesText)}</p>` : `<p class="drive-instructions-empty">No special instructions provided for this drive campaign.</p>`}
      </div>

      <!-- Audit Metadata Footer -->
      <div class="drive-audit-bar">
        <span>Campaign Status: <strong style="text-transform:capitalize; color:var(--gray-800);">${escapeHtml(drive.status || 'scheduled')}</strong></span>
        <span>${drive.updated_at ? `Updated ${escapeHtml(formatRelativeTime(drive.updated_at))}` : `Created ${escapeHtml(formatDateShort(drive.created_at || drive.date))}`}</span>
      </div>
    `;
  }

  modal?.classList.add('active');
  document.body.classList.add('modal-open');
}

function closeAdminDriveDetails() {
  const modal = document.getElementById('adminDriveDetailModal');
  const menu = document.getElementById('driveDetailMenu');
  const menuBtn = document.getElementById('driveDetailMenuBtn');
  if (menu) menu.classList.remove('active');
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.classList.remove('active');
  }
  modal?.classList.remove('active');
  document.body.classList.remove('modal-open');
}

function toggleDriveDetailMenu(forceState) {
  const menu = document.getElementById('driveDetailMenu');
  const menuBtn = document.getElementById('driveDetailMenuBtn');
  if (!menu) return;
  const isCurrentlyActive = menu.classList.contains('active');
  const nextState = typeof forceState === 'boolean' ? forceState : !isCurrentlyActive;
  menu.classList.toggle('active', nextState);
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', nextState ? 'true' : 'false');
    menuBtn.classList.toggle('active', nextState);
  }
}

function openEditDriveModal(driveId) {
  const id = Number(driveId || currentSelectedDriveId);
  const drive = BLOOD_DRIVE_PLAN.find((d) => Number(d.drive_id || d.id) === id);
  if (!drive) return;

  currentSelectedDriveId = id;
  toggleDriveDetailMenu(false);

  const modal = document.getElementById('editDriveModal');
  const idInput = document.getElementById('editDriveId');
  const nameInput = document.getElementById('editDriveName');
  const dateInput = document.getElementById('editDriveDate');
  const targetUnitsInput = document.getElementById('editDriveTargetUnits');
  const startTimeInput = document.getElementById('editDriveStartTime');
  const endTimeInput = document.getElementById('editDriveEndTime');
  const venueInput = document.getElementById('editDriveVenue');
  const addressInput = document.getElementById('editDriveAddress');
  const focusTypeInput = document.getElementById('editDriveFocusType');
  const statusInput = document.getElementById('editDriveStatus');
  const notesInput = document.getElementById('editDriveNotes');
  const msg = document.getElementById('editDriveMsg');

  if (idInput) idInput.value = drive.drive_id;
  if (nameInput) nameInput.value = drive.drive_name || '';
  if (dateInput) {
    const rawDate = drive.date || drive.drive_date;
    dateInput.value = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : '';
  }
  if (targetUnitsInput) targetUnitsInput.value = drive.target_units || 30;
  if (startTimeInput) startTimeInput.value = drive.start_time ? drive.start_time.slice(0, 5) : '08:00';
  if (endTimeInput) endTimeInput.value = drive.end_time ? drive.end_time.slice(0, 5) : '17:00';
  if (venueInput) venueInput.value = drive.venue || '';
  if (addressInput) addressInput.value = drive.address || '';
  if (focusTypeInput) focusTypeInput.value = drive.focus_type || 'All';
  if (statusInput) statusInput.value = String(drive.status || 'scheduled').toLowerCase();
  if (notesInput) notesInput.value = drive.notes || '';

  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }

  modal?.classList.add('active');
  document.body.classList.add('modal-open');
  setTimeout(() => nameInput?.focus(), 50);
}

function closeEditDriveModal() {
  document.getElementById('editDriveModal')?.classList.remove('active');
  if (!document.getElementById('adminDriveDetailModal')?.classList.contains('active')) {
    document.body.classList.remove('modal-open');
  }
}

async function handleEditDriveSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const msg = document.getElementById('editDriveMsg');
  const submitBtn = document.getElementById('saveEditDriveBtn');

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const formData = new FormData(form);
  const driveId = Number(formData.get('drive_id'));
  const driveName = String(formData.get('drive_name') || '').trim();
  const driveDate = String(formData.get('drive_date') || '').trim();
  const targetUnits = Number(formData.get('target_units'));
  const startTime = String(formData.get('start_time') || '').trim();
  const endTime = String(formData.get('end_time') || '').trim();
  const venue = String(formData.get('venue') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const focusType = String(formData.get('focus_type') || 'All').trim();
  const status = String(formData.get('status') || 'scheduled').trim();
  const notes = String(formData.get('notes') || '').trim();

  if (!driveName) {
    if (msg) {
      msg.textContent = 'Drive name is required.';
      msg.className = 'form-msg error';
    }
    document.getElementById('editDriveName')?.focus();
    return;
  }

  if (!driveDate) {
    if (msg) {
      msg.textContent = 'Drive date is required.';
      msg.className = 'form-msg error';
    }
    document.getElementById('editDriveDate')?.focus();
    return;
  }

  if (!targetUnits || isNaN(targetUnits) || targetUnits < 1 || targetUnits > 10000) {
    if (msg) {
      msg.textContent = 'Target donor slots must be a valid number between 1 and 10,000.';
      msg.className = 'form-msg error';
    }
    document.getElementById('editDriveTargetUnits')?.focus();
    return;
  }

  if (startTime && endTime && endTime <= startTime) {
    if (msg) {
      msg.textContent = 'End time must be later than start time.';
      msg.className = 'form-msg error';
    }
    document.getElementById('editDriveEndTime')?.focus();
    return;
  }

  if (!venue) {
    if (msg) {
      msg.textContent = 'Venue or collection site is required.';
      msg.className = 'form-msg error';
    }
    document.getElementById('editDriveVenue')?.focus();
    return;
  }

  if (!notes) {
    if (msg) {
      msg.textContent = 'Donor instructions are required.';
      msg.className = 'form-msg error';
    }
    const input = document.getElementById('editDriveNotes');
    input?.focus();
    input?.reportValidity?.();
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (msg) {
    msg.textContent = 'Saving changes...';
    msg.className = 'form-msg info';
  }

  const payload = {
    drive_id: driveId,
    drive_name: driveName,
    date: driveDate,
    start_time: startTime || null,
    end_time: endTime || null,
    venue: venue,
    address: address,
    target_units: targetUnits,
    focus_type: focusType || 'All',
    status: status,
    notes: notes
  };

  try {
    const { error } = await updateBloodDrive(payload);
    if (error) throw new Error(error.message);

    if (msg) {
      msg.textContent = 'Blood drive updated successfully.';
      msg.className = 'form-msg success';
    }

    recordAdminActivity({
      category: 'drives',
      action: 'Updated Blood Drive',
      target: payload.drive_name || 'Blood Drive',
      details: `${formatDateShort(payload.date)} · ${payload.venue} · Status: ${payload.status}`
    });

    await refreshBloodDrives();

    // If details modal is currently open, refresh it with updated values
    if (document.getElementById('adminDriveDetailModal')?.classList.contains('active')) {
      openAdminDriveDetails(driveId);
    }

    setTimeout(closeEditDriveModal, 1200);
  } catch (error) {
    if (msg) {
      msg.textContent = error?.message || 'Failed to update the blood drive.';
      msg.className = 'form-msg error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function openDeleteDriveConfirm(driveId) {
  const id = Number(driveId || currentSelectedDriveId);
  const drive = BLOOD_DRIVE_PLAN.find((d) => Number(d.drive_id || d.id) === id);
  if (!drive) return;

  currentSelectedDriveId = id;
  toggleDriveDetailMenu(false);

  const modal = document.getElementById('deleteDriveConfirmModal');
  const detailsEl = document.getElementById('deleteDriveConfirmDetails');
  const msg = document.getElementById('deleteDriveMsg');
  const confirmBtn = document.getElementById('confirmDeleteDriveBtn');

  if (detailsEl) {
    detailsEl.innerHTML = `
      <strong style="color:var(--blood-dark); font-size:1rem; display:block; margin-bottom:4px;">${escapeHtml(drive.drive_name)}</strong>
      <div style="font-size:.84rem; color:var(--gray-600); line-height:1.4;">
        <span><i class="fa-solid fa-calendar"></i> ${escapeHtml(formatDateShort(drive.date))}</span> &bull; 
        <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(drive.venue)}</span>
      </div>
      <div style="font-size:.8rem; color:var(--blood-rich); margin-top:6px; font-weight:600;">
        ${Number(drive.registered_donors || 0)} registered donor(s) currently linked
      </div>
    `;
  }

  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
  if (confirmBtn) confirmBtn.disabled = false;

  modal?.classList.add('active');
  document.body.classList.add('modal-open');
}

function closeDeleteDriveConfirm() {
  document.getElementById('deleteDriveConfirmModal')?.classList.remove('active');
  if (!document.getElementById('adminDriveDetailModal')?.classList.contains('active')) {
    document.body.classList.remove('modal-open');
  }
}

async function handleConfirmDeleteDrive() {
  if (!currentSelectedDriveId) return;
  const driveId = currentSelectedDriveId;
  const drive = BLOOD_DRIVE_PLAN.find((d) => Number(d.drive_id || d.id) === driveId);
  const driveName = drive?.drive_name || 'Blood Drive';

  const msg = document.getElementById('deleteDriveMsg');
  const confirmBtn = document.getElementById('confirmDeleteDriveBtn');

  if (confirmBtn) confirmBtn.disabled = true;
  if (msg) {
    msg.textContent = 'Deleting blood drive...';
    msg.className = 'form-msg info';
  }

  try {
    const { error } = await deleteBloodDrive(driveId);
    if (error) throw new Error(error.message);

    if (msg) {
      msg.textContent = 'Blood drive deleted successfully.';
      msg.className = 'form-msg success';
    }

    recordAdminActivity({
      category: 'drives',
      action: 'Deleted Blood Drive',
      target: driveName,
      details: `Drive ID #${driveId} deleted by coordinator`
    });

    await refreshBloodDrives();
    setTimeout(() => {
      closeDeleteDriveConfirm();
      closeAdminDriveDetails();
    }, 1000);
  } catch (error) {
    if (msg) {
      msg.textContent = error?.message || 'Failed to delete the blood drive.';
      msg.className = 'form-msg error';
    }
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

function initBloodDrivesRealtime() {
  if (typeof supabaseClient === 'undefined') return;
  bloodDrivesRealtimeChannel = supabaseClient
    .channel(`admin-blood-drives-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'blood_bank', table: 'blood_drive' }, refreshBloodDrives)
    .subscribe();
}

function getReportsSnapshot() {
  const requests = Array.isArray(requestsSectionCache) ? requestsSectionCache : [];
  const donors = Array.isArray(donorCache) ? donorCache : [];
  const inventoryRows = getInventoryRowsWithAllTypes();
  const statusCounts = {
    pending: 0,
    approved: 0,
    needs_clarification: 0,
    rejected: 0,
    cancelled: 0,
    fulfilled: 0
  };

  requests.forEach((row) => {
    const lifecycle = getCommunityLifecycleInfo(row);
    let normalized = normalizeRequestStatus(row.status);
    if (lifecycle.status === 'expired' && normalized !== 'fulfilled') {
      normalized = 'cancelled';
    }
    if (Object.prototype.hasOwnProperty.call(statusCounts, normalized)) {
      statusCounts[normalized] += 1;
    }
  });

  const totalRequests = requests.length;
  const totalUnits = inventoryRows.reduce((sum, row) => sum + (Number(row.units_available) || 0), 0);
  const inventoryCapacity = INVENTORY_TARGET_UNITS * 8;

  return {
    totalDonors: donors.length,
    totalRequests,
    fulfilled: statusCounts.fulfilled,
    fulfillmentRate: totalRequests > 0 ? Math.round((statusCounts.fulfilled / totalRequests) * 100) : 0,
    totalUnits,
    inventoryCoverage: inventoryCapacity > 0 ? Math.min(100, Math.round((totalUnits / inventoryCapacity) * 100)) : 0,
    inventoryRows,
    statusCounts
  };
}

function getSimplifiedRequestStatusRows(statusCounts) {
  const counts = statusCounts || {};
  return [
    {
      label: 'Awaiting Completion',
      count: (counts.pending || 0) + (counts.approved || 0) + (counts.needs_clarification || 0)
    },
    { label: 'Fulfilled', count: counts.fulfilled || 0 },
    {
      label: 'Closed',
      count: (counts.rejected || 0) + (counts.cancelled || 0) + (counts.expired || 0)
    }
  ];
}

async function refreshReportsSection() {
  if (reportsRefreshPromise) return reportsRefreshPromise;

  const exportButton = document.getElementById('exportReportsBtn');
  const exportStatus = document.getElementById('reportsExportStatus');
  if (exportButton) exportButton.disabled = true;
  if (exportStatus) exportStatus.textContent = 'Refreshing report data...';

  reportsRefreshPromise = (async () => {
    const [donorsResult, requestsResult, inventoryResult, trendPayload] = await Promise.all([
      listDonors(),
      getOverviewRecentRequests(1000),
      getInventoryDashboardData(),
      refreshReportsTrendChart()
    ]);

    const errors = [];
    if (donorsResult?.error) errors.push(donorsResult.error.message || 'donors');
    else if (Array.isArray(donorsResult?.data)) donorCache = donorsResult.data;

    if (requestsResult?.error) errors.push(requestsResult.error.message || 'requests');
    else if (Array.isArray(requestsResult?.data)) requestsSectionCache = requestsResult.data;

    if (inventoryResult?.error) errors.push(inventoryResult.error.message || 'inventory');
    else if (Array.isArray(inventoryResult?.data?.by_type)) inventoryByTypeCache = inventoryResult.data.by_type;

    renderReportsSection();
    if (reportsTrendChart) requestAnimationFrame(() => reportsTrendChart.resize());

    if (errors.length) {
      if (exportStatus) exportStatus.textContent = 'Some report data could not be refreshed.';
      console.error('Reports refresh completed with errors:', errors);
      return false;
    }

    if (trendPayload) reportsTrendPayload = trendPayload;
    if (exportStatus) exportStatus.textContent = '';
    return true;
  })().catch((error) => {
    console.error('Failed to refresh reports:', error);
    if (exportStatus) exportStatus.textContent = 'Could not refresh report data.';
    return false;
  }).finally(() => {
    reportsRefreshPromise = null;
    if (exportButton) exportButton.disabled = false;
  });

  return reportsRefreshPromise;
}

function buildReportsPrintDocument() {
  const snapshot = getReportsSnapshot();
  const generatedAt = new Date();
  const periodLabel = getReportPeriodLabel(reportsTrendPeriod);
  const statusRows = getSimplifiedRequestStatusRows(snapshot.statusCounts)
    .map((row) => `<tr><td>${escapeHtml(row.label)}</td><td class="number">${formatNumber(row.count)}</td></tr>`)
    .join('');

  const inventoryRows = snapshot.inventoryRows.map((row) => {
    const units = Number(row.units_available) || 0;
    const level = getInventoryLevelClass(units);
    const label = level === 'critical' ? 'Critical' : (level === 'low' ? 'Low' : 'Adequate');
    return `<tr><td><strong>${escapeHtml(row.blood_type || '-')}</strong></td><td class="number">${formatNumber(units)}</td><td><span class="level ${escapeHtml(level)}">${label}</span></td></tr>`;
  }).join('');

  const trendRows = reportsTrendPayload?.axis?.labels?.length
    ? reportsTrendPayload.axis.labels.map((label, index) => `<tr>
        <td>${escapeHtml(label)}</td>
        <td class="number">${formatNumber(reportsTrendPayload.donorsSeries[index] || 0)}</td>
        <td class="number">${formatNumber(reportsTrendPayload.requestsSeries[index] || 0)}</td>
        <td class="number">${formatNumber(reportsTrendPayload.fulfilledSeries[index] || 0)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">No activity recorded for this reporting period.</td></tr>';

  const overviewRows = [
    ['Total donors', formatNumber(snapshot.totalDonors), 'Profiles in registry'],
    ['Total requests', formatNumber(snapshot.totalRequests), 'Requests tracked'],
    ['Fulfillment rate', `${snapshot.fulfillmentRate}%`, `${formatNumber(snapshot.fulfilled)} request(s) fulfilled`],
    ['Inventory units', formatNumber(snapshot.totalUnits), 'Across all blood types'],
    ['Inventory coverage', `${snapshot.inventoryCoverage}%`, 'Against configured target']
  ].map(([metric, value, note]) => `<tr><td>${escapeHtml(metric)}</td><td class="number"><strong>${escapeHtml(value)}</strong></td><td>${escapeHtml(note)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BloodConnect Report Summary</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f5f9; color: #172033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .toolbar { max-width: 1100px; margin: 20px auto 0; display: flex; justify-content: flex-end; }
    .print-button { border: 0; border-radius: 9px; padding: 10px 16px; color: #fff; background: #8b0000; font-size: 14px; font-weight: 700; cursor: pointer; }
    .report { max-width: 1100px; margin: 16px auto 28px; padding: 42px; background: #fff; box-shadow: 0 12px 34px rgba(15, 23, 42, .12); }
    .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 3px solid #8b0000; }
    .brand { color: #8b0000; font-size: 13px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    h1 { margin: 7px 0 5px; color: #172033; font-size: 28px; line-height: 1.15; }
    .subtitle, .metadata { margin: 0; color: #667085; font-size: 13px; line-height: 1.6; }
    .metadata { min-width: 210px; text-align: right; }
    .metadata strong { color: #344054; }
    .sections { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
    .section { margin-top: 24px; break-inside: avoid; }
    .section.wide { grid-column: 1 / -1; }
    h2 { margin: 0 0 11px; color: #172033; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { padding: 10px 12px; color: #667085; background: #f8fafc; border-bottom: 1px solid #dbe3ed; font-size: 10px; letter-spacing: .06em; text-align: left; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #edf1f5; }
    .number { text-align: right; font-variant-numeric: tabular-nums; }
    .level { display: inline-block; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 800; }
    .level.critical { background: #fef2f2; color: #b91c1c; }
    .level.low { background: #fff7ed; color: #c2410c; }
    .level.adequate { background: #ecfdf5; color: #047857; }
    .empty { color: #667085; text-align: center; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #98a2b3; font-size: 10px; text-align: center; }
    .overview td:last-child { color: #667085; font-size: 11px; }
    @media (max-width: 760px) { .report { margin: 0; padding: 24px; } .header { display: block; } .metadata { margin-top: 16px; text-align: left; } .sections { display: block; } }
    @media print { @page { size: A4; margin: 12mm; } body { background: #fff; } .toolbar { display: none; } .report { max-width: none; margin: 0; padding: 0; box-shadow: none; } .section { margin-top: 18px; } }
  </style>
</head>
<body>
  <div class="toolbar"><button class="print-button" onclick="window.print()">Print / Save as PDF</button></div>
  <main class="report">
    <header class="header">
      <div><div class="brand">BloodConnect</div><h1>Operational Report Summary</h1><p class="subtitle">Blood donation and inventory performance overview</p></div>
      <p class="metadata"><strong>Generated:</strong> ${escapeHtml(generatedAt.toLocaleString('en-US'))}<br><strong>Activity view:</strong> ${escapeHtml(periodLabel)}</p>
    </header>
    <div class="sections">
      <section class="section wide overview"><h2>Report Overview</h2><table><thead><tr><th>Metric</th><th class="number">Value</th><th>Details</th></tr></thead><tbody>${overviewRows}</tbody></table></section>
      <section class="section"><h2>Request Status Breakdown</h2><table><thead><tr><th>Status</th><th class="number">Requests</th></tr></thead><tbody>${statusRows}</tbody></table></section>
      <section class="section"><h2>Inventory by Blood Type</h2><table><thead><tr><th>Blood Type</th><th class="number">Units</th><th>Level</th></tr></thead><tbody>${inventoryRows}</tbody></table></section>
      <section class="section wide"><h2>${escapeHtml(periodLabel)} Activity Trend</h2><table><thead><tr><th>Period</th><th class="number">Donors</th><th class="number">Requests</th><th class="number">Fulfilled</th></tr></thead><tbody>${trendRows}</tbody></table></section>
    </div>
    <footer class="footer">Generated by BloodConnect · Web-Based Blood Donation &amp; Inventory Management System</footer>
  </main>
</body>
</html>`;
}

async function exportReportsSummary() {
  const button = document.getElementById('exportReportsBtn');
  const status = document.getElementById('reportsExportStatus');
  const buttonLabel = button?.querySelector('span');
  const previewWindow = window.open('', '_blank');

  if (button) button.disabled = true;
  if (buttonLabel) buttonLabel.textContent = 'Preparing...';
  if (status) status.textContent = 'Updating data before export...';

  try {
    if (!previewWindow) throw new Error('Your browser blocked the report preview. Allow pop-ups for this page and try again.');
    previewWindow.document.write('<title>Preparing BloodConnect report...</title><p style="font-family:system-ui;padding:24px">Preparing your report...</p>');
    previewWindow.document.close();

    const refreshed = await refreshReportsSection();
    if (!refreshed) throw new Error('The latest report data could not be loaded.');

    previewWindow.document.open();
    previewWindow.document.write(buildReportsPrintDocument());
    previewWindow.document.close();
    previewWindow.focus();
    setTimeout(() => previewWindow.print(), 350);
    if (status) status.textContent = 'Print dialog opened — choose “Save as PDF” to export.';
    // Activity log
    recordAdminActivity({
      category: 'reports',
      action: 'Exported Dashboard Report Summary',
      target: 'Reports & Analytics',
      details: `Period: ${getReportPeriodLabel(reportsTrendPeriod)} view`
    });
    setTimeout(() => {
      if (status?.textContent.startsWith('Print dialog opened')) status.textContent = '';
    }, 3500);
  } catch (error) {
    console.error('Failed to export reports summary:', error);
    if (previewWindow && !previewWindow.closed) previewWindow.close();
    if (status) status.textContent = error?.message || 'Could not export the summary.';
  } finally {
    if (button) button.disabled = false;
    if (buttonLabel) buttonLabel.textContent = 'Export Summary';
  }
}

document.getElementById('scheduleDriveBtn')?.addEventListener('click', openScheduleDriveModal);
document.getElementById('closeScheduleDriveBtn')?.addEventListener('click', closeScheduleDriveModal);
document.getElementById('cancelScheduleDriveBtn')?.addEventListener('click', closeScheduleDriveModal);
document.getElementById('scheduleDriveForm')?.addEventListener('submit', handleScheduleDriveSubmit);
document.getElementById('scheduleDriveForm')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target && event.target.tagName === 'INPUT') {
    event.preventDefault();
    const form = event.currentTarget;
    const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea, button[type="submit"]'));
    const index = inputs.indexOf(event.target);
    if (index >= 0 && index < inputs.length - 1) {
      inputs[index + 1].focus();
    } else {
      form.requestSubmit();
    }
  }
});
document.getElementById('scheduleDriveForm')?.addEventListener('input', () => {
  const msg = document.getElementById('scheduleDriveMsg');
  if (msg && msg.classList.contains('error')) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
});
document.getElementById('scheduleDriveModal')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeScheduleDriveModal();
});

// Campaign calendar row click to open drive details
const drivesTableBodyEl = document.getElementById('drivesTableBody');
drivesTableBodyEl?.addEventListener('click', (event) => {
  const row = event.target.closest('tr.clickable-row');
  if (row && row.dataset.driveId) {
    openAdminDriveDetails(row.dataset.driveId);
  }
});
drivesTableBodyEl?.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr.clickable-row')) {
    event.preventDefault();
    if (event.target.dataset.driveId) {
      openAdminDriveDetails(event.target.dataset.driveId);
    }
  }
});

// Sort controls
function updateDrivesSortDirBtn() {
  const btn = document.getElementById('drivesSortDir');
  if (!btn) return;
  const isText = ['name', 'status'].includes(drivesSortField);
  if (drivesSortAsc) {
    btn.innerHTML = isText ? '<i class="fa-solid fa-arrow-up-a-z"></i>' : '<i class="fa-solid fa-arrow-up-1-9"></i>';
    btn.setAttribute('aria-label', 'Currently ascending – click for descending');
    btn.title = 'Ascending';
  } else {
    btn.innerHTML = isText ? '<i class="fa-solid fa-arrow-down-z-a"></i>' : '<i class="fa-solid fa-arrow-down-9-1"></i>';
    btn.setAttribute('aria-label', 'Currently descending – click for ascending');
    btn.title = 'Descending';
  }
}

document.getElementById('drivesSortBy')?.addEventListener('change', (e) => {
  drivesSortField = e.target.value;
  updateDrivesSortDirBtn();
  renderBloodDrivesSection();
});

document.getElementById('drivesSortDir')?.addEventListener('click', () => {
  drivesSortAsc = !drivesSortAsc;
  updateDrivesSortDirBtn();
  renderBloodDrivesSection();
});


// Drive details modal listeners
document.getElementById('closeDriveDetailBtn')?.addEventListener('click', closeAdminDriveDetails);
document.getElementById('closeDriveDetailFooterBtn')?.addEventListener('click', closeAdminDriveDetails);
document.getElementById('adminDriveDetailModal')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeAdminDriveDetails();
});

// Three-dots dropdown menu
document.getElementById('driveDetailMenuBtn')?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleDriveDetailMenu();
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.drive-menu-wrapper')) {
    toggleDriveDetailMenu(false);
  }
});

// Edit drive triggers
document.getElementById('driveMenuEditBtn')?.addEventListener('click', () => openEditDriveModal(currentSelectedDriveId));
document.getElementById('driveDetailQuickEditBtn')?.addEventListener('click', () => openEditDriveModal(currentSelectedDriveId));

// Delete drive triggers
document.getElementById('driveMenuDeleteBtn')?.addEventListener('click', () => openDeleteDriveConfirm(currentSelectedDriveId));
document.getElementById('driveDetailQuickDeleteBtn')?.addEventListener('click', () => openDeleteDriveConfirm(currentSelectedDriveId));

// Edit modal listeners
document.getElementById('closeEditDriveBtn')?.addEventListener('click', closeEditDriveModal);
document.getElementById('cancelEditDriveBtn')?.addEventListener('click', closeEditDriveModal);
document.getElementById('editDriveForm')?.addEventListener('submit', handleEditDriveSubmit);
document.getElementById('editDriveForm')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target && event.target.tagName === 'INPUT') {
    event.preventDefault();
    const form = event.currentTarget;
    const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea, button[type="submit"]'));
    const index = inputs.indexOf(event.target);
    if (index >= 0 && index < inputs.length - 1) {
      inputs[index + 1].focus();
    } else {
      form.requestSubmit();
    }
  }
});
document.getElementById('editDriveForm')?.addEventListener('input', () => {
  const msg = document.getElementById('editDriveMsg');
  if (msg && msg.classList.contains('error')) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
});
document.getElementById('editDriveModal')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeEditDriveModal();
});

// Delete confirmation listeners
document.getElementById('closeDeleteDriveConfirmBtn')?.addEventListener('click', closeDeleteDriveConfirm);
document.getElementById('cancelDeleteDriveBtn')?.addEventListener('click', closeDeleteDriveConfirm);
document.getElementById('confirmDeleteDriveBtn')?.addEventListener('click', handleConfirmDeleteDrive);
document.getElementById('deleteDriveConfirmModal')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeDeleteDriveConfirm();
});

function renderReportsSection() {
  const requestBody = document.getElementById('reportsRequestBreakdownBody');
  const inventoryBody = document.getElementById('reportsInventoryBreakdownBody');
  if (!requestBody || !inventoryBody) return;

  const query = getSearchQuery();
  const requests = Array.isArray(requestsSectionCache) ? requestsSectionCache : [];
  const donors = Array.isArray(donorCache) ? donorCache : [];
  const inventoryRows = getInventoryRowsWithAllTypes();

  const statusCounts = {
    pending: 0,
    approved: 0,
    needs_clarification: 0,
    rejected: 0,
    cancelled: 0,
    fulfilled: 0
  };

  requests.forEach((row) => {
    const lifecycle = getCommunityLifecycleInfo(row);
    let normalized = normalizeRequestStatus(row.status);
    if (lifecycle.status === 'expired' && normalized !== 'fulfilled') {
      normalized = 'cancelled';
    }
    if (Object.prototype.hasOwnProperty.call(statusCounts, normalized)) {
      statusCounts[normalized] += 1;
    }
  });

  const totalDonors = donors.length;
  const totalRequests = requests.length;
  const fulfilled = statusCounts.fulfilled;
  const fulfillmentRate = totalRequests > 0 ? Math.round((fulfilled / totalRequests) * 100) : 0;
  const totalUnits = inventoryRows.reduce((sum, row) => sum + (Number(row.units_available) || 0), 0);
  const inventoryCapacity = INVENTORY_TARGET_UNITS * 8;
  const inventoryCoverage = inventoryCapacity > 0 ? Math.min(100, Math.round((totalUnits / inventoryCapacity) * 100)) : 0;

  document.getElementById('reportsTotalDonors').textContent = formatNumber(totalDonors);
  document.getElementById('reportsTotalRequests').textContent = formatNumber(totalRequests);
  document.getElementById('reportsFulfillmentRate').textContent = `${fulfillmentRate}%`;
  document.getElementById('reportsInventoryCoverage').textContent = `${inventoryCoverage}%`;

  document.getElementById('reportsTotalDonorsNote').textContent =
    totalDonors > 0 ? `${formatNumber(totalDonors)} donor profile(s) in registry` : 'No donor records yet';
  document.getElementById('reportsTotalRequestsNote').textContent =
    totalRequests > 0 ? `${formatNumber(totalRequests)} request record(s) tracked` : 'No request records yet';
  document.getElementById('reportsFulfillmentRateNote').textContent =
    totalRequests > 0 ? `${formatNumber(fulfilled)} request(s) fulfilled` : 'No fulfillment data yet';
  document.getElementById('reportsInventoryCoverageNote').textContent =
    totalUnits > 0 ? `${formatNumber(totalUnits)} total unit/s across all types` : 'No inventory data yet';

  const statusRows = getSimplifiedRequestStatusRows(statusCounts)
    .filter((row) => includesQuery([row.label, row.count], query));

  if (!statusRows.length) {
    requestBody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--gray-400);padding:32px;">No request report rows match the current search.</td></tr>';
  } else {
    requestBody.innerHTML = statusRows.map((row) => `<tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${formatNumber(row.count)}</td>
        </tr>`).join('');
  }

  const inventoryReportRows = inventoryRows.filter((row) => includesQuery([
    row.blood_type,
    row.units_available,
    getInventoryLevelClass(row.units_available)
  ], query));

  if (!inventoryReportRows.length) {
    inventoryBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:32px;">No inventory report rows match the current search.</td></tr>';
  } else {
    inventoryBody.innerHTML = inventoryReportRows.map((row) => {
      const units = Number(row.units_available) || 0;
      const levelClass = getInventoryLevelClass(units);
      const levelLabel = levelClass === 'critical' ? 'Critical' : (levelClass === 'low' ? 'Low' : 'Adequate');
      const badgeClass = levelClass === 'critical' ? 'urgent' : (levelClass === 'low' ? 'pending' : 'completed');

      return `<tr>
            <td><span class="type-pill">${escapeHtml(row.blood_type || '-')}</span></td>
            <td>${formatNumber(units)}</td>
            <td><span class="badge ${badgeClass}">${levelLabel}</span></td>
          </tr>`;
    }).join('');
  }

  document.getElementById('reportsGeneratedAt').textContent = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function normalizeRequestStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['approved', 'processing', 'in progress', 'in_progress'].includes(raw)) return 'approved';
  if (['needs clarification', 'needs_clarification', 'clarification'].includes(raw)) return 'needs_clarification';
  if (['cancelled', 'canceled', 'expired'].includes(raw)) return 'cancelled';
  if (['rejected', 'declined'].includes(raw)) return 'rejected';
  if (['fulfilled', 'complete', 'completed', 'done', 'closed'].includes(raw)) return 'fulfilled';
  return 'pending';
}

function getCommunityLifecycleInfo(row) {
  const storedStatus = String(row?.community_status || '').toLowerCase();
  const operationalStatus = normalizeRequestStatus(row?.status);
  const isReplacement = String(row?.request_type || '').toLowerCase() === 'replacement';
  const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;

  if (operationalStatus === 'fulfilled' || storedStatus === 'fulfilled') {
    return { status: 'fulfilled', label: 'Community Fulfilled', className: 'completed' };
  }
  if (operationalStatus === 'cancelled') {
    return { status: 'cancelled', label: 'Cancelled by requester', className: 'rejected' };
  }
  const timedOut = !isReplacement && expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
  if (storedStatus === 'expired' || timedOut) {
    return { status: 'expired', label: 'Community Expired', className: 'rejected' };
  }
  if (storedStatus === 'covered') {
    return { status: 'covered', label: 'Community Covered', className: 'approved' };
  }
  return { status: 'active', label: 'Community Active', className: 'pending' };
}

function isUrgentRequest(row) {
  if (String(row?.request_type || '').toLowerCase() === 'replacement') return false;
  const urgency = String(row?.urgency_level || '').toLowerCase();
  return urgency.includes('urgent') || urgency.includes('emergency') || urgency.includes('critical');
}

function formatRequestRequirement(row) {
  const units = Number(row?.quantity || row?.units_needed || 1);
  if (row?.request_type === 'replacement') {
    return `${units} replacement donor${units === 1 ? '' : 's'} (any eligible blood type)`;
  }
  return `${units} unit${units === 1 ? '' : 's'} of ${row?.blood_type_needed || row?.blood_type || '?'}`;
}

function isPendingRequest(row) {
  const status = normalizeRequestStatus(row?.status);
  return status === 'pending';
}

function getRequestStatusInfo(status) {
  const normalized = normalizeRequestStatus(status);
  const map = {
    pending: {
      className: 'pending',
      label: '<i class="fa-solid fa-clock"></i> Pending'
    },
    approved: {
      className: 'approved',
      label: '<i class="fa-solid fa-clipboard-check"></i> Verified by coordinator'
    },
    needs_clarification: {
      className: 'needs-clarification',
      label: '<i class="fa-solid fa-circle-question"></i> Needs Clarification'
    },
    rejected: {
      className: 'rejected',
      label: '<i class="fa-solid fa-circle-xmark"></i> Rejected'
    },
    cancelled: {
      className: 'rejected',
      label: '<i class="fa-solid fa-ban"></i> Cancelled by requester'
    },
    fulfilled: {
      className: 'completed',
      label: '<i class="fa-solid fa-check"></i> Coordination Closed'
    }
  };
  return map[normalized] || map.pending;
}

function applyOverviewExpirationsVisibility() {
  const wrap = document.getElementById('overviewExpirationsWrap');
  const btn = document.getElementById('overviewExpirationsToggleBtn');
  if (!wrap || !btn) return;

  wrap.classList.toggle('is-collapsed', overviewExpirationsCollapsed);
  btn.textContent = overviewExpirationsCollapsed ? 'Show' : 'Hide';
}

function toggleOverviewExpirations() {
  overviewExpirationsCollapsed = !overviewExpirationsCollapsed;
  applyOverviewExpirationsVisibility();
}

function getValidRequestTransitions(currentStatus) {
  const normalized = normalizeRequestStatus(currentStatus);
  const transitions = {
    pending: ['approved', 'needs_clarification', 'rejected'],
    approved: ['fulfilled', 'needs_clarification', 'rejected'],
    needs_clarification: [],
    rejected: [],
    cancelled: [],
    fulfilled: []
  };
  return transitions[normalized] || [];
}

const RED_CELL_COMPATIBILITY = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']
};

function getTransitionReasonOptions(targetStatus, request = null) {
  if (targetStatus === 'approved') {
    const hasUploadedDocument = Boolean(request?.verification_support?.storage_path);
    return [
      { value: 'uploaded_document', label: 'Uploaded supporting document reviewed', disabled: !hasUploadedDocument },
      { value: 'physical_document', label: 'Physical document reviewed in person' },
      { value: 'facility_confirmation', label: 'Confirmed with facility representative' },
      { value: 'other', label: 'Other documented verification' }
    ];
  }
  const map = {
    needs_clarification: ['Missing patient details', 'Quantity clarification needed', 'Supporting document required', 'Contact information incomplete'],
    rejected: ['No stock available', 'Invalid request details', 'Duplicate request', 'Policy non-compliance'],
    fulfilled: ['Donation confirmed by authorized facility', 'Replacement requirement completed', 'Community coordination case closed'],
    pending: ['Clarification received', 'Re-opened for review']
  };
  return (map[targetStatus] || ['Status updated by admin']).map((label) => ({ value: label, label }));
}

function updateRequestsStatsCards(sourceRows = []) {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const total = rows.length;
  const pending = rows.filter((row) => normalizeRequestStatus(row.status) === 'pending').length;
  const approved = rows.filter((row) => normalizeRequestStatus(row.status) === 'approved').length;
  const rejected = rows.filter((row) => normalizeRequestStatus(row.status) === 'rejected').length;
  const clarification = rows.filter((row) => normalizeRequestStatus(row.status) === 'needs_clarification').length;
  const fulfilled = rows.filter((row) => normalizeRequestStatus(row.status) === 'fulfilled').length;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('requestsAllCount', formatNumber(total));
  setText('requestsPendingCount', formatNumber(pending));
  setText('requestsApprovedCount', formatNumber(approved));
  setText('requestsRejectedCount', formatNumber(rejected));
  setText('requestsClarificationCount', formatNumber(clarification));
  setText('requestsFulfilledCount', formatNumber(fulfilled));
}

function getPendingUrgentCountFromCache() {
  return overviewRequestsCache.filter((row) => isUrgentRequest(row) && isPendingRequest(row)).length;
}

function setOverviewUrgentPendingKpi(value) {
  const kpiValue = Number(value) || 0;
  const urgentValueEl = document.getElementById('overviewKpiUrgentPending');
  const urgentNoteEl = document.getElementById('overviewKpiUrgentPendingNote');
  if (urgentValueEl) urgentValueEl.textContent = formatNumber(kpiValue);
  if (urgentNoteEl) {
    urgentNoteEl.textContent = kpiValue > 0
      ? `${formatNumber(kpiValue)} urgent request(s) need action`
      : 'No urgent pending requests';
  }
}

function getRequestBadge(urgencyLevel, status) {
  const statusInfo = getRequestStatusInfo(status);
  const urgent = isUrgentRequest({ urgency_level: urgencyLevel });
  if (urgent && normalizeRequestStatus(status) !== 'fulfilled' && normalizeRequestStatus(status) !== 'rejected') {
    return { className: 'urgent', label: '<i class="fa-solid fa-circle-exclamation"></i> Urgent' };
  }
  return statusInfo;
}

function getAvatarClassFromBloodType(type) {
  const group = String(type || '').toUpperCase();
  if (group.startsWith('AB')) return 'ab';
  if (group.startsWith('A')) return 'a';
  if (group.startsWith('B')) return 'b';
  return 'o';
}

function setSidebarBadge(sectionName, value, urgent = false) {
  const badge = document.querySelector(`.nav-item[data-section="${sectionName}"] .nav-badge`);
  if (!badge) return;
  badge.textContent = formatNumber(value);
  badge.classList.toggle('urgent', urgent && Number(value) > 0);
}

async function refreshOverviewStats() {
  const { data, error } = await getAdminOverviewStats();
  if (error || !data) {
    console.error('Failed to refresh overview stats:', error);
    return;
  }

  latestOverviewStats = data;
  const donorsCount = Number(data.donors_count || 0);
  const totalStock = Number(data.total_units || 0);
  const todayScheduled = Number(
    data.today_scheduled_donations ??
    data.todays_scheduled_donations ??
    data.scheduled_donations_today ??
    0
  );
  const urgentFromStats = Number(
    data.pending_urgent_requests ??
    data.urgent_pending_requests ??
    data.urgent_requests_count ??
    NaN
  );
  const pendingUrgent = Number.isFinite(urgentFromStats)
    ? urgentFromStats
    : getPendingUrgentCountFromCache();

  document.getElementById('overviewKpiTotalDonors').textContent = formatNumber(donorsCount);
  document.getElementById('overviewKpiTodayScheduled').textContent = formatNumber(todayScheduled);
  document.getElementById('overviewKpiTotalStock').textContent = formatNumber(totalStock);

  document.getElementById('overviewKpiTotalDonorsNote').textContent =
    donorsCount > 0 ? 'Live donor count from registry' : 'No donor records yet';
  document.getElementById('overviewKpiTodayScheduledNote').textContent =
    todayScheduled > 0 ? 'Confirmed schedule count for today' : 'No schedules for today';
  document.getElementById('overviewKpiTotalStockNote').textContent =
    totalStock > 0 ? 'Live total across blood inventory' : 'No inventory data yet';

  setOverviewUrgentPendingKpi(pendingUrgent);

  const pendingRequestsCount = requestsSectionCache.length > 0
    ? requestsSectionCache.filter((r) => normalizeRequestStatus(r.status) === 'pending').length
    : Number(data.pending_requests_count ?? 0);
  const hasPending = pendingRequestsCount > 0;

  setSidebarBadge('donors', donorsCount);
  setSidebarBadge('requests', pendingRequestsCount, hasPending);

  updateOverviewMiniStats();
  renderReportsSection();
}

async function refreshOverviewInventoryPanel() {
  const container = document.getElementById('overviewInventoryChart');
  if (!container) return;

  const { data, error } = await getOverviewInventoryByBloodType();
  if (error) {
    console.error('Failed to refresh overview inventory:', error);
    return;
  }

  overviewInventoryCache = Array.isArray(data) ? data : [];
  renderOverviewInventoryPanel();
}

function renderOverviewInventoryPanel() {
  const container = document.getElementById('overviewInventoryChart');
  if (!container) return;

  const query = getSearchQuery();
  const allTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const mergedRows = allTypes.map(type => {
    return overviewInventoryCache.find(r => r.blood_type === type) || { blood_type: type, units_available: 0, last_updated: null };
  });
  const rows = mergedRows.filter((row) => includesQuery([row.blood_type, row.units_available], query));

  if (!rows.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--slate-400);padding:24px 12px;">No blood inventory data yet.</div>';
    return;
  }

  const headerHtml = `
        <div class="blood-list-header">
          <div class="header-type">Type</div>
          <div class="header-units-wrap">
            <span>BLOOD UNIT/S</span>
            <span>Target</span>
          </div>
        </div>
      `;

  container.innerHTML = headerHtml + rows.map((row) => {
    const units = Number(row.units_available) || 0;
    const percent = getCapacityPercent(units);
    const barClass = percent <= 30 ? 'critical' : (percent <= 60 ? 'low' : 'ok');

    return `<div class="blood-row">
          <div class="blood-type-badge">${escapeHtml(row.blood_type || '-')}</div>
          <div class="blood-bar-wrap">
            <div class="blood-bar-top"><span>${formatNumber(units)} unit/s</span><strong>${percent}% of target (${INVENTORY_TARGET_UNITS})</strong></div>
            <div class="blood-bar"><div class="blood-bar-fill ${barClass}" style="width:${percent}%"></div></div>
            <div class="inventory-row-meta">
              <small>${barClass === 'critical' ? 'Critical restock level' : (barClass === 'low' ? 'Low but stable' : 'Safe inventory level')}</small>
              <small>Type ${escapeHtml(row.blood_type || '-')}</small>
            </div>
          </div>
        </div>`;
  }).join('');
}

async function refreshOverviewRequestsPanel() {
  const { data, error } = await getOverviewRecentRequests(12);
  if (error) {
    console.error('Failed to refresh overview requests:', error);
    return;
  }

  overviewRequestsCache = Array.isArray(data) ? data : [];
  if (requestsSectionCache.length === 0 && overviewRequestsCache.length > 0) {
    requestsSectionCache = overviewRequestsCache;
  }
  const pendingRequestsCount = requestsSectionCache.filter((r) => normalizeRequestStatus(r.status) === 'pending').length;
  setSidebarBadge('requests', pendingRequestsCount, pendingRequestsCount > 0);

  const pendingUrgentFromStats = Number(
    latestOverviewStats?.pending_urgent_requests ??
    latestOverviewStats?.urgent_pending_requests ??
    latestOverviewStats?.urgent_requests_count ??
    NaN
  );
  if (!Number.isFinite(pendingUrgentFromStats)) {
    setOverviewUrgentPendingKpi(getPendingUrgentCountFromCache());
  }

  buildOverviewActivityCache();
  renderOverviewActivityFeed();
}

function buildOverviewActivityCache() {
  const donorEvents = donorCache
    .filter((donor) => donor?.created_at)
    .map((donor) => {
      const donorName = formatCompleteName(donor, 'Unknown Donor');
      const donorId = Number(donor?.id ?? donor?.donor_id) || null;
      const bloodType = donor?.blood_type || '-';
      return {
        eventDate: donor.created_at,
        title: `${donorName} registered as donor`,
        subtitle: `Donor ID: ${donorId ? `#${donorId}` : 'N/A'} - Blood type: ${bloodType}`,
        icon: 'fa-user-plus',
        iconClass: 'registration',
        searchText: `${donorId || ''} ${bloodType} ${donorName}`
      };
    });

  const requestSource = requestsSectionCache.length ? requestsSectionCache : overviewRequestsCache;
  const transferEvents = requestSource
    .filter((row) => {
      const status = String(row?.status || '').toLowerCase();
      return status.includes('approved') || status.includes('fulfill') || status.includes('completed');
    })
    .map((row) => {
      const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
      const patientName = formatCompleteName(patient, 'Unknown Patient');
      const bloodType = row?.blood_type_needed || '-';
      return {
        eventDate: row.request_date,
        title: `Blood transfer approved for ${patientName}`,
        subtitle: `${formatNumber(row.quantity)} unit(s) - Type ${bloodType}`,
        icon: 'fa-right-left',
        iconClass: 'transfer',
        searchText: `${bloodType} ${patientName} ${row.quantity || ''}`
      };
    });

  overviewActivityCache = [...donorEvents, ...transferEvents]
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
    .slice(0, 10);
}

function renderOverviewActivityFeed() {
  const container = document.getElementById('overviewActivityFeed');
  if (!container) return;

  const query = getSearchQuery();
  const rows = overviewActivityCache
    .filter((row) => includesQuery([row.searchText, row.title, row.subtitle], query))
    .slice(0, 6);

  if (!rows.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--slate-400);padding:24px 12px;">No recent activity yet.</div>';
    return;
  }

  container.innerHTML = rows.map((row) => {
    return `<div class="activity-item compact">
          <div class="activity-icon ${row.iconClass}"><i class="fa-solid ${row.icon}"></i></div>
          <div class="activity-info">
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.subtitle)}</span>
          </div>
          <div class="activity-meta">
            <small>${escapeHtml(formatRelativeTime(row.eventDate))}</small>
          </div>
        </div>`;
  }).join('');
}

async function refreshOverviewExpirationsTable() {
  const overviewTbody = document.getElementById('overviewExpirationsBody');
  const inventoryTbody = document.getElementById('inventoryExpirationsBody');
  if (!overviewTbody && !inventoryTbody) return;

  if (typeof supabaseClient === 'undefined') {
    const msg = '<tr><td colspan="6" style="text-align:center;color:var(--slate-400);padding:32px;">Expiry tracking is not available yet.</td></tr>';
    if (overviewTbody) overviewTbody.innerHTML = msg;
    if (inventoryTbody) inventoryTbody.innerHTML = msg;
    return;
  }

  let { data, error } = await supabaseClient
    .schema('blood_bank')
    .from('blood_inventory')
    .select('inventory_id, blood_type, units_available, status, date_stock, expiry_date')
    .order('expiry_date', { ascending: true });

  if (error && String(error.message || '').toLowerCase().includes('expiry_date')) {
    const fallback = await supabaseClient
      .schema('blood_bank')
      .from('blood_inventory')
      .select('inventory_id, blood_type, units_available, status, date_stock')
      .order('date_stock', { ascending: true });

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('Failed to load upcoming expirations:', error);
    const errorMsg = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:32px;">Unable to load upcoming expirations.</td></tr>';
    if (overviewTbody) overviewTbody.innerHTML = errorMsg;
    if (inventoryTbody) inventoryTbody.innerHTML = errorMsg;
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  overviewExpirationsCache = rows
    .map((row) => {
      const baseDate = row.expiry_date || row.date_stock;
      const parsed = baseDate ? new Date(baseDate) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return null;
      }

      const expiryDate = row.expiry_date
        ? new Date(row.expiry_date)
        : new Date(parsed.getTime() + (42 * 24 * 60 * 60 * 1000));
      expiryDate.setHours(0, 0, 0, 0);

      const diffMs = expiryDate.getTime() - now.getTime();
      const daysLeft = Math.floor(diffMs / (24 * 60 * 60 * 1000));

      return {
        unitId: row.inventory_id,
        bloodType: row.blood_type || '-',
        units: Number(row.units_available) || 0,
        expiryDate,
        daysLeft,
        status: String(row.status || 'available')
      };
    })
    .filter((row) => row && row.units > 0)
    .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
    .slice(0, 5);

  renderOverviewExpirationsTable();
}

function renderOverviewExpirationsTable() {
  const overviewTbody = document.getElementById('overviewExpirationsBody');
  const inventoryTbody = document.getElementById('inventoryExpirationsBody');
  if (!overviewTbody && !inventoryTbody) return;

  const query = getSearchQuery();
  const rows = overviewExpirationsCache.filter((row) => includesQuery([
    row.unitId,
    row.bloodType,
    row.units,
    row.status,
    row.daysLeft
  ], query));

  if (!rows.length) {
    const noDataMsg = '<tr><td colspan="6" style="text-align:center;color:var(--slate-400);padding:32px;">No expiry-tracked inventory unit/s yet.</td></tr>';
    if (overviewTbody) overviewTbody.innerHTML = noDataMsg;
    if (inventoryTbody) inventoryTbody.innerHTML = noDataMsg;
    return;
  }

  const html = rows.map((row) => {
    const expiryLabel = formatDateShort(row.expiryDate);
    const statusBadgeClass = row.daysLeft <= 2 ? 'urgent' : (row.daysLeft <= 7 ? 'pending' : 'completed');
    const statusLabel = row.daysLeft < 0 ? 'Expired' : (row.daysLeft <= 2 ? 'Critical' : (row.daysLeft <= 7 ? 'Watch' : 'Stable'));

    return `<tr>
          <td>#${escapeHtml(row.unitId)}</td>
          <td><span class="type-pill">${escapeHtml(row.bloodType)}</span></td>
          <td>${formatNumber(row.units)}</td>
          <td>${escapeHtml(expiryLabel)}</td>
          <td>${row.daysLeft < 0 ? 'Expired' : `${escapeHtml(row.daysLeft)} day(s)`}</td>
          <td><span class="badge ${statusBadgeClass}">${statusLabel}</span></td>
        </tr>`;
  }).join('');

  if (overviewTbody) overviewTbody.innerHTML = html;
  if (inventoryTbody) inventoryTbody.innerHTML = html;
}

async function refreshOverviewPanels() {
  await Promise.all([
    refreshOverviewInventoryPanel(),
    refreshOverviewRequestsPanel(),
    refreshOverviewExpirationsTable()
  ]);
}
function openInventoryModal() {
  document.getElementById('inventoryModal').classList.add('active');
}

function closeInventoryModal() {
  document.getElementById('inventoryModal').classList.remove('active');
  const form = document.getElementById('inventoryForm');
  const msg = document.getElementById('inventoryMsg');
  if (form) form.reset();
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
}

async function refreshInventorySection() {
  const inventoryList = document.getElementById('inventoryList');
  if (!inventoryList) return;

  const { data, error } = await getInventoryDashboardData();
  if (error || !data) {
    inventoryList.innerHTML = `<div style="text-align:center;color:#ef4444;padding:24px 12px;">Failed to load inventory: ${escapeHtml(error?.message || 'Unknown error')}</div>`;
    return;
  }

  inventoryByTypeCache = Array.isArray(data.by_type) ? data.by_type : [];

  let adequate = 0;
  let low = 0;
  let critical = 0;
  let total = 0;

  const allTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  allTypes.forEach(type => {
    const row = inventoryByTypeCache.find(r => r.blood_type === type) || { units_available: 0 };
    const units = Number(row.units_available) || 0;
    total += units;

    const levelClass = getInventoryLevelClass(units);
    if (levelClass === 'critical') critical++;
    else if (levelClass === 'low') low++;
    else adequate++;
  });

  document.getElementById('inventoryTotalUnits').textContent = formatNumber(total);
  document.getElementById('inventoryAdequateCount').textContent = formatNumber(adequate);
  document.getElementById('inventoryLowCount').textContent = formatNumber(low);
  document.getElementById('inventoryCriticalCount').textContent = formatNumber(critical);

  document.getElementById('inventoryTotalUnitsNote').textContent =
    total > 0 ? 'Live total across all blood types' : 'No stock encoded yet';
  document.getElementById('inventoryAdequateNote').textContent =
    adequate > 0 ? 'Types with healthy inventory levels' : 'No blood type data';
  document.getElementById('inventoryLowNote').textContent =
    low > 0 ? 'Needs replenishment soon' : 'No low-stock alerts';
  document.getElementById('inventoryCriticalNote').textContent =
    critical > 0 ? 'Immediate restock required' : 'No critical-stock alerts';

  renderInventorySection();
  await refreshBloodDrives();
  updateOverviewMiniStats();
  renderReportsSection();
}

function renderInventorySection() {
  const inventoryList = document.getElementById('inventoryList');
  if (!inventoryList) return;

  const query = getSearchQuery();
  const allTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const mergedRows = allTypes.map(type => {
    return inventoryByTypeCache.find(r => r.blood_type === type) || { blood_type: type, units_available: 0, last_updated: null };
  });
  const rows = mergedRows.filter((row) => includesQuery([row.blood_type, row.units_available], query));

  if (!rows.length) {
    inventoryList.innerHTML = '<div style="text-align:center;color:var(--slate-400);padding:24px 12px;">No blood inventory records available.</div>';
    return;
  }

  const headerHtml = `
        <div class="blood-list-header">
          <div class="header-type">Type</div>
          <div class="header-units-wrap">
            <span>BLOOD UNIT/S</span>
            <span>Target</span>
          </div>
        </div>
      `;

  inventoryList.innerHTML = headerHtml + rows.map(row => {
    const units = Number(row.units_available) || 0;
    const percent = getCapacityPercent(units);
    const barClass = getBloodBarClass(percent);
    const levelClass = getInventoryLevelClass(units);
    const levelLabel = levelClass === 'critical' ? 'Critical' : (levelClass === 'low' ? 'Low' : 'Adequate');

    return `<div class="blood-row">
          <div class="blood-type-badge">${escapeHtml(row.blood_type || '-')}</div>
          <div class="blood-bar-wrap">
            <div class="blood-bar-top">
              <span>${formatNumber(units)} unit/s</span>
              <strong>${percent}% of target (${INVENTORY_TARGET_UNITS})</strong>
            </div>
            <div class="blood-bar"><div class="blood-bar-fill ${barClass}" style="width:${percent}%"></div></div>
            <div class="inventory-row-meta">
              <span class="badge ${levelClass === 'critical' ? 'urgent' : (levelClass === 'low' ? 'pending' : 'completed')}">${levelLabel}</span>
              <small>Updated ${escapeHtml(formatRelativeTime(row.last_updated || row.date_stock))}</small>
            </div>
          </div>
        </div>`;
  }).join('');
}

async function refreshRequestsSection() {
  const list = document.getElementById('requestsSectionList');
  if (!list) return;

  const { data, error } = await getOverviewRecentRequests(100);
  if (error) {
    list.innerHTML = `<div style="text-align:center;color:#ef4444;padding:24px 12px;">Failed to load requests: ${escapeHtml(error?.message || 'Unknown error')}</div>`;
    return;
  }

  requestsSectionCache = Array.isArray(data) ? data : [];
  const pendingRequestsCount = requestsSectionCache.filter((r) => normalizeRequestStatus(r.status) === 'pending').length;
  setSidebarBadge('requests', pendingRequestsCount, pendingRequestsCount > 0);
  updateRequestsStatsCards(requestsSectionCache);
  renderRequestsSection();
  buildOverviewActivityCache();
  renderOverviewActivityFeed();
  updateOverviewMiniStats();
  renderReportsSection();
}

async function getAvailableUnitsForRequest(row) {
  if (!row) return 0;

  const bloodType = normalizeBloodType(row.blood_type_needed);
  const linkedId = Number(row.inventory_id || 0);

  let total = 0;

  if (linkedId > 0 && bloodType) {
    const { data, error } = await bloodBank()
      .from('blood_inventory')
      .select('units_available, blood_type, status')
      .eq('inventory_id', linkedId)
      .maybeSingle();

    const linkedType = normalizeBloodType(data?.blood_type);
    const linkedStatus = String(data?.status || '').toLowerCase();
    if (!error && linkedType === bloodType && !['expired', 'quarantined'].includes(linkedStatus)) {
      total += Number(data?.units_available || 0);
    }
  }

  if (!bloodType) {
    return total;
  }

  const { data, error } = await bloodBank()
    .from('blood_inventory')
    .select('inventory_id, units_available, status, blood_type')
    .gt('units_available', 0);

  if (error || !Array.isArray(data)) {
    const cached = inventoryByTypeCache.find((item) => normalizeBloodType(item?.blood_type) === bloodType);
    return Math.max(0, total, Number(cached?.units_available || 0));
  }

  total += data.reduce((sum, item) => {
    if (linkedId > 0 && Number(item.inventory_id) === linkedId) {
      return sum;
    }
    if (normalizeBloodType(item.blood_type) !== bloodType) {
      return sum;
    }
    const status = String(item.status || '').toLowerCase();
    if (['expired', 'quarantined'].includes(status)) {
      return sum;
    }
    return sum + (Number(item.units_available) || 0);
  }, 0);

  const cached = inventoryByTypeCache.find((item) => normalizeBloodType(item?.blood_type) === bloodType);
  return Math.max(0, total, Number(cached?.units_available || 0));
}

async function deductUnitsForFulfillment(row) {
  const quantity = Number(row?.quantity || 0);
  if (quantity <= 0) {
    return { ok: false, message: 'Invalid request quantity.' };
  }

  const bloodType = normalizeBloodType(row?.blood_type_needed);
  const linkedId = Number(row?.inventory_id || 0);
  let remaining = quantity;
  const candidates = [];

  if (!bloodType) {
    return { ok: false, message: 'Request blood type is missing. Cannot fulfill without a blood type.' };
  }

  const addCandidate = (item) => {
    const id = Number(item?.inventory_id || item?.unitId || 0);
    const units = Number(item?.units_available ?? item?.units ?? 0);
    const status = String(item?.status || '').toLowerCase();
    const itemType = normalizeBloodType(item?.blood_type || item?.bloodType);

    if (!id || units <= 0) return;
    if (itemType !== bloodType) return;
    if (['expired', 'quarantined'].includes(status)) return;
    if (candidates.some((existing) => Number(existing.inventory_id) === id)) return;

    candidates.push({
      inventory_id: id,
      units_available: units,
      status: item?.status || 'available',
      blood_type: bloodType,
      date_stock: item?.date_stock || null
    });
  };

  if (linkedId > 0) {
    const { data: linkedInventory, error: linkedErr } = await bloodBank()
      .from('blood_inventory')
      .select('inventory_id, units_available, status, blood_type')
      .eq('inventory_id', linkedId)
      .maybeSingle();

    const linkedType = normalizeBloodType(linkedInventory?.blood_type);
    const linkedStatus = String(linkedInventory?.status || '').toLowerCase();
    if (!linkedErr && linkedInventory && linkedType === bloodType && !['expired', 'quarantined'].includes(linkedStatus)) {
      addCandidate(linkedInventory);
    }
  }

  const { data: fallbackRows, error: fallbackErr } = await bloodBank()
    .from('blood_inventory')
    .select('inventory_id, units_available, status, blood_type, date_stock')
    .gt('units_available', 0)
    .order('date_stock', { ascending: true });

  if (!fallbackErr && Array.isArray(fallbackRows)) {
    fallbackRows.forEach((item) => {
      addCandidate(item);
    });
  }

  overviewExpirationsCache.forEach((item) => {
    addCandidate({
      inventory_id: item.unitId,
      units_available: item.units,
      status: item.status,
      blood_type: item.bloodType
    });
  });

  if (fallbackErr && !candidates.length) {
    return {
      ok: false,
      message: fallbackErr.message || `Could not verify inventory rows for blood type ${bloodType}.`
    };
  }

  if (!candidates.length) {
    return { ok: false, message: `No available inventory for blood type ${bloodType}.` };
  }

  const available = candidates.reduce((sum, item) => sum + (Number(item.units_available) || 0), 0);
  if (available < quantity) {
    return { ok: false, message: `Not enough stock to fulfill request. Needed: ${quantity}, available: ${available}.` };
  }

  const beforeAvailable = available;
  const deductionLog = [];
  for (const inventory of candidates) {
    if (remaining <= 0) break;

    const currentUnits = Number(inventory.units_available || 0);
    if (currentUnits <= 0) continue;

    const deduct = Math.min(currentUnits, remaining);
    const nextUnits = currentUnits - deduct;

    const { data: updatedInventory, error: updateErr } = await bloodBank()
      .from('blood_inventory')
      .update({
        units_available: nextUnits,
        status: nextUnits === 0 ? 'depleted' : (inventory.status || 'available'),
        date_stock: new Date().toISOString().slice(0, 10)
      })
      .eq('inventory_id', inventory.inventory_id)
      .select('inventory_id, units_available')
      .maybeSingle();

    if (updateErr) {
      return { ok: false, message: updateErr.message || 'Failed to deduct dispatched units.' };
    }
    if (!updatedInventory) {
      return {
        ok: false,
        message: 'Inventory deduction was blocked by permissions (RLS). Please run the workflow SQL and retry.'
      };
    }

    deductionLog.push({
      inventory_id: Number(inventory.inventory_id),
      blood_type: bloodType,
      deducted_units: deduct
    });
    remaining -= deduct;
  }

  if (remaining > 0) {
    return { ok: false, message: 'Fulfillment update incomplete. Please retry.' };
  }

  return {
    ok: true,
    deductions: deductionLog,
    primaryInventoryId: deductionLog[0]?.inventory_id || null,
    beforeAvailable,
    afterAvailable: Math.max(0, beforeAvailable - quantity)
  };
}

async function logRequestStatusAudit({ requestId, oldStatus, newStatus, reason, note }) {
  try {
    await bloodBank().from('blood_request_status_log').insert({
      request_id: requestId,
      admin_id: currentAdminContext.userId || currentAdminContext.email || 'unknown-admin',
      old_status: oldStatus,
      new_status: newStatus,
      reason,
      note: note || null,
      changed_at: new Date().toISOString()
    });
  } catch (_) {
    // Audit logging should not break the primary status change if the table is not yet migrated.
  }
}

async function queueClarificationNotification({ requestId, reason, note, patient }) {
  const recipientPhone = patient?.contact_number || null;
  const recipientEmail = patient?.email || null;
  const message = `Blood request #${requestId} needs clarification. Reason: ${reason}. Note: ${note}`;

  const entries = [
    {
      request_id: requestId,
      channel: 'sms',
      recipient: recipientPhone,
      message,
      reason,
      status: 'queued'
    },
    {
      request_id: requestId,
      channel: 'email',
      recipient: recipientEmail,
      message,
      reason,
      status: 'queued'
    }
  ].filter((item) => item.recipient);

  if (!entries.length) return;

  try {
    await bloodBank().from('blood_request_notification_queue').insert(entries);
  } catch (_) {
    // Notification queue insert is best-effort.
  }
}

async function validateRequestTransition(row, targetStatus, reason, note) {
  if (!row) return 'Request not found.';
  if (!targetStatus) return 'Target status is required.';
  if (!reason) return targetStatus === 'approved' ? 'Select the verification basis.' : 'Please select a reason for the status change.';
  if (getCommunityLifecycleInfo(row).status === 'expired') return 'This request has expired. The recipient must submit a new request.';

  const currentStatus = normalizeRequestStatus(row.status);
  const allowed = getValidRequestTransitions(currentStatus);
  if (!allowed.includes(targetStatus)) {
    return `Invalid transition from ${currentStatus.replace('_', ' ')} to ${targetStatus.replace('_', ' ')}.`;
  }

  const isReplacement = row.request_type === 'replacement';
  if (targetStatus === 'approved' && reason === 'uploaded_document' && !row.verification_support?.storage_path) {
    return 'This request has no uploaded supporting document.';
  }
  if (targetStatus === 'approved' && reason === 'facility_confirmation'
    && !row.hospital_reference && !row.verification_support?.facility_contact && !note) {
    return 'Enter the facility contact, confirmation reference, or verification details.';
  }
  if (targetStatus === 'approved' && reason === 'other' && !note) {
    return 'Explain the other documented verification basis.';
  }
  if (targetStatus === 'fulfilled' && isReplacement) {
    return 'Record each facility-confirmed replacement donation. The request completes automatically at the target.';
  }
  return '';
}

function setRequestStatusMsg(text, type = '') {
  const msg = document.getElementById('requestStatusMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = `form-msg ${type}`.trim();
}

function syncVerificationDetailsRequirement() {
  const note = document.getElementById('requestStatusNote');
  const noteLabel = document.getElementById('requestStatusNoteLabel');
  const reason = document.getElementById('requestStatusReason')?.value || '';
  const row = requestsSectionCache.find((item) => Number(item.request_id) === Number(requestTransitionState.requestId));
  const isVerification = requestTransitionState.targetStatus === 'approved';
  const facilityDetailsMissing = !row?.hospital_reference && !row?.verification_support?.facility_contact;
  const required = isVerification && (reason === 'other' || (reason === 'facility_confirmation' && facilityDetailsMissing));
  if (note) {
    note.required = required;
    note.placeholder = isVerification
      ? (required ? 'Enter the verification details used by the coordinator.' : 'Add a contact name, reference, or review note if useful.')
      : 'Optional note for this status change...';
  }
  if (noteLabel) noteLabel.textContent = isVerification
    ? `Verification details${required ? ' *' : ' (optional)'}`
    : 'Admin note (optional)';
}
document.getElementById('requestStatusReason')?.addEventListener('change', syncVerificationDetailsRequirement);

function openRequestStatusModal(requestId, targetStatus) {
  const request = requestsSectionCache.find((item) => Number(item.request_id) === Number(requestId));
  if (!request) return;

  if (getCommunityLifecycleInfo(request).status === 'expired') return;
  if (request.request_type === 'replacement' && targetStatus === 'fulfilled') return;
  const oldStatus = normalizeRequestStatus(request.status);
  const allowed = getValidRequestTransitions(oldStatus);
  if (!allowed.includes(targetStatus)) {
    return;
  }

  requestTransitionState = {
    requestId: Number(requestId),
    targetStatus,
    oldStatus
  };

  document.getElementById('requestStatusRequestId').textContent = `#${requestId}`;
  const isVerification = targetStatus === 'approved';
  const isClosing = targetStatus === 'fulfilled';
  document.getElementById('requestStatusModalTitle').textContent = isVerification
    ? 'Verify Blood Request'
    : isClosing
      ? 'Close Blood Request Coordination'
      : 'Change Request Status';
  document.getElementById('requestStatusTransitionLabel').textContent = isVerification
    ? 'Result'
    : isClosing
      ? 'Final Status'
      : 'Transition';
  document.getElementById('requestStatusTransition').value = isVerification
    ? 'Pending verification → Verified and published'
    : isClosing
      ? 'Approved / Active → Fulfilled (Coordination Closed)'
      : `${oldStatus.replace('_', ' ')} → ${targetStatus.replace('_', ' ')}`;
  document.getElementById('requestStatusReasonLabel').textContent = isVerification
    ? 'Verification basis'
    : isClosing
      ? 'Closure basis'
      : 'Reason';
  document.getElementById('requestStatusReasonHelp').textContent = isVerification
    ? 'Choose the evidence you personally reviewed before publishing this request.'
    : isClosing
      ? 'Select the fulfillment or verification source used to close this request.'
      : '';
  document.getElementById('requestStatusSubmit').innerHTML = isVerification
    ? '<i class="fa-solid fa-shield-heart"></i> Verify and Publish Request'
    : isClosing
      ? '<i class="fa-solid fa-circle-check"></i> Confirm & Close Coordination'
      : '<i class="fa-solid fa-check"></i> Confirm Change';

  const reasonSelect = document.getElementById('requestStatusReason');
  reasonSelect.innerHTML = `<option value="">${isVerification ? 'Select verification basis' : 'Select a reason'}</option>` +
    getTransitionReasonOptions(targetStatus, request)
      .map((option) => `<option value="${escapeHtml(option.value)}"${option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}${option.disabled ? ' (no upload)' : ''}</option>`)
      .join('');

  document.getElementById('requestStatusNote').value = '';
  syncVerificationDetailsRequirement();
  setRequestStatusMsg('');
  document.getElementById('requestStatusModal').classList.add('active');
}

function closeRequestStatusModal() {
  document.getElementById('requestStatusModal').classList.remove('active');
  requestTransitionState = { requestId: null, targetStatus: '', oldStatus: '' };
  setRequestStatusMsg('');
  const requestIdDisplay = document.getElementById('requestStatusRequestId');
  if (requestIdDisplay) requestIdDisplay.textContent = 'Auto-generated';
  const form = document.getElementById('requestStatusForm');
  if (form) form.reset();
}

async function submitRequestStatusTransition(event) {
  event.preventDefault();

  const { requestId, targetStatus, oldStatus } = requestTransitionState;
  if (!requestId || !targetStatus) return;

  const reason = String(document.getElementById('requestStatusReason').value || '').trim();
  const reasonLabel = String(document.getElementById('requestStatusReason').selectedOptions?.[0]?.textContent || reason).replace(/ \(no upload\)$/, '').trim();
  const note = String(document.getElementById('requestStatusNote').value || '').trim();
  const row = requestsSectionCache.find((item) => Number(item.request_id) === Number(requestId));

  const validationMessage = await validateRequestTransition(row, targetStatus, reason, note);
  if (validationMessage) {
    setRequestStatusMsg(validationMessage, 'error');
    return;
  }

  setRequestStatusMsg('Applying coordinator review status...', 'info');

  const fullNote = note ? `${reasonLabel}\n\nNote: ${note}` : reasonLabel;
  let updatedRequest = null;
  let updateError = null;

  if (targetStatus === 'approved') {
    const result = await bloodBank().rpc('verify_blood_request', {
      p_request_id: Number(requestId),
      p_method: reason,
      p_note: note || null,
      p_reference: row.hospital_reference || null
    });
    updatedRequest = result.data;
    updateError = result.error;
  } else if (targetStatus === 'fulfilled' && row.request_type === 'replacement') {
    const result = await bloodBank().rpc('rhu_complete_replacement', {
      p_request_id: Number(requestId),
      p_confirmed_units: Number(row.quantity || 1),
      p_confirmation_reference: note
    });
    updatedRequest = result.data;
    updateError = result.error;
  } else {
    const requestUpdatePayload = { status: targetStatus, note: fullNote };
    if (targetStatus === 'needs_clarification') requestUpdatePayload.verification_status = 'needs_clarification';
    if (targetStatus === 'rejected') requestUpdatePayload.verification_status = 'rejected';
    const result = await bloodBank()
      .from('blood_request')
      .update(requestUpdatePayload)
      .eq('request_id', requestId)
      .select('request_id, status, note')
      .maybeSingle();
    updatedRequest = result.data;
    updateError = result.error;
  }

  if (updateError) {
    setRequestStatusMsg(updateError.message || 'Failed to update request status.', 'error');
    return;
  }
  if (!updatedRequest) {
    setRequestStatusMsg('Request status update was blocked by permissions (RLS).', 'error');
    return;
  }
  await logRequestStatusAudit({ requestId, oldStatus, newStatus: targetStatus, reason: reasonLabel, note });

  if (targetStatus === 'needs_clarification') {
    const patient = Array.isArray(row?.patient) ? row.patient[0] : row?.patient;
    await queueClarificationNotification({ requestId, reason, note, patient });
  }

  // Activity log
  const _reqActionLabels = {
    approved: 'Verified Blood Request',
    fulfilled: 'Closed Coordination (Fulfilled)',
    needs_clarification: 'Requested Clarification',
    rejected: 'Rejected Blood Request',
    cancelled: 'Cancelled Blood Request'
  };
  const _reqPatient = Array.isArray(row?.patient) ? row.patient[0] : row?.patient;
  const _reqPatientName = [_reqPatient?.first_name, _reqPatient?.last_name].filter(Boolean).join(' ') || row?.patient_name || '';
  recordAdminActivity({
    category: 'requests',
    action: _reqActionLabels[targetStatus] || `Updated Request to ${targetStatus}`,
    target: `REQ-${requestId}${_reqPatientName ? ` (${_reqPatientName})` : ''}`,
    details: [reasonLabel, note].filter(Boolean).join(' — ')
  });

  const fulfilledMessage = targetStatus === 'fulfilled'
    ? (row.request_type === 'replacement'
      ? 'Replacement completed from authorized-facility confirmation. No hospital inventory was deducted.'
      : 'Donation coordination case completed. No hospital inventory was deducted.')
    : (targetStatus === 'approved' ? 'Request verified by the coordinator and released for donor coordination.' : 'Request status updated successfully.');

  setRequestStatusMsg(fulfilledMessage, 'success');
  await refreshRequestsSection();
  await refreshOverviewStats();
  await refreshOverviewPanels();
  await refreshInventorySection();
  setTimeout(closeRequestStatusModal, 700);
}

let adminRequestsTab = 'all';

function switchAdminRequestsTab(tab) {
  adminRequestsTab = tab || 'all';
  const btnAll = document.getElementById('btnAdminTabAllRequests');
  const btnCommunity = document.getElementById('btnAdminTabCommunityRequests');

  if (btnAll) btnAll.classList.toggle('active', adminRequestsTab === 'all');
  if (btnCommunity) btnCommunity.classList.toggle('active', adminRequestsTab === 'community');

  renderRequestsSection();
}
window.switchAdminRequestsTab = switchAdminRequestsTab;

async function loadReplacementConfirmationHistory(requestId) {
  const container = document.getElementById('replacementConfirmationHistory');
  if (!container) return;
  const { data, error } = await listReplacementDonations(requestId);
  if (error) {
    container.innerHTML = '<p class="replacement-confirmation-item">Unable to load confirmation history.</p>';
    return;
  }
  container.innerHTML = data.length ? data.map(item => `
    <article class="replacement-confirmation-item">
      <strong>${Number(item.units_confirmed)} unit${Number(item.units_confirmed) === 1 ? '' : 's'} confirmed</strong><br>
      ${escapeHtml(item.receiving_facility)} &middot; ${escapeHtml(formatDateShort(item.donation_date))}<br>
      ${item.donor_source === 'app' ? 'App donor: ' + escapeHtml(item.donor_display || ('#' + item.donor_id)) : 'External donor'} &middot; Ref: ${escapeHtml(item.confirmation_reference)}
    </article>`).join('') : '<p class="replacement-confirmation-item">No facility-confirmed donations recorded yet.</p>';
}

function openReplacementDonationModal(requestId) {
  const row = requestsSectionCache.find(item => Number(item.request_id || item.id) === Number(requestId));
  if (!row || row.request_type !== 'replacement' || row.verification_status !== 'verified') return;
  const campaign = Array.isArray(row.replacement_campaign) ? row.replacement_campaign[0] : row.replacement_campaign;
  const confirmed = Number(campaign?.confirmed_units || 0);
  const target = Number(campaign?.target_units || row.quantity || 1);
  const remaining = Math.max(0, target - confirmed);
  document.getElementById('replacementDonationRequestId').value = requestId;
  document.getElementById('replacementDonationProgress').textContent = `${confirmed} of ${target} units confirmed - ${remaining} remaining`;
  const units = document.getElementById('replacementUnits');
  units.value = 1;
  units.max = remaining;
  const donationDate = document.getElementById('replacementDate');
  donationDate.value = new Date().toISOString().slice(0, 10);
  donationDate.max = donationDate.value;
  document.getElementById('replacementFacility').value = row.hospital_name || row.hospital || '';
  document.getElementById('replacementReference').value = '';
  document.getElementById('replacementDonorSource').value = 'external';
  document.getElementById('replacementNote').value = '';
  document.getElementById('replacementDonationMsg').textContent = '';
  syncReplacementDonorSource();
  document.getElementById('replacementDonationModal').classList.add('active');
}
window.openReplacementDonationModal = openReplacementDonationModal;

function closeReplacementDonationModal() {
  document.getElementById('replacementDonationModal').classList.remove('active');
  document.getElementById('replacementDonationForm').reset();
}
window.closeReplacementDonationModal = closeReplacementDonationModal;

function syncReplacementDonorSource() {
  const appSource = document.getElementById('replacementDonorSource').value === 'app';
  const group = document.getElementById('replacementAppDonorGroup');
  const select = document.getElementById('replacementAppDonor');
  group.hidden = !appSource;
  select.disabled = !appSource;
  select.required = appSource;
  if (!appSource) select.value = '';
  if (appSource) {
    select.innerHTML = '<option value="">Select donor</option>' + donorCache
      .map(donor => `<option value="${Number(donor.id)}">${escapeHtml(formatCompleteName(donor, 'Donor #' + donor.id))} (${escapeHtml(donor.blood_type || '--')})</option>`)
      .join('');
  }
}
document.getElementById('replacementDonorSource')?.addEventListener('change', syncReplacementDonorSource);

async function submitReplacementDonation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('saveReplacementDonation');
  const msg = document.getElementById('replacementDonationMsg');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const requestId = Number(document.getElementById('replacementDonationRequestId').value);
  button.disabled = true;
  msg.textContent = 'Saving facility confirmation...';
  msg.className = 'form-msg info';
  try {
    const { error } = await recordReplacementDonation({
      request_id: requestId,
      units: document.getElementById('replacementUnits').value,
      donation_date: document.getElementById('replacementDate').value,
      receiving_facility: document.getElementById('replacementFacility').value,
      confirmation_reference: document.getElementById('replacementReference').value,
      donor_source: document.getElementById('replacementDonorSource').value,
      donor_id: document.getElementById('replacementAppDonor').value,
      note: document.getElementById('replacementNote').value
    });
    if (error) throw error;
    msg.textContent = 'Confirmed donation recorded.';
    msg.className = 'form-msg success';
    await refreshRequestsSection();
    closeReplacementDonationModal();
    openAdminRequestDetails(requestId);
  } catch (error) {
    msg.textContent = error?.message || 'Unable to record confirmation.';
    msg.className = 'form-msg error';
  } finally {
    button.disabled = false;
  }
}
document.getElementById('replacementDonationForm')?.addEventListener('submit', submitReplacementDonation);

const VERIFICATION_BASIS_LABELS = {
  uploaded_document: 'Uploaded supporting document reviewed',
  physical_document: 'Physical document reviewed in person',
  facility_confirmation: 'Confirmed with facility representative',
  other: 'Other documented verification'
};

async function prepareAdminRequestDocument(storagePath, fileName) {
  const link = document.getElementById('adminRequestDocumentLink');
  if (!link || typeof createRequestDocumentSignedUrl !== 'function') return;
  const { data, error } = await createRequestDocumentSignedUrl(storagePath);
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
  link.innerHTML = `<i class="fa-solid fa-file-shield" aria-hidden="true"></i> View ${escapeHtml(fileName || 'supporting document')}`;
}

function openAdminRequestDetails(requestId) {
  const row = requestsSectionCache.find((item) => Number(item.request_id || item.id) === Number(requestId));
  if (!row) return;

  const modal = document.getElementById('adminRequestDetailModal');
  const body = document.getElementById('adminRequestDetailBody');
  const actions = document.getElementById('adminRequestDetailActions');
  if (!modal || !body) return;

  const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
  const firstName = patient?.first_name || 'Community';
  const middleName = patient?.middle_name || '';
  const lastName = patient?.last_name || 'Recipient';
  const patientName = [firstName, middleName, lastName].filter(Boolean).join(' ');
  const hospital = row.hospital_name || patient?.hospital_name || row.hospital || 'Hospital';
  const phone = patient?.contact_number || row.contact_number || row.patient_phone || 'Available in patient profile';
  const bloodType = normalizeBloodType(row.blood_type_needed || row.blood_type || 'O+');
  const units = Number(row.quantity || row.units_needed || 1);
  const isReplacement = row.request_type === 'replacement';
  const isEmergencyDonor = row.request_type === 'emergency_donor';
  const pledges = Array.isArray(row.pledges) ? row.pledges : [];
  const activePledgedUnits = pledges
    .filter((pledge) => ['pledged', 'request_fulfilled', 'recipient_confirmed'].includes(String(pledge.status).toLowerCase()))
    .reduce((total, pledge) => total + Number(pledge.units_pledged || 1), 0);
  const isUrgent = isUrgentRequest(row);
  const urgencyStr = isUrgent ? 'Urgent' : 'Normal';
  const status = normalizeRequestStatus(row.status);
  const statusBadge = getCommunityLifecycleInfo(row).status === 'expired' ? { className: 'rejected', label: 'Expired' } : getRequestStatusInfo(status);
  const securedBags = Number(row.bags_secured ?? (status === 'fulfilled' ? units : (status === 'processing' ? Math.min(units, 1) : 0)));
  const statusSummaryStr = `${securedBags}/${units} Unit${units !== 1 ? 's' : ''} Secured`;
  const rawNoteText = String(row.note || row.notes || row.description || '');
  const neededTimeTag = rawNoteText.match(/\[NeededTime:([^\]]+)\]/i);
  const neededTimeValue = String(row.needed_time || row.needed_date || neededTimeTag?.[1] || '').trim();
  const neededTimeDisplay = neededTimeValue
    ? (neededTimeValue.toLowerCase() === 'anytime' ? 'Anytime' : neededTimeValue)
    : 'Not specified';
  const descriptionNotes = rawNoteText
    .replace(/\[Hospital:[^\]]+\]/gi, '')
    .replace(/\[NeededTime:[^\]]+\]/gi, '')
    .replace(/\[Community Crowdsourced\]/gi, '')
    .trim() || 'No description provided.';
  const verificationSupport = row.verification_support || null;
  const verificationBasis = VERIFICATION_BASIS_LABELS[verificationSupport?.verification_method]
    || (row.verification_status === 'verified' ? 'Coordinator verification recorded before evidence tracking' : 'Pending coordinator review');
  const privateSupportSection = `<section class="request-private-support">
      <h4><i class="fa-solid fa-lock" aria-hidden="true"></i> Private verification support</h4>
      <p>Visible only to the requester and authorized Blood Donation Coordinators.</p>
      <div class="request-private-support-grid">
        <div class="request-private-support-item"><span>Facility contact</span><strong>${escapeHtml(verificationSupport?.facility_contact || 'Not provided')}</strong></div>
        <div class="request-private-support-item"><span>Hospital / replacement reference</span><strong>${escapeHtml(row.hospital_reference || 'Not provided')}</strong></div>
        <div class="request-private-support-item"><span>Verification basis</span><strong>${escapeHtml(verificationBasis)}</strong></div>
        <div class="request-private-support-item"><span>Verified by</span><strong>${escapeHtml(verificationSupport?.verified_by_email || (verificationSupport?.verified_at ? 'Blood Donation Coordinator' : 'Not yet verified'))}</strong></div>
        <div class="request-private-support-item"><span>Verified on</span><strong>${verificationSupport?.verified_at ? escapeHtml(formatDateShort(verificationSupport.verified_at)) : 'Not yet verified'}</strong></div>
      </div>
      ${verificationSupport?.verification_note ? `<div class="request-private-support-item" style="margin-top:10px;"><span>Coordinator verification note</span><strong>${escapeHtml(verificationSupport.verification_note)}</strong></div>` : ''}
      ${verificationSupport?.storage_path
        ? `<a id="adminRequestDocumentLink" class="request-document-link" href="#" aria-disabled="true"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Preparing ${escapeHtml(verificationSupport.file_name || 'supporting document')}...</a>`
        : '<p style="margin-top:12px;margin-bottom:0;">No supporting document attached.</p>'}
    </section>`;
  const pledgeStatusLabels = {
    pledged: 'Active pledge',
    request_fulfilled: 'Request fulfilled',
    recipient_confirmed: 'Receipt confirmed',
    unable_to_donate: 'Unable to donate',
    cancelled: 'Cancelled'
  };
  const emergencyPledgeSection = isEmergencyDonor
    ? `<section class="replacement-progress-panel">
        <h4>Emergency donor pledges</h4>
        <div class="replacement-progress-count">${activePledgedUnits} of ${units} ${status === 'fulfilled' ? 'recorded' : 'active'} pledge unit${units === 1 ? '' : 's'}</div>
        <div class="replacement-confirmation-list">
          ${pledges.length
            ? pledges.map((pledge) => `<p class="replacement-confirmation-item"><strong>${escapeHtml(pledge.donor_name || 'Registered donor')}</strong> · ${escapeHtml(pledge.blood_type || 'Blood type unavailable')}<br><span>${escapeHtml(pledgeStatusLabels[String(pledge.status).toLowerCase()] || pledge.status || 'Pledged')} · ${escapeHtml(formatDateShort(pledge.pledged_at))}</span></p>`).join('')
            : '<p class="replacement-confirmation-item">No donors have pledged yet.</p>'}
        </div>
        ${row.recipient_received_at ? '<p style="margin:10px 0 0;color:#166534;font-weight:700;"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Blood received was confirmed by the requester. Verify any individual donation before adding donor history.</p>' : ''}
      </section>`
    : '';
  const urgencyChipStyle = isUrgent
    ? 'background:#fff1f2;color:#be123c;border:1px solid #fecdd3;'
    : 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;';

  body.innerHTML = `
    <section class="request-detail-summary">
      <div class="request-detail-title">
        <h4>Request #${escapeHtml(String(row.request_id || row.id))}</h4>
        <span class="badge ${statusBadge.className}">${statusBadge.label}</span>
      </div>
      <div class="request-detail-facts">
        <span class="request-detail-type"><i class="fa-solid ${isReplacement ? 'fa-rotate' : 'fa-droplet'}" aria-hidden="true"></i>${isReplacement ? 'Any eligible blood type' : escapeHtml(bloodType)}</span>
        <span>${isReplacement ? `${units} replacement donor${units === 1 ? '' : 's'} requested` : `${units} unit${units === 1 ? '' : 's'} requested`}</span>
        ${isReplacement ? '' : `<span>· ${escapeHtml(urgencyStr)} priority</span>`}
      </div>
      <p class="request-detail-time"><i class="fa-regular fa-clock" aria-hidden="true"></i> Requested ${escapeHtml(formatRelativeTime(row.request_date))}</p>
    </section>
    <div class="request-detail-grid">
      <div class="request-detail-field"><span><i class="fa-solid fa-user" aria-hidden="true"></i>Requester</span><strong>${escapeHtml(patientName)}</strong></div>
      <div class="request-detail-field"><span><i class="fa-solid fa-phone" aria-hidden="true"></i>Contact</span><strong>${escapeHtml(phone)}</strong></div>
      <div class="request-detail-field"><span><i class="fa-solid fa-hospital" aria-hidden="true"></i>Location / Hospital</span><strong>${escapeHtml(hospital)}</strong></div>
      <div class="request-detail-field"><span><i class="fa-solid fa-file-medical" aria-hidden="true"></i>Request type</span><strong>${row.request_type === 'replacement' ? 'Hospital replacement' : row.request_type === 'emergency_donor' ? 'Emergency donor assistance' : 'Blood request'}</strong></div>
      <div class="request-detail-field request-detail-field--wide"><span><i class="fa-regular fa-clock" aria-hidden="true"></i>Needed time</span><strong>${escapeHtml(neededTimeDisplay)}</strong></div>
    </div>
    <section class="request-detail-notes"><h4>Description / Notes</h4><p>${escapeHtml(descriptionNotes)}</p></section>
    ${emergencyPledgeSection}
    ${privateSupportSection}
    ${row.request_type === 'replacement' ? `<section class="replacement-progress-panel">
      <h4>Facility-confirmed replacement donations</h4>
      <div class="replacement-progress-count">${Number((Array.isArray(row.replacement_campaign) ? row.replacement_campaign[0] : row.replacement_campaign)?.confirmed_units || 0)} of ${Number((Array.isArray(row.replacement_campaign) ? row.replacement_campaign[0] : row.replacement_campaign)?.target_units || units)} units confirmed</div>
      <div id="replacementConfirmationHistory" class="replacement-confirmation-list"><p class="replacement-confirmation-item">Loading confirmations...</p></div>
    </section>` : ''}
  `;
  if (actions) {
    const expired = getCommunityLifecycleInfo(row).status === 'expired';
    const canMobilize = !expired && getCommunityLifecycleInfo(row).status === 'active' && status === 'approved' && row.verification_status === 'verified';
    actions.innerHTML = `
          ${canMobilize ? `<button type="button" class="btn-primary request-detail-action request-detail-action--notify" onclick="closeAdminRequestDetailModal(); openMobilizeDonorsModal(${Number(row.request_id || row.id)})"><i class="fa-solid fa-bullhorn"></i> Notify Eligible Donors</button>` : ''}
          ${status === 'pending' && !expired ? `<button type="button" class="btn-verify-request" onclick="closeAdminRequestDetailModal(); openRequestStatusModal(${Number(row.request_id || row.id)}, 'approved')"><i class="fa-solid fa-pen-to-square"></i> Verify Request</button>` : ''}
          ${row.request_type === 'replacement' && row.verification_status === 'verified' && status !== 'fulfilled' ? `<button type="button" class="btn-primary request-detail-action request-detail-action--record" onclick="closeAdminRequestDetailModal(); openReplacementDonationModal(${Number(row.request_id || row.id)})"><i class="fa-solid fa-clipboard-check"></i> Record Replacement Donation</button>` : ''}
          ${row.request_type !== 'replacement' && !expired && status === 'approved' ? `<button type="button" class="btn-close-coordination request-detail-action request-detail-action--complete" onclick="closeAdminRequestDetailModal(); openRequestStatusModal(${Number(row.request_id || row.id)}, 'fulfilled')"><i class="fa-solid fa-circle-check"></i> Close Coordination</button>` : ''}
          ${expired ? (row.request_type === 'replacement' && row.verification_status === 'verified' ? '<p style="color:#64748b;font-size:.85rem;">Public recruitment has expired. Facility-confirmed replacement donations can still be recorded.</p>' : '<p style="color:#64748b;font-size:.85rem;">Expired request - history only. The recipient must submit a new request if blood is still needed.</p>') : ''}
        `;
  }

  modal.classList.add('active');
  if (verificationSupport?.storage_path) {
    prepareAdminRequestDocument(verificationSupport.storage_path, verificationSupport.file_name);
  }
  if (row.request_type === 'replacement') loadReplacementConfirmationHistory(Number(row.request_id || row.id));
}
window.openAdminRequestDetails = openAdminRequestDetails;

function closeAdminRequestDetailModal() {
  const modal = document.getElementById('adminRequestDetailModal');
  if (modal) modal.classList.remove('active');
}
window.closeAdminRequestDetailModal = closeAdminRequestDetailModal;

function renderRequestsSection() {
  const list = document.getElementById('requestsSectionList');
  if (!list) return;

  const isCommunityRow = (row) => {
    const note = String(row.note || row.notes || row.description || '');
    return note.includes('[Community Crowdsourced]') || note.includes('Community') || Boolean(row.requester_name);
  };

  const query = getSearchQuery();
  const rows = requestsSectionCache.filter((row) => {
    const status = normalizeRequestStatus(row.status);
    if (requestFilter !== 'all' && status !== requestFilter) {
      return false;
    }

    const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
    return includesQuery([
      row.request_id,
      row.blood_type_needed,
      row.quantity,
      row.urgency_level,
      row.status,
      row.hospital_name,
      row.note,
      patient?.first_name,
      patient?.middle_name,
      patient?.last_name,
      patient?.hospital_name
    ], query);
  });

  if (!rows.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--slate-400);padding:24px 12px;">No blood requests available.</div>';
    return;
  }

  list.innerHTML = rows.map((row) => {
    const reqId = row.request_id || row.id;
    const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
    const firstName = patient?.first_name || 'Community';
    const middleName = patient?.middle_name || '';
    const lastName = patient?.last_name || 'Patient';
    const patientName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const hospital = row.hospital_name || patient?.hospital_name || row.hospital || 'Hospital';
    const bloodType = normalizeBloodType(row.blood_type_needed || row.blood_type || 'O+');
    const units = Number(row.quantity || row.units_needed || 1);
    const status = normalizeRequestStatus(row.status);
    const statusBadge = getCommunityLifecycleInfo(row).status === 'expired' ? { className: 'rejected', label: 'Expired' } : getRequestStatusInfo(status);
    const isUrgent = isUrgentRequest(row);
    const urgencyStr = isUrgent ? 'Urgent' : 'Normal';
    const securedBags = Number(row.bags_secured ?? (status === 'fulfilled' ? units : (status === 'processing' ? Math.min(units, 1) : 0)));
    const campaign = Array.isArray(row.replacement_campaign) ? row.replacement_campaign[0] : row.replacement_campaign;
    const isReplacement = row.request_type === 'replacement';
    const isEmergencyDonor = row.request_type === 'emergency_donor';
    const pledges = Array.isArray(row.pledges) ? row.pledges : [];
    const activePledgedUnits = pledges
      .filter((pledge) => ['pledged', 'request_fulfilled', 'recipient_confirmed'].includes(String(pledge.status).toLowerCase()))
      .reduce((total, pledge) => total + Number(pledge.units_pledged || 1), 0);
    const statusSummaryStr = isReplacement
      ? `${Number(campaign?.pledged_units || 0)}/${Number(campaign?.target_units || units)} pledged · ${Number(campaign?.confirmed_units || 0)}/${Number(campaign?.target_units || units)} confirmed`
      : isEmergencyDonor
        ? `${activePledgedUnits}/${units} donors pledged`
        : `${securedBags}/${units} donor${units !== 1 ? 's' : ''} requested`;
    const communityLifecycle = getCommunityLifecycleInfo(row);

    const mobilizeBtn = communityLifecycle.status === 'active' && status === 'approved' && row.verification_status === 'verified'
      ? `<button type="button" class="btn-row-action" style="margin-right:6px;background:rgba(128,0,0,0.06);color:var(--accent,#800000);border:1px solid rgba(128,0,0,0.18);padding:5px 10px;border-radius:6px;font-weight:700;font-size:0.75rem;" onclick="openMobilizeDonorsModal(${Number(reqId)})" title="Notify eligible donors with an in-app appeal"><i class="fa-solid fa-bell"></i> Notify Donors</button>`
      : '';

    const urgencyChipStyle = isUrgent
      ? 'background:#fff1f2;color:#be123c;border:1px solid #fecdd3;'
      : 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;';

    return `<div class="request-card" style="flex-wrap:wrap; gap:12px;">
          <div class="request-type">${isReplacement ? '<i class="fa-solid fa-rotate" aria-hidden="true"></i>' : escapeHtml(bloodType)}</div>
          <div class="request-info" style="flex:1; min-width:200px;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:5px;">
              <strong style="font-size:0.88rem; color:#1e293b;">Request #${escapeHtml(String(reqId))}</strong>
              ${communityLifecycle.status === 'expired'
                ? '<span class="badge rejected">Expired</span>'
                : `<span class="badge ${statusBadge.className}">${statusBadge.label}</span>${communityLifecycle.status === 'covered' ? '<span class="badge approved">Donors Pledged</span>' : ''}`}
            </div>
            ${isReplacement || isEmergencyDonor ? `<p style="font-size:.78rem;color:#64748b;">${escapeHtml(statusSummaryStr)}</p>` : ''}
            ${isEmergencyDonor && row.recipient_received_at ? '<p style="font-size:.74rem;color:#166534;font-weight:700;"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Blood received confirmed by requester</p>' : ''}
            <div style="font-size:.78rem;color:#64748b;margin-bottom:4px;">
              ${isReplacement ? `${units} replacement donor${units === 1 ? '' : 's'} · Any eligible blood type` : `${units} unit${units === 1 ? '' : 's'} of ${escapeHtml(bloodType)}`}${row.request_type === 'replacement' ? ' · Hospital replacement' : row.request_type === 'emergency_donor' ? ' · Emergency donor assistance' : ''}${communityLifecycle.status === 'active' && isUrgent ? ' · Urgent' : ''}
            </div>
            <div style="font-size:0.74rem; color:var(--gray-500); display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
              <i class="fa-solid fa-location-dot" style="font-size:0.68rem;color:#94a3b8;"></i>
              <span style="font-weight:600;color:#475569;">${escapeHtml(hospital)}</span>
              <span style="color:#cbd5e1;">•</span>
              <span>Requester: ${escapeHtml(patientName)}</span>
            </div>
          </div>
          <div class="request-meta" style="display:flex; align-items:center; gap:8px; flex-direction:row;">
            <button type="button" class="btn-row-action" style="padding:5px 10px; border-radius:6px; font-weight:700; font-size:0.75rem; background:#fff; border:1px solid #cbd5e1; color:#1e293b;" onclick="openAdminRequestDetails(${Number(reqId)})" title="View details">
              <i class="fa-solid fa-circle-info"></i> Details
            </button>
            ${mobilizeBtn}
          </div>
        </div>`;
  }).join('');
}

function isDonorEligibleForAppeal(donor) {
  const availability = String(donor?.availability_status || '').toLowerCase();
  const lifecycle = String(donor?.donor_status || 'registered').toLowerCase();
  const waitingPeriodPassed = isEligibleToCheckIn(donor).eligible;
  return availability === 'available'
    && ['approved', 'donated'].includes(lifecycle)
    && waitingPeriodPassed;
}

function isDonorTheRequester(donor, patient) {
  if (!donor || !patient) return false;

  const donorUserId = String(donor.auth_user_id || '').trim();
  const patientUserId = String(patient.auth_user_id || '').trim();
  if (donorUserId && patientUserId && donorUserId === patientUserId) return true;

  const donorEmail = String(donor.email || '').trim().toLowerCase();
  const patientEmail = String(patient.email || '').trim().toLowerCase();
  if (donorEmail && patientEmail && donorEmail === patientEmail) return true;

  const donorPhone = String(donor.phone || donor.contact_number || '').replace(/\D/g, '');
  const patientPhone = String(patient.contact_number || patient.phone || '').replace(/\D/g, '');
  return donorPhone.length >= 7 && patientPhone.length >= 7 && donorPhone === patientPhone;
}

let activeMobilizeRequestId = null;

function openMobilizeDonorsModal(requestId) {
  const request = requestsSectionCache.find((item) => Number(item.request_id) === Number(requestId));
  if (!request) return;

  if (getCommunityLifecycleInfo(request).status !== 'active' || request.status !== 'approved' || request.verification_status !== 'verified') return;
  activeMobilizeRequestId = Number(requestId);
  const patient = Array.isArray(request.patient) ? request.patient[0] : request.patient;
  const firstName = patient?.first_name || 'Community';
  const lastName = patient?.last_name || 'Patient';
  const patientName = `${firstName} ${lastName}`.trim();
  const hospital = patient?.hospital_name || 'Partner Health Facility';
  const patientArea = patient?.address || patient?.map_area || 'Bohol';
  const neededType = normalizeBloodType(request.blood_type_needed || 'O+');
  const quantity = Number(request.quantity || 1);

  document.getElementById('mobilizeRecipientName').textContent = patientName;
  document.getElementById('mobilizeLocationText').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(patientArea)} &bull; ${escapeHtml(hospital)}`;
  document.getElementById('mobilizeBloodTypeBadge').textContent = neededType;
  document.getElementById('mobilizeQuantityText').textContent = `${quantity} Unit(s) Needed`;

  // The facility makes the final medical match; show every currently eligible donor.
  const donors = Array.isArray(donorCache) ? donorCache : [];
  const matchingDonors = donors.filter((d) => (
    isDonorEligibleForAppeal(d) && !isDonorTheRequester(d, patient)
  ));

  document.getElementById('mobilizeMatchCount').textContent = matchingDonors.length;
  const tbody = document.getElementById('mobilizeDonorsTableBody');

  if (!matchingDonors.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--slate-400);padding:24px;">No currently eligible and available donors were found.</td></tr>`;
  } else {
    tbody.innerHTML = matchingDonors.map((d) => {
      const name = formatCompleteName(d, 'Registered Donor');
      const dType = normalizeBloodType(d.blood_type);
      const area = d.map_area || d.address || 'Bohol';
      const phone = d.phone || '-';
      const { eligible, daysRemaining } = isEligibleToCheckIn(d);
      const eligHtml = eligible
        ? '<span class="badge donated" style="font-size:0.68rem;"><i class="fa-solid fa-check"></i> Eligible Now</span>'
        : `<span class="waiting-pill" style="font-size:0.68rem;">${daysRemaining}d wait</span>`;

      return `<tr>
            <td><strong>${escapeHtml(name)}</strong></td>
            <td><span class="type-pill">${escapeHtml(dType)}</span></td>
            <td>${escapeHtml(area)}</td>
            <td>${escapeHtml(phone)}</td>
            <td>${eligHtml}</td>
          </tr>`;
    }).join('');
  }

  const msg = document.getElementById('mobilizeMsg');
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
  document.getElementById('mobilizeDonorsModal').classList.add('active');
}
window.openMobilizeDonorsModal = openMobilizeDonorsModal;

function closeMobilizeDonorsModal() {
  document.getElementById('mobilizeDonorsModal').classList.remove('active');
  activeMobilizeRequestId = null;
  const msg = document.getElementById('mobilizeMsg');
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
}
window.closeMobilizeDonorsModal = closeMobilizeDonorsModal;

async function handleBroadcastAppeal() {
  if (!activeMobilizeRequestId) return;
  const request = requestsSectionCache.find((item) => Number(item.request_id) === Number(activeMobilizeRequestId));
  if (!request) return;

  const btn = document.getElementById('btnBroadcastAppeal');
  const msg = document.getElementById('mobilizeMsg');
  if (btn) btn.disabled = true;
  if (msg) {
    msg.textContent = 'Creating in-app alerts for eligible donors...';
    msg.className = 'form-msg info';
  }

  try {
    const { data, error } = await bloodBank().rpc('notify_eligible_donors', {
      p_request_id: Number(activeMobilizeRequestId)
    });
    if (error) throw error;

    const notified = Number(data?.notified_count || 0);
    const alreadyNotified = Number(data?.already_notified_count || 0);
    if (msg) {
      msg.textContent = notified > 0
        ? `${notified} eligible donor(s) received an in-app alert.${alreadyNotified ? ` ${alreadyNotified} had already been notified.` : ''}`
        : (alreadyNotified > 0 ? 'All eligible donors had already been notified for this request.' : 'No eligible and available donors were found.');
      msg.className = notified > 0 ? 'form-msg success' : 'form-msg info';
    }
    if (notified > 0) setTimeout(closeMobilizeDonorsModal, 1800);
  } catch (err) {
    if (msg) {
      msg.textContent = err?.message || 'Failed to create donor alerts.';
      msg.className = 'form-msg error';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.handleBroadcastAppeal = handleBroadcastAppeal;

document.querySelectorAll('#section-requests .panel-actions [data-request-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    requestFilter = btn.dataset.requestFilter || 'all';
    document
      .querySelectorAll('#section-requests .panel-actions [data-request-filter]')
      .forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    renderRequestsSection();
  });
});

// Bind sidebar nav clicks
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateToSection(item.dataset.section);
  });
});

// ---- Auth Protection & Dynamic User Info ----
(async () => {
  const result = await requireAdmin();
  if (!result) return; // redirected to login

  const { profile, user } = result;
  const fullName = (profile.first_name + ' ' + profile.last_name).trim() || 'Admin';
  const adminAccountLabel = 'Blood Donation Coordinator';

  currentAdminContext = {
    userId: user?.id || '',
    email: profile?.email || user?.email || '',
    fullName
  };

  // Update header
  document.querySelector('.header-title p').textContent =
    'Welcome back, ' + profile.first_name + ' - here\'s today\'s overview';
  sectionTitles.dashboard.sub = 'Welcome back, ' + profile.first_name + ' - here\'s today\'s overview';
  document.querySelector('.header-profile-avatar').textContent = 'AA';
  const headerNameEl = document.getElementById('headerProfileName');
  if (headerNameEl) headerNameEl.textContent = adminAccountLabel;
  const dropdownNameEl = document.getElementById('dropdownFullName');
  if (dropdownNameEl) dropdownNameEl.textContent = adminAccountLabel;
  const dropdownEmailEl = document.getElementById('dropdownEmail');
  if (dropdownEmailEl) dropdownEmailEl.textContent = profile.email || user?.email || '';

  // Update sidebar footer
  const sideNameEl = document.getElementById('sidebarFooterName');
  if (sideNameEl) sideNameEl.textContent = adminAccountLabel;
  const sideEmailEl = document.getElementById('sidebarFooterEmail');
  if (sideEmailEl) sideEmailEl.textContent = profile.email || user?.email || '';

  await refreshOverviewStats();
  await refreshOverviewPanels();
  await refreshInventorySection();
  await refreshRequestsSection();
  renderBloodDrivesSection();
  renderReportsSection();
  applyOverviewExpirationsVisibility();
  refreshReportsTrendChart();
  initReportsRealtime();
  initBloodDrivesRealtime();
  updateSearchPlaceholder(activeSection);
})();

// ---- Logout ----
// ---- Logout Functionality ----
function toggleHeaderDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('headerProfileDropdown');
  if (dropdown) dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
window.addEventListener('click', () => {
  const dropdown = document.getElementById('headerProfileDropdown');
  if (dropdown) dropdown.classList.remove('active');
});

function openLogoutModal(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }
  const dropdown = document.getElementById('headerProfileDropdown');
  if (dropdown) dropdown.classList.remove('active');
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.add('active');
}
window.openLogoutModal = openLogoutModal;

function closeLogoutModal(event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.remove('active');
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

  const fallbackTimer = setTimeout(() => {
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
    clearTimeout(fallbackTimer);
  }
}
window.handleConfirmLogout = handleConfirmLogout;

const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');
if (confirmLogoutBtn) {
  confirmLogoutBtn.addEventListener('click', handleConfirmLogout);
}

// ---- Donor Management ----
let activeDonorId = null;
let donorFilter = 'all';
let donorBloodTypeFilter = 'all';

function openAddDonorModal() {
  const modal = document.getElementById('addDonorModal');
  const form = document.getElementById('addDonorForm');
  const msg = document.getElementById('addDonorMsg');
  const dobInput = document.getElementById('addDonorDob');

  if (form) form.reset();
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
  if (dobInput) {
    dobInput.max = new Date().toISOString().split('T')[0];
    dobInput.min = '1920-01-01';
  }

  modal?.classList.add('active');
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('addDonorFirstName')?.focus(), 50);
}

function closeAddDonorModal() {
  const modal = document.getElementById('addDonorModal');
  modal?.classList.remove('active');
  document.body.classList.remove('modal-open');
  const form = document.getElementById('addDonorForm');
  const msg = document.getElementById('addDonorMsg');
  if (form) form.reset();
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-msg';
  }
}

function isDonorEligibleForMap(donor) {
  const status = String(donor?.donor_status || 'registered').toLowerCase();
  if (status === 'deferred') {
    return { eligible: false, reason: 'Donor is deferred (medically ineligible).' };
  }
  if (status === 'registered' || status === 'checked_in') {
    return { eligible: false, reason: 'Donor has not completed medical screening yet. Medical approval is required first.' };
  }
  if (status === 'approved') {
    return { eligible: true, reason: 'Medically screened and approved to donate.' };
  }
  if (status === 'donated') {
    const { eligible, daysRemaining } = isEligibleToCheckIn(donor);
    if (!eligible) {
      return { eligible: false, reason: `Donor is in the 56-day post-donation waiting period (${daysRemaining} day(s) remaining).` };
    }
    return { eligible: true, reason: 'Medically screened and currently eligible to donate.' };
  }
  return { eligible: false, reason: 'Donor is not eligible for map display.' };
}

function openDonorProfileModal(donorId) {
  const donor = donorCache.find((item) => Number(item.id) === Number(donorId));
  if (!donor) return;

  activeDonorId = Number(donor.id);

  const firstName = donor.first_name || '';
  const middleName = donor.middle_name || '';
  const lastName = donor.last_name || '';
  const givenNames = [firstName, middleName].filter(Boolean).join(' ');
  const formattedName = lastName
    ? `${lastName}, ${givenNames}`.replace(/,\s*$/, '')
    : (givenNames || 'Unknown Donor');
  const donorBloodType = donor.blood_type || '-';

  document.getElementById('profileDisplayName').textContent = formattedName;
  document.getElementById('profileDisplayBloodType').textContent = 'Blood Type: ' + donorBloodType;

  // Populate read-only info fields
  document.getElementById('profileMiddleName').value = middleName || '-';
  document.getElementById('profileEmail').value = donor.email || '';
  document.getElementById('profilePhone').value = donor.phone || '-';
  document.getElementById('profileBirthdate').value = formatDateShort(donor.date_of_birth || donor.dob);
  document.getElementById('profileAddress').value = donor.address || '-';
  document.getElementById('profileGender').value = donor.gender
    ? String(donor.gender).charAt(0).toUpperCase() + String(donor.gender).slice(1)
    : '-';
  document.getElementById('profileDonorId').value = donor.id || '-';
  document.getElementById('profileRegistered').value = formatDateShort(donor.created_at);
  document.getElementById('profileLastDonated').value = donor.last_donation_date
    ? formatDateShort(donor.last_donation_date)
    : 'Never donated';

  const mapElig = isDonorEligibleForMap(donor);
  const showOnMapCheckbox = document.getElementById('profileShowOnMap');
  const mapEligibilityHint = document.getElementById('profileMapEligibilityHint');

  // Keep checkbox clickable at all times
  showOnMapCheckbox.disabled = false;
  showOnMapCheckbox.checked = donor.show_on_map === true && donor.location_status !== 'hidden';
  showOnMapCheckbox.title = mapElig.eligible
    ? 'Show donor on patient map'
    : `Map notice: ${mapElig.reason}`;

  if (mapEligibilityHint) {
    if (!mapElig.eligible) {
      mapEligibilityHint.innerHTML = `<span style="color:#e11d48;font-size:0.75rem;display:flex;align-items:center;gap:4px;margin-top:4px;"><i class="fa-solid fa-circle-exclamation"></i> Map notice: ${escapeHtml(mapElig.reason)}</span>`;
    } else {
      mapEligibilityHint.innerHTML = `<span style="color:#16a34a;font-size:0.75rem;display:flex;align-items:center;gap:4px;margin-top:4px;"><i class="fa-solid fa-circle-check"></i> Screened &amp; eligible for map display</span>`;
    }
  }

  document.getElementById('profileMapArea').value = donor.map_area || donor.address || '';
  syncLocationVerification(donor);
  document.getElementById('mapSettingsMsg').textContent = '';
  document.getElementById('mapSettingsMsg').className = 'form-msg';

  // Hide sub-panels and clear lifecycle message
  hideAllLifecyclePanels();
  showLifecycleMsg('', '');

  // Update lifecycle section (status badge, waiting pill, button states)
  updateProfileLifecycleUI(donor);

  const msg = document.getElementById('donorProfileMsg');
  msg.textContent = '';
  msg.className = 'form-msg';

  document.getElementById('donorProfileModal').classList.add('active');
}

function showDonorIneligiblePopup(reason) {
  const modal = document.getElementById('donorIneligibleModal');
  const reasonEl = document.getElementById('donorIneligibleModalReason');
  if (reasonEl) {
    reasonEl.textContent = reason || 'Donor has not completed medical screening yet. Medical approval is required first.';
  }
  if (modal) {
    modal.classList.add('active');
  }
}
window.showDonorIneligiblePopup = showDonorIneligiblePopup;

function closeDonorIneligibleModal() {
  const modal = document.getElementById('donorIneligibleModal');
  if (modal) {
    modal.classList.remove('active');
  }
}
window.closeDonorIneligibleModal = closeDonorIneligibleModal;

function closeDonorProfileModal() {
  activeDonorId = null;
  hideAllLifecyclePanels();
  showLifecycleMsg('', '');
  closeDonorIneligibleModal();
  document.getElementById('donorProfileModal').classList.remove('active');
  document.getElementById('donorProfileMsg').textContent = '';
  document.getElementById('donorProfileMsg').className = 'form-msg';
  document.getElementById('mapSettingsMsg').textContent = '';
  document.getElementById('mapSettingsMsg').className = 'form-msg';
}

function syncLocationVerification(donor, edited = false) {
  const area = document.getElementById('profileMapArea');
  const status = document.getElementById('profileLocationStatus');
  const help = document.getElementById('locationVerificationHelp');
  if (!area || !status) return;
  const missing = !area.value.trim();
  const changed = area.value.trim() !== String(donor?.map_area || '').trim();
  status.disabled = missing;
  status.querySelector('option[value="verified"]').disabled = changed;
  if (missing) status.value = 'missing';
  else if (changed || (edited && status.value === 'missing')) status.value = 'needs_review';
  else if (!edited) status.value = donor?.location_status === 'verified' ? 'verified' : 'needs_review';
  if (help) help.textContent = missing
    ? 'Enter a map area before location verification.'
    : changed
      ? 'Location changed. Save the area first, then review and verify it.'
      : 'Confirm the area before verifying. Map visibility is controlled separately.';
}
document.getElementById('profileMapArea')?.addEventListener('input', () => {
  const donor = donorCache.find(item => Number(item.id) === Number(activeDonorId));
  syncLocationVerification(donor, true);
});

function getLocationStatusLabel(status) {
  const labels = {
    verified: 'Verified',
    needs_review: 'Needs review',
    missing: 'Location missing',
    hidden: 'Hidden'
  };
  return labels[String(status || 'needs_review')] || 'Needs review';
}

function getMapVisibilityBadge(donor) {
  const showOnMap = donor?.show_on_map === true;
  const status = String(donor?.location_status || 'needs_review');
  const mapElig = isDonorEligibleForMap(donor);

  if (!mapElig.eligible) {
    return `<span class="map-status-pill hidden" title="${escapeHtml(mapElig.reason)}"><i class="fa-solid fa-lock"></i> Map restricted</span>`;
  }
  if (String(donor?.availability_status || '').toLowerCase() !== 'available') {
    return '<span class="map-status-pill hidden">Availability paused</span>';
  }
  if (showOnMap && status === 'verified' && getDonorMapVisibilityState(donor).visible) {
    return '<span class="map-status-pill visible"><i class="fa-solid fa-location-dot"></i> Visible</span>';
  }
  if (showOnMap) {
    return `<span class="map-status-pill review"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(getLocationStatusLabel(status))}</span>`;
  }
  return '<span class="map-status-pill hidden"><i class="fa-solid fa-eye-slash"></i> Hidden</span>';
}

async function handleSaveMapSettings() {
  const donor = donorCache.find((item) => Number(item.id) === Number(activeDonorId));
  if (!donor) return;

  const msg = document.getElementById('mapSettingsMsg');
  const button = document.getElementById('btnSaveMapSettings');
  const showOnMapCheckbox = document.getElementById('profileShowOnMap');
  const showOnMapRequested = showOnMapCheckbox ? showOnMapCheckbox.checked : false;
  const mapElig = isDonorEligibleForMap(donor);

  if (showOnMapRequested && !mapElig.eligible) {
    if (showOnMapCheckbox) {
      showOnMapCheckbox.checked = false;
    }
    msg.textContent = `Cannot enable on map: ${mapElig.reason}`;
    msg.className = 'form-msg error';
    showDonorIneligiblePopup(mapElig.reason);
    return;
  }

  const payload = {
    show_on_map: showOnMapRequested && mapElig.eligible,
    location_status: document.getElementById('profileLocationStatus').value,
    map_area: document.getElementById('profileMapArea').value
  };

  msg.textContent = 'Saving map settings...';
  msg.className = 'form-msg info';
  button.disabled = true;

  try {
    const { data, error } = await updateDonorMapSettings(activeDonorId, payload);
    if (error) throw error;

    Object.assign(donor, {
      show_on_map: data?.show_on_map === true,
      location_status: data?.location_status || payload.location_status,
      map_area: data?.map_area || payload.map_area || null,
      area: data?.map_area || payload.map_area || null
    });

    syncLocationVerification(donor);
    renderDonorRows();
    msg.textContent = donor.show_on_map && donor.location_status === 'verified'
      ? 'Saved. This donor is eligible and can now appear on the patient map.'
      : 'Saved. This donor will stay hidden until location is verified and donor is eligible.';
    msg.className = 'form-msg success';
  } catch (err) {
    msg.textContent = err?.message || 'Failed to save map settings.';
    msg.className = 'form-msg error';
  } finally {
    button.disabled = false;
  }
}
window.handleSaveMapSettings = handleSaveMapSettings;

async function handleSaveDonorProfile() {
  if (!activeDonorId) {
    closeDonorProfileModal();
    return;
  }
  const donor = donorCache.find((item) => Number(item.id ?? item.donor_id) === Number(activeDonorId));
  if (!donor) {
    closeDonorProfileModal();
    return;
  }

  const msg = document.getElementById('donorProfileMsg');
  const btn = document.getElementById('btnSaveDonorProfile');
  if (btn) btn.disabled = true;

  const showOnMapCheckbox = document.getElementById('profileShowOnMap');
  const showOnMapRequested = showOnMapCheckbox?.checked === true;
  const mapElig = isDonorEligibleForMap(donor);

  if (showOnMapRequested && !mapElig.eligible) {
    if (showOnMapCheckbox) {
      showOnMapCheckbox.checked = false;
    }
    if (msg) {
      msg.textContent = `Cannot enable on map: ${mapElig.reason}`;
      msg.className = 'form-msg error';
    }
    if (btn) btn.disabled = false;
    showDonorIneligiblePopup(mapElig.reason);
    return;
  }

  if (msg) {
    msg.textContent = 'Saving donor settings...';
    msg.className = 'form-msg info';
  }

  try {
    const payload = {
      show_on_map: showOnMapRequested && mapElig.eligible,
      location_status: document.getElementById('profileLocationStatus')?.value || 'needs_review',
      map_area: document.getElementById('profileMapArea')?.value?.trim() || ''
    };

    const { data, error } = await updateDonorMapSettings(activeDonorId, payload);
    if (error) throw error;

    Object.assign(donor, {
      show_on_map: data?.show_on_map === true,
      location_status: data?.location_status || payload.location_status,
      map_area: data?.map_area || payload.map_area || null,
      area: data?.map_area || payload.map_area || null
    });

    renderDonorRows();
    if (msg) {
      msg.textContent = 'Donor profile updated successfully!';
      msg.className = 'form-msg success';
    }
    setTimeout(() => {
      closeDonorProfileModal();
    }, 600);
  } catch (err) {
    if (msg) {
      msg.textContent = err?.message || 'Failed to save donor profile.';
      msg.className = 'form-msg error';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.handleSaveDonorProfile = handleSaveDonorProfile;

function applyDonorFilter(donors) {
  const query = getSearchQuery();
  const byStatus = donorFilter === 'all'
    ? donors
    : donors.filter(d => {
      const status = String(d.donor_status || 'registered').trim().toLowerCase();
      return status === donorFilter;
    });

  return byStatus.filter((d) => (donorBloodTypeFilter === 'all'
    || normalizeBloodType(d.blood_type) === donorBloodTypeFilter) && includesQuery([
    d.first_name,
    d.middle_name,
    d.last_name,
    d.email,
    d.phone,
    d.blood_type,
    d.donor_status,
    getDonorLifecycleLabel(d.donor_status || 'registered'),
    d.location_status,
    d.map_area
  ], query));
}

function formatNextEligible(lastDonationDate) {
  if (!lastDonationDate) return '<span class="badge registered" style="font-size:.68rem;">No previous donation</span>';
  const next = new Date(lastDonationDate);
  if (Number.isNaN(next.getTime())) return '<span class="badge registered">Date needs review</span>';
  next.setDate(next.getDate() + 56);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (next <= today) {
    return '<span class="badge donated" style="font-size:.68rem;">Waiting period complete</span>';
  }
  return `<span class="waiting-pill" style="font-size:.68rem;">Wait until ${formatDateShort(next)}</span>`;
}

function renderDonorRows() {
  const tbody = document.getElementById('donorTableBody');
  if (!tbody) return;

  const donors = applyDonorFilter(donorCache);
  const summary = document.getElementById('donorFilterSummary');
  if (summary) summary.textContent = `Showing ${donors.length} of ${donorCache.length} donors`;
  const clearButton = document.getElementById('clearDonorFilters');
  if (clearButton) clearButton.disabled = donorFilter === 'all' && donorBloodTypeFilter === 'all' && !getSearchQuery();
  if (!donors || donors.length === 0) {
    const message = donorCache.length ? 'No donors match these filters.' : 'No donors yet.';
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--slate-400);padding:32px;">${message}</td></tr>`;
    return;
  }

  tbody.innerHTML = donors.map(d => {
    const initials = ((d.first_name?.[0] || '') + (d.last_name?.[0] || '')).toUpperCase();
    const avatarClass = getAvatarClassFromBloodType(d.blood_type);
    const date = new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const status = d.donor_status || 'registered';
    const badgeClass = getDonorLifecycleBadgeClass(status);
    const badgeLabel = getDonorLifecycleLabel(status);
    return `<tr>
          <td>
            <div class="donor-cell">
              <div class="donor-avatar ${avatarClass}">${initials}</div>
              <div>
                <div class="donor-name">${escapeHtml(formatCompleteName(d, 'Unknown Donor'))}</div>
                <div class="donor-email">${escapeHtml(d.email || '')}</div>
              </div>
            </div>
          </td>
          <td><span class="type-pill">${escapeHtml(d.blood_type || '-')}</span></td>
          <td>${escapeHtml(d.phone || '-')}</td>
          <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
          <td>${getMapVisibilityBadge(d)}</td>
          <td>${d.last_donation_date ? formatDateShort(d.last_donation_date) : '<span style="color:var(--gray-400);font-size:.8rem;">Never</span>'}</td>
          <td>${formatNextEligible(d.last_donation_date)}</td>
          <td>${date}</td>
          <td><button type="button" class="btn-row-action" onclick="openDonorProfileModal(${Number(d.id)})"><i class="fa-solid fa-eye"></i> View</button></td>
        </tr>`;
  }).join('');
}

async function loadDonors() {
  try {
    const { data: donors, error } = await listDonors();
    const tbody = document.getElementById('donorTableBody');

    if (error) throw error;

    donorCache = donors || [];
    setSidebarBadge('donors', donorCache.length);
    renderDonorRows();
    buildOverviewActivityCache();
    renderOverviewActivityFeed();
    updateOverviewMiniStats();
    renderReportsSection();
  } catch (err) {
    console.error('Failed to load donors:', err);
    const tbody = document.getElementById('donorTableBody');
    if (tbody) {
      donorCache = [];
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#ef4444;padding:32px;">Failed to load donors: ${escapeHtml(err?.message || 'Unknown error')}</td></tr>`;
    }
  }
}

document.getElementById('donorStatusFilter')?.addEventListener('change', (event) => {
  donorFilter = event.target.value;
  renderDonorRows();
});
document.getElementById('donorBloodTypeFilter')?.addEventListener('change', (event) => {
  donorBloodTypeFilter = event.target.value;
  renderDonorRows();
});
document.getElementById('clearDonorFilters')?.addEventListener('click', () => {
  donorFilter = 'all';
  donorBloodTypeFilter = 'all';
  document.getElementById('donorStatusFilter').value = 'all';
  document.getElementById('donorBloodTypeFilter').value = 'all';
  if (globalSearchInput) globalSearchInput.value = '';
  renderDonorRows();
});

// ---- Lifecycle Panel Helpers ----

function showLifecycleMsg(text, type) {
  const msg = document.getElementById('lifecycleMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'form-msg ' + (type || '');
}

function hideCheckInPanel() {
  const panel = document.getElementById('checkInPanel');
  if (panel) panel.classList.remove('visible');
}
window.hideCheckInPanel = hideCheckInPanel;

function hideScreeningPanel() {
  const panel = document.getElementById('screeningPanel');
  if (panel) panel.classList.remove('visible');
}
window.hideScreeningPanel = hideScreeningPanel;

function hideDonatePanel() {
  const panel = document.getElementById('donateConfirmPanel');
  if (panel) panel.classList.remove('visible');
}
window.hideDonatePanel = hideDonatePanel;

function hideDeferPanel() {
  const panel = document.getElementById('deferPanel');
  if (panel) panel.classList.remove('visible');
}
window.hideDeferPanel = hideDeferPanel;

function hideAllLifecyclePanels() {
  hideCheckInPanel();
  hideScreeningPanel();
  hideDonatePanel();
  hideDeferPanel();
}

function updateProfileLifecycleUI(donor) {
  const status = donor?.donor_status || 'registered';
  const { eligible, daysRemaining } = isEligibleToCheckIn(donor);

  // Status badge
  const badge = document.getElementById('profileStatusBadge');
  if (badge) {
    badge.className = 'badge ' + getDonorLifecycleBadgeClass(status);
    badge.textContent = getDonorLifecycleLabel(status);
  }

  // Waiting pill
  const pill = document.getElementById('profileWaitingPill');
  if (pill) {
    if (!donor?.last_donation_date) {
      pill.className = 'waiting-pill no-history';
      pill.innerHTML = '<i class="fa-solid fa-clock"></i> No donation history';
    } else if (eligible) {
      pill.className = 'waiting-pill eligible';
      pill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Eligible to donate';
    } else {
      pill.className = 'waiting-pill';
      pill.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${daysRemaining} day(s) remaining`;
    }
  }

  // Button states
  const btnCheckIn = document.getElementById('btnCheckIn');
  const btnApprove = document.getElementById('btnApprove');
  const btnMarkDonated = document.getElementById('btnMarkDonated');
  const btnDefer = document.getElementById('btnDefer');

  // Check-in: enabled only if registered or deferred (and 56-day rule passes)
  const canCheckIn = (status === 'registered' || status === 'deferred') && eligible;
  if (btnCheckIn) {
    btnCheckIn.disabled = !canCheckIn;
    btnCheckIn.title = canCheckIn
      ? 'Check donor in at the clinic'
      : (status === 'checked_in' ? 'Already checked in'
        : status === 'approved' ? 'Already approved'
          : status === 'donated' && !eligible ? `Cannot check in yet - ${daysRemaining} day(s) remaining`
            : 'Check-in not available in current status');
  }

  // Approve: enabled only if checked_in
  const canApprove = (status === 'checked_in');
  if (btnApprove) {
    btnApprove.disabled = !canApprove;
    btnApprove.title = canApprove ? 'Perform & approve medical screening' : (status === 'approved' ? 'Already approved' : 'Donor must be checked in first');
  }

  // Mark as donated: enabled only if approved
  const canDonate = (status === 'approved');
  if (btnMarkDonated) {
    btnMarkDonated.disabled = !canDonate;
    btnMarkDonated.title = canDonate ? 'Record successful blood draw' : (status === 'checked_in' ? 'Medical screening must be approved first' : 'Donor must be approved first');
  }

  // Defer: enabled any time except already deferred
  const canDefer = (status !== 'deferred');
  if (btnDefer) {
    btnDefer.disabled = !canDefer;
    btnDefer.title = canDefer ? 'Defer this donor (medically ineligible)' : 'Donor is already deferred';
  }
}

function scrollToLifecyclePanel(panelId, focusSelector) {
  setTimeout(() => {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      if (focusSelector) {
        const inputEl = panel.querySelector(focusSelector) || document.getElementById(focusSelector.replace(/^#/, ''));
        if (inputEl) {
          try { inputEl.focus({ preventScroll: true }); } catch (_) { inputEl.focus(); }
        }
      }
    }
  }, 60);
}

// ---- Handle Check-in (Show intake panel) ----
function handleCheckIn() {
  if (!activeDonorId) return;
  hideAllLifecyclePanels();
  const notesEl = document.getElementById('checkInNotes');
  if (notesEl) notesEl.value = '';
  const panel = document.getElementById('checkInPanel');
  if (panel) panel.classList.add('visible');
  showLifecycleMsg('', '');
  scrollToLifecyclePanel('checkInPanel', '#checkInNotes');
}
window.handleCheckIn = handleCheckIn;

// ---- Submit Check-in ----
async function submitCheckIn() {
  if (!activeDonorId) return;
  const notes = document.getElementById('checkInNotes')?.value?.trim() || '';
  const btn = document.getElementById('btnConfirmCheckIn');
  if (btn) btn.disabled = true;
  showLifecycleMsg('Checking in donor...', 'info');

  const { data, error } = await checkInDonor({ donor_id: activeDonorId, notes });
  if (error) {
    showLifecycleMsg(error.message || 'Check-in failed.', 'error');
    if (btn) btn.disabled = false;
    return;
  }

  hideCheckInPanel();
  if (btn) btn.disabled = false;

  // Update the local cache and UI
  const idx = donorCache.findIndex(d => Number(d.id ?? d.donor_id) === Number(activeDonorId));
  if (idx !== -1) { donorCache[idx] = { ...donorCache[idx], ...data }; }
  updateProfileLifecycleUI(data);
  renderDonorRows();
  refreshOverviewStats();
  showLifecycleMsg('Donor checked in successfully! Proceed to medical screening.', 'success');

  // Activity log
  const _ciDonor = donorCache.find(d => Number(d.id ?? d.donor_id) === Number(activeDonorId));
  recordAdminActivity({
    category: 'donors',
    action: 'Donor Clinic Check-in',
    target: formatCompleteName(_ciDonor, `Donor #${activeDonorId}`),
    details: notes ? `Notes: ${notes}` : 'No additional notes'
  });
}
window.submitCheckIn = submitCheckIn;

// ---- Handle Approve (Show Pre-donation Medical Screening panel) ----
function handleApprove() {
  if (!activeDonorId) return;
  hideAllLifecyclePanels();
  if (document.getElementById('screenWeight')) document.getElementById('screenWeight').value = '';
  if (document.getElementById('screenBp')) document.getElementById('screenBp').value = '';
  if (document.getElementById('screenHemoglobin')) document.getElementById('screenHemoglobin').value = '';
  if (document.getElementById('screenPulse')) document.getElementById('screenPulse').value = '';
  if (document.getElementById('screenTemp')) document.getElementById('screenTemp').value = '';
  if (document.getElementById('screenEligibility')) document.getElementById('screenEligibility').value = 'Fit to donate';
  if (document.getElementById('screenNotes')) document.getElementById('screenNotes').value = '';

  const panel = document.getElementById('screeningPanel');
  if (panel) panel.classList.add('visible');
  showLifecycleMsg('', '');
  scrollToLifecyclePanel('screeningPanel', '#screenWeight');
}
window.handleApprove = handleApprove;

// ---- Submit Approve Medical (with Screening Record) ----
async function submitApproveMedical() {
  if (!activeDonorId) return;
  const weight = document.getElementById('screenWeight')?.value?.trim();
  const bp = document.getElementById('screenBp')?.value?.trim();
  const hemoglobin = document.getElementById('screenHemoglobin')?.value?.trim();
  const pulse = document.getElementById('screenPulse')?.value?.trim();
  const temp = document.getElementById('screenTemp')?.value?.trim();
  const assessment = document.getElementById('screenEligibility')?.value || 'Fit to donate';
  const notes = document.getElementById('screenNotes')?.value?.trim() || '';

  if (!weight || isNaN(Number(weight))) {
    showLifecycleMsg('Please enter a valid donor weight (kg).', 'error');
    return;
  }
  if (Number(weight) < 50) {
    showLifecycleMsg('Warning: Standard donor weight requirement is at least 50 kg.', 'error');
  }
  if (!bp) {
    showLifecycleMsg('Please enter blood pressure (e.g. 120/80 mmHg).', 'error');
    return;
  }
  if (!hemoglobin || isNaN(Number(hemoglobin))) {
    showLifecycleMsg('Please enter hemoglobin level (g/dL).', 'error');
    return;
  }

  // Compile structured screening record
  const screeningSummary = [
    `[Pre-Donation Screening]`,
    `Weight: ${weight} kg`,
    `BP: ${bp} mmHg`,
    `Hb: ${hemoglobin} g/dL`,
    pulse ? `Pulse: ${pulse} bpm` : '',
    temp ? `Temp: ${temp} °C` : '',
    `Assessment: ${assessment}`,
    notes ? `Notes: ${notes}` : ''
  ].filter(Boolean).join(' | ');

  const btn = document.getElementById('btnConfirmScreen');
  if (btn) btn.disabled = true;
  showLifecycleMsg('Recording medical screening and approving donor...', 'info');

  const { data, error } = await approveDonorMedical({
    donor_id: activeDonorId,
    notes: screeningSummary
  });

  if (error) {
    showLifecycleMsg(error.message || 'Failed to approve donor.', 'error');
    if (btn) btn.disabled = false;
    return;
  }

  hideScreeningPanel();
  if (btn) btn.disabled = false;

  // Update the local cache and UI
  const idx = donorCache.findIndex(d => Number(d.id ?? d.donor_id) === Number(activeDonorId));
  if (idx !== -1) { donorCache[idx] = { ...donorCache[idx], ...data }; }
  updateProfileLifecycleUI(data);
  renderDonorRows();
  refreshOverviewStats();
  showLifecycleMsg('Medical screening approved! Donor is eligible for blood draw.', 'success');

  // Activity log
  const _amDonor = donorCache.find(d => Number(d.id ?? d.donor_id) === Number(activeDonorId));
  recordAdminActivity({
    category: 'donors',
    action: 'Approved Pre-Donation Medical Screening',
    target: formatCompleteName(_amDonor, `Donor #${activeDonorId}`),
    details: `Assessment: ${assessment} | Hb: ${hemoglobin} g/dL | BP: ${bp}`
  });
}
window.submitApproveMedical = submitApproveMedical;

// ---- Toggle Outcome Reason Fields ----
function toggleDonateOutcomeFields() {
  const status = document.getElementById('donateStatus')?.value || 'completed';
  const reasonGroup = document.getElementById('donateOutcomeReasonGroup');
  if (reasonGroup) {
    if (status === 'failed' || status === 'cancelled') {
      reasonGroup.style.display = 'block';
    } else {
      reasonGroup.style.display = 'none';
    }
  }
}
window.toggleDonateOutcomeFields = toggleDonateOutcomeFields;

// ---- Handle Mark as Donated (show panel) ----
function handleMarkDonated() {
  if (!activeDonorId) return;
  hideAllLifecyclePanels();
  // Pre-fill blood type from current donor
  const donor = donorCache.find(d => Number(d.id ?? d.donor_id) === Number(activeDonorId));
  const btSelect = document.getElementById('donateBloodType');
  if (donor?.blood_type && btSelect) btSelect.value = donor.blood_type;
  const statusSelect = document.getElementById('donateStatus');
  if (statusSelect) statusSelect.value = 'completed';
  const notesEl = document.getElementById('donateNotes');
  if (notesEl) notesEl.value = '';
  toggleDonateOutcomeFields();
  document.getElementById('donateUnits').value = 1;
  document.getElementById('donateConfirmPanel').classList.add('visible');
  showLifecycleMsg('', '');
  scrollToLifecyclePanel('donateConfirmPanel', '#donateUnits');
}
window.handleMarkDonated = handleMarkDonated;

// ---- Submit Mark as Donated ----
async function submitMarkDonated() {
  if (!activeDonorId) return;
  const units = Number(document.getElementById('donateUnits').value) || 1;
  const blood_type = document.getElementById('donateBloodType').value;
  const status = document.getElementById('donateStatus')?.value || 'completed';
  const reason = document.getElementById('donateReasonSelect')?.value || '';
  const notes = document.getElementById('donateNotes')?.value?.trim() || '';

  const btn = document.getElementById('btnConfirmDonate');
  btn.disabled = true;
  showLifecycleMsg('Recording donation outcome...', 'info');

  const { data, error } = await markDonorDonated({
    donor_id: activeDonorId,
    units,
    blood_type,
    status,
    reason: (status === 'failed' || status === 'cancelled') ? reason : '',
    notes
  });
  if (error) {
    showLifecycleMsg(error.message || 'Failed to record donation.', 'error');
    btn.disabled = false;
    return;
  }

  hideDonatePanel();
  const nextDate = data.next_eligible_date
    ? new Date(data.next_eligible_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '-';

  // Update cache & UI
  const idx = donorCache.findIndex(d => (d.id ?? d.donor_id) === activeDonorId);
  if (idx !== -1) { donorCache[idx] = { ...donorCache[idx], ...data.donor }; }
  updateProfileLifecycleUI(data.donor);
  if (status === 'completed' && data.donation_date) {
    document.getElementById('profileLastDonated').value = formatDateShort(data.donation_date);
  }
  renderDonorRows();
  refreshOverviewStats();
  refreshOverviewPanels();

  let successMsg = `Donation recorded as Completed! Blood inventory updated. Next eligible: ${nextDate}`;
  if (status === 'failed') {
    successMsg = `Donation recorded as Failed/Deferred (${reason || notes || 'Collection issue'}).`;
  } else if (status === 'cancelled') {
    successMsg = `Donation marked as Cancelled (${reason || notes || 'Donor withdrew'}).`;
  } else if (status === 'pending') {
    successMsg = `Donation record saved as Pending processing.`;
  }

  showLifecycleMsg(successMsg, status === 'failed' ? 'error' : 'success');
  btn.disabled = false;

  // Activity log
  const _mdDonor = donorCache.find(d => (d.id ?? d.donor_id) === activeDonorId);
  const _mdOutcomeLabel = status === 'completed' ? 'Recorded Blood Collection (Completed)'
    : status === 'failed' ? 'Recorded Blood Collection (Failed)'
    : status === 'cancelled' ? 'Recorded Blood Collection (Cancelled)'
    : 'Recorded Blood Collection (Pending)';
  recordAdminActivity({
    category: 'donors',
    action: _mdOutcomeLabel,
    target: formatCompleteName(_mdDonor, `Donor #${activeDonorId}`),
    details: `${units} unit(s) · ${blood_type}${reason ? ` · ${reason}` : ''}${notes ? ` · ${notes}` : ''}`
  });
}
window.submitMarkDonated = submitMarkDonated;

// ---- Handle Defer (show panel) ----
function handleDefer() {
  if (!activeDonorId) return;
  hideAllLifecyclePanels();
  document.getElementById('deferNotes').value = '';
  document.getElementById('deferPanel').classList.add('visible');
  showLifecycleMsg('', '');
  scrollToLifecyclePanel('deferPanel', '#deferReasonSelect');
}
window.handleDefer = handleDefer;

// ---- Submit Defer ----
async function submitDefer() {
  if (!activeDonorId) return;
  const reason = document.getElementById('deferReasonSelect').value;
  const notes = document.getElementById('deferNotes').value.trim();
  const fullReason = notes ? `${reason} - ${notes}` : reason;
  const btn = document.getElementById('btnConfirmDefer');
  btn.disabled = true;
  showLifecycleMsg('Deferring donor...', 'info');

  const { data, error } = await deferDonor({ donor_id: activeDonorId, reason: fullReason });
  if (error) {
    showLifecycleMsg(error.message || 'Failed to defer donor.', 'error');
    btn.disabled = false;
    return;
  }

  hideDeferPanel();
  const idx = donorCache.findIndex(d => (d.id ?? d.donor_id) === activeDonorId);
  if (idx !== -1) { donorCache[idx] = { ...donorCache[idx], ...data }; }
  updateProfileLifecycleUI(data);
  renderDonorRows();
  refreshOverviewStats();
  showLifecycleMsg(`Donor deferred: ${reason} OK`, 'error');
  btn.disabled = false;

  // Activity log
  const _dfDonor = donorCache.find(d => (d.id ?? d.donor_id) === activeDonorId);
  recordAdminActivity({
    category: 'donors',
    action: 'Medically Deferred Donor',
    target: formatCompleteName(_dfDonor, `Donor #${activeDonorId}`),
    details: fullReason
  });
}
window.submitDefer = submitDefer;

// Real-time phone sanitizer for Add Donor modal
const addDonorPhoneEl = document.getElementById('addDonorPhone');
addDonorPhoneEl?.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
});

document.getElementById('addDonorForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('addDonorMsg');
  const submitBtn = document.getElementById('saveAddDonorBtn') || form.querySelector('button[type="submit"]');

  const firstNameInput = document.getElementById('addDonorFirstName') || form.querySelector('[name="first_name"]');
  const middleNameInput = document.getElementById('addDonorMiddleName') || form.querySelector('[name="middle_name"]');
  const lastNameInput = document.getElementById('addDonorLastName') || form.querySelector('[name="last_name"]');
  const emailInput = document.getElementById('addDonorEmail') || form.querySelector('[name="email"]');
  const bloodTypeSelect = document.getElementById('addDonorBloodType') || form.querySelector('[name="blood_type"]');
  const phoneInput = document.getElementById('addDonorPhone') || form.querySelector('[name="phone"]');
  const genderSelect = document.getElementById('addDonorGender') || form.querySelector('[name="gender"]');
  const dobInput = document.getElementById('addDonorDob') || form.querySelector('[name="date_of_birth"]');
  const addressInput = document.getElementById('addDonorAddress') || form.querySelector('[name="address"]');

  const firstName = String(firstNameInput?.value || '').trim();
  const middleName = String(middleNameInput?.value || '').trim();
  const lastName = String(lastNameInput?.value || '').trim();
  const email = String(emailInput?.value || '').trim().toLowerCase();
  const bloodType = String(bloodTypeSelect?.value || '').trim();
  const phone = String(phoneInput?.value || '').trim();
  const gender = String(genderSelect?.value || '').trim();
  const dob = String(dobInput?.value || '').trim();
  const address = String(addressInput?.value || '').trim();

  const namePattern = /^[a-zA-ZÀ-ÿ\s'.-]{2,60}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const showError = (message, element) => {
    if (msg) {
      msg.textContent = message;
      msg.className = 'form-msg error';
    }
    if (element) {
      element.focus();
      element.classList.add('input-error');
      setTimeout(() => element.classList.remove('input-error'), 3000);
    }
  };

  // 1. First Name validation
  if (!firstName) {
    showError('First name is required.', firstNameInput);
    return;
  }
  if (!namePattern.test(firstName)) {
    showError('First name must contain letters, hyphens, and spaces only (2–60 chars).', firstNameInput);
    return;
  }

  // 2. Middle Name validation (optional)
  if (middleName && !/^[a-zA-ZÀ-ÿ\s'.-]{1,60}$/.test(middleName)) {
    showError('Middle name can only contain letters, hyphens, and spaces.', middleNameInput);
    return;
  }

  // 3. Last Name validation
  if (!lastName) {
    showError('Last name is required.', lastNameInput);
    return;
  }
  if (!namePattern.test(lastName)) {
    showError('Last name must contain letters, hyphens, and spaces only (2–60 chars).', lastNameInput);
    return;
  }

  // 4. Email validation
  if (!email) {
    showError('Email address is required.', emailInput);
    return;
  }
  if (!emailPattern.test(email)) {
    showError('Please enter a valid email address (e.g. name@domain.com).', emailInput);
    return;
  }

  // 5. Blood Type validation
  if (!bloodType || !validBloodTypes.includes(bloodType)) {
    showError('Please select a valid blood type.', bloodTypeSelect);
    return;
  }

  // 6. Phone validation (optional, but if filled must be exactly 11 digits starting with 09)
  if (phone) {
    if (!/^09\d{9}$/.test(phone)) {
      showError('Phone number must be an 11-digit Philippine mobile number starting with 09 (e.g. 09151234567).', phoneInput);
      return;
    }
  }

  // 7. Birthdate validation (optional, but if filled must be realistic & age >= 16)
  if (dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(birthDate.getTime()) || birthDate > today || birthDate.getFullYear() < 1920) {
      showError('Please enter a valid birthdate (must not be in the future).', dobInput);
      return;
    }

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 16) {
      showError('Donor must be at least 16 years old to register for blood donation.', dobInput);
      return;
    }
    if (age > 75) {
      showError('Please check birthdate. Donor age must be 75 years or under.', dobInput);
      return;
    }
  }

  // 8. Gender validation (optional)
  if (gender && !['male', 'female', 'other'].includes(gender)) {
    showError('Please select a valid gender option.', genderSelect);
    return;
  }

  // 9. Address validation (optional)
  if (address && address.length > 255) {
    showError('Address must not exceed 255 characters.', addressInput);
    return;
  }

  const payload = {
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    email: email,
    blood_type: bloodType,
    contact_number: phone || null,
    phone: phone || null,
    gender: gender || null,
    date_of_birth: dob || null,
    address: address || null
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding Donor...';
  }
  if (msg) {
    msg.textContent = 'Adding donor...';
    msg.className = 'form-msg info';
  }

  try {
    const { data, error } = await addDonor(payload);

    if (error) {
      showError(error.message || 'Failed to add donor.', null);
      return;
    }

    if (msg) {
      msg.textContent = 'Donor added successfully!';
      msg.className = 'form-msg success';
    }

    // Activity log
    const _adName = [payload.first_name, payload.last_name].filter(Boolean).join(' ') || 'New Donor';
    recordAdminActivity({
      category: 'donors',
      action: 'Manually Added Donor',
      target: _adName,
      details: `Blood type: ${payload.blood_type || '?'} · Contact: ${payload.email || payload.contact_number || 'N/A'}`
    });

    form.reset();
    await loadDonors();
    refreshOverviewStats();
    refreshOverviewPanels();
    setTimeout(closeAddDonorModal, 1200);
  } catch (err) {
    showError('Network error. Please try again.', null);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Donor';
    }
  }
});

// Load donors on page load
loadDonors();

// ---- Global Search Suggestions & Omnibox ----
const globalSearchResults = document.getElementById('globalSearchResults');
const globalSearchClearBtn = document.getElementById('globalSearchClearBtn');
let selectedSuggestionIndex = -1;
let currentSuggestions = [];

const SEARCHABLE_SECTIONS = [
  { id: 'dashboard', name: 'Overview / Command Center', icon: 'fa-gauge-high', iconClass: 'page', desc: 'Summary metrics, activity feed & blood units', keywords: 'dashboard overview command center metrics stats summary home' },
  { id: 'donors', name: 'Donor Management', icon: 'fa-users', iconClass: 'page', desc: 'Donor directory, medical verification & intake', keywords: 'donors list volunteers blood donors medical history profiles registration' },
  { id: 'requests', name: 'Blood Requests', icon: 'fa-hand-holding-medical', iconClass: 'page', desc: 'Hospital and emergency patient blood requests', keywords: 'requests blood requests hospital patient needed urgent emergency transfer verification' },
  { id: 'inventory', name: 'Blood Inventory', icon: 'fa-box-archive', iconClass: 'page', desc: 'Real-time blood stock levels, bags & expiry status', keywords: 'inventory stock blood units bank storage available bags supply' },
  { id: 'drives', name: 'Blood Drives & Campaigns', icon: 'fa-calendar-days', iconClass: 'page', desc: 'Donation events, venues and mobile clinics', keywords: 'drives events mobile clinic venue schedules campaigns blood donation drives' },
  { id: 'reports', name: 'Reports & Analytics', icon: 'fa-chart-pie', iconClass: 'page', desc: 'Analytics trends, donation statistics & exports', keywords: 'reports export trends charts performance analytics graphs print' },
  { id: 'notifications', name: 'Notifications Center', icon: 'fa-bell', iconClass: 'page', desc: 'System alerts, urgent requests & coordinator logs', keywords: 'notifications alerts system logs messages activity updates' },
  { id: 'activity', name: 'Activity Logs', icon: 'fa-clock-rotate-left', iconClass: 'page', desc: 'Coordinator operations audit trail and history', keywords: 'activity logs audit history coordinator actions trail operations' }
];

function highlightSearchMatch(text, query) {
  const safeText = escapeHtml(String(text || ''));
  if (!query) return safeText;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safeText.replace(regex, '<mark>$1</mark>');
}

function hideSearchSuggestions() {
  if (globalSearchResults) {
    globalSearchResults.style.display = 'none';
    globalSearchResults.innerHTML = '';
  }
  selectedSuggestionIndex = -1;
  currentSuggestions = [];
}

function updateSearchClearBtn() {
  if (!globalSearchClearBtn) return;
  if (globalSearchInput && globalSearchInput.value.trim().length > 0) {
    globalSearchClearBtn.style.display = 'flex';
  } else {
    globalSearchClearBtn.style.display = 'none';
  }
}

function renderGlobalSearchSuggestions(query) {
  if (!globalSearchResults) return;
  const q = String(query || '').trim().toLowerCase();

  if (!q) {
    hideSearchSuggestions();
    return;
  }

  const matches = {
    sections: [],
    donors: [],
    requests: [],
    inventory: [],
    drives: []
  };

  // 1. Navigation sections
  SEARCHABLE_SECTIONS.forEach((sec) => {
    if (sec.name.toLowerCase().includes(q) || sec.desc.toLowerCase().includes(q) || sec.keywords.toLowerCase().includes(q)) {
      matches.sections.push({
        type: 'section',
        id: sec.id,
        title: sec.name,
        subtitle: sec.desc,
        icon: sec.icon,
        iconClass: 'page',
        badge: 'Page'
      });
    }
  });

  // 2. Donors
  if (Array.isArray(donorCache) && donorCache.length > 0) {
    for (const d of donorCache) {
      const name = formatCompleteName(d, 'Donor');
      const bloodType = d.blood_type || '';
      const email = d.email || '';
      const phone = d.phone || '';
      const donorIdStr = String(d.id || d.donor_id || '');
      const donorCode = `DONOR-${donorIdStr}`;
      const status = d.donor_status || 'registered';
      const city = d.city || d.address || '';

      const isMatch = name.toLowerCase().includes(q)
        || bloodType.toLowerCase().includes(q)
        || email.toLowerCase().includes(q)
        || phone.toLowerCase().includes(q)
        || donorIdStr.includes(q)
        || donorCode.toLowerCase().includes(q)
        || city.toLowerCase().includes(q);

      if (isMatch) {
        matches.donors.push({
          type: 'donor',
          id: d.id || d.donor_id,
          title: name,
          subtitle: `${bloodType ? `${bloodType} • ` : ''}${d.email || d.phone || city || 'ID: #' + donorIdStr} • ${getDonorLifecycleLabel(status)}`,
          icon: 'fa-user',
          iconClass: 'donor',
          badge: bloodType || 'Donor',
          badgeClass: 'blood'
        });
      }
      if (matches.donors.length >= 5) break;
    }
  }

  // 3. Blood Requests
  const reqSource = (Array.isArray(requestsSectionCache) && requestsSectionCache.length > 0)
    ? requestsSectionCache
    : (Array.isArray(overviewRequestsCache) ? overviewRequestsCache : []);

  if (reqSource.length > 0) {
    for (const r of reqSource) {
      const patient = Array.isArray(r.patient) ? r.patient[0] : r.patient;
      const patientName = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ') || r.patient_name || 'Patient Request';
      const hospital = r.hospital_name || patient?.hospital_name || r.hospital || 'Hospital';
      const bloodType = normalizeBloodType(r.blood_type_needed || r.blood_type || '');
      const reqIdStr = String(r.request_id || r.id || '');
      const reqCode = `REQ-${reqIdStr}`;
      const status = normalizeRequestStatus(r.status);
      const units = Number(r.quantity || r.units_needed || 1);
      const isUrgent = isUrgentRequest(r);

      const isMatch = patientName.toLowerCase().includes(q)
        || hospital.toLowerCase().includes(q)
        || bloodType.toLowerCase().includes(q)
        || reqIdStr.includes(q)
        || reqCode.toLowerCase().includes(q)
        || status.toLowerCase().includes(q);

      if (isMatch) {
        matches.requests.push({
          type: 'request',
          id: r.request_id || r.id,
          title: patientName,
          subtitle: `${hospital} • ${units} Unit${units > 1 ? 's' : ''} (${bloodType}) • ${status.toUpperCase()}`,
          icon: 'fa-hand-holding-medical',
          iconClass: 'request',
          badge: isUrgent ? 'Urgent' : bloodType,
          badgeClass: isUrgent ? 'urgent' : 'blood'
        });
      }
      if (matches.requests.length >= 5) break;
    }
  }

  // 4. Blood Inventory Stock
  const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const isInventoryKeyword = ['inventory', 'stock', 'units', 'bags', 'bank', 'storage', 'supply'].some((kw) => q.includes(kw));

  bloodTypes.forEach((type) => {
    const normType = normalizeBloodType(type).toLowerCase();
    if (normType.includes(q) || q.includes(normType) || isInventoryKeyword) {
      const invItem = (Array.isArray(inventoryByTypeCache) ? inventoryByTypeCache : []).find((i) => normalizeBloodType(i.blood_type) === type)
        || (Array.isArray(overviewInventoryCache) ? overviewInventoryCache : []).find((i) => normalizeBloodType(i.blood_type) === type);
      const units = invItem ? Number(invItem.units_available ?? invItem.units ?? 0) : 0;
      const levelClass = getInventoryLevelClass(units);
      matches.inventory.push({
        type: 'inventory',
        bloodType: type,
        title: `Blood Type ${type}`,
        subtitle: `${units} unit${units !== 1 ? 's' : ''} in stock (${levelClass.toUpperCase()})`,
        icon: 'fa-droplet',
        iconClass: 'inventory',
        badge: `${units} Units`,
        badgeClass: levelClass === 'critical' ? 'urgent' : 'status'
      });
    }
  });
  if (matches.inventory.length > 4) {
    matches.inventory = matches.inventory.slice(0, 4);
  }

  // 5. Blood Drives
  if (Array.isArray(BLOOD_DRIVE_PLAN) && BLOOD_DRIVE_PLAN.length > 0) {
    for (const drive of BLOOD_DRIVE_PLAN) {
      const title = drive.title || drive.name || 'Blood Donation Drive';
      const venue = drive.venue || drive.location || 'Location';
      if (title.toLowerCase().includes(q) || venue.toLowerCase().includes(q) || q.includes('drive') || q.includes('campaign')) {
        matches.drives.push({
          type: 'drive',
          id: drive.id,
          title: title,
          subtitle: `${venue} • ${drive.date || 'Upcoming'}`,
          icon: 'fa-calendar-days',
          iconClass: 'drive',
          badge: 'Drive',
          badgeClass: 'status'
        });
      }
      if (matches.drives.length >= 3) break;
    }
  }

  const allItems = [
    ...matches.sections,
    ...matches.donors,
    ...matches.requests,
    ...matches.inventory,
    ...matches.drives
  ];

  currentSuggestions = allItems;
  selectedSuggestionIndex = -1;

  if (allItems.length === 0) {
    globalSearchResults.innerHTML = `
      <div class="search-empty-state">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>No results found for "<strong>${escapeHtml(q)}</strong>"</p>
        <span style="font-size:0.75rem;color:var(--gray-400);">Try searching for donor names, blood types (e.g. O+), hospitals, or pages</span>
      </div>
    `;
    globalSearchResults.style.display = 'flex';
    return;
  }

  let html = '';

  const renderGroup = (groupTitle, icon, items) => {
    if (!items || items.length === 0) return '';
    let groupHtml = `<div class="search-suggestion-group">
      <div class="search-suggestion-group-title"><i class="fa-solid ${icon}"></i> ${groupTitle}</div>`;
    items.forEach((item) => {
      const globalIdx = currentSuggestions.indexOf(item);
      groupHtml += `
        <div class="search-suggestion-item" data-index="${globalIdx}" role="option">
          <div class="search-suggestion-left">
            <div class="search-suggestion-icon ${item.iconClass}"><i class="fa-solid ${item.icon}"></i></div>
            <div class="search-suggestion-info">
              <span class="search-suggestion-title">${highlightSearchMatch(item.title, q)}</span>
              <span class="search-suggestion-sub">${escapeHtml(item.subtitle)}</span>
            </div>
          </div>
          ${item.badge ? `<span class="search-suggestion-badge ${item.badgeClass || ''}">${escapeHtml(item.badge)}</span>` : ''}
        </div>
      `;
    });
    groupHtml += '</div>';
    return groupHtml;
  };

  html += renderGroup('Navigation Pages', 'fa-compass', matches.sections);
  html += renderGroup('Donors', 'fa-users', matches.donors);
  html += renderGroup('Blood Requests', 'fa-hand-holding-medical', matches.requests);
  html += renderGroup('Blood Stock', 'fa-box-archive', matches.inventory);
  html += renderGroup('Blood Drives', 'fa-calendar-days', matches.drives);

  globalSearchResults.innerHTML = html;
  globalSearchResults.style.display = 'flex';

  // Add click listeners to items
  globalSearchResults.querySelectorAll('.search-suggestion-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(el.getAttribute('data-index'));
      executeSuggestion(idx);
    });
  });
}

function executeSuggestion(index) {
  if (index < 0 || index >= currentSuggestions.length) return;
  const item = currentSuggestions[index];
  if (!item) return;

  hideSearchSuggestions();

  if (item.type === 'section') {
    navigateToSection(item.id);
  } else if (item.type === 'donor') {
    navigateToSection('donors');
    if (typeof openDonorProfileModal === 'function' && item.id) {
      setTimeout(() => openDonorProfileModal(Number(item.id)), 100);
    }
  } else if (item.type === 'request') {
    navigateToSection('requests');
    if (typeof openAdminRequestDetails === 'function' && item.id) {
      setTimeout(() => openAdminRequestDetails(Number(item.id)), 100);
    }
  } else if (item.type === 'inventory') {
    navigateToSection('inventory');
  } else if (item.type === 'drive') {
    navigateToSection('drives');
  }
}

function updateSelectedSuggestionHighlight() {
  if (!globalSearchResults) return;
  const items = globalSearchResults.querySelectorAll('.search-suggestion-item');
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

if (globalSearchInput) {
  globalSearchInput.addEventListener('input', () => {
    updateSearchClearBtn();
    applySearchToVisibleSection();
    renderGlobalSearchSuggestions(globalSearchInput.value);
  });

  globalSearchInput.addEventListener('focus', () => {
    if (globalSearchInput.value.trim().length > 0) {
      renderGlobalSearchSuggestions(globalSearchInput.value);
    }
  });

  globalSearchInput.addEventListener('keydown', (e) => {
    if (!globalSearchResults || globalSearchResults.style.display === 'none') {
      if (e.key === 'ArrowDown' && globalSearchInput.value.trim().length > 0) {
        renderGlobalSearchSuggestions(globalSearchInput.value);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentSuggestions.length > 0) {
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestions.length;
        updateSelectedSuggestionHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentSuggestions.length > 0) {
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        updateSelectedSuggestionHighlight();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < currentSuggestions.length) {
        executeSuggestion(selectedSuggestionIndex);
      } else if (currentSuggestions.length > 0) {
        executeSuggestion(0);
      }
    } else if (e.key === 'Escape') {
      hideSearchSuggestions();
      globalSearchInput.blur();
    }
  });
}

if (globalSearchClearBtn) {
  globalSearchClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (globalSearchInput) {
      globalSearchInput.value = '';
      globalSearchInput.focus();
    }
    updateSearchClearBtn();
    hideSearchSuggestions();
    applySearchToVisibleSection();
  });
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('headerSearchWrap');
  if (wrap && !wrap.contains(e.target)) {
    hideSearchSuggestions();
  }
});


setupReportsPeriodFilters();
document.getElementById('exportReportsBtn')?.addEventListener('click', exportReportsSummary);

window.addEventListener('beforeunload', () => {
  if (reportsRealtimeTimer) {
    clearTimeout(reportsRealtimeTimer);
  }
  if (reportsRealtimeChannel && typeof supabaseClient !== 'undefined') {
    try {
      supabaseClient.removeChannel(reportsRealtimeChannel);
    } catch (_) {
      // Ignore realtime cleanup issues on page exit.
    }
  }
});

const requestStatusFormEl = document.getElementById('requestStatusForm');
if (requestStatusFormEl) {
  requestStatusFormEl.addEventListener('submit', submitRequestStatusTransition);
}

document.getElementById('inventoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('inventoryMsg');
  const formData = new FormData(form);
  const payload = {
    mode: 'add',
    blood_type: String(formData.get('blood_type') || ''),
    units: Number(formData.get('units') || 0),
    status: 'available'
  };

  msg.textContent = 'Adding stock...';
  msg.className = 'form-msg info';

  const { data, error } = await updateInventoryStock(payload);
  if (error) {
    msg.textContent = error.message || 'Failed to add stock.';
    msg.className = 'form-msg error';
    return;
  }

  msg.textContent = `Stock added: ${escapeHtml(data?.blood_type || payload.blood_type)} now has ${formatNumber(data?.units_available || 0)} unit(s).`;
  msg.className = 'form-msg success';

  // Activity log
  recordAdminActivity({
    category: 'inventory',
    action: 'Added Blood Inventory Stock',
    target: `Blood Type ${data?.blood_type || payload.blood_type}`,
    details: `+${formatNumber(payload.units)} unit(s) added · Total now: ${formatNumber(data?.units_available || 0)} unit(s)`
  });

  await refreshOverviewStats();
  await Promise.all([
    refreshOverviewPanels(),
    refreshInventorySection(),
    refreshOverviewExpirationsTable()
  ]);

  setTimeout(closeInventoryModal, 900);
});

// ==================== NOTIFICATIONS SYSTEM ====================

let notificationsStore = [];          // master list
let notifFilter = 'all';              // active filter
let notifRealtimeChannel = null;
let notifRequestPollTimer = null;
let notifRequestPollSeeded = false;
const notifKnownRequestIds = new Set();
let notifNextId = 1;
const NOTIF_READ_KEY = 'bloodconnect_read_notifications';
const NOTIF_DISMISSED_KEY = 'bloodconnect_dismissed_notifications';

const NOTIF_ICONS = {
  donor: { icon: 'fa-user-plus', cls: 'notif-type-donor' },
  request: { icon: 'fa-hand-holding-medical', cls: 'notif-type-request' },
  inventory: { icon: 'fa-flask-vial', cls: 'notif-type-inventory' },
  critical: { icon: 'fa-triangle-exclamation', cls: 'notif-type-critical' },
  system: { icon: 'fa-circle-info', cls: 'notif-type-system' }
};

/** Push a new notification into the store */
function pushNotification({ type = 'system', title, body, critical = false, link = null, key = null }) {
  const id = notifNextId++;

  // Check persistence if key exists
  if (key) {
    if (notificationsStore.some((item) => item.key === key)) return;

    const dismissedKeys = JSON.parse(localStorage.getItem(NOTIF_DISMISSED_KEY) || '[]');
    if (dismissedKeys.includes(key)) return; // Don't even add if dismissed

    const readKeys = JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]');
    var isRead = readKeys.includes(key);
  } else {
    var isRead = false;
  }

  const notif = {
    id,
    key,
    type: critical ? 'critical' : type,
    title,
    body,
    critical,
    link,
    read: isRead,
    timestamp: new Date()
  };
  notificationsStore.unshift(notif);          // newest first
  if (notificationsStore.length > 150) notificationsStore.length = 150; // cap

  updateNotifBadge();
  renderNotificationsSection();

  // Animated bell shake
  const bellBtn = document.getElementById('notifBellBtn');
  if (bellBtn) {
    bellBtn.classList.remove('bell-shake');
    void bellBtn.offsetWidth;                 // force reflow
    bellBtn.classList.add('bell-shake');
    setTimeout(() => bellBtn.classList.remove('bell-shake'), 700);
  }
}

function rememberKnownRequest(row) {
  const requestId = Number(row?.request_id || row?.id || 0);
  if (Number.isFinite(requestId) && requestId > 0) {
    notifKnownRequestIds.add(requestId);
  }
}

function notifyNewBloodRequest(row) {
  if (!row) return false;
  const requestId = Number(row.request_id || row.id || 0);
  if (!Number.isFinite(requestId) || requestId <= 0) return false;
  if (!isPendingRequest(row)) return false;
  if (notifKnownRequestIds.has(requestId)) return false;

  notifKnownRequestIds.add(requestId);
  const isCrit = isUrgentRequest(row);
  pushNotification({
    key: `req_new_${requestId}`,
    type: 'request',
    title: 'New Blood Request Pending',
    body: `${formatRequestRequirement(row)} requested${isCrit ? ' - marked URGENT' : ''}. Awaiting coordinator review.`,
    critical: isCrit
  });
  return true;
}

async function pollForNewBloodRequests() {
  try {
    const { data, error } = await getOverviewRecentRequests(25);
    if (error || !Array.isArray(data)) return;

    if (!notifRequestPollSeeded) {
      data.forEach(rememberKnownRequest);
      notifRequestPollSeeded = true;
      return;
    }

    let foundNewRequest = false;
    data.slice().reverse().forEach((row) => {
      foundNewRequest = notifyNewBloodRequest(row) || foundNewRequest;
    });
    if (foundNewRequest) {
      refreshRequestsSection();
      refreshOverviewStats();
    }
  } catch (error) {
    console.warn('Request notification polling failed:', error);
  }
}

function startRequestNotificationPolling() {
  if (notifRequestPollTimer) return;
  [...requestsSectionCache, ...overviewRequestsCache].forEach(rememberKnownRequest);
  notifRequestPollTimer = window.setInterval(pollForNewBloodRequests, 15000);
  setTimeout(pollForNewBloodRequests, 3000);
}

/** Compute unread count & update header badge + dot */
function updateNotifBadge() {
  const unread = notificationsStore.filter(n => !n.read).length;
  const dot = document.getElementById('notifDot');
  const badge = document.getElementById('notifCountBadge');
  const sbBadge = document.getElementById('sidebarNotifBadge');

  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  if (badge) {
    badge.style.display = unread > 0 ? 'flex' : 'none';
    badge.textContent = unread > 99 ? '99+' : unread;
  }
  if (sbBadge) sbBadge.textContent = unread;
}

/** Mark all notifications as read */
function markAllNotificationsRead() {
  const readKeys = JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]');
  notificationsStore.forEach(n => {
    n.read = true;
    if (n.key && !readKeys.includes(n.key)) {
      readKeys.push(n.key);
    }
  });
  localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(readKeys));
  updateNotifBadge();
  renderNotificationsSection();
}

/** Clear all notifications */
function clearAllNotifications() {
  // Also clear persistence for bootstrap notifications
  const readKeys = JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]');
  const dismissedKeys = JSON.parse(localStorage.getItem(NOTIF_DISMISSED_KEY) || '[]');

  notificationsStore.forEach(n => {
    if (n.key) {
      if (!dismissedKeys.includes(n.key)) dismissedKeys.push(n.key);
    }
  });

  localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify(dismissedKeys));

  notificationsStore = [];
  notifNextId = 1;
  updateNotifBadge();
  renderNotificationsSection();
}

/** Mark a single notification as read */
function markNotifRead(id) {
  const n = notificationsStore.find(x => x.id === id);
  if (n) {
    n.read = true;
    if (n.key) {
      const readKeys = JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]');
      if (!readKeys.includes(n.key)) {
        readKeys.push(n.key);
        localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(readKeys));
      }
    }
  }
  updateNotifBadge();
  renderNotificationsSection();
}

/** Dismiss a single notification */
function dismissNotif(id) {
  const n = notificationsStore.find(x => x.id === id);
  if (n && n.key) {
    const dismissedKeys = JSON.parse(localStorage.getItem(NOTIF_DISMISSED_KEY) || '[]');
    if (!dismissedKeys.includes(n.key)) {
      dismissedKeys.push(n.key);
      localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify(dismissedKeys));
    }
  }
  notificationsStore = notificationsStore.filter(x => x.id !== id);
  updateNotifBadge();
  renderNotificationsSection();
}

/** Update stats cards in the notifications section */
function updateNotifStats() {
  const total = notificationsStore.length;
  const unread = notificationsStore.filter(n => !n.read).length;
  const critical = notificationsStore.filter(n => n.critical).length;
  const read = total - unread;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('notifStatTotal', formatNumber(total));
  setText('notifStatUnread', formatNumber(unread));
  setText('notifStatCritical', formatNumber(critical));
  setText('notifStatRead', formatNumber(read));
  setText('notifStatTotalNote', total > 0 ? `${formatNumber(total)} total alert(s)` : 'No notifications yet');
  setText('notifStatUnreadNote', unread > 0 ? `${formatNumber(unread)} unread notification(s)` : 'All caught up');
  setText('notifStatCriticalNote', critical > 0 ? `${formatNumber(critical)} critical alert(s)` : 'No critical alerts');
  setText('notifStatReadNote', read > 0 ? `${formatNumber(read)} notification(s) read` : 'No read notifications');
}

/** Get filtered list based on active tab */
function getFilteredNotifications() {
  const query = getSearchQuery();
  let list = notificationsStore;

  if (notifFilter === 'unread') list = list.filter(n => !n.read);
  else if (notifFilter === 'read') list = list.filter(n => n.read);
  else if (notifFilter !== 'all') list = list.filter(n => n.type === notifFilter);

  if (query) {
    list = list.filter(n =>
      String(n.title + ' ' + n.body).toLowerCase().includes(query)
    );
  }
  return list;
}

/** Render the notifications feed */
function renderNotificationsSection() {
  updateNotifStats();

  const feed = document.getElementById('notifFeed');
  const empty = document.getElementById('notifEmptyState');
  if (!feed) return;

  const list = getFilteredNotifications();

  if (!list.length) {
    feed.innerHTML = '';
    if (empty) {
      empty.style.display = 'flex';
      feed.appendChild(empty);
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  feed.innerHTML = list.map(n => {
    const meta = NOTIF_ICONS[n.type] || NOTIF_ICONS.system;
    const time = formatRelativeTime(n.timestamp);
    const unreadClass = n.read ? '' : 'notif-item--unread';
    const critClass = n.critical ? 'notif-item--critical' : '';

    return `
        <div class="notif-item ${unreadClass} ${critClass}" id="notif-${n.id}" onclick="markNotifRead(${n.id})">
          <div class="notif-icon-wrap ${meta.cls}">
            <i class="fa-solid ${meta.icon}"></i>
            ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
          </div>
          <div class="notif-body">
            <strong class="notif-title">${escapeHtml(n.title)}</strong>
            <span class="notif-desc">${escapeHtml(n.body)}</span>
            <div class="notif-meta">
              <small class="notif-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(time)}</small>
              ${n.type !== 'system' ? `<span class="notif-type-tag ${meta.cls}-tag">${n.type.charAt(0).toUpperCase() + n.type.slice(1)}</span>` : ''}
              ${n.critical ? '<span class="notif-type-tag notif-critical-tag"><i class="fa-solid fa-bolt"></i> Critical</span>' : ''}
            </div>
          </div>
          <button class="notif-dismiss-btn" onclick="event.stopPropagation(); dismissNotif(${n.id})" title="Dismiss">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;
  }).join('');
}

/** Setup filter tab buttons in notifications section */
function setupNotifFilters() {
  document.querySelectorAll('[data-notif-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      notifFilter = btn.dataset.notifFilter || 'all';
      document.querySelectorAll('[data-notif-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderNotificationsSection();
    });
  });
}

/** Scan existing cache for notifications (on page load) */
function generateBootstrapNotifications() {
  // Only pending requests require coordinator notification.
  overviewRequestsCache.filter(isPendingRequest).forEach(r => {
    const patient = Array.isArray(r.patient) ? r.patient[0] : r.patient;
    const name = formatCompleteName(patient, 'Unknown');
    const isCrit = isUrgentRequest(r);
    pushNotification({
      key: `req_new_${r.request_id || r.id}`,
      type: 'request',
      title: 'New Blood Request Pending',
      body: `Patient ${escapeHtml(name)} needs ${formatRequestRequirement(r)} - awaiting coordinator action.`,
      critical: isCrit
    });
  });

  // Recent registrations remain the only donor notifications.
  const recentDonors = donorCache.slice(0, 3);
  recentDonors.forEach(d => {
    pushNotification({
      key: `donor_reg_${d.id}`,
      type: 'donor',
      title: `New Donor Registered`,
      body: `${escapeHtml(formatCompleteName(d, 'A donor'))} registered as a ${d.blood_type || '?'} donor.`,
      critical: false
    });
  });
}

/** Start Supabase realtime channel for live notifications */
function initNotificationsRealtime() {
  if (typeof supabaseClient === 'undefined') return;

  notifRealtimeChannel = supabaseClient
    .channel('admin-notifications-live')

    // ---- NEW DONOR ----
    .on('postgres_changes', { event: 'INSERT', schema: 'blood_bank', table: 'donor' }, payload => {
      const d = payload.new || {};
      pushNotification({
        key: `donor_reg_${d.donor_id || d.id}`,
        type: 'donor',
        title: 'New Donor Registered',
        body: `${escapeHtml(formatCompleteName(d, 'A donor'))} joined as a ${d.blood_type || '?'} donor.`,
        critical: false
      });
      // Refresh donor cache in background
      loadDonors();
      refreshOverviewStats();
    })

    // ---- DONOR STATUS CHANGED ----
    .on('postgres_changes', { event: 'UPDATE', schema: 'blood_bank', table: 'donor' }, payload => {
      // Keep dashboard data current without creating an admin notification.
      loadDonors();
      refreshOverviewStats();
    })

    // ---- NEW BLOOD REQUEST ----
    .on('postgres_changes', { event: 'INSERT', schema: 'blood_bank', table: 'blood_request' }, payload => {
      const r = payload.new || {};
      notifyNewBloodRequest(r);
      refreshRequestsSection();
      refreshOverviewStats();
    })

    // ---- REQUEST STATUS CHANGED ----
    .on('postgres_changes', { event: 'UPDATE', schema: 'blood_bank', table: 'blood_request' }, payload => {
      const current = payload.new || {};
      const previous = payload.old || {};
      if (['emergency_donor', 'replacement'].includes(current.request_type)
          && current.recipient_received_at
          && !previous.recipient_received_at) {
        pushNotification({
          key: `request_received_${current.request_id || current.id}`,
          type: 'request',
          title: 'Blood received confirmed',
          body: current.request_type === 'replacement'
            ? `The requester confirmed blood receipt for replacement request #${current.request_id || current.id}. Replacement donations still require facility verification.`
            : `The requester marked emergency request #${current.request_id || current.id} as fulfilled. Verify any individual donation before adding donor history.`,
          critical: false
        });
      }
      refreshRequestsSection();
      refreshOverviewStats();
    })

    // ---- EMERGENCY PLEDGE AVAILABILITY CHANGED ----
    .on('postgres_changes', { event: 'UPDATE', schema: 'blood_bank', table: 'donor_pledge' }, payload => {
      const pledge = payload.new || {};
      if (pledge.status === 'unable_to_donate') {
        pushNotification({
          key: `pledge_unavailable_${pledge.pledge_id}`,
          type: 'request',
          title: 'Donor pledge released',
          body: `A donor became unable to complete a pledge for request #${pledge.request_id}. The active pledge count was updated and the request remains open if help is still needed.`,
          critical: false
        });
      }
      refreshRequestsSection();
      refreshOverviewStats();
    })

    // ---- INVENTORY CHANGE ----
    .on('postgres_changes', { event: '*', schema: 'blood_bank', table: 'blood_inventory' }, payload => {
      // Inventory remains live in the dashboard; it no longer produces admin notifications.
      refreshInventorySection();
      refreshOverviewInventoryPanel();
      refreshOverviewExpirationsTable();
      refreshOverviewStats();
    })

    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        console.info('Admin notification realtime subscribed.');
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('Admin notification realtime issue:', status, error || '');
      }
    });
}

/** Initialize notification system on page load */
function initNotifications() {
  setupNotifFilters();
  // Bootstrap notifications after data has loaded (slight delay)
  setTimeout(() => {
    generateBootstrapNotifications();
  }, 2500);
  initNotificationsRealtime();
  startRequestNotificationPolling();
}


// Call init after existing initialization
window.addEventListener('DOMContentLoaded', () => {
  // Small delay to let other data load first
  setTimeout(initNotifications, 500);
});


// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (notifRealtimeChannel && typeof supabaseClient !== 'undefined') {
    try { supabaseClient.removeChannel(notifRealtimeChannel); } catch (_) { }
  }
  if (notifRequestPollTimer) {
    clearInterval(notifRequestPollTimer);
  }
  if (bloodDrivesRealtimeChannel && typeof supabaseClient !== 'undefined') {
    try { supabaseClient.removeChannel(bloodDrivesRealtimeChannel); } catch (_) { }
  }
});

// Auto-refresh when landing, returning via bfcache, or switching back to the tab
if (typeof attachPageRefreshListeners === 'function') {
  attachPageRefreshListeners({
    onRefresh: async () => {
      try {
        await Promise.allSettled([
          typeof refreshOverviewStats === 'function' ? refreshOverviewStats() : Promise.resolve(),
          typeof refreshOverviewPanels === 'function' ? refreshOverviewPanels() : Promise.resolve(),
          typeof loadRequests === 'function' ? loadRequests() : Promise.resolve(),
          typeof loadDonors === 'function' ? loadDonors() : Promise.resolve(),
          typeof refreshInventorySection === 'function' ? refreshInventorySection() : Promise.resolve(),
          typeof refreshBloodDrives === 'function' ? refreshBloodDrives() : Promise.resolve()
        ]);
      } catch (_) { }
    },
    debounceMs: 2500
  });
}
// ==================== END NOTIFICATIONS SYSTEM ====================

// ==================== ACTIVITY LOGS ENGINE ====================

const ACTIVITY_LOGS_KEY = 'bloodconnect_admin_activity_logs';
const ACTIVITY_LOGS_MAX = 500;

/**
 * @typedef {{ id: number, timestamp: string, category: string, action: string,
 *             target: string, details: string, actor: string }} ActivityLogEntry
 */

let activityLogsCache = [];  // in-memory list, newest-first
let activityLogsNextId = 1;
let activityLogsFiltered = []; // currently rendered subset

// ---- Persistence helpers ----
function _loadActivityLogs() {
  try {
    const raw = localStorage.getItem(ACTIVITY_LOGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function _saveActivityLogs() {
  try {
    localStorage.setItem(ACTIVITY_LOGS_KEY, JSON.stringify(activityLogsCache.slice(0, ACTIVITY_LOGS_MAX)));
  } catch (_) { /* storage quota – silently ignore */ }
}

function _initActivityEngine() {
  const stored = _loadActivityLogs();
  // Filter out duplicate session starts caused by rapid page reloads
  const cleaned = [];
  let lastSessionTs = 0;
  for (const item of stored) {
    if (item.action === 'Admin Session Started') {
      const itemTs = new Date(item.timestamp).getTime();
      if (lastSessionTs && Math.abs(lastSessionTs - itemTs) < 4 * 60 * 60 * 1000) {
        continue;
      }
      lastSessionTs = itemTs;
    }
    cleaned.push(item);
  }

  activityLogsCache = cleaned;
  if (cleaned.length !== stored.length) {
    _saveActivityLogs();
  }
  activityLogsNextId = cleaned.length > 0
    ? Math.max(...cleaned.map(e => Number(e.id) || 0)) + 1
    : 1;
}
_initActivityEngine();

// ---- Public: record an action ----
/**
 * Record a coordinator/admin action in the activity log.
 * @param {Object} opts
 * @param {'requests'|'donors'|'inventory'|'drives'|'session'|'reports'} opts.category
 * @param {string} opts.action  – Short human-readable verb phrase e.g. "Verified Blood Request"
 * @param {string} [opts.target] – Entity identifier e.g. "REQ-42" or "John Santos"
 * @param {string} [opts.details] – Extra context e.g. reason, note, blood type
 */
function recordAdminActivity({ category, action, target = '', details = '' }) {
  const actor = currentAdminContext?.fullName || currentAdminContext?.email || 'Coordinator';
  const entry = {
    id: activityLogsNextId++,
    timestamp: new Date().toISOString(),
    category: String(category || 'session'),
    action: String(action || ''),
    target: String(target || ''),
    details: String(details || ''),
    actor: String(actor)
  };
  activityLogsCache.unshift(entry);
  if (activityLogsCache.length > ACTIVITY_LOGS_MAX) activityLogsCache.length = ACTIVITY_LOGS_MAX;
  _saveActivityLogs();

  // Live-update if currently viewing the section
  if (activeSection === 'activity') {
    _applyActivityFilters();
    _renderActivityTable();
    _updateActivityStats();
  }
}
window.recordAdminActivity = recordAdminActivity;

// ---- Stats ----
function _updateActivityStats() {
  const all = activityLogsCache;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const total = all.length;
  const today = all.filter(e => new Date(e.timestamp) >= todayStart).length;
  const requests = all.filter(e => e.category === 'requests').length;
  const donors = all.filter(e => e.category === 'donors').length;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('activityTotalActions', formatNumber(total));
  setText('activityTodayActions', formatNumber(today));
  setText('activityRequestActions', formatNumber(requests));
  setText('activityDonorActions', formatNumber(donors));
  setText('activityTotalActionsNote', total > 0 ? `${formatNumber(total)} operations on record` : 'No actions logged yet');
  setText('activityTodayActionsNote', today > 0 ? `${formatNumber(today)} action(s) today` : 'No actions recorded today');
  setText('activityRequestActionsNote', requests > 0 ? `${formatNumber(requests)} request operation(s)` : 'No request operations yet');
  setText('activityDonorActionsNote', donors > 0 ? `${formatNumber(donors)} donor operation(s)` : 'No donor operations yet');
}

// ---- Filter helpers ----
function _applyActivityFilters() {
  const category = String(document.getElementById('activityCategoryFilter')?.value || 'all');
  const timeframe = String(document.getElementById('activityTimeframeFilter')?.value || 'all');
  const query = getSearchQuery().toLowerCase();

  const now = new Date();
  let cutoff = null;
  if (timeframe === 'today') {
    cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0);
  } else if (timeframe === 'week') {
    cutoff = new Date(now); cutoff.setDate(now.getDate() - 7);
  } else if (timeframe === 'month') {
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  activityLogsFiltered = activityLogsCache.filter(e => {
    if (category !== 'all' && e.category !== category) return false;
    if (cutoff && new Date(e.timestamp) < cutoff) return false;
    if (query) {
      const blob = `${e.action} ${e.target} ${e.details} ${e.actor} ${e.category}`.toLowerCase();
      if (!blob.includes(query)) return false;
    }
    return true;
  });
}

let activityShowAllLogs = false;

function togglePastActivityLogs() {
  activityShowAllLogs = !activityShowAllLogs;
  _renderActivityTable();
  _updateActivityFilterSummary();
}
window.togglePastActivityLogs = togglePastActivityLogs;

function filterActivityLogs() {
  activityShowAllLogs = false;
  _applyActivityFilters();
  _renderActivityTable();
  _updateActivityFilterSummary();
}
window.filterActivityLogs = filterActivityLogs;

function clearActivityFilters() {
  const cat = document.getElementById('activityCategoryFilter');
  const tf = document.getElementById('activityTimeframeFilter');
  if (cat) cat.value = 'all';
  if (tf) tf.value = 'all';
  filterActivityLogs();
}
window.clearActivityFilters = clearActivityFilters;

function _updateActivityFilterSummary() {
  const el = document.getElementById('activityFilterSummary');
  const footer = document.getElementById('activityTableFooter');
  const toggleText = document.getElementById('togglePastActivityLogsText');
  const toggleIcon = document.getElementById('togglePastActivityLogsIcon');

  const total = activityLogsFiltered.length;
  const all = activityLogsCache.length;

  if (el) {
    if (total === 0) {
      el.textContent = all === 0 ? 'No activity recorded yet. Start using the dashboard to generate logs.' : 'No activity log entries match the current filters.';
    } else if (activityShowAllLogs) {
      el.textContent = `Showing all ${formatNumber(total)} activity log entries${total < all ? ' matching current filters' : ''}.`;
    } else if (total > 10) {
      el.textContent = `Showing latest 10 of ${formatNumber(total)} activity log entries${total < all ? ' matching current filters' : ''}.`;
    } else if (total === all) {
      el.textContent = `Showing ${formatNumber(total)} activity log entr${total === 1 ? 'y' : 'ies'}.`;
    } else {
      el.textContent = `Showing ${formatNumber(total)} of ${formatNumber(all)} entries matching current filters.`;
    }
  }

  if (footer) {
    if (total <= 10) {
      footer.style.display = 'none';
    } else {
      footer.style.display = 'flex';
      if (activityShowAllLogs) {
        if (toggleText) toggleText.textContent = 'Show Less (Top 10)';
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-up';
      } else {
        const remaining = total - 10;
        if (toggleText) toggleText.textContent = `Show Past Logs (${remaining} older entr${remaining === 1 ? 'y' : 'ies'})`;
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-clock-rotate-left';
      }
    }
  }
}

// ---- Render table ----
const ACTIVITY_CATEGORY_META = {
  requests:  { label: 'Requests',  cls: 'requests' },
  donors:    { label: 'Donors',    cls: 'donors' },
  inventory: { label: 'Inventory', cls: 'inventory' },
  drives:    { label: 'Drives',    cls: 'drives' },
  session:   { label: 'Session',   cls: 'session' },
  reports:   { label: 'Reports',   cls: 'session' }
};

function _renderActivityTable() {
  const tbody = document.getElementById('activityLogsBody');
  if (!tbody) return;

  if (activityLogsFiltered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--slate-400,#94a3b8);padding:48px;">
      <i class="fa-solid fa-clipboard-list" style="font-size:1.8rem;margin-bottom:12px;display:block;opacity:0.35;"></i>
      No activity log entries match the current filters.
    </td></tr>`;
    return;
  }

  // Display top 10 or all depending on activityShowAllLogs
  const displayed = activityShowAllLogs ? activityLogsFiltered : activityLogsFiltered.slice(0, 10);

  tbody.innerHTML = displayed.map(e => {
    const meta = ACTIVITY_CATEGORY_META[e.category] || { label: e.category, cls: 'session' };
    const ts = new Date(e.timestamp);
    const tsStr = Number.isNaN(ts.getTime()) ? '-' : ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const relStr = formatRelativeTime(e.timestamp);

    return `<tr>
      <td title="${escapeHtml(ts.toLocaleString())}">
        <span style="font-weight:600;white-space:nowrap;">${escapeHtml(tsStr)}</span><br>
        <small style="color:var(--slate-400,#94a3b8);">${escapeHtml(relStr)}</small>
      </td>
      <td><span class="activity-badge ${escapeHtml(meta.cls)}">${escapeHtml(meta.label)}</span></td>
      <td><span class="activity-action-name">${escapeHtml(e.action)}</span></td>
      <td>${e.target ? `<span class="activity-target-pill">${escapeHtml(e.target)}</span>` : '<span style="color:var(--slate-400,#94a3b8);">—</span>'}</td>
      <td class="activity-details-cell">${escapeHtml(e.details) || '<span style="color:var(--slate-400,#94a3b8);">—</span>'}</td>
      <td><span class="activity-actor-tag">${escapeHtml(e.actor)}</span></td>
    </tr>`;
  }).join('');
}

// ---- Main section render / refresh ----
function renderActivityLogsSection() {
  _applyActivityFilters();
  _renderActivityTable();
  _updateActivityStats();
  _updateActivityFilterSummary();
}
window.renderActivityLogsSection = renderActivityLogsSection;

function refreshActivityLogsSection() {
  // Re-init from localStorage in case another tab wrote entries
  _initActivityEngine();
  renderActivityLogsSection();
  const note = document.getElementById('activityStatusNote');
  if (note) {
    note.textContent = `Last refreshed: ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  }
}
window.refreshActivityLogsSection = refreshActivityLogsSection;

// ---- CSV Export ----
function exportActivityLogsCsv() {
  _applyActivityFilters();
  const rows = activityLogsFiltered;
  if (rows.length === 0) {
    alert('No activity log entries to export with the current filters.');
    return;
  }

  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Timestamp', 'Category', 'Action', 'Subject / Target', 'Details', 'Coordinator'];
  const csvLines = [
    header.join(','),
    ...rows.map(e => [
      escape(new Date(e.timestamp).toLocaleString('en-US')),
      escape(e.category),
      escape(e.action),
      escape(e.target),
      escape(e.details),
      escape(e.actor)
    ].join(','))
  ];

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 800);
}
window.exportActivityLogsCsv = exportActivityLogsCsv;

// ---- Session login record (once per browser session, never on page refresh) ----
(function recordSessionLogin() {
  const SESSION_FLAG = 'bc_admin_session_logged';
  if (sessionStorage.getItem(SESSION_FLAG)) return;

  setTimeout(() => {
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    sessionStorage.setItem(SESSION_FLAG, 'true');
    recordAdminActivity({
      category: 'session',
      action: 'Admin Session Started',
      target: '',
      details: `Logged in as ${currentAdminContext?.email || 'coordinator'}`
    });
  }, 3500);
})();

// ==================== END ACTIVITY LOGS ENGINE ====================
