# Cloud Mail Bridge Worker

这是一个可以直接部署到 Cloudflare 的邮箱 Worker 项目，目标是同时兼容你当前主项目里的三套邮箱调用方式。

支持的接口如下：

1. Cloud Mail 管理接口
   - `POST /api/public/genToken`
   - `POST /api/public/addUser`
   - `POST /api/public/emailList`

2. 原项目母号 / Team Token 使用的 Worker 取码接口
   - `GET /?email=xxx`
   - `GET /?email=xxx&delete=true`

3. 原项目子号使用的 Worker / DuckMail 兼容接口
   - `POST /api/new_address`
   - `GET /api/mails`
   - `GET /api/mails/:id`
   - `POST /api/accounts`
   - `POST /api/token`
   - `GET /api/messages`
   - `GET /api/messages/:id`

## 这版的 KV 绑定方式

这次不再把 `kv_namespaces.id` 和 `preview_id` 当成默认必填项。

推荐你直接按 Cloudflare 后台的绑定方式来做：

1. 进入 `Workers & Pages`
2. 打开这个 Worker
3. 进入 `Settings -> Bindings`
4. 点击 `Add binding -> KV namespace`
5. `Variable name` 直接填写：`kv`
6. `KV namespace` 选择你自己的命名空间

代码会优先读取 `kv`，同时兼容旧绑定名：

- `kv`
- `KV`
- `MAIL_STORE`

推荐统一只用 `kv`，最直观，也最符合你说的 Cloudflare 变量名习惯。

## 部署前必须修改

1. [wrangler.toml](./wrangler.toml) 里的 `DEFAULT_DOMAIN`
   - 必须改成你已经接入 Cloudflare Email Routing 的真实收件域名。
   - 示例：`mail.example.com`

2. [wrangler.toml](./wrangler.toml) 里的 `ADMIN_EMAIL`
   - 必须改成真实管理员邮箱。

3. Worker Secrets
   - 必须执行：`npx wrangler secret put ADMIN_PASSWORD`
   - 必须执行：`npx wrangler secret put WORKER_ADMIN_PASSWORD`
   - 不要把真实密码直接写进仓库。

4. Cloudflare 绑定
   - 必须给 Worker 绑定一个 KV 命名空间。
   - 变量名建议直接使用：`kv`

## 推荐部署步骤

1. 安装依赖

```bash
cd email
npm install
```

2. 修改 [wrangler.toml](./wrangler.toml)
   - 填真实 `DEFAULT_DOMAIN`
   - 填真实 `ADMIN_EMAIL`

3. 写入 Secrets

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put WORKER_ADMIN_PASSWORD
```

4. 部署 Worker

```bash
npx wrangler deploy
```

5. 在 Cloudflare 控制台绑定 KV
   - `Workers & Pages -> 当前 Worker -> Settings -> Bindings`
   - `Add binding -> KV namespace`
   - `Variable name` 填 `kv`
   - `Namespace` 选择你的真实命名空间

6. 在 Cloudflare 配置 Email Routing
   - 把目标域名的来信投递给这个 Worker。
   - 如果没有这一步，Worker 接口可访问，但收不到邮件。

7. 本地做语法检查

```bash
npm run check
```

## 如果你想继续用 wrangler 配置 KV

这不是推荐方式，但如果你习惯把绑定写进配置文件，也可以。

把下面这段加入 [wrangler.toml](./wrangler.toml)：

```toml
[[kv_namespaces]]
binding = "kv"
id = "你的真实 namespace id"
preview_id = "你的真实 preview namespace id"
```

重点还是 `binding = "kv"`，这样代码和 Cloudflare 变量名就统一了。

## 本地调试

如果你要用 `wrangler dev` 做本地联调，可以把 `.dev.vars.example` 复制为 `.dev.vars`，再填入本地测试值。

`.dev.vars` 只用于本地环境变量，不负责 KV 绑定。  
KV 绑定仍然走 Cloudflare Worker Bindings，或者走上面的可选 `[[kv_namespaces]]` 配置。

## 管理页面

部署完成后，直接访问 Worker 根路径：

```text
https://openai-email-receiver.<your-subdomain>.workers.dev/
```

这个页面可以：

- 生成管理员 token
- 创建邮箱
- 搜索邮件
- 测试 `GET /?email=xxx` 取验证码接口
- 在顶部直接看到“哪些配置还没按真实环境修改”

## 主项目对接方式

### 推荐方式

建议保持 Worker 名称为 `openai-email-receiver`。这样主项目子号流程会优先进入它原本自带的“简易 Worker 模式”。

根目录 `config.json`：

```json
{
  "duckmail_api_base": "https://openai-email-receiver.<your-subdomain>.workers.dev",
  "duckmail_domain": "your-domain.com",
  "duckmail_bearer": "这里填 genToken 生成的 token，或填 WORKER_ADMIN_PASSWORD"
}
```

`team_register/config.json`：

```json
{
  "worker_url": "https://openai-email-receiver.<your-subdomain>.workers.dev",
  "email_domains": ["your-domain.com"]
}
```

### 如果你使用自定义域名

也可以继续工作，因为这个 Worker 同时支持兼容接口：

- 子号流程可走 `/api/new_address`、`/api/mails`、`/api/messages`
- 母号流程仍然走 `GET /?email=xxx`

只是从“零改主项目”的角度，优先推荐继续使用 `workers.dev` 地址。

## 说明

- 所有邮箱、消息、token 都存储在同一个 KV namespace 里。
- `genToken` 始终只保留一个当前有效的全局管理员 token。
- `GET /?email=xxx&delete=true` 会把最新一封带 OTP 的邮件标记为已删除。
- 管理页现在已对邮件主题和正文预览做转义，避免恶意邮件内容污染页面。
