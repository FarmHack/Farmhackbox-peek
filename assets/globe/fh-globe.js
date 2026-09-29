/* FHGlobe — a globe for BROWSING, with a little zoom.
 *
 * It shows where things are and lets you pick one. It zooms from the whole
 * world down to COUNTRY level and no further: anything closer hands off to the
 * flat map (onOpenFlat), which owns street-level zoom, layers and privacy
 * radii. That split keeps this file tiny and dependency-light: d3-geo +
 * d3-array + Natural Earth 1:110m, drawn as SVG. No WebGL, no tiles, no fonts,
 * no network — it runs on a Pi Zero.
 *
 *   FHGlobe.mount(host, {
 *     land, borders, countries,  // GeoJSON from countries-110m (borders = interior mesh)
 *     points: [{id, lat, lon, tier, on, self, short, label, name, planes:[[color, on]]}],
 *     links:  [{from, to, color, dash, title, width, arrow, opacity}],
 *     centre: {lon, lat}, zoom,  // persisted by the caller across re-renders
 *     selected,                  // id or null
 *     onSelect(id), onOpenFlat(ids), onRotate({lon, lat, zoom}), onView(hiddenIds),
 *     status: false,             // never say online/offline (a public page counts boxes held, not boxes on)
 *     closer: false,             // no flat map on this page: never offer "closer"
 *     hint                       // replaces the default one-line hint
 *   }) -> { flyTo(lon, lat, zoom?), zoomBy(f), destroy() }
 *
 * The one weakness of a globe is that half of it is out of sight, so an
 * offline box can hide on the far side. The chip in the corner always counts
 * what cannot be seen and turns the globe to it; onView tells the caller which
 * boxes are hidden so a list beside the globe can say so too.
 */
