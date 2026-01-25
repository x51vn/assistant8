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
    'portfolio': 0,
    'results': 1,
    'errors': 2,
    'english': 3,
    'settings': 4
  };

  const index = pageMap[page];
  if (index !== undefined && pages && btns) {
    if (pages[index]) pages[index].classList.add('active');
    if (btns[index]) btns[index].classList.add('active');
  }
}
