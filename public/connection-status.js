(() => {
  let notice;
  function updateConnectionStatus() {
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'connectionStatusNotice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.setAttribute('tabindex', '-1');
      notice.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;box-sizing:border-box;width:max-content;max-width:calc(100vw - 32px);padding:14px 20px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;box-shadow:0 8px 30px rgba(15,23,42,.18);font:500 14px/1.5 system-ui,sans-serif;text-align:center;';
      document.body.appendChild(notice);
    }
    notice.hidden = navigator.onLine !== false;
    notice.textContent = notice.hidden ? '' : "You’re offline. Connect to the internet to load the latest data or save changes.";
  }
  // Capture before form handlers so offline attempts never start a request or spinner.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form.matches('form[data-requires-online]') || navigator.onLine !== false) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    updateConnectionStatus();
    const action = form.dataset.requiresOnline || 'submit this form';
    notice.textContent = `You’re offline. Connect to the internet to ${action}, then try again. Your entries have been kept on this page.`;
    notice.focus({ preventScroll: true });
  }, true);
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateConnectionStatus, { once: true });
  } else {
    updateConnectionStatus();
  }
})();
