// Runs before CSS/React to restore the chosen theme without a light flash.
(() => {
  let theme = 'light';
  try {
    if (localStorage.getItem('refeicao-facil:theme') === 'dark') theme = 'dark';
  } catch { /* Storage may be disabled; the original light theme remains usable. */ }
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080D0B' : '#FBF1E0');
})();
