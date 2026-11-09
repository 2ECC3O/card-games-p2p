(() => {
  const banner = document.getElementById("home-sponsor");
  const slot = document.getElementById("sponsor-slot");
  if (!banner || !slot) return;

  const config = banner.dataset;
  const ethicalPublisher = config.ethicaladsPublisher?.trim();
  const useAdSense = config.adsenseEnabled === "true"
    && /^ca-pub-\d{16}$/.test(config.adsenseClient || "")
    && /^\d+$/.test(config.adsenseSlot || "");
  if (!ethicalPublisher && !useAdSense) return;
  banner.hidden = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ponytail: one bounded attempt per provider; no refresh loop or ad-block bypass.
  async function attempt(request) {
    let timer;
    try {
      return await Promise.race([
        request(),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), 10000); }),
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ethicalAds() {
    const placement = document.createElement("div");
    placement.className = "flat";
    placement.dataset.eaPublisher = ethicalPublisher;
    placement.dataset.eaType = "text";
    placement.dataset.eaCampaignTypes = "paid";
    slot.appendChild(placement);
    await loadScript("https://media.ethicalads.io/media/client/ethicalads.min.js");
    const placements = await window.ethicalads.wait;
    return placements.some((ad) => ad.response?.campaign_type === "paid");
  }

  async function adSense() {
    const unit = document.createElement("ins");
    unit.className = "adsbygoogle";
    unit.dataset.adClient = config.adsenseClient;
    unit.dataset.adSlot = config.adsenseSlot;
    slot.appendChild(unit);
    let observer;
    let active = true;
    const filled = new Promise((resolve) => {
      observer = new MutationObserver(() => {
        const status = unit.dataset.adStatus;
        if (status) resolve(status === "filled");
      });
      observer.observe(unit, { attributes: true, attributeFilter: ["data-ad-status"] });
    });
    try {
      return await attempt(async () => {
        await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.adsenseClient}`);
        if (!active) return false;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        return filled;
      });
    } finally {
      active = false;
      observer.disconnect();
    }
  }

  async function start() {
    if (ethicalPublisher && await attempt(ethicalAds)) return;
    // Detach the old placement before fallback so a late response cannot show two ads.
    slot.replaceChildren();
    if (useAdSense && await adSense()) return;
    slot.replaceChildren();
    banner.hidden = true;
  }
  start();
})();
