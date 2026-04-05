import PostalMime from "postal-mime";
import { renderAdminPage } from "./admin-page.js";

const JSON_TYPE = "application/json; charset=UTF-8";
const TEXT_TYPE = "text/plain; charset=UTF-8";
const HTML_TYPE = "text/html; charset=UTF-8";
const CURRENT_ADMIN_TOKEN_KEY = "admin:current";
const PLACEHOLDER_MARKERS = ["must_change", "replace_with", "change-me", "example.com"];
const KV_BINDING_CANDIDATES = ["kv", "KV", "MAIL_STORE"];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === "/" && url.searchParams.has("email")) {
        const kvError = ensureKvBinding(env);
        if (kvError) {
          return kvError;
        }
        return handleOtpQuery(url, env);
      }
      if (pathname === "/" || pathname === "/admin") {
        return htmlResponse(renderAdminPage(env));
      }
      if (pathname === "/health") {
        return jsonResponse({
          ok: true,
          worker: env.UI_TITLE || "Cloud Mail 邮箱桥接",
          defaultDomain: env.DEFAULT_DOMAIN || "",
          configReady: getConfigWarnings(env).length === 0,
          warnings: getConfigWarnings(env),
        });
      }

      const kvError = ensureKvBinding(env);
      if (kvError) {
        return kvError;
      }

      if (pathname === "/api/public/genToken" && request.method === "POST") {
        return handleGenToken(request, env);
      }
      if (pathname === "/api/public/addUser" && request.method === "POST") {
        return handleAddUser(request, env);
      }
      if (pathname === "/api/public/emailList" && request.method === "POST") {
        return handleEmailList(request, env);
      }

      if (pathname === "/api/new_address" && request.method === "POST") {
        return handleNewAddress(request, env);
      }
      if (pathname === "/api/mails" && request.method === "GET") {
        return handleWorkerMails(request, env);
      }
      if (pathname.startsWith("/api/mails/") && request.method === "GET") {
        return handleWorkerMailDetail(request, env, pathname.split("/").pop() || "");
      }

      if (pathname === "/api/accounts" && request.method === "POST") {
        return handleDuckMailAccounts(request, env);
      }
      if (pathname === "/api/token" && request.method === "POST") {
        return handleDuckMailToken(request, env);
      }
      if (pathname === "/api/messages" && request.method === "GET") {
        return handleDuckMailMessages(request, env);
      }
      if (pathname.startsWith("/api/messages/") && request.method === "GET") {
        return handleDuckMailMessageDetail(request, env, pathname.split("/").pop() || "");
      }

      return jsonResponse({ code: 404, message: "not_found", data: null }, 404);
    } catch (error) {
      return jsonResponse({
        code: 500,
        message: error instanceof Error ? error.message : "internal_error",
        data: null,
      }, 500);
    }
  },

  async email(message, env) {
    if (!hasKvBinding(env)) {
      throw new Error("缺少 KV 绑定，必须在 Cloudflare 中绑定变量名 kv");
    }
    await storeIncomingMessage(message, env);
  },
};

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: corsHeaders({ "Content-Type": JSON_TYPE }),
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: corsHeaders({ "Content-Type": TEXT_TYPE }),
  });
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: corsHeaders({ "Content-Type": HTML_TYPE }),
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeConfigValue(value) {
  return String(value || "").trim().toLowerCase();
}

function nowUtcString() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function makeRandomString(length = 24) {
  let out = "";
  while (out.length < length) {
    out += crypto.randomUUID().replace(/-/g, "");
  }
  return out.slice(0, length);
}

function makePassword() {
  return `Pw_${makeRandomString(14)}`;
}

function mailboxKey(address) {
  return `acct:${normalizeEmail(address)}`;
}

function inboxKey(address) {
  return `inbox:${normalizeEmail(address)}`;
}

function messageKey(id) {
  return `msg:${id}`;
}

function mailTokenKey(token) {
  return `mailtoken:${token}`;
}

function getKvStore(env) {
  for (const name of KV_BINDING_CANDIDATES) {
    const candidate = env?.[name];
    if (candidate && typeof candidate.get === "function" && typeof candidate.put === "function") {
      return candidate;
    }
  }
  return null;
}

function hasKvBinding(env) {
  return Boolean(getKvStore(env));
}

