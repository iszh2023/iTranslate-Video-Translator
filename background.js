/* global chrome */

const lastVoiceByLang = new Map();

function normalizeLangTag(tag) {
  const t = String(tag || "").trim();
  if (!t) return "";
  const parts = t.split("-");
  const base = (parts[0] || "").toLowerCase();
  const region = (parts[1] || "").toUpperCase();
  if (!region && base === "zh") return "zh-CN";
  return region ? `${base}-${region}` : base;
}

function pickBestVoice(voices, lang) {
  const want = normalizeLangTag(lang);
  const wantBase = want.split("-")[0] || "";
  const wantRegion = want.split("-")[1] || "";
  const key = want || "und";

  const remembered = lastVoiceByLang.get(key);
  if (remembered) {
    const stillThere = (voices || []).find((v) => String(v.voiceName || "") === remembered);
    if (stillThere) return stillThere;
    lastVoiceByLang.delete(key);
  }

  const matches = (voices || []).filter((v) => normalizeLangTag(v.lang).startsWith(want || wantBase));
  const pool = matches.length ? matches : voices || [];
  if (!pool.length) return null;

  const score = (v) => {
    const n = String(v?.voiceName || "").toLowerCase();
    const l = normalizeLangTag(v?.lang);
    let s = 0;
    if (n.includes("google")) s += 50;
    if (n.includes("wavenet")) s += 25;
    if (n.includes("neural2")) s += 25;
    if (n.includes("natural")) s += 20;
    if (n.includes("enhanced")) s += 20;
    if (n.includes("premium")) s += 20;
    if (n.includes("neural")) s += 10;
    if (v?.remote) s += 15;

    if (want && l === want) s += 40;
    if (wantBase && l.startsWith(wantBase)) s += 20;
    if (wantRegion && l.endsWith(`-${wantRegion}`)) s += 15;

    // Better defaults for Chinese: prefer Mandarin/Putonghua voices for zh/zh-CN.
    if (wantBase === "zh") {
      if (l === "zh-CN") s += 15;
      if (n.includes("mandarin")) s += 25;
      if (n.includes("putonghua")) s += 25;
      if (n.includes("普通话")) s += 25;
      if (n.includes("china") || n.includes("cn")) s += 10;
      // Favor clearer network voices for Chinese when available.
      if (v?.remote) s += 20;
      if (!v?.remote) s -= 22;
      if (n.includes("compact")) s -= 8;
      if (n.includes("standard")) s -= 4;
      // Slightly de-prioritize Cantonese/HK when user didn't ask.
      if (!wantRegion) {
        if (n.includes("cantonese") || n.includes("hong kong") || n.includes("hk") || n.includes("粤")) s -= 10;
      }
    }
    return s;
  };

  let best = pool[0];
  let bestScore = score(best);
  for (const v of pool) {
    const sc = score(v);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  if (best && key) lastVoiceByLang.set(key, String(best.voiceName || ""));
  return best || null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "VT_OPEN_URL") {
    const url = String(msg.url || "");
    if (!url) {
      sendResponse?.({ ok: false, error: "Missing url" });
      return;
    }
    try {
      chrome.tabs.create({ url }, () => {
        const err = chrome.runtime.lastError;
        if (err) sendResponse?.({ ok: false, error: String(err.message || err) });
        else sendResponse?.({ ok: true });
      });
      return true;
    } catch (e) {
      sendResponse?.({ ok: false, error: String(e?.message || e) });
      return;
    }
  }

  if (msg.type === "VT_TTS_STOP") {
    try {
      chrome.tts.stop();
    } catch {
      // ignore
    }
    sendResponse?.({ ok: true });
    return;
  }

  if (msg.type === "VT_TTS_SPEAK") {
    const text = String(msg.text || "");
    const lang = normalizeLangTag(msg.lang || "en") || "en";
    const rate = typeof msg.rate === "number" ? msg.rate : 1.0;
    const pitch = typeof msg.pitch === "number" ? msg.pitch : 1.0;
    const volume = typeof msg.volume === "number" ? msg.volume : 1.0;
    const interrupt = msg.interrupt !== false;
    const enqueue = !!msg.enqueue;
    const utteranceId = msg.utteranceId != null ? String(msg.utteranceId) : undefined;
    const tabId = _sender?.tab?.id;

    chrome.tts.getVoices((voices) => {
      try {
        if (interrupt) chrome.tts.stop();
        const best = pickBestVoice(voices || [], lang);
        chrome.tts.speak(text, {
          lang,
          rate,
          pitch,
          volume,
          voiceName: best?.voiceName,
          enqueue,
          utteranceId,
          onEvent: tabId == null ? undefined : (ev) => {
            try {
              chrome.tabs.sendMessage(tabId, { type: "VT_TTS_EVENT", event: ev, utteranceId });
            } catch {
              // ignore
            }
          },
        });
        sendResponse?.({ ok: true, voiceName: best?.voiceName || null });
      } catch (e) {
        sendResponse?.({ ok: false, error: String(e?.message || e) });
      }
    });
    return true; // async response
  }

  if (msg.type === "VT_TTS_VOICES") {
    chrome.tts.getVoices((voices) => {
      sendResponse?.({ ok: true, voices: voices || [] });
    });
    return true;
  }
});
