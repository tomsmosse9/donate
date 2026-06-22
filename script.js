const donationForm = document.querySelector('#donationForm');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toastMessage');

function showToast(title, message, isError = false) {
  toastMessage.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  toast.classList.add('show');
  window.clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

if (donationForm) {
  donationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const phone = document.querySelector('#phone').value.trim();
    const amount = document.querySelector('#amount').value.trim();
    const reference = document.querySelector('#reference').value.trim();
    const submitButton = document.querySelector('#submitBtn');

    if (!phone || !amount || !reference) {
      showToast("Missing info", "Fill all fields", true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending STK...";

    try {
      const response = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amount, reference })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error);
      }

      showToast("STK Sent", "Check your phone and enter PIN");

      submitButton.textContent = "Waiting for payment...";

      // ======================
      // POLLING PAYMENT STATUS
      // ======================
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${reference}`);
          const data = await res.json();

          if (data.status === "success") {
            clearInterval(poll);

            showToast("Payment Successful", "Redirecting...");

            setTimeout(() => {
              window.location.href = "/success.html";
            }, 1200);
          }

          if (data.status === "failed") {
            clearInterval(poll);

            showToast("Payment Failed", "Try again", true);

            submitButton.disabled = false;
            submitButton.textContent = "Donate with M-Pesa";
          }

        } catch (err) {
          console.error(err);
        }
      }, 3000);

    } catch (err) {
      showToast("Error", err.message, true);

      submitButton.disabled = false;
      submitButton.textContent = "Donate with M-Pesa";
    }
  });
}