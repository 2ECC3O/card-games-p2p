(() => {
  const config = window.cardGamesAnalytics || {};
  const optedOut = () => navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  if (optedOut() || /(^|\.)localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(location.hostname)) return;

  let privateUrl = Boolean(location.search);
  if (document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      privateUrl ||= Boolean(referrer.search || referrer.hash);
    } catch {
      privateUrl = true;
    }
  }

  function script(src, attributes) {
    const element = document.createElement("script");
    element.src = src;
    element.async = true;
    element.referrerPolicy = "no-referrer";
    Object.assign(element.dataset, attributes);
    return element;
  }

  // Cloudflare has no payload hook: skip private entry URLs and disable SPA URL tracking.
  if (!privateUrl && /^[a-f0-9]{32}$/i.test(config.cloudflareToken || "")) {
    document.head.appendChild(script("https://static.cloudflareinsights.com/beacon.min.js", {
      cfBeacon: JSON.stringify({ token: config.cloudflareToken, spa: false }),
    }));
  }

  const website = config.umamiWebsiteId;
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(website || "")) return;
  const path = location.pathname.replace(/\/index\.html$/, "/");
  const name = path.split("/").filter(Boolean).at(-1);
  const game = ["poker", "blackjack", "roulette", "pool", "pokdeng", "slave"].includes(name) ? name : null;
  let played = false;
  let ready = false;

  function track(play = false) {
    if (optedOut()) return;
    // Allowlist every payload field: never inherit URLs, referrers, player IDs or game state.
    const payload = { website, hostname: location.hostname, url: path, title: game || "Card Games", referrer: "" };
    if (play) Object.assign(payload, { name: "game_played", data: { game } });
    try {
      Promise.resolve(window.umami?.track(payload)).catch(() => {});
    } catch { /* Analytics failures must not interrupt a game. */ }
  }
  if (game) {
    window.addEventListener("card-games:play", () => {
      played = true;
      if (ready) track(true);
    }, { once: true });
  }
  const umami = script("https://cloud.umami.is/script.js", {
    websiteId: website, autoTrack: "false", excludeSearch: "true", excludeHash: "true", doNotTrack: "true",
  });
  umami.onload = () => {
    ready = true;
    track();
    if (played) track(true);
  };
  document.head.appendChild(umami);
})();
