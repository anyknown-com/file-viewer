// Applies a saved theme before the first frame so the page does not flash. A same-origin file,
// not an inline script, so the site runs under the minimum CSP.
try {
  var theme = localStorage.getItem("fv-site-theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
  /* storage blocked: follow the OS */
}
