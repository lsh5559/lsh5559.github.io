/* ─────────────────────────────────────────────
   transition.js · 페이지 전환 애니메이션
   ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 진입 페이드인 ── */
  document.body.classList.add('page-enter');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('page-enter-active');
    });
  });

  /* ── 페이지 이탈 시 페이드아웃 ── */
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    /* 같은 사이트 내부 링크만 처리 */
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;

    link.addEventListener('click', e => {
      e.preventDefault();
      document.body.classList.add('page-leave');
      setTimeout(() => {
        window.location.href = href;
      }, 455);
    });
  });

});
