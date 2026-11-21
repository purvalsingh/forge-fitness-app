// Landing-page language switch: same dictionaries as the app (/app/i18n/<code>.json, keyed by the English text).
(function () {
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'], dict = {}, orig = new WeakMap(), origAttr = new WeakMap();
  function tr(s) { var c = s.trim(); return c && dict[c] ? s.replace(c, dict[c]) : null }
  function walk(n) {
    if (n.nodeType === 3) {
      if (!n.parentElement || n.parentElement.closest('script,style,[data-no-i18n]')) return;
      if (!orig.has(n)) orig.set(n, n.nodeValue);
      var b = orig.get(n), o = tr(b); n.nodeValue = o == null ? b : o; return;
    }
    if (n.nodeType !== 1 || n.closest('script,style,[data-no-i18n]')) return;
    var saved = origAttr.get(n) || {};
    ATTRS.forEach(function (a) { var v = n.getAttribute(a); if (v == null) return; if (!(a in saved)) saved[a] = v; var o = tr(saved[a]); n.setAttribute(a, o == null ? saved[a] : o) });
    origAttr.set(n, saved);
    n.childNodes.forEach(walk);
  }
  function set(code) {
    try { localStorage.setItem('forge:lang', code) } catch (e) {}
    document.documentElement.lang = code;
    var done = function (d) { dict = d || {}; walk(document.body) };
    if (code === 'en') return done({});
    fetch('/app/i18n/' + code + '.json').then(function (r) { return r.json() }).then(done, function () { done({}) });
  }
  var sel = document.getElementById('lang');
  var cur = 'en'; try { cur = localStorage.getItem('forge:lang') || 'en' } catch (e) {}
  if (sel) { sel.value = cur; sel.addEventListener('change', function () { set(sel.value) }) }
  if (cur !== 'en') set(cur);
})();
