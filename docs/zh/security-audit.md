# TrueNeverStory — 安全审计报告

**日期:** 2026-07-04  
**版本:** 0.14.0  
**范围:** 全代码库安全审查  

---

## 执行摘要

TNS 在其威胁模型（本地/单人 AI 角色扮演引擎）方面拥有**坚实的安全基础**。身份验证、SQL 注入防护、提示注入防御和输入清理都实现得很好。主要风险在边缘情况：CSP 策略、静态文件路径遍历、WebSocket 身份验证验证和 `Object.assign` 原型污染模式。大多数问题在本地部署中属于中等严重性，但对于任何面向公众的实例都将是高优先级。

**总体评级：中等** — 适合本地使用，公开部署需要加固。

---

## 1. 身份验证和会话管理

### 优势

| 控制 | 位置 | 状态 |
|------|------|------|
| PBKDF2 密码哈希 | `src/middleware/auth.ts:16-18` | 100k 迭代，SHA-512，64 字节密钥 |
| 会话令牌 | `src/middleware/auth.ts:79-81` | `randomBytes(32)` — 256 位熵 |
| Cookie 安全 | `src/middleware/auth.ts:230` | HttpOnly，SameSite=Lax |
| 登录速率限制 | `src/middleware/auth.ts:56-77` | 5 次/分钟，5 分钟锁定 |
| 修改密码时自动哈希 | `src/routes/settings.ts:190-196` | PUT 时生成 PBKDF2 哈希 |

### 问题

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **中** | 内存会话存储 | `auth.ts:13` | 服务器重启时会话丢失。适合本地单人使用。 |
| **中** | 明文密码回退 | `auth.ts:40-41` | 无 `AUTH_PASSWORD_HASH` 时明文比较。 |
| **低** | `x-forwarded-for` 可伪造 | `auth.ts:193` | 速率限制 IP 来自可伪造的头部。 |

---

## 2. SQL 注入

### 优势

**所有 SQLite 查询使用参数化占位符（`?`）。** SQL 中无字符串插值。

### 问题

未发现。SQL 注入处理良好。

---

## 3. 跨站脚本（XSS）

### 问题

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **高** | CSP 允许 `unsafe-inline` | `security-headers.ts:27-28` | 允许内联 JavaScript 执行。XSS 注入完全绕过 CSP。 |
| **中** | CSP 允许样式 `unsafe-inline` | `security-headers.ts:28` | CSS 注入可能。 |
| **低** | 登录页面错误消息未清理 | `auth.ts:112` | 无转义地插值到 HTML。 |

---

## 4. 路径遍历

### 问题

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **中** | 静态文件无路径验证 | `src/app.ts:52` | 未检查解析路径是否在 PUBLIC_DIR 内。 |
| **中** | 世界文件无路径验证 | `src/routes/worlds.ts:146,257` | URL 参数中的 `name`，`../` 可能。 |
| **低** | 快照使用用户 session_id | `src/routes/launch.ts:118` | 可读取任意 `.json` 文件。 |
| **低** | 章节文件访问 | `src/routes/worlds.ts:253-264` | URL 参数中的 filename，无清理。 |

---

## 5. 命令注入

### 优势

| 控制 | 位置 | 状态 |
|------|------|------|
| 后端安装白名单 | `src/routes/models.ts:58` | `name` 验证为 `["ollama", "llamacpp"]` |
| 安全表达式求值器 | `src/services/probability-expression.ts` | 递归下降解析器替代 `eval()` |

### 问题

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **低** | 安装脚本使用 `execSync` | `src/routes/models.ts:71` | 从白名单构建，不可直接利用。 |
| **低** | llama-server 使用 `spawn` | `src/routes/settings.ts:132` | 参数来自 config，非用户输入。 |

---

## 6. 原型污染

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **低** | 用户数据的 `Object.assign` | 多个文件 | 如含 `__proto__` 键则可能污染。 |

---

## 7. WebSocket 安全

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **中** | WS 认证仅检查 cookie 存在 | `src/index.ts:151-153` | 过期/无效令牌仍允许 WS 升级。 |
| **低** | WS 消息无输入清理 | `src/index.ts:229` | WS 内容直接进入 `engine.processInput()` 无 `sanitizeInput()`。 |

---

## 8. 输入验证

### 优势

| 控制 | 位置 | 状态 |
|------|------|------|
| Zod 模式验证 | `src/routes/chat.ts:35,61` | 聊天端点 |
| 提示注入清理 | `src/utils/sanitize.ts` | 15+ 正则模式，最大 8000 字符 |

### 问题

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **低** | 大多数路由缺少验证 | `src/routes/*.ts` | 大多数 API 端点无 Zod 模式。 |

---

## 9. 错误处理

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **低** | 部分路由错误消息泄露细节 | `src/routes/chat.ts:103` 等 | JSON 响应中的 `err.message`。 |

---

## 10. 依赖和配置安全

### 优势

- `.env` 在 gitignore 中
- 配置文件在 gitignore 中
- 世界数据在 gitignore 中

---

## 11. CORS 配置

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **中** | CORS 硬编码到 localhost | `src/app.ts:38` | 无可配置 CORS。 |

---

## 12. 安全头

全部存在且正确。详见英文版。

缺失头（推荐）：
- `Strict-Transport-Security`（HSTS）
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

---

## 13. 提示注入防御

### 优势

| 控制 | 位置 | 状态 |
|------|------|------|
| 模式清理 | `src/utils/sanitize.ts:6-34` | 15+ 正则模式 |
| 内容包装 | `src/utils/sanitize.ts:81-83` | `<user_message>` 标记 |
| 最大消息长度 | `src/utils/sanitize.ts:36` | 8000 字符 |
| 应用于 REST 路由 | `src/routes/chat.ts:66,129,165` | 所有聊天端点 |

### 问题

| 严重性 | 问题 | 位置 | 描述 |
|--------|------|------|------|
| **中** | WebSocket 消息未清理 | `src/index.ts:229` | 无 `sanitizeInput()`。 |

---

## 建议（优先级顺序）

1. **修复 CSP** — 用 nonce/hash CSP 替换 `unsafe-inline`。
2. **验证 WebSocket 消息** — 应用 `sanitizeInput()`。
3. **验证 WS 会话令牌** — 对会话存储验证有效性。
4. **添加路径遍历检查** — 静态文件和世界路由。
5. **添加 `Strict-Transport-Security`** — HTTPS 时。
6. **移除硬编码路径** — `settings.ts:101`。
7. **添加输入验证** — 无 Zod 的路由。
8. **考虑持久会话** — SQLite 可在重启后存活。

---

## 审查文件

详见英文版（21 个文件）。
