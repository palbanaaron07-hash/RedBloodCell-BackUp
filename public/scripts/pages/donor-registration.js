    const donorForm = document.getElementById('donorForm');
    const messageBox = document.getElementById('messageBox');
    const backLink = document.querySelector('.back-link');
    const backLinkText = document.getElementById('backLinkText');
    const phoneInput = document.getElementById('phone');
    const dobInput = document.getElementById('dob');
    const phoneFeedback = document.getElementById('phoneFeedback');
    const accountLinkNotice = document.getElementById('accountLinkNotice');
    const submitButton = donorForm.querySelector('.submit-btn');
    const registrationUrl = new URL(window.location.href);
    const requestedReturn = registrationUrl.searchParams.get('return') || 'account_dashboard.html#section-donor';
    const safeReturnUrl = /^(?:patient_dashboard\.html|home\.html)(?:[?#].*)?$/.test(requestedReturn)
      ? requestedReturn
      : 'account_dashboard.html#section-donor';
    let authenticatedAccount = null;
    let accountReady = false;

    submitButton.disabled = true;

    function closeCustomSelects(exceptWrapper = null) {
      document.querySelectorAll('.custom-select-wrapper.open').forEach((wrapper) => {
        if (wrapper !== exceptWrapper) {
          wrapper.classList.remove('open');
          wrapper.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    function initCustomSelects() {
      document.querySelectorAll('.custom-select-wrapper').forEach((wrapper) => {
        const select = wrapper.querySelector('select');
        const placeholder = select.querySelector('option[value=""]')?.textContent || 'Select option';
        const trigger = document.createElement('button');
        const valueText = document.createElement('span');
        const arrow = document.createElement('i');
        const optionsList = document.createElement('div');
        const listId = `${select.id}Options`;
        const label = document.querySelector(`label[for="${select.id}"]`);

        trigger.type = 'button';
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', listId);
        if (label) {
          label.id = label.id || `${select.id}Label`;
          trigger.setAttribute('aria-labelledby', label.id);
          label.addEventListener('click', (event) => {
            event.preventDefault();
            trigger.focus();
          });
        }

        valueText.className = 'custom-select-value is-placeholder';
        valueText.textContent = placeholder;
        arrow.className = 'fa-solid fa-chevron-down custom-select-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        trigger.append(valueText, arrow);

        optionsList.id = listId;
        optionsList.className = 'custom-select-options';
        optionsList.setAttribute('role', 'listbox');

        Array.from(select.options).forEach((option, index) => {
          if (!option.value) return;

          const optionButton = document.createElement('button');
          optionButton.type = 'button';
          optionButton.className = 'custom-select-option';
          optionButton.id = `${select.id}Option${index}`;
          optionButton.dataset.value = option.value;
          optionButton.setAttribute('role', 'option');
          optionButton.textContent = option.textContent;

          optionButton.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            wrapper.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
          });

          optionButton.addEventListener('keydown', (event) => {
            const options = Array.from(optionsList.querySelectorAll('.custom-select-option'));
            const currentIndex = options.indexOf(optionButton);
            let nextIndex = currentIndex;

            if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
            else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = options.length - 1;
            else if (event.key === 'Escape') {
              event.preventDefault();
              wrapper.classList.remove('open');
              trigger.setAttribute('aria-expanded', 'false');
              trigger.focus();
              return;
            } else return;

            event.preventDefault();
            options[nextIndex].focus();
          });

          optionsList.appendChild(optionButton);
        });

        function updateCustomSelect() {
          const selectedOption = select.options[select.selectedIndex];
          const hasValue = Boolean(select.value);

          valueText.textContent = hasValue ? selectedOption.textContent : placeholder;
          valueText.classList.toggle('is-placeholder', !hasValue);
          wrapper.querySelectorAll('.custom-select-option').forEach((optionButton) => {
            const isSelected = optionButton.dataset.value === select.value;
            optionButton.classList.toggle('selected', isSelected);
            optionButton.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          });
        }

        function prepareCustomSelectMenu() {
          const triggerRect = trigger.getBoundingClientRect();
          const viewportHeight = window.visualViewport?.height || window.innerHeight;
          const menuGap = 12;
          const spaceBelow = viewportHeight - triggerRect.bottom - menuGap;
          const spaceAbove = triggerRect.top - menuGap;
          const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
          const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;

          wrapper.classList.toggle('drop-up', shouldOpenUp);
          optionsList.style.setProperty('--custom-select-max-height', `${Math.max(96, Math.floor(availableSpace))}px`);
        }

        function revealSelectedOption() {
          window.requestAnimationFrame(() => {
            optionsList.querySelector('.custom-select-option.selected')?.scrollIntoView({ block: 'nearest' });
          });
        }

        function openAndFocusOption(direction) {
          closeCustomSelects(wrapper);
          prepareCustomSelectMenu();
          wrapper.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          const options = Array.from(optionsList.querySelectorAll('.custom-select-option'));
          const selectedIndex = options.findIndex((option) => option.dataset.value === select.value);
          const focusIndex = selectedIndex >= 0 ? selectedIndex : (direction === 'up' ? options.length - 1 : 0);
          options[focusIndex]?.focus();
        }

        trigger.addEventListener('click', () => {
          const willOpen = !wrapper.classList.contains('open');
          closeCustomSelects(wrapper);
          if (willOpen) prepareCustomSelectMenu();
          wrapper.classList.toggle('open', willOpen);
          trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          if (willOpen) revealSelectedOption();
        });

        trigger.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openAndFocusOption(event.key === 'ArrowUp' ? 'up' : 'down');
          } else if (event.key === 'Escape') {
            closeCustomSelects();
          }
        });

        select.addEventListener('change', updateCustomSelect);
        wrapper.append(trigger, optionsList);
        updateCustomSelect();
      });

      document.addEventListener('click', (event) => {
        if (!event.target.closest('.custom-select-wrapper')) closeCustomSelects();
      });

      window.addEventListener('resize', () => closeCustomSelects());

      donorForm.addEventListener('reset', () => {
        window.setTimeout(() => {
          document.querySelectorAll('.custom-select-wrapper select').forEach((select) => {
            select.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }, 0);
      });
    }

    initCustomSelects();

    function setFormValue(id, value) {
      const input = document.getElementById(id);
      if (!input || value === null || value === undefined || value === '') return;
      input.value = String(value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function markAsReusedAccountField(input) {
      if (!input) return false;
      input.readOnly = true;
      input.classList.add('reused-account-field');
      const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add('accountLinkNotice');
      input.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
      input.setAttribute('title', 'Reused from your existing account');
      return true;
    }

    function setReusedAccountValue(id, value, { lockWhenEmpty = false } = {}) {
      const input = document.getElementById(id);
      if (!input) return false;

      const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
      if (!hasValue && !lockWhenEmpty) return false;
      if (hasValue) setFormValue(id, value);
      if (!hasValue) input.placeholder = 'Not provided';
      return markAsReusedAccountField(input);
    }

    function normalizeGenderValue(value) {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'male') return 'Male';
      if (normalized === 'female') return 'Female';
      if (normalized === 'non-binary' || normalized === 'nonbinary') return 'Non-binary';
      if (normalized === 'other' || normalized === 'prefer not to say' || normalized === 'other / prefer not to say') {
        return 'Prefer not to say';
      }
      return '';
    }

    function setReusedAccountSelect(id, value) {
      const select = document.getElementById(id);
      if (!select || !value || !Array.from(select.options).some((option) => option.value === value)) return false;

      setFormValue(id, value);
      const wrapper = select.closest('.custom-select-wrapper');
      const trigger = wrapper?.querySelector('.custom-select-trigger');
      wrapper?.classList.add('reused-account-field');
      select.setAttribute('aria-describedby', 'accountLinkNotice');
      if (trigger) {
        trigger.disabled = true;
        trigger.setAttribute('aria-describedby', 'accountLinkNotice');
        trigger.setAttribute('title', 'Reused from your existing account');
      }
      return true;
    }

    async function initializeAccountLinkedRegistration() {
      try {
        const account = await getCurrentUser();
        if (!account?.user || !account?.profile) {
          accountLinkNotice.className = 'account-link-notice error';
          accountLinkNotice.innerHTML = '<i class="fa-solid fa-lock"></i><span>Sign in first so this donor profile is linked to your one BloodConnect account. Redirecting...</span>';
          const next = encodeURIComponent(`donor_registration.html?return=${encodeURIComponent(safeReturnUrl)}`);
          window.setTimeout(() => { window.location.href = `login.html?next=${next}`; }, 1100);
          return;
        }

        if (account.profile.role === 'admin') {
          window.location.href = 'admin_dashboard.html';
          return;
        }

        authenticatedAccount = account;
        const profile = account.profile;
        const sharedProfile = profile.patient_profile || profile.donor_profile || profile;

        function showModal({ title, iconClass = 'fa-check', content, buttonText = 'Okay', onOk }) {
          const modal = document.getElementById('successModal');
          const modalTitle = modal?.querySelector('.modal-title');
          const modalIcon = modal?.querySelector('.modal-icon');
          const modalText = document.getElementById('modalText');
          const modalOkBtn = document.getElementById('modalOkBtn');

          if (!modal) return;

          if (modalTitle) modalTitle.textContent = title;
          if (modalIcon) modalIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

          if (typeof content === 'string') {
            modalText.textContent = content;
          } else if (Array.isArray(content)) {
            modalText.replaceChildren(...content);
          }

          if (modalOkBtn) {
            modalOkBtn.textContent = buttonText;
            modalOkBtn.onclick = () => {
              document.body.classList.add('page-leave');
              setTimeout(() => {
                if (typeof onOk === 'function') {
                  onOk();
                } else {
                  window.location.href = safeReturnUrl;
                }
              }, 320);
            };
          }

          modal.classList.add('active');
        }

        if (profile.has_donor_profile) {
          accountLinkNotice.className = 'account-link-notice success';
          accountLinkNotice.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Your donor profile is already linked to this account.</span>';

          const greeting = sharedProfile?.first_name ? `Welcome back, ${sharedProfile.first_name}!` : 'Donor Profile Already Linked';
          const title = 'Donor Profile Already Linked';
          const strongText = document.createElement('strong');
          strongText.textContent = greeting;
          const descText = document.createTextNode('Your donor profile is already linked to this account. You can view and manage your donor eligibility, screening history, and donation records in the Donor Center.');

          showModal({
            title,
            iconClass: 'fa-shield-heart',
            content: [
              strongText,
              document.createElement('br'),
              document.createElement('br'),
              descText
            ],
            buttonText: 'Okay',
            onOk: () => {
              window.location.href = safeReturnUrl;
            }
          });
          return;
        }

        setReusedAccountValue('firstName', sharedProfile.first_name || profile.first_name);
        setReusedAccountValue('middleName', sharedProfile.middle_name || profile.middle_name, { lockWhenEmpty: true });
        setReusedAccountValue('lastName', sharedProfile.last_name || profile.last_name);
        setReusedAccountValue('email', account.user.email || profile.email);
        setFormValue('bloodType', sharedProfile.blood_type_needed || sharedProfile.blood_type || profile.blood_type);
        setReusedAccountValue('phone', sharedProfile.contact_number || sharedProfile.phone || profile.phone);
        setReusedAccountSelect('gender', normalizeGenderValue(sharedProfile.gender || profile.gender));
        setReusedAccountValue('dob', sharedProfile.date_of_birth || sharedProfile.dob || profile.date_of_birth);
        setReusedAccountValue('address', sharedProfile.address || profile.address);

        backLink.href = 'account_dashboard.html#section-dashboard';
        backLink.setAttribute('aria-label', 'Back to Patient Overview');
        if (backLinkText) backLinkText.textContent = 'Back to Overview';
        validatePhoneInput();
        accountReady = true;
        submitButton.disabled = false;
        accountLinkNotice.className = 'account-link-notice success';
        accountLinkNotice.innerHTML = '<i class="fa-solid fa-link"></i><span>We’ll use your existing account details. No new login will be created.</span>';
      } catch (error) {
        accountLinkNotice.className = 'account-link-notice error';
        const errorIcon = document.createElement('i');
        const errorText = document.createElement('span');
        errorIcon.className = 'fa-solid fa-circle-exclamation';
        errorText.textContent = String(error?.message || 'Unable to verify your account.');
        accountLinkNotice.replaceChildren(errorIcon, errorText);
      }
    }

    initializeAccountLinkedRegistration();

    function validatePhoneInput() {
      const digitsOnly = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      phoneInput.value = digitsOnly;

      const isValid = /^09\d{9}$/.test(digitsOnly);

      if (phoneInput.readOnly && isValid) {
        phoneInput.setCustomValidity('');
        phoneInput.classList.remove('is-valid', 'is-invalid');
        phoneFeedback.className = 'field-feedback reused';
        phoneFeedback.textContent = 'Reused from your existing account.';
        return true;
      }

      phoneInput.classList.toggle('is-valid', isValid);
      phoneInput.classList.toggle('is-invalid', digitsOnly.length > 0 && !isValid);

      if (!digitsOnly) {
        phoneInput.setCustomValidity('');
        phoneFeedback.className = 'field-feedback';
        phoneFeedback.textContent = 'Enter an 11-digit Philippine mobile number starting with 09.';
      } else if (isValid) {
        phoneInput.setCustomValidity('');
        phoneFeedback.className = 'field-feedback success';
        phoneFeedback.textContent = 'Mobile number is valid.';
      } else {
        phoneInput.setCustomValidity('Enter an 11-digit mobile number starting with 09.');
        phoneFeedback.className = 'field-feedback error';
        phoneFeedback.textContent = digitsOnly.startsWith('09')
          ? `${digitsOnly.length} of 11 digits entered.`
          : 'Mobile number must start with 09.';
      }

      return isValid;
    }

    phoneInput.addEventListener('input', validatePhoneInput);

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

    function validateDonorBirthDate(showMessage = false) {
      if (dobInput.validity.badInput) dobInput.value = '';
      trimExtraBirthYearDigits();
      const result = validateBirthDateValue(dobInput.value, {
        minimumYear: 1900,
        minimumAge: 18
      });
      dobInput.setCustomValidity(result.ok ? '' : result.message);

      if (!result.ok && showMessage) {
        messageBox.className = 'message-box error';
        messageBox.textContent = result.message;
        dobInput.reportValidity();
        dobInput.focus();
      }
      return result.ok;
    }

    dobInput.max = localDateInputValue();
    dobInput.addEventListener('input', () => validateDonorBirthDate(false));
    dobInput.addEventListener('change', () => validateDonorBirthDate(false));

    if (backLink) {
      backLink.addEventListener('click', (event) => {
        event.preventDefault();
        document.body.classList.add('page-leave');
        setTimeout(() => {
          window.location.href = backLink.href;
        }, 320);
      });
    }

    function calculateAge(dateString) {
      const birthDate = new Date(dateString);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return age;
    }

    donorForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!accountReady || !authenticatedAccount?.user) {
        messageBox.className = 'message-box error';
        messageBox.textContent = 'Please wait until your signed-in account has been verified.';
        return;
      }

      const phoneIsValid = validatePhoneInput();
      const formData = new FormData(donorForm);
      const firstName = String(formData.get('firstName') || '').trim();
      const middleName = String(formData.get('middleName') || '').trim();
      const lastName = String(formData.get('lastName') || '').trim();
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
      let dob = String(formData.get('dob') || '');
      const gender = String(formData.get('gender') || '');
      const address = String(formData.get('address') || '').trim();
      const phone = String(formData.get('phone') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const bloodType = String(formData.get('bloodType') || '');

      if (!phoneIsValid) {
        messageBox.className = 'message-box error';
        messageBox.textContent = 'Please enter a valid 11-digit Philippine mobile number starting with 09.';
        phoneInput.focus();
        return;
      }

      if (!validateDonorBirthDate(true)) return;
      dob = dobInput.value;

      if (!donorForm.checkValidity()) {
        messageBox.className = 'message-box error';
        messageBox.textContent = 'Please complete all required fields before submitting.';
        return;
      }

      const age = calculateAge(dob);
      if (Number.isNaN(age) || age < 18) {
        messageBox.className = 'message-box error';
        messageBox.textContent = 'You must be at least 18 years old to proceed with blood donor registration.';
        return;
      }

      // Prepare UI for submission
      const submitBtn = submitButton;
      const originalBtnText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      messageBox.className = 'message-box';
      messageBox.textContent = '';

      try {
        const { error } = await activateMyDonorProfile({
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
          phone,
          blood_type: bloodType,
          address: address || null,
          gender: gender || null,
          dob
        });

        if (error) throw error;

        // Show Success Modal
        const modal = document.getElementById('successModal');
        const modalText = document.getElementById('modalText');
        const modalOkBtn = document.getElementById('modalOkBtn');

        const thankYouMessage = document.createElement('strong');
        thankYouMessage.textContent = `Thank you for registering as a blood donor, ${fullName}.`;

        modalText.replaceChildren(
          thankYouMessage,
          document.createElement('br'),
          document.createElement('br'),
          document.createTextNode('Your donor profile is now linked to this account. Staff screening, eligibility, and donation updates will appear in your Donor Center.')
        );

        modal.classList.add('active');

        modalOkBtn.addEventListener('click', () => {
          document.body.classList.add('page-leave');
          setTimeout(() => {
            window.location.href = safeReturnUrl;
          }, 320);
        });

      } catch (err) {
        console.error('Registration error:', err);
        messageBox.className = 'message-box error';
        
        // Handle unique constraint violation (Postgres error 23505)
        if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('already registered'))) {
          if (err.message.toLowerCase().includes('email')) {
            messageBox.textContent = 'Registration failed: This email address is already registered.';
          } else if (err.message.toLowerCase().includes('contact_number') || err.message.toLowerCase().includes('phone')) {
            messageBox.textContent = 'Registration failed: This phone number is already registered.';
          } else {
            messageBox.textContent = 'Registration failed: This email or phone number is already registered.';
          }
        } else {
          messageBox.textContent = 'Failed to submit registration: ' + (err.message || 'Network error');
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    });

    if (typeof attachPageRefreshListeners === 'function') {
      attachPageRefreshListeners({
        onRefresh: async () => {
          try {
            if (typeof initializeAccountLinkedRegistration === 'function') {
              await initializeAccountLinkedRegistration();
            }
          } catch (_) { }
        },
        debounceMs: 2500
      });
    }
