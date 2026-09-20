(async () => {
  const STORAGE_KEY = 'veindropPatientNotificationState';
  const todayList = document.getElementById('todayNotificationList');
  const earlierList = document.getElementById('earlierNotificationList');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function formatFrontendBrand(value) {
    return String(value ?? '').replace(/veindrop/gi, 'BloodConnect');
  }

  function getNotificationPresentation(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'donor_appeal') return { icon: 'fa-bell', style: 'warning' };
    if (t === 'pledge_received' || t === 'request_fulfilled' || t === 'pledged_request_fulfilled' || t === 'request_still_needs_donors') return { icon: 'fa-hand-holding-heart', style: 'match' };
    if (t === 'pledge_unavailable' || t === 'pledged_donor_unavailable' || t === 'pledge_unsuccessful') return { icon: 'fa-circle-exclamation', style: 'status' };
    if (t === 'request_updated' || t === 'request_approved') return { icon: 'fa-file-circle-check', style: 'info' };
    if (t.includes('drive') || t === 'blood_drive_scheduled' || t === 'blood_drive_reminder' || t === 'blood_drive_update') {
      return { icon: 'fa-calendar-check', style: 'drive' };
    }
    if (t === 'donor_match' || t === 'match_found') {
      return { icon: 'fa-heart-pulse', style: 'match' };
    }
    return { icon: 'fa-bell', style: 'info' };
  }

  function getNotificationTarget(notification) {
    const type = String(notification?.notification_type || '').toLowerCase();
    const title = String(notification?.title || '').toLowerCase();
    const message = String(notification?.message || '').toLowerCase();

    if (
      notification?.drive_id ||
      type.includes('drive') ||
      title.includes('blood drive') ||
      title.includes('bloodlet') ||
      message.includes('blood drive') ||
      message.includes('open blood drives')
    ) {
      return 'account_dashboard.html#section-drives';
    }

    if (type === 'donor_match' || type === 'match_found' || title.includes('match found')) {
      return 'recipient_donor_map.html';
    }

    return 'account_dashboard.html#section-requests';
  }

  function formatNotificationTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function renderDatabaseNotifications() {
    if (typeof listMyNotifications !== 'function') return;
    const { data, error } = await listMyNotifications(50);
    if (error) {
      console.warn('Unable to load in-app notifications:', error);
      return;
    }

    (data || []).slice().reverse().forEach((notification) => {
      const createdAt = new Date(notification.created_at);
      const isToday = !Number.isNaN(createdAt.getTime()) && createdAt.toDateString() === new Date().toDateString();
      const list = isToday ? todayList : earlierList;
      if (!list) return;

      const presentation = getNotificationPresentation(notification.notification_type);
      const targetUrl = getNotificationTarget(notification);
      const item = document.createElement('article');
      item.className = `full-notification${notification.read_at ? '' : ' unread'}`;
      item.dataset.id = `db-${notification.notification_id}`;
      item.dataset.databaseId = String(notification.notification_id);
      item.dataset.target = targetUrl;
      item.tabIndex = 0;
      item.setAttribute('role', 'link');
      item.innerHTML = `
        <div class="notification-icon ${presentation.style}"><i class="fa-solid ${presentation.icon}" aria-hidden="true"></i></div>
        <div class="notification-content">
          <div class="notification-title-row">
            <h4>${escapeHtml(formatFrontendBrand(notification.title || 'Notification'))}</h4>
            <time datetime="${escapeHtml(notification.created_at || '')}">${escapeHtml(formatNotificationTime(notification.created_at))}</time>
          </div>
          <p>${escapeHtml(formatFrontendBrand(notification.message || ''))}</p>
        </div>
        ${notification.read_at ? '' : '<span class="unread-dot" aria-label="Unread"></span>'}`;
      list.prepend(item);
    });
  }

  await renderDatabaseNotifications();
  const notifications = [...document.querySelectorAll('.full-notification')];
  const unreadCount = document.getElementById('unreadCount');
  const markAllButton = document.getElementById('markAllRead');
  const emptyState = document.getElementById('notificationsEmpty');
  const toast = document.getElementById('undoToast');
  const undoButton = document.getElementById('undoDelete');
  const filterButtons = [...document.querySelectorAll('.filter-button')];
  let activeFilter = 'all';
  let lastDeleted = null;
  let toastTimer = null;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { read: [], deleted: [] };
    } catch {
      return { read: [], deleted: [] };
    }
  }

  let state = loadState();
  state.read = Array.isArray(state.read) ? state.read : [];
  state.deleted = Array.isArray(state.deleted) ? state.deleted : [];

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setRead(item, isRead, persist = true) {
    const id = item.dataset.id;
    state.read = isRead
      ? [...new Set([...state.read, id])]
      : state.read.filter((savedId) => savedId !== id);
    item.classList.toggle('unread', !isRead);
    const dot = item.querySelector('.unread-dot');
    if (isRead && dot) dot.remove();
    if (!isRead && !dot) {
      const newDot = document.createElement('span');
      newDot.className = 'unread-dot';
      newDot.setAttribute('aria-label', 'Unread');
      item.appendChild(newDot);
    }
    const unreadDot = item.querySelector('.unread-dot');
    if (!isRead && unreadDot && unreadDot.parentElement !== item) item.appendChild(unreadDot);
    const readButton = item.querySelector('[data-action="read"]');
    if (readButton) {
      readButton.innerHTML = isRead
        ? '<i class="fa-regular fa-envelope" aria-hidden="true"></i>Mark as unread'
        : '<i class="fa-regular fa-envelope-open" aria-hidden="true"></i>Mark as read';
      readButton.setAttribute('aria-label', isRead ? 'Mark as unread' : 'Mark as read');
    }
    saveState();
    updateView();
    if (persist && item.dataset.databaseId && typeof setMyNotificationReadState === 'function') {
      setMyNotificationReadState(item.dataset.databaseId, isRead).catch(() => {});
    }
  }

  function addActions(item) {
    const actions = document.createElement('div');
    actions.className = 'notification-actions';
    actions.innerHTML = `
      <button class="notification-menu-trigger" type="button" data-action="menu" aria-label="Notification options" aria-haspopup="menu" aria-expanded="false">
        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
      <div class="notification-menu" role="menu">
        <button class="notification-menu-item" type="button" data-action="read" role="menuitem"></button>
        <button class="notification-menu-item delete" type="button" data-action="delete" role="menuitem" aria-label="Delete notification">
          <i class="fa-regular fa-trash-can" aria-hidden="true"></i>Delete
        </button>
      </div>`;
    item.appendChild(actions);
    setRead(item, state.read.includes(item.dataset.id) || !item.classList.contains('unread'), false);
  }

  function closeMenus() {
    notifications.forEach((item) => {
      item.classList.remove('menu-open');
      item.querySelector('.notification-menu')?.classList.remove('active');
      item.querySelector('.notification-menu-trigger')?.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.full-notification-list').forEach((list) => {
      list.classList.remove('menu-active');
    });
  }

  function toggleMenu(item) {
    const menu = item.querySelector('.notification-menu');
    const trigger = item.querySelector('.notification-menu-trigger');
    const shouldOpen = !menu.classList.contains('active');
    closeMenus();
    if (shouldOpen) {
      item.classList.add('menu-open');
      item.closest('.full-notification-list')?.classList.add('menu-active');
      menu.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  function updateView() {
    let visibleCount = 0;
    let unreadTotal = 0;

    notifications.forEach((item) => {
      const deleted = state.deleted.includes(item.dataset.id);
      const unread = item.classList.contains('unread');
      if (!deleted && unread) unreadTotal += 1;
      const visible = !deleted && (activeFilter === 'all' || unread);
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    document.querySelectorAll('.notification-group').forEach((group) => {
      group.hidden = ![...group.querySelectorAll('.full-notification')].some((item) => !item.hidden);
    });

    unreadCount.innerHTML = `<i class="fa-solid fa-circle" aria-hidden="true"></i> ${unreadTotal} unread`;
    markAllButton.disabled = unreadTotal === 0;
    emptyState.hidden = visibleCount !== 0;
  }

  function openNotification(item) {
    if (item.classList.contains('unread')) setRead(item, true);
    window.location.href = item.dataset.target;
  }

  function deleteNotification(item) {
    state.deleted = [...new Set([...state.deleted, item.dataset.id])];
    lastDeleted = item.dataset.id;
    saveState();
    updateView();
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
      lastDeleted = null;
    }, 5000);
  }

  notifications.forEach((item) => {
    addActions(item);
    item.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      if (action) {
        event.stopPropagation();
        if (action.dataset.action === 'menu') toggleMenu(item);
        if (action.dataset.action === 'read') setRead(item, item.classList.contains('unread'));
        if (action.dataset.action === 'delete') deleteNotification(item);
        if (action.dataset.action !== 'menu') closeMenus();
        return;
      }
      openNotification(item);
    });
    item.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('[data-action]')) {
        event.preventDefault();
        openNotification(item);
      }
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((filterButton) => filterButton.classList.toggle('active', filterButton === button));
      updateView();
    });
  });

  markAllButton.addEventListener('click', () => {
    notifications
      .filter((item) => !state.deleted.includes(item.dataset.id))
      .forEach((item) => setRead(item, true));
  });

  undoButton.addEventListener('click', () => {
    if (!lastDeleted) return;
    state.deleted = state.deleted.filter((id) => id !== lastDeleted);
    lastDeleted = null;
    saveState();
    toast.hidden = true;
    window.clearTimeout(toastTimer);
    updateView();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-actions')) closeMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenus();
  });

  updateView();

  if (typeof attachPageRefreshListeners === 'function') {
    attachPageRefreshListeners({
      onRefresh: () => {
        state = loadState();
        updateView();
      },
      debounceMs: 2000
    });
  }
})();
