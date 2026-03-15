/* global chrome */

const DEFAULTS = {
  enabledGlobal: true,
  speak: false,
  reading: false,
  muteVideo: false, // legacy
  audioMix: 1.0, // 0=original only, 1=TTS only
  syncSpeech: true,
  slowVideo: false,
  baseSpeechRate: 1.0,
  targetLang: "auto",
  mode: "captions",
  onboarded: false,
  donateEnabled: true,
  donateIntervalMin: 10,
  donateLastAt: 0,
  donateFirstShown: false,
};

const LANGS = [
  ["auto", "Auto (detect from captions)"],
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["no", "Norwegian"],
  ["da", "Danish"],
  ["fi", "Finnish"],
  ["pl", "Polish"],
  ["cs", "Czech"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["uk", "Ukrainian"],
  ["ar", "Arabic"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["bn", "Bengali"],
  ["th", "Thai"],
  ["vi", "Vietnamese"],
  ["id", "Indonesian"],
  ["zh", "Chinese (Simplified)"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
];

function $(id) {
  return document.getElementById(id);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadSettings() {
  const got = await chrome.storage.sync.get(DEFAULTS);
  const merged = { ...DEFAULTS, ...got };
  // Migrate legacy muteVideo -> audioMix.
  if (got.audioMix == null && got.muteVideo === true) merged.audioMix = 1.0;
  merged.audioMix = Math.max(0, Math.min(1, Number(merged.audioMix) || 0));
  merged.baseSpeechRate = Math.max(0.4, Math.min(3.5, Number(merged.baseSpeechRate) || DEFAULTS.baseSpeechRate));
  return merged;
}

async function saveSettings(next) {
  await chrome.storage.sync.set(next);
}

function setErr(msg) {
  const el = $("err");
  if (!msg) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = msg;
}

function updateProviderVisibility(provider) {
  void provider;
}

function fillLangSelect() {
  const sel = $("targetLang");
  sel.textContent = "";
  for (const [code, name] of LANGS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code === "auto" ? name : `${name} (${code})`;
    sel.appendChild(opt);
  }
}

async function pushSettingsToTab(tabId, settings) {
  try {
    await chrome.runtime.sendMessage({ type: "VT_BG_INJECT", tabId });
    await chrome.tabs.sendMessage(tabId, { type: "VT_SETTINGS", settings });
  } catch {
    // Content script may not be injected on restricted pages.
  }
}

async function pushControlToTab(tabId, action) {
  try {
    await chrome.runtime.sendMessage({ type: "VT_BG_INJECT", tabId });
    await chrome.tabs.sendMessage(tabId, { type: "VT_CONTROL", action });
  } catch {
    // ignore
  }
}

async function pushNavToTab(tabId, view) {
  try {
    await chrome.runtime.sendMessage({ type: "VT_BG_INJECT", tabId });
    await chrome.tabs.sendMessage(tabId, { type: "VT_NAV", view });
  } catch {
    // ignore
  }
}

async function openDonateUrl() {
  try {
    await chrome.runtime.sendMessage({ type: "VT_OPEN_URL", url: "https://www.google.com/" });
  } catch {
    // ignore
  }
}

async function openSidebar(tabId) {
  try {
    await chrome.runtime.sendMessage({ type: "VT_BG_INJECT", tabId });
    await chrome.tabs.sendMessage(tabId, { type: "VT_OPEN" });
  } catch {
    // ignore
  }
}

function showView(name) {
  const views = ["viewStart", "viewInstructions", "viewControls"];
  for (const id of views) {
    const el = $(id);
    if (!el) continue;
    el.style.display = id === name ? "block" : "none";
  }
}

function shouldShowDonate(settings) {
  if (!settings.donateEnabled) return false;
  const now = Date.now();
  const intervalMs = Math.max(1, Number(settings.donateIntervalMin) || 10) * 60_000;
  const lastAt = Number(settings.donateLastAt) || 0;
  return now - lastAt >= intervalMs;
}

async function main() {
  fillLangSelect();

  const tab = await getActiveTab();
  const url = tab?.url || "";
  let host = "unknown";
  try {
    host = new URL(url).host || "unknown";
  } catch {
    // ignore
  }
  $("sitePill").textContent = `Site: ${host}`;

  const settings = await loadSettings();
  const enabledEl = $("enabledGlobal");
  const speakEl = $("speak");
  const mixEl = $("audioMix");
  const syncEl = $("syncSpeech");
  const slowVideoEl = $("slowVideo");
  const speedEl = $("speechSpeed");
  const speedValEl = $("speechSpeedVal");
  const targetEl = $("targetLang");
  const modeEl = $("mode");

  if (enabledEl) enabledEl.checked = !!settings.enabledGlobal;
  if (speakEl) speakEl.checked = !!settings.speak;
  if (mixEl) mixEl.value = String(settings.audioMix ?? DEFAULTS.audioMix);
  if (syncEl) syncEl.checked = settings.syncSpeech !== false;
  if (slowVideoEl) slowVideoEl.checked = !!settings.slowVideo;
  if (targetEl) targetEl.value = settings.targetLang;
  if (modeEl) modeEl.value = settings.mode || "captions";
  if (speedEl) {
    const v = Number(settings.baseSpeechRate ?? DEFAULTS.baseSpeechRate);
    speedEl.value = String(Number.isFinite(v) ? v : DEFAULTS.baseSpeechRate);
  }
  if (speedValEl) {
    speedValEl.textContent = `${Number(speedEl?.value ?? DEFAULTS.baseSpeechRate).toFixed(2)}×`;
  }
  speedEl?.addEventListener("input", () => {
    if (!speedValEl) return;
    speedValEl.textContent = `${Number(speedEl.value).toFixed(2)}×`;
  });

  // Apply common sliders immediately (users often expect the bar to take effect without pressing Save).
  const pushQuick = async (partial) => {
    try {
      await chrome.storage.sync.set(partial);
    } catch {
      // ignore
    }
    if (tab?.id != null) {
      await pushSettingsToTab(tab.id, partial);
    }
  };

  mixEl?.addEventListener("input", () => {
    const audioMix = Math.max(0, Math.min(1, Number(mixEl.value) || 0));
    void pushQuick({ audioMix });
  });

  speedEl?.addEventListener("input", () => {
    const baseSpeechRate = Number(speedEl.value) || DEFAULTS.baseSpeechRate;
    void pushQuick({ baseSpeechRate });
  });

  syncEl?.addEventListener("change", () => {
    void pushQuick({ syncSpeech: !!syncEl.checked });
  });

  slowVideoEl?.addEventListener("change", () => {
    void pushQuick({ slowVideo: !!slowVideoEl.checked });
  });

  if (!settings.onboarded) showView("viewStart");
  else showView("viewControls");

  const donateCard = $("donateCard");
  if (donateCard && shouldShowDonate(settings)) {
    donateCard.style.display = "block";
    const snooze = async () => {
      const now = Date.now();
      const next = { ...(await loadSettings()), donateLastAt: now, donateFirstShown: true };
      await saveSettings(next);
      if (tab?.id != null) await pushSettingsToTab(tab.id, next);
    };
    $("donateNo")?.addEventListener("click", async () => {
      await snooze();
      window.close();
    });
    $("donateYes")?.addEventListener("click", async () => {
      await snooze();
      await openDonateUrl();
      window.close();
    });
  }

  const scrollBox = $("instructionsScroll");
  const btnOk = $("btnOk");
  if (scrollBox && btnOk) {
    const check = () => {
      const atBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 2;
      btnOk.disabled = !atBottom;
      btnOk.textContent = atBottom ? "OK" : "OK (scroll down)";
    };
    scrollBox.addEventListener("scroll", check);
    check();
  }

  $("btnStart")?.addEventListener("click", async () => {
    showView("viewInstructions");
  });

  const finishOnboarding = async () => {
    const next = { ...settings, onboarded: true };
    await saveSettings(next);
    showView("viewControls");
  };
  $("btnOk")?.addEventListener("click", finishOnboarding);
  $("btnSkip")?.addEventListener("click", finishOnboarding);

  $("btnSave").addEventListener("click", async () => {
    setErr("");
    const next = {
      enabledGlobal: enabledEl?.checked ?? true,
      speak: speakEl?.checked ?? false,
      reading: settings.reading ?? false,
      audioMix: Math.max(0, Math.min(1, Number(mixEl?.value ?? settings.audioMix ?? DEFAULTS.audioMix) || 0)),
      syncSpeech: syncEl?.checked ?? true,
      slowVideo: slowVideoEl?.checked ?? false,
      baseSpeechRate: Number(speedEl?.value ?? DEFAULTS.baseSpeechRate) || DEFAULTS.baseSpeechRate,
      targetLang: targetEl?.value ?? "en",
      mode: modeEl?.value ?? "captions",
      onboarded: true,
      donateEnabled: settings.donateEnabled ?? true,
      donateIntervalMin: settings.donateIntervalMin ?? 10,
      donateLastAt: settings.donateLastAt ?? 0,
      donateFirstShown: settings.donateFirstShown ?? false,
    };

    await saveSettings(next);
    if (tab?.id != null) await pushSettingsToTab(tab.id, next);
    window.close();
  });

  $("btnOpen").addEventListener("click", async () => {
    setErr("");
    if (tab?.id != null) {
      await openSidebar(tab.id);
    }
    window.close();
  });

  $("btnRead")?.addEventListener("click", async () => {
    setErr("");
    const next = {
      enabledGlobal: true,
      speak: true,
      reading: true,
      audioMix: Math.max(0, Math.min(1, Number(mixEl?.value ?? settings.audioMix ?? DEFAULTS.audioMix) || 0)),
      syncSpeech: syncEl?.checked ?? settings.syncSpeech,
      slowVideo: slowVideoEl?.checked ?? settings.slowVideo,
      baseSpeechRate: Number(speedEl?.value ?? settings.baseSpeechRate ?? DEFAULTS.baseSpeechRate) || DEFAULTS.baseSpeechRate,
      targetLang: targetEl?.value ?? settings.targetLang,
      mode: modeEl?.value ?? settings.mode,
      onboarded: true,
    };
    await saveSettings(next);
    if (tab?.id != null) {
      await pushSettingsToTab(tab.id, next);
      await openSidebar(tab.id);
      await pushControlToTab(tab.id, "start");
    }
    window.close();
  });

  $("btnStop")?.addEventListener("click", async () => {
    setErr("");
    const next = {
      ...(await loadSettings()),
      reading: false,
      speak: false,
      onboarded: true,
    };
    await saveSettings(next);
    if (tab?.id != null) {
      await pushSettingsToTab(tab.id, next);
      await pushControlToTab(tab.id, "stop");
    }
    window.close();
  });
}

main().catch((e) => setErr(String(e?.stack || e)));
