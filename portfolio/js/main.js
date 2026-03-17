/* ─────────────────────────────────────────────
   main.js · 메인 페이지 로직
   ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.querySelector('.hero-overlay');
  if (!overlay) return;

  overlay.style.opacity   = '0';
  overlay.style.transform = 'translateX(-50%) translateY(12px)';
  overlay.style.transition = 'opacity 1s ease 0.5s, transform 1s ease 0.5s';

  requestAnimationFrame(() => {
    overlay.style.opacity   = '1';
    overlay.style.transform = 'translateX(-50%) translateY(0)';
  });
});
