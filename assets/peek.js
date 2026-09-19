/* Farm Hack Box · peek site — shared behaviour.
 *
 * These pages were lifted from a running box and from three GitHub drafts. On a
 * box, links like /admin/#/voice or /pos/ open live apps. Here there is no box,
 * so every link is handled one of three ways:
 *
 *   1. it has a page in this set          → go there (the tour stays connected)
 *   2. it only exists on a running box    → open a dialog saying what it is
 *   3. it is a placeholder ("#", no page) → open a dialog saying it is not live
 *
 * External links (farmhack.org, fao.org …) are left alone. Nothing here fetches
 * anything, so the set works from GitHub Pages and from a file:// checkout.
 */
(function () {
  'use strict';

  var STEPS = [
    { href: 'index.html',            label: 'The Box',             key: 'box' },
    { href: 'canon.html',            label: 'Canon & launch menu', key: 'canon' },
    { href: 'agroecology.html',      label: 'Agroecology',         key: 'agroecology' },
    { href: 'cgo.html',              label: 'CGO',                 key: 'cgo' },
    { href: 'pos.html',              label: 'Farm POS',            key: 'pos' },
    { href: 'not-a-box-store.html',  label: 'Not a Box Store',     key: 'network' }
  ];

  /* What each box-only route is, for the dialog. Written from the tree figure's
     own cell titles so the two never disagree. */
  var BOX_APPS = {
    '/admin/#/voice':               ['Voice Pipeline', 'Spoken field notes, tagged (goal, concern, decision, paddock, herd…) and filed into farm records.'],
    '/admin/#/soil-map':            ['Soil stack', 'SSURGO soil survey, PLFA soil biology, stratified sampling plans and soil-health scoring — one map.'],
    '/admin/#/grazing':             ['Grazing Manager', 'Paddocks, herds and moves; the crop–livestock–soil case of Synergies.'],
    '/admin/#/cert/regenscore':     ['RegenScore', 'Five subscores — soil, water, air, biodiversity, equity. A missing measurement reads “unmeasured”, never zero.'],
    '/admin/#/cert':                ['Certification / Organic Systems Plan', 'Organic system plans and certification evidence drawn from the farm’s own records.'],
    '/admin/#/ecdysis':             ['Ecdysis 1000 Farms', 'Insect biodiversity sampling protocol and results.'],
    '/admin/#/phenobox':            ['PhenoBox', 'Plant phenology observation.'],
    '/admin/#/documenter':          ['Field Documenter', 'Photo-and-note documentation that keeps its provenance.'],
    '/admin/#/pads':                ['Farm Hack Pad', 'Collaborative documents (Etherpad) hosted on the box.'],
    '/admin/#/weave':               ['District peer testbed', 'Custody modes for data shared between neighbouring boxes.'],
    '/admin/#/peering':             ['Peering / The Weave', 'Federation between trusted boxes — backup is not access.'],
    '/admin/#/governance/cgo':      ['CGO', 'The four elements — roles, protocols, tools, ceremonies — and what the box holds for each.'],
    '/admin/#/governance':          ['Governance', 'Policies and the audit log.'],
    '/admin/#/governance/consent':  ['Consent ledger', 'Consent receipts: who agreed to what, for how long, revocable.'],
    '/admin/#/flash':               ['Handing a box on', 'Preparing a box for its next steward.'],
    '/admin/#/observatory/card/organizations': ['Commons registry card', 'This organization’s card in the box’s commons registry — who they are, what they steward, how they connect.'],
    '/admin':                       ['Box admin', 'The box’s home screen and launch menu.'],
    '/ghg/':                        ['GHG calculator', 'Greenhouse-gas accounting (RothC, COMET-Farm factors) for grazing paddocks.'],
    '/equipment/':                  ['Equipment Registry', 'Barn and equipment records.'],
    '/finance/':                    ['Financial Health (FFSC)', 'Farm financial health, with the FFSC benchmarks.'],
    '/m/':                          ['Talk-to-the question sets', 'The mobile interview suite — structured conversations that produce farm cards.'],
    '/library/':                    ['Lending Library Kit', 'Tool and equipment lending between members.'],
    '/tools/':                      ['Farm Hack Tool Registry', 'Hundreds of open-source, DIY and commercial farm tools, carried offline.', 'https://farmhack.org/tools'],
    '/eta/':                        ['Ethical Tech Assessment', 'Score a tool against the GIAA Six Ethical Pillars and other rubrics.', 'https://www.gia-agroecology.org/'],
    '/canon/prolinnova/':           ['Prolinnova archive', '588 accounts of farmer-led innovation, carried offline.', 'https://prolinnova.net/'],
    '/encyclopedie/':               ['The Living Encyclopédie', 'The ARTFL Encyclopédie plus Atelier Paysan tools, searchable offline.', 'https://latelierpaysan.org/']
  };

  /* ── page links in this set ── */
  function localTarget(raw) {
    var m;
    if (/^\/canon\/?(index\.html)?$/.test(raw)) return 'canon.html';
    if (/^\/preview\/tree\.html/.test(raw)) return 'canon.html#tree';
    if (/^\/pos\/?$/.test(raw)) return 'pos.html';
    if (/^\/admin\/?#\/agroecology\/?$/.test(raw)) return 'agroecology.html';
    if ((m = raw.match(/^\/admin\/?#\/agroecology\/(matrix|\d+)$/))) return 'agroecology.html#/' + m[1];
    if (/^\/admin\/?#\/governance\/cgo\/?$/.test(raw)) return 'cgo.html';
    return null;
  }

  function boxInfo(raw) {
    var path = raw.replace(/[?].*$/, '');
    if (BOX_APPS[path]) return BOX_APPS[path];
    var best = null;
    Object.keys(BOX_APPS).forEach(function (k) {
      if (path.indexOf(k) === 0 && (!best || k.length > best.length)) best = k;
    });
    return best ? BOX_APPS[best] : null;
  }

  /* ── tour bar ── */
  function mountBar() {
    /* A page published on its own has no siblings to tour. */
    if (window.PEEK_NO_BAR || document.querySelector('.peek-bar')) return;
    if (document.querySelector('.peek-bar')) return;
    /* The attribute is the source of truth; the filename is the fallback for
       hosts that re-wrap the page and drop <body> attributes. */
    var byFile = { 'index.html': 'box', '': 'box', 'canon.html': 'canon',
                   'agroecology.html': 'agroecology', 'cgo.html': 'cgo',
                   'pos.html': 'pos', 'not-a-box-store.html': 'network' };
    var file = (location.pathname.split('/').pop() || '').toLowerCase();
    var here = document.body.getAttribute('data-peek') || byFile[file] || '';
    var nav = document.createElement('div');
    nav.className = 'peek-bar';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Farm Hack Box peek — pages');
    nav.innerHTML =
      '<div class="peek-bar-inner">' +
        '<a class="peek-brand" href="index.html">🌾 Farm Hack Box <small>a peek inside</small></a>' +
        '<ol class="peek-steps">' +
        STEPS.map(function (s, i) {
          return '<li><a href="' + s.href + '"' + (s.key === here ? ' aria-current="page"' : '') +
                 '><span class="n">0' + (i + 1) + '</span>' + s.label + '</a></li>';
        }).join('') +
        '</ol>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);
  }

  /* ── dialog ── */
  var modal, lastFocus;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'peek-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="peek-scrim" data-close></div>' +
      '<div class="peek-dialog" role="dialog" aria-modal="true" aria-labelledby="peek-dlg-title">' +
        '<button class="peek-close" type="button" aria-label="Close" data-close>×</button>' +
        '<div class="peek-body"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (!modal.hidden && e.key === 'Escape') closeModal();
      if (!modal.hidden && e.key === 'Tab') trapFocus(e);
    });
    return modal;
  }
  function trapFocus(e) {
    var f = modal.querySelectorAll('a[href],button');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  function openModal(html, wide) {
    ensureModal();
    lastFocus = document.activeElement;
    modal.querySelector('.peek-dialog').classList.toggle('wide', !!wide);
    modal.querySelector('.peek-body').innerHTML = html;
    modal.hidden = false;
    var btn = modal.querySelector('.peek-actions .primary') || modal.querySelector('.peek-close');
    if (btn) btn.focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }

  function boxDialog(raw, a) {
    var info = boxInfo(raw) || [];
    var d = (a && a.dataset) || {};
    var title = d.title || info[0] || (a && a.textContent.trim()) || 'An app on the box';
    var rows = '';
    if (d.state) rows += '<div><dt>state</dt><dd>' + esc(d.state) + '</dd></div>';
    if (d.role) rows += '<div><dt>role</dt><dd>' + esc(d.role) + (d.gloss ? ' — ' + esc(d.gloss) : '') + '</dd></div>';
    if (d.cat) rows += '<div><dt>observes</dt><dd>' + esc(d.cat) + '</dd></div>';
    if (d.els) rows += '<div><dt>elements</dt><dd>' + d.els.trim().split(/\s+/).map(function (n) {
      return '<a href="agroecology.html#/' + esc(n) + '">' + esc(n) + '</a>';
    }).join(' · ') + '</dd></div>';
    if (d.lands) rows += '<div><dt>lands in</dt><dd>' + esc(d.lands) + '</dd></div>';
    var actions = '<button type="button" class="primary" data-close>Got it</button>';
    if (info[2]) actions += '<a href="' + esc(info[2]) + '" target="_blank" rel="noopener">Public counterpart ↗</a>';
    openModal(
      '<p class="eyebrow">Runs on a Farm Hack Box</p>' +
      '<h2 id="peek-dlg-title">' + esc(title) + '</h2>' +
      (info[1] ? '<p>' + esc(info[1]) + '</p>' : '') +
      (rows ? '<dl>' + rows + '</dl>' : '') +
      '<p>On a box this opens <code>' + esc(raw) + '</code>. This preview is not attached to a box, so the app itself isn’t here — the page you’re on is a snapshot of what the box holds.</p>' +
      '<div class="peek-actions">' + actions + '</div>'
    );
  }

  function soonDialog(label) {
    openModal(
      '<p class="eyebrow">Not live yet</p>' +
      '<h2 id="peek-dlg-title">' + esc(label || 'Coming soon') + '</h2>' +
      '<p>This part of the Farm Hack Box story is still being built. For now, the best way in is the community.</p>' +
      '<div class="peek-actions">' +
        '<button type="button" class="primary" data-close>Got it</button>' +
        '<a href="https://forum.goatech.org/c/farmhack/21" target="_blank" rel="noopener">GOATech forum ↗</a>' +
      '</div>'
    );
  }
  window.peekSoon = soonDialog;

  /* ── artwork: click to see it whole ── */
  document.addEventListener('click', function (e) {
    var img = e.target.closest('img[data-zoom]');
    if (!img) return;
    e.preventDefault();
    openModal('<img class="peek-zoom" src="' + esc(img.getAttribute('src')) + '" alt="' + esc(img.getAttribute('alt') || '') + '">' +
      (img.dataset.caption ? '<p class="peek-cap" id="peek-dlg-title">' + esc(img.dataset.caption) + '</p>' : '') +
      (img.dataset.credit ? '<p class="peek-credit">' + esc(img.dataset.credit) + '</p>' : '') +
      '<div class="peek-actions"><button type="button" class="primary" data-close>Close</button></div>', true);
  });

  /* ── link handling ── */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var soon = e.target.closest('[data-peek-soon]');
    if (soon) { e.preventDefault(); soonDialog(soon.getAttribute('data-peek-soon') || soon.textContent.trim()); return; }
    var a = e.target.closest('a');
    if (!a) return;
    var raw = a.getAttribute('href') || a.getAttribute('xlink:href');
    if (raw == null) return;
    if (raw === '#' && !a.getAttribute('onclick')) { e.preventDefault(); soonDialog(a.textContent.trim()); return; }
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/') return;
    e.preventDefault();
    var local = localTarget(raw);
    if (local) { window.location.href = local; return; }
    boxDialog(raw, a);
  });

  /* ── tips ── */
  var tip, tipFor = null;
  function showTip(el) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'peek-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = el.getAttribute('data-tip');
    tip.setAttribute('data-on', '');
    tipFor = el;
    var r = el.getBoundingClientRect();
    var x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2));
    var y = r.top - tip.offsetHeight - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.removeAttribute('data-on'); tipFor = null; }
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el); else if (tipFor) hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el); else hideTip();
  });
  /* On a phone there is no hover: the first tap on a tip shows it (and holds the
     link back), the second tap goes through. */
  document.addEventListener('click', function (e) {
    if (!coarse) return;
    var el = e.target.closest('[data-tip]');
    if (el && el !== tipFor) { e.preventDefault(); e.stopPropagation(); showTip(el); }
    else if (!el) hideTip();
  }, true);
  window.addEventListener('scroll', function () { if (tipFor && document.contains(tipFor)) showTip(tipFor); else hideTip(); }, { passive: true, capture: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBar);
  else mountBar();
})();
