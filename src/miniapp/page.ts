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
    --text: var(--tg-theme-text-color, #111111);
    --hint: var(--tg-theme-hint-color, #7d7d7d);
    --card: var(--tg-theme-secondary-bg-color, #f4f4f5);
    --accent: var(--tg-theme-button-color, #2f7fed);
    --accent-text: var(--tg-theme-button-text-color, #ffffff);
    --border: color-mix(in srgb, var(--hint) 25%, transparent);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0 0 96px;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI",
      Roboto, sans-serif;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--bg);
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--border);
  }

  input[type="search"] {
    width: 100%;
    padding: 11px 13px;
    font-size: 16px;
    color: var(--text);
    background: var(--card);
    border: 1px solid transparent;
    border-radius: 11px;
    outline: none;
  }

  input[type="search"]:focus { border-color: var(--accent); }

  .filters {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding: 9px 0 2px;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar { display: none; }

  .chip {
    flex: 0 0 auto;
    padding: 6px 12px;
    font-size: 13px;
    white-space: nowrap;
    color: var(--text);
    background: var(--card);
    border: 1px solid transparent;
    border-radius: 999px;
    cursor: pointer;
  }

  .chip[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  main { padding: 12px 14px; }

  .card {
    padding: 13px 14px;
    margin-bottom: 10px;
    background: var(--card);
    border-radius: 13px;
    cursor: pointer;
  }

  .card h3 {
    margin: 0 0 5px;
    font-size: 15.5px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .meta { font-size: 13px; color: var(--hint); }
  .meta div { margin-top: 3px; }

  .dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .rank {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }

  .star {
    margin-left: auto;
    font-size: 19px;
    line-height: 1;
    background: none;
    border: 0;
    cursor: pointer;
    padding: 0 2px;
  }

  .empty, .loading {
    padding: 44px 20px;
    text-align: center;
    color: var(--hint);
  }

  dialog {
    width: min(560px, 92vw);
    padding: 0;
    border: 0;
    border-radius: 15px;
    background: var(--bg);
    color: var(--text);
  }

  dialog::backdrop { background: rgba(0, 0, 0, .45); }

  .sheet { padding: 18px; }
  .sheet h2 { margin: 0 0 4px; font-size: 18px; }
  .sheet .sub { color: var(--hint); font-size: 13px; margin-bottom: 14px; }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }

  .row span:first-child { color: var(--hint); }
  .row span:last-child { text-align: right; }

  .actions { display: flex; gap: 9px; margin-top: 16px; }

  .btn {
    flex: 1;
    padding: 11px;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    color: var(--accent-text);
    background: var(--accent);
    border: 0;
    border-radius: 10px;
    cursor: pointer;
  }

  .btn.secondary {
    background: var(--card);
    color: var(--text);
  }

  .more {
    display: block;
    width: 100%;
    padding: 12px;
    margin-top: 4px;
    font-size: 14px;
    color: var(--accent);
    background: var(--card);
    border: 0;
    border-radius: 11px;
    cursor: pointer;
  }
</style>
</head>
<body>

<header>
  <input type="search" id="q" placeholder="Search conferences…"
         autocomplete="off" enterkeyhint="search">

  <div class="filters" id="views"></div>
  <div class="filters" id="facets"></div>
</header>

<main>
  <div id="results"></div>
  <button class="more" id="more" hidden>Load more</button>
</main>

<dialog id="sheet"><div class="sheet" id="sheetBody"></div></dialog>

<script>
(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  var initData = (tg && tg.initData) || "";

  var state = {
    view: "upcoming",
    search: "",
    topic: "",
    rank: "",
    format: "",
    page: 1,
    total: 0,
    rows: []
  };

  var els = {
    q: document.getElementById("q"),
    views: document.getElementById("views"),
    facets: document.getElementById("facets"),
    results: document.getElementById("results"),
    more: document.getElementById("more"),
    sheet: document.getElementById("sheet"),
    sheetBody: document.getElementById("sheetBody")
  };

  function api(path, body) {
    /*
     * Absolute: the shell is served at "/app" with no trailing
     * slash, so a relative "api/..." would resolve to "/api/...".
     */
    return fetch("/app/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ initData: initData }, body || {}))
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    });
  }

  function haptic(style) {
    if (tg && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style || "light");
    }
  }

  function escape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function daysLeft(iso) {
    if (!iso) { return null; }
    return Math.ceil((new Date(iso) - new Date()) / 86400000);
  }

  function colour(iso) {
    var days = daysLeft(iso);
    if (days === null) { return "#9e9e9e"; }
    if (days < 0) { return "#757575"; }
    if (days <= 7) { return "#e53935"; }
    if (days <= 30) { return "#fb8c00"; }
    if (days <= 90) { return "#fdd835"; }
    return "#43a047";
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
    var days = daysLeft(iso);
    if (days === null) { return ""; }
    if (days < 0) { return "closed"; }
    if (days === 0) { return "today"; }
    return days === 1 ? "1 day left" : days + " days left";
  }

  function topicsOf(row) {
    try {
      return (JSON.parse(row.topics || "[]") || []).join(", ");
    } catch (error) {
      return "";
    }
  }

  var CHIPS = {
    views: [
      ["upcoming", "📅 Upcoming"],
      ["feed", "🎯 My feed"],
      ["saved", "⭐ Saved"]
    ],
    topic: [
      ["ML", "🧠 ML"], ["CV", "👁 CV"], ["NLP", "💬 NLP"],
      ["RO", "🤖 RO"], ["SP", "🔊 SP"], ["DM", "📊 DM"]
    ],
    rank: [["A*", "🏅 A*"], ["A", "🎖 A+"], ["B", "🥉 B+"]],
    format: [
      ["in-person", "🏛 In person"],
      ["virtual", "💻 Virtual"],
      ["hybrid", "🔀 Hybrid"]
    ]
  };

  function chip(label, active, onClick) {
    var button = document.createElement("button");
    button.className = "chip";
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.addEventListener("click", function () {
      haptic();
      onClick();
    });
    return button;
  }

  function renderChips() {
    els.views.textContent = "";

    CHIPS.views.forEach(function (entry) {
      els.views.appendChild(
        chip(entry[1], state.view === entry[0], function () {
          state.view = entry[0];
          reload();
        })
      );
    });

    els.facets.textContent = "";

    ["topic", "rank", "format"].forEach(function (facet) {
      CHIPS[facet].forEach(function (entry) {
        els.facets.appendChild(
          chip(entry[1], state[facet] === entry[0], function () {
            state[facet] = state[facet] === entry[0] ? "" : entry[0];
            reload();
          })
        );
      });
    });
  }

  function card(row) {
    var element = document.createElement("article");
    element.className = "card";

    element.innerHTML =
      '<h3>' +
        '<span class="dot" style="background:' + colour(row.deadline_utc) + '"></span>' +
        '<span>' + escape(row.title) + " " + escape(row.year) + '</span>' +
        (row.core_rank ? '<span class="rank">' + escape(row.core_rank) + '</span>' : "") +
        '<button class="star" type="button" aria-label="Save">☆</button>' +
      '</h3>' +
      '<div class="meta">' +
        '<div>📅 ' + escape(when(row.deadline_utc)) +
          ' · ' + escape(countdown(row.deadline_utc)) + '</div>' +
        '<div>📍 ' + escape(row.place || "TBA") + '</div>' +
        (topicsOf(row) ? '<div>🏷 ' + escape(topicsOf(row)) + '</div>' : "") +
      '</div>';

    var star = element.querySelector(".star");

    if (state.view === "saved") {
      star.textContent = "★";
    }

    star.addEventListener("click", function (event) {
      event.stopPropagation();

      var saving = star.textContent === "☆";

      star.textContent = saving ? "★" : "☆";
      haptic("medium");

      api("save", { id: row.id, saved: saving })["catch"](function () {
        star.textContent = saving ? "☆" : "★";
      });
    });

    element.addEventListener("click", function () {
      haptic();
      openDetail(row.id);
    });

    return element;
  }

  function render() {
    if (state.page === 1) {
      els.results.textContent = "";
    }

    if (!state.rows.length && state.page === 1) {
      els.results.innerHTML =
        '<p class="empty">Nothing matched.<br>Try a different filter.</p>';
      els.more.hidden = true;
      return;
    }

    var fragment = document.createDocumentFragment();

    state.rows.forEach(function (row) {
      fragment.appendChild(card(row));
    });

    els.results.appendChild(fragment);

    els.more.hidden =
      els.results.children.length >= state.total;
  }

  var requestToken = 0;

  function load() {
    var token = ++requestToken;

    if (state.page === 1) {
      els.results.innerHTML = '<p class="loading">Loading…</p>';
    }

    api("list", {
      view: state.view,
      search: state.search,
      topic: state.topic,
      rank: state.rank,
      format: state.format,
      page: state.page
    }).then(function (data) {
      /* A slower earlier request must not overwrite a newer one. */
      if (token !== requestToken) { return; }

      state.rows = data.rows || [];
      state.total = data.total || 0;
      render();
    })["catch"](function (error) {
      if (token !== requestToken) { return; }

      els.results.innerHTML =
        '<p class="empty">Could not load.<br>' + escape(error.message) + '</p>';
      els.more.hidden = true;
    });
  }

  function reload() {
    state.page = 1;
    renderChips();
    load();
  }

  function openDetail(id) {
    els.sheetBody.innerHTML = '<p class="loading">Loading…</p>';
    els.sheet.showModal();

    api("detail", { id: id }).then(function (data) {
      var conference = data.conference;

      var rows = [
        ["Paper deadline", when(conference.deadline_utc) +
          " · " + countdown(conference.deadline_utc)]
      ];

      if (conference.abstract_deadline_utc) {
        rows.push(["Abstract deadline", when(conference.abstract_deadline_utc)]);
      }

      rows.push(["Location", conference.place || "TBA"]);
      rows.push(["Format", conference.format]);

      if (conference.date) { rows.push(["Dates", conference.date]); }
      if (topicsOf(conference)) { rows.push(["Topics", topicsOf(conference)]); }
      if (conference.core_rank) { rows.push(["CORE rank", conference.core_rank]); }

      if (data.rates && data.rates.length) {
        rows.push([
          "Acceptance rate",
          data.rates.slice(0, 4).map(function (rate) {
            return rate.year + ": " + (rate.rate == null ? "?" : rate.rate + "%");
          }).join(" · ")
        ]);
      }

      var html =
        '<h2>' + escape(conference.title) + " " + escape(conference.year) + '</h2>' +
        '<p class="sub">' + escape(conference.full_name || "") + '</p>' +
        rows.map(function (row) {
          return '<div class="row"><span>' + escape(row[0]) +
            '</span><span>' + escape(row[1]) + '</span></div>';
        }).join("");

      if (data.country && data.country.visa_url) {
        html +=
          '<div class="row"><span>Visa</span><span>' +
          '<a href="' + escape(data.country.visa_url) + '" target="_blank" ' +
          'rel="noopener">Official portal</a></span></div>' +
          '<p class="sub" style="margin-top:10px">Requirements depend on ' +
          'your nationality — always check the official source.</p>';
      }

      html +=
        '<div class="actions">' +
          (conference.link
            ? '<a class="btn" href="' + escape(conference.link) +
              '" target="_blank" rel="noopener">Website</a>'
            : "") +
          '<button class="btn secondary" type="button" id="close">Close</button>' +
        '</div>';

      els.sheetBody.innerHTML = html;

      els.sheetBody.querySelector("#close")
        .addEventListener("click", function () {
          els.sheet.close();
        });
    })["catch"](function () {
      els.sheetBody.innerHTML = '<p class="empty">Could not load.</p>';
    });
  }

  els.sheet.addEventListener("click", function (event) {
    if (event.target === els.sheet) {
      els.sheet.close();
    }
  });

  var debounce;

  els.q.addEventListener("input", function () {
    clearTimeout(debounce);

    debounce = setTimeout(function () {
      state.search = els.q.value.trim();
      reload();
    }, 260);
  });

  els.more.addEventListener("click", function () {
    state.page += 1;
    haptic();
    load();
  });

  renderChips();
  load();
}());
</script>
</body>
</html>`;
