const donationForm = document.querySelector('#donationForm');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toastMessage');

let interval = null;

function showToast(title, message, isError = false) {
  toastMessage.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  toast.style.borderColor = isError
    ? 'rgba(255, 123, 114, 0.4)'
    : 'rgba(73, 198, 255, 0.3)';

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// =======================
// CHECK PAYMENT STATUS
// =======================
async function checkStatus(reference) {
  try {
    const res = await fetch(`/api/status/${reference}`);
    const data = await res.json();

    console.log("STATUS CHECK:", data);

    if (data.status === "success") {
      clearInterval(interval);

      showToast("Success 🎉", "Payment confirmed!");

      // small delay so user sees toast
      setTimeout(() => {
        window.location.href = "/success.html";
      }, 1500);
    }

    if (data.status === "failed") {
      clearInterval(interval);
      showToast("Payment failed", "Transaction was not completed", true);
    }

  } catch (err) {
    console.error("Status error:", err);
  }
}

// =======================
// FORM SUBMIT
// =======================
if (donationForm) {
  donationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = document.querySelector('#phone').value.trim();
    const amount = document.querySelector('#amount').value.trim();
    const referenceInput = document.querySelector('#reference').value.trim();
    const button = document.querySelector('#submitBtn');

    if (!phone || !amount || !referenceInput) {
      showToast("Error", "Fill all fields", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Sending...";

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          amount,
          reference: referenceInput
        })
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Payment failed");
      }

      showToast("STK Sent 📲", "Check your phone to complete payment");

      // IMPORTANT: use SAME reference for polling
      interval = setInterval(() => {
        checkStatus(referenceInput);
      }, 3000);

    } catch (err) {
      showToast("Error", err.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Donate with M-Pesa";
    }
  });
}