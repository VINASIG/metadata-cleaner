import './shared-preferences.js';

const forcedColors = window.matchMedia('(forced-colors: active)');
function updateLogo(): void {
  const surface = getComputedStyle(document.body)
    .backgroundColor.match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  const dark =
    forcedColors.matches && surface?.length === 3
      ? 0.299 * (surface[0] ?? 0) +
          0.587 * (surface[1] ?? 0) +
          0.114 * (surface[2] ?? 0) <
        128
      : document.documentElement.dataset['theme'] === 'dark';
  for (const source of document.querySelectorAll<HTMLSourceElement>(
    '[data-brand-logo] source',
  ))
    source.media = dark ? 'all' : 'not all';
}
document.documentElement.addEventListener('vinasig:theme', updateLogo);
forcedColors.addEventListener('change', updateLogo);
updateLogo();
