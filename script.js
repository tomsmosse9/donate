const donationForm = document.querySelector('#donationForm');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toastMessage');

let paymentReference = null;
let checkInterval = null;

function showToast(title, message, isError = false) {
  toastMessage.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  toast.style.borderColor = isError
    ? 'rgba(255, 123, 114, 0.4)'
    : 'rgba(73, 198, 255, 0.3)';

  toast.classList.add('show');
  window.clearTimeout(window.toastTimeout);

  window.toastTimeout = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 4200);
}

// CHECK PAYMENT STATUS (IMPORTANT PART)
async function checkPaymentStatus(reference) {
  try {
    const res = await fetch(`/api/status/${reference}`);
    const data = await res.json();

    console.log("STATUS:", data);

    if (data.status === "success") {
      clearInterval(checkInterval);
      window.location.href = "success.html";
    }

    if (data.status === "failed") {
      clearInterval(checkInterval);
      showToast("Payment failed", "Please try again", true);
    }

  } catch (err) {
    console.error("Status check error:", err);
  }
}

if (donationForm) {
  donationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const phone = document.querySelector('#phone').value.trim();
    const amount = document.querySelector('#amount').value.trim();
    const reference = document.querySelector('#reference').value.trim();
    const submitButton = document.querySelector('#submitBtn');

    if (!phone || !amount || !reference) {
      showToast(
        'Missing information',
        'Please complete all fields.',
        true
      );
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Sending prompt...';

    try {
      const response = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amount, reference })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Payment failed');
      }

      // SAVE REFERENCE (VERY IMPORTANT)
      paymentReference = reference;

      showToast(
        'Payment initiated',
        'Check your phone to complete M-Pesa payment',
        false
      );

      donationForm.reset();

      // START POLLING PAYMENT STATUS
      checkInterval = setInterval(() => {
        checkPaymentStatus(paymentReference);
      }, 3000);

      // STOP AFTER 2 MINUTES
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 120000);

    } catch (error) {
      console.error(error);
      showToast('Error', error.message, true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Donate with M-Pesa';
    }
  });
}

// ACTIVE LINK HIGHLIGHT
const links = document.querySelectorAll('.nav-links a');
links.forEach((link) => {
  if (link.href === window.location.href) {
    link.classList.add('active');
  }
});