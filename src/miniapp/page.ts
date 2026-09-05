/**
 * The Mini App shell.
 *
 * Served from this Worker and opened inside Telegram, where
 * `window.Telegram.WebApp` provides the signed `initData` that
 * every API call is authenticated with.
 */
export const MINI_APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AI Conference Deadlines</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: var(--tg-theme-bg-color, #ffffff);
    --text: var(--tg-theme-text-color, #0f172a);
    --hint: var(--tg-theme-hint-color, #8b95a1);
    --card: var(--tg-theme-secondary-bg-color, #f1f3f5);
    --section: var(--tg-theme-section-bg-color, var(--card));
    --accent: var(--tg-theme-link-color, #2f7fed);
    --btn: var(--tg-theme-button-color, #2f7fed);
    --btn-text: var(--tg-theme-button-text-color, #ffffff);
    --danger: #e5484d;
    --line: rgba(128, 138, 150, .22);
    --radius: 14px;
    --pad: 14px;
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  html, body { height: 100%; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI",
      Roboto, Helvetica, Arial, sans-serif;
    overscroll-behavior-y: none;
  }

  /* ---------- header ---------- */

  header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    padding: 10px var(--pad) 0;
    padding-top: calc(10px + var(--tg-safe-area-inset-top, 0px));
    border-bottom: 1px solid var(--line);
  }

  .searchwrap { position: relative; }

  .searchwrap svg {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    fill: var(--hint);
    pointer-events: none;
  }

  #q {
    width: 100%;
    padding: 10px 34px;
    font-size: 16px;
    font-family: inherit;
    color: var(--text);
    background: var(--card);
    border: 1px solid transparent;
    border-radius: 10px;
    outline: none;
    -webkit-appearance: none;
  }

  #q::-webkit-search-cancel-button { display: none; }
  #q:focus { border-color: var(--accent); }

  #clearq {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    font-size: 15px;
    line-height: 1;
    color: var(--hint);
    background: none;
    border: 0;
    cursor: pointer;
  }

  /* segmented control */
  .seg {
    display: flex;
    gap: 2px;
    margin: 10px 0 8px;
    padding: 2px;
    background: var(--card);
    border-radius: 9px;
  }

  .seg button {
    flex: 1;
    padding: 7px 4px;
    font: 600 13px/1 inherit;
    color: var(--hint);
    background: none;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    transition: background .12s, color .12s;
  }

  .seg button[aria-selected="true"] {
    color: var(--text);
    background: var(--bg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, .1);
  }

  .filters {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 9px;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar { display: none; }

  .chip {
    flex: 0 0 auto;
    padding: 5px 11px;
    font: 500 13px/1.3 inherit;
    white-space: nowrap;
    color: var(--text);
    background: var(--card);
    border: 1px solid transparent;
    border-radius: 999px;
    cursor: pointer;
  }

  .chip[aria-pressed="true"] {
    background: var(--btn);
    border-color: var(--btn);
    color: var(--btn-text);
  }

  .chip.clear {
    color: var(--danger);
    background: transparent;
    border-color: var(--line);
  }

  .sep {
    flex: 0 0 auto;
    width: 1px;
    margin: 4px 2px;
    background: var(--line);
  }

  /* ---------- list ---------- */

  main {
    padding: 10px var(--pad)
      calc(24px + var(--tg-safe-area-inset-bottom, 0px));
  }

  .count {
    margin: 2px 2px 9px;
    font-size: 12.5px;
    color: var(--hint);
  }

  .card {
    position: relative;
    padding: 12px 13px;
    margin-bottom: 8px;
    background: var(--section);
    border-radius: var(--radius);
    cursor: pointer;
    transition: transform .1s;
  }

  .card:active { transform: scale(.985); }

  .card .top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .card h3 {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -.01em;
  }

  .star {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    margin: -5px -5px 0 0;
    font-size: 17px;
    line-height: 1;
    color: var(--hint);
    background: none;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }

  .star[aria-pressed="true"] { color: #f5a524; }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }

  .pill {
    padding: 3px 8px;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.35;
    border-radius: 6px;
    background: var(--card);
    color: var(--hint);
  }

  .pill.urgent { color: #fff; }
  .pill.rank { background: rgba(47,127,237,.14); color: var(--accent); }

  .meta {
    margin-top: 7px;
    font-size: 13px;
    color: var(--hint);
  }

  .meta div { margin-top: 2px; }

  /* skeletons */
  .sk {
    height: 84px;
    margin-bottom: 8px;
    border-radius: var(--radius);
    background: linear-gradient(90deg,
      var(--section) 25%, var(--card) 37%, var(--section) 63%);
    background-size: 400% 100%;
    animation: shimmer 1.3s ease infinite;
  }

  @keyframes shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }

  .state {
    padding: 52px 24px;
    text-align: center;
    color: var(--hint);
    font-size: 14px;
  }

  .state strong { display: block; margin-bottom: 6px; color: var(--text); }

  .more {
    display: block;
    width: 100%;
    padding: 12px;
    font: 600 14px/1 inherit;
    color: var(--accent);
    background: var(--section);
    border: 0;
    border-radius: 11px;
    cursor: pointer;
  }

  .more[disabled] { opacity: .55; }

  /* ---------- detail sheet ---------- */

  dialog {
    width: 100%;
    max-width: 560px;
    max-height: 88vh;
    margin: auto auto 0;
    padding: 0;
    border: 0;
    border-radius: 16px 16px 0 0;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
  }

  @media (min-width: 600px) {
    dialog { margin: auto; border-radius: 16px; }
  }

  dialog::backdrop { background: rgba(0, 0, 0, .5); }

  .sheet {
    max-height: 88vh;
    overflow-y: auto;
    padding: 8px 18px
      calc(18px + var(--tg-safe-area-inset-bottom, 0px));
    -webkit-overflow-scrolling: touch;
  }

  .grab {
    width: 36px;
    height: 4px;
    margin: 4px auto 12px;
    border-radius: 2px;
    background: var(--line);
  }

  .sheet h2 { margin: 0 0 3px; font-size: 19px; letter-spacing: -.02em; }
  .sheet .sub { margin: 0 0 14px; font-size: 13px; color: var(--hint); }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 0;
    border-top: 1px solid var(--line);
    font-size: 14px;
  }

  .row span:first-child { color: var(--hint); flex: 0 0 auto; }
  .row span:last-child { text-align: right; }
  .row a { color: var(--accent); }

  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 8px;
    padding: 14px 0 2px;
    background: var(--bg);
  }

  .btn {
    flex: 1;
    padding: 12px 8px;
    font: 600 14px/1 inherit;
    text-align: center;
    text-decoration: none;
    color: var(--btn-text);
    background: var(--btn);
    border: 0;
    border-radius: 10px;
    cursor: pointer;
  }

  .btn.secondary { background: var(--card); color: var(--text); }
  .btn[disabled] { opacity: .6; }

  .note {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--hint);
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(22px + var(--tg-safe-area-inset-bottom, 0px));
    z-index: 50;
    transform: translate(-50%, 14px);
    padding: 9px 16px;
    font-size: 13.5px;
    font-weight: 600;
    color: #fff;
    background: rgba(20, 24, 30, .94);
    border-radius: 999px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .18s, transform .18s;
  }

  .toast.show { opacity: 1; transform: translate(-50%, 0); }
</style>
</head>
<body>

<header>
  <div class="searchwrap">
    <svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 105.3 14l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"/></svg>
    <input type="search" id="q" placeholder="Search conferences"
           autocomplete="off" autocorrect="off" enterkeyhint="search">
    <button id="clearq" type="button" aria-label="Clear" hidden>✕</button>
  </div>

  <div class="seg" id="views" role="tablist"></div>
  <div class="filters" id="facets"></div>
</header>

<main>
  <div class="count" id="count"></div>
  <div id="results"></div>
  <button class="more" id="more" hidden>Load more</button>
</main>

<dialog id="sheet"><div class="sheet" id="sheetBody"></div></dialog>
<div class="toast" id="toast"></div>

<script>
(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.enableClosingConfirmation) { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); }
  }

  var initData = (tg && tg.initData) || "";

  /*
   * Opened outside Telegram there is no signed initData, so every
   * API call would 401. Say so plainly instead of showing the
   * user a failed request.
   */
  var outsideTelegram = !initData;

  var state = {
    view: "upcoming",
    search: "",
    topic: "",
    rank: "",
    format: "",
    page: 1,
    total: 0,
    loaded: 0,
    openId: null
  };

  var els = {
    q: document.getElementById("q"),
    clearq: document.getElementById("clearq"),
    views: document.getElementById("views"),
    facets: document.getElementById("facets"),
    count: document.getElementById("count"),
    results: document.getElementById("results"),
    more: document.getElementById("more"),
    sheet: document.getElementById("sheet"),
    sheetBody: document.getElementById("sheetBody"),
    toast: document.getElementById("toast")
  };

  function api(path, body) {
    return fetch("/app/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ initData: initData }, body || {}))
    }).then(function (response) {
      if (response.ok) { return response.json(); }

      return response.json()["catch"](function () { return {}; })
        .then(function (data) {
          throw new Error(
            "HTTP " + response.status +
            (data && data.reason ? " (" + data.reason + ")" : "") +
            (data && data.error && !data.reason ? " – " + data.error : "")
          );
        });
    });
  }

  function haptic(kind) {
    if (!tg || !tg.HapticFeedback) { return; }
    if (kind === "ok") { tg.HapticFeedback.notificationOccurred("success"); }
    else { tg.HapticFeedback.impactOccurred(kind || "light"); }
  }

  var toastTimer;

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1900);
  }

  function escape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function daysLeft(iso) {
    if (!iso) { return null; }
    return Math.ceil((new Date(iso) - new Date()) / 86400000);
  }

  function colour(iso) {
    var d = daysLeft(iso);
    if (d === null) { return "#9aa4b0"; }
    if (d < 0) { return "#78808a"; }
    if (d <= 7) { return "#e5484d"; }
    if (d <= 30) { return "#f2870d"; }
    if (d <= 90) { return "#d9a400"; }
    return "#30a46c";
  }

  function when(iso) {
    if (!iso) { return "TBA"; }
    var date = new Date(iso);
    if (isNaN(date)) { return "TBA"; }
    return date.toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric"
    });
  }

  function countdown(iso) {
    var d = daysLeft(iso);
    if (d === null) { return "no date"; }
    if (d < 0) { return "closed"; }
    if (d === 0) { return "today"; }
    return d === 1 ? "1 day left" : d + " days left";
  }

  function topicsOf(row) {
    try { return (JSON.parse(row.topics || "[]") || []).join(", "); }
    catch (e) { return ""; }
  }

  var FORMATS = {
    "in-person": "In person", "virtual": "Virtual",
    "hybrid": "Hybrid", "tba": "TBA"
  };

  var VIEWS = [
    ["upcoming", "Upcoming"], ["feed", "My feed"], ["saved", "Saved"]
  ];

  var FACETS = {
    topic: [["ML", "ML"], ["CV", "CV"], ["NLP", "NLP"],
            ["RO", "Robotics"], ["SP", "Speech"], ["DM", "Data mining"]],
    rank: [["A*", "A*"], ["A", "A+"], ["B", "B+"]],
    format: [["in-person", "In person"], ["virtual", "Virtual"],
             ["hybrid", "Hybrid"]]
  };

  function renderViews() {
    els.views.textContent = "";

    VIEWS.forEach(function (entry) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.textContent = entry[1];
      b.setAttribute("aria-selected", state.view === entry[0] ? "true" : "false");
      b.addEventListener("click", function () {
        if (state.view === entry[0]) { return; }
        state.view = entry[0];
        haptic();
        reload();
      });
      els.views.appendChild(b);
    });
  }

  function chip(label, active, onClick, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (cls ? " " + cls : "");
    b.textContent = label;
    b.setAttribute("aria-pressed", active ? "true" : "false");
    b.addEventListener("click", function () { haptic(); onClick(); });
    return b;
  }

  function anyFilter() {
    return !!(state.topic || state.rank || state.format);
  }

  function renderFacets() {
    els.facets.textContent = "";

    if (anyFilter()) {
      els.facets.appendChild(chip("Clear", false, function () {
        state.topic = state.rank = state.format = "";
        reload();
      }, "clear"));
    }

    ["topic", "rank", "format"].forEach(function (facet, index) {
      if (index) {
        var sep = document.createElement("div");
        sep.className = "sep";
        els.facets.appendChild(sep);
      }

      FACETS[facet].forEach(function (entry) {
        els.facets.appendChild(
          chip(entry[1], state[facet] === entry[0], function () {
            state[facet] = state[facet] === entry[0] ? "" : entry[0];
            reload();
          })
        );
      });
    });
  }

  function setStar(button, saved) {
    button.textContent = saved ? "★" : "☆";
    button.setAttribute("aria-pressed", saved ? "true" : "false");
    button.setAttribute("aria-label", saved ? "Saved" : "Save");
  }

  function card(row) {
    var el = document.createElement("article");
    el.className = "card";
    el.dataset.id = row.id;

    var pills =
      '<span class="pill urgent" style="background:' + colour(row.deadline_utc) +
        '">' + escape(countdown(row.deadline_utc)) + '</span>' +
      (row.core_rank
        ? '<span class="pill rank">CORE ' + escape(row.core_rank) + '</span>'
        : "") +
      (row.format && row.format !== "tba"
        ? '<span class="pill">' + escape(FORMATS[row.format] || row.format) +
          '</span>'
        : "");

    el.innerHTML =
      '<div class="top">' +
        '<h3>' + escape(row.title) + " " + escape(row.year) + '</h3>' +
        '<button class="star" type="button"></button>' +
      '</div>' +
      '<div class="pills">' + pills + '</div>' +
      '<div class="meta">' +
        '<div>' + escape(when(row.deadline_utc)) + '</div>' +
        '<div>' + escape(row.place || "Location TBA") + '</div>' +
        (topicsOf(row) ? '<div>' + escape(topicsOf(row)) + '</div>' : "") +
      '</div>';

    var star = el.querySelector(".star");
    setStar(star, !!row.saved);

    star.addEventListener("click", function (event) {
      event.stopPropagation();

      var next = star.getAttribute("aria-pressed") !== "true";
      setStar(star, next);
      haptic("medium");

      api("save", { id: row.id, saved: next })
        .then(function () {
          row.saved = next;
          toast(next ? "Saved" : "Removed");
          /* A card unsaved from the Saved tab no longer belongs. */
          if (!next && state.view === "saved") { el.remove(); }
        })["catch"](function () {
          setStar(star, !next);
          toast("Could not save");
        });
    });

    el.addEventListener("click", function () {
      haptic();
      openDetail(row.id);
    });

    return el;
  }

  function skeletons(n) {
    var html = "";
    for (var i = 0; i < n; i++) { html += '<div class="sk"></div>'; }
    return html;
  }

  function emptyMessage() {
    if (state.view === "saved") {
      return '<strong>Nothing saved yet</strong>' +
        'Tap the star on any conference to keep it here.';
    }
    if (state.view === "feed") {
      return '<strong>Your feed is empty</strong>' +
        'Pick a few topics with the chips above, or in the bot under Settings.';
    }
    if (state.search) {
      return '<strong>No matches for “' + escape(state.search) + '”</strong>' +
        (anyFilter() ? 'Try clearing the filters.' : 'Try a different spelling.');
    }
    return '<strong>Nothing found</strong>Try clearing the filters.';
  }

  var token = 0;

  function load(append) {
    var mine = ++token;

    if (append) {
      els.more.disabled = true;
      els.more.textContent = "Loading…";
    } else {
      els.results.innerHTML = skeletons(5);
      els.count.textContent = "";
      els.more.hidden = true;
    }

    api("list", {
      view: state.view,
      search: state.search,
      topic: state.topic,
      rank: state.rank,
      format: state.format,
      page: state.page
    }).then(function (data) {
      if (mine !== token) { return; }

      var rows = data.rows || [];
      state.total = data.total || 0;

      if (!append) {
        els.results.textContent = "";
        state.loaded = 0;
      }

      if (!rows.length && !append) {
        els.results.innerHTML = '<p class="state">' + emptyMessage() + '</p>';
        els.count.textContent = "";
        els.more.hidden = true;
        return;
      }

      var fragment = document.createDocumentFragment();
      rows.forEach(function (row) { fragment.appendChild(card(row)); });
      els.results.appendChild(fragment);

      state.loaded += rows.length;

      els.count.textContent =
        state.loaded + " of " + state.total +
        (data.fuzzy ? " · closest matches" : "");

      els.more.hidden = state.loaded >= state.total;
      els.more.disabled = false;
      els.more.textContent = "Load more";
    })["catch"](function (error) {
      if (mine !== token) { return; }

      els.results.innerHTML =
        '<p class="state"><strong>Could not load</strong>' +
        escape(error.message) + '</p>';
      els.count.textContent = "";
      els.more.hidden = true;
      els.more.disabled = false;
      els.more.textContent = "Load more";
    });
  }

  function reload() {
    state.page = 1;
    renderViews();
    renderFacets();
    load(false);
  }

  /* ---------- detail ---------- */

  function showBack(on) {
    if (!tg || !tg.BackButton) { return; }
    if (on) { tg.BackButton.show(); } else { tg.BackButton.hide(); }
  }

  function closeSheet() {
    if (els.sheet.open) { els.sheet.close(); }
  }

  function openDetail(id) {
    state.openId = id;
    els.sheetBody.innerHTML =
      '<div class="grab"></div>' + skeletons(4);
    els.sheet.showModal();
    showBack(true);

    api("detail", { id: id }).then(function (data) {
      if (state.openId !== id) { return; }
      renderDetail(data);
    })["catch"](function (error) {
      els.sheetBody.innerHTML =
        '<div class="grab"></div><p class="state"><strong>Could not load</strong>' +
        escape(error.message) + '</p>';
    });
  }

  function renderDetail(data) {
    var c = data.conference;

    var rows = [];

    rows.push(["Paper deadline",
      when(c.deadline_utc) + " · " + countdown(c.deadline_utc)]);

    if (c.abstract_deadline_utc) {
      rows.push(["Abstract", when(c.abstract_deadline_utc)]);
    }

    rows.push(["Location", c.place || "TBA"]);
    rows.push(["Format", FORMATS[c.format] || c.format]);

    if (c.date) { rows.push(["Conference", c.date]); }
    if (topicsOf(c)) { rows.push(["Topics", topicsOf(c)]); }
    if (c.core_rank) { rows.push(["CORE rank", c.core_rank]); }

    if (data.rates && data.rates.length) {
      rows.push(["Acceptance", data.rates.slice(0, 4).map(function (r) {
        return r.year + ": " + (r.rate == null ? "?" : r.rate + "%");
      }).join(" · ")]);

      var latest = data.rates[0];
      if (latest.accepted && latest.submitted) {
        rows.push([latest.year + " detail",
          latest.accepted.toLocaleString() + " of " +
          latest.submitted.toLocaleString() + " accepted"]);
      }
    }

    var html =
      '<div class="grab"></div>' +
      '<h2>' + escape(c.title) + " " + escape(c.year) + '</h2>' +
      '<p class="sub">' + escape(c.full_name || "") + '</p>' +
      rows.map(function (r) {
        return '<div class="row"><span>' + escape(r[0]) +
          '</span><span>' + escape(r[1]) + '</span></div>';
      }).join("");

    if (data.country && data.country.visa_url) {
      html +=
        '<div class="row"><span>Visa</span><span><a href="' +
        escape(data.country.visa_url) + '" target="_blank" rel="noopener">' +
        escape(data.country.country) + ' portal</a></span></div>';
    }

    html +=
      '<div class="actions">' +
        '<button class="btn secondary" type="button" id="dsave"></button>' +
        '<button class="btn secondary" type="button" id="dremind">Remind me</button>' +
        (c.link
          ? '<a class="btn" href="' + escape(c.link) +
            '" target="_blank" rel="noopener">Website</a>'
          : "") +
      '</div>';

    if (data.country && data.country.visa_note) {
      html += '<p class="note">' + escape(data.country.visa_note) +
        ' Requirements depend on your nationality — always check the ' +
        'official source.</p>';
    }

    if (c.note && /predicted/i.test(c.note)) {
      html += '<p class="note">⚠️ This deadline is predicted. ' +
        'Verify it on the official website.</p>';
    }

    els.sheetBody.innerHTML = html;
    els.sheetBody.scrollTop = 0;

    var saveBtn = els.sheetBody.querySelector("#dsave");
    var saved = !!data.saved;

    function paint() {
      saveBtn.textContent = saved ? "★ Saved" : "☆ Save";
    }
    paint();

    saveBtn.addEventListener("click", function () {
      var next = !saved;
      saved = next;
      paint();
      haptic("medium");

      api("save", { id: c.id, saved: next }).then(function () {
        toast(next ? "Saved" : "Removed");
        refreshCardStar(c.id, next);
      })["catch"](function () {
        saved = !next;
        paint();
        toast("Could not save");
      });
    });

    var remind = els.sheetBody.querySelector("#dremind");

    remind.addEventListener("click", function () {
      remind.disabled = true;

      api("remind", { id: c.id, days: 7 }).then(function () {
        haptic("ok");
        remind.textContent = "Reminder set";
        toast("Reminder set for 7 days before");
      })["catch"](function (error) {
        remind.disabled = false;
        toast(error.message.indexOf("passed") > -1
          ? "Deadline is too close" : "Could not set reminder");
      });
    });
  }

  /* Keeps the list star in step with a change made in the sheet. */
  function refreshCardStar(id, saved) {
    var card = els.results.querySelector('.card[data-id="' + id + '"]');
    if (card) { setStar(card.querySelector(".star"), saved); }
  }

  els.sheet.addEventListener("close", function () {
    state.openId = null;
    showBack(false);
  });

  els.sheet.addEventListener("click", function (event) {
    if (event.target === els.sheet) { closeSheet(); }
  });

  if (tg && tg.BackButton && tg.BackButton.onClick) {
    tg.BackButton.onClick(function () { closeSheet(); });
  }

  /* ---------- search ---------- */

  var debounce;

  els.q.addEventListener("input", function () {
    els.clearq.hidden = !els.q.value;
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      state.search = els.q.value.trim();
      reload();
    }, 280);
  });

  els.clearq.addEventListener("click", function () {
    els.q.value = "";
    els.clearq.hidden = true;
    state.search = "";
    els.q.focus();
    reload();
  });

  els.more.addEventListener("click", function () {
    state.page += 1;
    haptic();
    load(true);
  });

  /* ---------- boot ---------- */

  renderViews();
  renderFacets();

  if (outsideTelegram) {
    els.results.innerHTML =
      '<p class="state"><strong>Open this inside Telegram</strong>' +
      'This page needs a signed launch from the Telegram app, so it ' +
      'cannot load conference data in a normal browser.<br><br>' +
      'Open @AIConfDeadlineBot and tap the menu button.</p>';
    els.more.hidden = true;
  } else {
    load(false);
  }
}());
</script>
</body>
</html>`;
