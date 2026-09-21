    const loginUrl = new URL(window.location.href);
    const nextDestination = loginUrl.searchParams.get('next');
    const freshLoginRequested = loginUrl.searchParams.get('fresh') === '1';

    (async function initLoginPage() {
      const url = new URL(window.location.href);
      const justRegistered = url.searchParams.get('registered') === '1';

      if (justRegistered || freshLoginRequested) {
        await clearAuthSession();
        url.searchParams.delete('registered');
        url.searchParams.delete('fresh');
        const query = url.searchParams.toString();
        const cleanUrl = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
        window.history.replaceState({}, '', cleanUrl);
        return;
      }

      // Only auto-redirect when the login page was opened for a specific destination.
      // This prevents a previously saved session from immediately taking over when a user
      // simply opens the sign-in page to log in with another account.
      if (nextDestination) {
        await redirectIfLoggedIn();
      }
    })();

    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.toggle-password');
    const toggleIcon = document.getElementById('toggleIcon');
    const homeLink = document.querySelector('.home-fab');

    if (homeLink) {
      homeLink.addEventListener('click', (event) => {
        event.preventDefault();
        document.body.classList.add('page-leave');
        setTimeout(() => {
          window.location.href = homeLink.href;
        }, 360);
      });
    }

    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      toggleIcon.classList.toggle('fa-eye', !isPassword);
      toggleIcon.classList.toggle('fa-eye-slash', isPassword);
    });

    // Left visual slideshow
    const slides = Array.from(document.querySelectorAll('.show-slide'));
    const dots = Array.from(document.querySelectorAll('.showcase-dots .dot'));
    let activeSlideIndex = 0;

    function setSlide(index) {
      slides.forEach((slide, i) => {
        slide.classList.toggle('is-active', i === index);
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
      });
      activeSlideIndex = index;
    }

    setInterval(() => {
      const nextIndex = (activeSlideIndex + 1) % slides.length;
      setSlide(nextIndex);
    }, 3200);

    // Handle login form submission
    const alertBox = document.getElementById('alertBox');
    let alertTimer = null;

    function showAlert(message, type, targetInput = null) {
      alertBox.textContent = message;
      alertBox.className = `toast-alert show ${type === 'error' ? 'error' : 'success'}${targetInput ? ' field-popover' : ''}`;

      alertBox.style.removeProperty('--popover-top');
      alertBox.style.removeProperty('--popover-left');
      alertBox.style.removeProperty('--popover-width');

      if (targetInput) {
        const cardRect = targetInput.closest('.form-card').getBoundingClientRect();
        const inputRect = targetInput.getBoundingClientRect();
        alertBox.style.setProperty('--popover-top', `${inputRect.top - cardRect.top}px`);
        alertBox.style.setProperty('--popover-left', `${inputRect.left - cardRect.left}px`);
        alertBox.style.setProperty('--popover-width', `${inputRect.width}px`);
      }

      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        alertBox.classList.remove('show');
      }, 5000);
    }

    document.querySelector('.login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const loginIdentifier = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const btn = e.target.querySelector('.btn-primary');

      if (!loginIdentifier || !password) {
        const missingInput = !loginIdentifier
          ? document.getElementById('email')
          : document.getElementById('password');
        showAlert('Please fill in all fields.', 'error', missingInput);
        missingInput.classList.add('is-required');
        missingInput.setAttribute('aria-invalid', 'true');
        missingInput.focus();
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

      try {
          const { data, error } = await signIn(loginIdentifier, password);

          if (error) {
            showAlert(error.message || 'An unknown error occurred.', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
            return;
          }

        showAlert('Login successful! Redirecting...', 'success');

        // Role-based redirect
        setTimeout(() => {
          if (nextDestination) {
            window.location.href = nextDestination;
            return;
          }

          const role = data.profile.role;
          if (role === 'admin') {
            window.location.href = 'admin_dashboard.html';
          } else {
            window.location.href = 'account_dashboard.html';
          }
        }, 600);

      } catch (error) {
        console.error('Login error:', error);
        showAlert('Could not connect to the server.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
      }
    });

    document.querySelectorAll('.login-form input').forEach((input) => {
      input.addEventListener('input', () => {
        input.classList.remove('is-required');
        input.removeAttribute('aria-invalid');
        if (alertBox.classList.contains('field-popover')) {
          alertBox.classList.remove('show');
        }
      });
    });

    // Reload when switching between DevTools simulator and desktop mode
    if (typeof attachPageRefreshListeners === 'function') {
      attachPageRefreshListeners({
        onRefresh: (info) => {
          // Only reload on viewport width change (simulator ↔ desktop toggle)
          if (info?.reason === 'viewport_resize') {
            window.location.reload();
          }
        },
        debounceMs: 1000
      });
    }
