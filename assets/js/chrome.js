/* CyberArena — uniform page chrome (header nav + footer), injected on every page.
   Classic script (no module) placed RIGHT AFTER <nav id="site-nav"> so it fills
   the nav synchronously during parse — before first paint — and never causes a
   layout-shift "blink". The footer element is parsed later, so its fill defers to
   DOMContentLoaded (it's below the fold; a late fill shifts nothing visible).
   Usage: <nav class="nav" id="site-nav"></nav><script src="assets/js/chrome.js"></script>
          … <footer class="footer" id="site-footer"></footer> */
(function(){
  const LINKS = [
    ['index.html', 'Home'],
    ['leaderboard.html', 'Leaderboard'],
    ['games.html', 'Games'],
    ['runs.html', 'Runs'],
    ['trajectory.html', 'Random'],
    ['blogs.html', 'Blogs'],
    ['about.html', 'About us'],
  ];
  const page = location.pathname.split('/').pop() || 'index.html';
  const brand = '<a class="brand" href="index.html">Cyber<em>Arena</em></a>';
  const navlinks = `<span class="navlinks">${LINKS.map(([href, label]) =>
    `<a href="${href}"${href === page ? ' class="active"' : ''}>${label}</a>`).join('')}</span>`;

  function fillNav(){
    const nav = document.getElementById('site-nav');
    if (!nav || nav.childElementCount) return;
    nav.innerHTML = brand +
      '<button class="nav-burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
      navlinks;
    const btn = nav.querySelector('.nav-burger');
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  const year = new Date().getFullYear();
  function fillFooter(){
    const foot = document.getElementById('site-footer');
    if (!foot || foot.childElementCount) return;
    foot.innerHTML = `
      <div class="foot-line">
        <a class="brand" href="https://github.com/cyber-arena-ai" target="_blank" rel="noopener">Git<em>Hub</em></a>
        <a class="brand" href="https://2077ai.com" target="_blank" rel="noopener">2077<em class="b">AI</em></a>
        <a class="brand" href="https://agentbeats.org" target="_blank" rel="noopener">Agent<em>Beats</em></a>
        <span class="brand">© ${year} Cyber<em>Arena</em></span>
      </div>`;
  }

  // favicon — the simple black/pink "CA", shared by every page
  if (!document.querySelector('link[rel~="icon"]')){
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.href = 'assets/img/favicon.svg';
    document.head.appendChild(icon);
  }

  fillNav();   // #site-nav exists (script sits right after it) -> filled pre-paint
  // the footer is further down the document; fill it once the DOM is ready
  if (document.getElementById('site-footer')) fillFooter();
  else document.addEventListener('DOMContentLoaded', fillFooter);
})();
