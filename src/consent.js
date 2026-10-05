// src/consent.js
// Google Analytics is loaded only after the visitor opts in.
// Game data (answers, surveys, CSVs, uploaded files) is never sent anywhere;
// analytics only sees anonymous page usage. See public/privacy.html.

export const GA_ID = "G-B2Z5WS4KQR";
const KEY = "sab-analytics-consent"; // "granted" | "denied"
export const CONSENT_RESET_EVENT = "sab-consent-reset";

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
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // gtag requires the arguments object
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}
