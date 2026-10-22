// ==UserScript==
// @name         雨课堂 随堂答题 AI 助手 (多接口 / 中转站通用版)
// @namespace    https://github.com/jzPPP3333/yuketang-live-quiz-ai
// @version      4.3.0
// @description  实时监听雨课堂随堂试题(WebSocket + DOM 双通道)，调用任意 OpenAI 兼容接口（DeepSeek / OpenAI / 通义 / 硅基流动 / OpenRouter / Kimi / GLM / 中转站 / 本地反代）生成答案，可自动勾选并提交。内置连通性诊断。
// @author       jzPPP3333
// @match        https://*.yuketang.cn/*
// @match        https://*.xuetangx.com/*
// @match        https://changjiang.yuketang.cn/*
// @match        https://www.yuketang.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @connect      *
// @updateURL    https://raw.githubusercontent.com/jzPPP3333/yuketang-live-quiz-ai/main/yuketang-live-quiz-ai.user.js
// @downloadURL  https://raw.githubusercontent.com/jzPPP3333/yuketang-live-quiz-ai/main/yuketang-live-quiz-ai.user.js
// @run-at       document-start
// @noframes     false
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================================
   *  0. 常量与默认配置
   * ========================================================================= */

  const VERSION = '4.2.0';

  // 常见服务商预设：baseUrl 一律填 OpenAI 兼容的 /chat/completions 全路径
  // 中转站（one-api / new-api / 自建反代）大多直接兼容 OpenAI 协议，选 custom 自行填写即可
  const PRESETS = {
    deepseek: {
      label: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
    },
    openai: {
      label: 'OpenAI 官方',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    },
    dashscope: {
      label: '阿里云百炼 / 通义',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'qwen-plus',
      models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-vl-plus'],
    },
    siliconflow: {
      label: '硅基流动 SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      models: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    },
    openrouter: {
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4o-mini',
      models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'],
    },
    moonshot: {
      label: 'Moonshot / Kimi',
      baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
      model: 'moonshot-v1-8k',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest'],
    },
    zhipu: {
      label: '智谱 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
      models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'],
    },
    volcengine: {
      label: '火山方舟 Doubao',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      model: 'doubao-pro-32k',
      models: ['doubao-pro-32k', 'doubao-lite-32k'],
    },
    custom: {
      label: '自定义 / 中转站',
      baseUrl: 'https://your-relay.example.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      models: [],
    },
  };

  const DEFAULTS = {
    provider: 'deepseek',
    baseUrl: PRESETS.deepseek.baseUrl,
    apiKey: '',
    model: PRESETS.deepseek.model,
    temperature: 0.1,
    maxTokens: 512,
    extraHeaders: '', // JSON 字符串，如 {"X-Title":"ykt"}
    extraBody: '',    // JSON 字符串，会 merge 进请求体
    // 行为开关
    autoSolve: true,       // 检测到题目即请求 AI
    autoSubmit: true,      // AI 给出答案后自动勾选并提交
    autoFillBlank: true,   // 填空题自动填写
    humanDelay: true,      // 随机延时后再提交（防风控）
    minDelay: 3,
    maxDelay: 7,
    clickBeforeSubmit: 400, // 勾选后到点击提交之间的间隔 ms
    debug: false,
  };

  const SK = 'ykt_lqa_'; // storage key 前缀
  const settings = {};

  function loadSettings() {
    Object.keys(DEFAULTS).forEach((k) => {
      let v = DEFAULTS[k];
      try {
        const raw = GM_getValue(SK + k, null);
        if (raw !== null && raw !== undefined && raw !== '') {
          v = typeof DEFAULTS[k] === 'number' ? Number(raw) : typeof DEFAULTS[k] === 'boolean' ? (raw === true || raw === 'true') : String(raw);
        }
      } catch (e) { /* ignore */ }
      settings[k] = v;
    });
  }

  function saveSetting(key, value) {
    settings[key] = value;
    GM_setValue(SK + key, value);
    renderPanel();
  }

  function log(...args) {
    if (settings.debug) console.log('%c[雨课堂AI]', 'color:#4ade80', ...args);
  }
  function warn(...args) {
    console.warn('[雨课堂AI]', ...args);
  }

  loadSettings();

  /* =========================================================================
   *  1. API 适配层（核心：任意 OpenAI 兼容接口 / 中转站）
   * ========================================================================= */

  /**
   * 归一化 baseUrl：
   *  - 允许用户只填 https://xxx.com 或 https://xxx.com/v1
   *  - 自动补 /chat/completions
   *  - 已经是全路径则原样返回
   */
  function normalizeEndpoint(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';
    url = url.replace(/\s+/g, '');
    if (!/^https?:\/\//i.test(url)) {
      // 本地/内网地址默认 http，公网默认 https
      const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url);
      url = (isLocal ? 'http://' : 'https://') + url;
    }
    // 只填了根路径 / 端口：补标准 OpenAI 路径
    let u;
    try { u = new URL(url); } catch (e) { return ''; }
    const p = u.pathname.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(p)) return url.replace(/\/+$/, '');
    if (/\/completions$/i.test(p)) return url.replace(/\/+$/, '');
    if (p === '' || p === '/') return u.origin + '/v1/chat/completions';
    return u.origin + p + '/chat/completions';
  }

  function parseJsonObject(text, fallback) {
    const s = String(text || '').trim();
    if (!s) return fallback;
    try { return JSON.parse(s); } catch (e) { /* try loose */ }
    // 允许用户写 { 'a': 1 } 这种带单引号的写法
    try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) { /* ignore */ }
    warn('自定义 JSON 解析失败，已忽略：', s);
    return fallback;
  }

  function buildHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (settings.apiKey) headers.Authorization = 'Bearer ' + settings.apiKey;
    // 中转站常用额外头（X-Title / HTTP-Referer / 自定义鉴权等）
    const extra = parseJsonObject(settings.extraHeaders, null);
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach((k) => { headers[k] = String(extra[k]); });
    }
    return headers;
  }

  function buildBody(prompt, overrides) {
    const o = overrides || {};
    const body = {
      model: o.model || settings.model,
      messages: [
        { role: 'system', content: '你是一个只输出答案的答题机，严格按要求格式回复，不要输出解释。' },
        { role: 'user', content: prompt },
      ],
      temperature: o.temperature !== undefined ? o.temperature : Number(settings.temperature) || 0.1,
      stream: false,
    };
    const mt = o.maxTokens !== undefined ? o.maxTokens : Number(settings.maxTokens);
    if (mt > 0) body.max_tokens = mt;
    // 部分中转站/推理模型不认 max_tokens 之外字段，extraBody 用于兜底
    const extra = parseJsonObject(settings.extraBody, null);
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach((k) => { body[k] = extra[k]; });
    }
    return body;
  }

  /** 从各种风格的响应里抠出正文文本 */
  function extractContent(json) {
    if (!json || typeof json !== 'object') return '';

    // 1) OpenAI 标准
    const choice = json.choices && json.choices[0];
    if (choice) {
      const msg = choice.message || choice.delta || {};
      let c = msg.content;
      if (Array.isArray(c)) {
        c = c.map((p) => (typeof p === 'string' ? p : p.text || p.content || '')).join('');
      }
      if (c) return String(c).trim();
      if (msg.reasoning_content) return String(msg.reasoning_content).trim();
      if (typeof choice.text === 'string') return choice.text.trim();
    }

    // 2) 部分中转站包了一层
    const d = json.data || json.result || json.output;
    if (typeof d === 'string') return d.trim();
    if (d && typeof d === 'object') {
      const inner = extractContent(d);
      if (inner) return inner;
    }
    if (Array.isArray(d) && d[0]) {
      const inner = extractContent(d[0]);
      if (inner) return inner;
    }

    // 3) Anthropic 原生
    if (Array.isArray(json.content)) {
      return json.content.map((p) => p.text || '').join('').trim();
    }

    // 4) 最后兜底：整包找 text / message
    if (typeof json.text === 'string') return json.text.trim();
    if (typeof json.message === 'string') return json.message.trim();
    return '';
  }

  /**
   * 统一请求入口
   * @param {string} prompt
   * @param {(err:Error|null, text:string, raw:any)=>void} cb
   * @param {object} [overrides]
   */
  function callAPI(prompt, cb, overrides) {
    const endpoint = normalizeEndpoint((overrides && overrides.baseUrl) || settings.baseUrl);
    if (!endpoint) {
      cb(new Error('未配置 API 地址'), '', null);
      return;
    }
    const body = buildBody(prompt, overrides);
    const started = Date.now();
    log('请求', endpoint, body.model);

    GM_xmlhttpRequest({
      method: 'POST',
      url: endpoint,
      headers: buildHeaders(),
      data: JSON.stringify(body),
      timeout: 60000,
      onload(res) {
        const cost = Date.now() - started;
        let json = null;
        try { json = JSON.parse(res.responseText); } catch (e) { /* non-json */ }

        if (res.status < 200 || res.status >= 300) {
          const detail = (json && (json.error?.message || json.message || json.msg)) || String(res.responseText || '').slice(0, 300);
          cb(new Error('HTTP ' + res.status + ' · ' + detail), '', json);
          return;
        }
        if (!json) {
          cb(new Error('响应不是合法 JSON：' + String(res.responseText).slice(0, 200)), '', null);
          return;
        }
        const text = extractContent(json);
        if (!text) {
          cb(new Error('响应中没有可解析的文本'), '', json);
          return;
        }
        log('响应用时 ' + cost + 'ms', text.slice(0, 200));
        cb(null, text, json);
      },
      onerror(res) {
        cb(new Error(buildNetworkHint(endpoint)), '', null);
      },
      ontimeout() { cb(new Error('请求超时（60s）· ' + endpoint + '\n模型可能太慢或中转站排队，可换更快的小模型'), '', null); },
      onabort() { cb(new Error('请求被中止'), '', null); },
    });
  }

  /** 网络层失败时给出可执行的排查提示，而不是干巴巴一句“网络错误” */
  function buildNetworkHint(endpoint) {
    const hints = ['网络错误 · 请求没到达服务端：' + endpoint];
    let u;
    try { u = new URL(endpoint); } catch (e) { return hints.join('\n'); }

    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(u.hostname);
    if (isLocal) {
      hints.push('');
      hints.push('本地地址，最常见的三类原因：');
      hints.push('1) 端口填错 / 服务没启动 —— 先确认该端口正在监听');
      hints.push('2) 反代只监听 127.0.0.1 但端口不对');
      hints.push('3) 服务要求 https 而这里用了 http');
      hints.push('');
      hints.push('排查：浏览器打开 ' + u.origin + '/v1/models 看是否返回 JSON');
      hints.push('（返回 401 说明服务活着，只是缺 Key，属于正常）');
    } else {
      hints.push('');
      hints.push('非本地地址：检查域名拼写、是否需科学上网、服务器是否放行该 IP');
    }

    if (location.protocol === 'https:' && u.protocol === 'http:' && !isLocal) {
      hints.push('');
      hints.push('⚠ 页面是 HTTPS，接口是 HTTP，浏览器会当混合内容拦截');
    }
    return hints.join('\n');
  }

  /**
   * 逐步诊断：地址归一化 → 是否监听 → 鉴权 → 模型是否可用
   * 返回一段人类可读的报告
   */
  function diagnose(cb) {
    const raw = settings.baseUrl;
    const endpoint = normalizeEndpoint(raw);
    const lines = [];
    lines.push('【1】地址归一化');
    lines.push('  填写：' + (raw || '(空)'));
    lines.push('  实际：' + (endpoint || '(空)'));
    if (!endpoint) {
      lines.push('  ✗ 地址为空，先填 API 地址');
      cb(lines.join('\n'));
      return;
    }

    let u;
    try { u = new URL(endpoint); } catch (e) {
      lines.push('  ✗ 地址不合法');
      cb(lines.join('\n'));
      return;
    }
    const base = u.origin;
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(u.hostname);
    lines.push('  协议：' + u.protocol + (location.protocol === 'https:' && u.protocol === 'http:' && !isLocal
      ? '  ⚠ 与页面 HTTPS 混用，可能被拦截' : '  ok'));

    lines.push('');
    lines.push('【2】探测服务是否在线（GET ' + base + '/v1/models）');
    // 流程：probeModels 直接调用一次 → 其回调走 next() → step=1 进入 probeChat
    //                                                    → 其回调再走 next() → step=2 输出报告
    let step = 0;
    const next = () => {
      step += 1;
      if (step === 1) probeChat();
      else cb(lines.join('\n'));
    };

    function probeModels() {
      GM_xmlhttpRequest({
        method: 'GET',
        url: base + '/v1/models',
        headers: buildHeaders(),
        timeout: 10000,
        onload(res) {
          if (res.status === 401 || res.status === 403) {
            lines.push('  ✓ 端口有人监听（HTTP ' + res.status + ' = 服务活着，只是鉴权未通过）');
            lines.push('    如果下面第 3 步也 401，说明 Key 不对或鉴权头不匹配');
          } else if (res.status >= 200 && res.status < 300) {
            lines.push('  ✓ 服务正常（HTTP ' + res.status + '）');
            try {
              const j = JSON.parse(res.responseText);
              const ids = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
              if (ids.length) {
                lines.push('  可用模型（前 12 个）：' + ids.slice(0, 12).join(', '));
                if (settings.model && !ids.includes(settings.model)) {
                  lines.push('  ⚠ 你填的模型「' + settings.model + '」不在列表里，可能是名字写错');
                }
              }
            } catch (e) { /* 非标准 */ }
          } else if (res.status === 404) {
            lines.push('  ⚠ 端口有人监听，但没有 /v1/models（HTTP 404）');
            lines.push('    可能是别的服务，或反代路径不是 /v1');
          } else {
            lines.push('  ⚠ 意外状态 HTTP ' + res.status);
          }
          next();
        },
        onerror() {
          lines.push('  ✗ 连不上：端口没人监听 / 服务没启动 / 被防火墙拦截');
          lines.push('    这条基本就是「网络错误」的直接原因');
          next();
        },
        ontimeout() { lines.push('  ✗ 探测超时'); next(); },
      });
    }

    function probeChat() {
      lines.push('');
      lines.push('【3】真实对话请求（POST ' + endpoint + '，model=' + settings.model + '）');
      const body = buildBody('只回复两个字：正常', { maxTokens: 32, temperature: 0 });
      GM_xmlhttpRequest({
        method: 'POST',
        url: endpoint,
        headers: buildHeaders(),
        data: JSON.stringify(body),
        timeout: 45000,
        onload(res) {
          if (res.status >= 200 && res.status < 300) {
            let text = '';
            try { text = extractContent(JSON.parse(res.responseText)); } catch (e) { /* ignore */ }
            lines.push('  ✓ 成功，模型回复：' + (text || '(空)'));
          } else {
            let detail = '';
            try {
              const j = JSON.parse(res.responseText);
              detail = j?.error?.message || j?.message || j?.msg || '';
            } catch (e) { detail = String(res.responseText || '').slice(0, 200); }
            lines.push('  ✗ HTTP ' + res.status + ' · ' + detail);
            if (res.status === 401) lines.push('    → Key 错误，或中转站要求自定义鉴权头（用「额外请求头 JSON」填 x-api-key 等）');
            if (res.status === 404) lines.push('    → 路径不对，试试只填 ' + base + ' 让脚本自动补 /v1/chat/completions');
            if (res.status === 400) lines.push('    → 多半是模型名不存在，对照第 2 步列出的可用模型');
            if (res.status === 429) lines.push('    → 限流或额度耗尽');
          }
          next();
        },
        onerror() {
          lines.push('  ✗ 连不上（同第 2 步原因）');
          next();
        },
        ontimeout() { lines.push('  ✗ 超时，模型可能太慢'); next(); },
      });
    }

    probeModels();
  }

  /* =========================================================================
   *  2. 题目解析 —— 把当前页面上的题目结构化成对象
   * ========================================================================= */

  const MODAL_SELECTORS = [
    '.el-dialog__wrapper:not([style*="display: none"]) .el-dialog',
    '.el-dialog',
    '[role="dialog"]',
    '[class*="problem-panel"]',
    '[class*="quiz-panel"]',
    '[class*="question-box"]',
    '[class*="modal"][class*="problem"]',
  ];

  const OPTION_SELECTORS = [
    '.option-item',
    '.el-radio',
    '.el-checkbox',
    '[class*="option-item"]',
    '[class*="optionItem"]',
    '[class*="answer-item"]',
    'li[class*="option"]',
    '[role="radio"]',
    '[role="checkbox"]',
  ];

  const SUBMIT_TEXT = /^(提\s*交|提交答案|提交本题|确认|确定|确 定|提交作答|Submit)$/i;

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    return el.getClientRects().length > 0;
  }

  function pickVisibleModal() {
    for (const sel of MODAL_SELECTORS) {
      const nodes = document.querySelectorAll(sel);
      for (const n of nodes) {
        if (isVisible(n) && (n.innerText || '').trim().length > 6) return n;
      }
    }
    return null;
  }

  /** 提取题目文本 */
  function extractQuestionText(modal) {
    const prefer = [
      '.problem-body', '.problem-title', '.question-title', '.question-body',
      '[class*="problemContent"]', '[class*="problem-content"]',
      '[class*="stem"]', '[class*="title"]', '.rich-text', '.ql-editor',
    ];
    let best = '';
    for (const sel of prefer) {
      const el = modal.querySelector(sel);
      if (el && isVisible(el)) {
        const t = (el.innerText || '').trim();
        if (t.length > best.length) best = t;
      }
    }
    if (best.length >= 4) return best.slice(0, 1500);

    // 兜底：整块文本，去掉选项行
    const clone = modal.cloneNode(true);
    clone.querySelectorAll(OPTION_SELECTORS.join(',') + ',button,[role="button"]').forEach((n) => n.remove());
    const t = (clone.innerText || '').trim();
    return t.slice(0, 1500);
  }

  /** 提取选项： [{key:'A', text:'...', el}...] */
  function extractOptions(modal) {
    const out = [];
    const seen = new Set();
    for (const sel of OPTION_SELECTORS) {
      const nodes = modal.querySelectorAll(sel);
      for (const el of nodes) {
        if (!isVisible(el)) continue;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 400) continue;
        const key = t.slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        const m = t.match(/^([A-Za-z])\s*[\.、:：)）]/);
        out.push({
          el,
          letter: m ? m[1].toUpperCase() : String.fromCharCode(65 + out.length),
          text: t,
        });
      }
      if (out.length >= 2) break; // 找到一组合适的就停
    }
    return out.slice(0, 10);
  }

  /** 题型粗判 */
  function guessType(questionText, options) {
    if (/判断|正确|错误|对错/.test(questionText) && options.length <= 3) return 'judge';
    if (/多选|不定项|至少两项|多项选择/.test(questionText)) return 'multi';
    if (options.length === 0) return 'blank';
    if (options.length >= 2) return 'single';
    return 'text';
  }

  /* =========================================================================
   *  3. Prompt 构造与答案解析
   * ========================================================================= */

  function buildPrompt(q) {
    const lines = [];
    lines.push('下面是一道课堂实时考题，请直接给出正确答案。');
    lines.push('');
    lines.push('【题目】');
    lines.push(q.text);
    lines.push('');
    if (q.options.length) {
      lines.push('【选项】');
      q.options.forEach((o) => lines.push(o.letter + '. ' + o.text.replace(/^[A-Za-z]\s*[\.、:：)）]?\s*/, '')));
      lines.push('');
    }
    lines.push('【题型】' + ({ single: '单选题', multi: '多选题', judge: '判断题', blank: '填空题', text: '主观题' }[q.type] || '未知'));
    lines.push('');
    lines.push('【输出格式】只输出一个 JSON，不要任何解释、不要 markdown 代码块：');
    if (q.type === 'blank') {
      lines.push('{"answers":["第一个空的答案","第二个空的答案"]}');
    } else if (q.type === 'text') {
      lines.push('{"answer":"不超过 80 字的简答"}');
    } else {
      lines.push('{"answers":["A"]}   // 多选题写成 ["A","C"]');
    }
    return lines.join('\n');
  }

  /** 从模型输出里稳健地取出答案 */
  function parseAnswer(text, q) {
    const raw = String(text || '').trim();
    let obj = null;

    // 去掉 ```json ``` 包裹
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { obj = JSON.parse(m[0]); } catch (e) { /* ignore */ }
    }

    if (obj) {
      if (Array.isArray(obj.answers)) {
        return { kind: 'choice', value: obj.answers.map((x) => String(x).trim().toUpperCase().replace(/[^A-Z]/g, '')).filter(Boolean) };
      }
      if (typeof obj.answer === 'string') {
        const a = obj.answer.trim();
        if (q.type === 'blank' || q.type === 'text') return { kind: 'text', value: a };
        const letters = a.toUpperCase().match(/[A-Z]/g) || [];
        if (letters.length) return { kind: 'choice', value: letters };
        return { kind: 'text', value: a };
      }
    }

    // 兜底 1：纯选择题 —— 直接找字母
    if (q.type !== 'blank' && q.type !== 'text') {
      const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
      if (letters.length) return { kind: 'choice', value: letters.split('').slice(0, q.options.length || 4) };
    }

    // 兜底 2：判断题语义判断
    if (q.type === 'judge') {
      if (/正确|对|true|yes/i.test(raw)) return { kind: 'judge', value: true };
      if (/错误|错|false|no/i.test(raw)) return { kind: 'judge', value: false };
    }

    return { kind: 'text', value: raw.slice(0, 200) };
  }

  /* =========================================================================
   *  4. 页面操作层 —— 勾选 / 填空 / 提交
   * ========================================================================= */

  function fireMouse(el) {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
      try {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      } catch (e) { /* ignore */ }
    });
    try { el.click(); } catch (e) { /* ignore */ }
  }

  function clickOptionByLetter(modal, letter) {
    const opts = extractOptions(modal);
    const target = opts.find((o) => o.letter === letter) || opts.find((o) => o.text.toUpperCase().startsWith(letter));
    if (!target) {
      warn('未找到选项', letter, '可用：', opts.map((o) => o.letter).join(','));
      return false;
    }
    // 若已选中则跳过（多选场景避免反选）
    const checked =
      target.el.classList.contains('is-checked') ||
      target.el.classList.contains('checked') ||
      target.el.classList.contains('active') ||
      target.el.querySelector('input:checked');
    if (checked) {
      log('选项', letter, '已是选中态');
      return true;
    }
    fireMouse(target.el);
    const input = target.el.querySelector('input[type="radio"],input[type="checkbox"]');
    if (input && !input.checked) fireMouse(input);
    return true;
  }

  function clickJudge(modal, value) {
    const opts = extractOptions(modal);
    const want = value ? /正确|对|√|true|是/i : /错误|错|×|false|否/i;
    for (const o of opts) {
      if (want.test(o.text)) { fireMouse(o.el); return true; }
    }
    return false;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    ['input', 'change', 'blur', 'keyup'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
  }

  function fillBlanks(modal, answers) {
    const inputs = Array.from(modal.querySelectorAll('input[type="text"], textarea, .ql-editor[contenteditable]'))
      .filter((el) => isVisible(el) && !el.disabled && !el.readOnly);
    if (!inputs.length) return false;
    inputs.forEach((el, i) => {
      const val = answers[i] !== undefined ? answers[i] : answers[answers.length - 1] || '';
      if (!val) return;
      if (el.getAttribute('contenteditable') === 'true') {
        el.innerText = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        setNativeValue(el, val);
      }
    });
    return true;
  }

  function clickSubmit(modal) {
    const candidates = Array.from(modal.querySelectorAll('button,[role="button"],.btn,span[class*="btn"]'));
    const btn = candidates.find((b) => {
      const t = (b.innerText || '').trim();
      return SUBMIT_TEXT.test(t) && isVisible(b) && !b.disabled && !b.classList.contains('is-disabled');
    });
    if (!btn) {
      warn('未找到可点击的提交按钮');
      return false;
    }
    fireMouse(btn);
    return true;
  }

  /* =========================================================================
   *  5. 主流程
   * ========================================================================= */

  const state = {
    processing: new Set(),   // 已处理过的题目指纹
    lastFingerprint: '',
    busy: false,
    solvedCount: 0,
    lastAnswer: '',
    lastError: '',
    status: '待命',
    panel: null,
  };

  function fingerprintOf(q) {
    const base = (q.text || '').replace(/\s+/g, '') + '|' + q.options.map((o) => o.text.replace(/\s+/g, '')).join('|');
    let h = 5381;
    for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) & 0x7fffffff;
    return 'q' + h;
  }

  function setStatus(text, tone) {
    state.status = text;
    const box = document.getElementById('yktai-status');
    if (box) {
      box.textContent = text;
      box.style.color = tone === 'ok' ? '#86efac' : tone === 'err' ? '#fca5a5' : tone === 'warn' ? '#fde047' : '#cbd5e1';
    }
  }

  function setAnswerBox(text) {
    const box = document.getElementById('yktai-answer');
    if (box) {
      box.textContent = text || '';
      box.hidden = !text;
    }
  }

  async function handleQuestion(modal, triggerSource) {
    if (!settings.autoSolve || state.busy) return;

    const text = extractQuestionText(modal);
    if (!text || text.length < 4) return;

    const options = extractOptions(modal);
    const q = { text, options, type: guessType(text, options) };
    const fp = fingerprintOf(q);
    if (state.processing.has(fp)) {
      log('本题已处理，跳过', fp);
      return;
    }

    state.busy = true;
    state.processing.add(fp);
    state.lastFingerprint = fp;
    setStatus('已捕获题目（' + (triggerSource || 'DOM') + '），请求 AI…', 'warn');
    log('题目解析结果', q);

    const prompt = buildPrompt(q);

    callAPI(prompt, (err, answerText) => {
      if (err) {
        state.busy = false;
        state.lastError = err.message;
        setStatus('AI 请求失败：' + err.message.split('\n')[0], 'err');
        setAnswerBox(err.message + '\n\n可点「🩺 诊断」逐项排查。');
        return;
      }

      const parsed = parseAnswer(answerText, q);
      const display = parsed.kind === 'choice' ? '答案：' + parsed.value.join('') : '答案：' + parsed.value;
      state.lastAnswer = display;
      setAnswerBox(display + '\n\n原始输出：\n' + answerText.slice(0, 500));

      if (!settings.autoSubmit) {
        state.busy = false;
        setStatus('已给出参考答案（未开启自动提交）', 'ok');
        notify('雨课堂随堂题', display);
        return;
      }

      const delay = settings.humanDelay
        ? Math.round((Math.random() * (Number(settings.maxDelay) - Number(settings.minDelay)) + Number(settings.minDelay)) * 1000)
        : 0;
      setStatus('AI 已作答，' + (delay / 1000).toFixed(1) + ' 秒后自动提交…', 'warn');

      setTimeout(() => {
        try {
          // 重新抓一次 DOM（弹窗可能已重渲染）
          const m2 = pickVisibleModal() || modal;
          let ok = false;

          if (parsed.kind === 'choice') {
            parsed.value.forEach((letter) => { if (clickOptionByLetter(m2, letter)) ok = true; });
          } else if (parsed.kind === 'judge') {
            ok = clickJudge(m2, parsed.value);
          } else if (settings.autoFillBlank) {
            const arr = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
            ok = fillBlanks(m2, arr);
          }

          if (!ok) {
            setStatus('答案已生成，但页面上没找到可操作的控件，请手动作答', 'warn');
            notify('雨课堂随堂题（需手动）', display);
            state.busy = false;
            return;
          }

          setTimeout(() => {
            const submitted = clickSubmit(m2);
            state.busy = false;
            state.solvedCount += 1;
            if (submitted) {
              setStatus('✅ 已自动提交（累计 ' + state.solvedCount + ' 题）', 'ok');
              notify('雨课堂随堂题已提交', display);
            } else {
              setStatus('已勾选答案，但提交按钮未找到，请手动点提交', 'warn');
            }
            renderPanelStats();
          }, Number(settings.clickBeforeSubmit) || 400);
        } catch (e) {
          state.busy = false;
          warn('自动作答异常', e);
          setStatus('自动作答异常：' + e.message, 'err');
        }
      }, delay);
    });
  }

  /* =========================================================================
   *  6. 触发通道：WebSocket Hook + Fetch Hook + DOM 轮询
   * ========================================================================= */

  const PROBLEM_OPS = ['unlockproblem', 'sendproblem', 'publishproblem', 'showproblem', 'problem'];

  function hookWebSocket() {
    const RealWS = window.WebSocket;
    if (!RealWS || window.__YKT_AI_WS__) return;
    try {
      const ProxyWS = new Proxy(RealWS, {
        construct(target, args, newTarget) {
          const ws = Reflect.construct(target, args, newTarget);
          ws.addEventListener('message', (ev) => {
            const data = ev.data;
            if (typeof data === 'string') inspectWsPayload(data);
            else if (data && typeof data.text === 'function') data.text().then(inspectWsPayload).catch(() => {});
            else if (data instanceof ArrayBuffer) {
              try { inspectWsPayload(new TextDecoder().decode(data)); } catch (e) { /* ignore */ }
            }
          });
          return ws;
        },
      });
      window.WebSocket = ProxyWS;
      window.__YKT_AI_WS__ = true;
      log('WebSocket Hook 已安装');
    } catch (e) {
      warn('WebSocket Hook 安装失败', e);
    }
  }

  function inspectWsPayload(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    const op = String(msg.op || msg.type || (msg.data && (msg.data.op || msg.data.type)) || '').toLowerCase();
    const hitDirect = PROBLEM_OPS.some((k) => op.includes(k));
    const hitNested = !!(msg.problem || (msg.data && msg.data.problem) || msg.unlockedproblem);
    if (hitDirect || hitNested) {
      log('WebSocket 命中发题事件:', op, msg);
      // 等前端把弹窗渲染出来
      setTimeout(() => {
        const modal = pickVisibleModal();
        if (modal) handleQuestion(modal, 'WebSocket');
        else log('收到发题事件但弹窗尚未渲染，交给 DOM 轮询');
      }, 800);
    }
  }

  function hookFetch() {
    const realFetch = window.fetch;
    if (typeof realFetch !== 'function' || window.__YKT_AI_FETCH__) return;
    try {
      window.fetch = new Proxy(realFetch, {
        apply(target, thisArg, args) {
          const result = Reflect.apply(target, thisArg, args);
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          if (/problem|quiz|exercise|presentation\/fetch/i.test(url)) {
            result.then((res) => res.clone().json().catch(() => null)).then((data) => {
              if (!data) return;
              const s = JSON.stringify(data);
              if (/"problemType"|"problemId"|"body"\s*:/.test(s)) {
                log('Fetch 命中题目接口:', url);
                setTimeout(() => {
                  const modal = pickVisibleModal();
                  if (modal) handleQuestion(modal, 'Fetch');
                }, 600);
              }
            }).catch(() => {});
          }
          return result;
        },
      });
      window.__YKT_AI_FETCH__ = true;
      log('Fetch Hook 已安装');
    } catch (e) {
      warn('Fetch Hook 安装失败', e);
    }
  }

  function startDomWatcher() {
    let timer = null;
    const tick = () => {
      if (!settings.autoSolve || state.busy) return;
      const modal = pickVisibleModal();
      if (!modal) return;
      const txt = extractQuestionText(modal);
      if (!txt || txt.length < 4) return;
      // 有选项 或 有填空输入框，才算是一道待答的题
      const hasOptions = extractOptions(modal).length >= 2;
      const hasBlank = modal.querySelector('input[type="text"],textarea,[contenteditable="true"]');
      if (!hasOptions && !hasBlank) return;
      handleQuestion(modal, 'DOM');
    };

    const debounce = () => {
      clearTimeout(timer);
      timer = setTimeout(tick, 700);
    };

    try {
      new MutationObserver(debounce).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
    setInterval(tick, 3000);
    log('DOM 轮询已启动');
  }

  /* =========================================================================
   *  7. 通知
   * ========================================================================= */

  function notify(title, body) {
    try {
      if (typeof GM_notification === 'function') {
        GM_notification({ title, text: body, timeout: 8000 });
        return;
      }
    } catch (e) { /* ignore */ }
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch (e) { /* ignore */ }
  }

  /* =========================================================================
   *  8. 设置面板
   * ========================================================================= */

  const CSS = `
#yktai-panel{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:320px;
  font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  color:#e2e8f0;background:linear-gradient(160deg,#0f172a,#1e293b);
  border:1px solid rgba(148,163,184,.28);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.5);
  user-select:none;overflow:hidden}
#yktai-panel *{box-sizing:border-box}
#yktai-panel .hd{display:flex;align-items:center;justify-content:space-between;
  padding:10px 12px;cursor:move;background:rgba(255,255,255,.04);font-weight:700;font-size:13px}
#yktai-panel .hd .dot{width:8px;height:8px;border-radius:50%;background:#4ade80;margin-right:7px;
  display:inline-block;box-shadow:0 0 8px #4ade80}
#yktai-panel .bd{padding:10px 12px 12px;max-height:74vh;overflow:auto}
#yktai-panel .bd.hide{display:none}
#yktai-panel label{display:block;margin:8px 0 3px;font-size:11px;color:#94a3b8}
#yktai-panel input[type=text],#yktai-panel input[type=password],#yktai-panel input[type=number],
#yktai-panel textarea,#yktai-panel select{
  width:100%;padding:6px 8px;border-radius:7px;border:1px solid rgba(148,163,184,.35);
  background:rgba(15,23,42,.9);color:#e2e8f0;font:inherit;font-size:12px;user-select:text}
#yktai-panel textarea{resize:vertical;min-height:42px;font-family:ui-monospace,Consolas,monospace}
#yktai-panel .row{display:flex;gap:8px}
#yktai-panel .row>*{flex:1}
#yktai-panel .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
#yktai-panel button{padding:6px 10px;border-radius:7px;border:1px solid rgba(148,163,184,.4);
  background:rgba(255,255,255,.06);color:#e2e8f0;font:inherit;font-size:12px;cursor:pointer}
#yktai-panel button:hover{background:rgba(74,222,128,.18)}
#yktai-panel button.on{background:rgba(74,222,128,.28);border-color:rgba(74,222,128,.6)}
#yktai-panel button:disabled{opacity:.45;cursor:not-allowed}
#yktai-status{margin-top:8px;font-size:11px;color:#cbd5e1;word-break:break-all}
#yktai-answer{margin-top:8px;padding:8px;border-radius:8px;background:rgba(0,0,0,.35);
  font-size:11px;color:#a5f3fc;white-space:pre-wrap;word-break:break-word;max-height:170px;overflow:auto;user-select:text}
#yktai-stats{margin-top:6px;font-size:11px;color:#64748b}
.acc{border-top:1px dashed rgba(148,163,184,.25);margin-top:10px;padding-top:8px}
.acc summary{cursor:pointer;font-size:11px;color:#94a3b8;outline:none}
.acc[open] summary{color:#a5f3fc}
`;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function renderPanelStats() {
    const s = document.getElementById('yktai-stats');
    if (!s) return;
    s.textContent = '已解题 ' + state.solvedCount + ' 题 · 接口 ' + shorten((settings.baseUrl || ''), 34);
  }

  function shorten(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function renderPanel() {
    const panel = document.getElementById('yktai-panel');
    if (!panel) return;
    const bd = panel.querySelector('.bd');
    const scrollTop = bd ? bd.scrollTop : 0;

    // 重新渲染避免控件状态与 settings 脱节
    bd.innerHTML = '';

    // —— 服务商预设 ——
    const provSel = el('select', { id: 'yktai-provider' });
    Object.keys(PRESETS).forEach((k) => {
      const o = el('option', { value: k, text: PRESETS[k].label });
      if (k === settings.provider) o.selected = true;
      provSel.appendChild(o);
    });
    provSel.addEventListener('change', () => {
      const p = PRESETS[provSel.value];
      settings.provider = provSel.value;
      GM_setValue(SK + 'provider', provSel.value);
      if (p) {
        // 选「自定义 / 中转站」时保留用户已填的地址，避免被示例地址覆盖
        if (provSel.value !== 'custom') {
          saveSetting('baseUrl', p.baseUrl);
          saveSetting('model', p.model);
        } else if (!settings.baseUrl || /your-relay\.example\.com/.test(settings.baseUrl)) {
          saveSetting('baseUrl', '');
        }
      }
      renderPanel();
    });
    bd.appendChild(el('label', { text: '服务商 / 接口类型' }));
    bd.appendChild(provSel);

    // —— Base URL ——
    bd.appendChild(el('label', { text: 'API 地址（OpenAI 兼容，可填中转站）' }));
    const urlInput = el('input', { type: 'text', value: settings.baseUrl, placeholder: 'https://xxx.com/v1/chat/completions' });
    urlInput.addEventListener('change', () => saveSetting('baseUrl', urlInput.value.trim()));
    bd.appendChild(urlInput);

    // —— API Key ——
    bd.appendChild(el('label', { text: 'API Key' }));
    const keyInput = el('input', { type: 'password', value: settings.apiKey, placeholder: 'sk-...' });
    keyInput.addEventListener('change', () => saveSetting('apiKey', keyInput.value.trim()));
    bd.appendChild(keyInput);

    // —— Model ——
    bd.appendChild(el('label', { text: '模型名' }));
    const modelInput = el('input', { type: 'text', value: settings.model, placeholder: 'deepseek-chat' });
    modelInput.addEventListener('change', () => saveSetting('model', modelInput.value.trim()));
    bd.appendChild(modelInput);
    const presetModels = (PRESETS[settings.provider] || {}).models || [];
    if (presetModels.length) {
      const chips = el('div', { class: 'btns' });
      presetModels.forEach((m) => {
        chips.appendChild(el('button', {
          text: m.length > 18 ? m.slice(0, 17) + '…' : m,
          title: m,
          onclick: () => { saveSetting('model', m); renderPanel(); },
        }));
      });
      bd.appendChild(chips);
    }

    // —— 行为开关 ——
    bd.appendChild(el('label', { text: '行为' }));
    const btns = el('div', { class: 'btns' });
    const mkToggle = (key, label) => el('button', {
      class: settings[key] ? 'on' : '',
      text: (settings[key] ? '✓ ' : '✗ ') + label,
      onclick: () => { saveSetting(key, !settings[key]); renderPanel(); },
    });
    btns.appendChild(mkToggle('autoSolve', '自动解题'));
    btns.appendChild(mkToggle('autoSubmit', '自动提交'));
    btns.appendChild(mkToggle('autoFillBlank', '填填空'));
    btns.appendChild(mkToggle('humanDelay', '随机延时'));
    btns.appendChild(mkToggle('debug', '调试日志'));
    bd.appendChild(btns);

    // —— 延时范围 ——
    const delayRow = el('div', { class: 'row' });
    const minI = el('input', { type: 'number', min: '0', max: '60', step: '1', value: settings.minDelay });
    const maxI = el('input', { type: 'number', min: '0', max: '120', step: '1', value: settings.maxDelay });
    minI.addEventListener('change', () => saveSetting('minDelay', Number(minI.value) || 0));
    maxI.addEventListener('change', () => saveSetting('maxDelay', Number(maxI.value) || 0));
    delayRow.appendChild(minI);
    delayRow.appendChild(maxI);
    bd.appendChild(el('label', { text: '提交前随机延时（秒）：最小 / 最大' }));
    bd.appendChild(delayRow);

    // —— 高级参数折叠区 ——
    const acc = el('details', { class: 'acc' });
    acc.appendChild(el('summary', { text: '高级参数（温度 / 额外头 / 额外字段）' }));

    acc.appendChild(el('label', { text: 'temperature' }));
    const tempI = el('input', { type: 'number', min: '0', max: '2', step: '0.1', value: settings.temperature });
    tempI.addEventListener('change', () => saveSetting('temperature', Number(tempI.value)));
    acc.appendChild(tempI);

    acc.appendChild(el('label', { text: 'max_tokens' }));
    const mtI = el('input', { type: 'number', min: '1', max: '8192', step: '1', value: settings.maxTokens });
    mtI.addEventListener('change', () => saveSetting('maxTokens', Number(mtI.value)));
    acc.appendChild(mtI);

    acc.appendChild(el('label', { text: '额外请求头 JSON（中转站鉴权/标识用）' }));
    const hdrT = el('textarea', { placeholder: '{"X-Title":"yuketang"}' });
    hdrT.value = settings.extraHeaders || '';
    hdrT.addEventListener('change', () => saveSetting('extraHeaders', hdrT.value.trim()));
    acc.appendChild(hdrT);

    acc.appendChild(el('label', { text: '额外请求体 JSON（合并进 body）' }));
    const bodyT = el('textarea', { placeholder: '{"top_p":0.9}' });
    bodyT.value = settings.extraBody || '';
    bodyT.addEventListener('change', () => saveSetting('extraBody', bodyT.value.trim()));
    acc.appendChild(bodyT);

    bd.appendChild(acc);

    // —— 状态 / 答案 / 统计 ——
    bd.appendChild(el('div', { id: 'yktai-status', text: state.status }));
    const ansBox = el('div', { id: 'yktai-answer' });
    ansBox.hidden = !state.lastAnswer;
    ansBox.textContent = state.lastAnswer;
    bd.appendChild(ansBox);
    bd.appendChild(el('div', { id: 'yktai-stats' }));

    // —— 操作按钮 ——
    const ops = el('div', { class: 'btns' });
    ops.appendChild(el('button', {
      text: '🩺 诊断',
      title: '依次检查：地址归一化 / 端口是否在线 / 模型列表 / 真实对话',
      onclick: () => runDiagnose(),
    }));
    ops.appendChild(el('button', {
      text: '🔌 测试接口',
      onclick: (e) => testConnection(e.target),
    }));
    ops.appendChild(el('button', {
      text: '🧪 解析当前题',
      onclick: () => {
        const m = pickVisibleModal();
        if (!m) { setStatus('页面上没检测到题目弹窗', 'warn'); return; }
        state.processing.clear();
        handleQuestion(m, '手动');
      },
    }));
    ops.appendChild(el('button', {
      text: '♻️ 清空记录',
      onclick: () => { state.processing.clear(); state.solvedCount = 0; setStatus('已清空处理记录'); renderPanelStats(); },
    }));
    bd.appendChild(ops);

    bd.scrollTop = scrollTop;
    renderPanelStats();
    setStatus(state.status);
    setAnswerBox(state.lastAnswer);
  }

  function runDiagnose() {
    setStatus('诊断中，请稍候…', 'warn');
    setAnswerBox('正在逐项检查接口…');
    diagnose((report) => {
      state.lastAnswer = report;
      setAnswerBox(report);
      const bad = report.includes('✗');
      setStatus(bad ? '诊断完成：发现问题，见下方报告' : '诊断完成：接口可用', bad ? 'err' : 'ok');
    });
  }

  function testConnection(btn) {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '测试中…';
    setStatus('正在测试接口连通性…', 'warn');
    callAPI('只回复两个字：正常', (err, text) => {
      btn.disabled = false;
      btn.textContent = old;
      if (err) {
        setStatus('❌ 接口异常：' + err.message, 'err');
      } else {
        setStatus('✅ 接口正常，模型回复：' + shorten(text, 40), 'ok');
      }
      renderPanel();
    }, { maxTokens: 32, temperature: 0 });
  }

  function buildPanel() {
    if (document.getElementById('yktai-panel')) return;
    const style = el('style', { text: CSS });
    document.documentElement.appendChild(style);

    const panel = el('div', { id: 'yktai-panel' });
    const hd = el('div', { class: 'hd' });
    hd.innerHTML = '<span><span class="dot"></span>雨课堂 AI 助手 v' + VERSION + '</span>';
    const minBtn = el('button', { text: '—', title: '折叠', style: 'padding:2px 8px' });
    minBtn.addEventListener('click', () => {
      const bd = panel.querySelector('.bd');
      bd.classList.toggle('hide');
      minBtn.textContent = bd.classList.contains('hide') ? '+' : '—';
    });
    hd.appendChild(minBtn);

    const bd = el('div', { class: 'bd' });
    panel.appendChild(hd);
    panel.appendChild(bd);

    // 拖拽
    let drag = null;
    hd.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      hd.setPointerCapture(e.pointerId);
    });
    hd.addEventListener('pointermove', (e) => {
      if (!drag) return;
      panel.style.left = Math.max(0, e.clientX - drag.x) + 'px';
      panel.style.top = Math.max(0, e.clientY - drag.y) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    hd.addEventListener('pointerup', () => { drag = null; });

    document.body.appendChild(panel);
    state.panel = panel;
    renderPanel();
    log('面板已创建');
  }

  /* =========================================================================
   *  9. 启动
   * ========================================================================= */

  hookWebSocket();
  hookFetch();

  function boot() {
    buildPanel();
    startDomWatcher();
    try {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('打开设置面板', () => {
          const p = document.getElementById('yktai-panel');
          if (p) p.querySelector('.bd').classList.remove('hide');
        });
        GM_registerMenuCommand('测试接口连通性', () => {
          const b = document.createElement('button');
          testConnection(b);
        });
        GM_registerMenuCommand('切换调试日志', () => { saveSetting('debug', !settings.debug); renderPanel(); });
      }
    } catch (e) { /* ignore */ }

    console.log('%c[雨课堂AI] v' + VERSION + ' 已启动 · 接口：' + settings.baseUrl, 'color:#4ade80;font-weight:700');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