(function (root) {
  'use strict';
  var d3 = root.d3;
  var TIER_SCALE = { 3: 1.3, 2: 1.15, 1: 1.0, 0: 0.82 };
  var CLUSTER_PX = 18;
  var MAX_ZOOM = 8;          // ~20-25 degrees across: a country, not a county
  var COUNTRY_ZOOM = 4;      // where a picked box is flown to
  var reduceMotion = false;
  try { reduceMotion = root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

  var CSS = '' +
    '.fhg{position:relative;user-select:none;-webkit-user-select:none}' +
    '.fhg svg{display:block;width:100%;height:auto;cursor:grab;touch-action:none}' +
    '.fhg svg.drag{cursor:grabbing}' +
    '.fhg svg:focus{outline:none}.fhg svg:focus-visible{outline:2px solid var(--sb-active,#F9A825);outline-offset:-2px}' +
    '.fhg-pt,.fhg-cl{cursor:pointer}.fhg-pt:focus,.fhg-cl:focus{outline:none}' +
    '.fhg-pt:focus-visible polygon,.fhg-cl:focus-visible polygon{stroke:var(--sb-active,#F9A825);stroke-width:3}' +
    '.fhg-far,.fhg-closer{display:inline-flex;gap:6px;align-items:center;font:600 12px/1.4 system-ui,sans-serif;' +
      'border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--ink,#222);border-radius:999px;padding:4px 11px;cursor:pointer}' +
    '.fhg-far{position:absolute;left:12px;bottom:12px}' +
    '.fhg-closer{position:absolute;left:50%;top:12px;transform:translateX(-50%)}' +
    '.fhg-far:hover,.fhg-closer:hover{border-color:var(--brand,#1B5E4B)}.fhg-far[hidden],.fhg-closer[hidden]{display:none}' +
    '.fhg-zoom{position:absolute;right:12px;top:12px;display:flex;flex-direction:column;border:1px solid var(--line,#ddd);border-radius:8px;overflow:hidden;background:var(--surface,#fff)}' +
    '.fhg-zoom button{border:0;background:none;width:32px;height:30px;font:600 16px/1 system-ui,sans-serif;color:var(--ink,#222);cursor:pointer}' +
    '.fhg-zoom button+button{border-top:1px solid var(--line,#ddd)}' +
    '.fhg-zoom button:disabled{color:var(--faint,#aaa);cursor:default}' +
    '.fhg-zoom button:not(:disabled):hover{background:var(--surface-2,#f0ede8)}' +
    '.fhg-hint{position:absolute;right:12px;bottom:12px;font:12px/1.4 system-ui,sans-serif;color:var(--faint,#999);text-align:right;max-width:46%}' +
    '.fhg-narrow .fhg-hint{position:static;max-width:none;text-align:center;padding:2px 8px 6px}' +
    '.fhg-narrow .fhg-far:not([hidden]){position:static;margin:4px auto 0;display:flex;width:max-content}';

  function injectCss() {
    if (document.getElementById('fhg-css')) return;
    var s = document.createElement('style'); s.id = 'fhg-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hexPts(cx, cy, r) {
    var o = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i - 90); o.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); }
    return o.join(' ');
  }
  /* Mean of unit vectors: the honest "middle" of points on a sphere. */
  function sphericalCentroid(pts) {
    var x = 0, y = 0, z = 0;
    pts.forEach(function (p) {
      var la = p.lat * Math.PI / 180, lo = p.lon * Math.PI / 180;
      x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
    });
    return { lon: Math.atan2(y, x) * 180 / Math.PI, lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI };
  }
  function clampZoom(k) { return Math.max(1, Math.min(MAX_ZOOM, k)); }

  function mount(host, o) {
    injectCss();
    var centre = { lon: (o.centre && o.centre.lon) || 0, lat: (o.centre && o.centre.lat) || 20 };
    var zoom = clampZoom(o.zoom || 1);
    var byId = {}; o.points.forEach(function (p) { byId[p.id] = p; });
    var countryCentroids = (o.countries || []).map(function (f) { return { f: f, c: d3.geoCentroid(f), name: (f.properties && f.properties.name) || '' }; });
    host.classList.add('fhg');
    host.innerHTML = '<svg tabindex="0" role="application" aria-roledescription="globe" ' +
      'aria-label="Globe of box locations. Arrow keys turn it, plus and minus zoom to country level; Tab moves between boxes."></svg>' +
      '<div class="fhg-zoom" role="group" aria-label="Zoom">' +
        '<button type="button" data-z="in" aria-label="Zoom in">+</button>' +
        '<button type="button" data-z="out" aria-label="Zoom out">−</button>' +
        '<button type="button" data-z="world" aria-label="Whole world" title="Whole world" style="font-size:13px">⟲</button></div>' +
      '<button type="button" class="fhg-closer" hidden>Closer than country level → open the flat map</button>' +
      '<button type="button" class="fhg-far" hidden></button>' +
      '<div class="fhg-hint">' + esc(o.hint || 'Drag to turn · scroll or +/− to zoom to a country · pick a box or group') + '</div>';
    var svg = host.querySelector('svg'), far = host.querySelector('.fhg-far'), closer = host.querySelector('.fhg-closer');
    var zin = host.querySelector('[data-z="in"]'), zout = host.querySelector('[data-z="out"]');
    var W = 0, H = 0, R0 = 0, raf = 0, anim = 0, hidden = [], visibleIds = [], lastHiddenKey = null;

    function size() {
      W = Math.max(280, host.clientWidth || 640);
      H = Math.round(Math.min(W * (W < 560 ? 0.92 : 0.62), 480));
      R0 = Math.min(W, H) / 2 - 10;
      host.classList.toggle('fhg-narrow', W < 560);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }

    function render() {
      raf = 0;
      var R = R0 * zoom;
      var proj = d3.geoOrthographic().scale(R).translate([W / 2, H / 2])
        .rotate([-centre.lon, -centre.lat]).clipAngle(90).precision(zoom > 3 ? 0.3 : 0.6);
      var path = d3.geoPath(proj);
      var c = [centre.lon, centre.lat];
      var s = '<defs>' +
        '<radialGradient id="fhg-shade" cx="38%" cy="32%" r="72%">' +
          '<stop offset="0" stop-color="#fff" stop-opacity=".22"/>' +
          '<stop offset=".62" stop-color="#fff" stop-opacity="0"/>' +
          '<stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>' +
        '<marker id="fhg-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
          '<path d="M0,0 L8,4 L0,8 z" fill="context-stroke"/></marker></defs>';
      s += '<path d="' + path({ type: 'Sphere' }) + '" fill="var(--globe-sea,#E3EEF3)"/>';
      s += '<path d="' + (path(zoom > 3 ? d3.geoGraticule().step([5, 5])() : d3.geoGraticule10()) || '') + '" fill="none" stroke="var(--globe-grat,rgba(0,0,0,.07))" stroke-width=".6"/>';
      s += '<path d="' + (path(o.land) || '') + '" fill="var(--globe-land,#D9D3C4)" stroke="var(--globe-land-line,#C4BDAB)" stroke-width=".6"/>';
      /* Borders fade in as the globe comes closer: at world scale they are noise. */
      if (o.borders && zoom >= 1.6) {
        s += '<path d="' + (path(o.borders) || '') + '" fill="none" stroke="var(--globe-land-line,#C4BDAB)" stroke-width="' + (zoom > 3 ? 1 : .7) + '" stroke-opacity="' + Math.min(1, (zoom - 1.4) / 1.4).toFixed(2) + '"/>';
      }

      /* Links are LineStrings, so d3 draws them as GREAT CIRCLES and clips
         them at the horizon for free — the flat map can't do either honestly. */
      (o.links || []).forEach(function (l) {
        var a = byId[l.from], b = byId[l.to]; if (!a || !b) return;
        var d = path({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] });
        if (!d) return;
        s += '<path d="' + d + '" fill="none" stroke="' + l.color + '" stroke-width="' + (l.width || 2) + '"' +
          (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + (l.arrow === false ? '' : ' marker-end="url(#fhg-ar)"') +
          ' opacity="' + (l.opacity || 0.9) + '" stroke-linecap="round"><title>' + esc(l.title || '') + '</title></path>';
      });
      if (zoom < 1.8) s += '<path d="' + path({ type: 'Sphere' }) + '" fill="url(#fhg-shade)" pointer-events="none"/>';
      s += '<path d="' + path({ type: 'Sphere' }) + '" fill="none" stroke="var(--line-strong,#CFCBC3)" stroke-width="1"/>';

      /* Visible points, then greedy clustering in SCREEN space: a group is
         whatever would overlap at this zoom. Zooming in splits groups; a group
         that stays together at country level is opened on the flat map. */
      var vis = [], hid = [];
      o.points.forEach(function (p) {
        if (d3.geoDistance([p.lon, p.lat], c) < Math.PI / 2 - 0.03) {
          var xy = proj([p.lon, p.lat]);
          if (xy[0] < -40 || xy[0] > W + 40 || xy[1] < -40 || xy[1] > H + 40) hid.push(p);   // off-screen when zoomed
          else vis.push({ p: p, x: xy[0], y: xy[1] });
        } else hid.push(p);
      });
      hidden = hid; visibleIds = vis.map(function (v) { return v.p.id; });
      vis.sort(function (a, b) { return (b.p.tier - a.p.tier) || (b.p.self ? 1 : 0) - (a.p.self ? 1 : 0); });
      var groups = [];
      vis.forEach(function (v) {
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (Math.hypot(g.x - v.x, g.y - v.y) < CLUSTER_PX) { g.m.push(v); return; }
        }
        groups.push({ x: v.x, y: v.y, m: [v] });
      });

      var taken = [], labels = [];
      groups.forEach(function (g) {
        var gr = g.m.length === 1 ? 9 * (TIER_SCALE[g.m[0].p.tier] || 1) + 2 : 15;
        taken.push({ x: g.x - gr, y: g.y - gr, x2: g.x + gr, y2: g.y + gr + (g.m.length === 1 ? 8 : 0) });
      });
      groups.forEach(function (g) {
        if (g.m.length === 1) {
          var v = g.m[0], r1 = 9 * (TIER_SCALE[v.p.tier] || 1);
          s += pin(v);
          labels.push({ x: v.x, y: v.y, r: r1, text: v.p.label, pri: (v.p.id === o.selected ? 3 : 0) + v.p.tier });
          return;
        }
        var ids = g.m.map(function (v) { return v.p.id; });
        var off = g.m.filter(function (v) { return !v.p.on; }).length;
        var sel = ids.indexOf(o.selected) >= 0;
        var names = g.m.map(function (v) { return v.p.label; }).join(', ');
        s += '<g class="fhg-cl" tabindex="0" role="button" data-gcl="' + esc(ids.join(',')) + '" aria-label="Group of ' + ids.length +
          ' boxes: ' + esc(names) + '.">' +
          '<title>' + esc(names) + '</title>' +
          '<polygon points="' + hexPts(g.x, g.y, 14) + '" fill="var(--brand,#1B5E4B)" stroke="' + (sel ? 'var(--sb-active,#F9A825)' : 'var(--surface,#fff)') + '" stroke-width="' + (sel ? 3 : 2) + '"/>' +
          '<text x="' + g.x + '" y="' + (g.y + 4) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + ids.length + '</text>' +
          (off ? '<circle cx="' + (g.x + 12) + '" cy="' + (g.y - 11) + '" r="7" fill="var(--off,#9C9A93)" stroke="var(--surface,#fff)" stroke-width="1.5"/>' +
                 '<text x="' + (g.x + 12) + '" y="' + (g.y - 7.8) + '" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff">' + off + '</text>' : '') +
          '</g>';
        labels.push({ x: g.x, y: g.y, r: 15, text: ids.length + ' boxes' + (off ? ' · ' + off + ' offline' : ''), pri: 5, below: true });
      });
      s += placeLabels(labels, taken, 'var(--dim,#73726C)', 10.5);

      /* Country names only once the globe is close enough to read them, and
         only where they do not collide with a box or its label. */
      if (zoom >= 2.4 && countryCentroids.length) {
        var names2 = [];
        countryCentroids.forEach(function (cc) {
          if (d3.geoDistance(cc.c, c) > Math.PI / 2 - 0.1) return;
          var a = path.area(cc.f); if (a < 2500) return;
          var xy = proj(cc.c); if (!xy) return;
          names2.push({ x: xy[0], y: xy[1], r: 0, text: cc.name, pri: a, centre: true });
        });
        s += placeLabels(names2, taken, 'var(--faint,#A09E97)', 10, true);
      }
      svg.innerHTML = s;

      if (hid.length) {
        var hoff = hid.filter(function (p) { return !p.on; }).length;
        far.hidden = false;
        far.textContent = '↻ ' + hid.length + ' out of view' + (hoff ? ' · ' + hoff + ' offline' : '');
        far.title = hid.map(function (p) { return p.label; }).join(', ');
      } else far.hidden = true;
      closer.hidden = o.closer === false || zoom < MAX_ZOOM - 0.01 || !visibleIds.length;
      zin.disabled = zoom >= MAX_ZOOM - 0.01; zout.disabled = zoom <= 1.001;

      var key = hid.map(function (p) { return p.id; }).sort().join(',');
      if (key !== lastHiddenKey) { lastHiddenKey = key; if (o.onView) o.onView(hid.map(function (p) { return p.id; })); }
    }

    function pin(v) {
      var p = v.p, r = 9 * (TIER_SCALE[p.tier] || 1), sel = p.id === o.selected;
      var stroke = sel ? 'var(--sb-active,#F9A825)' : (p.on || p.self ? 'var(--ok,#0F6E56)' : 'var(--mod-unmeasured,#BBB)');
      var st = o.status === false ? '' : (p.on ? ' · online' : ' · offline');
      var g = '<g class="fhg-pt" tabindex="0" role="button" data-gpt="' + esc(p.id) + '" aria-label="' + esc(p.label) + st.replace(' ·', ',') + '">' +
        '<title>' + esc(p.label + (p.name ? ' · ' + p.name : '') + st) + '</title>' +
        '<polygon points="' + hexPts(v.x, v.y, r) + '" fill="' + (p.self ? 'var(--fhb-teal,#1B5E4B)' : 'var(--surface,#fff)') + '" stroke="' + stroke + '" stroke-width="' + (sel ? 3 : 2) + '"' +
          (p.on || p.self ? '' : ' stroke-dasharray="3 2"') + '/>' +
        '<text x="' + v.x + '" y="' + (v.y + 3.4) + '" text-anchor="middle" font-size="' + (r > 10 ? 9 : 8) + '" font-weight="700" fill="' + (p.self ? '#fff' : (p.on ? 'var(--ink,#2C2C2A)' : 'var(--faint,#A09E97)')) + '">' + esc(p.short) + '</text>';
      (p.planes || []).forEach(function (pl, i, all) {
        var px = v.x - (all.length - 1) * 4 + i * 8, py = v.y + r + 5;
        g += '<circle cx="' + px + '" cy="' + py + '" r="3" fill="' + (pl[1] ? pl[0] : 'var(--surface,#fff)') + '" stroke="' + pl[0] + '" stroke-width="1.4"/>';
      });
      return g + '</g>';
    }

    /* Labels never overlap a glyph or each other. Each tries right, left,
       below, above (or only its centre, for country names); if none is free it
       is dropped and the tooltip keeps it. */
    function placeLabels(list, taken, colour, size, italic) {
      var out = '';
      list.sort(function (a, b) { return b.pri - a.pri; });
      list.forEach(function (l) {
        var w = l.text.length * size * 0.57 + 4, h = size + 3;
        var tries = l.centre ? [{ x: l.x, y: l.y + 4, a: 'middle' }] : [
          { x: l.x + l.r + 5, y: l.y + 4, a: 'start' }, { x: l.x - l.r - 5, y: l.y + 4, a: 'end' },
          { x: l.x, y: l.y + l.r + 16, a: 'middle' }, { x: l.x, y: l.y - l.r - 7, a: 'middle' }];
        if (l.below) tries.unshift(tries.splice(2, 1)[0]);
        for (var i = 0; i < tries.length; i++) {
          var t = tries[i], x0 = t.a === 'start' ? t.x : t.a === 'end' ? t.x - w : t.x - w / 2;
          var box = { x: x0, y: t.y - h + 3, x2: x0 + w, y2: t.y + 3 };
          if (box.x < 2 || box.x2 > W - 2 || box.y < 2 || box.y2 > H - 2) continue;
          if (taken.some(function (b) { return box.x < b.x2 && box.x2 > b.x && box.y < b.y2 && box.y2 > b.y; })) continue;
          taken.push(box);
          out += '<text x="' + t.x.toFixed(1) + '" y="' + t.y.toFixed(1) + '" text-anchor="' + t.a + '" font-size="' + size + '" fill="' + colour + '"' +
            (italic ? ' font-style="italic" letter-spacing=".3"' : '') +
            ' paint-order="stroke" stroke="var(--globe-land,#D9D3C4)" stroke-width="' + (italic ? 2.5 : 3) + '" stroke-opacity="' + (italic ? .8 : 1) + '" pointer-events="none">' + esc(l.text) + '</text>';
          return;
        }
      });
      return out;
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(render); }
    function notify() { if (o.onRotate) o.onRotate({ lon: centre.lon, lat: centre.lat, zoom: zoom }); }
    function setView(lon, lat, k) {
      centre.lon = ((lon + 540) % 360) - 180;
      centre.lat = Math.max(-80, Math.min(80, lat));
      if (k != null) zoom = clampZoom(k);
      schedule(); notify();
    }
    /* Fly: turn and zoom together. Zoom is interpolated in log space so the
       motion feels even from world to country. */
    function flyTo(lon, lat, k) {
      cancelAnimationFrame(anim);
      var k1 = k == null ? zoom : clampZoom(k);
      if (reduceMotion) { setView(lon, lat, k1); return; }
      var interp = d3.geoInterpolate([centre.lon, centre.lat], [lon, lat]), z0 = Math.log(zoom), z1 = Math.log(k1);
      var t0 = performance.now(), dur = 750;
      (function step(now) {
        var t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var q = interp(e); setView(q[0], q[1], Math.exp(z0 + (z1 - z0) * e));
        if (t < 1) anim = requestAnimationFrame(step);
      })(t0);
    }
    function zoomBy(f) { flyTo(centre.lon, centre.lat, zoom * f); }

    /* Drag turns the globe; wheel and pinch zoom, but only to country level. */
    var ptrs = {}, drag = null, pinch = null, moved = false;
    svg.addEventListener('pointerdown', function (e) {
      cancelAnimationFrame(anim);
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      var ids = Object.keys(ptrs);
      if (ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: zoom }; drag = null; moved = true;
      } else {
        drag = { x: e.clientX, y: e.clientY, lon: centre.lon, lat: centre.lat,
                 k: 180 / (Math.PI * R0 * zoom) * (W / svg.getBoundingClientRect().width) };
        moved = false;
      }
    });
    svg.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ptrs);
      if (pinch && ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        setView(centre.lon, centre.lat, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d));
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true; svg.classList.add('drag');
      setView(drag.lon - dx * drag.k, drag.lat + dy * drag.k);
    });
    function endPtr(e) {
      var wasTap = drag && !moved && Object.keys(ptrs).length === 1;
      delete ptrs[e.pointerId];
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      if (Object.keys(ptrs).length < 2) pinch = null;
      if (!Object.keys(ptrs).length) { drag = null; svg.classList.remove('drag'); }
      if (wasTap && e.type === 'pointerup') activate(document.elementFromPoint(e.clientX, e.clientY));
    }
    svg.addEventListener('pointerup', endPtr);
    svg.addEventListener('pointercancel', endPtr);
    svg.addEventListener('wheel', function (e) {
      var k = clampZoom(zoom * Math.exp(-e.deltaY * 0.0015));
      if (k === zoom) return;          // at a limit: let the page scroll
      e.preventDefault(); cancelAnimationFrame(anim); setView(centre.lon, centre.lat, k);
    }, { passive: false });

    /* A group that zooming can split is zoomed into; one that stays together
       even at country level (boxes sharing a coarse centroid) opens the flat map. */
    function openGroup(ids) {
      var m = ids.map(function (id) { return byId[id]; }).filter(Boolean);
      var spread = 0;
      for (var i = 0; i < m.length; i++) for (var j = i + 1; j < m.length; j++)
        spread = Math.max(spread, d3.geoDistance([m[i].lon, m[i].lat], [m[j].lon, m[j].lat]));
      var needK = spread > 0 ? (CLUSTER_PX * 1.5) / (spread * R0) : Infinity;
      if (needK <= MAX_ZOOM && zoom < MAX_ZOOM - 0.01) {
        var mid = sphericalCentroid(m); flyTo(mid.lon, mid.lat, Math.max(needK, zoom * 1.5));
      } else if (o.onOpenFlat) o.onOpenFlat(ids);
    }
    function activate(el) {
      var t = el && el.closest && el.closest('[data-gpt],[data-gcl]');
      if (!t) return;
      if (t.dataset.gpt) { if (o.onSelect) o.onSelect(t.dataset.gpt); }
      else openGroup(t.dataset.gcl.split(','));
    }
    svg.addEventListener('keydown', function (e) {
      var step = 15 / zoom;
      var k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step * .8], ArrowDown: [0, -step * .8] }[e.key];
      if (k && e.target === svg) { e.preventDefault(); flyTo(centre.lon + k[0], centre.lat + k[1]); return; }
      if ((e.key === '+' || e.key === '=') ) { e.preventDefault(); zoomBy(1.6); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.6); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-gpt],[data-gcl]')) { e.preventDefault(); activate(e.target); }
    });
    host.querySelector('.fhg-zoom').addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]'); if (!b) return;
      if (b.dataset.z === 'in') zoomBy(1.6);
      else if (b.dataset.z === 'out') zoomBy(1 / 1.6);
      else flyTo(centre.lon, centre.lat, 1);
    });
    far.addEventListener('click', function () {
      if (!hidden.length) return;
      var m = sphericalCentroid(hidden);
      // pull back far enough to see them: if they are spread wide, go to world view
      var spread = 0; hidden.forEach(function (p) { spread = Math.max(spread, d3.geoDistance([p.lon, p.lat], [m.lon, m.lat])); });
      flyTo(m.lon, m.lat, spread > 0.35 ? 1 : Math.min(zoom, COUNTRY_ZOOM));
    });
    closer.addEventListener('click', function () { if (o.onOpenFlat && visibleIds.length) o.onOpenFlat(visibleIds.slice()); });

    var ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(function () { size(); schedule(); }); ro.observe(host); }
    size(); render();
    return {
      flyTo: flyTo, rotateTo: flyTo, zoomBy: zoomBy,
      destroy: function () { cancelAnimationFrame(anim); cancelAnimationFrame(raf); if (ro) ro.disconnect(); host.innerHTML = ''; }
    };
  }

  root.FHGlobe = { mount: mount, sphericalCentroid: sphericalCentroid, hexPts: hexPts, COUNTRY_ZOOM: COUNTRY_ZOOM, MAX_ZOOM: MAX_ZOOM };
})(window);
