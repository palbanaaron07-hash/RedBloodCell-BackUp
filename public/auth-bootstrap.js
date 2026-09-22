(() => {
  // Never leave the entry page hidden if an external auth dependency is unavailable.
  window.setTimeout(() => {
    document.documentElement.classList.remove('auth-checking');
  }, 8000);
})();
