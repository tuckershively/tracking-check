// Sends the form, then tells Tag Manager only when the server confirms it arrived.
document.getElementById("visit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch(e.target.action, { method: "POST", body: new FormData(e.target) });
  if (r.ok) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "form_sent" });
    document.getElementById("status").hidden = false;
  }
});
