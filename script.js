/* ==========================================================
   WIKIPEDIA PORTAL - CLIENT INTERACTION SCRIPT
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const searchInput = document.getElementById('searchInput');
  const searchLanguage = document.getElementById('searchLanguage');
  const searchForm = document.getElementById('searchForm') || document.getElementById('search-form');
  const searchSuggestions = document.getElementById('searchSuggestions');
  const suggestionsList = document.getElementById('suggestionsList');
  const langListToggleBtn = document.getElementById('langListToggleBtn');
  const langListDrawer = document.getElementById('langListDrawer');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  let selectedIndex = -1;
  let currentSuggestions = [];
  let debounceTimeout = null;

  // 1. Theme Management (Light / Dark)
  const savedTheme = localStorage.getItem('wiki_portal_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      let newTheme = 'dark';
      if (currentTheme === 'dark') {
        newTheme = 'light';
      } else if (!currentTheme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        newTheme = prefersDark ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('wiki_portal_theme', newTheme);
    });
  }

  // 2. Language Selector Sync
  const savedLang = localStorage.getItem('wiki_portal_lang') || 'ko';
  if (searchLanguage) {
    searchLanguage.value = savedLang;
    updateSearchAction(savedLang);

    searchLanguage.addEventListener('change', (e) => {
      const selected = e.target.value;
      localStorage.setItem('wiki_portal_lang', selected);
      updateSearchAction(selected);
      // Trigger new search query if input has text
      if (searchInput.value.trim().length > 0) {
        fetchSuggestions(searchInput.value.trim(), selected);
      }
    });
  }

  function updateSearchAction(lang) {
    if (searchForm) {
      searchForm.action = `https://${lang}.wikipedia.org/wiki/Special:Search`;
    }
    if (searchInput) {
      const langNames = {
        ko: '위키백과',
        en: 'Wikipedia',
        ja: 'ウィキペディア',
        de: 'Wikipedia',
        fr: 'Wikipédia',
        es: 'Wikipedia',
        ru: 'Википедия',
        it: 'Wikipedia',
        zh: '维基百科',
        pl: 'Wikipedia',
        pt: 'Wikipédia',
        nl: 'Wikipedia',
        sv: 'Wikipedia',
        vi: 'Wikipedia',
        ar: 'ويكيبيديا'
      };
      searchInput.placeholder = `${langNames[lang] || '위키백과'} 검색`;
    }
  }

  // 3. Search Form Submit Handling
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      const lang = searchLanguage ? searchLanguage.value : 'ko';
      if (!query) return;

      // If an item in suggestion list is currently selected with arrow keys, go to that
      if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
        window.location.href = currentSuggestions[selectedIndex].url;
        return;
      }

      const targetUrl = `https://${lang}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`;
      window.location.href = targetUrl;
    });
  }

  // 4. Autocomplete / Live Typeahead Suggestions
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      const query = searchInput.value.trim();
      const lang = searchLanguage ? searchLanguage.value : 'ko';

      if (query.length === 0) {
        hideSuggestions();
        return;
      }

      debounceTimeout = setTimeout(() => {
        fetchSuggestions(query, lang);
      }, 180);
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
      if (searchSuggestions.hidden || currentSuggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
        updateSuggestionSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        updateSuggestionSelection();
      } else if (e.key === 'Escape') {
        hideSuggestions();
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
          e.preventDefault();
          window.location.href = currentSuggestions[selectedIndex].url;
        }
      }
    });

    // Re-open on focus if query present
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length > 0 && currentSuggestions.length > 0) {
        searchSuggestions.hidden = false;
      }
    });
  }

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      hideSuggestions();
    }
  });

  async function fetchSuggestions(query, lang) {
    try {
      // Use Wikipedia OpenSearch API with CORS origin=*
      const opensearchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=6&namespace=0&format=json&origin=*`;
      const res = await fetch(opensearchUrl);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      
      const titles = data[1] || [];
      const descriptions = data[2] || [];
      const urls = data[3] || [];

      if (titles.length === 0) {
        renderNoResults(query);
        return;
      }

      // Fetch thumbnails for these titles
      let thumbnails = {};
      try {
        const thumbUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=pageimages&pithumbsize=80&format=json&origin=*`;
        const thumbRes = await fetch(thumbUrl);
        if (thumbRes.ok) {
          const thumbData = await thumbRes.json();
          const pages = thumbData?.query?.pages || {};
          Object.values(pages).forEach(p => {
            if (p.title && p.thumbnail) {
              thumbnails[p.title] = p.thumbnail.source;
            }
          });
        }
      } catch (err) {
        // Thumbnail loading failure is non-fatal
      }

      currentSuggestions = titles.map((title, i) => ({
        title,
        desc: descriptions[i] || '',
        url: urls[i] || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        thumb: thumbnails[title] || null
      }));

      renderSuggestions(query);
    } catch (error) {
      console.warn('Wikipedia Search API failed:', error);
      hideSuggestions();
    }
  }

  function renderSuggestions(query) {
    suggestionsList.innerHTML = '';
    selectedIndex = -1;

    currentSuggestions.forEach((item, index) => {
      const a = document.createElement('a');
      a.className = 'suggestion-item';
      a.href = item.url;
      a.setAttribute('data-index', index);

      // Thumbnail
      const img = document.createElement('img');
      img.className = 'suggestion-thumb';
      img.src = item.thumb || 'assets/Wikipedia-logo-v2.png';
      img.alt = item.title;
      img.loading = 'lazy';
      a.appendChild(img);

      // Content text
      const content = document.createElement('div');
      content.className = 'suggestion-content';

      const titleEl = document.createElement('div');
      titleEl.className = 'suggestion-title';
      
      // Highlight matching query
      const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
      titleEl.innerHTML = item.title.replace(regex, '<mark>$1</mark>');

      const descEl = document.createElement('div');
      descEl.className = 'suggestion-desc';
      descEl.textContent = item.desc || '위키백과 문서';

      content.appendChild(titleEl);
      content.appendChild(descEl);
      a.appendChild(content);

      a.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSuggestionSelection();
      });

      suggestionsList.appendChild(a);
    });

    searchSuggestions.hidden = false;
  }

  function renderNoResults(query) {
    currentSuggestions = [];
    selectedIndex = -1;
    suggestionsList.innerHTML = `<div class="suggestion-empty"><strong>"${escapeHtml(query)}"</strong> 관련 결과가 없습니다.</div>`;
    searchSuggestions.hidden = false;
  }

  function hideSuggestions() {
    searchSuggestions.hidden = true;
    selectedIndex = -1;
  }

  function updateSuggestionSelection() {
    const items = suggestionsList.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // 5. Language Drawer Toggle
  if (langListToggleBtn && langListDrawer) {
    langListToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isExpanded = langListToggleBtn.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;

      langListToggleBtn.setAttribute('aria-expanded', newState);
      if (newState) {
        langListDrawer.classList.add('open');
      } else {
        langListDrawer.classList.remove('open');
      }
    });
  }

  // Utilities
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(string) {
    const div = document.createElement('div');
    div.textContent = string;
    return div.innerHTML;
  }
});
