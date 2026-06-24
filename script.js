const form = document.querySelector('#donationForm');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toastMessage');

let interval = null;

function showToast(title, message, isError = false) {
  toastMessage.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  toast.style.borderColor = isError ? 'red' : 'green';
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 4000);
}

async function checkStatus(ref) {
  const res = await fetch(`/api/status/${ref}`);
  const data = await res.json();

  if (data.status === "success") {
    clearInterval(interval);
    window.location.href = "/success.html";
  }

  if (data.status === "failed") {
    clearInterval(interval);
    showToast("Failed", "Payment failed", true);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const phone = document.querySelector('#phone').value;
  const amount = document.querySelector('#amount').value;
  const reference = document.querySelector('#reference').value;
  const btn = document.querySelector('#submitBtn');

  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, amount, reference })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    showToast("Success", "Check your phone for STK");

    interval = setInterval(() => checkStatus(reference), 3000);

  } catch (err) {
    showToast("Error", err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Donate with M-Pesa";
  }
});