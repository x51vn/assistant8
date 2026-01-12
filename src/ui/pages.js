export function setActivePage({ resultsPage, portfolioPage, errorsPage, settingsPage, resultsBtn, portfolioBtn, errorsBtn, settingsBtn, page }) {
  const pages = [resultsPage, portfolioPage, errorsPage, settingsPage].filter(Boolean);
  const btns = [resultsBtn, portfolioBtn, errorsBtn, settingsBtn].filter(Boolean);

  // Remove active from all pages and buttons
  pages.forEach(p => {
    if (p) p.classList.remove('active');
  });
  btns.forEach(b => {
    if (b) b.classList.remove('active');
  });

  // Add active to selected page and button
  if (page === 'results' && resultsPage && resultsBtn) {
    resultsPage.classList.add('active');
    resultsBtn.classList.add('active');
  } else if (page === 'portfolio' && portfolioPage && portfolioBtn) {
    portfolioPage.classList.add('active');
    portfolioBtn.classList.add('active');
  } else if (page === 'errors' && errorsPage && errorsBtn) {
    errorsPage.classList.add('active');
    errorsBtn.classList.add('active');
  } else if (page === 'settings' && settingsPage && settingsBtn) {
    settingsPage.classList.add('active');
    settingsBtn.classList.add('active');
  }
}
