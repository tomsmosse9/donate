const donationForm = document.querySelector('#donationForm');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toastMessage');

function showToast(title, message, isError = false) {
  toastMessage.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  toast.style.borderColor = isError ? 'rgba(255, 123, 114, 0.4)' : 'rgba(73, 198, 255, 0.3)';
  toast.classList.add('show');
  window.clearTimeout(window.toastTimeout);
  window.toastTimeout = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

if (donationForm) {
  donationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = document.querySelector('#phone').value.trim();
    const amount = document.querySelector('#amount').value.trim();
    const reference = document.querySelector('#reference').value.trim();
    const submitButton = document.querySelector('#submitBtn');

    if (!phone || !amount || !reference) {
      showToast('Missing information', 'Please complete every field before sending a donation.', true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Sending prompt...';

    try {
      const response = await fetch('/api/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone, amount, reference })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Payment request failed');
      }

      showToast('Donation started', 'A payment prompt is on its way to your phone.', false);
      donationForm.reset();
    } catch (error) {
      console.error(error);
      showToast('Unable to complete donation', error.message, true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Donate with M-Pesa';
    }
  });
}

const links = document.querySelectorAll('.nav-links a');
links.forEach((link) => {
  if (link.href === window.location.href) {
    link.classList.add('active');
  }
});
