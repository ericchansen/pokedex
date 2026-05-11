/**
 * ui/widgets/ball-picker.js - Shared ball picker widget.
 */
const BallPicker = (() => {
  const BALL_LIST = Object.freeze(['Poke','Great','Ultra','Master','Safari','Fast','Level','Lure','Heavy','Love',
    'Friend','Moon','Dream','Beast','Sport','Premier','Repeat','Timer','Nest','Net',
    'Dive','Luxury','Heal','Quick','Dusk','Cherish','Strange']);

  // Balls not in PokeAPI — fall back to PokéSprite
  const POKESPRITE_BALLS = new Set(['Strange']);

  function ballSpriteUrl(ballName) {
    const slug = String(ballName || '').toLowerCase().replace(/\s+/g, '-');
    if (POKESPRITE_BALLS.has(ballName)) {
      return `https://raw.githubusercontent.com/msikma/pokesprite/master/items/ball/${slug}.png`;
    }
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}-ball.png`;
  }

  function createBallPicker(container, selectedBall, onChange) {
    const escapeHtml = UIShared.escapeHtml;
    let current = selectedBall || 'Poke';
    let activeBall = current;
    container.innerHTML = '';
    container.className = (container.className.replace(/\bball-picker\b/, '') + ' ball-picker').trim();
    container.dataset.value = current;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ball-picker__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    container.appendChild(trigger);

    const panel = document.createElement('div');
    panel.className = 'ball-picker__panel';
    container.appendChild(panel);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'ball-picker__search';
    searchInput.placeholder = 'Type to filter balls...';
    searchInput.autocomplete = 'off';
    searchInput.setAttribute('aria-label', 'Filter Poké Balls');
    panel.appendChild(searchInput);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'ball-picker__options';
    panel.appendChild(optionsContainer);

    const emptyState = document.createElement('div');
    emptyState.className = 'ball-picker__empty';
    emptyState.textContent = 'No balls match that search.';
    emptyState.hidden = true;
    panel.appendChild(emptyState);

    const options = BALL_LIST.map((ball) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'ball-picker__option';
      opt.dataset.ball = ball;
      opt.dataset.search = `${ball} ball`.toLowerCase();
      opt.innerHTML = `<img src="${ballSpriteUrl(ball)}" width="20" height="20" alt="" loading="lazy"><span>${escapeHtml(ball)}</span>`;
      optionsContainer.appendChild(opt);
      return opt;
    });

    function isOpen() {
      return panel.classList.contains('ball-picker__panel--open');
    }

    function getVisibleOptions() {
      return options.filter((opt) => !opt.hidden);
    }

    function syncOptionState() {
      options.forEach((opt) => {
        const isSelected = opt.dataset.ball === current;
        const isActive = opt.dataset.ball === activeBall;
        opt.classList.toggle('ball-picker__option--selected', isSelected);
        opt.classList.toggle('ball-picker__option--active', isActive);
        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      });
    }

    function renderTrigger(ball) {
      trigger.innerHTML = `<img src="${ballSpriteUrl(ball)}" width="24" height="24" alt="" class="ball-picker__icon"><span class="ball-picker__label">${escapeHtml(ball)} Ball</span><span class="ball-picker__arrow">▾</span>`;
    }

    function setActive(ball, { scroll = true } = {}) {
      activeBall = ball || null;
      syncOptionState();
      if (!scroll || !activeBall) return;
      const opt = options.find((candidate) => candidate.dataset.ball === activeBall && !candidate.hidden);
      if (opt) opt.scrollIntoView({ block: 'nearest' });
    }

    function applyFilter(rawQuery) {
      const query = String(rawQuery || '').trim().toLowerCase();
      let firstVisible = null;
      let selectedVisible = null;

      options.forEach((opt) => {
        const matches = !query || opt.dataset.search.includes(query);
        opt.hidden = !matches;
        if (!matches) return;
        if (!firstVisible) firstVisible = opt;
        if (opt.dataset.ball === current) selectedVisible = opt;
      });

      emptyState.hidden = !!firstVisible;
      const nextActive = selectedVisible || firstVisible;
      setActive(nextActive ? nextActive.dataset.ball : null, { scroll: false });
    }

    function setValue(ball) {
      current = ball;
      container.dataset.value = ball;
      renderTrigger(ball);
      setActive(ball, { scroll: false });
    }

    function closePanel({ focusTrigger = false } = {}) {
      panel.classList.remove('ball-picker__panel--open');
      trigger.setAttribute('aria-expanded', 'false');
      searchInput.value = '';
      applyFilter('');
      if (focusTrigger) trigger.focus();
    }

    function openPanel(initialQuery = '') {
      panel.classList.add('ball-picker__panel--open');
      trigger.setAttribute('aria-expanded', 'true');
      searchInput.value = initialQuery;
      applyFilter(initialQuery);
      requestAnimationFrame(() => {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      });
      if (!initialQuery) {
        const sel = options.find((opt) => opt.dataset.ball === current);
        if (sel && !sel.hidden) sel.scrollIntoView({ block: 'nearest' });
      }
    }

    function commitBall(ball) {
      if (!ball) return;
      setValue(ball);
      closePanel();
      if (onChange) onChange(ball);
    }

    function moveActive(delta) {
      const visible = getVisibleOptions();
      if (!visible.length) return;
      const currentIndex = visible.findIndex((opt) => opt.dataset.ball === activeBall);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (startIndex + delta + visible.length) % visible.length;
      setActive(visible[nextIndex].dataset.ball);
    }

    trigger.addEventListener('click', () => {
      if (isOpen()) {
        closePanel();
      } else {
        openPanel();
      }
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen()) openPanel();
        moveActive(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen()) closePanel();
        else openPanel();
        return;
      }
      if (e.key === 'Escape' && isOpen()) {
        e.preventDefault();
        closePanel();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (isOpen()) {
          searchInput.value += e.key;
          applyFilter(searchInput.value);
          searchInput.focus();
          searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        } else {
          openPanel(e.key);
        }
      }
    });

    searchInput.addEventListener('input', () => {
      applyFilter(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveActive(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveActive(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const visible = getVisibleOptions();
        const match = visible.find((opt) => opt.dataset.ball === activeBall) || visible[0];
        commitBall(match?.dataset.ball || null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel({ focusTrigger: true });
      }
    });

    optionsContainer.addEventListener('mousemove', (e) => {
      const opt = e.target.closest('.ball-picker__option');
      if (!opt || opt.hidden) return;
      if (opt.dataset.ball !== activeBall) setActive(opt.dataset.ball, { scroll: false });
    });

    optionsContainer.addEventListener('click', (e) => {
      const opt = e.target.closest('.ball-picker__option');
      if (!opt) return;
      commitBall(opt.dataset.ball);
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) closePanel();
    });

    renderTrigger(current);
    applyFilter('');
    return { setValue, getValue: () => container.dataset.value };
  }

  return { BALL_LIST, ballSpriteUrl, createBallPicker };
})();

if (typeof window !== 'undefined') {
  window.BallPicker = BallPicker;
}
