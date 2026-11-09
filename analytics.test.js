import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const path = new URL("./analytics.js", import.meta.url);
const token = "1234567890abcdef1234567890abcdef";
const websiteId = "12345678-1234-1234-1234-123456789abc";

function load(overrides = {}) {
  const scripts = [];
  const options = { token, websiteId: "", hostname: "2ecc3o.github.io", pathname: "/card-games-p2p/", search: "", referrer: "", ...overrides };
  const events = new EventTarget();
  const calls = [];
  const window = {
    cardGamesAnalytics: { cloudflareToken: options.token, umamiWebsiteId: options.websiteId },
    addEventListener: (...args) => events.addEventListener(...args),
  };
  const document = {
    referrer: options.referrer,
    querySelector: () => ({ content: options.token }),
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (script) => scripts.push(script) },
  };
  assert.ok(existsSync(path), "shared analytics loader exists");
  vm.runInNewContext(readFileSync(path, "utf8"), {
    document,
    navigator: { doNotTrack: options.dnt, globalPrivacyControl: options.gpc },
    location: { hostname: options.hostname, pathname: options.pathname, search: options.search },
    window,
    URL,
  });
  return Object.assign(scripts, {
    calls,
    play: () => events.dispatchEvent(new Event("card-games:play")),
    umamiReady() {
      window.umami = { track: (payload) => { calls.push(JSON.parse(JSON.stringify(payload))); return Promise.resolve(); } };
      scripts.find((script) => script.dataset.websiteId)?.onload();
    },
  });
}

test("analytics stays off for missing/invalid tokens, local previews, and privacy opt-outs", () => {
  for (const options of [
    { token: "" }, { token: "not-a-token" }, { dnt: "1" }, { gpc: true },
    { hostname: "localhost" }, { hostname: "127.0.0.1" }, { hostname: "[::1]" },
    { hostname: "preview.localhost" },
  ]) assert.equal(load(options).length, 0);
});

test("configured analytics loads one asynchronous Cloudflare beacon with SPA tracking off", () => {
  const [script, ...extra] = load();
  assert.equal(extra.length, 0);
  assert.equal(script.src, "https://static.cloudflareinsights.com/beacon.min.js");
  assert.equal(script.async, true);
  assert.equal(script.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(script.dataset.cfBeacon), { token, spa: false });
});

test("pages or referring URLs with query strings do not reach analytics", () => {
  for (const options of [
    { search: "?room=PRIVATE" },
    { referrer: "https://2ecc3o.github.io/card-games-p2p/poker/?room=PRIVATE" },
    { referrer: "https://example.com/?private=value" },
    { referrer: "https://example.com/#private" },
  ]) assert.equal(load(options).length, 0);
  assert.equal(load({ referrer: "https://example.com/" }).length, 1);
});

test("all game pages include analytics, including Umami-only private invite visits", () => {
  for (const game of ["poker", "blackjack", "roulette", "pool", "pokdeng", "slave"]) {
    const scripts = load({ pathname: `/card-games-p2p/${game}/`, websiteId, search: "?room=PRIVATE" });
    assert.equal(scripts.length, 1, "private URLs skip the Cloudflare beacon");
    assert.equal(scripts[0].dataset.websiteId, websiteId);
    assert.equal(scripts[0].dataset.autoTrack, "false");
    scripts.umamiReady();
    scripts.play();
    scripts.play();
    assert.equal(scripts.calls.length, 2, "one pageview and one gameplay event per page visit");
    assert.equal(scripts.calls[0].url, `/card-games-p2p/${game}/`);
    assert.equal(scripts.calls[0].name, undefined);
    assert.equal(scripts.calls[1].name, "game_played");
    assert.deepEqual(scripts.calls[1].data, { game });
    assert.equal(JSON.stringify(scripts.calls).includes("PRIVATE"), false);
  }
});

test("an early game action is counted after the tracker loads; home-page events are ignored", () => {
  const scripts = load({ token: "", websiteId, pathname: "/poker/", referrer: "https://example.com/?room=PRIVATE" });
  scripts.play();
  scripts.play();
  scripts.umamiReady();
  assert.deepEqual(scripts.calls.map((call) => call.name), [undefined, "game_played"]);
  assert.equal(scripts.calls[0].referrer, "");
  const home = load({ token: "", websiteId });
  home.umamiReady();
  home.play();
  assert.equal(home.calls.length, 1);
});

test("opt-outs and invalid config prevent both providers, with no gameplay listeners", () => {
  for (const overrides of [{ dnt: "1" }, { gpc: true }, { hostname: "localhost" }, { token: "", websiteId: "bad" }]) {
    const scripts = load({ websiteId, ...overrides });
    scripts.play();
    assert.equal(scripts.length, 0);
    assert.equal(scripts.calls.length, 0);
  }
});
