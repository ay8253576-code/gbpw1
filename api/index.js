import express from "express";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import path from "node:path";
import fs from "node:fs";
const app = express();
const TARGET_HOST = "www.learnxpw.site";
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const SECONDARY_ORIGIN = "https://gbstudyphysicswallah.pages.dev";
const MARCO_ORIGIN = "https://pwmarco-backup-2-abc745d8bc54.herokuapp.com";
const BRAND_NAME = "GB STUDY";
const TELEGRAM_URL = "https://t.me/GBFreestudy";
const OWNER_TG_URL = "https://t.me/sarvottamji";
const ICON_URL = "https://i.ibb.co/Q3g9fGSt/1791541921524.png";
const SEC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const videoUuidMap = /* @__PURE__ */ new Map();
const OLD_ICON_URL = "https://i.ibb.co/V8CbjrG/image.png";
const OLD_TG_URL = "https://t.me/+AgMz8cG-x8VmNGY1";
const OLD_TG_URL_ALT = "https://t.me/AgMz8cG-x8VmNGY1";
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 6e4,
  maxSockets: 64,
  maxFreeSockets: 16,
  timeout: 3e4,
  family: 4
});
const secKeepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 6e4,
  maxSockets: 64,
  maxFreeSockets: 16,
  timeout: 3e4,
  family: 4
});
const marcoKeepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 6e4,
  maxSockets: 32,
  maxFreeSockets: 8,
  timeout: 3e4,
  family: 4
});
let cachedSecCookie = "";
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
const staticAssetCache = /* @__PURE__ */ new Map();
const pageCache = /* @__PURE__ */ new Map();
let cachedAccessCookie = "studymeta_access=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6ImZ1bGwiLCJpYXQiOjE3OTM2MjM4ODAsImV4cCI6MTc5MzcxMDI4MH0.RRjEAcW3pPiuWyKF6EDDgK0epLc-gCLCVMna1DFk_nA";
let refreshPromise = null;
const CACHE_TTL_MS = 15 * 60 * 1e3;
const batchInfoCache = /* @__PURE__ */ new Map();
const subjectInfoCache = /* @__PURE__ */ new Map();
const topicInfoCache = /* @__PURE__ */ new Map();
const allBatchesCache = /* @__PURE__ */ new Map();
let lxTotalBatches = 14525;
let lxTotalPages = 727;
let missingBatches = [];
let missingBatchIndex = [];
const knownMissingIds = /* @__PURE__ */ new Set();
const knownPrimaryIds = /* @__PURE__ */ new Set();
let liveNewFromSecondary = [];
let lastSecDeepTotal = 18833;
let lastMarcoTotal = 18898;
let marcoBackfillDone = false;
let isSyncRunning = false;
try {
  const missingPath = path.resolve(process.cwd(), "data", "missing-batches.json");
  if (fs.existsSync(missingPath)) {
    const rawMissing = JSON.parse(fs.readFileSync(missingPath, "utf-8"));
    if (Array.isArray(rawMissing)) {
      missingBatches = rawMissing;
      missingBatchIndex = rawMissing.map((b) => {
        if (b && b._id) knownMissingIds.add(String(b._id));
        return {
          batch: b,
          nameLower: String(b.name || "").toLowerCase(),
          searchStr: `${b.name || ""} ${b.byName || ""} ${b._id || ""} ${b.language || ""}`.toLowerCase(),
          startTime: Date.parse(b.startDate || "") || 0
        };
      });
      console.log(`[GB STUDY] Loaded ${missingBatches.length} extra batches from missing-batches.json`);
    }
  }
} catch (err) {
  console.warn("[GB STUDY] Failed to load missing-batches.json:", err);
}
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
function addExtraBatch(rawBatch, prependToLive = true) {
  const b = normalizeBatchObj(rawBatch);
  if (!b._id || knownMissingIds.has(b._id) || knownPrimaryIds.has(b._id)) return false;
  knownMissingIds.add(b._id);
  missingBatches.unshift(b);
  missingBatchIndex.unshift({
    batch: b,
    nameLower: b.name.toLowerCase(),
    searchStr: `${b.name} ${b.byName} ${b._id} ${b.language}`.toLowerCase(),
    startTime: Date.parse(b.startDate || "") || 0
  });
  if (prependToLive && !liveNewFromSecondary.some((x) => x._id === b._id)) {
    liveNewFromSecondary.unshift(b);
  }
  return true;
}
function persistMissingBatches() {
  try {
    const dir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "missing-batches.json"), JSON.stringify(missingBatches));
  } catch (err) {
    console.warn("[AutoSync] Could not write missing-batches.json:", err?.message || err);
  }
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
function fetchSecondaryJsonOnce(pathWithQuery, extraCookie = "", timeoutMs = 8e3) {
  return new Promise((resolve) => {
    const cookieToSend = extraCookie || cachedSecCookie;
    const headers = {
      "user-agent": SEC_UA,
      referer: `${SECONDARY_ORIGIN}/study/batches`
    };
    if (cookieToSend) headers.cookie = cookieToSend;
    const req = https.get(
      `${SECONDARY_ORIGIN}${pathWithQuery}`,
      {
        headers,
        agent: secKeepAliveAgent
      },
      (proxyRes) => {
        const sc = proxyRes.headers["set-cookie"];
        let updatedCookie = cookieToSend;
        if (sc && sc.length) {
          updatedCookie = mergeSetCookies(cookieToSend, sc);
          cachedSecCookie = mergeSetCookies(cachedSecCookie, sc);
        }
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            resolve({ status: proxyRes.statusCode || 200, data: parsed, cookie: updatedCookie });
          } catch {
            resolve({ status: proxyRes.statusCode || 500, data: null, cookie: updatedCookie });
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 504, data: null, cookie: cookieToSend });
    });
    req.on("error", () => resolve({ status: 500, data: null, cookie: cookieToSend }));
  });
}
async function fetchSecondaryJson(pathWithQuery, extraCookie = "") {
  let res = await fetchSecondaryJsonOnce(pathWithQuery, extraCookie);
  if (!res.data || res.status >= 500) {
    res = await fetchSecondaryJsonOnce(pathWithQuery, res.cookie || extraCookie);
  }
  return res;
}
function fetchMarcoJsonOnce(pathWithQuery, timeoutMs = 12e3) {
  return new Promise((resolve) => {
    const req = https.get(
      `${MARCO_ORIGIN}${pathWithQuery}`,
      {
        headers: {
          "user-agent": SEC_UA,
          accept: "application/json",
          referer: `${MARCO_ORIGIN}/pw`
        },
        agent: marcoKeepAliveAgent
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          try {
            const parsed = JSON.parse(text);
            resolve({ status: proxyRes.statusCode || 200, data: parsed });
          } catch {
            resolve({ status: proxyRes.statusCode || 500, data: null });
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 504, data: null });
    });
    req.on("error", () => resolve({ status: 500, data: null }));
  });
}
async function fetchMarcoJson(pathWithQuery, timeoutMs = 12e3) {
  let res = await fetchMarcoJsonOnce(pathWithQuery, timeoutMs);
  if (!res.data || res.status >= 500) {
    res = await fetchMarcoJsonOnce(pathWithQuery, timeoutMs);
  }
  return res;
}
function fetchMarcoText(pathWithQuery, timeoutMs = 12e3) {
  return new Promise((resolve) => {
    const fullUrl = pathWithQuery.startsWith("http") ? pathWithQuery : `${MARCO_ORIGIN}${pathWithQuery}`;
    const req = https.get(
      fullUrl,
      {
        headers: {
          "user-agent": SEC_UA,
          referer: `${MARCO_ORIGIN}/pw/player`
        },
        agent: marcoKeepAliveAgent
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          resolve({
            status: proxyRes.statusCode || 500,
            headers: proxyRes.headers,
            body: Buffer.concat(chunks).toString("utf-8")
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 504, headers: {}, body: "" });
    });
    req.on("error", () => resolve({ status: 500, headers: {}, body: "" }));
  });
}
async function syncNewBatchesFromSecondary() {
  if (isSyncRunning) return;
  isSyncRunning = true;
  let addedCount = 0;
  try {
    for (let p = 1; p <= 3; p++) {
      const r = await fetchWithAuth(`${TARGET_ORIGIN}/api/AllBatches?page=${p}`, `${TARGET_ORIGIN}/study/batches`);
      if (r.status === 200 && r.body) {
        try {
          const parsed = JSON.parse(r.body);
          if (parsed.success && Array.isArray(parsed.batches)) {
            if (p === 1) {
              if (Number(parsed.total) > 0) lxTotalBatches = Number(parsed.total);
              if (Number(parsed.totalPages) > 0) lxTotalPages = Number(parsed.totalPages);
            }
            for (const b of parsed.batches) {
              if (b && b._id) knownPrimaryIds.add(String(b._id));
            }
          }
        } catch {}
      }
    }
    if (liveNewFromSecondary.length > 0) {
      liveNewFromSecondary = liveNewFromSecondary.filter((b) => !knownPrimaryIds.has(String(b._id)));
    }
    for (let p = 1; p <= 3; p++) {
      const secAll = await fetchSecondaryJson(`/api/AllBatches?page=${p}`);
      const list = Array.isArray(secAll.data?.data) ? secAll.data.data : (Array.isArray(secAll.data?.batches) ? secAll.data.batches : []);
      for (const item of list) {
        const id = String(item._id || item.batchId || "");
        if (!id || knownPrimaryIds.has(id) || knownMissingIds.has(id)) continue;
        const name = String(item.batchName || item.name || "");
        let existsInPrimary = false;
        if (name) {
          const chk = await fetchWithAuth(`${TARGET_ORIGIN}/api/searchBatch?name=${encodeURIComponent(name)}&page=1`, `${TARGET_ORIGIN}/study/batches`);
          if (chk.status === 200 && chk.body) {
            try {
              const cp = JSON.parse(chk.body);
              if (Array.isArray(cp.batches) && cp.batches.some((x) => String(x._id || x.batchId) === id)) {
                existsInPrimary = true;
                knownPrimaryIds.add(id);
              }
            } catch {}
          }
        }
        if (!existsInPrimary && addExtraBatch(item, true)) {
          addedCount++;
        }
      }
    }
    const deepHead = await fetchSecondaryJson(`/api/deep-search?q=&page=1&size=48`);
    const deepTotal = Number(deepHead.data?.totalItems || 0);
    if (deepTotal > lastSecDeepTotal) {
      const startPage = Math.max(1, Math.floor(lastSecDeepTotal / 48));
      const endPage = Math.ceil(deepTotal / 48);
      for (let dp = startPage; dp <= endPage; dp++) {
        const dRes = await fetchSecondaryJson(`/api/deep-search?q=&page=${dp}&size=48`);
        const dList = Array.isArray(dRes.data?.data) ? dRes.data.data : [];
        for (const item of dList) {
          const id = String(item._id || item.batchId || "");
          if (!id || knownPrimaryIds.has(id) || knownMissingIds.has(id)) continue;
          const name = String(item.batchName || item.name || "");
          let existsInPrimary = false;
          if (name) {
            const chk = await fetchWithAuth(`${TARGET_ORIGIN}/api/searchBatch?name=${encodeURIComponent(name)}&page=1`, `${TARGET_ORIGIN}/study/batches`);
            if (chk.status === 200 && chk.body) {
              try {
                const cp = JSON.parse(chk.body);
                if (Array.isArray(cp.batches) && cp.batches.some((x) => String(x._id || x.batchId) === id)) {
                  existsInPrimary = true;
                  knownPrimaryIds.add(id);
                }
              } catch {}
            }
          }
          if (!existsInPrimary && addExtraBatch(item, true)) {
            addedCount++;
          }
        }
      }
      lastSecDeepTotal = deepTotal;
    }
    const marcoHead = await fetchMarcoJson(`/api/pw/get-Batches.json?page=1&limit=60`, 15e3);
    const marcoList = Array.isArray(marcoHead.data?.batches) ? marcoHead.data.batches : [];
    const marcoTotal = Number(marcoHead.data?.total || 0);
    const marcoCheckPool = [...marcoList];
    const needsInitialMarcoBackfill = !marcoBackfillDone && missingBatches.length <= 4320 && marcoList.length > 0;
    if (needsInitialMarcoBackfill || marcoTotal > lastMarcoTotal) {
      const pagesToScan = needsInitialMarcoBackfill
        ? Math.min(200, Math.ceil((marcoTotal || 19000) / 100))
        : Math.min(5, Math.ceil((marcoTotal - lastMarcoTotal) / 100) + 1);
      for (let mp = 1; mp <= pagesToScan; mp++) {
        const mr = await fetchMarcoJson(`/api/pw/get-Batches.json?page=${mp}&limit=100`, 15e3);
        if (Array.isArray(mr.data?.batches) && mr.data.batches.length > 0) {
          marcoCheckPool.push(...mr.data.batches);
        } else {
          break;
        }
      }
      if (needsInitialMarcoBackfill && marcoCheckPool.length > 1000) {
        marcoBackfillDone = true;
      }
      if (marcoTotal > lastMarcoTotal) lastMarcoTotal = marcoTotal;
    }
    const shyamKeywords = ["2027", "2028", "2026", "Bihar", "Inter", "Uday", "Arjuna", "Lakshya", "Prayas", "Yakeen", "Board Booster", "Foundation"];
    for (let si = 0; si < shyamKeywords.length; si += 3) {
      const chunk = shyamKeywords.slice(si, si + 3);
      const sResList = await Promise.all(
        chunk.map((kw) => fetchMarcoJsonOnce(`/api/pw/shyam?search=${encodeURIComponent(kw)}`, 8e3))
      );
      for (const sr of sResList) {
        if (Array.isArray(sr.data?.data)) {
          marcoCheckPool.push(...sr.data.data);
        }
      }
    }
    for (const item of marcoCheckPool) {
      const id = String(item.id || item.batch_id || item._id || "");
      if (!id || knownPrimaryIds.has(id) || knownMissingIds.has(id)) continue;
      const name = String(item.name || item.batchName || "");
      let existsInPrimary = false;
      if (name) {
        const chk = await fetchWithAuth(`${TARGET_ORIGIN}/api/searchBatch?name=${encodeURIComponent(name)}&page=1`, `${TARGET_ORIGIN}/study/batches`);
        if (chk.status === 200 && chk.body) {
          try {
            const cp = JSON.parse(chk.body);
            if (Array.isArray(cp.batches) && cp.batches.some((x) => String(x._id || x.batchId) === id)) {
              existsInPrimary = true;
              knownPrimaryIds.add(id);
            }
          } catch {}
        }
      }
      if (!existsInPrimary && addExtraBatch(item, true)) {
        addedCount++;
      }
    }
    if (addedCount > 0) {
      persistMissingBatches();
      allBatchesCache.clear();
      console.log(`[AutoSync] Added ${addedCount} new batches from ${SECONDARY_ORIGIN} / ${MARCO_ORIGIN}`);
    }
  } catch (err) {
    console.warn("[AutoSync] Error syncing new batches:", err?.message || err);
  } finally {
    isSyncRunning = false;
  }
}
setTimeout(syncNewBatchesFromSecondary, 3e3);
setInterval(syncNewBatchesFromSecondary, 10 * 60 * 1e3);
function isTokenExpired(cookieStr) {
  try {
    const rawJwt = cookieStr.replace(/^studymeta_access=/, "").split(";")[0];
    const parts = rawJwt.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (!payload.exp) return true;
    return Math.floor(Date.now() / 1e3) >= payload.exp - 7200;
  } catch {
    return true;
  }
}
setInterval(async () => {
  try {
    console.log("[Heartbeat] Proactively refreshing session token...");
    await fetchFreshAccessCookie();
  } catch (err) {
    console.warn("[Heartbeat] Proactive token refresh error:", err);
  }
}, 6 * 60 * 60 * 1e3);
async function fetchFreshAccessCookie() {
  try {
    const anonId = "anon_" + Date.now();
    const pageData = await new Promise((resolve, reject) => {
      const getReq = https.get(
        `${TARGET_ORIGIN}/key-generate?redirect=%2Fstudy%2Fbatches&type=full&anon_id=${anonId}`,
        {
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            referer: `${TARGET_ORIGIN}/study/batches`,
            cookie: `anon_id=${anonId}`
          },
          agent: keepAliveAgent
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on(
            "end",
            () => resolve({
              status: res.statusCode || 200,
              body: Buffer.concat(chunks).toString("utf-8")
            })
          );
        }
      );
      getReq.setTimeout(8e3, () => {
        getReq.destroy();
        reject(new Error("Timeout fetching key-generate page"));
      });
      getReq.on("error", reject);
    });
    const m = pageData.body.match(/\\?"token\\?":\s*\\?"([^"\\]+)\\?"/);
    if (!m || !m[1]) {
      return cachedAccessCookie;
    }
    const token = m[1];
    const verifyData = await new Promise((resolve, reject) => {
      const verifyReq = https.request(
        `${TARGET_ORIGIN}/api/complete-verification`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            referer: `${TARGET_ORIGIN}/verify?token=${encodeURIComponent(token)}`
          },
          agent: keepAliveAgent
        },
        (res) => {
          resolve({ status: res.statusCode || 200, headers: res.headers });
        }
      );
      verifyReq.setTimeout(8e3, () => {
        verifyReq.destroy();
        reject(new Error("Timeout completing verification"));
      });
      verifyReq.on("error", reject);
      verifyReq.write(JSON.stringify({ token }));
      verifyReq.end();
    });
    const setCookies = verifyData.headers["set-cookie"] || [];
    const accessCookie = (Array.isArray(setCookies) ? setCookies : [setCookies]).find((c) => c.startsWith("studymeta_access="));
    if (accessCookie) {
      cachedAccessCookie = accessCookie.split(";")[0];
      return cachedAccessCookie;
    }
  } catch (err) {
    console.error("Failed to auto-refresh access cookie:", err);
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
async function fetchWithAuth(url, referer) {
  let cookie = await getAccessCookie();
  const doRequest = (c) => new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          referer,
          cookie: c
        },
        agent: keepAliveAgent
      },
      (res2) => {
        const chunks = [];
        res2.on("data", (d) => chunks.push(d));
        res2.on(
          "end",
          () => resolve({
            status: res2.statusCode || 200,
            body: Buffer.concat(chunks).toString("utf-8")
          })
        );
      }
    );
    req.setTimeout(8e3, () => {
      req.destroy();
      resolve({ status: 504, body: "" });
    });
    req.on("error", () => resolve({ status: 500, body: "" }));
  });
  let res = await doRequest(cookie);
  if (res.status === 401 || res.status === 403 || res.status === 307 || res.body && res.body.includes("Unauthorised")) {
    console.log(`Auth invalidated on ${url}, refreshing token and retrying...`);
    cachedAccessCookie = "";
    cookie = await fetchFreshAccessCookie();
    res = await doRequest(cookie);
  }
  return res;
}
async function prewarmEssentialPages() {
  const pages = [
    "/study/batches",
    "/study/nexttoppers",
    "/study/missionjeet",
    "/study/vibrant",
    "/study/batches?_rsc=1",
    "/study/nexttoppers?_rsc=1",
    "/study/missionjeet?_rsc=1"
  ];
  for (const p of pages) {
    try {
      const res = await fetchWithAuth(`${TARGET_ORIGIN}${p}`, `${TARGET_ORIGIN}/study/batches`);
      if (res.status === 200 && res.body) {
        const isRsc = p.includes("_rsc=");
        const modified = transformText(res.body, !isRsc);
        pageCache.set(`${p}:${isRsc ? "1" : "0"}`, {
          body: Buffer.from(modified, "utf-8"),
          headers: {
            "content-type": isRsc ? "text/x-component" : "text/html; charset=utf-8"
          },
          timestamp: Date.now()
        });
      }
    } catch {
    }
  }
}
setTimeout(prewarmEssentialPages, 1e3);
setInterval(prewarmEssentialPages, 10 * 60 * 1e3);
function transformText(content, isHtml = false) {
  let text = content;
  text = text.replaceAll("https://www.learnxpw.site", "");
  text = text.replaceAll("http://www.learnxpw.site", "");
  text = text.replaceAll("https:\\/\\/www.learnxpw.site", "");
  text = text.replaceAll("https://learnxpw.site", "");
  text = text.replaceAll("http://learnxpw.site", "");
  text = text.replaceAll("https:\\/\\/learnxpw.site", "");
  text = text.replaceAll(OLD_ICON_URL, ICON_URL);
  text = text.replaceAll("https:\\/\\/i.ibb.co\\/V8CbjrG\\/image.png", ICON_URL.replace(/\//g, "\\/"));
  text = text.replaceAll("V8CbjrG/image.png", "Q3g9fGSt/1791541921524.png");
  text = text.replaceAll("V8CbjrG\\/image.png", "Q3g9fGSt\\/1791541921524.png");
  text = text.replaceAll("https://ibb.co/0R7qc34v", ICON_URL);
  text = text.replaceAll("https:\\/\\/ibb.co\\/0R7qc34v", ICON_URL.replace(/\//g, "\\/"));
  text = text.replaceAll(OLD_TG_URL, TELEGRAM_URL);
  text = text.replaceAll("https:\\/\\/t.me\\/+AgMz8cG-x8VmNGY1", TELEGRAM_URL.replace(/\//g, "\\/"));
  text = text.replaceAll(OLD_TG_URL_ALT, TELEGRAM_URL);
  text = text.replaceAll("https:\\/\\/t.me\\/AgMz8cG-x8VmNGY1", TELEGRAM_URL.replace(/\//g, "\\/"));
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
  text = text.replaceAll('"sidebarTitle":"Learnxpw"', `"sidebarTitle":"${BRAND_NAME}"`);
  text = text.replaceAll("Learnxpw \u2014 a comprehensive online study platform", `${BRAND_NAME} \u2014 a comprehensive online study platform`);
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
app.get("/logo.png", (_req, res) => {
  const localLogo = path.resolve(process.cwd(), "public", "logo.png");
  if (fs.existsSync(localLogo)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(localLogo).pipe(res);
  } else {
    res.redirect(ICON_URL);
  }
});
app.get("/cloudflare-pages.zip", (_req, res) => {
  const zipPath = path.resolve(process.cwd(), "public", "cloudflare-pages.zip");
  if (fs.existsSync(zipPath)) {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="cloudflare-pages.zip"');
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(zipPath).pipe(res);
  } else {
    res.status(404).send("Not found. Please run npm run build.");
  }
});
app.get(["/worker.js", "/_worker.js"], (_req, res) => {
  const workerPath = path.resolve(process.cwd(), "worker.js");
  if (fs.existsSync(workerPath)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(workerPath).pipe(res);
  } else {
    res.status(404).send("Worker script not found. Please run npm run build.");
  }
});
app.get("/", (req, res) => {
  if (req.query.home === "1") {
    handleProxy(req, res, "/");
  } else {
    res.redirect(307, "/study/batches");
  }
});
app.get("/key-generate", async (req, res) => {
  const cookie = await getAccessCookie();
  if (cookie) {
    res.setHeader("Set-Cookie", `${cookie}; Path=/; SameSite=Lax; Max-Age=86400`);
  }
  const target = req.query.redirect || "/study/batches";
  res.redirect(307, target);
});
app.get("/verify", async (_req, res) => {
  const cookie = await getAccessCookie();
  if (cookie) {
    res.setHeader("Set-Cookie", `${cookie}; Path=/; SameSite=Lax; Max-Age=86400`);
  }
  res.redirect(307, "/study/batches");
});
app.get("/study/key", (_req, res) => {
  res.redirect(307, "/study/batches");
});
app.get("/api/Schedule", async (req, res) => {
  const batchId = req.query.BatchId || req.query.batchId || req.query.batch_id || "";
  const subjectId = req.query.SubjectId || req.query.subjectId || req.query.subject_id || "";
  const contentId = req.query.ContentId || req.query.contentId || req.query.ChildId || req.query.childId || req.query.videoId || req.query.video_id || "";
  const accessCookie = await getAccessCookie();
  const watchReferer = `${TARGET_ORIGIN}/watch?batchId=${batchId}&SubjectId=${subjectId}&ContentId=${contentId}`;
  try {
    const upstreamUrl = `${TARGET_ORIGIN}/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(contentId)}`;
    const upstreamRes = await new Promise((resolve) => {
      const sReq = https.get(
        upstreamUrl,
        {
          headers: {
            "user-agent": req.headers["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            referer: watchReferer,
            cookie: accessCookie
          },
          agent: keepAliveAgent
        },
        (proxyRes) => {
          const chunks = [];
          proxyRes.on("data", (c) => chunks.push(c));
          proxyRes.on("end", () => {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
              resolve({ status: proxyRes.statusCode || 200, data: parsed });
            } catch {
              resolve({ status: proxyRes.statusCode || 500, data: null });
            }
          });
        }
      );
      sReq.setTimeout(8e3, () => {
        sReq.destroy();
        resolve({ status: 504, data: null });
      });
      sReq.on("error", () => resolve({ status: 500, data: null }));
    });
    if (upstreamRes.status === 200 && upstreamRes.data?.success && (upstreamRes.data?.data?.urlType || Array.isArray(upstreamRes.data?.data) && upstreamRes.data?.data[0]?.urlType)) {
      const item = Array.isArray(upstreamRes.data.data) ? upstreamRes.data.data[0] : upstreamRes.data.data;
      const schUrl = String(item?.url || "");
      const schType = String(item?.urlType || "");
      if (schUrl || schType === "youtube") {
        const mU = schUrl.match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
        if (mU && mU[1] && batchId && subjectId && contentId) {
          videoUuidMap.set(mU[1], { batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) });
        }
        if (batchId && subjectId && contentId) {
          res.setHeader("Set-Cookie", `gb_sec_watch=${encodeURIComponent(JSON.stringify({ batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) }))}; Path=/; SameSite=Lax; Max-Age=86400`);
        }
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(upstreamRes.data);
      }
    }
  } catch (err) {
    console.warn("Upstream /api/Schedule fetch encountered error, using resilient fallback:", err);
  }
  let urlType = "penpencilvdo";
  let videoUrl = "";
  const topic = "Class Lecture";
  try {
    const vUrl = `${TARGET_ORIGIN}/api/video-url?batch_id=${encodeURIComponent(batchId)}&subject_id=${encodeURIComponent(subjectId)}&video_id=${encodeURIComponent(contentId)}`;
    const vRes = await new Promise((resolve) => {
      const vReq = https.get(
        vUrl,
        {
          headers: {
            "user-agent": req.headers["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            referer: watchReferer,
            cookie: accessCookie
          },
          agent: keepAliveAgent
        },
        (proxyRes) => {
          const chunks = [];
          proxyRes.on("data", (c) => chunks.push(c));
          proxyRes.on("end", () => {
            try {
              resolve({
                status: proxyRes.statusCode || 200,
                data: JSON.parse(Buffer.concat(chunks).toString("utf-8"))
              });
            } catch {
              resolve({ status: proxyRes.statusCode || 500, data: null });
            }
          });
        }
      );
      vReq.setTimeout(8e3, () => {
        vReq.destroy();
        resolve({ status: 504, data: null });
      });
      vReq.on("error", () => resolve({ status: 500, data: null }));
    });
    if (vRes.status === 200 && vRes.data?.success && vRes.data?.data) {
      urlType = vRes.data.data.urlType || "penpencilvdo";
      videoUrl = vRes.data.data.url || "";
    }
  } catch {
  }
  if (!videoUrl) {
    try {
      const secRes = await fetchSecondaryJson(`/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(contentId)}`);
      if (secRes.status === 200 && secRes.data?.success && (secRes.data?.data?.urlType || Array.isArray(secRes.data?.data) && secRes.data?.data[0]?.urlType)) {
        const schUrl = String((Array.isArray(secRes.data.data) ? secRes.data.data[0]?.url : secRes.data.data?.url) || "");
        const mU = schUrl.match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
        if (mU && mU[1] && batchId && subjectId && contentId) {
          videoUuidMap.set(mU[1], { batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) });
        }
        if (batchId && subjectId && contentId) {
          res.setHeader("Set-Cookie", `gb_sec_watch=${encodeURIComponent(JSON.stringify({ batchId: String(batchId), subjectId: String(subjectId), contentId: String(contentId) }))}; Path=/; SameSite=Lax; Max-Age=86400`);
        }
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(secRes.data);
      }
    } catch {
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
          const mp4Full = rawUrl.startsWith("http") ? rawUrl : `${MARCO_ORIGIN}${rawUrl}`;
          videoUrl = mp4Full;
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
        if (batchId && contentId) {
          res.setHeader("Set-Cookie", `gb_sec_watch=${encodeURIComponent(JSON.stringify({ batchId: String(batchId), subjectId: String(subjectId || "all"), contentId: String(contentId) }))}; Path=/; SameSite=Lax; Max-Age=86400`);
        }
      }
    } catch {
    }
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    success: true,
    data: {
      _id: contentId,
      topic,
      title: topic,
      name: topic,
      urlType,
      url: videoUrl,
      videoDetails: {},
      availableFor: [],
      platformRestricted: false,
      restrictedSchedule: false,
      restrictedTime: 0
    }
  });
});
app.get("/api/auth/serverInfo", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    webName: BRAND_NAME,
    sidebarLogoUrl: ICON_URL,
    sidebarTitle: BRAND_NAME,
    maintenanceMode: false,
    tg_channel: TELEGRAM_URL,
    tg_username: "@sarvottamji",
    isDirectLoginOpen: true,
    tg_bot: "@sarvottamji",
    shortner_servers: []
  });
});
app.get("/api/AllBatches", async (req, res) => {
  const pageNum = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const page = String(pageNum);
  const liveIds = new Set(liveNewFromSecondary.map((b) => String(b._id)));
  const pagedExtras = liveIds.size > 0 ? missingBatches.filter((b) => !liveIds.has(String(b._id))) : missingBatches;
  const extraCount = pagedExtras.length;
  const extraPages = Math.ceil(extraCount / 20);
  if (pageNum > lxTotalPages && extraCount > 0) {
    const offset = (pageNum - lxTotalPages - 1) * 20;
    const slice = pagedExtras.slice(offset, offset + 20);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "LOCAL-EXTRA");
    return res.status(200).json({
      success: true,
      batches: slice,
      totalPages: lxTotalPages + extraPages,
      currentPage: pageNum,
      total: lxTotalBatches + liveIds.size + extraCount
    });
  }
  const cached = allBatchesCache.get(page);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cached.rawString);
  }
  const accessCookie = await getAccessCookie();
  try {
    const upstreamUrl = `${TARGET_ORIGIN}/api/AllBatches?page=${encodeURIComponent(page)}`;
    const upstreamRes = await new Promise((resolve) => {
      const gReq = https.get(
        upstreamUrl,
        {
          headers: {
            "user-agent": req.headers["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            referer: `${TARGET_ORIGIN}/study/batches`,
            cookie: accessCookie
          },
          agent: keepAliveAgent
        },
        (proxyRes) => {
          const chunks = [];
          proxyRes.on("data", (c) => chunks.push(c));
          proxyRes.on(
            "end",
            () => resolve({
              status: proxyRes.statusCode || 200,
              body: Buffer.concat(chunks).toString("utf-8")
            })
          );
        }
      );
      gReq.setTimeout(8e3, () => {
        gReq.destroy();
        resolve({ status: 504, body: "" });
      });
      gReq.on("error", () => resolve({ status: 500, body: "" }));
    });
    if (upstreamRes.status === 200 && upstreamRes.body) {
      try {
        const parsed = JSON.parse(upstreamRes.body);
        if (parsed.success && parsed.batches) {
          if (Number(parsed.total) > 0) lxTotalBatches = Number(parsed.total);
          if (Number(parsed.totalPages) > 0) lxTotalPages = Number(parsed.totalPages);
          for (const b of parsed.batches) {
            if (b && b._id) knownPrimaryIds.add(String(b._id));
            if (!b.previewImage || !b.previewImage.startsWith("http") || b.previewImage.trim() === "") {
              b.previewImage = ICON_URL;
            }
          }
          if (pageNum === 1 && liveNewFromSecondary.length > 0) {
            const pageIds = new Set(parsed.batches.map((b) => String(b._id || b.batchId)));
            const freshToPrepend = liveNewFromSecondary.filter((b) => !pageIds.has(String(b._id)));
            if (freshToPrepend.length > 0) {
              parsed.batches = [...freshToPrepend, ...parsed.batches];
            }
          }
          parsed.total = lxTotalBatches + liveIds.size + extraCount;
          parsed.totalPages = lxTotalPages + extraPages;
          const modified = transformText(JSON.stringify(parsed));
          allBatchesCache.set(page, {
            data: parsed,
            rawString: modified,
            timestamp: Date.now()
          });
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Cache", "MISS");
          return res.status(200).send(modified);
        }
      } catch {
      }
    }
  } catch (err) {
    console.warn("Upstream AllBatches fetch error:", err);
  }
  if (cached && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(cached.rawString);
  }
  if (extraCount > 0) {
    const offset = (pageNum - 1) * 20;
    const slice = missingBatches.slice(offset, offset + 20);
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      success: true,
      batches: slice,
      totalPages: Math.max(1, extraPages),
      currentPage: pageNum,
      total: extraCount
    });
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    success: true,
    batches: [],
    totalPages: 1,
    currentPage: 1,
    total: 0
  });
});
app.get("/api/BatchInfo", async (req, res) => {
  const batchId = req.query.BatchId || req.query.batchId || "";
  const type = (req.query.Type || req.query.type || "details").toLowerCase();
  const page = req.query.page || "1";
  if (!batchId || batchId === "undefined" || batchId === "null") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ success: true, data: type === "details" ? {} : [] });
  }
  const cacheKey = `${batchId}:${type}:${page}`;
  const cached = batchInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cached.rawString);
  }
  let primaryDetailsFallback = null;
  try {
    const upstreamUrl = `${TARGET_ORIGIN}/api/BatchInfo?BatchId=${encodeURIComponent(batchId)}&Type=${encodeURIComponent(type)}${page ? `&page=${encodeURIComponent(page)}` : ""}`;
    const upstreamRes = await fetchWithAuth(upstreamUrl, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (upstreamRes.status === 200 && upstreamRes.body) {
      try {
        const parsed = JSON.parse(upstreamRes.body);
        const isDetails = type === "details";
        const hasIdentity = Boolean(parsed.data && (parsed.data._id || parsed.data.name || parsed.data.batchName));
        const hasSubjects = Array.isArray(parsed.data?.subjects) && parsed.data.subjects.length > 0;
        const hasValidData = isDetails ? (hasIdentity && hasSubjects) : Array.isArray(parsed.data) && parsed.data.length > 0;
        if (parsed.success && hasValidData) {
          const modified = transformText(upstreamRes.body);
          batchInfoCache.set(cacheKey, {
            data: parsed,
            rawString: modified,
            timestamp: Date.now()
          });
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Cache", "MISS");
          return res.status(200).send(modified);
        }
        if (parsed.success && isDetails && hasIdentity) {
          primaryDetailsFallback = { parsed, modified: transformText(upstreamRes.body) };
        }
      } catch {
      }
    }
  } catch (err) {
    console.warn("Upstream BatchInfo fetch error:", err);
  }
  try {
    const secPath = `/api/BatchInfo?BatchId=${encodeURIComponent(batchId)}&Type=${encodeURIComponent(type)}${page ? `&page=${encodeURIComponent(page)}` : ""}`;
    const secRes = await fetchSecondaryJson(secPath);
    const secHasSubjects = type !== "details" || (Array.isArray(secRes.data?.data?.subjects) && secRes.data.data.subjects.length > 0);
    if (secRes.status === 200 && secRes.data?.success && secRes.data?.data && (!primaryDetailsFallback || secHasSubjects)) {
      const modified = transformText(JSON.stringify(secRes.data));
      batchInfoCache.set(cacheKey, {
        data: secRes.data,
        rawString: modified,
        timestamp: Date.now()
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "SEC-FALLBACK");
      return res.status(200).send(modified);
    }
  } catch (err) {
    console.warn("Secondary BatchInfo fetch error:", err);
  }
  try {
    const marcoPath = type === "announcement"
      ? `/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/announcement?page=${encodeURIComponent(page)}&limit=10`
      : `/api/pw/radha/v3/batches/${encodeURIComponent(batchId)}/details`;
    const mRes = await fetchMarcoJson(marcoPath);
    const mHasData = type === "details"
      ? Boolean(mRes.data?.data && (mRes.data.data._id || mRes.data.data.name || mRes.data.data.batchName))
      : Array.isArray(mRes.data?.data) && mRes.data.data.length > 0;
    const mHasSubjects = type !== "details" || (Array.isArray(mRes.data?.data?.subjects) && mRes.data.data.subjects.length > 0);
    if (mRes.status === 200 && mRes.data?.success && mHasData && (!primaryDetailsFallback || mHasSubjects)) {
      const modified = transformText(JSON.stringify(mRes.data));
      batchInfoCache.set(cacheKey, {
        data: mRes.data,
        rawString: modified,
        timestamp: Date.now()
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "MARCO-FALLBACK");
      return res.status(200).send(modified);
    }
  } catch (err) {
    console.warn("Marco BatchInfo fetch error:", err);
  }
  if (primaryDetailsFallback) {
    batchInfoCache.set(cacheKey, {
      data: primaryDetailsFallback.parsed,
      rawString: primaryDetailsFallback.modified,
      timestamp: Date.now()
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "PRIMARY-EMPTY-SUBJ");
    return res.status(200).send(primaryDetailsFallback.modified);
  }
  if (cached && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(cached.rawString);
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    success: true,
    data: type === "details" ? { _id: batchId, name: "Batch", subjects: [] } : []
  });
});
app.get("/api/SubjectInfo", async (req, res) => {
  const batchId = req.query.BatchId || req.query.batchId || "";
  const subjectId = req.query.SubjectId || req.query.subjectId || "";
  const page = req.query.page || "1";
  if (!batchId || batchId === "undefined" || !subjectId || subjectId === "undefined") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ success: true, data: [] });
  }
  const cacheKey = `${batchId}:${subjectId}:${page}`;
  const cached = subjectInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cached.rawString);
  }
  try {
    const upstreamUrl = `${TARGET_ORIGIN}/api/SubjectInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&page=${encodeURIComponent(page)}`;
    const upstreamRes = await fetchWithAuth(upstreamUrl, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (upstreamRes.status === 200 && upstreamRes.body) {
      try {
        const parsed = JSON.parse(upstreamRes.body);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          const modified = transformText(upstreamRes.body);
          subjectInfoCache.set(cacheKey, {
            data: parsed,
            rawString: modified,
            timestamp: Date.now()
          });
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Cache", "MISS");
          return res.status(200).send(modified);
        }
      } catch {
      }
    }
  } catch (err) {
    console.warn("Upstream SubjectInfo fetch error:", err);
  }
  try {
    const secPath = `/api/SubjectInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&page=${encodeURIComponent(page)}`;
    const secRes = await fetchSecondaryJson(secPath);
    if (secRes.status === 200 && Array.isArray(secRes.data?.data) && secRes.data.data.length > 0) {
      const modified = transformText(JSON.stringify(secRes.data));
      subjectInfoCache.set(cacheKey, {
        data: secRes.data,
        rawString: modified,
        timestamp: Date.now()
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "SEC-FALLBACK");
      return res.status(200).send(modified);
    }
  } catch (err) {
    console.warn("Secondary SubjectInfo fetch error:", err);
  }
  try {
    let mRes = await fetchMarcoJson(`/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/topics?page=${encodeURIComponent(page)}&limit=20`);
    if (!(mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0)) {
      mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/topics?page=${encodeURIComponent(page)}&limit=20`);
    }
    if (mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0) {
      const modified = transformText(JSON.stringify(mRes.data));
      subjectInfoCache.set(cacheKey, {
        data: mRes.data,
        rawString: modified,
        timestamp: Date.now()
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "MARCO-FALLBACK");
      return res.status(200).send(modified);
    }
  } catch (err) {
    console.warn("Marco SubjectInfo fetch error:", err);
  }
  if (cached && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(cached.rawString);
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ success: true, data: [] });
});
app.get("/api/TopicInfo", async (req, res) => {
  const batchId = req.query.BatchId || req.query.batchId || "";
  const subjectId = req.query.SubjectId || req.query.subjectId || "";
  const topicId = req.query.TopicId || req.query.topicId || "";
  const contentType = req.query.ContentType || req.query.contentType || "videos";
  const page = req.query.page || "1";
  if (!batchId || batchId === "undefined" || !subjectId || subjectId === "undefined" || !topicId || topicId === "undefined") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ success: true, data: [] });
  }
  const cacheKey = `${batchId}:${subjectId}:${topicId}:${contentType}:${page}`;
  const cached = topicInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cached.rawString);
  }
  try {
    const upstreamUrl = `${TARGET_ORIGIN}/api/TopicInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&TopicId=${encodeURIComponent(topicId)}&ContentType=${encodeURIComponent(contentType)}&page=${encodeURIComponent(page)}`;
    const upstreamRes = await fetchWithAuth(upstreamUrl, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (upstreamRes.status === 200 && upstreamRes.body) {
      try {
        const parsed = JSON.parse(upstreamRes.body);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          const modified = transformText(upstreamRes.body);
          topicInfoCache.set(cacheKey, {
            data: parsed,
            rawString: modified,
            timestamp: Date.now()
          });
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Cache", "MISS");
          return res.status(200).send(modified);
        }
      } catch {
      }
    }
  } catch (err) {
    console.warn("Upstream TopicInfo fetch error:", err);
  }
  try {
    const secPath = `/api/TopicInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&TopicId=${encodeURIComponent(topicId)}&ContentType=${encodeURIComponent(contentType)}&page=${encodeURIComponent(page)}`;
    const secRes = await fetchSecondaryJson(secPath);
    if (secRes.status === 200 && Array.isArray(secRes.data?.data) && secRes.data.data.length > 0) {
      const modified = transformText(JSON.stringify(secRes.data));
      topicInfoCache.set(cacheKey, {
        data: secRes.data,
        rawString: modified,
        timestamp: Date.now()
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "SEC-FALLBACK");
      return res.status(200).send(modified);
    }
  } catch (err) {
    console.warn("Secondary TopicInfo fetch error:", err);
  }
  try {
    let mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/contents?tag=${encodeURIComponent(topicId)}&contentType=${encodeURIComponent(contentType)}&page=${encodeURIComponent(page)}&limit=20`);
    if (!(mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0)) {
      const v3Map = { videos: "LECTURES", notes: "NOTES", DppNotes: "DPP_PDF", exercises: "DPP_QUIZ", DppVideos: "DPP_VIDEOS" };
      const v3Ct = v3Map[contentType] || "LECTURES";
      const skip = Math.max(0, (parseInt(String(page), 10) - 1) * 20);
      mRes = await fetchMarcoJson(`/api/pw/radha/batch-service/v3/batch-subject-schedules/${encodeURIComponent(batchId)}/subject/${encodeURIComponent(subjectId)}/contents?skip=${skip}&limit=20&contentType=${encodeURIComponent(v3Ct)}&tagId=${encodeURIComponent(topicId)}`);
    }
    if (mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0) {
      const modified = transformText(JSON.stringify(mRes.data));
      topicInfoCache.set(cacheKey, {
        data: mRes.data,
        rawString: modified,
        timestamp: Date.now()
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", "MARCO-FALLBACK");
      return res.status(200).send(modified);
    }
  } catch (err) {
    console.warn("Marco TopicInfo fetch error:", err);
  }
  if (cached && cached.rawString) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(cached.rawString);
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ success: true, data: [] });
});
app.get("/api/searchBatch", async (req, res) => {
  const name = String(req.query.name || req.query.batchName || req.query.q || "").trim();
  const pageNum = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const page = String(pageNum);
  const normQ = normalizeSearchText(name);
  const tokens = normQ ? normQ.split(/\s+/).filter(Boolean) : [];
  const localMatches = searchMissingBatches(name);
  const accessCookie = await getAccessCookie();
  const fetchLxSearch = () => new Promise((resolve) => {
    const upstreamUrl = `${TARGET_ORIGIN}/api/searchBatch?name=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}`;
    const sReq = https.get(
      upstreamUrl,
      {
        headers: {
          "user-agent": req.headers["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          referer: `${TARGET_ORIGIN}/study/batches`,
          cookie: accessCookie
        },
        agent: keepAliveAgent
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            resolve({ status: proxyRes.statusCode || 200, data: parsed });
          } catch {
            resolve({ status: proxyRes.statusCode || 500, data: null });
          }
        });
      }
    );
    sReq.setTimeout(8e3, () => {
      sReq.destroy();
      resolve({ status: 504, data: null });
    });
    sReq.on("error", () => resolve({ status: 500, data: null }));
  });
  const [lxRes, marcoSearchRes, shyamSearchRes, deepRes] = await Promise.all([
    fetchLxSearch(),
    name ? fetchMarcoJsonOnce(`/api/pw/get-Batches.json?search=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}&limit=40`, 5e3) : Promise.resolve({ status: 200, data: null }),
    name && pageNum === 1 ? fetchMarcoJsonOnce(`/api/pw/shyam?search=${encodeURIComponent(name)}`, 5e3) : Promise.resolve({ status: 200, data: null }),
    name ? fetchSecondaryJsonOnce(`/api/deep-search?q=${encodeURIComponent(name)}&page=${encodeURIComponent(page)}&size=20`, "", 4e3) : Promise.resolve({ status: 200, data: null })
  ]);
  let lxParsed = null;
  if (lxRes.status === 200 && lxRes.data?.success && Array.isArray(lxRes.data.batches)) {
    for (const b of lxRes.data.batches) {
      if (!b.previewImage || !b.previewImage.startsWith("http") || b.previewImage.trim() === "") {
        b.previewImage = ICON_URL;
      }
    }
    lxParsed = lxRes.data;
  }
  const marcoRawList = Array.isArray(marcoSearchRes.data?.batches) ? marcoSearchRes.data.batches.map(normalizeBatchObj).filter((b) => b._id) : [];
  const marcoTotalPages = Math.max(1, Number(marcoSearchRes.data?.totalPages || 1));
  const marcoMatches = normQ ? marcoRawList.filter((b) => scoreBatchForQuery(b, normQ, tokens) > 0) : marcoRawList;
  const shyamRawList = Array.isArray(shyamSearchRes.data?.data) ? shyamSearchRes.data.data.map(normalizeBatchObj).filter((b) => b._id) : [];
  const shyamMatches = normQ ? shyamRawList.filter((b) => scoreBatchForQuery(b, normQ, tokens) > 0) : shyamRawList;
  const deepRawList = (deepRes.status === 200 && deepRes.data?.success && Array.isArray(deepRes.data.data))
    ? deepRes.data.data.map(normalizeBatchObj).filter((b) => b._id)
    : [];
  const deepMatches = normQ ? deepRawList.filter((b) => scoreBatchForQuery(b, normQ, tokens) > 0) : deepRawList;
  const rankAndSort = (list) => {
    const map = /* @__PURE__ */ new Map();
    for (const item of list) {
      const id = String(item._id || item.batchId || "");
      if (!id || map.has(id)) continue;
      map.set(id, item);
    }
    const arr = Array.from(map.values());
    if (!normQ) return arr;
    return arr.map((b) => ({
      b,
      score: scoreBatchForQuery(b, normQ, tokens),
      t: Date.parse(b.startDate || "") || 0
    })).sort((a, b) => (b.score - a.score) || (b.t - a.t)).map((x) => x.b);
  };
  const lxBatches = lxParsed ? lxParsed.batches : [];
  const lxTotal = lxParsed ? Number(lxParsed.total ?? lxBatches.length) : 0;
  const lxPages = lxParsed ? Math.max(1, Number(lxParsed.totalPages || 1)) : 0;
  if (lxPages <= 1 && marcoTotalPages <= 1) {
    const merged = rankAndSort([...lxBatches, ...localMatches, ...marcoMatches, ...shyamMatches, ...deepMatches]);
    const finalList = merged.length > 0 ? merged : rankAndSort(deepRawList);
    const totalPages = Math.max(1, Math.ceil(finalList.length / 20));
    const slice = finalList.slice((pageNum - 1) * 20, pageNum * 20);
    const payload = {
      success: true,
      batches: slice,
      totalPages,
      currentPage: pageNum,
      total: finalList.length
    };
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(transformText(JSON.stringify(payload)));
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
    const combinedTotal = Math.max(lxTotal + localMatches.length, Number(marcoSearchRes.data?.total || 0), page1List.length);
    const remainingLocal = Math.max(0, localMatches.length - 10);
    const combinedTotalPages = Math.max(lxPages + Math.ceil(remainingLocal / 20), marcoTotalPages);
    const payload = {
      success: true,
      batches: page1List,
      totalPages: combinedTotalPages,
      currentPage: 1,
      total: combinedTotal
    };
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(transformText(JSON.stringify(payload)));
  }
  if (lxParsed && pageNum <= lxPages) {
    const seen = new Set(lxBatches.map((b) => String(b._id || b.batchId)));
    const pageExtras = marcoMatches.filter((b) => !seen.has(String(b._id))).slice(0, 20);
    const remainingLocal = Math.max(0, localMatches.length - 10);
    const combinedTotalPages = Math.max(lxPages + Math.ceil(remainingLocal / 20), marcoTotalPages);
    const combinedTotal = Math.max(lxTotal + localMatches.length, Number(marcoSearchRes.data?.total || 0));
    const payload = {
      success: true,
      batches: [...lxBatches, ...pageExtras],
      totalPages: combinedTotalPages,
      currentPage: pageNum,
      total: combinedTotal
    };
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(transformText(JSON.stringify(payload)));
  }
  if (marcoMatches.length > 0 && pageNum <= marcoTotalPages) {
    const remainingLocal = Math.max(0, localMatches.length - 10);
    const combinedTotalPages = Math.max(lxPages + Math.ceil(remainingLocal / 20), marcoTotalPages);
    const combinedTotal = Math.max(lxTotal + localMatches.length, Number(marcoSearchRes.data?.total || 0));
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      success: true,
      batches: marcoMatches,
      totalPages: combinedTotalPages,
      currentPage: pageNum,
      total: combinedTotal
    });
  }
  if (localMatches.length > 0) {
    const offset = Math.max(0, (pageNum - Math.max(1, lxPages) - 1) * 20);
    const slice = localMatches.slice(offset, offset + 20);
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      success: true,
      batches: slice,
      totalPages: Math.max(pageNum, Math.ceil(localMatches.length / 20)),
      currentPage: pageNum,
      total: lxTotal + localMatches.length
    });
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    success: true,
    batches: [],
    totalPages: 1,
    currentPage: pageNum,
    total: 0
  });
});
function parseWatchIdsFromReq(req) {
  const q = req.query || {};
  let batchId = String(q.batchId || q.BatchId || q.batch_id || "");
  let subjectId = String(q.subjectId || q.SubjectId || q.subject_id || "");
  let contentId = String(q.contentId || q.ContentId || q.childId || q.ChildId || q.videoId || q.video_id || "");
  const ref = String(req.headers.referer || "");
  if (ref && (!batchId || !subjectId || !contentId)) {
    try {
      const u = new URL(ref);
      batchId = batchId || u.searchParams.get("batchId") || u.searchParams.get("BatchId") || "";
      subjectId = subjectId || u.searchParams.get("SubjectId") || u.searchParams.get("subjectId") || "";
      contentId = contentId || u.searchParams.get("ContentId") || u.searchParams.get("ChildId") || u.searchParams.get("videoId") || "";
    } catch {
    }
  }
  if ((!batchId || !subjectId || !contentId) && q.path) {
    const m = String(q.path).match(/\/([^/]+)\/master\.(?:m3u8|mpd)/i);
    if (m && m[1] && videoUuidMap.has(m[1])) {
      const cached = videoUuidMap.get(m[1]);
      batchId = batchId || cached.batchId;
      subjectId = subjectId || cached.subjectId;
      contentId = contentId || cached.contentId;
    }
  }
  if ((!batchId || !subjectId || !contentId) && req.headers.cookie) {
    const rawWatch = parseCookieVal(req.headers.cookie, "gb_sec_watch");
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
function httpsGetText(targetUrl, hdrs = {}, timeoutMs = 12e3) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const mod = parsed.protocol === "http:" ? http : https;
      const req = mod.get(
        targetUrl,
        { headers: hdrs, agent: parsed.protocol === "https:" ? keepAliveAgent : undefined },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf-8")
          }));
        }
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ status: 504, headers: {}, body: "" });
      });
      req.on("error", () => resolve({ status: 502, headers: {}, body: "" }));
    } catch {
      resolve({ status: 500, headers: {}, body: "" });
    }
  });
}
function httpsProbeOk(targetUrl, timeoutMs = 4e3) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const mod = parsed.protocol === "http:" ? http : https;
      const req = mod.get(
        targetUrl,
        { headers: { "user-agent": SEC_UA, range: "bytes=0-255" }, agent: parsed.protocol === "https:" ? keepAliveAgent : undefined },
        (res) => {
          res.resume();
          resolve((res.statusCode || 500) < 400);
        }
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
app.get("/api/play", async (req, res) => {
  const mediaUrl = String(req.query.url || "");
  if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
    let isMpdUrl = false;
    try {
      isMpdUrl = /\.mpd$/i.test(new URL(mediaUrl).pathname);
    } catch {
    }
    if (isMpdUrl) {
      try {
        const directRes = await httpsGetText(mediaUrl, { "user-agent": SEC_UA }, 12e3);
        if (directRes.status >= 200 && directRes.status < 400 && directRes.body) {
          const mpdText = injectMpdBaseUrl(directRes.body, mediaUrl);
          res.setHeader("Content-Type", directRes.headers["content-type"] || "application/dash+xml");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-store");
          return res.status(directRes.status).send(mpdText);
        }
      } catch {
      }
      return handleProxy(req, res);
    }
    const streamMedia = (attempt = 0) => {
      try {
        const parsedMedia = new URL(mediaUrl);
        const mod = parsedMedia.protocol === "http:" ? http : https;
        const fwdHeaders = { "user-agent": SEC_UA };
        if (req.headers.range) fwdHeaders.range = String(req.headers.range);
        if (req.headers["if-range"]) fwdHeaders["if-range"] = String(req.headers["if-range"]);
        const mediaReq = mod.get(
          mediaUrl,
          {
            headers: fwdHeaders,
            agent: parsedMedia.protocol === "https:" ? (attempt === 0 ? keepAliveAgent : new https.Agent({ family: 4, keepAlive: false })) : undefined
          },
          (streamRes) => {
            const code = streamRes.statusCode || 200;
            if (code >= 400) {
              streamRes.resume();
              return handleProxy(req, res);
            }
            const ct = String(streamRes.headers["content-type"] || "application/octet-stream");
            if (ct.toLowerCase().includes("xml") || ct.toLowerCase().includes("dash+xml")) {
              const chunks = [];
              streamRes.on("data", (c) => chunks.push(c));
              streamRes.on("end", () => {
                const xmlText = injectMpdBaseUrl(Buffer.concat(chunks).toString("utf-8"), mediaUrl);
                res.setHeader("Content-Type", ct);
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Cache-Control", "no-store");
                res.status(code).send(xmlText);
              });
              return;
            }
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
            res.setHeader("Content-Type", ct);
            if (streamRes.headers["content-range"]) res.setHeader("Content-Range", streamRes.headers["content-range"]);
            if (streamRes.headers["accept-ranges"]) res.setHeader("Accept-Ranges", streamRes.headers["accept-ranges"]);
            if (streamRes.headers["content-length"]) res.setHeader("Content-Length", streamRes.headers["content-length"]);
            res.setHeader("Cache-Control", "no-store");
            res.status(code);
            streamRes.pipe(res);
          }
        );
        mediaReq.setTimeout(3e4, () => {
          mediaReq.destroy();
          if (!res.headersSent) res.status(504).json({ success: false, message: "Media stream timeout" });
        });
        mediaReq.on("error", () => {
          if (!res.headersSent && attempt === 0) return streamMedia(1);
          if (!res.headersSent) handleProxy(req, res);
        });
      } catch {
        if (!res.headersSent) handleProxy(req, res);
      }
    };
    return streamMedia(0);
  }
  return handleProxy(req, res);
});
function fetchSecondaryText(fullUrl, headers = {}, timeoutMs = 12e3) {
  return new Promise((resolve) => {
    const cookieToSend = headers.cookie || cachedSecCookie;
    const reqHeaders = {
      "user-agent": SEC_UA,
      referer: `${SECONDARY_ORIGIN}/study/batches`,
      ...headers
    };
    if (cookieToSend) reqHeaders.cookie = cookieToSend;
    const req = https.get(
      fullUrl,
      {
        headers: reqHeaders,
        agent: secKeepAliveAgent
      },
      (proxyRes) => {
        const sc = proxyRes.headers["set-cookie"];
        let updatedCookie = cookieToSend;
        if (sc && sc.length) {
          updatedCookie = mergeSetCookies(cookieToSend, sc);
          cachedSecCookie = mergeSetCookies(cachedSecCookie, sc);
        }
        const chunks = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          resolve({
            status: proxyRes.statusCode || 500,
            headers: proxyRes.headers,
            cookie: updatedCookie,
            body: Buffer.concat(chunks).toString("utf-8")
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 504, headers: {}, cookie: cookieToSend, body: "" });
    });
    req.on("error", () => resolve({ status: 500, headers: {}, cookie: cookieToSend, body: "" }));
  });
}
app.get("/api/play/m3u8", async (req, res) => {
  const { batchId, subjectId, contentId } = parseWatchIdsFromReq(req);
  let clientSecCookie = parseCookieVal(req.headers.cookie, "gb_sec_tok") || cachedSecCookie;
  if (batchId && subjectId && contentId) {
    try {
      const fetchPlaylistOnce = async (secCookie) => {
        const hlsRes = await fetchSecondaryJson(`/api/hls-stream-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(contentId)}&videoId=${encodeURIComponent(contentId)}`, secCookie);
        let activeCookie = hlsRes.cookie || secCookie;
        let m3u8Path = hlsRes.status === 200 && hlsRes.data?.success ? hlsRes.data?.data?.url : "";
        if (!m3u8Path) {
          const gvRes = await fetchSecondaryJson(`/api/get-video-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(contentId)}`, activeCookie);
          activeCookie = gvRes.cookie || activeCookie;
          if (gvRes.status === 200 && gvRes.data?.success && gvRes.data?.data?.url) {
            m3u8Path = gvRes.data.data.m3u8_url || gvRes.data.data.hls_url || gvRes.data.data.url;
          }
        }
        if (!m3u8Path) return { status: 404, body: "", headers: {}, cookie: activeCookie };
        const fullM3u8Url = String(m3u8Path).startsWith("http") ? String(m3u8Path) : `${SECONDARY_ORIGIN}${m3u8Path}`;
        const playlistRes = await fetchSecondaryText(fullM3u8Url, activeCookie ? { cookie: activeCookie } : {});
        return {
          status: playlistRes.status,
          body: playlistRes.body,
          headers: playlistRes.headers,
          cookie: playlistRes.cookie || activeCookie
        };
      };
      let pl = await fetchPlaylistOnce(clientSecCookie);
      if (pl.status === 403) {
        cachedSecCookie = "";
        pl = await fetchPlaylistOnce("");
      }
      if (pl.status === 200 && pl.body) {
        if (pl.cookie) {
          res.setHeader("Set-Cookie", `gb_sec_tok=${encodeURIComponent(pl.cookie)}; Path=/; SameSite=Lax; Max-Age=604800`);
        }
        res.setHeader("Content-Type", pl.headers["content-type"] || "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(pl.body);
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
          res.setHeader("Content-Type", mPl.headers["content-type"] || "application/vnd.apple.mpegurl");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-store");
          return res.status(200).send(rewritten);
        }
      }
    } catch {
    }
  }
  return handleProxy(req, res);
});
app.get("/api/v1/stream/*", (req, res) => {
  const upstreamUrl = `${MARCO_ORIGIN}${req.originalUrl}`;
  const fwdHeaders = {
    "user-agent": SEC_UA,
    referer: `${MARCO_ORIGIN}/pw/player`
  };
  if (req.headers.range) fwdHeaders.range = String(req.headers.range);
  const proxyStream = (attempt = 0) => {
    const proxyReq = https.get(
      upstreamUrl,
      {
        headers: fwdHeaders,
        agent: attempt === 0 ? marcoKeepAliveAgent : new https.Agent({ family: 4, keepAlive: false })
      },
      (streamRes) => {
        const ct = String(streamRes.headers["content-type"] || "application/octet-stream");
        if (ct.toLowerCase().includes("mpegurl") || req.path.endsWith(".m3u8")) {
          const chunks = [];
          streamRes.on("data", (c) => chunks.push(c));
          streamRes.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8").replaceAll(MARCO_ORIGIN, "");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", ct);
            res.setHeader("Cache-Control", "no-store");
            res.status(streamRes.statusCode || 200).send(text);
          });
          return;
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
        res.setHeader("Content-Type", ct);
        if (streamRes.headers["content-range"]) res.setHeader("Content-Range", streamRes.headers["content-range"]);
        if (streamRes.headers["accept-ranges"]) res.setHeader("Accept-Ranges", streamRes.headers["accept-ranges"]);
        if (streamRes.headers["content-length"]) res.setHeader("Content-Length", streamRes.headers["content-length"]);
        res.status(streamRes.statusCode || 200);
        streamRes.pipe(res);
      }
    );
    proxyReq.setTimeout(9e4, () => {
      proxyReq.destroy();
      if (!res.headersSent) res.status(504).json({ success: false, message: "Marco stream timeout" });
    });
    proxyReq.on("error", () => {
      if (!res.headersSent && attempt === 0) return proxyStream(1);
      if (!res.headersSent) res.status(502).json({ success: false, message: "Marco stream proxy failed" });
    });
  };
  proxyStream(0);
});
app.get(["/api/recorded-stream", "/api/recorded-stream/*"], (req, res) => {
  const upstreamUrl = `${SECONDARY_ORIGIN}${req.originalUrl}`;
  const secCookie = parseCookieVal(req.headers.cookie, "gb_sec_tok") || cachedSecCookie;
  const fwdHeaders = {
    "user-agent": SEC_UA,
    referer: `${SECONDARY_ORIGIN}/study/batches`
  };
  if (secCookie) fwdHeaders.cookie = secCookie;
  if (req.headers.range) fwdHeaders.range = String(req.headers.range);
  const proxyStream = (attempt = 0) => {
    const proxyReq = https.get(
      upstreamUrl,
      {
        headers: fwdHeaders,
        agent: attempt === 0 ? secKeepAliveAgent : new https.Agent({ family: 4, keepAlive: false })
      },
      (streamRes) => {
        const sc = streamRes.headers["set-cookie"];
        if (sc && sc.length) {
          cachedSecCookie = mergeSetCookies(cachedSecCookie, sc);
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
        res.setHeader("Content-Type", streamRes.headers["content-type"] || "application/octet-stream");
        if (streamRes.headers["content-range"]) res.setHeader("Content-Range", streamRes.headers["content-range"]);
        if (streamRes.headers["accept-ranges"]) res.setHeader("Accept-Ranges", streamRes.headers["accept-ranges"]);
        if (streamRes.headers["content-length"]) res.setHeader("Content-Length", streamRes.headers["content-length"]);
        res.status(streamRes.statusCode || 200);
        streamRes.pipe(res);
      }
    );
    proxyReq.setTimeout(9e4, () => {
      proxyReq.destroy();
      if (!res.headersSent) res.status(504).json({ success: false, message: "Stream timeout" });
    });
    proxyReq.on("error", () => {
      if (!res.headersSent && attempt === 0) return proxyStream(1);
      if (!res.headersSent) res.status(502).json({ success: false, message: "Stream proxy failed" });
    });
  };
  proxyStream(0);
});
app.get("/api/video-url", async (req, res) => {
  const { batchId, subjectId, contentId } = parseWatchIdsFromReq(req);
  try {
    const upstreamUrl = `${TARGET_ORIGIN}${req.originalUrl}`;
    const r = await fetchWithAuth(upstreamUrl, `${TARGET_ORIGIN}/watch?batchId=${batchId}&SubjectId=${subjectId}&ContentId=${contentId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && parsed?.data?.url) {
        const fullUrl = `${parsed.data.url}${parsed.data.signedUrl || ""}`;
        if (batchId && subjectId && contentId) {
          const mUuid = String(parsed.data.url).match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
          if (mUuid && mUuid[1]) {
            videoUuidMap.set(mUuid[1], { batchId, subjectId, contentId });
          }
        }
        const urlReachable = await httpsProbeOk(fullUrl, 4e3);
        if (urlReachable) {
          res.setHeader("Content-Type", "application/json");
          return res.status(200).json(parsed);
        }
        if (batchId && subjectId && contentId) {
          const secHls = await fetchSecondaryJson(`/api/hls-stream-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(contentId)}&videoId=${encodeURIComponent(contentId)}`);
          if (secHls.status === 200 && secHls.data?.success && secHls.data?.data?.url) {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).json({ success: false, data: null, fallback: "hls" });
          }
        }
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(parsed);
      }
    }
  } catch {
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ success: false, data: null, fallback: "hls" });
});
app.get("/api/get-video-url", async (req, res) => {
  const { batchId, subjectId, contentId } = parseWatchIdsFromReq(req);
  try {
    const r = await fetchWithAuth(`${TARGET_ORIGIN}${req.originalUrl}`, `${TARGET_ORIGIN}/watch?batchId=${batchId}&SubjectId=${subjectId}&ContentId=${contentId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && parsed?.data?.url) {
        const fullUrl = `${parsed.data.url}${parsed.data.signedUrl || ""}`;
        if (batchId && subjectId && contentId) {
          const mUuid = String(parsed.data.url).match(/\/([^/]+)\/master\.(?:mpd|m3u8)/i);
          if (mUuid && mUuid[1]) {
            videoUuidMap.set(mUuid[1], { batchId, subjectId, contentId });
          }
        }
        const urlReachable = await httpsProbeOk(fullUrl, 4e3);
        if (urlReachable) {
          res.setHeader("Content-Type", "application/json");
          return res.status(200).json(parsed);
        }
      }
    }
  } catch {
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ success: false, data: null, fallback: "hls" });
});
app.get("/api/GetPdf", async (req, res) => {
  const batchId = String(req.query.BatchId || req.query.batchId || "");
  const subjectId = String(req.query.SubjectId || req.query.subjectId || "");
  const pdfId = String(req.query.PdfId || req.query.pdfId || "");
  const attachmentId = String(req.query.AttachmentId || req.query.attachmentId || "");
  try {
    const r = await fetchWithAuth(`${TARGET_ORIGIN}${req.originalUrl}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && parsed?.data && (parsed.data.baseUrl || parsed.data.data?.baseUrl)) {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(parsed);
      }
    }
  } catch {
  }
  try {
    const secRes = await fetchSecondaryJson(req.originalUrl);
    if (secRes.status === 200 && secRes.data?.success && (secRes.data.data?.baseUrl || secRes.data.data?.data?.baseUrl)) {
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json(secRes.data);
    }
  } catch {
  }
  if (batchId && pdfId) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      success: true,
      data: {
        baseUrl: "/api/marco-pdf?",
        key: `batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&pdfId=${encodeURIComponent(pdfId)}&attachmentId=${encodeURIComponent(attachmentId)}`
      }
    });
  }
  return handleProxy(req, res);
});
app.get("/api/marco-pdf", (req, res) => {
  const batchId = String(req.query.batchId || req.query.BatchId || "");
  const subjectId = String(req.query.subjectId || req.query.SubjectId || "");
  const pdfId = String(req.query.pdfId || req.query.PdfId || "");
  const initialUrl = `${MARCO_ORIGIN}/api/pw/shyam?batch_id=${encodeURIComponent(batchId)}&subject_id=${encodeURIComponent(subjectId)}&Id=${encodeURIComponent(pdfId)}&type=pdf`;
  const fetchPdfStream = (targetUrl, depth = 0) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl, MARCO_ORIGIN);
    } catch {
      if (!res.headersSent) return res.status(400).send("Invalid PDF URL");
      return;
    }
    const mod = parsedUrl.protocol === "http:" ? http : https;
    const proxyReq = mod.get(
      parsedUrl.toString(),
      {
        headers: { "user-agent": SEC_UA, referer: `${MARCO_ORIGIN}/pw/content` },
        agent: parsedUrl.protocol === "https:" ? marcoKeepAliveAgent : undefined
      },
      (pdfRes) => {
        const code = pdfRes.statusCode || 200;
        if ((code === 301 || code === 302 || code === 307 || code === 308) && pdfRes.headers.location && depth < 4) {
          pdfRes.resume();
          const nextUrl = new URL(pdfRes.headers.location, parsedUrl).toString();
          return fetchPdfStream(nextUrl, depth + 1);
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", pdfRes.headers["content-type"] || "application/pdf");
        if (pdfRes.headers["content-disposition"]) res.setHeader("Content-Disposition", pdfRes.headers["content-disposition"]);
        if (pdfRes.headers["content-length"]) res.setHeader("Content-Length", pdfRes.headers["content-length"]);
        res.status(code);
        pdfRes.pipe(res);
      }
    );
    proxyReq.setTimeout(3e4, () => {
      proxyReq.destroy();
      if (!res.headersSent) res.status(504).send("PDF timeout");
    });
    proxyReq.on("error", () => {
      if (!res.headersSent) res.status(502).send("PDF fetch failed");
    });
  };
  fetchPdfStream(initialUrl, 0);
});
app.get("/api/dpp-list", async (req, res) => {
  const batchId = String(req.query.batchId || req.query.BatchId || "");
  const subjectId = String(req.query.batchSubjectId || req.query.subjectId || "");
  const chapterId = String(req.query.chapterId || "");
  const page = String(req.query.page || "1");
  const limit = String(req.query.limit || "20");
  try {
    const r = await fetchWithAuth(`${TARGET_ORIGIN}${req.originalUrl}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(parsed);
      }
    }
  } catch {
  }
  try {
    const secRes = await fetchSecondaryJson(req.originalUrl);
    if (secRes.status === 200 && secRes.data?.success && Array.isArray(secRes.data.data) && secRes.data.data.length > 0) {
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json(secRes.data);
    }
  } catch {
  }
  if (batchId && subjectId && chapterId) {
    try {
      const mRes = await fetchMarcoJson(`/api/pw/radha/v3/test-service/tests/new-dpp-list?batchId=${encodeURIComponent(batchId)}&batchSubjectId=${encodeURIComponent(subjectId)}&chapterId=${encodeURIComponent(chapterId)}&dppType=ALL&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`);
      if (mRes.status === 200 && mRes.data?.success) {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(mRes.data);
      }
    } catch {
    }
  }
  return handleProxy(req, res);
});
app.post("/api/todays-schedule", express.json(), async (req, res) => {
  const batchId = String(req.body?.batchId || req.query?.batchId || "");
  if (!batchId) {
    return res.status(400).json({ success: false, message: "Missing batchId" });
  }
  try {
    const accessCookie = await getAccessCookie();
    const pRes = await new Promise((resolve) => {
      const pReq = https.request(
        `${TARGET_ORIGIN}/api/todays-schedule`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": SEC_UA,
            referer: `${TARGET_ORIGIN}/study/batches/${batchId}`,
            cookie: accessCookie
          },
          agent: keepAliveAgent
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => {
            try {
              resolve({ status: r.statusCode || 200, data: JSON.parse(Buffer.concat(chunks).toString("utf-8")) });
            } catch {
              resolve({ status: r.statusCode || 500, data: null });
            }
          });
        }
      );
      pReq.setTimeout(8e3, () => { pReq.destroy(); resolve({ status: 504, data: null }); });
      pReq.on("error", () => resolve({ status: 500, data: null }));
      pReq.write(JSON.stringify({ batchId }));
      pReq.end();
    });
    if (pRes.status === 200 && pRes.data?.success && Array.isArray(pRes.data.data) && pRes.data.data.length > 0) {
      return res.status(200).json(pRes.data);
    }
  } catch {
  }
  try {
    let mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/todays-schedule?batchId=${encodeURIComponent(batchId)}`);
    if (!(mRes.status === 200 && mRes.data?.success)) {
      mRes = await fetchMarcoJson(`/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/todays-schedule?batchId=${encodeURIComponent(batchId)}`);
    }
    if (mRes.status === 200 && mRes.data?.success) {
      return res.status(200).json(mRes.data);
    }
  } catch {
  }
  return res.status(200).json({ success: true, data: [] });
});
app.get("/api/weekly-schedules", async (req, res) => {
  const batchId = String(req.query.batchId || "");
  const batchSubjectId = String(req.query.batchSubjectId || "");
  const startDate = String(req.query.startDate || "");
  const endDate = String(req.query.endDate || startDate);
  const page = String(req.query.page || "1");
  try {
    const r = await fetchWithAuth(`${TARGET_ORIGIN}${req.originalUrl}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(parsed);
      }
    }
  } catch {
  }
  if (batchId) {
    try {
      const qs = `batchSubjectId=${encodeURIComponent(batchSubjectId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&page=${encodeURIComponent(page)}`;
      let mRes = await fetchMarcoJson(`/api/pw/radha/v2/batches/${encodeURIComponent(batchId)}/weekly-schedules?${qs}`);
      if (!(mRes.status === 200 && Array.isArray(mRes.data?.data) && mRes.data.data.length > 0)) {
        mRes = await fetchMarcoJson(`/api/pw/radha/v1/batches/${encodeURIComponent(batchId)}/weekly-schedules?${qs}`);
      }
      if (mRes.status === 200 && mRes.data?.success) {
        return res.status(200).json(mRes.data);
      }
    } catch {
    }
  }
  return res.status(200).json({ success: true, data: [] });
});
app.post("/api/get-user-details-list", express.json(), async (req, res) => {
  const idsParam = String(req.body?.idsParam || req.query?.userIds || "");
  if (!idsParam) return res.status(200).json({ success: true, data: [] });
  try {
    const accessCookie = await getAccessCookie();
    const pRes = await new Promise((resolve) => {
      const pReq = https.request(
        `${TARGET_ORIGIN}/api/get-user-details-list`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": SEC_UA,
            referer: `${TARGET_ORIGIN}/study/batches`,
            cookie: accessCookie
          },
          agent: keepAliveAgent
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => {
            try {
              resolve({ status: r.statusCode || 200, data: JSON.parse(Buffer.concat(chunks).toString("utf-8")) });
            } catch {
              resolve({ status: r.statusCode || 500, data: null });
            }
          });
        }
      );
      pReq.setTimeout(8e3, () => { pReq.destroy(); resolve({ status: 504, data: null }); });
      pReq.on("error", () => resolve({ status: 500, data: null }));
      pReq.write(JSON.stringify({ idsParam }));
      pReq.end();
    });
    if (pRes.status === 200 && pRes.data?.success && Array.isArray(pRes.data.data)) {
      return res.status(200).json(pRes.data);
    }
  } catch {
  }
  try {
    const mRes = await fetchMarcoJson(`/api/pw/radha/v1/users/get-user-details-list?userIds=${encodeURIComponent(idsParam)}`);
    if (mRes.status === 200 && mRes.data?.success) {
      return res.status(200).json(mRes.data);
    }
  } catch {
  }
  return res.status(200).json({ success: true, data: [] });
});
app.get("/api/batch-tests", async (req, res) => {
  const batchId = String(req.query.batchId || "");
  const testId = String(req.query.testId || "");
  let primaryEmptyFallback = null;
  try {
    const r = await fetchWithAuth(`${TARGET_ORIGIN}${req.originalUrl}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && ((Array.isArray(parsed.data) && parsed.data.length > 0) || (testId && parsed.data))) {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(parsed);
      }
      if (parsed?.success) primaryEmptyFallback = parsed;
    }
  } catch {
  }
  if (!testId && batchId) {
    try {
      const mRes = await fetchMarcoJson(`/api/pw/radha/v3/test-service/tests?testType=All&testStatus=All&attemptStatus=All&batchId=${encodeURIComponent(batchId)}&isSubjective=false`);
      if (mRes.status === 200 && mRes.data?.success && Array.isArray(mRes.data.data) && mRes.data.data.length > 0) {
        return res.status(200).json(mRes.data);
      }
    } catch {
    }
  }
  if (primaryEmptyFallback) {
    return res.status(200).json(primaryEmptyFallback);
  }
  return handleProxy(req, res);
});
app.get("/api/test-instructions", async (req, res) => {
  const testId = String(req.query.testId || "");
  const batchId = String(req.query.batchId || "");
  try {
    const r = await fetchWithAuth(`${TARGET_ORIGIN}${req.originalUrl}`, `${TARGET_ORIGIN}/study/batches/${batchId}`);
    if (r.status === 200 && r.body) {
      const parsed = JSON.parse(r.body);
      if (parsed?.success && parsed?.data) {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(parsed);
      }
    }
  } catch {
  }
  if (testId) {
    try {
      const mRes = await fetchMarcoJson(`/api/pw/radha/v3/test-service/tests/${encodeURIComponent(testId)}/instructions`);
      if (mRes.status === 200 && mRes.data?.success) {
        return res.status(200).json(mRes.data);
      }
    } catch {
    }
  }
  return handleProxy(req, res);
});
function resolvePath(req) {
  if (req.query.__path && typeof req.query.__path === "string") {
    let p = req.query.__path;
    if (!p.startsWith("/")) p = `/${p}`;
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== "__path" && value !== void 0) {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    }
    const qs = searchParams.toString();
    return qs ? `${p}?${qs}` : p;
  }
  const matched = req.headers["x-matched-path"] || req.headers["x-vercel-matched-path"] || "";
  if (matched && !matched.startsWith("/api/index") && matched !== "/api") {
    const orig = req.originalUrl || req.url || "";
    const qIndex = orig.indexOf("?");
    const queryString = qIndex !== -1 ? orig.slice(qIndex) : "";
    return matched.includes("?") ? matched : `${matched}${queryString}`;
  }
  let target = req.originalUrl || req.url || "/";
  if (target.startsWith("/api/index")) {
    target = target.replace(/^\/api\/index/, "") || "/";
  }
  return target;
}
async function handleProxy(req, res, overridePath, isRetry = false) {
  const targetPath = overridePath || resolvePath(req);
  const targetUrl = new URL(targetPath, TARGET_ORIGIN);
  if (targetPath.startsWith("/_next/static/")) {
    const cachedStatic = staticAssetCache.get(targetPath);
    if (cachedStatic) {
      res.writeHead(200, {
        ...cachedStatic.headers,
        "cache-control": "public, max-age=31536000, immutable",
        "x-cache": "HIT"
      });
      return res.end(cachedStatic.body);
    }
  }
  const isPageOrRsc = req.method === "GET" && (targetPath.startsWith("/study/") || targetPath === "/" || targetPath.includes("_rsc="));
  const pageCacheKey = `${targetPath}:${req.headers["rsc"] || "0"}`;
  if (isPageOrRsc) {
    const cachedPage = pageCache.get(pageCacheKey);
    if (cachedPage && Date.now() - cachedPage.timestamp < CACHE_TTL_MS) {
      res.writeHead(200, {
        ...cachedPage.headers,
        "x-cache": "HIT"
      });
      return res.end(cachedPage.body);
    }
  }
  let refererHeader = `${TARGET_ORIGIN}/`;
  const incomingReferer = req.headers["referer"] || "";
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
  if (targetPath.startsWith("/api/video-url") || targetPath.startsWith("/api/get-video-url") || targetPath.startsWith("/api/Schedule") || targetPath.startsWith("/api/play") || targetPath.startsWith("/api/get-otp")) {
    const q = targetUrl.searchParams;
    const batchId = q.get("batch_id") || q.get("batchId") || q.get("BatchId") || "";
    const subjectId = q.get("subject_id") || q.get("subjectId") || q.get("SubjectId") || "";
    const videoId = q.get("video_id") || q.get("videoId") || q.get("childId") || q.get("ChildId") || q.get("contentId") || q.get("ContentId") || "";
    if (batchId || subjectId || videoId) {
      refererHeader = `${TARGET_ORIGIN}/watch?batchId=${batchId}&SubjectId=${subjectId}&ContentId=${videoId}`;
    } else {
      refererHeader = `${TARGET_ORIGIN}/watch`;
    }
  }
  const accessCookie = await getAccessCookie();
  const incomingCookie = req.headers["cookie"] || "";
  const mergedCookies = [accessCookie];
  if (incomingCookie) {
    const filteredIncoming = incomingCookie.split(";").map((c) => c.trim()).filter((c) => !c.startsWith("studymeta_access="));
    if (filteredIncoming.length > 0) {
      mergedCookies.push(...filteredIncoming);
    }
  }
  const forwardHeaders = {
    ...req.headers,
    host: TARGET_HOST,
    origin: TARGET_ORIGIN,
    referer: refererHeader,
    cookie: mergedCookies.join("; "),
    "user-agent": req.headers["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
  delete forwardHeaders["connection"];
  delete forwardHeaders["keep-alive"];
  delete forwardHeaders["transfer-encoding"];
  delete forwardHeaders["x-matched-path"];
  const isDirectMedia = targetPath.startsWith("/api/play") || targetPath.startsWith("/api/get-otp") || targetPath.startsWith("/api/video-url") || targetPath.startsWith("/api/Schedule") || targetPath.includes(".mpd") || targetPath.includes(".m3u8") || targetPath.includes(".m4s") || targetPath.includes(".mp4");
  const proxyReq = https.request(
    targetUrl,
    {
      method: req.method,
      headers: forwardHeaders,
      agent: keepAliveAgent
    },
    (proxyRes) => {
      const statusCode = proxyRes.statusCode || 200;
      const headers = { ...proxyRes.headers };
      if ((statusCode === 307 || statusCode === 308) && headers["location"] && headers["location"].includes("key-generate") && !isRetry) {
        console.log(
          `[Proxy] Upstream requested key-generate for ${targetPath}. Refreshing token and retrying...`
        );
        cachedAccessCookie = "";
        proxyRes.resume();
        fetchFreshAccessCookie().then(() => {
          handleProxy(req, res, overridePath, true);
        });
        return;
      }
      delete headers["x-frame-options"];
      delete headers["content-security-policy"];
      delete headers["content-security-policy-report-only"];
      headers["access-control-allow-origin"] = "*";
      headers["access-control-allow-methods"] = "GET, POST, OPTIONS, HEAD";
      headers["access-control-allow-headers"] = "*";
      if (accessCookie) {
        const clientAccessSet = `${accessCookie}; Path=/; SameSite=Lax; Max-Age=86400`;
        if (headers["set-cookie"]) {
          const sc = Array.isArray(headers["set-cookie"]) ? headers["set-cookie"] : [headers["set-cookie"]];
          headers["set-cookie"] = [clientAccessSet, ...sc];
        } else {
          headers["set-cookie"] = [clientAccessSet];
        }
      }
      if (headers["set-cookie"]) {
        const cookies = Array.isArray(headers["set-cookie"]) ? headers["set-cookie"] : [headers["set-cookie"]];
        headers["set-cookie"] = cookies.map(
          (c) => c.replace(/domain=[^;]+;?/gi, "").replace(/Secure;?/gi, "")
        );
      }
      if (headers["location"]) {
        let loc = headers["location"].replace(
          /https?:\/\/(www\.)?learnxpw\.site/gi,
          ""
        );
        if (loc.includes("key-generate")) {
          try {
            const locUrl = new URL(headers["location"], TARGET_ORIGIN);
            const redirectParam = locUrl.searchParams.get("redirect") || "/study/batches";
            if (redirectParam === targetPath || redirectParam === req.url) {
              loc = "/study/batches";
            } else {
              loc = redirectParam;
            }
          } catch {
            loc = "/study/batches";
          }
        }
        headers["location"] = loc;
      }
      const contentType = (headers["content-type"] || "").toLowerCase();
      const isText = !isDirectMedia && (contentType.includes("text/html") || contentType.includes("application/x-javascript") || contentType.includes("application/javascript") || contentType.includes("text/javascript") || contentType.includes("text/x-component") || contentType.includes("application/json") && !targetPath.startsWith("/api/play"));
      if (!isText) {
        res.writeHead(statusCode, headers);
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      proxyRes.on("data", (chunk) => {
        chunks.push(chunk);
      });
      proxyRes.on("end", () => {
        try {
          const rawBuffer = Buffer.concat(chunks);
          let decompressedBuffer = rawBuffer;
          const encoding = (headers["content-encoding"] || "").toLowerCase();
          if (encoding === "gzip") {
            decompressedBuffer = zlib.gunzipSync(rawBuffer);
          } else if (encoding === "br") {
            decompressedBuffer = zlib.brotliDecompressSync(rawBuffer);
          } else if (encoding === "deflate") {
            decompressedBuffer = zlib.inflateSync(rawBuffer);
          }
          const originalText = decompressedBuffer.toString("utf-8");
          const modifiedText = transformText(originalText, contentType.includes("text/html"));
          const outputBuffer = Buffer.from(modifiedText, "utf-8");
          delete headers["content-encoding"];
          delete headers["transfer-encoding"];
          headers["content-length"] = String(outputBuffer.length);
          if (contentType.includes("text/html")) {
            headers["cache-control"] = "no-cache, no-store, must-revalidate";
            delete headers["etag"];
          }
          if (targetPath.startsWith("/_next/static/") && statusCode === 200) {
            headers["cache-control"] = "public, max-age=31536000, immutable";
            staticAssetCache.set(targetPath, {
              body: outputBuffer,
              headers: { ...headers }
            });
          }
          if (isPageOrRsc && statusCode === 200) {
            pageCache.set(pageCacheKey, {
              body: outputBuffer,
              headers: { ...headers },
              timestamp: Date.now()
            });
          }
          res.writeHead(statusCode, headers);
          res.end(outputBuffer);
        } catch (err) {
          console.error("Error modifying text response:", err);
          const rawBuffer = Buffer.concat(chunks);
          delete headers["transfer-encoding"];
          headers["content-length"] = String(rawBuffer.length);
          res.writeHead(statusCode, headers);
          res.end(rawBuffer);
        }
      });
    }
  );
  proxyReq.on("error", (err) => {
    console.error("Proxy request error:", err);
    if (!res.headersSent) {
      res.status(502).send(`Proxy Error: ${err.message}`);
    }
  });
  if (req.method !== "GET" && req.method !== "HEAD") {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}
app.use((req, res) => {
  handleProxy(req, res);
});
var index_default = app;
export {
  index_default as default
};
