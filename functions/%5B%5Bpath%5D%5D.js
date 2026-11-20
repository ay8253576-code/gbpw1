import missingBatchesData from "../data/missing-batches.json";

const TARGET_HOST = "www.learnxpw.site";
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const SECONDARY_ORIGIN = "https://gbstudyphysicswallah.pages.dev";
const MARCO_ORIGIN = "https://pwmarco-backup-2-abc745d8bc54.herokuapp.com";
const BRAND_NAME = "GB STUDY";
const TELEGRAM_URL = "https://t.me/GBFreestudy";
const OWNER_TG_URL = "https://t.me/sarvottamji";
const ICON_URL = "https://i.ibb.co/Q3g9fGSt/1791541921524.png";
const SEC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const videoUuidMap = new Map();
const OLD_ICON_URL = "https://i.ibb.co/V8CbjrG/image.png";
const OLD_TG_URL = "https://t.me/+AgMz8cG-x8VmNGY1";
const OLD_TG_URL_ALT = "https://t.me/AgMz8cG-x8VmNGY1";

let cachedAccessCookie = "studymeta_access=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6ImZ1bGwiLCJpYXQiOjE3OTM2MjM4ODAsImV4cCI6MTc5MzcxMDI4MH0.RRjEAcW3pPiuWyKF6EDDgK0epLc-gCLCVMna1DFk_nA";
let refreshPromise = null;
let cachedSecCookie = "";
let lxTotalBatches = 14525;
let lxTotalPages = 727;

const missingBatches = Array.isArray(missingBatchesData) ? missingBatchesData : [];
const knownMissingIds = new Set(missingBatches.map((b) => String(b._id || "")).filter(Boolean));
const missingBatchIndex = missingBatches.map((b) => ({
  batch: b,
  nameLower: String(b.name || "").toLowerCase(),
  searchStr: `${b.name || ""} ${b.byName || ""} ${b._id || ""} ${b.language || ""}`.toLowerCase(),
  startTime: Date.parse(b.startDate || "") || 0
}));

function normalizeBatchObj(b) {
  const raw = b && b.raw && typeof b.raw === "object" ? b.raw : {};
  const rawImg = raw.previewImage && typeof raw.previewImage === "object" && raw.previewImage.baseUrl && raw.previewImage.key
    ? `${raw.previewImage.baseUrl}${raw.previewImage.key}`
    : (typeof raw.previewImage === "string" ? raw.previewImage : "");
  const img = b.batchImage || b.previewImage || b.photo || b.image || b.batch_image || rawImg || "";
  return {
    _id: String(b._id || b.batchId || b.id || b.batch_id || ""),
    name: String(b.batchName || b.name || raw.name || ""),
    byName: String(b.byName || raw.byName || ""),
    startDate: String(b.startDate || b.start_date || raw.startDate || ""),
    endDate: String(b.endDate || b.end_date || raw.endDate || ""),
    language: String(b.language || raw.language || "Hinglish"),
    previewImage: String(img).startsWith("http") ? String(img) : ICON_URL,
    feeTotal: Number(b.batchPrice ?? b.feeTotal ?? b.amount ?? b.price ?? raw.fee?.total ?? 0),
    type: String(b.template || b.type || raw.type || "NORMAL")
  };
}

function parseCookieVal(cookieHeader, name) {
  if (!cookieHeader) return "";
  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return "";
}

function mergeSetCookies(existing, setCookieHeaders) {
  const map = new Map();
  if (existing) {
    for (const part of existing.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : (setCookieHeaders ? [setCookieHeaders] : []);
  for (const sc of arr) {
    const kv = String(sc).split(";")[0].trim();
    const eq = kv.indexOf("=");
    if (eq > 0) map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function getSetCookieList(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const sc = headers.get("set-cookie");
  return sc ? [sc] : [];
}

function normalizeSearchText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[()[\]{}+,&/\\|:\-]+/g, " ")
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreBatchForQuery(batch, normQ, tokens) {
  if (!normQ || !tokens || tokens.length === 0) return 10;
  const normName = normalizeSearchText(batch.name || batch.batchName || "");
  const normSearch = normalizeSearchText(`${batch.name || batch.batchName || ""} ${batch.byName || ""} ${batch._id || batch.batchId || ""} ${batch.language || ""}`);
  for (let t = 0; t < tokens.length; t++) {
    if (!normSearch.includes(tokens[t])) return 0;
  }
  if (normName === normQ) return 40;
  if (normName.startsWith(normQ)) return 35;
  if (normName.includes(normQ)) return 30;
  let allInName = true;
  for (let t = 0; t < tokens.length; t++) {
    if (!normName.includes(tokens[t])) {
      allInName = false;
      break;
    }
  }
  return allInName ? 20 : 10;
}

function searchMissingBatches(query) {
  const q = normalizeSearchText(query);
  if (!q || missingBatchIndex.length === 0) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const matches = [];
  for (let i = 0; i < missingBatchIndex.length; i++) {
    const item = missingBatchIndex[i];
    if (!item.normSearchStr) {
      item.normName = normalizeSearchText(item.batch.name);
      item.normSearchStr = normalizeSearchText(item.searchStr);
    }
    let matchedCount = 0;
    for (let t = 0; t < tokens.length; t++) {
      if (item.normSearchStr.includes(tokens[t])) matchedCount++;
    }
    if (matchedCount === tokens.length) {
      let score = 10;
      if (item.normName === q) score = 40;
      else if (item.normName.startsWith(q)) score = 35;
      else if (item.normName.includes(q)) score = 30;
      else {
        let allInName = true;
        for (let t = 0; t < tokens.length; t++) {
          if (!item.normName.includes(tokens[t])) {
            allInName = false;
            break;
          }
        }
        if (allInName) score = 20;
      }
      matches.push({ batch: item.batch, score, startTime: item.startTime });
    }
  }
  matches.sort((a, b) => (b.score - a.score) || (b.startTime - a.startTime));
  return matches.map((m) => m.batch);
}

function base64UrlDecode(str) {
  try {
    let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return atob(b64);
  } catch {
    return "";
  }
}

function isTokenExpired(cookieStr) {
  try {
    const rawJwt = cookieStr.replace(/^studymeta_access=/, "").split(";")[0];
    const parts = rawJwt.split(".");
    if (parts.length < 2) return true;
    const decoded = base64UrlDecode(parts[1]);
    if (!decoded) return true;
    const payload = JSON.parse(decoded);
    if (!payload.exp) return true;
    return Math.floor(Date.now() / 1e3) >= payload.exp - 7200;
  } catch {
    return true;
  }
}

async function fetchFreshAccessCookie() {
  try {
    const anonId = "anon_" + Date.now();
    const keyGenUrl = `${TARGET_ORIGIN}/key-generate?redirect=%2Fstudy%2Fbatches&type=full&anon_id=${anonId}`;
    const res = await fetch(keyGenUrl, {
      headers: {
        "user-agent": SEC_UA,
        referer: `${TARGET_ORIGIN}/study/batches`,
        cookie: `anon_id=${anonId}`
      }
    });
    const pageText = await res.text();
    const m = pageText.match(/\\?"token\\?":\s*\\?"([^"\\]+)\\?"/);
    if (!m || !m[1]) {
      return cachedAccessCookie;
    }
    const token = m[1];
    const verifyRes = await fetch(`${TARGET_ORIGIN}/api/complete-verification`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": SEC_UA,
        referer: `${TARGET_ORIGIN}/verify?token=${encodeURIComponent(token)}`
      },
      body: JSON.stringify({ token })
    });
    const setCookies = getSetCookieList(verifyRes.headers);
    for (const sc of setCookies) {
      if (sc.includes("studymeta_access=")) {
        const match = sc.match(/studymeta_access=[^;]+/);
        if (match) {
          cachedAccessCookie = match[0];
          return cachedAccessCookie;
        }
      }
    }
  } catch (err) {
    console.error("[Cloudflare Edge] Failed to auto-refresh access cookie:", err);
  }
  return cachedAccessCookie;
}

