// src/consent.js
// Google Analytics is loaded only after the visitor opts in.
// Game data (answers, surveys, CSVs, uploaded files) is never sent to analytics;
// analytics only sees anonymous page usage. See public/privacy.html.
// Choosing "No thanks" after "Allow" switches analytics off at once and deletes
// its cookies; nothing is loaded again on later visits.

export const GA_ID = "G-B2Z5WS4KQR";
const KEY = "lab-analytics-consent"; // "granted" | "denied"
export const CONSENT_RESET_EVENT = "lab-consent-reset";

export function getConsent() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setConsent(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable (private mode): choice lasts for this page view */
  }
  if (value === "granted") loadAnalytics();
  else stopAnalytics();
}

/** Clear the stored choice so the banner asks again. */
export function resetConsent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CONSENT_RESET_EVENT));
}

let loaded = false;
export function loadAnalytics() {
  if (typeof document === "undefined") return;
  window[`ga-disable-${GA_ID}`] = false;
  if (loaded) {
    window.gtag("consent", "update", { analytics_storage: "granted" });
    return;
  }
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // gtag requires the arguments object
  };
  // Analytics only: no advertising storage, signals or personalisation.
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 13 * 30 * 24 * 60 * 60, // about 13 months instead of Google's default 2 years
    // Report the page without its query string: ?deck= links can point at an instructor's files.
    page_location: `${window.location.origin}${window.location.pathname}`,
  });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

/** Switch analytics off for this page and remove its cookies (after a change of mind). */
export function stopAnalytics() {
  if (typeof document === "undefined") return;
  window[`ga-disable-${GA_ID}`] = true;
  if (loaded && window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
  const host = window.location.hostname;
  document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((name) => /^_ga(_|$)/.test(name)).forEach((name) => {
    [host, `.${host}`, ""].forEach((domain) => {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    });
  });
}
