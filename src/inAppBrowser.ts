/**
 * Browsers built into social apps (Instagram, Facebook/Messenger, LINE, Snapchat, TikTok, WeChat, and
 * Android app web views) can restrict peer-to-peer connections, storage or sharing, so players are asked
 * to open the link in their real browser. Detection is by user agent, so it is best-effort.
 * Not listed: WhatsApp, which appears to open links in the system browser view rather than its own (not
 * checked on devices). Add patterns here if players report problems from another app.
 */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|\bLine\/|Snapchat|TikTok|musical_ly|Bytedance|MicroMessenger|; wv\)/i;

export const isInAppBrowser = (userAgent: string) => IN_APP.test(userAgent);
