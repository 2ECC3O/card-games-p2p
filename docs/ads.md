# Home-page advertisement setup

The home page has one labeled strip below navigation, above the main content. It stays in normal document flow;
there are no sticky ads, popups, automatic refreshes, or ads in game rooms. Missing configuration makes no requests
to ad networks and leaves the strip hidden. JavaScript is optional for choosing a game.

The order is **EthicalAds → Google AdSense → hide the strip**. Only one ad is displayed.
Each provider gets up to ten seconds; a blocked script or empty response advances to the next step.
EthicalAds requests paid campaigns only, so house ads do not prevent fallback.

## 1. Apply for EthicalAds

1. Open the [publisher application](https://www.ethicalads.io/publishers/) and submit the live site URL,
   audience information, and monthly pageviews. The network seeks developer-focused sites with 50,000+
   monthly pageviews. This general games site may not qualify; approval is not guaranteed.
2. If accepted, obtain your publisher ID from the EthicalAds dashboard or its installation snippet
   (`data-ea-publisher`). This ID is public, not an API secret.
3. Put that ID in `index.html` on the `home-sponsor` element:

   ```html
   data-ethicalads-publisher="your-approved-publisher-id"
   ```

4. Follow the dashboard's placement review and payment setup to request approval for paid ads.
   Check the strip appears above the fold on desktop and mobile. If your approved placement cannot fit on
   mobile, arrange desktop-only serving with EthicalAds before enabling it there.

The integration follows the [EthicalAds client documentation](https://ethical-ad-client.readthedocs.io/en/latest/)
and its [publisher policy](https://www.ethicalads.io/publisher-policy/), which allows another network as fallback
when EthicalAds cannot supply an ad, with no simultaneous competing ad.

## 2. Set up the AdSense fallback

1. [Create an AdSense account](https://adsense.google.com/start/). In **Sites → New site**, add the site and
   follow its ownership verification and review instructions. You can use the dashboard's meta-tag verification
   option in the home page's `<head>` without enabling ad requests. Wait until the site is marked **Ready**.
   See [Google's site setup instructions](https://support.google.com/adsense/answer/12169212?hl=en).
2. Under **Ads → By ad unit → Display ads**, create a display unit named, for example, `Home sponsor fallback`.
   Choose Responsive when creating it; our CSS supplies a compact 728 × 90 desktop or 320 × 50 mobile container.
   From **Save and get code**, copy `data-ad-client` (`ca-pub-` plus 16 digits) and `data-ad-slot` (digits).
   See [Google's display-unit instructions](https://support.google.com/adsense/answer/9274025?hl=en).
3. Keep **Auto ads off** for this site, including anchor/vignette formats. Disable **Fill empty in-page ads**
   so an empty fallback does not introduce another promotion. Do not paste a second ad-unit snippet into the page;
   `home-ads.js` handles the single unit and loads Google's script only when the fallback is needed.
4. Complete your site's privacy disclosures and configure an appropriate consent solution before activation.
   For personalized ads in the EEA, UK, and Switzerland, Google requires a certified CMP integrated with TCF.
   Google's **Privacy & messaging** can provide its consent message; finish its setup and any required installation
   code, then verify consent behavior on this site. The loader is not a CMP, and this explicit enable switch is
   not visitor consent. See [Google's consent requirements](https://support.google.com/adsense/answer/13554116?hl=en).
5. Add the two public IDs to the same `home-sponsor` element, then enable the fallback:

   ```html
   data-adsense-client="ca-pub-1234567890123456"
   data-adsense-slot="1234567890"
   data-adsense-enabled="true"
   ```

   The numbers above illustrate the format; replace them with your approved account's values.
   Leave `data-ethicalads-publisher` empty if EthicalAds has not accepted the site: AdSense will run directly.
   Keep `data-adsense-enabled="false"` until account approval and privacy/consent setup are complete.
6. Follow any dashboard `ads.txt` instructions. It must be served at the hostname root, not a project subpath.
   For `https://2ecc3o.github.io/card-games-p2p/`, that means `https://2ecc3o.github.io/ads.txt`, usually published
   from the `2ecc3o.github.io` repository. A file at `/card-games-p2p/ads.txt` does not satisfy that root location.

## Why Carbon is not in the fallback chain

[Carbon's FAQ](https://www.carbonads.net/faq) currently requires exclusive advertising on participating sites
and says Carbon must not be used as backfill for other networks. It also targets developers and designers.
Use EthicalAds plus AdSense for this setup. A future Carbon integration would require a separate exclusive
configuration or written terms permitting your intended arrangement.

## Check and publish

- Run `node --test home-ads.test.js` for the loader's fill, no-fill, failure, timeout, and disabled-state checks.
- Run `npm test` and `npm run build` for the existing project checks.
- Serve the repository root (for example, `python -m http.server 8000`) and open the home page. With the checked-in
  empty IDs there should be no advertisement, blank strip, or third-party requests. Check at 375 × 667 and desktop.
- Once approved, use provider test/preview tools to check an actual creative and consent behavior. Do not click your
  own live ads. Automated checks simulate network responses; they do not prove account approval or live inventory.
- Merge to `main` when ready; the existing Pages workflow copies both `index.html` and `home-ads.js` into the site.
  Preparing this branch does not deploy anything.
