    redirectIfLoggedIn();

    // Browsers may restore this page from their back-forward cache.
    // Always make the form visible again when that happens.
    window.addEventListener('pageshow', () => {
      document.body.classList.remove('page-leave');
    });

    /* Keep the focused field above mobile on-screen keyboards. */
    const mobileViewportQuery = window.matchMedia('(max-width: 640px)');
    const mobileVisualViewport = window.visualViewport;
    const registrationCard = document.querySelector('.form-card');
    let focusedFieldTimer = null;

    function keepFocusedFieldVisible() {
      if (!mobileViewportQuery.matches || !registrationCard) return;
      const field = document.activeElement;
      if (!field?.matches('input, textarea, select') || !registrationCard.contains(field)) return;

      const viewportTop = mobileVisualViewport?.offsetTop || 0;
      const viewportHeight = mobileVisualViewport?.height || window.innerHeight;
      const visibleTop = viewportTop + 16;
      const visibleBottom = viewportTop + viewportHeight - 20;
      const fieldRect = field.getBoundingClientRect();

      if (fieldRect.top < visibleTop || fieldRect.bottom > visibleBottom) {
        const comfortableTop = visibleTop + Math.max(12, (visibleBottom - visibleTop - fieldRect.height) * 0.32);
        registrationCard.scrollBy({
          top: fieldRect.top - comfortableTop,
          behavior: 'smooth'
        });
      }
    }

    function updateMobileVisibleViewport() {
      if (!mobileViewportQuery.matches) {
        document.documentElement.style.removeProperty('--mobile-visible-height');
        return;
      }

      const visibleHeight = Math.round(mobileVisualViewport?.height || window.innerHeight);
      document.documentElement.style.setProperty('--mobile-visible-height', `${visibleHeight}px`);
      window.requestAnimationFrame(keepFocusedFieldVisible);
    }

    function scheduleFocusedFieldVisibility() {
      window.clearTimeout(focusedFieldTimer);
      focusedFieldTimer = window.setTimeout(keepFocusedFieldVisible, 260);
    }

    updateMobileVisibleViewport();
    document.addEventListener('focusin', scheduleFocusedFieldVisibility);
    mobileVisualViewport?.addEventListener('resize', updateMobileVisibleViewport);
    mobileVisualViewport?.addEventListener('scroll', updateMobileVisibleViewport);
    window.addEventListener('orientationchange', updateMobileVisibleViewport);
    window.addEventListener("resize", updateMobileVisibleViewport);

    const homeLink = document.querySelector('.home-fab');
    if (homeLink) {
      homeLink.addEventListener('click', (event) => {
        event.preventDefault();

        const activeStep = document.querySelector('.form-step:not(.hidden)');
        const currentStep = activeStep ? Number(activeStep.id.split('-')[1]) : 1;

        if (currentStep > 1) {
          goToStep(currentStep - 1);
          return;
        }

        let previousPage = '';
        try {
          const referrerUrl = document.referrer ? new URL(document.referrer) : null;
          const currentUrl = new URL(window.location.href);
          const isDifferentLocalPage = referrerUrl
            && referrerUrl.origin === currentUrl.origin
            && referrerUrl.pathname !== currentUrl.pathname;
          if (isDifferentLocalPage) previousPage = referrerUrl.href;
        } catch (_) {
          previousPage = '';
        }

        window.location.href = previousPage || homeLink.href;
      });
    }

    function normalizePhoneNumber(phone) {
      return /^09\d{9}$/.test(phone) ? phone : '';
    }

    function validatePhoneNumber(showMessage = true) {
      const phoneInput = document.getElementById('phone');
      const normalizedPhone = normalizePhoneNumber(phoneInput.value.trim());
      const isValid = Boolean(normalizedPhone);

      phoneInput.setCustomValidity(isValid ? '' : 'Enter exactly 11 digits and start with 09, like 09171234567.');

      if (!isValid && showMessage) {
        showAlert('Phone number must be exactly 11 digits and start with 09.', 'error');
        phoneInput.reportValidity();
        phoneInput.focus();
      }

      return isValid;
    }

    function validateEmailInput(showMessage = true) {
      const emailInput = document.getElementById('email');
      const emailFeedback = document.getElementById('emailFeedback');
      const emailCheck = validateRegistrationEmail(emailInput.value);
      emailInput.setCustomValidity(emailCheck.ok ? '' : emailCheck.message);

      const hasEmailValue = emailInput.value.trim().length > 0;
      emailInput.classList.toggle('is-invalid', hasEmailValue && !emailCheck.ok);
      emailInput.setAttribute('aria-invalid', String(hasEmailValue && !emailCheck.ok));
      emailFeedback.textContent = hasEmailValue && !emailCheck.ok
        ? 'Enter a complete and valid email address.'
        : '';
      emailFeedback.classList.toggle('error', hasEmailValue && !emailCheck.ok);

      if (!emailCheck.ok && showMessage) {
        showAlert(emailCheck.message, 'error');
        emailInput.reportValidity();
        emailInput.focus();
      }

      return emailCheck.ok;
    }

    const dobInput = document.getElementById('dob');

    function localDateInputValue(date = new Date()) {
      const year = String(date.getFullYear()).padStart(4, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function trimExtraBirthYearDigits() {
      const match = String(dobInput.value || '').match(/^(\d{5,})(-\d{2}-\d{2})$/);
      if (match) dobInput.value = `${match[1].slice(0, 4)}${match[2]}`;
    }

    function validateDateOfBirth(showMessage = true) {
      if (dobInput.validity.badInput) dobInput.value = '';
      trimExtraBirthYearDigits();
      const selectedRole = document.querySelector('input[name="account_role"]:checked')?.value;
      const result = validateBirthDateValue(dobInput.value, {
        minimumYear: 1900,
        minimumAge: selectedRole === 'donor' ? 18 : 0
      });
      dobInput.setCustomValidity(result.ok ? '' : result.message);

      if (!result.ok && showMessage) {
        showAlert(result.message, 'error');
        dobInput.reportValidity();
        dobInput.focus();
      }
      return result.ok;
    }

    dobInput.max = localDateInputValue();
    dobInput.addEventListener('input', () => validateDateOfBirth(false));
    dobInput.addEventListener('change', () => validateDateOfBirth(false));

    /* ---- Multi-step navigation ---- */
    function validateStep(step) {
      const stepFields = {
        1: [
          document.querySelector('input[name="account_role"]:checked')
        ],
        2: [
          document.getElementById('first_name'),
          document.getElementById('last_name'),
          document.getElementById('email'),
          document.getElementById('phone'),
          document.getElementById('dob'),
          document.getElementById('address'),
          document.getElementById('city'),
          document.getElementById('province')
        ],
        3: [
          document.getElementById('gender'),
          document.getElementById('blood_type')
        ],
        4: [
          document.getElementById('username'),
          document.getElementById('password'),
          document.getElementById('confirm_password'),
          document.getElementById('terms')
        ]
      };

      const fields = stepFields[step] || [];
      const invalidField = fields.find((field) => field && !field.checkValidity());

      if (invalidField) {
        const customSelect = invalidField.closest('.custom-select-wrapper');
        if (customSelect) {
          showAlert(`Please choose ${invalidField.name === 'blood_type' ? 'your blood type' : 'your gender'}.`, 'error');
          customSelect.classList.add('invalid');
          customSelect.querySelector('.custom-select-trigger')?.focus();
          return false;
        }

        invalidField.reportValidity();
        invalidField.focus();
        return false;
      }

      if (step === 1) {
        const roleChoice = document.querySelector('input[name="account_role"]:checked');
        if (!roleChoice) {
          showAlert('Please choose whether you are a donor or recipient.', 'error');
          return false;
        }
      }

      if (step === 2) {
        if (!validateEmailInput()) return false;
        if (!validatePhoneNumber()) return false;
        if (!validateDateOfBirth()) return false;
      }

      if (step === 4) {
        if (pwInput.value !== confirmInput.value) {
          showAlert('Passwords do not match.', 'error');
          confirmInput.focus();
          return false;
        }

        const passwordCheck = validatePasswordPolicy(pwInput.value, {
          email: document.getElementById('email').value.trim(),
          username: document.getElementById('username').value.trim()
        });

        if (!passwordCheck.ok) {
          showAlert(passwordCheck.message, 'error');
          pwInput.focus();
          return false;
        }
      }

      return true;
    }

    function goToStep(n) {
      const activeStep = document.querySelector('.form-step:not(.hidden)');
      const currentStep = activeStep ? Number(activeStep.id.split('-')[1]) : 1;

      if (n > currentStep && !validateStep(currentStep)) {
        return;
      }

      document.querySelectorAll('.form-step').forEach((el, i) => {
        el.classList.toggle('hidden', i + 1 !== n);
      });
      document.querySelectorAll('.step').forEach((el, i) => {
        el.classList.toggle('active', i + 1 <= n);
        el.classList.toggle('completed', i + 1 < n);
      });

      document.querySelector('.form-card')?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---- Toggle password visibility ---- */
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const icon = btn.querySelector('i');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        icon.classList.toggle('fa-eye', !isPassword);
        icon.classList.toggle('fa-eye-slash', isPassword);
      });
    });

    /* ---- Password strength ---- */
    const pwInput = document.getElementById('password');
    const strengthFill = document.getElementById('strength-fill');
    const strengthLabel = document.getElementById('strength-label');
    const strengthColors = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71'];
    const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

    pwInput.addEventListener('input', () => {
      const v = pwInput.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (/[A-Z]/.test(v)) score++;
      if (/[0-9]/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;

      const pct = score * 25;
      strengthFill.style.width = pct + '%';
      strengthFill.style.background = strengthColors[score - 1] || '#E5E7EB';
      strengthLabel.textContent = v.length ? (strengthLabels[score - 1] || '') : '';
      strengthLabel.style.color = strengthColors[score - 1] || 'inherit';
    });

    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      phoneInput.setCustomValidity('');
    });

    const emailInput = document.getElementById('email');
    emailInput.addEventListener('input', () => {
      validateEmailInput(false);
    });
    emailInput.addEventListener('blur', () => {
      if (emailInput.value.trim()) validateEmailInput(false);
    });


    /* ---- Philippine address suggestions (PSGC) ---- */
    const PSGC_API_BASE_URL = 'https://psgc.gitlab.io/api';
    const provinceInput = document.getElementById('province');
    const cityInput = document.getElementById('city');
    const barangayInput = document.getElementById('address');
    const cityOptions = document.getElementById('cityOptions');
    const barangayOptions = document.getElementById('barangayOptions');
    const provinceHelp = document.getElementById('provinceHelp');
    const cityHelp = document.getElementById('cityHelp');
    const barangayHelp = document.getElementById('barangayHelp');
    const psgcCache = new Map();
    let psgcLocalities = [];
    let selectedProvinceCode = '';
    let selectedLocalityCode = '';
    let provinceLoadId = 0;
    let localityLoadId = 0;

    function normalizeLocationName(value) {
      return String(value || '').trim().toLocaleLowerCase('en-PH');
    }

    function findLocationByName(items, value) {
      const normalizedValue = normalizeLocationName(value);
      return items.find((item) => normalizeLocationName(item.name) === normalizedValue) || null;
    }

    function populateLocationOptions(container, items) {
      container._locationItems = items;
      container.dispatchEvent(new CustomEvent('locationoptionsupdated'));
    }

    function setLocationHelp(element, message, isError = false) {
      element.textContent = message;
      element.classList.toggle('error', isError);
    }

    async function fetchPsgcList(path) {
      if (psgcCache.has(path)) return psgcCache.get(path);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${PSGC_API_BASE_URL}${path}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`PSGC request failed with status ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('PSGC returned an invalid list.');
        const sorted = data
          .map((item) => ({ ...item, name: String(item.name || '').trim() }))
          .filter((item) => item.code && item.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'en-PH'));
        psgcCache.set(path, sorted);
        return sorted;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    function closeLocationSuggestions(exceptPanel = null) {
      document.querySelectorAll('.location-suggestions:not([hidden])').forEach((panel) => {
        if (panel === exceptPanel) return;
        panel.hidden = true;
        const input = document.querySelector(`[aria-controls="${panel.id}"]`);
        input?.setAttribute('aria-expanded', 'false');
        input?.closest('.location-combobox')?.classList.remove('open');
      });
    }

    function positionLocationSuggestions(input, panel) {

      const inputRect = input.getBoundingClientRect();
      const viewportGap = 12;
      const viewportTop = window.visualViewport?.offsetTop || 0;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const isMobile = window.matchMedia("(max-width: 640px)").matches;
      const spaceBelow = viewportBottom - inputRect.bottom - viewportGap;
      const spaceAbove = inputRect.top - viewportTop - viewportGap;
      const heightLimit = isMobile ? Math.min(viewportHeight * 0.46, 320) : 320;
      const desiredHeight = Math.min(panel.scrollHeight, heightLimit);
      const openUp = spaceBelow < Math.min(desiredHeight, 180) && spaceAbove > spaceBelow;
      const availableHeight = Math.max(120, (openUp ? spaceAbove : spaceBelow) - 8);
      const panelHeight = Math.min(desiredHeight, availableHeight);

      panel.style.left = `${inputRect.left}px`;
      panel.style.width = `${inputRect.width}px`;
      panel.style.maxHeight = `${panelHeight}px`;
      panel.style.top = openUp
        ? `${Math.max(viewportTop + viewportGap, inputRect.top - panelHeight - 6)}px`
        : `${inputRect.bottom + 6}px`;
    }

    function initializeLocationCombobox(input, panel, onSelect) {
      const wrapper = input.closest('.location-combobox');
      const toggle = wrapper.querySelector('.location-picker-toggle');
      panel._locationItems = [];
      document.body.appendChild(panel);

      function matchingItems() {
        const query = normalizeLocationName(input.value);
        const items = panel._locationItems || [];
        if (!query) return items;

        return items
          .filter((item) => normalizeLocationName(item.name).includes(query))
          .sort((a, b) => {
            const aStarts = normalizeLocationName(a.name).startsWith(query);
            const bStarts = normalizeLocationName(b.name).startsWith(query);
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            return a.name.localeCompare(b.name, 'en-PH');
          });
      }

      function closePanel() {
        panel.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        wrapper.classList.remove('open');
      }

      function renderPanel() {
        const title = document.createElement('div');
        title.className = 'location-suggestions-title';
        title.textContent = panel.dataset.title || 'Select an option';
        const items = matchingItems();
        const nodes = [title];

        if (!items.length) {
          const empty = document.createElement('p');
          empty.className = 'location-suggestions-empty';
          empty.textContent = input.value.trim()
            ? 'No matching suggestion. You may continue typing this address manually.'
            : 'No suggestions are available yet.';
          nodes.push(empty);
        } else {
          items.forEach((item) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'location-suggestion';
            option.setAttribute('role', 'option');
            option.setAttribute(
              'aria-selected',
              normalizeLocationName(item.name) === normalizeLocationName(input.value) ? 'true' : 'false'
            );
            option.textContent = item.name;
            option.addEventListener('mousedown', (event) => event.preventDefault());
            option.addEventListener('click', () => {
              input.value = item.name;
              input.setCustomValidity('');
              closePanel();
              onSelect(item);
              input.focus();
            });
            nodes.push(option);
          });
        }

        panel.replaceChildren(...nodes);
        window.requestAnimationFrame(() => positionLocationSuggestions(input, panel));
      }

      function openPanel() {
        closeLocationSuggestions(panel);
        panel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        wrapper.classList.add('open');
        renderPanel();
      }

      input.addEventListener('click', openPanel);
      input.addEventListener('input', () => {
        if (panel.hidden) openPanel();
        else renderPanel();
      });
      toggle.addEventListener('click', () => {
        if (panel.hidden) {
          input.focus();
          openPanel();
        } else {
          closePanel();
          input.focus();
        }
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closePanel();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (panel.hidden) openPanel();
          panel.querySelector('.location-suggestion')?.focus();
        }
      });
      panel.addEventListener('keydown', (event) => {
        const options = [...panel.querySelectorAll('.location-suggestion')];
        const currentIndex = options.indexOf(document.activeElement);
        if (event.key === 'Escape') {
          event.preventDefault();
          closePanel();
          input.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = (currentIndex + direction + options.length) % options.length;
          options[nextIndex]?.focus();
        }
      });
      panel.addEventListener('locationoptionsupdated', () => {
        if (!panel.hidden) renderPanel();
      });
    }

    function resetBarangaySuggestions(message = 'Suggestions appear after selecting a locality.') {
      selectedLocalityCode = '';
      barangayInput.value = '';
      populateLocationOptions(barangayOptions, []);
      barangayInput.placeholder = 'Select a city first';
      setLocationHelp(barangayHelp, message);
    }

    function resetCitySuggestions() {
      selectedProvinceCode = '';
      psgcLocalities = [];
      cityInput.value = '';
      populateLocationOptions(cityOptions, []);
      cityInput.placeholder = 'Select a province first';
      setLocationHelp(cityHelp, 'Suggestions appear after selecting a province.');
      resetBarangaySuggestions();
    }

    async function loadLocalitiesForProvince(province) {
      if (!province || selectedProvinceCode === province.code) return;
      const loadId = ++provinceLoadId;
      resetCitySuggestions();
      selectedProvinceCode = province.code;
      cityInput.placeholder = 'Loading cities and municipalities...';
      setLocationHelp(cityHelp, 'Loading locality suggestions...');
      const endpoint = province.kind === 'region'
        ? `/regions/${province.code}/cities-municipalities/`
        : `/provinces/${province.code}/cities-municipalities/`;

      try {
        const localities = await fetchPsgcList(endpoint);
        if (loadId !== provinceLoadId) return;
        psgcLocalities = localities;
        populateLocationOptions(cityOptions, localities);
        cityInput.placeholder = 'Select or type a city / municipality';
        setLocationHelp(cityHelp, `${localities.length} locality suggestions available.`);
      } catch (error) {
        if (loadId !== provinceLoadId) return;
        console.warn('PSGC locality suggestions unavailable:', error);
        cityInput.placeholder = 'Type city / municipality';
        setLocationHelp(cityHelp, 'Suggestions are unavailable. You can type the locality manually.', true);
      }
    }

    async function loadBarangaysForLocality(locality) {
      if (!locality || selectedLocalityCode === locality.code) return;
      const loadId = ++localityLoadId;
      resetBarangaySuggestions('Loading barangay suggestions...');
      selectedLocalityCode = locality.code;
      barangayInput.placeholder = 'Loading barangays...';

      try {
        const barangays = await fetchPsgcList(`/cities-municipalities/${locality.code}/barangays/`);
        if (loadId !== localityLoadId) return;
        populateLocationOptions(barangayOptions, barangays);
        barangayInput.placeholder = 'Select or type a barangay';
        setLocationHelp(barangayHelp, `${barangays.length} barangay suggestions available.`);
      } catch (error) {
        if (loadId !== localityLoadId) return;
        console.warn('PSGC barangay suggestions unavailable:', error);
        barangayInput.placeholder = 'Type barangay';
        setLocationHelp(barangayHelp, 'Suggestions are unavailable. You can type the barangay manually.', true);
      }
    }

    function handleCityInput() {
      cityInput.setCustomValidity('');
      const locality = findLocationByName(psgcLocalities, cityInput.value);
      if (locality) {
        loadBarangaysForLocality(locality);
      } else if (selectedLocalityCode) {
        resetBarangaySuggestions('Choose a suggested locality for matching barangays, or type manually.');
        barangayInput.placeholder = 'Type barangay';
      }
    }

    async function initializePhilippineAddressSuggestions() {
      provinceInput.value = 'Bohol';
      provinceInput.readOnly = true;
      initializeLocationCombobox(cityInput, cityOptions, loadBarangaysForLocality);
      initializeLocationCombobox(barangayInput, barangayOptions, () => {});
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.location-combobox, .location-suggestions')) {
          closeLocationSuggestions();
        }
      });
      window.addEventListener('resize', () => closeLocationSuggestions());
      document.querySelector('.form-card')?.addEventListener('scroll', () => closeLocationSuggestions());
      cityInput.addEventListener('input', handleCityInput);
      cityInput.addEventListener('change', handleCityInput);

      try {
        const provinces = await fetchPsgcList('/provinces/');
        const bohol = findLocationByName(provinces, 'Bohol');
        if (!bohol) throw new Error('Bohol was not returned by PSGC.');
        setLocationHelp(provinceHelp, 'BloodConnect currently serves Bohol.');
        await loadLocalitiesForProvince(bohol);
      } catch (error) {
        console.warn('Bohol municipality suggestions unavailable:', error);
        provinceInput.value = 'Bohol';
        cityInput.placeholder = 'Type a Bohol city / municipality';
        barangayInput.placeholder = 'Type barangay';
        setLocationHelp(provinceHelp, 'BloodConnect currently serves Bohol.');
        setLocationHelp(cityHelp, 'Suggestions are unavailable. Enter a Bohol city or municipality manually.', true);
        setLocationHelp(barangayHelp, 'Enter the barangay manually.');
      }
    }

    initializePhilippineAddressSuggestions();

    function closeCustomSelects(exceptWrapper = null) {
      document.querySelectorAll('.custom-select-wrapper.open').forEach((wrapper) => {
        if (wrapper !== exceptWrapper) {
          wrapper.classList.remove('open', 'open-up');
          wrapper.querySelector('.custom-select-options')?.style.removeProperty('--custom-select-max-height');
          wrapper.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    function positionCustomSelect(wrapper, trigger, optionsList) {
      wrapper.classList.remove('open-up');
      optionsList.style.removeProperty('--custom-select-max-height');

      window.requestAnimationFrame(() => {
        if (!wrapper.classList.contains('open')) return;

        const triggerRect = trigger.getBoundingClientRect();
        const viewportGap = 16;
        const spaceBelow = window.innerHeight - triggerRect.bottom - viewportGap;
        const spaceAbove = triggerRect.top - viewportGap;
        const desiredHeight = Math.min(optionsList.scrollHeight, 288);
        const openUp = spaceBelow < Math.min(desiredHeight, 220) && spaceAbove > spaceBelow;
        const availableSpace = openUp ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(96, Math.min(288, availableSpace - 10));

        wrapper.classList.toggle('open-up', openUp);
        optionsList.style.setProperty('--custom-select-max-height', `${maxHeight}px`);

        const selectedOption = optionsList.querySelector('.custom-select-option.selected');
        if (selectedOption) selectedOption.scrollIntoView({ block: 'nearest' });
        else optionsList.scrollTop = 0;
      });
    }

    function initCustomSelects() {
      document.querySelectorAll('.select-wrapper select').forEach((select) => {
        const wrapper = select.closest('.select-wrapper');
        const placeholder = select.querySelector('option[value=""]')?.textContent || 'Select option';
        const trigger = document.createElement('button');
        const valueText = document.createElement('span');
        const optionsList = document.createElement('div');

        wrapper.classList.add('custom-select-wrapper');
        trigger.type = 'button';
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        valueText.className = 'custom-select-value is-placeholder';
        valueText.textContent = placeholder;
        trigger.appendChild(valueText);

        optionsList.className = 'custom-select-options';
        optionsList.setAttribute('role', 'listbox');

        Array.from(select.options).forEach((option) => {
          if (option.disabled || option.value === '') return;

          const optionButton = document.createElement('button');
          optionButton.type = 'button';
          optionButton.className = 'custom-select-option';
          optionButton.setAttribute('role', 'option');
          optionButton.dataset.value = option.value;
          optionButton.textContent = option.textContent;

          optionButton.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            wrapper.classList.remove('open', 'invalid');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
          });

          optionsList.appendChild(optionButton);
        });

        function updateCustomSelect() {
          const selectedOption = select.options[select.selectedIndex];
          const hasValue = Boolean(select.value);

          valueText.textContent = hasValue ? selectedOption.textContent : placeholder;
          valueText.classList.toggle('is-placeholder', !hasValue);
          wrapper.classList.remove('invalid');
          wrapper.querySelectorAll('.custom-select-option').forEach((optionButton) => {
            optionButton.classList.toggle('selected', optionButton.dataset.value === select.value);
            optionButton.setAttribute('aria-selected', optionButton.dataset.value === select.value ? 'true' : 'false');
          });
        }

        trigger.addEventListener('click', () => {
          const willOpen = !wrapper.classList.contains('open');
          closeCustomSelects(wrapper);
          wrapper.classList.toggle('open', willOpen);
          wrapper.classList.remove('open-up');
          trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          if (willOpen) positionCustomSelect(wrapper, trigger, optionsList);
        });

        trigger.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          if (!wrapper.classList.contains('open')) {
            closeCustomSelects(wrapper);
            wrapper.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
            positionCustomSelect(wrapper, trigger, optionsList);
          }
          const optionButtons = [...optionsList.querySelectorAll('.custom-select-option')];
          const selectedIndex = optionButtons.findIndex((button) => button.classList.contains('selected'));
          const targetIndex = event.key === 'ArrowUp'
            ? (selectedIndex > 0 ? selectedIndex - 1 : optionButtons.length - 1)
            : (selectedIndex >= 0 && selectedIndex < optionButtons.length - 1 ? selectedIndex + 1 : 0);
          window.requestAnimationFrame(() => optionButtons[targetIndex]?.focus());
        });

        optionsList.addEventListener('keydown', (event) => {
          const optionButtons = [...optionsList.querySelectorAll('.custom-select-option')];
          const currentIndex = optionButtons.indexOf(document.activeElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            wrapper.classList.remove('open', 'open-up');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (currentIndex + direction + optionButtons.length) % optionButtons.length;
            optionButtons[nextIndex]?.focus();
          }
        });

        select.addEventListener('change', updateCustomSelect);
        wrapper.insertBefore(trigger, select.nextSibling);
        wrapper.insertBefore(optionsList, trigger.nextSibling);
        updateCustomSelect();
      });

      document.addEventListener('click', (event) => {
        if (!event.target.closest('.custom-select-wrapper')) {
          closeCustomSelects();
        }
      });

      window.addEventListener('resize', () => closeCustomSelects());
    }

    initCustomSelects();

    /* ---- Confirm password match ---- */
    const confirmInput = document.getElementById('confirm_password');
    const matchMsg = document.getElementById('match-msg');

    confirmInput.addEventListener('input', () => {
      if (!confirmInput.value) { matchMsg.textContent = ''; return; }
      const match = confirmInput.value === pwInput.value;
      matchMsg.textContent = match ? 'OK Passwords match' : 'X Passwords do not match';
      matchMsg.style.color = match ? '#2ECC71' : '#E74C3C';
    });

    /* ---- Role card selection highlight ---- */
    document.querySelectorAll('.role-card input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
        radio.closest('.role-card').classList.add('selected');
      });
      if (radio.checked) radio.closest('.role-card').classList.add('selected');
    });

    /* ---- Alert helper ---- */
    const alertBox = document.getElementById('alertBox');
    let alertTimer = null;

    function showAlert(message, type) {
      alertBox.textContent = message;
      alertBox.className = `toast-alert show ${type === 'error' ? 'error' : 'success'}`;

      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        alertBox.classList.remove('show');
      }, 5000);
    }

    /* ---- Handle Registration ---- */
    document.querySelector('.register-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName = document.getElementById('first_name').value.trim();
      const middleName = document.getElementById('middle_name').value.trim();
      const lastName = document.getElementById('last_name').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      let dob = document.getElementById('dob').value;
      const address = document.getElementById('address').value.trim();
      const city = document.getElementById('city').value.trim();
      const province = 'Bohol';
      provinceInput.value = province;
      const gender = document.getElementById('gender').value;
      const bloodType = document.getElementById('blood_type').value;
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const confirmPw = document.getElementById('confirm_password').value;
      const terms = document.getElementById('terms').checked;
      const selectedRole = document.querySelector('input[name="account_role"]:checked')?.value || '';
      const role = selectedRole === 'donor' ? 'donor' : 'patient';

      // Validation
      if (!selectedRole) {
        showAlert('Please choose whether you are a donor or recipient.', 'error');
        goToStep(1);
        return;
      }

      if (!firstName || !lastName || !email || !phone || !dob || !address || !city || !province) {
        showAlert('Please complete all personal information fields.', 'error');
        goToStep(2);
        return;
      }
      if (psgcLocalities.length && !findLocationByName(psgcLocalities, city)) {
        cityInput.setCustomValidity('Choose a valid Bohol city or municipality.');
        showAlert('Please choose a valid Bohol city or municipality.', 'error');
        goToStep(2);
        cityInput.focus();
        return;
      }
      if (!validateEmailInput(false)) {
        goToStep(2);
        validateEmailInput();
        return;
      }
      if (!validateDateOfBirth(false)) {
        goToStep(2);
        validateDateOfBirth();
        return;
      }
      dob = dobInput.value;
      const normalizedPhone = normalizePhoneNumber(phone);
      if (!normalizedPhone) {
        goToStep(2);
        validatePhoneNumber();
        return;
      }
      if (!gender || !bloodType) {
        showAlert('Please complete all medical information fields.', 'error');
        goToStep(3);
        return;
      }
      if (!username || !password || !confirmPw) {
        showAlert('Please complete all account setup fields.', 'error');
        goToStep(4);
        return;
      }
      const passwordCheck = validatePasswordPolicy(password, { email, username });
      if (!passwordCheck.ok) {
        showAlert(passwordCheck.message, 'error');
        goToStep(4);
        return;
      }
      if (password !== confirmPw) {
        showAlert('Passwords do not match.', 'error');
        goToStep(4);
        return;
      }
      if (!terms) {
        showAlert('You must agree to the Terms of Service.', 'error');
        goToStep(4);
        return;
      }

      const btn = e.target.querySelector('.btn-primary');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

      try {
        const { error } = await signUp({
          firstName, middleName, lastName, email, phone: normalizedPhone, dob,
          address: `${address}, ${city}, ${province}`,
          gender, bloodType, username, password,
          role
        });

        if (error) {
          showAlert(error.message || 'An unknown error occurred.', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
          return;
        }

        await clearAuthSession();

        showAlert('Account created successfully! You can now sign in.', 'success');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';

        setTimeout(() => {
          window.location.href = 'login.html?registered=1';
        }, 2500);

      } catch (error) {
        console.error('Registration error:', error);
        showAlert('Could not connect to the server.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
      }
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
