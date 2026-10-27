'use strict';
(() => {
  // Share the existing news preference; no content or filter state is changed.
  const key = 'ai-news-preview-theme';
  const button = document.getElementById('theme');
  if (!button) return;
  let dark = false;
  try { dark = localStorage.getItem(key) === 'dark'; } catch {}
  function render() {
    document.body.classList.toggle('dark', dark);
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え');
    button.querySelector('span').textContent = dark ? 'ライト' : 'ダーク';
  }
  render();
  button.hidden = false;
  button.addEventListener('click', () => {
    dark = !dark;
    render();
    try { localStorage.setItem(key, dark ? 'dark' : 'light'); } catch {}
  });
})();