async function getAccessCookie() {
  if (cachedAccessCookie && !isTokenExpired(cachedAccessCookie)) {
    return cachedAccessCookie;
  }
  if (!refreshPromise) {
    refreshPromise = fetchFreshAccessCookie().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function injectMpdBaseUrl(mpdText, mediaUrl) {
  if (!mpdText || /<BaseURL[\s>]/i.test(mpdText)) return mpdText;
  try {
    const u = new URL(mediaUrl);
    const dirPath = u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1);
    const baseDir = `${u.origin}${dirPath}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return mpdText.replace(/(<MPD\b[^>]*>)/i, `$1<BaseURL>${baseDir}</BaseURL>`);
  } catch {
    return mpdText;
  }
}

function transformText(content, isHtml = false) {
  let text = content;
  text = text.replaceAll("https://www.learnxpw.site", "");
  text = text.replaceAll("http://www.learnxpw.site", "");
  text = text.replaceAll("https:\\/\\/www.learnxpw.site", "");
  text = text.replaceAll("https://learnxpw.site", "");
  text = text.replaceAll("http://learnxpw.site", "");
  text = text.replaceAll("https:\\/\\/learnxpw.site", "");
  text = text.replaceAll(OLD_ICON_URL, ICON_URL);
  text = text.replaceAll(
    "https:\\/\\/i.ibb.co\\/V8CbjrG\\/image.png",
    ICON_URL.replace(/\//g, "\\/")
  );
  text = text.replaceAll("V8CbjrG/image.png", "Q3g9fGSt/1791541921524.png");
  text = text.replaceAll("V8CbjrG\\/image.png", "Q3g9fGSt\\/1791541921524.png");
  text = text.replaceAll("https://ibb.co/0R7qc34v", ICON_URL);
  text = text.replaceAll(
    "https:\\/\\/ibb.co\\/0R7qc34v",
    ICON_URL.replace(/\//g, "\\/")
  );
  text = text.replaceAll(OLD_TG_URL, TELEGRAM_URL);
  text = text.replaceAll(
    "https:\\/\\/t.me\\/+AgMz8cG-x8VmNGY1",
    TELEGRAM_URL.replace(/\//g, "\\/")
  );
  text = text.replaceAll(OLD_TG_URL_ALT, TELEGRAM_URL);
  text = text.replaceAll(
    "https:\\/\\/t.me\\/AgMz8cG-x8VmNGY1",
    TELEGRAM_URL.replace(/\//g, "\\/")
  );
  text = text.replaceAll("://t.me/+AgMz8cG-x8VmNGY1", "://t.me/GBFreestudy");
  text = text.replaceAll(":\\/\\/t.me\\/+AgMz8cG-x8VmNGY1", ":\\/\\/t.me\\/GBFreestudy");
  text = text.replaceAll("+AgMz8cG-x8VmNGY1", "GBFreestudy");
  text = text.replaceAll("AgMz8cG-x8VmNGY1", "GBFreestudy");
  text = text.replaceAll("https://t.me/LearnX_9/58", TELEGRAM_URL);
  text = text.replaceAll("https:\\/\\/t.me\\/LearnX_9\\/58", TELEGRAM_URL.replace(/\//g, "\\/"));
  text = text.replaceAll("LearnX_9/58", "GBFreestudy");
  text = text.replaceAll("LearnX_9\\/58", "GBFreestudy");
  text = text.replaceAll("https://t.me/Mikkimeoww", OWNER_TG_URL);
  text = text.replaceAll("https:\\/\\/t.me\\/Mikkimeoww", OWNER_TG_URL.replace(/\//g, "\\/"));
  text = text.replace(/mikkimeoww/gi, "sarvottamji");
  text = text.replaceAll("@bookverse_probot", "@sarvottamji");
  text = text.replaceAll('"webName":"Learnxpw"', `"webName":"${BRAND_NAME}"`);
  text = text.replaceAll(
    '"sidebarTitle":"Learnxpw"',
    `"sidebarTitle":"${BRAND_NAME}"`
  );
  text = text.replaceAll(
    "Learnxpw \u2014 a comprehensive online study platform",
    `${BRAND_NAME} \u2014 a comprehensive online study platform`
  );
  text = text.replaceAll("<title>Learnxpw</title>", `<title>${BRAND_NAME}</title>`);
  text = text.replaceAll("\xA9 2026 Learnxpw", `\xA9 2026 ${BRAND_NAME}`);
  text = text.replaceAll("\xA9 2025 Learnxpw", `\xA9 2025 ${BRAND_NAME}`);
  text = text.replaceAll("Learnxpw", BRAND_NAME);
  text = text.replaceAll("LEARNXPW", BRAND_NAME);
  text = text.replaceAll("learnxpw", BRAND_NAME);
  text = text.replaceAll(/"shortner_servers":\[[^\]]*\]/g, '"shortner_servers":[]');
  text = text.replaceAll(/\\"shortner_servers\\":\[[^\]]*\]/g, '\\"shortner_servers\\":[]');
  text = text.replaceAll('"isDirectLoginOpen":false', '"isDirectLoginOpen":true');

  const HIDE_SIDEBAR_CSS = `aside nav a[href="/study/pi"],aside nav a[href^="/study/pi/"],aside nav a[href="/study/nexttoppers"],aside nav a[href^="/study/nexttoppers/"],aside nav a[href="/study/missionjeet"],aside nav a[href^="/study/missionjeet/"],aside nav a[href="/study/vibrant"],aside nav a[href^="/study/vibrant/"],aside nav a[href="/study/sway"],aside nav a[href^="/study/sway/"],aside nav a[data-pw-books="1"]{display:none!important;}`;
  const EXISTING_HEAD_SCRIPT = `document.querySelectorAll('body link[rel="icon"], body link[rel="apple-touch-icon"]').forEach(el => document.head.appendChild(el))`;
  const ENHANCED_HEAD_SCRIPT = `${EXISTING_HEAD_SCRIPT};
(function() {
  if (typeof window === 'undefined') return;
  var pwIconUrl = 'https://i.ibb.co/Q3g9fGSt/1791541921524.png';

  function injectSidebarHideCss() {
    try {
      if (document.getElementById('gb-sidebar-hide')) return;
      var st = document.createElement('style');
      st.id = 'gb-sidebar-hide';
      st.textContent = '${HIDE_SIDEBAR_CSS}';
      (document.head || document.documentElement).appendChild(st);
    } catch(e) {}
  }

  function getPoweredByEl() {
    var existing = document.querySelectorAll('#gb-powered-by');
    for (var i = 1; i < existing.length; i++) {
      if (existing[i].parentNode) existing[i].parentNode.removeChild(existing[i]);
    }
    var pBox = existing[0];
    if (!pBox) {
      pBox = document.createElement('div');
      pBox.id = 'gb-powered-by';
      pBox.className = 'w-full text-center py-6 mt-4 mb-2 flex justify-center items-center text-sm text-slate-400 font-medium tracking-wide';
      pBox.innerHTML = 'Powered by&nbsp;<a href="https://t.me/sarvottamji" target="_blank" rel="noopener noreferrer" class="font-bold underline underline-offset-4 transition-colors" style="color: #ef4444 !important; font-weight: 700; text-decoration: underline; text-underline-offset: 4px;"><span style="color: #ef4444 !important;">GB STUDY</span></a>';
    }
    return pBox;
  }

  function injectPoweredBy() {
    try {
      var allButtons = document.querySelectorAll('button');
      var loadMoreWrap = null;
      for (var i = 0; i < allButtons.length; i++) {
        var txt = (allButtons[i].textContent || '').trim();
        if (txt === 'Load More' || txt === 'Loading...') {
          loadMoreWrap = allButtons[i].closest('.flex.justify-center') || allButtons[i].parentElement;
          if (loadMoreWrap && loadMoreWrap.parentElement) break;
        }
      }
      var pBox = getPoweredByEl();
      if (loadMoreWrap && loadMoreWrap.parentElement) {
        if (loadMoreWrap.nextElementSibling !== pBox) {
          loadMoreWrap.insertAdjacentElement('afterend', pBox);
        }
        return;
      }
      var parentBox = null;
      var grids = document.querySelectorAll('.grid');
      if (grids.length > 0) parentBox = grids[grids.length - 1].parentElement;
      if (!parentBox) parentBox = document.querySelector('main') || document.body;
      if (parentBox && parentBox.lastElementChild !== pBox) {
        parentBox.appendChild(pBox);
      }
    } catch(e) {}
  }

  function fixContactLinks() {
    try {
      if (!window.location.pathname.startsWith('/contact')) return;
      var links = document.querySelectorAll('main a[href]');
      links.forEach(function(a) {
        var txt = (a.textContent || '').trim().toLowerCase();
        if (txt === 'join channel') {
          if (a.getAttribute('href') !== 'https://t.me/GBFreestudy') {
            a.setAttribute('href', 'https://t.me/GBFreestudy');
          }
        } else if (txt === 'message on telegram' || txt === 'developer' || txt === 'telegram bot') {
          if (a.getAttribute('href') !== 'https://t.me/sarvottamji') {
            a.setAttribute('href', 'https://t.me/sarvottamji');
          }
        }
      });
    } catch(e) {}
  }

  function fixMissingBatchBanners() {
    try {
      var imgs = document.querySelectorAll('img');
      imgs.forEach(function(img) {
        var s = img.getAttribute('src') || img.src || '';
        if (!s || s.trim() === '' || s.includes('undefined') || s.includes('null')) {
          img.src = pwIconUrl;
        }
        if (!img.dataset.pwErrorBound) {
          img.dataset.pwErrorBound = '1';
          img.addEventListener('error', function() {
            this.src = pwIconUrl;
          });
        }
      });
    } catch(e) {}
  }

  var isHydrated = false;
  var observerBound = false;

  function bindDomObserver() {
    if (observerBound || typeof MutationObserver === 'undefined') return;
    var target = document.querySelector('main') || document.body;
    if (!target) return;
    observerBound = true;
    var scheduled = false;
    var obs = new MutationObserver(function() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function() {
        scheduled = false;
        runAll();
      });
    });
    obs.observe(target, { childList: true, subtree: true });
  }

  function enableEnhancer() {
    if (isHydrated) return;
    isHydrated = true;
    bindDomObserver();
    runAll();
    setInterval(runAll, 500);
  }

  if (typeof window !== 'undefined') {
    injectSidebarHideCss();
    window.addEventListener('load', function() {
      injectSidebarHideCss();
      setTimeout(enableEnhancer, 1000);
    });
    setTimeout(enableEnhancer, 2000);

    ['pointerdown', 'touchstart', 'click', 'scroll'].forEach(function(evt) {
      window.addEventListener(evt, function() {
        enableEnhancer();
        setTimeout(runAll, 50);
      }, { passive: true });
    });
  }

  function runAll() {
    if (!isHydrated) return;
    injectSidebarHideCss();
    injectPoweredBy();
    fixContactLinks();
    fixMissingBatchBanners();
  }
})();`;

  if (text.includes(EXISTING_HEAD_SCRIPT)) {
    text = text.replace(EXISTING_HEAD_SCRIPT, ENHANCED_HEAD_SCRIPT);
  }
  if (isHtml && text.includes("</head>") && !text.includes('id="gb-sidebar-hide"')) {
    text = text.replace("</head>", `<style id="gb-sidebar-hide">${HIDE_SIDEBAR_CSS}</style></head>`);
  }
  return text;
}

const STRIP_OUTGOING_HEADERS = new Set([
  "host",
  "origin",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "accept-encoding",
  "x-matched-path",
  "x-vercel-matched-path",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
  "true-client-ip",
  "cdn-loop",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "cf-worker"
]);

async function handleEdgeRequest(req, env, _ctx) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*"
      }
    });
  }

  if (pathname === "/") {
    if (url.searchParams.get("home") !== "1") {
      return Response.redirect(`${url.origin}/study/batches`, 307);
    }
  }

  if (pathname === "/key-generate") {
    const accessCookie2 = await getAccessCookie();
    const target = url.searchParams.get("redirect") || "/study/batches";
    const headers = new Headers();
    if (accessCookie2) {
      headers.set("Set-Cookie", `${accessCookie2}; Path=/; SameSite=Lax; Max-Age=86400`);
    }
    headers.set("Location", target.startsWith("http") ? target : `${url.origin}${target}`);
    return new Response(null, { status: 307, headers });
  }

  if (pathname === "/verify") {
    const accessCookie2 = await getAccessCookie();
    const headers = new Headers();
    if (accessCookie2) {
      headers.set("Set-Cookie", `${accessCookie2}; Path=/; SameSite=Lax; Max-Age=86400`);
    }
    headers.set("Location", `${url.origin}/study/batches`);
    return new Response(null, { status: 307, headers });
  }

  if (pathname === "/study/key") {
    return Response.redirect(`${url.origin}/study/batches`, 307);
  }

  if (pathname === "/logo.png") {
    if (env && env.ASSETS) {
      try {
        const assetRes = await env.ASSETS.fetch(req);
        if (assetRes && assetRes.ok) return assetRes;
      } catch {
      }
    }
    return Response.redirect(ICON_URL, 307);
  }

  if (pathname === "/api/auth/serverInfo") {
    return new Response(
      JSON.stringify({
        webName: BRAND_NAME,
        sidebarLogoUrl: ICON_URL,
        sidebarTitle: BRAND_NAME,
        maintenanceMode: false,
        tg_channel: TELEGRAM_URL,
        tg_username: "@sarvottamji",
        isDirectLoginOpen: true,
        tg_bot: "@sarvottamji",
        shortner_servers: []
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  const jsonCorsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  let refererHeader = `${TARGET_ORIGIN}/`;
  const incomingReferer = req.headers.get("referer");
  if (incomingReferer) {
    try {
      const u = new URL(incomingReferer);
      u.protocol = "https:";
      u.host = TARGET_HOST;
      refererHeader = u.toString();
    } catch {
      refererHeader = `${TARGET_ORIGIN}/`;
    }
  }
  if (
    pathname.startsWith("/api/video-url") ||
    pathname.startsWith("/api/get-video-url") ||
    pathname.startsWith("/api/Schedule") ||
    pathname.startsWith("/api/play") ||
    pathname.startsWith("/api/get-otp")
  ) {
    const q = url.searchParams;
    const batchId = q.get("batch_id") || q.get("batchId") || q.get("BatchId") || "";
    const subjectId = q.get("subject_id") || q.get("subjectId") || q.get("SubjectId") || "";
    const videoId = q.get("video_id") || q.get("videoId") || q.get("childId") || q.get("ChildId") || q.get("contentId") || q.get("ContentId") || "";
    if (batchId || subjectId || videoId) {
      refererHeader = `${TARGET_ORIGIN}/watch?batchId=${batchId}&SubjectId=${subjectId}&ContentId=${videoId}`;
    } else {
      refererHeader = `${TARGET_ORIGIN}/watch`;
    }
  }

  const fetchPrimaryAuth = async (targetPathAndQuery, refUrl) => {
    let cookie = await getAccessCookie();
    const doFetch = (c) =>
      fetch(`${TARGET_ORIGIN}${targetPathAndQuery}`, {
        headers: {
          "user-agent": req.headers.get("user-agent") || SEC_UA,
          referer: refUrl,
          cookie: c
        }
      });
    let r = await doFetch(cookie);
    if (r.status === 401 || r.status === 403 || r.status === 307) {
      cachedAccessCookie = "";
      cookie = await fetchFreshAccessCookie();
      r = await doFetch(cookie);
    }
    return r;
  };

  const fetchSecJsonOnce = async (pathAndQuery, extraCookie = "", timeoutMs = 8000) => {
    const cookieToSend = extraCookie || cachedSecCookie;
    try {
      const hdrs = {
        "user-agent": SEC_UA,
        referer: `${SECONDARY_ORIGIN}/study/batches`
      };
      if (cookieToSend) hdrs.cookie = cookieToSend;
      const r = await fetch(`${SECONDARY_ORIGIN}${pathAndQuery}`, {
        headers: hdrs,
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
      });
      const sc = getSetCookieList(r.headers);
      let updatedCookie = cookieToSend;
      if (sc.length > 0) {
        updatedCookie = mergeSetCookies(cookieToSend, sc);
        cachedSecCookie = mergeSetCookies(cachedSecCookie, sc);
      }
      if (!r.ok) return { status: r.status, data: null, cookie: updatedCookie };
      const data = await r.json().catch(() => null);
      return { status: r.status, data, cookie: updatedCookie };
    } catch {
      return { status: 500, data: null, cookie: cookieToSend };
    }
  };

  const fetchSecJson = async (pathAndQuery, extraCookie = "") => {
    let res = await fetchSecJsonOnce(pathAndQuery, extraCookie);
    if (!res.data || res.status >= 500) {
      res = await fetchSecJsonOnce(pathAndQuery, res.cookie || extraCookie);
    }
    return res;
  };

  const fetchMarcoJsonOnce = async (pathAndQuery, timeoutMs = 10000) => {
    try {
      const r = await fetch(`${MARCO_ORIGIN}${pathAndQuery}`, {
        headers: {
          "user-agent": SEC_UA,
          accept: "application/json",
          referer: `${MARCO_ORIGIN}/pw`
        },
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
      });
      if (!r.ok) return { status: r.status, data: null };
      const data = await r.json().catch(() => null);
      return { status: r.status, data };
    } catch {
      return { status: 500, data: null };
    }
  };

  const fetchMarcoJson = async (pathAndQuery, timeoutMs = 10000) => {
    let res = await fetchMarcoJsonOnce(pathAndQuery, timeoutMs);
    if (!res.data || res.status >= 500) {
      res = await fetchMarcoJsonOnce(pathAndQuery, timeoutMs);
    }
    return res;
  };

  const fetchMarcoText = async (pathAndQuery, timeoutMs = 10000) => {
    try {
      const fullUrl = String(pathAndQuery).startsWith("http") ? String(pathAndQuery) : `${MARCO_ORIGIN}${pathAndQuery}`;
      const r = await fetch(fullUrl, {
        headers: {
          "user-agent": SEC_UA,
          referer: `${MARCO_ORIGIN}/pw/player`
        },
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
      });
      const body = await r.text();
      return { status: r.status, headers: r.headers, body };
    } catch {
      return { status: 500, headers: new Headers(), body: "" };
    }
  };

  const parseWatchIdsEdge = () => {
    const q = url.searchParams;
    let batchId = q.get("batchId") || q.get("BatchId") || q.get("batch_id") || "";
    let subjectId = q.get("subjectId") || q.get("SubjectId") || q.get("subject_id") || "";
    let contentId = q.get("contentId") || q.get("ContentId") || q.get("childId") || q.get("ChildId") || q.get("videoId") || q.get("video_id") || "";
    if (incomingReferer && (!batchId || !subjectId || !contentId)) {
      try {
        const refU = new URL(incomingReferer);
        batchId = batchId || refU.searchParams.get("batchId") || refU.searchParams.get("BatchId") || "";
        subjectId = subjectId || refU.searchParams.get("SubjectId") || refU.searchParams.get("subjectId") || "";
        contentId = contentId || refU.searchParams.get("ContentId") || refU.searchParams.get("ChildId") || refU.searchParams.get("videoId") || "";
      } catch {
      }
    }
    if ((!batchId || !subjectId || !contentId) && q.get("path")) {
      const m = String(q.get("path")).match(/\/([^/]+)\/master\.(?:m3u8|mpd)/i);
      if (m && m[1] && videoUuidMap.has(m[1])) {
        const cached = videoUuidMap.get(m[1]);
        batchId = batchId || cached.batchId;
        subjectId = subjectId || cached.subjectId;
        contentId = contentId || cached.contentId;
      }
    }
    const cookieHeader = req.headers.get("cookie") || "";
    if ((!batchId || !subjectId || !contentId) && cookieHeader) {
      const rawWatch = parseCookieVal(cookieHeader, "gb_sec_watch");
      if (rawWatch) {
        try {
          const w = JSON.parse(rawWatch);
          batchId = batchId || w.batchId || "";
          subjectId = subjectId || w.subjectId || "";
          contentId = contentId || w.contentId || "";
        } catch {
        }
      }
    }
    return { batchId, subjectId, contentId };
  };

  if (pathname === "/api/Schedule") {
    const batchId = url.searchParams.get("BatchId") || url.searchParams.get("batchId") || url.searchParams.get("batch_id") || "";
    const subjectId = url.searchParams.get("SubjectId") || url.searchParams.get("subjectId") || url.searchParams.get("subject_id") || "";
    const contentId = url.searchParams.get("ContentId") || url.searchParams.get("contentId") || url.searchParams.get("ChildId") || url.searchParams.get("childId") || url.searchParams.get("videoId") || url.searchParams.get("video_id") || "";
    const accessCookie2 = await getAccessCookie();

    const buildWatchHeaders = () => {
      const h = new Headers(jsonCorsHeaders);
      if (batchId && subjectId && contentId) {
        h.set(
          "Set-Cookie",
          `gb_sec_watch=${encodeURIComponent(JSON.stringify({ batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) }))}; Path=/; SameSite=Lax; Max-Age=86400`
        );
      }
      return h;
    };

    try {
      const scheduleRes = await fetch(
        `${TARGET_ORIGIN}/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(contentId)}`,
        {
          headers: {
            "user-agent": req.headers.get("user-agent") || SEC_UA,
            referer: refererHeader,
            cookie: accessCookie2
          }
        }
      );
      if (scheduleRes.status === 200) {
        const data = await scheduleRes.json().catch(() => null);
        if (data && data.success && (data.data?.urlType || (Array.isArray(data.data) && data.data[0]?.urlType))) {
          const item = Array.isArray(data.data) ? data.data[0] : data.data;
          const schUrl = String(item?.url || "");
          const schType = String(item?.urlType || "");
          if (schUrl || schType === "youtube") {
            const mU = schUrl.match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
            if (mU && mU[1] && batchId && subjectId && contentId) {
              videoUuidMap.set(mU[1], { batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) });
            }
            return new Response(JSON.stringify(data), { status: 200, headers: buildWatchHeaders() });
          }
        }
      }
    } catch {
    }

    let urlType = "penpencilvdo";
    let videoUrl = "";
    try {
      const vRes = await fetch(
        `${TARGET_ORIGIN}/api/video-url?batch_id=${encodeURIComponent(batchId)}&subject_id=${encodeURIComponent(subjectId)}&video_id=${encodeURIComponent(contentId)}`,
        {
          headers: {
            "user-agent": req.headers.get("user-agent") || SEC_UA,
            referer: refererHeader,
            cookie: accessCookie2
          }
        }
      );
      if (vRes.status === 200) {
        const vData = await vRes.json().catch(() => null);
        if (vData?.success && vData?.data) {
          urlType = vData.data.urlType || "penpencilvdo";
          videoUrl = vData.data.url || "";
        }
      }
    } catch {
    }

    if (!videoUrl) {
      const secRes = await fetchSecJson(`/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(contentId)}`);
      if (secRes.status === 200 && secRes.data?.success && (secRes.data?.data?.urlType || (Array.isArray(secRes.data?.data) && secRes.data?.data[0]?.urlType))) {
        const schUrl = String((Array.isArray(secRes.data.data) ? secRes.data.data[0]?.url : secRes.data.data?.url) || "");
        const mU = schUrl.match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
        if (mU && mU[1] && batchId && subjectId && contentId) {
          videoUuidMap.set(mU[1], { batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) });
        }
        return new Response(JSON.stringify(secRes.data), { status: 200, headers: buildWatchHeaders() });
      }
    }

    if (!videoUrl && batchId && contentId) {
      try {
        const marcoStream = await fetchMarcoJson(`/api/stream-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId || "all")}&lectureId=${encodeURIComponent(contentId)}`);
        const mData = marcoStream.data;
        if (marcoStream.status === 200 && mData?.success && (mData.hlsStreamUrl || mData.streamUrl)) {
          const rawUrl = String(mData.hlsStreamUrl || mData.streamUrl);
          if (mData.streamFormat === "youtube" || /youtu\.?be/i.test(rawUrl)) {
            urlType = "youtube";
            videoUrl = rawUrl;
          } else if (mData.isMp4 && !mData.hlsStreamUrl && mData.streamUrl) {
            urlType = "penpencilvdo";
            videoUrl = rawUrl.startsWith("http") ? rawUrl : `${MARCO_ORIGIN}${rawUrl}`;
            videoUuidMap.set(String(contentId), {
              batchId: String(batchId),
              subjectId: String(subjectId || "all"),
              contentId: String(contentId),
              marcoStreamUrl: rawUrl,
              isMp4: true
            });
          } else {
            urlType = "penpencilvdo";
            videoUrl = `https://marco.pw/${contentId}/master.m3u8`;
            videoUuidMap.set(String(contentId), {
              batchId: String(batchId),
              subjectId: String(subjectId || "all"),
              contentId: String(contentId),
              marcoStreamUrl: rawUrl,
              isMp4: Boolean(mData.isMp4)
            });
          }
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                _id: contentId,
                topic: "Class Lecture",
                title: "Class Lecture",
                name: "Class Lecture",
                urlType,
                url: videoUrl,
                videoDetails: {},
                availableFor: [],
                platformRestricted: false,
                restrictedSchedule: false,
                restrictedTime: 0
              }
            }),
            { status: 200, headers: buildWatchHeaders() }
          );
        }
      } catch {
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          _id: contentId,
          topic: "Class Lecture",
          title: "Class Lecture",
          name: "Class Lecture",
          urlType,
          url: videoUrl,
          videoDetails: {},
          availableFor: [],
          platformRestricted: false,
          restrictedSchedule: false,
          restrictedTime: 0
        }
      }),
      { status: 200, headers: jsonCorsHeaders }
    );
  }

  if (pathname === "/api/BatchInfo") {
    const batchId = url.searchParams.get("BatchId") || url.searchParams.get("batchId") || "";
    const type = (url.searchParams.get("Type") || url.searchParams.get("type") || "details").toLowerCase();
    const page = url.searchParams.get("page") || "1";
    if (!batchId || batchId === "undefined" || batchId === "null") {
      return new Response(JSON.stringify({ success: true, data: type === "details" ? {} : [] }), { status: 200, headers: jsonCorsHeaders });
    }
    let primaryDetailsFallback = null;
    try {
      const r = await fetchPrimaryAuth(`/api/BatchInfo?BatchId=${encodeURIComponent(batchId)}&Type=${encodeURIComponent(type)}&page=${encodeURIComponent(page)}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const txt = await r.text();
        const parsed = JSON.parse(txt);
        const isDetails = type === "details";
        const hasIdentity = Boolean(parsed.data && (parsed.data._id || parsed.data.name || parsed.data.batchName));
        const hasSubjects = Array.isArray(parsed.data?.subjects) && parsed.data.subjects.length > 0;
        const hasValidData = isDetails ? (hasIdentity && hasSubjects) : (Array.isArray(parsed.data) && parsed.data.length > 0);
        if (parsed.success && hasValidData) {
          return new Response(transformText(txt), { status: 200, headers: jsonCorsHeaders });
        }
        if (parsed.success && isDetails && hasIdentity) {
          primaryDetailsFallback = transformText(txt);
        }
      }
    } catch {
    }
    const secRes = await fetchSecJson(`/api/BatchInfo?BatchId=${encodeURIComponent(batchId)}&Type=${encodeURIComponent(type)}&page=${encodeURIComponent(page)}`);
    const secData = secRes.data;
    const secHasSubjects = type !== "details" || (Array.isArray(secData?.data?.subjects) && secData.data.subjects.length > 0);
    if (secData?.success && secData?.data && (!primaryDetailsFallback || secHasSubjects)) {
      return new Response(transformText(JSON.stringify(secData)), { status: 200, headers: jsonCorsHeaders });
    }
    try {
      const marcoPath = type === "announcement"
        ? `/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/announcement?page=${encodeURIComponent(page)}&limit=10`
        : `/api/pw/radha/v3/batches/${encodeURIComponent(batchId)}/details`;
      const mRes = await fetchMarcoJson(marcoPath);
      const mHasData = type === "details"
        ? Boolean(mRes.data?.data && (mRes.data.data._id || mRes.data.data.name || mRes.data.data.batchName))
        : (Array.isArray(mRes.data?.data) && mRes.data.data.length > 0);
      const mHasSubjects = type !== "details" || (Array.isArray(mRes.data?.data?.subjects) && mRes.data.data.subjects.length > 0);
      if (mRes.status === 200 && mRes.data?.success && mHasData && (!primaryDetailsFallback || mHasSubjects)) {
        return new Response(transformText(JSON.stringify(mRes.data)), { status: 200, headers: jsonCorsHeaders });
      }
    } catch {
    }
    if (primaryDetailsFallback) {
      return new Response(primaryDetailsFallback, { status: 200, headers: jsonCorsHeaders });
    }
    return new Response(JSON.stringify({ success: true, data: type === "details" ? { _id: batchId, name: "Batch", subjects: [] } : [] }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/SubjectInfo") {
    const batchId = url.searchParams.get("BatchId") || url.searchParams.get("batchId") || "";
    const subjectId = url.searchParams.get("SubjectId") || url.searchParams.get("subjectId") || "";
    const page = url.searchParams.get("page") || "1";
    if (!batchId || batchId === "undefined" || !subjectId || subjectId === "undefined") {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
    }
    try {
      const r = await fetchPrimaryAuth(`/api/SubjectInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&page=${encodeURIComponent(page)}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const txt = await r.text();
        const parsed = JSON.parse(txt);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return new Response(transformText(txt), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    const secRes = await fetchSecJson(`/api/SubjectInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&page=${encodeURIComponent(page)}`);
    if (Array.isArray(secRes.data?.data) && secRes.data.data.length > 0) {
      return new Response(transformText(JSON.stringify(secRes.data)), { status: 200, headers: jsonCorsHeaders });
    }
    try {
      let mRes = await fetchMarcoJson(`/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/topics?page=${encodeURIComponent(page)}&limit=20`);
      if (!(mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0)) {
        mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/topics?page=${encodeURIComponent(page)}&limit=20`);
      }
      if (mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0) {
        return new Response(transformText(JSON.stringify(mRes.data)), { status: 200, headers: jsonCorsHeaders });
      }
    } catch {
    }
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/TopicInfo") {
    const batchId = url.searchParams.get("BatchId") || url.searchParams.get("batchId") || "";
    const subjectId = url.searchParams.get("SubjectId") || url.searchParams.get("subjectId") || "";
    const topicId = url.searchParams.get("TopicId") || url.searchParams.get("topicId") || "";
    const ct = url.searchParams.get("ContentType") || url.searchParams.get("contentType") || "videos";
    const page = url.searchParams.get("page") || "1";
    if (!batchId || batchId === "undefined" || !subjectId || subjectId === "undefined" || !topicId || topicId === "undefined") {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
    }
    try {
      const r = await fetchPrimaryAuth(`/api/TopicInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&TopicId=${encodeURIComponent(topicId)}&ContentType=${encodeURIComponent(ct)}&page=${encodeURIComponent(page)}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const txt = await r.text();
        const parsed = JSON.parse(txt);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return new Response(transformText(txt), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    const secRes = await fetchSecJson(`/api/TopicInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&TopicId=${encodeURIComponent(topicId)}&ContentType=${encodeURIComponent(ct)}&page=${encodeURIComponent(page)}`);
    if (Array.isArray(secRes.data?.data) && secRes.data.data.length > 0) {
      return new Response(transformText(JSON.stringify(secRes.data)), { status: 200, headers: jsonCorsHeaders });
    }
    try {
      let mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/contents?tag=${encodeURIComponent(topicId)}&contentType=${encodeURIComponent(ct)}&page=${encodeURIComponent(page)}&limit=20`);
      if (!(mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0)) {
        const v3Map = { videos: "LECTURES", notes: "NOTES", DppNotes: "DPP_PDF", exercises: "DPP_QUIZ", DppVideos: "DPP_VIDEOS" };
        const v3Ct = v3Map[ct] || "LECTURES";
        const skip = Math.max(0, (parseInt(String(page), 10) - 1) * 20);
        mRes = await fetchMarcoJson(`/api/pw/radha/batch-service/v3/batch-subject-schedules/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/contents?skip=${skip}&limit=20&contentType=${encodeURIComponent(v3Ct)}&tagId=${encodeURIComponent(topicId)}`);
      }
      if (mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0) {
        return new Response(transformText(JSON.stringify(mRes.data)), { status: 200, headers: jsonCorsHeaders });
      }
    } catch {
    }
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/GetPdf") {
    const batchId = url.searchParams.get("BatchId") || url.searchParams.get("batchId") || "";
    const subjectId = url.searchParams.get("SubjectId") || url.searchParams.get("subjectId") || "";
    const pdfId = url.searchParams.get("PdfId") || url.searchParams.get("pdfId") || "";
    const attachmentId = url.searchParams.get("AttachmentId") || url.searchParams.get("attachmentId") || "";
    try {
      const r = await fetchPrimaryAuth(pathname + url.search, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const parsed = await r.json().catch(() => null);
        if (parsed?.success && parsed?.data && (parsed.data.baseUrl || parsed.data.data?.baseUrl)) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    const secRes = await fetchSecJson(pathname + url.search);
    if (secRes.data?.success && (secRes.data.data?.baseUrl || secRes.data.data?.data?.baseUrl)) {
      return new Response(JSON.stringify(secRes.data), { status: 200, headers: jsonCorsHeaders });
    }
    if (batchId && pdfId) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            baseUrl: "/api/marco-pdf?",
            key: `batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&pdfId=${encodeURIComponent(pdfId)}&attachmentId=${encodeURIComponent(attachmentId)}`
          }
        }),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
  }

  if (pathname === "/api/marco-pdf") {
    const batchId = url.searchParams.get("batchId") || url.searchParams.get("BatchId") || "";
    const subjectId = url.searchParams.get("subjectId") || url.searchParams.get("SubjectId") || "";
    const pdfId = url.searchParams.get("pdfId") || url.searchParams.get("PdfId") || "";
    try {
      const pdfRes = await fetch(
        `${MARCO_ORIGIN}/api/pw/shyam?batch_id=${encodeURIComponent(batchId)}&subject_id=${encodeURIComponent(subjectId)}&Id=${encodeURIComponent(pdfId)}&type=pdf`,
        {
          headers: { "user-agent": SEC_UA, referer: `${MARCO_ORIGIN}/pw/content` },
          redirect: "follow"
        }
      );
      const outH = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Content-Type": pdfRes.headers.get("content-type") || "application/pdf"
      });
      const cd = pdfRes.headers.get("content-disposition");
      if (cd) outH.set("Content-Disposition", cd);
      const cl = pdfRes.headers.get("content-length");
      if (cl) outH.set("Content-Length", cl);
      return new Response(pdfRes.body, { status: pdfRes.status, headers: outH });
    } catch {
      return new Response("PDF fetch failed", { status: 502 });
    }
  }

  if (pathname === "/api/dpp-list") {
    const batchId = url.searchParams.get("batchId") || url.searchParams.get("BatchId") || "";
    const subjectId = url.searchParams.get("batchSubjectId") || url.searchParams.get("subjectId") || "";
    const chapterId = url.searchParams.get("chapterId") || "";
    const page = url.searchParams.get("page") || "1";
    const limit = url.searchParams.get("limit") || "20";
    try {
      const r = await fetchPrimaryAuth(pathname + url.search, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const parsed = await r.json().catch(() => null);
        if (parsed?.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    const secRes = await fetchSecJson(pathname + url.search);
    if (secRes.data?.success && Array.isArray(secRes.data.data) && secRes.data.data.length > 0) {
      return new Response(JSON.stringify(secRes.data), { status: 200, headers: jsonCorsHeaders });
    }
    if (batchId && subjectId && chapterId) {
      const mRes = await fetchMarcoJson(`/api/pw/radha/v3/test-service/tests/new-dpp-list?batchId=${encodeURIComponent(batchId)}&batchSubjectId=${encodeURIComponent(subjectId)}&chapterId=${encodeURIComponent(chapterId)}&dppType=ALL&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`);
      if (mRes.status === 200 && mRes.data?.success) {
        return new Response(JSON.stringify(mRes.data), { status: 200, headers: jsonCorsHeaders });
      }
    }
  }

  if (pathname === "/api/todays-schedule" && req.method === "POST") {
    let bodyObj = {};
    try {
      bodyObj = await req.json();
    } catch {
    }
    const batchId = String(bodyObj?.batchId || url.searchParams.get("batchId") || "");
    if (!batchId) {
      return new Response(JSON.stringify({ success: false, message: "Missing batchId" }), { status: 400, headers: jsonCorsHeaders });
    }
    try {
      const accessCookie2 = await getAccessCookie();
      const pRes = await fetch(`${TARGET_ORIGIN}/api/todays-schedule`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": SEC_UA,
          referer: `${TARGET_ORIGIN}/study/batches/${batchId}`,
          cookie: accessCookie2
        },
        body: JSON.stringify({ batchId })
      });
      if (pRes.ok) {
        const parsed = await pRes.json().catch(() => null);
        if (parsed?.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    let mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/todays-schedule?batchId=${encodeURIComponent(batchId)}`);
    if (!(mRes.status === 200 && mRes.data?.success)) {
      mRes = await fetchMarcoJson(`/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/todays-schedule?batchId=${encodeURIComponent(batchId)}`);
    }
    if (mRes.status === 200 && mRes.data?.success) {
      return new Response(JSON.stringify(mRes.data), { status: 200, headers: jsonCorsHeaders });
    }
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/weekly-schedules") {
    const batchId = url.searchParams.get("batchId") || "";
    const batchSubjectId = url.searchParams.get("batchSubjectId") || "";
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || startDate;
    const page = url.searchParams.get("page") || "1";
    try {
      const r = await fetchPrimaryAuth(pathname + url.search, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const parsed = await r.json().catch(() => null);
        if (parsed?.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    if (batchId) {
      const qs = `batchSubjectId=${encodeURIComponent(batchSubjectId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&page=${encodeURIComponent(page)}`;
      let mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/weekly-schedules?${qs}`);
      if (!(mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0)) {
        mRes = await fetchMarcoJson(`/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/weekly-schedules?${qs}`);
      }
      if (mRes.status === 200 && mRes.data?.success) {
        return new Response(JSON.stringify(mRes.data), { status: 200, headers: jsonCorsHeaders });
      }
    }
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/get-user-details-list" && req.method === "POST") {
    let bodyObj = {};
    try {
      bodyObj = await req.json();
    } catch {
    }
    const idsParam = String(bodyObj?.idsParam || url.searchParams.get("userIds") || "");
    if (!idsParam) {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
    }
    try {
      const accessCookie2 = await getAccessCookie();
      const pRes = await fetch(`${TARGET_ORIGIN}/api/get-user-details-list`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": SEC_UA,
          referer: `${TARGET_ORIGIN}/study/batches`,
          cookie: accessCookie2
        },
        body: JSON.stringify({ idsParam })
      });
      if (pRes.ok) {
        const parsed = await pRes.json().catch(() => null);
        if (parsed?.success && Array.isArray(parsed.data)) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    const mRes = await fetchMarcoJson(`/api/pw/radha/v1/users/get-user-details-list?userIds=${encodeURIComponent(idsParam)}`);
    if (mRes.status === 200 && mRes.data?.success) {
      return new Response(JSON.stringify(mRes.data), { status: 200, headers: jsonCorsHeaders });
    }
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/batch-tests") {
    const batchId = url.searchParams.get("batchId") || "";
    const testId = url.searchParams.get("testId") || "";
    let primaryEmptyFallback = null;
    try {
      const r = await fetchPrimaryAuth(pathname + url.search, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const parsed = await r.json().catch(() => null);
        if (parsed?.success && ((Array.isArray(parsed.data) && parsed.data.length > 0) || (testId && parsed.data))) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
        if (parsed?.success) primaryEmptyFallback = parsed;
      }
    } catch {
    }
    if (!testId && batchId) {
      const mRes = await fetchMarcoJson(`/api/pw/radha/v3/test-service/tests?testType=All&testStatus=All&attemptStatus=All&batchId=${encodeURIComponent(batchId)}&isSubjective=false`);
      if (mRes.status === 200 && mRes.data?.success && Array.isArray(mRes.data.data) && mRes.data.data.length > 0) {
        return new Response(JSON.stringify(mRes.data), { status: 200, headers: jsonCorsHeaders });
      }
    }
    if (primaryEmptyFallback) {
      return new Response(JSON.stringify(primaryEmptyFallback), { status: 200, headers: jsonCorsHeaders });
    }
  }

  if (pathname === "/api/test-instructions") {
    const testId = url.searchParams.get("testId") || "";
    const batchId = url.searchParams.get("batchId") || "";
    try {
      const r = await fetchPrimaryAuth(pathname + url.search, `${TARGET_ORIGIN}/study/batches/${batchId}`);
      if (r.status === 200) {
        const parsed = await r.json().catch(() => null);
        if (parsed?.success && parsed?.data) {
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    if (testId) {
      const mRes = await fetchMarcoJson(`/api/pw/radha/v3/test-service/tests/${encodeURIComponent(testId)}/instructions`);
      if (mRes.status === 200 && mRes.data?.success) {
        return new Response(JSON.stringify(mRes.data), { status: 200, headers: jsonCorsHeaders });
      }
    }
  }

  if (pathname === "/api/AllBatches") {
    const pageNum = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const extraCount = missingBatches.length;
    const extraPages = Math.ceil(extraCount / 20);
    if (pageNum > lxTotalPages && extraCount > 0) {
      const offset = (pageNum - lxTotalPages - 1) * 20;
      const slice = missingBatches.slice(offset, offset + 20);
      return new Response(
        JSON.stringify({
          success: true,
          batches: slice,
          totalPages: lxTotalPages + extraPages,
          currentPage: pageNum,
          total: lxTotalBatches + extraCount
        }),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    try {
      const [primaryRes, secRes, marcoRes, shyamRes] = await Promise.all([
        fetchPrimaryAuth(`/api/AllBatches?page=${encodeURIComponent(String(pageNum))}`, `${TARGET_ORIGIN}/study/batches`),
        pageNum === 1 ? fetchSecJson(`/api/AllBatches?page=1`) : Promise.resolve({ status: 200, data: null }),
        pageNum === 1 ? fetchMarcoJsonOnce(`/api/pw/get-Batches.json?page=1&limit=40`, 4500) : Promise.resolve({ status: 200, data: null }),
        pageNum === 1 ? fetchMarcoJsonOnce(`/api/pw/shyam?search=2027`, 4500) : Promise.resolve({ status: 200, data: null })
      ]);
      if (primaryRes.status === 200) {
        const originalText = await primaryRes.text();
        const parsed = JSON.parse(originalText);
        if (parsed.success && Array.isArray(parsed.batches)) {
          if (Number(parsed.total) > 0) lxTotalBatches = Number(parsed.total);
          if (Number(parsed.totalPages) > 0) lxTotalPages = Number(parsed.totalPages);
          for (const b of parsed.batches) {
            if (!b.previewImage || !b.previewImage.startsWith("http") || b.previewImage.trim() === "") {
              b.previewImage = ICON_URL;
            }
          }
          let freshCount = 0;
          if (pageNum === 1) {
            const seen = new Set(parsed.batches.map((b) => String(b._id || b.batchId)));
            const fresh = [];
            if (secRes?.data) {
              const secList = Array.isArray(secRes.data.data) ? secRes.data.data : (Array.isArray(secRes.data.batches) ? secRes.data.batches : []);
              for (const item of secList) {
                const nb = normalizeBatchObj(item);
                if (nb._id && !seen.has(nb._id) && !knownMissingIds.has(nb._id)) {
                  seen.add(nb._id);
                  fresh.push(nb);
                }
              }
            }
            if (shyamRes?.data?.data && Array.isArray(shyamRes.data.data)) {
              for (const item of shyamRes.data.data) {
                const nb = normalizeBatchObj(item);
                if (nb._id && !seen.has(nb._id) && !knownMissingIds.has(nb._id)) {
                  seen.add(nb._id);
                  fresh.push(nb);
                }
              }
            }
            if (marcoRes?.data?.batches && Array.isArray(marcoRes.data.batches)) {
              for (const item of marcoRes.data.batches) {
                const nb = normalizeBatchObj(item);
                if (nb._id && !seen.has(nb._id) && !knownMissingIds.has(nb._id)) {
                  seen.add(nb._id);
                  fresh.push(nb);
                }
              }
            }
            if (fresh.length > 0) {
              freshCount = fresh.length;
              parsed.batches = [...fresh, ...parsed.batches];
            }
          }
          parsed.total = lxTotalBatches + freshCount + extraCount;
          parsed.totalPages = lxTotalPages + extraPages;
          return new Response(transformText(JSON.stringify(parsed)), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    if (extraCount > 0) {
      const offset = (pageNum - 1) * 20;
      return new Response(
        JSON.stringify({
          success: true,
          batches: missingBatches.slice(offset, offset + 20),
          totalPages: Math.max(1, extraPages),
          currentPage: pageNum,
          total: extraCount
        }),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    return new Response(JSON.stringify({ success: true, batches: [], totalPages: 1, currentPage: 1, total: 0 }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/searchBatch") {
    const name = (url.searchParams.get("name") || url.searchParams.get("batchName") || url.searchParams.get("q") || "").trim();
    const pageNum = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const normQ = normalizeSearchText(name);
    const tokens = normQ ? normQ.split(/\s+/).filter(Boolean) : [];
    const localMatches = searchMissingBatches(name);
    const [primaryRes, marcoSearchRes, shyamSearchRes, deepRes] = await Promise.all([
      fetchPrimaryAuth(`/api/searchBatch?name=${encodeURIComponent(name)}&page=${encodeURIComponent(String(pageNum))}`, `${TARGET_ORIGIN}/study/batches`).catch(() => null),
      name ? fetchMarcoJsonOnce(`/api/pw/get-Batches.json?search=${encodeURIComponent(name)}&page=${encodeURIComponent(String(pageNum))}&limit=40`, 5000) : Promise.resolve({ status: 200, data: null }),
      name && pageNum === 1 ? fetchMarcoJsonOnce(`/api/pw/shyam?search=${encodeURIComponent(name)}`, 5000) : Promise.resolve({ status: 200, data: null }),
      name ? fetchSecJsonOnce(`/api/deep-search?q=${encodeURIComponent(name)}&page=${pageNum}&size=20`, "", 4000) : Promise.resolve({ status: 200, data: null })
    ]);
    let lxParsed = null;
    try {
      if (primaryRes && primaryRes.status === 200) {
        const parsed = await primaryRes.json().catch(() => null);
        if (parsed && parsed.success && Array.isArray(parsed.batches)) {
          for (const b of parsed.batches) {
            if (!b.previewImage || !b.previewImage.startsWith("http") || b.previewImage.trim() === "") {
              b.previewImage = ICON_URL;
            }
          }
          lxParsed = parsed;
        }
      }
    } catch {
    }
    const marcoRawList = Array.isArray(marcoSearchRes?.data?.batches) ? marcoSearchRes.data.batches.map(normalizeBatchObj).filter((b) => b._id) : [];
    const marcoTotalPages = Math.max(1, Number(marcoSearchRes?.data?.totalPages || 1));
    const marcoMatches = normQ ? marcoRawList.filter((b) => scoreBatchForQuery(b, normQ, tokens) > 0) : marcoRawList;
    const shyamRawList = Array.isArray(shyamSearchRes?.data?.data) ? shyamSearchRes.data.data.map(normalizeBatchObj).filter((b) => b._id) : [];
    const shyamMatches = normQ ? shyamRawList.filter((b) => scoreBatchForQuery(b, normQ, tokens) > 0) : shyamRawList;
    const deepData = deepRes?.data;
    const deepRawList = deepData?.success && Array.isArray(deepData.data) ? deepData.data.map(normalizeBatchObj).filter((b) => b._id) : [];
    const deepMatches = normQ ? deepRawList.filter((b) => scoreBatchForQuery(b, normQ, tokens) > 0) : deepRawList;
    const rankAndSort = (list) => {
      const map = new Map();
      for (const item of list) {
        const id = String(item._id || item.batchId || "");
        if (!id || map.has(id)) continue;
        map.set(id, item);
      }
      const arr = Array.from(map.values());
      if (!normQ) return arr;
      return arr
        .map((b) => ({
          b,
          score: scoreBatchForQuery(b, normQ, tokens),
          t: Date.parse(b.startDate || "") || 0
        }))
        .sort((a, b) => (b.score - a.score) || (b.t - a.t))
        .map((x) => x.b);
    };
    const lxBatches = lxParsed ? lxParsed.batches : [];
    const lxTotal = lxParsed ? Number(lxParsed.total ?? lxBatches.length) : 0;
    const lxPages = lxParsed ? Math.max(1, Number(lxParsed.totalPages || 1)) : 0;
    if (lxPages <= 1 && marcoTotalPages <= 1) {
      const merged = rankAndSort([...lxBatches, ...localMatches, ...marcoMatches, ...shyamMatches, ...deepMatches]);
      const finalList = merged.length > 0 ? merged : rankAndSort(deepRawList);
      const totalPages = Math.max(1, Math.ceil(finalList.length / 20));
      const slice = finalList.slice((pageNum - 1) * 20, pageNum * 20);
      return new Response(
        transformText(
          JSON.stringify({
            success: true,
            batches: slice,
            totalPages,
            currentPage: pageNum,
            total: finalList.length
          })
        ),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    if (pageNum === 1) {
      const seen = new Set(lxBatches.map((b) => String(b._id || b.batchId)));
      const extras = [];
      for (const b of [...shyamMatches, ...marcoMatches, ...localMatches, ...deepMatches]) {
        const id = String(b._id || b.batchId || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        extras.push(b);
      }
      const page1List = rankAndSort([...lxBatches, ...extras.slice(0, 30)]);
      const combinedTotal = Math.max(lxTotal + localMatches.length, Number(marcoSearchRes?.data?.total || 0), page1List.length);
      const remainingLocal = Math.max(0, localMatches.length - 10);
      const combinedTotalPages = Math.max(lxPages + Math.ceil(remainingLocal / 20), marcoTotalPages);
      return new Response(
        transformText(
          JSON.stringify({
            success: true,
            batches: page1List,
            totalPages: combinedTotalPages,
            currentPage: 1,
            total: combinedTotal
          })
        ),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    if (lxParsed && pageNum <= lxPages) {
      const seen = new Set(lxBatches.map((b) => String(b._id || b.batchId)));
      const pageExtras = marcoMatches.filter((b) => !seen.has(String(b._id))).slice(0, 20);
      const remainingLocal = Math.max(0, localMatches.length - 10);
      const combinedTotalPages = Math.max(lxPages + Math.ceil(remainingLocal / 20), marcoTotalPages);
      const combinedTotal = Math.max(lxTotal + localMatches.length, Number(marcoSearchRes?.data?.total || 0));
      return new Response(
        transformText(
          JSON.stringify({
            success: true,
            batches: [...lxBatches, ...pageExtras],
            totalPages: combinedTotalPages,
            currentPage: pageNum,
            total: combinedTotal
          })
        ),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    if (marcoMatches.length > 0 && pageNum <= marcoTotalPages) {
      const remainingLocal = Math.max(0, localMatches.length - 10);
      const combinedTotalPages = Math.max(lxPages + Math.ceil(remainingLocal / 20), marcoTotalPages);
      const combinedTotal = Math.max(lxTotal + localMatches.length, Number(marcoSearchRes?.data?.total || 0));
      return new Response(
        JSON.stringify({
          success: true,
          batches: marcoMatches,
          totalPages: combinedTotalPages,
          currentPage: pageNum,
          total: combinedTotal
        }),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    if (localMatches.length > 0) {
      const offset = Math.max(0, (pageNum - Math.max(1, lxPages) - 1) * 20);
      return new Response(
        JSON.stringify({
          success: true,
          batches: localMatches.slice(offset, offset + 20),
          totalPages: Math.max(pageNum, Math.ceil(localMatches.length / 20)),
          currentPage: pageNum,
          total: lxTotal + localMatches.length
        }),
        { status: 200, headers: jsonCorsHeaders }
      );
    }
    return new Response(JSON.stringify({ success: true, batches: [], totalPages: 1, currentPage: pageNum, total: 0 }), { status: 200, headers: jsonCorsHeaders });
  }

  if (pathname === "/api/play") {
    const mediaUrl = url.searchParams.get("url") || "";
    if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
      let isMpdUrl = false;
      try {
        isMpdUrl = /\.mpd$/i.test(new URL(mediaUrl).pathname);
      } catch {
      }
      try {
        const fwdHeaders = { "user-agent": SEC_UA };
        const rangeHdr = req.headers.get("range");
        if (rangeHdr && !isMpdUrl) fwdHeaders.range = rangeHdr;
        const ifRangeHdr = req.headers.get("if-range");
        if (ifRangeHdr && !isMpdUrl) fwdHeaders["if-range"] = ifRangeHdr;
        const directRes = await fetch(mediaUrl, { headers: fwdHeaders });
        if (directRes.status >= 200 && directRes.status < 400) {
          const ct = directRes.headers.get("content-type") || (isMpdUrl ? "application/dash+xml" : "application/octet-stream");
          const ctLower = ct.toLowerCase();
          if (isMpdUrl || ctLower.includes("xml") || ctLower.includes("dash+xml")) {
            const mpdText = injectMpdBaseUrl(await directRes.text(), mediaUrl);
            return new Response(mpdText, {
              status: directRes.status,
              headers: {
                "Content-Type": ct,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store"
              }
            });
          }
          const h = new Headers({
            "Content-Type": ct,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
            "Cache-Control": "no-store"
          });
          const cr = directRes.headers.get("content-range");
          if (cr) h.set("Content-Range", cr);
          const ar = directRes.headers.get("accept-ranges");
          if (ar) h.set("Accept-Ranges", ar);
          const cl = directRes.headers.get("content-length");
          if (cl) h.set("Content-Length", cl);
          return new Response(directRes.body, { status: directRes.status, headers: h });
        }
      } catch {
      }
    }
  }

  if (pathname === "/api/play/m3u8") {
    const { batchId, subjectId, contentId } = parseWatchIdsEdge();
    const clientSecCookie = parseCookieVal(req.headers.get("cookie") || "", "gb_sec_tok") || cachedSecCookie;
    if (batchId && subjectId && contentId) {
      try {
        const fetchPlaylistOnce = async (secCookie) => {
          const hlsRes = await fetchSecJson(`/api/hls-stream-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(contentId)}&videoId=${encodeURIComponent(contentId)}`, secCookie);
          let activeCookie = hlsRes.cookie || secCookie;
          let m3u8Path = hlsRes.status === 200 && hlsRes.data?.success ? hlsRes.data?.data?.url : "";
          if (!m3u8Path) {
            const gvRes = await fetchSecJson(`/api/get-video-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(contentId)}`, activeCookie);
            activeCookie = gvRes.cookie || activeCookie;
            if (gvRes.status === 200 && gvRes.data?.success && gvRes.data?.data?.url) {
              m3u8Path = gvRes.data.data.m3u8_url || gvRes.data.data.hls_url || gvRes.data.data.url;
            }
          }
          if (!m3u8Path) return { status: 404, body: null, headers: new Headers(), cookie: activeCookie };
          const fullM3u8Url = String(m3u8Path).startsWith("http") ? String(m3u8Path) : `${SECONDARY_ORIGIN}${m3u8Path}`;
          const hdrs = {
            "user-agent": SEC_UA,
            referer: `${SECONDARY_ORIGIN}/study/batches`
          };
          if (activeCookie) hdrs.cookie = activeCookie;
          const plRes = await fetch(fullM3u8Url, { headers: hdrs });
          const sc = getSetCookieList(plRes.headers);
          if (sc.length > 0) {
            activeCookie = mergeSetCookies(activeCookie, sc);
            cachedSecCookie = mergeSetCookies(cachedSecCookie, sc);
          }
          return { status: plRes.status, body: plRes.body, headers: plRes.headers, cookie: activeCookie };
        };
        let pl = await fetchPlaylistOnce(clientSecCookie);
        if (pl.status === 403) {
          cachedSecCookie = "";
          pl = await fetchPlaylistOnce("");
        }
        if (pl.status === 200 && pl.body) {
          const outH = new Headers({
            "Content-Type": pl.headers.get("content-type") || "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          });
          if (pl.cookie) {
            outH.set("Set-Cookie", `gb_sec_tok=${encodeURIComponent(pl.cookie)}; Path=/; SameSite=Lax; Max-Age=604800`);
          }
          return new Response(pl.body, { status: 200, headers: outH });
        }
      } catch {
      }
      try {
        const cachedUuid = videoUuidMap.get(String(contentId));
        let mStreamPath = cachedUuid?.marcoStreamUrl || "";
        if (!mStreamPath) {
          const mRes = await fetchMarcoJson(`/api/stream-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&lectureId=${encodeURIComponent(contentId)}`);
          if (mRes.status === 200 && mRes.data?.success) {
            mStreamPath = String(mRes.data.hlsStreamUrl || mRes.data.streamUrl || "");
          }
        }
        if (mStreamPath) {
          const mPl = await fetchMarcoText(mStreamPath);
          if (mPl.status === 200 && mPl.body) {
            const rewritten = mPl.body.replaceAll(MARCO_ORIGIN, "");
            return new Response(rewritten, {
              status: 200,
              headers: {
                "Content-Type": mPl.headers.get("content-type") || "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store"
              }
            });
          }
        }
      } catch {
      }
    }
  }

  if (pathname.startsWith("/api/v1/stream/")) {
    try {
      const fwdHeaders = new Headers({
        "user-agent": SEC_UA,
        referer: `${MARCO_ORIGIN}/pw/player`
      });
      const rangeHdr = req.headers.get("range");
      if (rangeHdr) fwdHeaders.set("range", rangeHdr);
      const streamRes = await fetch(`${MARCO_ORIGIN}${pathname}${url.search}`, { headers: fwdHeaders });
      const ct = streamRes.headers.get("content-type") || "application/octet-stream";
      if (ct.toLowerCase().includes("mpegurl") || pathname.endsWith(".m3u8")) {
        const text = (await streamRes.text()).replaceAll(MARCO_ORIGIN, "");
        return new Response(text, {
          status: streamRes.status,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": ct,
            "Cache-Control": "no-store"
          }
        });
      }
      const resH = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        "Content-Type": ct
      });
      const cr = streamRes.headers.get("content-range");
      if (cr) resH.set("Content-Range", cr);
      const ar = streamRes.headers.get("accept-ranges");
      if (ar) resH.set("Accept-Ranges", ar);
      const cl = streamRes.headers.get("content-length");
      if (cl) resH.set("Content-Length", cl);
      return new Response(streamRes.body, { status: streamRes.status, headers: resH });
    } catch {
      return new Response(JSON.stringify({ success: false, message: "Marco stream proxy failed" }), { status: 502, headers: jsonCorsHeaders });
    }
  }

  if (pathname === "/api/recorded-stream" || pathname.startsWith("/api/recorded-stream/")) {
    try {
      const secCookie = parseCookieVal(req.headers.get("cookie") || "", "gb_sec_tok") || cachedSecCookie;
      const fwdHeaders = new Headers({
        "user-agent": SEC_UA,
        referer: `${SECONDARY_ORIGIN}/study/batches`
      });
      if (secCookie) fwdHeaders.set("cookie", secCookie);
      const rangeHdr = req.headers.get("range");
      if (rangeHdr) fwdHeaders.set("range", rangeHdr);
      const streamRes = await fetch(`${SECONDARY_ORIGIN}${pathname}${url.search}`, { headers: fwdHeaders });
      const sc = getSetCookieList(streamRes.headers);
      if (sc.length > 0) {
        cachedSecCookie = mergeSetCookies(cachedSecCookie, sc);
      }
      const resH = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        "Content-Type": streamRes.headers.get("content-type") || "application/octet-stream"
      });
      const cr = streamRes.headers.get("content-range");
      if (cr) resH.set("Content-Range", cr);
      const ar = streamRes.headers.get("accept-ranges");
      if (ar) resH.set("Accept-Ranges", ar);
      const cl = streamRes.headers.get("content-length");
      if (cl) resH.set("Content-Length", cl);
      return new Response(streamRes.body, { status: streamRes.status, headers: resH });
    } catch {
      return new Response(JSON.stringify({ success: false, message: "Stream proxy failed" }), { status: 502, headers: jsonCorsHeaders });
    }
  }

  if (pathname === "/api/video-url" || pathname === "/api/get-video-url") {
    const { batchId, subjectId, contentId } = parseWatchIdsEdge();
    try {
      const r = await fetchPrimaryAuth(pathname + url.search, refererHeader);
      if (r.status === 200) {
        const parsed = await r.json().catch(() => null);
        if (parsed?.success && parsed?.data?.url) {
          const fullUrl = `${parsed.data.url}${parsed.data.signedUrl || ""}`;
          if (batchId && subjectId && contentId) {
            const mUuid = String(parsed.data.url).match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
            if (mUuid && mUuid[1]) {
              videoUuidMap.set(mUuid[1], { batchId, subjectId, contentId });
            }
          }
          let urlReachable = false;
          try {
            const probe = await fetch(fullUrl, {
              headers: { "user-agent": SEC_UA, range: "bytes=0-255" }
            });
            urlReachable = probe.ok;
          } catch {
          }
          if (urlReachable) {
            return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
          }
          if (batchId && subjectId && contentId) {
            const secHls = await fetchSecJson(`/api/hls-stream-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(contentId)}&videoId=${encodeURIComponent(contentId)}`);
            if (secHls.data?.success && secHls.data?.data?.url) {
              return new Response(JSON.stringify({ success: false, data: null, fallback: "hls" }), { status: 200, headers: jsonCorsHeaders });
            }
          }
          return new Response(JSON.stringify(parsed), { status: 200, headers: jsonCorsHeaders });
        }
      }
    } catch {
    }
    return new Response(JSON.stringify({ success: false, data: null, fallback: "hls" }), { status: 200, headers: jsonCorsHeaders });
  }

  const targetUrl = new URL(pathname + url.search, TARGET_ORIGIN);
  const accessCookie = await getAccessCookie();
  const incomingCookie = req.headers.get("cookie") || "";
  const mergedCookies = [accessCookie];
  if (incomingCookie) {
    const filteredIncoming = incomingCookie
      .split(";")
      .map((c) => c.trim())
      .filter((c) => !c.startsWith("studymeta_access="));
    if (filteredIncoming.length > 0) {
      mergedCookies.push(...filteredIncoming);
    }
  }

  const forwardHeaders = new Headers();
  req.headers.forEach((val, key) => {
    const lowerKey = key.toLowerCase();
    if (!STRIP_OUTGOING_HEADERS.has(lowerKey)) {
      forwardHeaders.set(key, val);
    }
  });
  forwardHeaders.set("origin", TARGET_ORIGIN);
  forwardHeaders.set("referer", refererHeader);
  forwardHeaders.set("cookie", mergedCookies.join("; "));
  if (!forwardHeaders.get("user-agent")) {
    forwardHeaders.set("user-agent", SEC_UA);
  }

  const isDirectMedia =
    pathname.startsWith("/api/play") ||
    pathname.startsWith("/api/get-otp") ||
    pathname.startsWith("/api/video-url") ||
    pathname.includes(".mpd") ||
    pathname.includes(".m3u8") ||
    pathname.includes(".m4s") ||
    pathname.includes(".mp4");

  try {
    const bodyBuffer = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;

    let upstreamRes = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: bodyBuffer,
      redirect: "manual"
    });

    if (
      (upstreamRes.status === 307 || upstreamRes.status === 308) &&
      upstreamRes.headers.get("location")?.includes("key-generate")
    ) {
      cachedAccessCookie = "";
      const newCookie = await fetchFreshAccessCookie();
      const retryCookies = [newCookie, ...mergedCookies.slice(1)];
      forwardHeaders.set("cookie", retryCookies.join("; "));
      upstreamRes = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: forwardHeaders,
        body: bodyBuffer,
        redirect: "manual"
      });
    }

    const resHeaders = new Headers();
    upstreamRes.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "x-frame-options" &&
        lowerKey !== "content-security-policy" &&
        lowerKey !== "content-security-policy-report-only" &&
        lowerKey !== "content-encoding" &&
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "set-cookie"
      ) {
        if (isDirectMedia || lowerKey !== "content-length") {
          resHeaders.set(key, val);
        }
      }
    });

    const upstreamSetCookies = getSetCookieList(upstreamRes.headers);
    for (const sc of upstreamSetCookies) {
      resHeaders.append("Set-Cookie", sc.replace(/domain=[^;]+;?/gi, "").replace(/Secure;?/gi, ""));
    }

    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    resHeaders.set("Access-Control-Allow-Headers", "*");

    const loc = upstreamRes.headers.get("location");
    if (loc) {
      let relativeLoc = loc.replace(/https?:\/\/(www\.)?learnxpw\.site/gi, "");
      if (relativeLoc.includes("key-generate")) {
        try {
          const locU = new URL(loc, TARGET_ORIGIN);
          relativeLoc = locU.searchParams.get("redirect") || "/study/batches";
        } catch {
          relativeLoc = "/study/batches";
        }
      }
      resHeaders.set("location", relativeLoc);
    }

    if (accessCookie) {
      resHeaders.append("Set-Cookie", `${accessCookie}; Path=/; SameSite=Lax; Max-Age=86400`);
    }

    if (isDirectMedia) {
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: resHeaders
      });
    }

    const contentType = (resHeaders.get("content-type") || "").toLowerCase();
    const isText =
      contentType.includes("text/html") ||
      contentType.includes("application/x-javascript") ||
      contentType.includes("application/javascript") ||
      contentType.includes("text/javascript") ||
      contentType.includes("text/x-component") ||
      (contentType.includes("application/json") && !pathname.startsWith("/api/play"));

    if (!isText) {
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: resHeaders
      });
    }

    const originalText = await upstreamRes.text();
    const isHtml = contentType.includes("text/html");
    const modifiedText = transformText(originalText, isHtml);
    if (isHtml) {
      resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      resHeaders.delete("etag");
    }
    return new Response(modifiedText, {
      status: upstreamRes.status,
      headers: resHeaders
    });
  } catch (err) {
    return new Response(`[GB STUDY Edge Proxy Error]: ${err?.message || err}`, {
      status: 502,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
}

const onRequest = async (context) => {
  return handleEdgeRequest(context.request, context.env, context);
};

const path_default = {
  async fetch(request, env, ctx) {
    return handleEdgeRequest(request, env, ctx);
  }
};

export {
  path_default as default,
  handleEdgeRequest,
  onRequest
};
