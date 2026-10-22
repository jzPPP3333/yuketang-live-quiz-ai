# 雨课堂 随堂答题 AI 助手（多接口 / 中转站通用版）

一个 Tampermonkey 用户脚本：实时监听雨课堂课堂里老师弹出的**随堂试题**，调用**任意 OpenAI 兼容接口**生成答案，并按需自动勾选、自动提交。

> 与原版脚本最大的区别：**不再绑定 DeepSeek**。DeepSeek、OpenAI、通义千问、硅基流动、OpenRouter、Kimi、智谱 GLM、火山方舟，以及任何 one-api / new-api / 自建反代**中转站**、本地反代，全部可用。

## ⚡ 一键安装

**👉 [点我安装脚本](https://raw.githubusercontent.com/jzPPP3333/yuketang-live-quiz-ai/main/yuketang-live-quiz-ai.user.js)**

[![安装](https://img.shields.io/badge/Tampermonkey-点击安装-4ade80?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/jzPPP3333/yuketang-live-quiz-ai/main/yuketang-live-quiz-ai.user.js)

> 首次点开若只看到一堆代码：说明还没装 Tampermonkey。装好插件后回来再点一次，就会弹出「安装」确认框。
> 装过旧版也没关系，脚本已内置 `@updateURL`，Tampermonkey 会自动检测更新。

---

## 一、和旧版的差异

| 项目 | 旧版（DeepSeek 专用） | 本版 v4.3 |
| --- | --- | --- |
| 接口地址 | 硬编码 `api.deepseek.com` | 任意 OpenAI 兼容地址，可填中转站 |
| 模型名 | 仅 `deepseek-chat` / `deepseek-reasoner` | 任意模型名，带常用模型快捷按钮 |
| 鉴权 | 固定 `Bearer` | 支持额外请求头（自定义鉴权 Header） |
| 请求体 | 固定字段 | 支持 `extraBody` 合并任意字段（`top_p`、`thinking` 等） |
| 响应解析 | 只认 `choices[0].message.content` | 兼容 `content` 数组 / `reasoning_content` / `data` 包裹 / Anthropic 原生 |
| 配置方式 | 改代码 | 可视化面板 + GM 存储，改完即生效 |
| 排障 | 只有一句「网络错误」 | 「🩺 诊断」三步定位：地址 → 端口 → 鉴权 → 模型 |

---

## 二、安装

### 方式 A：点链接（推荐）

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（篡改猴 / 油猴）。
2. 点上面的 **👉 点我安装脚本**，Tampermonkey 弹出确认页，点「安装」。
3. 打开雨课堂网页版授课页面（`https://*.yuketang.cn/*`），右下角出现 **雨课堂 AI 助手 v4.3.0** 面板即成功。

### 方式 B：手动

Tampermonkey → 添加新脚本 → 清空模板 → 粘贴 [`yuketang-live-quiz-ai.user.js`](https://raw.githubusercontent.com/jzPPP3333/yuketang-live-quiz-ai/main/yuketang-live-quiz-ai.user.js) 全文 → `Ctrl+S`。

---

## 三、配置：随便接哪个 API 都行

面板里依次填三项即可：**服务商 → API 地址 → API Key → 模型名**。

### 3.1 常见服务商

| 服务商 | API 地址（Base URL） | 典型模型名 |
| --- | --- | --- |
| DeepSeek 官方 | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` / `deepseek-reasoner` |
| OpenAI 官方 | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| 阿里云百炼 / 通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-plus` |
| 硅基流动 | `https://api.siliconflow.cn/v1/chat/completions` | `Qwen/Qwen2.5-7B-Instruct` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `openai/gpt-4o-mini` |
| Moonshot / Kimi | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4-flash` |
| 火山方舟 Doubao | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | `doubao-pro-32k` |

### 3.2 中转站（one-api / new-api / 自建反代）

「服务商」选 **自定义 / 中转站**，然后：

- **API 地址**：填中转站给你的地址。脚本会自动补 `/chat/completions`，所以下面几种写法都可以：
  ```
  https://relay.example.com                    → https://relay.example.com/chat/completions
  https://relay.example.com/v1                 → https://relay.example.com/v1/chat/completions
  https://relay.example.com/v1/chat/completions→ 原样使用
  ```
- **API Key**：中转站的令牌（`sk-...` 或站点自定义前缀），脚本统一发 `Authorization: Bearer <key>`。
- **模型名**：填中转站后台显示的模型全名，例如 `gpt-4o-mini`、`claude-3-5-sonnet-20241022`、`gemini-2.0-flash`。

如果中转站用的是**非标准鉴权头**（比如 `x-api-key`、`api-key`），在「高级参数 → 额外请求头 JSON」里补：

```json
{"x-api-key": "你的key"}
```

如果需要额外请求体字段（`top_p`、`enable_thinking`、`thinking.budget_tokens` 等）：

```json
{"top_p": 0.9, "enable_thinking": false}
```

### 3.3 内网 / 本地反代

配合 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)、[allproxyapi](https://github.com/jzPPP3333/allproxyapi)、LiteLLM、one-api 等自建网关完全可用，地址填 `http://127.0.0.1:8317/v1/chat/completions` 这类本机地址即可（Tampermonkey 的 `@connect *` 已放开跨域）。

---

## 四、使用

1. 进入课堂页面，面板右下角确认状态为「待命」。
2. 点 **🔌 测试接口**，看到 `✅ 接口正常` 说明地址 / Key / 模型三件套没问题。
3. 老师放题后，脚本通过三条通道并行捕获：
   - **WebSocket Hook**：劫持 `unlockproblem` / `sendproblem` / `publishproblem` 事件（最快，毫秒级）
   - **Fetch Hook**：监听题目相关接口响应
   - **DOM 轮询**：MutationObserver + 3 秒兜底扫描弹窗
4. 捕获后立刻请求 AI，面板显示 `答案：B`；若开了「自动提交」，会按设定的随机延时（默认 3–7 秒）自动勾选并点提交。

### 面板开关说明

| 开关 | 作用 |
| --- | --- |
| 自动解题 | 关闭后只做检测，不请求 AI |
| 自动提交 | 关闭后只在面板显示参考答案，需要你自己点 |
| 填填空 | 填空题 / 简答题自动写入输入框 |
| 随机延时 | 勾选后按「最小/最大」秒数随机等待再提交，降低秒答被判定异常的概率 |
| 调试日志 | 打开后浏览器控制台输出完整请求/响应，排查问题用 |

### 面板可视元素

| 元素 | 说明 |
| --- | --- |
| 顶部状态灯 | 灰＝待命 / 黄闪＝正在请求或作答 / 红＝出错 / 绿＝正常 |
| 三格统计卡 | 已捕获题数、已提交题数、AI 平均往返耗时（最近 20 次均值） |
| 通道指示灯 | `● WS` `● FETCH` `● DOM` 分别表示三条捕获通道是否已挂载成功 |
| 提交进度条 | 随机延时期间显示绿色进度条与「x.x 秒后提交」倒计时 |
| 答案卡片 | 显示最终答案 + 模型原始输出（前 500 字），便于核对 |
| 答题记录 | 最近 12 条，含时间、题干预览、答案、结果标签（已提交 / 待手动 / 异常） |
| 悬浮球 | 点标题栏 `◍` 收成右下角小圆球，不遮挡 PPT；有新题作答时圆球跳动并显示累计数 |
| 折叠 | 点标题栏 `—` 只收起正文，标题栏保留，方便临时看屏幕 |
| 一键操作 | 🩺 诊断 / 🔌 测试接口 / 🧪 解析当前题 / ♻️ 清空记录 / 📋 复制记录 |

> 面板可拖动，位置与「悬浮球」状态会记在本地，下次进入课堂自动恢复。

### 支持题型

单选、多选、判断、投票、填空、主观题（简答）。其中选择/判断会自动点击，填空/简答按「填填空」开关决定是否写入。

---

## 五、"只要在页面就会自动答题吗"

**是，但有前提。** 脚本装好后不需要任何额外操作，满足以下条件就会自动完成「捕获 → AI 作答 → 勾选 → 提交」：

| 条件 | 说明 |
| --- | --- |
| 停在**课堂内页** | 课程列表页（我教的课 / 我听的课）没有题目，不会有任何动作 |
| 已进入课堂 | 需要先完成签到 / 进入课堂，前端才会收到 `unlockproblem` 推送 |
| 面板开关为开 | 「自动解题」「自动提交」均为 ✓ |
| 题目以弹窗形式出现 | 老师放题后前端渲染出题目弹窗，DOM 里能读到题干与选项 |

补充几点实际使用中的行为：

- **切到别的标签页也能答**：WebSocket 消息照常接收；但浏览器会把后台标签的定时器降频（最低约 1 次/秒，闲置久了更慢），所以随机延时会变长、DOM 轮询会变钝。想稳就保持课堂标签可见，或单独开一个窗口置底。
- **同一道题不会答两次**：按题干 + 选项文本算指纹，翻页回来、断线重连都跳过。
- **不会瞎点**：找不到可点的选项时不强行操作，只在面板给参考答案并提示手动，避免把多选题点成反选。
- **提交只点一次**：模拟点击只触发一次 `click`，不会因重复派发事件而重复提交。

---

## 六、工作原理

```
老师放题
   │  服务器 → WebSocket (op: unlockproblem)
   ▼
[WebSocket Hook] ──┐
[Fetch Hook]     ──┼─→ 命中题目 → 等 DOM 渲染出弹窗
[DOM 轮询]        ──┘
   ▼
解析题目文本 + 选项（题型粗判）
   ▼
buildPrompt() → 要求模型输出 JSON: {"answers":["A","C"]}
   ▼
callAPI()  ── POST {baseUrl}  Authorization: Bearer {key}
   ▼
extractContent() 兼容各种响应包装 → parseAnswer() 稳健解析
   ▼
fireMouse(选项) → 等待 → 点击「提交」
```

关键容错点：

- 响应里出现 ```` ```json ```` 包裹会自动剥掉
- 模型不按格式回答时，退化为正则抓选项字母
- 已处理过的题目用文本指纹去重，翻页回来不会重复作答
- 提交按钮找不到时只勾选不提交，并在面板提示你手动点

---

## 七、常见问题

### 「网络错误」到底怎么查

点面板里的 **🩺 诊断**，它会依次跑三步并直接告诉你卡在哪：

```
【1】地址归一化
  填写：http://127.0.0.1:8878/v1
  实际：http://127.0.0.1:8878/v1/chat/completions
  协议：http:  ok

【2】探测服务是否在线（GET http://127.0.0.1:8878/v1/models）
  ✗ 连不上：端口没人监听 / 服务没启动 / 被防火墙拦截
    这条基本就是「网络错误」的直接原因

【3】真实对话请求（POST ...，model=xxx）
  ✗ 连不上（同第 2 步原因）
```

对照三种结果：

| 第 2 步结果 | 含义 | 处理 |
| --- | --- | --- |
| `✗ 连不上` | **端口没人监听** | 服务没起，或端口号打错了。这是「网络错误」最主要的原因 |
| `✓ HTTP 401` | 端口活着，只是没带对 Key | 正常，去看第 3 步 |
| `✓ 服务正常` + 模型列表 | 完全通 | 若第 3 步仍失败，是对应模型名不对 |

> 实测案例：填 `http://127.0.0.1:8878/v1` 报网络错误，而本机实际监听的是 **8788**（wb-proxy）。一字之差。

其他高频原因：

**Q：本地反代端口怎么确认？**
A：PowerShell 里跑一条，看目标端口在不在列表：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 8000 -and $_.LocalPort -le 9000 } |
  Select-Object LocalAddress, LocalPort, OwningProcess | Sort-Object LocalPort
```

拿到 PID 再 `Get-Process -Id <PID>` 就知道是哪个程序。浏览器也可直接开 `http://127.0.0.1:<端口>/v1/models` —— 返回 JSON 或 401 都算活着，`ERR_CONNECTION_REFUSED` 才是真没起。

**Q：页面是 https，接口是 http 本地地址，会被拦吗？**
A：`GM_xmlhttpRequest` 走扩展层，正常不受混合内容限制。但若你用的是某些国内套壳浏览器或扩展被精简，可能仍被拦截 —— 诊断第 1 步会标出 `⚠ 与页面 HTTPS 混用`。

**Q：提示「响应中没有可解析的文本」？**
A：模型返回了非标准结构。打开「调试日志」看控制台原始响应；`extractContent` 已兼容 `choices[0].message.content` / content 数组 / `reasoning_content` / `{data:{...}}` / Anthropic `content[]`，仍不行请提 Issue 附脱敏响应体。

**Q：提示 HTTP 401 / 403？**
A：Key 错误，或中转站要求非标准鉴权头。用「额外请求头 JSON」补上（如 `{"x-api-key":"sk-xxx"}`），同时把面板里的 API Key 留空避免冲突。

**Q：提示 HTTP 404？**
A：路径不对。只填 `http://host:port` 或 `http://host:port/v1`，让脚本自动补 `/v1/chat/completions` 最稳。

**Q：提示 HTTP 400？**
A：多半是模型名不存在。诊断第 2 步会列出服务端真实可用的模型名，照着改。

**Q：`@connect *` 会不会不安全？**
A：它只允许 Tampermonkey 向你在面板里填写的地址发请求，不放宽任何同源策略；Key 只存在本地 GM 存储，不会上传到任何第三方。

**Q：为什么有时候抓到了题却不动？**
A：雨课堂部分班型的选项不是标准 `el-radio` / `el-checkbox`，脚本找不到可点元素。此时面板提示「页面上没找到可操作的控件」，参考答案仍显示，手动点一下即可。

**Q：选「自定义 / 中转站」后地址被清空了？**
A：v4.3 起切到「自定义」会保留你已填的地址，只有原本还是示例占位地址时才会清空。

---

## 八、文件说明

```
yuketang-live-quiz-ai/
├── yuketang-live-quiz-ai.user.js   # 用户脚本本体（安装这个）
├── README.md                       # 本文档
└── LICENSE                         # MIT
```

---

## 九、免责声明

本项目仅供**个人学习与技术研究**，用于理解 WebSocket 拦截、DOM 自动化与多服务商 API 适配等前端工程实践。
使用者需自行遵守所在学校、课程及雨课堂平台的学术诚信与使用规范，由此产生的一切后果由使用者自行承担。

## License

MIT
