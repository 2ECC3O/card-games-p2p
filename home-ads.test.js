import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const scriptPath = new URL("./home-ads.js", import.meta.url);
const flush = () => new Promise(setImmediate);

// External ad services and the browser DOM are simulated; the loader runs unchanged.
function browser(config = {}) {
  const scripts = [];
  const timers = new Map();
  const observers = new Set();
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.dataset = {};
      this.style = {};
      this.children = [];
      this.hidden = true;
    }
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
      if (child.tagName === "script") scripts.push(child);
      return child;
    }
    replaceChildren(...children) {
      for (const child of this.children) child.parent = null;
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }
  const banner = new Element("aside");
  banner.dataset = config;
  const slot = new Element("div");
  const document = {
    head: new Element("head"),
    createElement: (tag) => new Element(tag),
    getElementById: (id) => ({ "home-sponsor": banner, "sponsor-slot": slot })[id],
  };
  const window = {};
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.target = target; observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  const context = {
    document, window, MutationObserver,
    setTimeout: (callback) => { const id = Symbol(); timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  assert.ok(existsSync(scriptPath), "home-page ad loader exists");
  vm.runInNewContext(readFileSync(scriptPath, "utf8"), context);
  return {
    banner, slot, scripts, timers, window,
    async ethical(placements = []) {
      window.ethicalads = { wait: Promise.resolve(placements) };
      scripts[0].onload();
      await flush();
    },
    async status(status) {
      const unit = slot.children[0];
      unit.dataset.adStatus = status;
      for (const observer of [...observers]) observer.callback([]);
      await flush();
    },
    async expire() {
      for (const callback of [...timers.values()]) callback();
      await flush();
    },
  };
}

const adsense = {
  adsenseEnabled: "true",
  adsenseClient: "ca-pub-1234567890123456",
  adsenseSlot: "1234567890",
};

test("unconfigured or invalid providers make no ad requests", () => {
  for (const config of [{}, { ...adsense, adsenseEnabled: "false" }, { ...adsense, adsenseClient: "bad" }]) {
    const page = browser(config);
    assert.equal(page.banner.hidden, true);
    assert.equal(page.scripts.length, 0);
  }
});

test("a paid EthicalAds fill keeps AdSense unloaded", async () => {
  const page = browser({ ethicaladsPublisher: "test-publisher", ...adsense });
  assert.equal(page.banner.hidden, false);
  assert.equal(page.slot.children[0].dataset.eaCampaignTypes, "paid");
  await page.ethical([{ response: { campaign_type: "paid" } }]);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.window.adsbygoogle, undefined);
  assert.equal(page.banner.hidden, false);
  assert.equal(page.timers.size, 0);
});

test("EthicalAds no-fill and non-paid responses fall back to one AdSense unit", async () => {
  for (const placements of [[], [{ response: { campaign_type: "house" } }]]) {
    const page = browser({ ethicaladsPublisher: "test-publisher", ...adsense });
    const oldPlacement = page.slot.children[0];
    await page.ethical(placements);
    assert.equal(oldPlacement.parent, null);
    assert.equal(page.scripts.length, 2);
    assert.match(page.scripts[1].src, /^https:\/\/pagead2\.googlesyndication\.com\//);
    assert.equal(page.slot.children.length, 1);
    assert.equal(page.slot.children[0].dataset.adClient, adsense.adsenseClient);
    page.scripts[1].onload();
    await flush();
    assert.equal(page.window.adsbygoogle.length, 1);
    await page.status("filled");
    assert.equal(page.banner.hidden, false);
    assert.equal(page.timers.size, 0);
  }
});

test("EthicalAds script errors and timeouts fall back without a late second ad", async () => {
  for (const failure of ["error", "timeout", "pending-response"]) {
    const page = browser({ ethicaladsPublisher: "test-publisher", ...adsense });
    const oldPlacement = page.slot.children[0];
    if (failure === "error") {
      page.scripts[0].onerror();
      await flush();
    } else {
      if (failure === "pending-response") {
        page.window.ethicalads = { wait: new Promise(() => {}) };
        page.scripts[0].onload();
        await flush();
      }
      await page.expire();
    }
    assert.equal(page.scripts.length, 2);
    assert.equal(oldPlacement.parent, null);
    await page.ethical([{ response: { campaign_type: "paid" } }]);
    assert.equal(page.scripts.length, 2);
    assert.equal(page.slot.children[0].tagName, "ins");
  }
});

test("no EthicalAds inventory without an enabled fallback hides the banner", async () => {
  const page = browser({ ethicaladsPublisher: "test-publisher", ...adsense, adsenseEnabled: "false" });
  await page.ethical();
  assert.equal(page.banner.hidden, true);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.slot.children.length, 0);
});

test("AdSense alone works; unfilled, blocked, or stalled ads hide the banner", async () => {
  for (const result of ["unfilled", "unfill-optimized", "error", "timeout"]) {
    const page = browser(adsense);
    assert.equal(page.banner.hidden, false);
    assert.equal(page.scripts.length, 1);
    if (result === "error") {
      page.scripts[0].onerror();
      await flush();
    } else if (result === "timeout") {
      await page.expire();
      page.scripts[0].onload();
      await flush();
      assert.equal(page.window.adsbygoogle, undefined);
    } else {
      page.scripts[0].onload();
      await flush();
      await page.status(result);
    }
    assert.equal(page.banner.hidden, true);
    assert.equal(page.slot.children.length, 0);
    assert.equal(page.timers.size, 0);
  }
});
