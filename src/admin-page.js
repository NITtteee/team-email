function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPlaceholderValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return ["must_change", "replace_with", "change-me", "example.com"].some((marker) => normalized.includes(marker));
}

export function renderAdminPage(env) {
  const title = escapeHtml(env.UI_TITLE || "Cloud Mail 邮箱桥接");
  const defaultDomain = escapeHtml(env.DEFAULT_DOMAIN || "example.com");
  const setupWarnings = [];
  const hasKvBinding = Boolean(
    (env?.kv && typeof env.kv.get === "function") ||
    (env?.KV && typeof env.KV.get === "function") ||
    (env?.MAIL_STORE && typeof env.MAIL_STORE.get === "function")
  );

  if (!hasKvBinding) {
    setupWarnings.push("必须在 Cloudflare Worker 里绑定一个 KV 命名空间，变量名建议直接使用 kv。");
  }
  if (isPlaceholderValue(env.DEFAULT_DOMAIN)) {
    setupWarnings.push("必须修改 DEFAULT_DOMAIN，换成已接入 Email Routing 的真实收件域名。");
  }
  if (isPlaceholderValue(env.ADMIN_EMAIL)) {
    setupWarnings.push("必须修改 ADMIN_EMAIL，换成真实管理员邮箱。");
  }
  if (isPlaceholderValue(env.ADMIN_PASSWORD)) {
    setupWarnings.push("必须执行 wrangler secret put ADMIN_PASSWORD，不要继续使用示例密码。");
  }
  if (isPlaceholderValue(env.WORKER_ADMIN_PASSWORD)) {
    setupWarnings.push("必须执行 wrangler secret put WORKER_ADMIN_PASSWORD，主项目兼容接口会用到它。");
  }

  const warningPanel = setupWarnings.length ? `
      <section class="card section warning-panel">
        <h2>部署前必须修改</h2>
        <p class="hint">下面这些配置如果不改，Worker 可能能部署成功，但邮箱功能不会正常工作。</p>
        <ul class="warning-list">
          ${setupWarnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>
  ` : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: rgba(15, 23, 42, 0.88);
      --panel-soft: rgba(30, 41, 59, 0.72);
      --line: rgba(148, 163, 184, 0.22);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --accent-2: #22c55e;
      --danger: #fb7185;
      --shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.16), transparent 24%),
        linear-gradient(180deg, #020617 0%, #0f172a 48%, #111827 100%);
      min-height: 100vh;
    }
    .wrap {
      width: min(1180px, calc(100% - 32px));
      margin: 32px auto 48px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 0.9fr;
      gap: 18px;
      margin-bottom: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .hero-main {
      padding: 24px 24px 20px;
    }
    .hero-side {
      padding: 24px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(56, 189, 248, 0.28);
      color: var(--accent);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 16px 0 10px;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 1.02;
      letter-spacing: -0.05em;
    }
    .sub {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
      max-width: 60ch;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 22px;
    }
    .stat {
      padding: 14px 16px;
      border-radius: 18px;
      background: var(--panel-soft);
      border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .stat .k {
      display: block;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .stat .v {
      font-size: 18px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .section {
      padding: 20px;
    }
    .section h2 {
      margin: 0 0 6px;
      font-size: 18px;
      letter-spacing: -0.03em;
    }
    .hint {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .field {
      margin-bottom: 14px;
    }
    .field label {
      display: block;
      margin-bottom: 7px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    input, textarea, select {
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background: rgba(15, 23, 42, 0.7);
      color: var(--text);
      border-radius: 14px;
      padding: 12px 14px;
      font: inherit;
      outline: none;
      transition: border-color 0.18s ease, transform 0.18s ease;
    }
    input:focus, textarea:focus, select:focus {
      border-color: rgba(56, 189, 248, 0.7);
      transform: translateY(-1px);
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.18s ease, opacity 0.18s ease;
    }
    button:hover { transform: translateY(-1px); }
    .btn-primary { background: linear-gradient(135deg, #38bdf8, #0ea5e9); color: #04111d; }
    .btn-secondary { background: linear-gradient(135deg, #22c55e, #16a34a); color: #04110a; }
    .btn-ghost { background: rgba(148, 163, 184, 0.1); color: var(--text); border: 1px solid var(--line); }
    .token-box, .result-box {
      margin-top: 14px;
      padding: 14px;
      border-radius: 16px;
      background: rgba(2, 6, 23, 0.62);
      border: 1px solid rgba(148, 163, 184, 0.14);
      min-height: 54px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      color: #dbeafe;
    }
    .warning-panel {
      margin-bottom: 18px;
      border-color: rgba(251, 113, 133, 0.35);
      background: linear-gradient(135deg, rgba(127, 29, 29, 0.22), rgba(15, 23, 42, 0.92));
    }
    .warning-list {
      margin: 0;
      padding-left: 18px;
      color: #fecdd3;
      line-height: 1.8;
    }
    .table-wrap {
      overflow: auto;
      border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: rgba(2, 6, 23, 0.54);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }
    th, td {
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      vertical-align: top;
      font-size: 13px;
    }
    th {
      color: #cbd5e1;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: rgba(15, 23, 42, 0.7);
      position: sticky;
      top: 0;
    }
    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.14);
      color: #bae6fd;
      font-size: 12px;
    }
    .muted {
      color: var(--muted);
    }
    .small {
      font-size: 12px;
      color: var(--muted);
    }
    .footer {
      margin-top: 18px;
      padding: 18px 20px;
      border-radius: 20px;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.12);
      color: var(--muted);
      line-height: 1.7;
      font-size: 13px;
    }
    @media (max-width: 960px) {
      .hero, .grid, .row {
        grid-template-columns: 1fr;
      }
      .stats {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    ${warningPanel}
    <section class="hero">
      <div class="card hero-main">
        <span class="eyebrow">Cloud Mail 邮箱桥接</span>
        <h1>${title}</h1>
        <p class="sub">
          这是一个部署在 Cloudflare Worker 上的邮箱桥接服务，同时兼容 Cloud Mail 管理接口、
          原项目验证码轮询接口，以及主项目使用的 DuckMail 兼容接口。
        </p>
        <div class="stats">
          <div class="stat">
            <span class="k">推荐访问地址</span>
            <span class="v" id="baseUrlValue">加载中...</span>
          </div>
          <div class="stat">
            <span class="k">默认域名</span>
            <span class="v">${defaultDomain}</span>
          </div>
          <div class="stat">
            <span class="k">兼容模式</span>
            <span class="v">Worker + DuckMail + Cloud Mail</span>
          </div>
        </div>
      </div>
      <div class="card hero-side">
        <h2 style="margin:0 0 10px">主项目对接</h2>
        <p class="hint">
          当前项目里，你可以把 <code>duckmail_api_base</code> 和 <code>worker_url</code> 都指向这个 Worker。
          这套服务已经提供了项目所需的兼容接口。
        </p>
        <div class="result-box">子号流程：
config.json
- duckmail_api_base = 当前 Worker 地址
- duckmail_domain = 你的真实邮箱域名
- duckmail_bearer = 生成的 Token 或 Worker 管理密码

母号流程：
team_register/config.json
- worker_url = 当前 Worker 地址
- email_domains = ["${defaultDomain}"]</div>
      </div>
    </section>

    <section class="grid">
      <div class="card section">
        <h2>1. 生成管理员 Token</h2>
        <p class="hint">对应 Cloud Mail 风格接口：POST /api/public/genToken</p>
        <div class="row">
          <div class="field">
            <label>管理员邮箱</label>
            <input id="adminEmail" type="email" placeholder="admin@example.com">
          </div>
          <div class="field">
            <label>管理员密码</label>
            <input id="adminPassword" type="password" placeholder="请输入管理员密码">
          </div>
        </div>
        <div class="actions">
          <button class="btn-primary" onclick="genToken()">生成 Token</button>
          <button class="btn-ghost" onclick="copyToken()">复制 Token</button>
        </div>
        <div class="token-box" id="tokenBox">当前还没有 Token。</div>
      </div>

      <div class="card section">
        <h2>2. 创建邮箱</h2>
        <p class="hint">对应 Cloud Mail 风格接口：POST /api/public/addUser</p>
        <div class="field">
          <label>邮箱列表</label>
          <textarea id="mailboxList" placeholder="alice@${defaultDomain}
bob@${defaultDomain},可选密码"></textarea>
        </div>
        <div class="actions">
          <button class="btn-secondary" onclick="addUsers()">批量创建邮箱</button>
        </div>
        <div class="result-box" id="addUserResult">尚未发送请求。</div>
      </div>

      <div class="card section">
        <h2>3. 搜索邮件</h2>
        <p class="hint">对应 Cloud Mail 风格接口：POST /api/public/emailList</p>
        <div class="row">
          <div class="field">
            <label>收件邮箱</label>
            <input id="filterToEmail" placeholder="%@${defaultDomain}">
          </div>
          <div class="field">
            <label>邮件主题</label>
            <input id="filterSubject" placeholder="%验证码%">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>邮件内容</label>
            <input id="filterContent" placeholder="%123456%">
          </div>
          <div class="field">
            <label>每页数量</label>
            <select id="filterSize">
              <option value="10">10</option>
              <option value="20" selected>20</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button class="btn-primary" onclick="searchEmails()">搜索邮件</button>
        </div>
      </div>

      <div class="card section">
        <h2>4. 验证码接口测试</h2>
        <p class="hint">测试原项目使用的 GET /?email=xxx 验证码轮询接口。</p>
        <div class="field">
          <label>邮箱地址</label>
          <input id="otpEmail" placeholder="alice@${defaultDomain}">
        </div>
        <div class="actions">
          <button class="btn-primary" onclick="readOtp(false)">读取最新验证码</button>
          <button class="btn-ghost" onclick="readOtp(true)">读取并标记删除</button>
        </div>
        <div class="result-box" id="otpResult">尚未发送请求。</div>
      </div>
    </section>

    <section class="card section" style="margin-top:18px">
      <div style="display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <h2 style="margin-bottom:4px">邮件结果</h2>
          <p class="hint" style="margin:0">默认按最新邮件优先显示。</p>
        </div>
        <span class="pill" id="resultCount">0 条</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>收件人</th>
              <th>发件人</th>
              <th>主题</th>
              <th>时间</th>
              <th>预览</th>
            </tr>
          </thead>
          <tbody id="resultBody">
            <tr><td colspan="6" class="muted">暂无数据。</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="footer">
      这套 Worker 会把邮箱账号、邮件正文、邮件索引和签发的邮箱 Token 存到同一个 KV 命名空间里。
      收件后会先用 PostalMime 解析邮件，再同时对外提供 Cloud Mail、Worker 轮询和 DuckMail 三套接口。
    </div>
  </div>

  <script>
    const storageKey = "cloud-mail-bridge-admin-token";

    // 所有表格字段都统一转义，避免邮件主题或正文预览注入脚本。
    function escapeCellHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function authToken() {
      return localStorage.getItem(storageKey) || "";
    }

    function setToken(token) {
      localStorage.setItem(storageKey, token);
      document.getElementById("tokenBox").textContent = token || "当前还没有 Token。";
    }

    function jsonHeaders(auth = true) {
      const headers = { "Content-Type": "application/json" };
      if (auth && authToken()) {
        headers.Authorization = authToken();
      }
      return headers;
    }

    async function genToken() {
      const email = document.getElementById("adminEmail").value.trim();
      const password = document.getElementById("adminPassword").value.trim();
      const res = await fetch("/api/public/genToken", {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      const token = data?.data?.token || "";
      setToken(token);
      if (!token) {
        document.getElementById("tokenBox").textContent = JSON.stringify(data, null, 2);
      }
    }

    async function copyToken() {
      const token = authToken();
      if (!token) {
        return;
      }
      await navigator.clipboard.writeText(token);
    }

    async function addUsers() {
      const raw = document.getElementById("mailboxList").value.trim();
      const list = raw
        .split(/\\r?\\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(",");
          return { email: parts[0].trim(), password: (parts[1] || "").trim() };
        });
      const res = await fetch("/api/public/addUser", {
        method: "POST",
        headers: jsonHeaders(true),
        body: JSON.stringify({ list })
      });
      const data = await res.json();
      document.getElementById("addUserResult").textContent = JSON.stringify(data, null, 2);
    }

    async function searchEmails() {
      const payload = {
        toEmail: document.getElementById("filterToEmail").value.trim(),
        subject: document.getElementById("filterSubject").value.trim(),
        content: document.getElementById("filterContent").value.trim(),
        timeSort: "desc",
        type: 0,
        isDel: 0,
        num: 1,
        size: parseInt(document.getElementById("filterSize").value, 10) || 20
      };
      const res = await fetch("/api/public/emailList", {
        method: "POST",
        headers: jsonHeaders(true),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const rows = Array.isArray(data?.data) ? data.data : [];
      document.getElementById("resultCount").textContent = rows.length + " 条";
      const body = document.getElementById("resultBody");
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" class="muted">未查询到数据。</td></tr>';
        return;
      }
      body.innerHTML = rows.map((row) => {
        const preview = escapeCellHtml((row.text || row.content || "").slice(0, 120));
        return "<tr>" +
          "<td>" + escapeCellHtml(row.emailId) + "</td>" +
          "<td>" + escapeCellHtml(row.toEmail || "") + "</td>" +
          "<td>" + escapeCellHtml(row.sendEmail || "") + "</td>" +
          "<td>" + escapeCellHtml(row.subject || "") + "</td>" +
          "<td>" + escapeCellHtml(row.createTime || "") + "</td>" +
          '<td class="small">' + preview + "</td>" +
        "</tr>";
      }).join("");
    }

    async function readOtp(deleteAfter) {
      const email = document.getElementById("otpEmail").value.trim();
      const params = new URLSearchParams({ email });
      if (deleteAfter) {
        params.set("delete", "true");
      }
      const res = await fetch("/?" + params.toString());
      const text = await res.text();
      document.getElementById("otpResult").textContent = "状态码: " + res.status + "\\n" + text;
    }

    document.getElementById("baseUrlValue").textContent = location.origin;
    setToken(authToken());
  </script>
</body>
</html>`;
}
