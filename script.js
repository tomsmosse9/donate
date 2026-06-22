const donationForm = document.querySelector('#donationForm');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toastMessage');

let currentReference = null;
let interval = null;

function showToast(title, message, isError = false) {
  toastMessage.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  toast.style.borderColor = isError
    ? 'rgba(255, 123, 114, 0.4)'
    : 'rgba(73, 198, 255, 0.3)';

  toast.classList.add('show');

  window.setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// CHECK STATUS
async function checkStatus(ref) {
  try {
    const res = await fetch(`/api/status/${ref}`);
    const data = await res.json();

    console.log("STATUS:", data);

    if (data.status === "success") {
      clearInterval(interval);
      window.location.href = "success.html";
    }

    if (data.status === "failed") {
      clearInterval(interval);
      showToast("Payment failed", "Try again", true);
    }

  } catch (err) {
    console.error(err);
  }
}

if (donationForm) {
  donationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = document.querySelector('#phone').value;
    const amount = document.querySelector('#amount').value;
    const reference = document.querySelector('#reference').value;
    const button = document.querySelector('#submitBtn');

    if (!phone || !amount || !reference) {
      showToast("Error", "Fill all fields", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Sending...";

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amount, reference })
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error);
      }

      currentReference = reference;

      showToast("Success", "Check your phone for STK prompt");

      // start polling
      interval = setInterval(() => {
        checkStatus(currentReference);
      }, 3000);

    } catch (err) {
      showToast("Error", err.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Donate with M-Pesa";
    }
  });
}