/* PokéVault — shared site logic (vanilla JS, works from file://) */
(function () {
  "use strict";

  var LISTINGS = window.LISTINGS || [];
  var CART_KEY = "pokevault-cart-v1";

  /* ---------- Helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var money = (function () {
    try {
      var f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
      return function (n) { return f.format(n); };
    } catch (e) { return function (n) { return "$" + Number(n).toFixed(2); }; }
  })();
  function getListing(id) {
    for (var i = 0; i < LISTINGS.length; i++) if (LISTINGS[i].id === id) return LISTINGS[i];
    return null;
  }
  function rarityBadge(r) { return '<span class="badge badge-rarity rarity-' + slug(r) + '">' + esc(r) + "</span>"; }
  function condBadge(c) { return '<span class="badge cond-' + slug(c) + '" title="Condition: ' + esc(c) + '">' + esc(c) + "</span>"; }

  /* Placeholder art if an image fails to load */
  function placeholderSVG(name) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 342">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFCB05"/><stop offset="1" stop-color="#EE1515"/></linearGradient></defs>' +
      '<rect x="4" y="4" width="237" height="334" rx="14" fill="url(#g)" stroke="#14213D" stroke-width="6"/>' +
      '<rect x="20" y="44" width="205" height="150" rx="6" fill="#3B4CCA"/>' +
      '<circle cx="122" cy="119" r="46" fill="#fff" stroke="#14213D" stroke-width="6"/>' +
      '<path d="M76 119h92" stroke="#14213D" stroke-width="6"/><path d="M76 119a46 46 0 0 1 92 0z" fill="#EE1515" stroke="#14213D" stroke-width="6"/>' +
      '<circle cx="122" cy="119" r="13" fill="#fff" stroke="#14213D" stroke-width="6"/>' +
      '<text x="122" y="235" font-family="Arial,sans-serif" font-size="17" font-weight="bold" fill="#14213D" text-anchor="middle">' +
      esc(name).slice(0, 26) + "</text>" +
      '<text x="122" y="262" font-family="Arial,sans-serif" font-size="12" fill="#14213D" text-anchor="middle">Image unavailable</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function attachImgFallbacks(ctx) {
    $all("img[data-fallback]", ctx).forEach(function (img) {
      if (img._fb) return;
      img._fb = true;
      function fail() { img.onerror = null; img.src = placeholderSVG(img.getAttribute("data-fallback")); }
      img.addEventListener("error", fail);
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) fail();
    });
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast"; t.className = "toast";
      t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- Cart (localStorage) ---------- */
  var memoryCart = [];
  function readCart() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      var c = raw ? JSON.parse(raw) : [];
      return Array.isArray(c) ? c.filter(function (i) { return getListing(i.id); }) : [];
    } catch (e) { return memoryCart.slice(); }
  }
  function writeCart(c) {
    memoryCart = c.slice();
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) { /* storage unavailable */ }
    updateBadge(true);
    document.dispatchEvent(new CustomEvent("cart:change"));
  }
  function cartCount() { return readCart().reduce(function (s, i) { return s + i.qty; }, 0); }
  function addToCart(id, qty) {
    var item = getListing(id); if (!item) return;
    qty = Math.max(1, parseInt(qty, 10) || 1);
    var c = readCart(), found = false;
    c.forEach(function (i) { if (i.id === id) { i.qty = Math.min(10, i.qty + qty); found = true; } });
    if (!found) c.push({ id: id, qty: Math.min(10, qty) });
    writeCart(c);
    toast("Added " + item.name + " to your cart");
  }
  function setQty(id, qty) {
    qty = parseInt(qty, 10);
    var c = readCart();
    if (!qty || qty < 1) c = c.filter(function (i) { return i.id !== id; });
    else c.forEach(function (i) { if (i.id === id) i.qty = Math.min(10, qty); });
    writeCart(c);
  }
  function removeFromCart(id) { writeCart(readCart().filter(function (i) { return i.id !== id; })); }
  function cartSubtotal() {
    return readCart().reduce(function (s, i) { var l = getListing(i.id); return s + (l ? l.price * i.qty : 0); }, 0);
  }
  function updateBadge(bump) {
    var n = cartCount();
    $all(".cart-badge").forEach(function (b) {
      b.textContent = n;
      b.setAttribute("aria-label", n + (n === 1 ? " item" : " items") + " in cart");
      if (bump) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
    });
  }
  window.addEventListener("storage", function (e) { if (e.key === CART_KEY) updateBadge(false); });

  /* ---------- Listing card markup ---------- */
  function cardHTML(l) {
    var url = "product.html?id=" + encodeURIComponent(l.id);
    return '<article class="listing">' +
      '<a class="listing-media" href="' + url + '" tabindex="-1" aria-hidden="true">' +
        rarityBadge(l.rarity) +
        '<img src="' + esc(l.image) + '" alt="' + esc(l.name + " – " + l.set + " card") + '" loading="lazy" width="245" height="342" data-fallback="' + esc(l.name) + '">' +
      "</a>" +
      '<div class="listing-body">' +
        '<h3 class="listing-title"><a href="' + url + '">' + esc(l.name) + "</a></h3>" +
        '<p class="listing-set">' + esc(l.set) + " · #" + esc(l.number) + "</p>" +
        '<div class="listing-meta"><span class="price">' + money(l.price) + "</span>" + condBadge(l.condition) + "</div>" +
        '<div class="listing-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-add="' + esc(l.id) + '" aria-label="Add ' + esc(l.name) + ' to cart">Add to cart</button>' +
          '<a class="btn btn-outline btn-sm" href="' + url + '" aria-label="View details for ' + esc(l.name) + '">Details</a>' +
        "</div>" +
      "</div></article>";
  }
  function renderGrid(container, list) {
    container.innerHTML = list.map(cardHTML).join("");
    attachImgFallbacks(container);
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-add]");
    if (btn) { e.preventDefault(); addToCart(btn.getAttribute("data-add"), 1); }
  });

  /* ---------- Modal ---------- */
  var lastFocus = null;
  function openModal(title, bodyHTML, onReady) {
    closeModal();
    lastFocus = document.activeElement;
    var m = document.createElement("div");
    m.className = "modal open"; m.id = "modal";
    m.innerHTML = '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<button type="button" class="modal-close" data-close aria-label="Close dialog">&times;</button>' +
      '<h2 id="modal-title">' + esc(title) + "</h2>" + bodyHTML + "</div>";
    document.body.appendChild(m);
    document.body.style.overflow = "hidden";
    m.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) closeModal(); });
    m.addEventListener("keydown", trapFocus);
    var first = m.querySelector("input, textarea, button:not(.modal-close)") || m.querySelector(".modal-close");
    if (first) first.focus();
    if (onReady) onReady(m);
  }
  function closeModal() {
    var m = $("#modal");
    if (!m) return;
    m.parentNode.removeChild(m);
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function trapFocus(e) {
    if (e.key === "Escape") { closeModal(); return; }
    if (e.key !== "Tab") return;
    var f = $all('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', $("#modal .modal-dialog"))
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- Forms (validation, no network) ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function field(id, label, type, value, extra) {
    var input = type === "textarea"
      ? '<textarea id="' + id + '" name="' + id + '" rows="5" ' + (extra || "") + ">" + esc(value || "") + "</textarea>"
      : '<input id="' + id + '" name="' + id + '" type="' + type + '" value="' + esc(value || "") + '" ' + (extra || "") + ">";
    return '<div class="form-field"><label for="' + id + '">' + label + "</label>" + input +
      '<span class="error" id="' + id + '-error" aria-live="polite"></span></div>';
  }
  function validate(form) {
    var ok = true, firstBad = null;
    $all("[data-required]", form).forEach(function (el) {
      var msg = "", v = el.value.trim();
      var min = parseInt(el.getAttribute("data-min") || "0", 10);
      if (!v) msg = "This field is required.";
      else if (el.type === "email" && !EMAIL_RE.test(v)) msg = "Please enter a valid email address.";
      else if (min && v.length < min) msg = "Please enter at least " + min + " characters.";
      var wrap = el.closest(".form-field"), err = $("#" + el.id + "-error");
      if (wrap) wrap.classList.toggle("invalid", !!msg);
      if (err) err.textContent = msg;
      el.setAttribute("aria-invalid", msg ? "true" : "false");
      el.setAttribute("aria-describedby", el.id + "-error");
      if (msg) { ok = false; if (!firstBad) firstBad = el; }
    });
    if (firstBad) firstBad.focus();
    return ok;
  }
  function successHTML(title, text) {
    return '<div class="success-box" role="status"><div class="big" aria-hidden="true">✅</div><h3>' + esc(title) +
      "</h3><p>" + text + '</p><p class="note">Demo site: nothing was sent. In a live shop, this request would reach the seller.</p>' +
      '<button type="button" class="btn btn-primary" data-close>Done</button></div>';
  }

  function openContactSeller(listing) {
    var subject = listing ? listing.name + " (" + listing.set + ", " + listing.condition + ")" : "";
    var body =
      (listing ? '<p class="listing-set">Asking about: <strong>' + esc(listing.name) + "</strong> · " + money(listing.price) + "</p>" : "") +
      '<form id="contact-form" novalidate>' +
      field("cs-name", "Your name", "text", "", 'data-required autocomplete="name"') +
      field("cs-email", "Email", "email", "", 'data-required autocomplete="email"') +
      field("cs-card", "Card", "text", subject, "data-required") +
      field("cs-message", "Message", "textarea",
        listing ? "Hi! I'm interested in the " + listing.name + " from " + listing.set + ". Is it still available? Could you share extra photos of the front and back?" : "",
        'data-required data-min="10"') +
      '<button type="submit" class="btn btn-red btn-block">Send message to seller</button></form>';
    openModal("Contact the seller", body, function (m) {
      $("#contact-form", m).addEventListener("submit", function (e) {
        e.preventDefault();
        if (!validate(e.target)) return;
        var name = $("#cs-name", m).value.trim().split(" ")[0];
        $(".modal-dialog", m).innerHTML = '<button type="button" class="modal-close" data-close aria-label="Close dialog">&times;</button>' +
          '<h2 id="modal-title">Message sent!</h2>' +
          successHTML("Thanks, " + name + "!", "Your question about <strong>" + esc($("#cs-card", m).value) + "</strong> has been received. The seller usually replies within 24 hours.");
        $(".success-box .btn", m).focus();
      });
    });
  }

  function openCheckout() {
    var c = readCart();
    if (!c.length) { toast("Your cart is empty"); return; }
    var lines = c.map(function (i) { var l = getListing(i.id); return i.qty + " × " + l.name + " (" + l.set + ")"; });
    var body = '<p class="listing-set">' + c.length + " item type(s) · Subtotal <strong>" + money(cartSubtotal()) + "</strong></p>" +
      '<form id="order-form" novalidate>' +
      field("or-name", "Full name", "text", "", 'data-required autocomplete="name"') +
      field("or-email", "Email", "email", "", 'data-required autocomplete="email"') +
      field("or-message", "Order notes", "textarea", "I'd like to purchase:\n" + lines.join("\n") + "\n\nPlease send me an invoice and shipping options.", 'data-required data-min="10"') +
      '<button type="submit" class="btn btn-red btn-block">Submit order request</button></form>';
    openModal("Request your order", body, function (m) {
      $("#order-form", m).addEventListener("submit", function (e) {
        e.preventDefault();
        if (!validate(e.target)) return;
        var ref = "PV-" + Date.now().toString(36).toUpperCase().slice(-6);
        var name = $("#or-name", m).value.trim().split(" ")[0];
        var email = $("#or-email", m).value.trim();
        writeCart([]);
        $(".modal-dialog", m).innerHTML = '<button type="button" class="modal-close" data-close aria-label="Close dialog">&times;</button>' +
          '<h2 id="modal-title">Order request received</h2>' +
          successHTML("Thanks, " + name + "!", "Reference <strong>" + ref + "</strong>. We'll email an invoice to <strong>" + esc(email) + "</strong> once your cards are reserved.");
        $(".success-box .btn", m).focus();
      });
    });
  }

  /* ---------- Nav ---------- */
  function initNav() {
    var toggle = $(".nav-toggle"), nav = $("#main-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && nav.classList.contains("open")) { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
      });
    }
    $all("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
    $all("[data-contact-general]").forEach(function (b) { b.addEventListener("click", function () { openContactSeller(null); }); });
    updateBadge(false);
  }

  /* ---------- Home ---------- */
  function initHome() {
    var grid = $("#featured-grid");
    if (grid) renderGrid(grid, LISTINGS.filter(function (l) { return l.featured; }).slice(0, 6));
    var stat = $("#stat-count"); if (stat) stat.textContent = LISTINGS.length;
    var form = $("#hero-search");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = $("#hero-q").value.trim();
      window.location.href = "shop.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

  /* ---------- Shop ---------- */
  function initShop() {
    var grid = $("#shop-grid"); if (!grid) return;
    var sets = [], prices = LISTINGS.map(function (l) { return l.price; });
    LISTINGS.forEach(function (l) { if (sets.indexOf(l.set) < 0) sets.push(l.set); });
    var maxPrice = Math.ceil(Math.max.apply(null, prices) / 10) * 10; // multiple of slider step

    var setSel = $("#f-set");
    sets.sort().forEach(function (s) { var o = document.createElement("option"); o.value = s; o.textContent = s; setSel.appendChild(o); });
    function checkboxes(container, name, values) {
      container.innerHTML = values.map(function (v, i) {
        return '<label><input type="checkbox" name="' + name + '" value="' + esc(v) + '" id="' + name + "-" + i + '"> ' + esc(v) + "</label>";
      }).join("");
    }
    checkboxes($("#f-rarity"), "rarity", window.RARITIES);
    checkboxes($("#f-condition"), "condition", window.CONDITIONS);
    var minI = $("#f-min"), maxI = $("#f-max"), range = $("#f-range"), rangeOut = $("#f-range-out");
    range.max = maxPrice; range.value = maxPrice; maxI.placeholder = maxPrice;
    rangeOut.textContent = money(maxPrice);

    // Read initial state from URL (?q=&set=)
    var params = new URLSearchParams(window.location.search);
    if (params.get("q")) $("#f-search").value = params.get("q");
    if (params.get("set")) setSel.value = params.get("set");

    function checked(name) { return $all('input[name="' + name + '"]:checked').map(function (i) { return i.value; }); }

    function apply() {
      var q = $("#f-search").value.trim().toLowerCase();
      var set = setSel.value, rar = checked("rarity"), cond = checked("condition");
      var min = parseFloat(minI.value), max = parseFloat(maxI.value);
      var rmax = parseFloat(range.value);
      if (isNaN(min)) min = 0;
      if (isNaN(max)) max = Infinity;
      max = Math.min(max, rmax >= maxPrice ? Infinity : rmax);
      rangeOut.textContent = rmax >= maxPrice ? money(maxPrice) + "+" : money(rmax);

      var out = LISTINGS.filter(function (l) {
        if (q && (l.name + " " + l.set + " " + l.rarity + " " + l.number).toLowerCase().indexOf(q) < 0) return false;
        if (set && l.set !== set) return false;
        if (rar.length && rar.indexOf(l.rarity) < 0) return false;
        if (cond.length && cond.indexOf(l.condition) < 0) return false;
        if (l.price < min || l.price > max) return false;
        return true;
      });
      var sort = $("#f-sort").value;
      out.sort(function (a, b) {
        if (sort === "price-asc") return a.price - b.price;
        if (sort === "price-desc") return b.price - a.price;
        if (sort === "name-asc") return a.name.localeCompare(b.name);
        if (sort === "name-desc") return b.name.localeCompare(a.name);
        return (b.featured - a.featured) || (b.price - a.price);
      });
      var count = $("#result-count");
      count.textContent = "Showing " + out.length + " of " + LISTINGS.length + " listings";
      if (out.length) renderGrid(grid, out);
      else grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="big" aria-hidden="true">🔍</div><h3>No cards match those filters</h3><p>Try widening your price range or clearing a filter.</p><button type="button" class="btn btn-primary" id="empty-clear">Clear filters</button></div>';
      var ec = $("#empty-clear"); if (ec) ec.addEventListener("click", clear);
      var active = (q ? 1 : 0) + (set ? 1 : 0) + rar.length + cond.length + (minI.value ? 1 : 0) + (maxI.value ? 1 : 0) + (rmax < maxPrice ? 1 : 0);
      var ac = $("#active-count"); if (ac) ac.textContent = active ? "(" + active + ")" : "";
    }
    function clear() {
      $("#f-search").value = ""; setSel.value = ""; minI.value = ""; maxI.value = "";
      range.value = maxPrice; $("#f-sort").value = "featured";
      $all('.filters input[type="checkbox"]').forEach(function (c) { c.checked = false; });
      if (window.history && history.replaceState) { try { history.replaceState(null, "", window.location.pathname); } catch (e) {} }
      apply();
    }
    $("#filters").addEventListener("input", apply);
    $("#filters").addEventListener("change", apply);
    $("#f-sort").addEventListener("change", apply);
    $("#f-search").addEventListener("input", apply);
    $("#clear-filters").addEventListener("click", clear);
    $("#filters").addEventListener("submit", function (e) { e.preventDefault(); });
    var ft = $("#filters-toggle");
    if (ft) ft.addEventListener("click", function () {
      var open = $("#filters").classList.toggle("open");
      ft.setAttribute("aria-expanded", open ? "true" : "false");
    });
    apply();
  }

  /* ---------- Product ---------- */
  function initProduct() {
    var root = $("#product-root"); if (!root) return;
    var id = new URLSearchParams(window.location.search).get("id");
    var l = getListing(id);
    if (!l) {
      root.innerHTML = '<div class="empty-state" style="margin:40px 0"><div class="big" aria-hidden="true">❓</div><h1>Card not found</h1><p>That listing may have sold or the link is incorrect.</p><a class="btn btn-primary" href="shop.html">Browse all cards</a></div>';
      return;
    }
    document.title = l.name + " – " + l.set + " | PokéVault";
    $("#crumb-name").textContent = l.name;
    root.innerHTML =
      '<div class="product">' +
        '<div class="product-media"><img src="' + esc(l.imageLarge || l.image) + '" alt="' + esc(l.name + " from " + l.set + ", card " + l.number) + '" width="600" height="825" data-fallback="' + esc(l.name) + '"></div>' +
        '<div class="product-info">' +
          '<p class="listing-set">' + esc(l.set) + " · " + l.year + "</p>" +
          "<h1>" + esc(l.name) + "</h1>" +
          '<div class="badges">' + rarityBadge(l.rarity) + condBadge(l.condition) + (l.featured ? '<span class="badge" style="background:#FFCB05;color:#14213D">★ Featured</span>' : "") + "</div>" +
          '<span class="price">' + money(l.price) + "</span>" +
          "<p>" + esc(l.description) + "</p>" +
          '<table class="spec-table"><caption class="sr-only">Card details</caption><tbody>' +
            '<tr><th scope="row">Card name</th><td>' + esc(l.name) + "</td></tr>" +
            '<tr><th scope="row">Set</th><td>' + esc(l.set) + "</td></tr>" +
            '<tr><th scope="row">Card number</th><td>' + esc(l.number) + "</td></tr>" +
            '<tr><th scope="row">Release year</th><td>' + l.year + "</td></tr>" +
            '<tr><th scope="row">Rarity</th><td>' + esc(l.rarity) + "</td></tr>" +
            '<tr><th scope="row">Condition</th><td>' + esc(l.condition) + ' <a href="about.html#grading">(guide)</a></td></tr>' +
          "</tbody></table>" +
          '<div class="product-actions">' +
            '<div class="qty" role="group" aria-label="Quantity"><button type="button" id="q-dec" aria-label="Decrease quantity">−</button>' +
            '<input type="number" id="q-val" value="1" min="1" max="10" aria-label="Quantity"><button type="button" id="q-inc" aria-label="Increase quantity">+</button></div>' +
            '<button type="button" class="btn btn-primary" id="p-add">Add to cart</button>' +
            '<button type="button" class="btn btn-blue" id="p-contact">Contact seller</button>' +
          "</div>" +
          '<p class="note">Every card ships sleeved, top-loaded, and in a bubble mailer with tracking. Photos show the actual card style; ask the seller for scans of this exact copy.</p>' +
        "</div></div>";
    attachImgFallbacks(root);
    var qv = $("#q-val");
    function clamp() { var v = parseInt(qv.value, 10) || 1; qv.value = Math.max(1, Math.min(10, v)); }
    $("#q-dec").addEventListener("click", function () { qv.value = (parseInt(qv.value, 10) || 1) - 1; clamp(); });
    $("#q-inc").addEventListener("click", function () { qv.value = (parseInt(qv.value, 10) || 1) + 1; clamp(); });
    qv.addEventListener("change", clamp);
    $("#p-add").addEventListener("click", function () { addToCart(l.id, qv.value); });
    $("#p-contact").addEventListener("click", function () { openContactSeller(l); });

    var related = $("#related-grid");
    if (related) {
      var rel = LISTINGS.filter(function (x) { return x.id !== l.id && (x.set === l.set || x.rarity === l.rarity); }).slice(0, 4);
      if (rel.length) renderGrid(related, rel); else $("#related").style.display = "none";
    }
  }

  /* ---------- Cart page ---------- */
  function initCart() {
    var root = $("#cart-root"); if (!root) return;
    function render() {
      var c = readCart();
      if (!c.length) {
        root.innerHTML = '<div class="empty-state" style="margin:32px 0 60px"><div class="big" aria-hidden="true">🛒</div><h2>Your cart is empty</h2><p>Go catch some cards!</p><a class="btn btn-primary" href="shop.html">Shop listings</a></div>';
        return;
      }
      var sub = cartSubtotal();
      var shipping = sub >= 100 ? 0 : 4.99;
      root.innerHTML = '<div class="cart-layout"><section aria-label="Cart items"><div class="cart-items">' +
        c.map(function (i) {
          var l = getListing(i.id), url = "product.html?id=" + encodeURIComponent(l.id);
          return '<div class="cart-item">' +
            '<a href="' + url + '" tabindex="-1" aria-hidden="true"><img src="' + esc(l.image) + '" alt="" width="80" height="112" data-fallback="' + esc(l.name) + '"></a>' +
            "<div><h3><a href=\"" + url + "\">" + esc(l.name) + "</a></h3>" +
            '<p class="sub">' + esc(l.set) + " · " + esc(l.condition) + " · " + money(l.price) + " each</p>" +
            '<div class="controls"><div class="qty" role="group" aria-label="Quantity for ' + esc(l.name) + '">' +
              '<button type="button" data-dec="' + l.id + '" aria-label="Decrease quantity of ' + esc(l.name) + '">−</button>' +
              '<input type="number" min="1" max="10" value="' + i.qty + '" data-qty="' + l.id + '" aria-label="Quantity of ' + esc(l.name) + '">' +
              '<button type="button" data-inc="' + l.id + '" aria-label="Increase quantity of ' + esc(l.name) + '">+</button></div>' +
              '<button type="button" class="remove-btn" data-remove="' + l.id + '">Remove<span class="sr-only"> ' + esc(l.name) + "</span></button></div></div>" +
            '<div class="line-total">' + money(l.price * i.qty) + "</div></div>";
        }).join("") +
        '</div><p style="margin-top:16px"><a href="shop.html">← Continue shopping</a></p></section>' +
        '<aside class="summary" aria-label="Order summary"><h2 style="font-size:1.2rem">Order summary</h2>' +
          '<div class="summary-row"><span>Items</span><span>' + cartCount() + "</span></div>" +
          '<div class="summary-row"><span>Subtotal</span><span>' + money(sub) + "</span></div>" +
          '<div class="summary-row"><span>Shipping (est.)</span><span>' + (shipping ? money(shipping) : "Free") + "</span></div>" +
          '<div class="summary-row total"><span>Total</span><span>' + money(sub + shipping) + "</span></div>" +
          '<button type="button" class="btn btn-red btn-block" id="checkout-btn" style="margin-top:12px">Checkout</button>' +
          '<p class="note" style="margin-top:14px">Checkout sends an order request; the seller confirms availability and invoices you. Free shipping over $100.</p>' +
          '<button type="button" class="btn btn-ghost btn-block" id="clear-cart">Empty cart</button>' +
        "</aside></div>";
      attachImgFallbacks(root);
    }
    root.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      var id;
      if ((id = t.getAttribute("data-inc"))) { var a = readCart().filter(function (i) { return i.id === id; })[0]; setQty(id, a.qty + 1); }
      else if ((id = t.getAttribute("data-dec"))) { var b = readCart().filter(function (i) { return i.id === id; })[0]; if (b.qty > 1) setQty(id, b.qty - 1); }
      else if ((id = t.getAttribute("data-remove"))) { var n = getListing(id).name; removeFromCart(id); toast("Removed " + n); }
      else if (t.id === "checkout-btn") openCheckout();
      else if (t.id === "clear-cart") { writeCart([]); toast("Cart emptied"); }
    });
    root.addEventListener("change", function (e) {
      var id = e.target.getAttribute("data-qty");
      if (id) setQty(id, Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)));
    });
    document.addEventListener("cart:change", render);
    render();
  }

  /* ---------- Boot ---------- */
  function boot() {
    initNav();
    var page = document.body.getAttribute("data-page");
    if (page === "home") initHome();
    if (page === "shop") initShop();
    if (page === "product") initProduct();
    if (page === "cart") initCart();
    attachImgFallbacks(document);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.PokeVault = { addToCart: addToCart, readCart: readCart, openContactSeller: openContactSeller, openCheckout: openCheckout };
})();
