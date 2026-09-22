    /*
     * Browsers may restore this page from the back/forward cache with the
     * leave-transition class or without Vite's development stylesheet applied.
     */
    window.addEventListener('pageshow', () => {
      document.body.classList.remove('page-leave');
      refreshHomeSession();

      window.requestAnimationFrame(() => {
        const expectedStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--hero-bg')
          .trim();
        if (expectedStyle) return;

        const stylesheet = document.querySelector('link[rel="stylesheet"][href*="home.css"]');
        if (!stylesheet) return;

        const refreshedUrl = new URL(stylesheet.href, window.location.href);
        refreshedUrl.searchParams.set('restore', Date.now().toString());
        stylesheet.href = refreshedUrl.href;
      });
    });

    /* -- Page-leave transitions for external links -- */
    const topLinks = document.querySelectorAll('.top-actions a');
    const requestBloodLink = document.querySelector('.hero-actions a[href="account_dashboard.html"]');
    const becomeDonorLink = document.getElementById('becomeDonorLink');

    topLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        document.body.classList.add('page-leave');
        setTimeout(() => { window.location.href = link.href; }, 340);
      });
    });

    if (becomeDonorLink) {
      becomeDonorLink.addEventListener('click', (event) => {
        event.preventDefault();
        document.body.classList.add('page-leave');
        setTimeout(() => { window.location.href = becomeDonorLink.href; }, 340);
      });
    }

    if (requestBloodLink) {
      requestBloodLink.addEventListener('click', async (event) => {
        event.preventDefault();
        document.body.classList.add('page-leave');
        try {
          const { user, profile } = await getCurrentUser();
          const destination = user && profile
            ? 'account_dashboard.html'
            : 'login.html?next=account_dashboard.html';
          setTimeout(() => { window.location.href = destination; }, 340);
        } catch (error) {
          console.error('Request blood redirect error:', error);
          setTimeout(() => { window.location.href = 'login.html?next=account_dashboard.html'; }, 340);
        }
      });
    }

    /* -- Scroll-reveal for service cards -- */
    const cards = document.querySelectorAll('.service-card');
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          entry.target.style.animationDelay = `${i * 0.08}s`;
          entry.target.classList.add('card-revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    cards.forEach(card => revealObserver.observe(card));

    /* -- Scroll-reveal for guide items -- */
    const guideItems = document.querySelectorAll('.doctor-guide-item');
    const guideObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          entry.target.style.animationDelay = `${i * 0.12}s`;
          entry.target.classList.add('guide-revealed');
          guideObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    guideItems.forEach(item => guideObserver.observe(item));

    /* -- Navigation active state & scrollspy -- */
    const navLinks = document.querySelectorAll('.topnav a');

    // Section-to-href map (order matters: top -> bottom of page)
    const sectionMap = [
      { id: 'our-system', href: '#our-system' },
      { id: 'about', href: '#about' },
      { id: 'privacy-policy', href: '#privacy-policy' }
    ];

    let rafPending = false;
    let lastActiveHref = null;
    let pendingNavHref = null;

    function setActiveByScroll() {
      const OFFSET = 80; // sticky header height

      if (pendingNavHref) {
        const pendingTarget = document.getElementById(pendingNavHref.slice(1));
        const isAtPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        const hasReachedTarget = pendingTarget && Math.abs(pendingTarget.getBoundingClientRect().top - OFFSET) <= 24;

        if (!hasReachedTarget && !(pendingNavHref === '#privacy-policy' && isAtPageBottom)) {
          rafPending = false;
          return;
        }

        pendingNavHref = null;
      }

      let activeHref = null;

      for (const { id, href } of sectionMap) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= OFFSET) {
          activeHref = href;
        }
      }

      const isAtPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (isAtPageBottom) {
        activeHref = '#privacy-policy';
      }

      if (activeHref !== lastActiveHref) {
        lastActiveHref = activeHref;
        navLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === activeHref);
        });
      }

      rafPending = false;
    }

    function onScroll() {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(setActiveByScroll);
      }
    }

    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;

        navLinks.forEach((navLink) => navLink.classList.remove('active'));
        link.classList.add('active');
        lastActiveHref = href;
        pendingNavHref = href;
      });
    });

    let homeSessionCheck = null;

    async function refreshHomeSession() {
      if (homeSessionCheck) return homeSessionCheck;
      document.documentElement.classList.add('auth-checking');

      homeSessionCheck = (async () => {
        try {
          if (typeof getCurrentUser !== 'function') {
            document.documentElement.classList.remove('auth-checking');
            return;
          }
          const { user, profile, authState } = await getCurrentUser();

          if (user) {
            window.location.replace(getDashboardDestination(user, profile));
            return;
          }

          if (authState === 'expired') {
            window.location.replace('login.html?session=expired');
            return;
          }

          document.documentElement.classList.remove('auth-checking');
        } catch (_) {
          document.documentElement.classList.remove('auth-checking');
        } finally {
          homeSessionCheck = null;
        }
      })();

      return homeSessionCheck;
    }

    refreshHomeSession();

    if (typeof attachPageRefreshListeners === 'function') {
      attachPageRefreshListeners({
        onRefresh: () => {
          refreshHomeSession();
        },
        debounceMs: 2500
      });
    }