function isPlaceholderValue(value) {
  const normalized = normalizeConfigValue(value);
  if (!normalized) {
    return true;
  }
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

function getConfigWarnings(env) {
  const warnings = [];

  if (!hasKvBinding(env)) {
    warnings.push({
      key: "KV_BINDING",
      message: "必须在 Cloudflare Worker 绑定 KV，变量名建议直接使用 kv。",
    });
  }

  if (isPlaceholderValue(env.DEFAULT_DOMAIN)) {
    warnings.push({
      key: "DEFAULT_DOMAIN",
      message: "必须改成已接入 Cloudflare Email Routing 的真实收件域名。",
    });
  }

  if (isPlaceholderValue(env.ADMIN_EMAIL)) {
    warnings.push({
      key: "ADMIN_EMAIL",
      message: "必须改成你的 Cloud Mail 管理员邮箱。",
    });
  }

  if (isPlaceholderValue(env.ADMIN_PASSWORD)) {
    warnings.push({
      key: "ADMIN_PASSWORD",
      message: "必须通过 wrangler secret put ADMIN_PASSWORD 写入真实管理员密码。",
    });
  }

  if (isPlaceholderValue(env.WORKER_ADMIN_PASSWORD)) {
    warnings.push({
      key: "WORKER_ADMIN_PASSWORD",
      message: "必须通过 wrangler secret put WORKER_ADMIN_PASSWORD 写入项目兼容密码。",
    });
  }

  return warnings;
}

function ensureKvBinding(env) {
  if (hasKvBinding(env)) {
    return null;
  }
  return jsonResponse({
    code: 503,
    message: "missing_kv_binding",
    data: getConfigWarnings(env),
  }, 503);
}

async function kvGet(env, key) {
  const store = getKvStore(env);
  if (!store) {
    throw new Error("缺少 KV 绑定");
  }
  return store.get(key);
}

async function kvGetJson(env, key, fallback = null) {
  const raw = await kvGet(env, key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function kvPutJson(env, key, value, options) {
  const store = getKvStore(env);
  if (!store) {
    throw new Error("缺少 KV 绑定");
  }
  await store.put(key, JSON.stringify(value), options);
}

async function listKeys(env, prefix) {
  const store = getKvStore(env);
  if (!store) {
    throw new Error("缺少 KV 绑定");
  }
  const names = [];
  let cursor = undefined;
  do {
    const page = await store.list({ prefix, cursor });
    for (const key of page.keys) {
      names.push(key.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

function parseAddress(value) {
  const raw = String(value || "").trim();
  const angle = raw.match(/^(.*)<([^>]+)>$/);
  if (angle) {
    const name = angle[1].replace(/["']/g, "").trim();
    return { name, email: normalizeEmail(angle[2]) };
  }
  if (raw.includes("@")) {
    return { name: "", email: normalizeEmail(raw) };
  }
  return { name: raw, email: "" };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOtp(text) {
  const matches = String(text || "").match(/(?<![#&])\b(\d{6})\b/g);
  if (!matches) {
    return "";
  }
  for (const item of matches) {
    if (item !== "177010") {
      return item;
    }
  }
  return "";
}

function buildLikeRegex(pattern) {
  const escaped = String(pattern || "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesLike(value, pattern) {
  if (pattern === undefined || pattern === null || pattern === "") {
    return true;
  }
  return buildLikeRegex(pattern).test(String(value || ""));
}

function parseAuthorization(request) {
  const raw = String(request.headers.get("Authorization") || "").trim();
  if (!raw) {
    return "";
  }
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}

async function getCurrentAdminToken(env) {
  return kvGetJson(env, CURRENT_ADMIN_TOKEN_KEY, null);
}

async function isAdminSecret(secret, env) {
  const current = await getCurrentAdminToken(env);
  const expected = [
    String(env.ADMIN_PASSWORD || "").trim(),
    String(env.WORKER_ADMIN_PASSWORD || "").trim(),
    String(current?.token || "").trim(),
  ].filter(Boolean);
  return expected.includes(String(secret || "").trim());
}

async function requireAdminAuth(request, env) {
  const secret = parseAuthorization(request);
  if (!secret || !(await isAdminSecret(secret, env))) {
    return null;
  }
  return secret;
}

async function getMailboxAuth(request, env) {
  const token = parseAuthorization(request);
  if (!token) {
    return null;
  }
  return kvGetJson(env, mailTokenKey(token), null);
}

async function getAccount(env, address) {
  return kvGetJson(env, mailboxKey(address), null);
}

async function ensureAccount(env, address, password = "", roleName = "") {
  const normalized = normalizeEmail(address);
  const existing = await getAccount(env, normalized);
  if (existing) {
    return { created: false, account: existing };
  }

  // 账号信息和收件箱索引分开存，便于兼容多种接口风格。
  const account = {
    email: normalized,
    password: password || makePassword(),
    roleName: roleName || "default",
    createdAt: nowUtcString(),
  };
  await kvPutJson(env, mailboxKey(normalized), account);
  const existingInbox = await kvGetJson(env, inboxKey(normalized), null);
  if (!existingInbox) {
    await kvPutJson(env, inboxKey(normalized), { email: normalized, ids: [], updatedAt: nowUtcString() });
  }
  return { created: true, account };
}

async function issueMailboxToken(env, address) {
  const token = `mail_${makeRandomString(36)}`;
  await kvPutJson(env, mailTokenKey(token), {
    email: normalizeEmail(address),
    createdAt: nowUtcString(),
  }, { expirationTtl: 60 * 60 * 24 * 7 });
  return token;
}

async function getInboxIds(env, address) {
  const inbox = await kvGetJson(env, inboxKey(address), null);
  return Array.isArray(inbox?.ids) ? inbox.ids : [];
}

async function saveMessageToInbox(env, message) {
  const emailId = String(message.emailId);
  await kvPutJson(env, messageKey(emailId), message);

  // inbox 只保留最近 500 封邮件索引，避免 KV 单个值无限增长。
  const key = inboxKey(message.toEmail);
  const inbox = await kvGetJson(env, key, { email: message.toEmail, ids: [], updatedAt: nowUtcString() });
  const ids = Array.isArray(inbox.ids) ? inbox.ids.filter((id) => id !== emailId) : [];
  ids.unshift(emailId);
  inbox.ids = ids.slice(0, 500);
  inbox.updatedAt = nowUtcString();
  await kvPutJson(env, key, inbox);
}

async function loadMessage(env, id) {
  return kvGetJson(env, messageKey(id), null);
}

async function loadMessagesForAddress(env, address, includeDeleted = true) {
  const ids = await getInboxIds(env, address);
  const messages = [];
  for (const id of ids) {
    const item = await loadMessage(env, id);
    if (!item) {
      continue;
    }
    if (!includeDeleted && item.isDel) {
      continue;
    }
    messages.push(item);
  }
  return messages;
}

async function listKnownAddresses(env) {
  const keys = await listKeys(env, "inbox:");
  return keys.map((key) => key.slice("inbox:".length));
}

async function collectMessagesForAdmin(env, filters) {
  const toEmail = String(filters.toEmail || "").trim();
  const allAddresses = await listKnownAddresses(env);

  let addresses = allAddresses;
  if (toEmail && !toEmail.includes("%")) {
    addresses = [normalizeEmail(toEmail)];
  } else if (toEmail) {
    addresses = allAddresses.filter((address) => matchesLike(address, toEmail));
  }

  const messages = [];
  for (const address of addresses) {
    // 管理接口按地址维度扫描，再做 Cloud Mail 风格字段过滤。
    const items = await loadMessagesForAddress(env, address, true);
    for (const item of items) {
      if (!matchesLike(item.toEmail, filters.toEmail)) {
        continue;
      }
      if (!matchesLike(item.sendName, filters.sendName)) {
        continue;
      }
      if (!matchesLike(item.sendEmail, filters.sendEmail)) {
        continue;
      }
      if (!matchesLike(item.subject, filters.subject)) {
        continue;
      }
      if (!matchesLike(item.content, filters.content)) {
        continue;
      }
      if (filters.type !== undefined && filters.type !== null && filters.type !== "" && Number(filters.type) !== Number(item.type)) {
        continue;
      }
      if (filters.isDel !== undefined && filters.isDel !== null && filters.isDel !== "" && Number(filters.isDel) !== Number(item.isDel)) {
        continue;
      }
      messages.push(item);
    }
  }

  messages.sort((a, b) => {
    if (filters.timeSort === "asc") {
      return String(a.createTime).localeCompare(String(b.createTime));
    }
    return String(b.createTime).localeCompare(String(a.createTime));
  });

  const page = Math.max(1, Number(filters.num || 1));
  const size = Math.max(1, Number(filters.size || 20));
  const start = (page - 1) * size;
  return messages.slice(start, start + size);
}

async function handleGenToken(request, env) {
  const blockingKeys = new Set(["KV_BINDING", "ADMIN_EMAIL", "ADMIN_PASSWORD"]);
  const warnings = getConfigWarnings(env).filter((item) => blockingKeys.has(item.key));
  if (warnings.length) {
    return jsonResponse({ code: 503, message: "config_not_ready", data: warnings }, 503);
  }

  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) {
    return jsonResponse({ code: 400, message: "missing_credentials", data: null }, 400);
  }

  const expectedEmail = normalizeEmail(env.ADMIN_EMAIL);
  const expectedPassword = String(env.ADMIN_PASSWORD || "");

  if (email !== expectedEmail || password !== expectedPassword) {
    return jsonResponse({ code: 401, message: "invalid_credentials", data: null }, 401);
  }

  const token = `adm_${makeRandomString(40)}`;
  await kvPutJson(env, CURRENT_ADMIN_TOKEN_KEY, { token, createdAt: nowUtcString() });
  return jsonResponse({
    code: 200,
    message: "success",
    data: { token },
  });
}

async function handleAddUser(request, env) {
  const authed = await requireAdminAuth(request, env);
  if (!authed) {
    return jsonResponse({ code: 401, message: "unauthorized", data: null }, 401);
  }

  const body = await readJsonBody(request);
  const list = Array.isArray(body.list) ? body.list : [];
  if (!list.length) {
    return jsonResponse({ code: 400, message: "missing_list", data: null }, 400);
  }

  for (const item of list) {
    const email = normalizeEmail(item.email);
    if (!email) {
      continue;
    }
    await ensureAccount(env, email, String(item.password || ""), String(item.roleName || ""));
  }

  return jsonResponse({ code: 200, message: "success", data: null });
}

async function handleEmailList(request, env) {
  const authed = await requireAdminAuth(request, env);
  if (!authed) {
    return jsonResponse({ code: 401, message: "unauthorized", data: [] }, 401);
  }

  const body = await readJsonBody(request);
  const rows = await collectMessagesForAdmin(env, {
    toEmail: body.toEmail,
    sendName: body.sendName,
    sendEmail: body.sendEmail,
    subject: body.subject,
    content: body.content,
    timeSort: body.timeSort || "desc",
    type: body.type,
    isDel: body.isDel,
    num: body.num,
    size: body.size,
  });

  return jsonResponse({ code: 200, message: "success", data: rows });
}

async function handleNewAddress(request, env) {
  const body = await readJsonBody(request);
  const adminPassword = String(body.admin_password || "");
  const name = String(body.name || "").trim();
  const domain = String(body.domain || env.DEFAULT_DOMAIN || "").trim().toLowerCase();
  if (isPlaceholderValue(domain)) {
    return textResponse("default domain is not configured", 503);
  }
  if (!name || !domain || !(await isAdminSecret(adminPassword, env))) {
    return textResponse("invalid admin_password or payload", 401);
  }

  const address = normalizeEmail(`${name}@${domain}`);
  const existing = await getAccount(env, address);
  if (existing) {
    return textResponse("already exists", 400);
  }

  await ensureAccount(env, address, makePassword(), "worker");
  const jwt = await issueMailboxToken(env, address);
  return jsonResponse({ address, jwt });
}

async function handleWorkerMails(request, env) {
  const mailbox = await getMailboxAuth(request, env);
  if (!mailbox) {
    return jsonResponse({ results: [] }, 401);
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Number(url.searchParams.get("limit") || 20));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const messages = await loadMessagesForAddress(env, mailbox.email, false);
  const rows = messages.slice(offset, offset + limit).map((item) => ({
    id: item.emailId,
    message_id: item.emailId,
    subject: item.subject,
    from: item.sendEmail,
    to: item.toEmail,
    text: item.text,
    html: item.content,
    createdAt: item.createTime,
  }));
  return jsonResponse({ results: rows });
}

async function handleWorkerMailDetail(request, env, id) {
  const mailbox = await getMailboxAuth(request, env);
  if (!mailbox) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const message = await loadMessage(env, id);
  if (!message || normalizeEmail(message.toEmail) !== mailbox.email) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  return jsonResponse({
    id: message.emailId,
    subject: message.subject,
    from: message.sendEmail,
    to: message.toEmail,
    text: message.text,
    html: message.content,
    source: message.raw,
    createTime: message.createTime,
  });
}

async function handleDuckMailAccounts(request, env) {
  const authed = await requireAdminAuth(request, env);
  if (!authed) {
    return textResponse("unauthorized", 401);
  }

  const body = await readJsonBody(request);
  const address = normalizeEmail(body.address);
  const password = String(body.password || "");
  if (!address || !password) {
    return textResponse("invalid payload", 400);
  }

  const existing = await getAccount(env, address);
  if (existing) {
    return textResponse("already exists", 422);
  }

  await ensureAccount(env, address, password, "duckmail");
  return jsonResponse({ address }, 201);
}

async function handleDuckMailToken(request, env) {
  const authed = await requireAdminAuth(request, env);
  if (!authed) {
    return textResponse("unauthorized", 401);
  }

  const body = await readJsonBody(request);
  const address = normalizeEmail(body.address);
  const password = String(body.password || "");
  const account = await getAccount(env, address);
  if (!account || account.password !== password) {
    return textResponse("invalid_credentials", 401);
  }

  const token = await issueMailboxToken(env, address);
  return jsonResponse({ token });
}

async function handleDuckMailMessages(request, env) {
  const mailbox = await getMailboxAuth(request, env);
  if (!mailbox) {
    return jsonResponse({ "hydra:member": [] }, 401);
  }

  const messages = await loadMessagesForAddress(env, mailbox.email, false);
  const rows = messages.map((item) => ({
    id: item.emailId,
    message_id: item.emailId,
    subject: item.subject,
    from: item.sendEmail,
    to: item.toEmail,
    text: item.text,
    html: item.content,
    source: item.raw,
    createdAt: item.createTime,
  }));
  return jsonResponse({ "hydra:member": rows });
}

async function handleDuckMailMessageDetail(request, env, id) {
  const mailbox = await getMailboxAuth(request, env);
  if (!mailbox) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const message = await loadMessage(env, id);
  if (!message || normalizeEmail(message.toEmail) !== mailbox.email) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  return jsonResponse({
    id: message.emailId,
    subject: message.subject,
    from: message.sendEmail,
    to: message.toEmail,
    text: message.text,
    html: [message.content],
    source: message.raw,
    createTime: message.createTime,
  });
}

async function handleOtpQuery(url, env) {
  const targetEmail = normalizeEmail(url.searchParams.get("email"));
  const shouldDelete = url.searchParams.get("delete") === "true";
  if (!targetEmail) {
    return textResponse("Missing email param", 400);
  }

  const messages = await loadMessagesForAddress(env, targetEmail, false);
  const candidate = messages.find((item) => extractOtp(item.text || item.content || item.raw));
  if (!candidate) {
    return textResponse("Not found", 404);
  }

  const code = extractOtp(candidate.text || candidate.content || candidate.raw);
  if (!code) {
    return textResponse("Not found", 404);
  }

  if (shouldDelete) {
    candidate.isDel = 1;
    await kvPutJson(env, messageKey(candidate.emailId), candidate);
  }
  return textResponse(code, 200);
}

async function storeIncomingMessage(message, env) {
  const rawBuffer = await new Response(message.raw).arrayBuffer();
  const raw = new TextDecoder().decode(rawBuffer);
  const parser = new PostalMime();
  const parsed = await parser.parse(raw);

  // 优先使用 Cloudflare 提供的收件地址，其次回退到解析结果。
  const toEmail = normalizeEmail(message.to || parsed?.to?.[0]?.address || "");
  if (!toEmail) {
    return;
  }

  const fromCandidate = parsed?.from?.address
    ? `${parsed.from.name || ""} <${parsed.from.address}>`
    : (message.from || parsed?.headers?.from || "");
  const from = parseAddress(fromCandidate);
  const subject = String(parsed?.subject || message.headers?.get?.("subject") || "").trim();
  const html = String(parsed?.html || "").trim();
  const text = String(parsed?.text || "").trim();
  const displayContent = html || text || raw;
  const displayText = text || stripHtml(html) || raw;

  // 这里统一落成 Cloud Mail 风格字段，后续三套接口直接复用。
  const row = {
    emailId: `${Date.now()}_${makeRandomString(10)}`,
    sendEmail: from.email,
    sendName: from.name,
    subject,
    toEmail,
    toName: parsed?.to?.[0]?.name || "",
    createTime: nowUtcString(),
    type: 0,
    content: displayContent,
    text: displayText,
    raw,
    isDel: 0,
  };

  await saveMessageToInbox(env, row);
}
