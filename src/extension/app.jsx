/**
 * GPT-040/041: Preact app shell with lazy-loading router
 * Handles navigation and dynamic page loading (component only, not entry point)
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export default function App({ user }) {
  const [currentPage, setCurrentPage] = useState('results');
  const [PageComponent, setPageComponent] = useState(null);

  // GPT-041: Lazy load page component when currentPage changes
  useEffect(() => {
    let isMounted = true;

    const loadPage = async () => {
      try {
        setPageComponent(null); // Clear previous component
        
        // Dynamic import based on page name
        const pageMap = {
          portfolio: () => import('../ui/Portfolio.jsx'),
          results: () => import('../ui/Results.jsx'),
          errors: () => import('../ui/Errors.jsx'),
          settings: () => import('../ui/Settings.jsx'),
          english: () => import('../ui/English.jsx'),
        };

        const loader = pageMap[currentPage];
        if (loader) {
          const module = await loader();
          if (isMounted) {
            setPageComponent(() => module.default);
          }
        }
      } catch (error) {
        console.error(`Failed to load page: ${currentPage}`, error);
        // Fallback: show error or placeholder
        if (isMounted) {
          setPageComponent(() => () => (
            <div style={{ padding: '16px', color: 'red' }}>
              <p>Failed to load page: {currentPage}</p>
              <p style={{ fontSize: '12px' }}>{error.message}</p>
            </div>
          ));
        }
      }
    };

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [currentPage]);

  useEffect(() => {
    // Attach nav button listeners
    const portfolioBtn = document.getElementById('portfolioBtn');
    const resultsBtn = document.getElementById('resultsBtn');
    const errorsBtn = document.getElementById('errorsBtn');
    const englishBtn = document.getElementById('englishBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    const handleNav = (page) => {
      setCurrentPage(page);
      // Update active state on nav buttons
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      const btnMap = {
        portfolio: portfolioBtn,
        results: resultsBtn,
        errors: errorsBtn,
        english: englishBtn,
        settings: settingsBtn
      };
      if (btnMap[page]) btnMap[page].classList.add('active');
    };

    portfolioBtn?.addEventListener('click', () => handleNav('portfolio'));
    resultsBtn?.addEventListener('click', () => handleNav('results'));
    errorsBtn?.addEventListener('click', () => handleNav('errors'));
    englishBtn?.addEventListener('click', () => handleNav('english'));
    settingsBtn?.addEventListener('click', () => handleNav('settings'));

    return () => {
      portfolioBtn?.removeEventListener('click', () => handleNav('portfolio'));
      resultsBtn?.removeEventListener('click', () => handleNav('results'));
      errorsBtn?.removeEventListener('click', () => handleNav('errors'));
      englishBtn?.removeEventListener('click', () => handleNav('english'));
      settingsBtn?.removeEventListener('click', () => handleNav('settings'));
    };
  }, []);

  // Render current page component or loading placeholder
  return (
    <div id="preact-root">
      {PageComponent ? (
        <PageComponent />
      ) : (
        <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
          <i className="fas fa-spinner fa-spin"></i> Loading...
        </div>
      )}
    </div>
  );
}
