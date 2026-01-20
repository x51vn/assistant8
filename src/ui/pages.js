export function setActivePage({ pages, btns, page }) {
  // Remove active from all pages and buttons
  pages?.forEach(p => {
    if (p) p.classList.remove('active');
  });
  btns?.forEach(b => {
    if (b) b.classList.remove('active');
  });

  // Add active to selected page and button
  const pageMap = {
    'notes': 0,
    'portfolio': 1,
    'results': 2,
    'errors': 3,
    'english': 4,
    'templates': 5,
    'settings': 6
  };

  const index = pageMap[page];
  if (index !== undefined && pages && btns) {
    if (pages[index]) pages[index].classList.add('active');
    if (btns[index]) btns[index].classList.add('active');
  }
}
