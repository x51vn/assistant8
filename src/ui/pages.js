export function setActivePage({ resultsPage, settingsPage, resultsBtn, settingsBtn, page }) {
  if (!resultsPage || !settingsPage || !resultsBtn || !settingsBtn) return;

  if (page === 'results') {
    resultsPage.classList.add('active');
    settingsPage.classList.remove('active');
    resultsBtn.classList.add('active');
    settingsBtn.classList.remove('active');
  } else {
    settingsPage.classList.add('active');
    resultsPage.classList.remove('active');
    settingsBtn.classList.add('active');
    resultsBtn.classList.remove('active');
  }
}
