# 雨课堂 随堂答题 AI 助手（多接口 / 中转站通用版）

一个 Tampermonkey 用户脚本：实时监听雨课堂课堂里老师弹出的**随堂试题**，调用**任意 OpenAI 兼容接口**生成答案，并按需自动勾选、自动提交。

> 与原版脚本最大的区别：**不再绑定 DeepSeek**。DeepSeek、OpenAI、通义千问、硅基流动、OpenRouter、Kimi、智谱 GLM、火山方舟，以及任何 one-api / new-api / 自建反代**中转站**，全部可用。

---

## 一、和旧版的差异

| 项目 | 旧版（DeepSeek 专用） | 本版 v4.2 |
| --- | --- | --- |
| 接口地址 | 硬编码 `api.deepseek.com` | 任意 OpenAI 兼容地址，可填中转站 |
| 模型名 | 仅 `deepseek-chat` / `deepseek-reasoner` | 任意模型名，带常用模型快捷按钮 |
| 鉴权 | 固定 `Bearer` | 支持额外请求头（自定义鉴权 Header） |
| 请求体 | 固定字段 | 支持 `extraBody` 合并任意字段（`top_p`、`thinking` 等） |
| 响应解析 | 只认 `choices[0].message.content` | 兼容 `content` 数组 / `reasoning_content` / `data` 包裹 / Anthropic 原生 |
| 配置方式 | 改代码 | 可视化面板 + GM 存储，改完即生效 |
| 联通性 | 无 | 面板内「测试接口」一键探活 |

---

## 二、安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（篡改猴 / 油猴）。
2. 打开安装链接，弹窗点「安装」：

   ```
   https://raw.githubusercontent.com/jzPPP3333/yuketang-live-quiz-ai/main/yuketang-live-quiz-ai.user.js
   ```

   或者手动：Tampermonkey → 添加新脚本 → 把 `yuketang-live-quiz-ai.user.js` 全文粘进去 → `Ctrl+S`。

3. 打开雨课堂网页版授课页面（`https://*.yuketang.cn/*`），右下角会出现**雨课堂 AI 助手**面板。

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

### 支持题型

单选、多选、判断、投票、填空、主观题（简答）。其中选择/判断会自动点击，填空/简答按「填填空」开关决定是否写入。

---

## 五、工作原理

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

## 六、常见问题

**Q：提示「响应中没有可解析的文本」？**
A：模型返回了非标准结构。打开「调试日志」看控制台里的原始响应；若中转站把结果包在 `data.result`，本版已在 `extractContent` 里做兼容，仍不行请提 Issue 附上脱敏后的响应体。

**Q：提示 HTTP 401 / 403？**
A：Key 错误，或中转站要求非标准鉴权头。用「额外请求头 JSON」补上，同时把面板里的 API Key 留空避免冲突。

**Q：提示 HTTP 404？**
A：地址补错了。多数情况是把 `/v1` 写重了或漏了，直接填服务商根地址让脚本补全最稳。

**Q：`@connect *` 会不会不安全？**
A：它只允许 Tampermonkey 向你在面板里填写的地址发请求，不放宽任何同源策略；Key 只存在本地 GM 存储，不会上传到任何第三方。

**Q：为什么有时候抓到了题却不动？**
A：雨课堂部分班型的选项不是标准 `el-radio` / `el-checkbox`，脚本找不到可点元素。此时面板会提示「页面上没找到可操作的控件」，参考答案仍然显示，手动点一下即可。

---

## 七、文件说明

```
yuketang-live-quiz-ai/
├── yuketang-live-quiz-ai.user.js   # 用户脚本本体（安装这个）
├── README.md                       # 本文档
└── LICENSE                         # MIT
```

---

## 八、免责声明

本项目仅供**个人学习与技术研究**，用于理解 WebSocket 拦截、DOM 自动化与多服务商 API 适配等前端工程实践。
使用者需自行遵守所在学校、课程及雨课堂平台的学术诚信与使用规范，由此产生的一切后果由使用者自行承担。

## License

MIT
