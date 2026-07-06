/**
 * Session timeout warning modal.
 * Warns users before their auth session expires and allows extending without a page refresh.
 */

import { ensureConfigLoaded, build_api_url } from "./fhh_load.js";

const DEFAULT_WARNING_SECONDS = 300;
const COUNTDOWN_INTERVAL_MS = 1000;

let warningTimeoutId = null;
let countdownIntervalId = null;
let expiresAtEpoch = 0;
let serverTimeOffsetSeconds = 0;
let warningSeconds = DEFAULT_WARNING_SECONDS;

const modalOverlay = () => document.getElementById("session-timeout-overlay");
const countdownElement = () => document.getElementById("session-timeout-countdown");
const extendButton = () => document.getElementById("session-extend-button");
const logoutButton = () => document.getElementById("session-logout-button");

function get_current_time_seconds() {
  return Math.floor(Date.now() / 1000) + serverTimeOffsetSeconds;
}

function get_remaining_seconds() {
  return Math.max(0, expiresAtEpoch - get_current_time_seconds());
}

function format_countdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clear_timers() {
  if (warningTimeoutId !== null) {
    clearTimeout(warningTimeoutId);
    warningTimeoutId = null;
  }
  if (countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

function update_countdown_display() {
  const countdown = countdownElement();
  if (countdown) {
    countdown.textContent = format_countdown(get_remaining_seconds());
  }
}

function show_modal() {
  const overlay = modalOverlay();
  if (!overlay) return;
  update_countdown_display();
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  extendButton()?.focus();

  if (countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
  }

  countdownIntervalId = setInterval(() => {
    const remaining = get_remaining_seconds();
    if (remaining <= 0) {
      clear_timers();
      redirect_to_logout();
      return;
    }
    update_countdown_display();
  }, COUNTDOWN_INTERVAL_MS);
}

function hide_modal() {
  const overlay = modalOverlay();
  if (!overlay) return;
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");

  if (countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

function redirect_to_logout() {
  window.location.href = build_api_url("/logout");
}

function schedule_warning() {
  clear_timers();

  const delayMs = Math.max(0, (get_remaining_seconds() - warningSeconds) * 1000);
  warningTimeoutId = setTimeout(() => {
    warningTimeoutId = null;
    show_modal();
  }, delayMs);
}

async function fetch_session_info() {
  const response = await fetch(build_api_url("/session"), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function extend_session() {
  const button = extendButton();
  if (button) {
    button.disabled = true;
    button.textContent = "Extending...";
  }

  try {
    const response = await fetch(build_api_url("/extend-session"), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to extend session (${response.status})`);
    }

    const data = await response.json();
    expiresAtEpoch = data.expires_at ?? expiresAtEpoch;
    if (typeof data.server_time === "number") {
      serverTimeOffsetSeconds =
        data.server_time - Math.floor(Date.now() / 1000);
    }
    hide_modal();
    schedule_warning();
  } catch (error) {
    console.error("Unable to extend session:", error);
    window.alert(
      "Unable to extend your session. Please save your work and log in again if needed."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Extend session";
    }
  }
}

function bind_modal_actions() {
  const extendBtn = extendButton();
  const logoutBtn = logoutButton();

  if (extendBtn) {
    extendBtn.addEventListener("click", extend_session);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", redirect_to_logout);
  }
}

async function init_session_timeout() {
  const overlay = modalOverlay();
  if (!overlay) {
    return;
  }

  try {
    const config = await ensureConfigLoaded();
    apiBaseUrl = config?.api?.baseUrl || "";
    warningSeconds = config?.session?.warningSeconds ?? DEFAULT_WARNING_SECONDS;

    const sessionInfo = await fetch_session_info();
    if (!sessionInfo || typeof sessionInfo.remaining_seconds !== "number") {
      console.log("Session timeout warning disabled (no active session endpoint).");
      return;
    }

    expiresAtEpoch = sessionInfo.expires_at;
    serverTimeOffsetSeconds =
      sessionInfo.server_time - Math.floor(Date.now() / 1000);

    if (get_remaining_seconds() <= 0) {
      redirect_to_logout();
      return;
    }

    bind_modal_actions();
    schedule_warning();
  } catch (error) {
    console.log("Session timeout warning disabled:", error);
  }
}

document.addEventListener("DOMContentLoaded", init_session_timeout);
