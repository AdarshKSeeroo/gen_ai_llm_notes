/* Sidebar table of contents. Opt in with <body class="has-toc">.
   Built from main > section > h2 and the h3s inside each section. */
(function () {
  var main = document.querySelector('main') || document.querySelector('.wrap');
  if (!main || !document.body.classList.contains('has-toc')) return;

  var slug = function (s) {
    return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  var used = {};
  Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (e) { used[e.id] = 1; });
  var ensureId = function (h) {
    if (h.id) return h.id;
    var base = slug(h.textContent) || 'section', id = base, n = 2;
    while (used[id]) id = base + '-' + n++;
    used[id] = 1;
    h.id = id;
    return id;
  };

  var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section'));
  // Flat pages (no <section> wrappers): group h3s under the preceding h2.
  var flat = !sections.length;
  var groups = [];
  if (flat) {
    var g = null;
    Array.prototype.forEach.call(main.querySelectorAll('h2, h3'), function (h) {
      if (h.tagName === 'H2') { g = { h2: h, h3s: [] }; groups.push(g); }
      else if (g) g.h3s.push(h);
    });
  } else {
    sections.forEach(function (sec) {
      var h2 = sec.querySelector(':scope > h2');
      if (h2) groups.push({ h2: h2, h3s: Array.prototype.slice.call(sec.querySelectorAll('h3')), sec: sec });
    });
  }
  if (!groups.length) return;

  var aside = document.createElement('aside');
  aside.className = 'toc-side';
  aside.id = 'toc-side';
  aside.innerHTML =
    '<input type="search" class="toc-filter" placeholder="Filter topics…" aria-label="Filter topics">' +
    '<div class="toc-tools"><button type="button" data-act="expand">Expand all</button>' +
    '<button type="button" data-act="collapse">Collapse all</button></div>' +
    '<ul class="toc-list"></ul>';
  var list = aside.querySelector('.toc-list');
  var items = []; // {li, a, h, section, text}

  groups.forEach(function (grp) {
    var h2 = grp.h2, sec = grp.sec;
    var li = document.createElement('li');
    li.className = 'toc-sec';
    var a = document.createElement('a');
    a.href = '#' + ensureId(sec && sec.id ? sec : h2);
    a.textContent = h2.textContent;
    li.appendChild(a);
    var sub = document.createElement('ul');
    var rec = { li: li, a: a, h: h2, text: h2.textContent.toLowerCase(), kids: [] };
    items.push(rec);
    grp.h3s.forEach(function (h3) {
      var sli = document.createElement('li');
      var sa = document.createElement('a');
      sa.href = '#' + ensureId(h3);
      sa.textContent = h3.textContent;
      sli.appendChild(sa);
      sub.appendChild(sli);
      var k = { li: sli, a: sa, h: h3, text: h3.textContent.toLowerCase(), parent: rec };
      rec.kids.push(k);
      items.push(k);
    });
    li.appendChild(sub);
    list.appendChild(li);
  });

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toc-toggle';
  toggle.setAttribute('aria-controls', 'toc-side');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = '☰ Contents';
  var scrim = document.createElement('div');
  scrim.className = 'toc-scrim';
  var top = document.createElement('a');
  top.className = 'to-top';
  top.href = '#';
  top.textContent = '↑ Top';
  top.setAttribute('aria-label', 'Back to top');
  document.body.appendChild(aside);
  document.body.appendChild(scrim);
  document.body.appendChild(toggle);
  document.body.appendChild(top);

  var setOpen = function (open) {
    document.body.classList.toggle('toc-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', function () { setOpen(!document.body.classList.contains('toc-open')); });
  scrim.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

  // Collapsible sections: click an h2 to fold/unfold.
  var setCollapsed = function (sec, c) { sec.classList.toggle('collapsed', c); };
  sections.forEach(function (sec) {
    var h2 = sec.querySelector(':scope > h2');
    if (!h2) return;
    h2.classList.add('fold-h');
    h2.setAttribute('role', 'button');
    h2.tabIndex = 0;
    var flip = function () { setCollapsed(sec, !sec.classList.contains('collapsed')); };
    h2.addEventListener('click', flip);
    h2.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });
  aside.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (b) {
      sections.forEach(function (s) { setCollapsed(s, b.dataset.act === 'collapse'); });
      return;
    }
    if (e.target.closest('a')) setOpen(false);
  });
  // Jumping to a heading inside a folded section unfolds it first.
  var reveal = function () {
    var id = decodeURIComponent(location.hash.slice(1));
    var t = id && document.getElementById(id);
    var s = t && t.closest('section');
    if (s && s.classList.contains('collapsed')) {
      setCollapsed(s, false);
      t.scrollIntoView();
    }
  };
  window.addEventListener('hashchange', reveal);
  reveal();

  // Filter box.
  aside.querySelector('.toc-filter').addEventListener('input', function (e) {
    var q = e.target.value.trim().toLowerCase();
    aside.classList.toggle('filtering', !!q);
    items.forEach(function (it) { it.hit = !q || it.text.indexOf(q) !== -1; });
    items.forEach(function (it) {
      if (it.kids) {
        var any = it.hit || it.kids.some(function (k) { return k.hit; });
        it.li.hidden = !any;
        it.kids.forEach(function (k) { k.li.hidden = !(k.hit || it.hit); });
      }
    });
  });

  // Scroll-spy: the last heading above the reading line is "current".
  var current = null, ticking = false;
  var spy = function () {
    ticking = false;
    var line = 90, best = null;
    for (var i = 0; i < items.length; i++) {
      var r = items[i].h.getBoundingClientRect();
      if (r.height === 0 && !items[i].h.offsetParent) continue; // hidden (folded)
      if (r.top <= line) best = items[i]; else break;
    }
    if (best === current) return;
    if (current) {
      current.a.classList.remove('on');
      current.li.classList.remove('current');
      (current.parent || current).li.classList.remove('open');
    }
    current = best;
    if (current) {
      current.a.classList.add('on');
      (current.parent || current).li.classList.add('open');
      var a = current.a, box = aside;
      var ar = a.getBoundingClientRect(), br = box.getBoundingClientRect();
      if (ar.top < br.top + 70 || ar.bottom > br.bottom - 10) {
        box.scrollTop += ar.top - br.top - br.height / 3;
      }
    }
  };
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(spy); }
  }, { passive: true });
  window.addEventListener('resize', spy);
  spy();
})();
