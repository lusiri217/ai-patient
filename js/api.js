/* ============================================================
   api.js — 统一 AI 调用适配层
   所有端口的 AI 能力都必须经过本模块，读取管理端配置：
     - 无 Key / 已停止 / 演示模式  -> 回退 mock（演示模式）
     - token 超限 / 硬阻止         -> 阻止真实请求并给出原因
     - 否则                         -> 真实调用（OpenAI 兼容接口）
   真实大模型接入点：callChat() 中的 fetch；替换 baseURL/model 即可。
   ============================================================ */

window.AIPS = window.AIPS || {};

AIPS.api = (function () {
  const util = AIPS.util;

  function config() {
    return AIPS.store.getConfig();
  }

  /* 决定当前调用模式与原因 */
  function status() {
    const cfg = config();
    const usage = AIPS.store.getTokenUsage();
    if (!cfg.apiEnabled) {
      return cfg.demoMode
        ? { mode: AIPS.API_MODE.DEMO, stopped: true, hasKey: false, reason: "管理员已停止 API 调用，当前为演示模式（模拟患者）" }
        : { mode: AIPS.API_MODE.BLOCKED, stopped: true, hasKey: false, reason: "管理员已停止 API 调用" };
    }
    if (!cfg.apiKey) {
      return cfg.demoMode
        ? { mode: AIPS.API_MODE.DEMO, stopped: false, hasKey: false, reason: "未配置 API Key，当前为演示模式（模拟患者）" }
        : { mode: AIPS.API_MODE.BLOCKED, stopped: false, hasKey: false, reason: "未配置 API Key，且演示模式已关闭，无法发起调用" };
    }
    if (usage.used + cfg.maxTokensPerCall > cfg.dailyTokenLimit) {
      return { mode: AIPS.API_MODE.BLOCKED, stopped: false, hasKey: true, reason: "今日 token 用量已达上限，调用被阻止" };
    }
    return { mode: AIPS.API_MODE.REAL, stopped: false, hasKey: true, reason: "" };
  }

  function isDemo() {
    const s = status();
    return s.mode === AIPS.API_MODE.DEMO;
  }

  /* 真实模型调用（OpenAI 兼容）。返回 {content, tokens} */
  async function callChat(messages, opts = {}) {
    const cfg = config();
    const s = status();
    if (s.mode !== AIPS.API_MODE.REAL) {
      throw new Error(s.reason || "当前不可发起真实调用");
    }
    const url = (cfg.baseURL || "").replace(/\/+$/, "") + "/chat/completions";
    const body = {
      model: cfg.model,
      temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
      max_tokens: opts.maxTokens != null ? opts.maxTokens : cfg.maxTokensPerCall,
      messages,
    };
    let res, data;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + cfg.apiKey,
        },
        body: JSON.stringify(body),
      });
      data = await res.json();
    } catch (e) {
      throw new Error("网络请求失败，请检查 Base URL 与网络：" + e.message);
    }
    if (!res.ok) {
      throw new Error("API 返回错误 " + res.status + "：" + (data?.error?.message || "未知错误"));
    }
    const content = data?.choices?.[0]?.message?.content || "";
    const tokens = data?.usage?.total_tokens || estimateTokens(JSON.stringify(messages) + content);
    AIPS.store.addTokenUsage(tokens);
    return { content, tokens };
  }

  function estimateTokens(str) {
    // 粗略估算（中英文混合约 2 字符/token）
    return Math.ceil((str || "").length / 2);
  }

  /* 在文本中按病例线索词包裹 [[word]]，保证点击查看功能在真实模式也生效 */
  function embedClues(text, caseObj) {
    if (!caseObj || !caseObj.clues) return text;
    let out = text;
    const used = new Set();
    caseObj.clues.forEach((cl) => {
      if (used.has(cl.word)) return;
      const idx = out.indexOf(cl.word);
      if (idx >= 0) {
        out = out.slice(0, idx) + "[[" + cl.word + "]]" + out.slice(idx + cl.word.length);
        used.add(cl.word);
      }
    });
    return out;
  }

  /* ---------- 高层封装 1：患者对话 ---------- */
  async function chatAsPatient(caseObj, conversation, isEnglish) {
    const s = status();
    if (s.mode !== AIPS.API_MODE.REAL) {
      // 演示模式：mock 生成
      const text = AIPS.mock.patientReply(caseObj, conversation, isEnglish);
      return { content: text, demo: true, reason: s.reason };
    }
    // 真实模式
    const cfg = config();
    const caseSummary = [
      "【病例设定，仅供你扮演参考，不要在回答中直接说出诊断】",
      "基本信息：" + JSON.stringify(caseObj.patient),
      "主诉：" + caseObj.chiefComplaint,
      "现病史：" + caseObj.presentIllness,
      "既往史：" + caseObj.pastHistory,
      "体格检查：" + caseObj.exam,
      "辅助检查：" + caseObj.auxExam,
      "关键线索（可在回答中用自然方式透露）：" + caseObj.clues.map((c) => c.word).join("、"),
    ].join("\n");

    const messages = [
      { role: "system", content: cfg.systemPrompt + "\n\n" + cfg.patientPrompt + "\n\n" + cfg.humanisticPrompt },
      { role: "system", content: "病例设定：\n" + caseSummary },
    ];
    conversation.forEach((m) => {
      messages.push({
        role: m.role === "doctor" ? "user" : "assistant",
        content: m.text,
      });
    });
    if (isEnglish) {
      messages[0].content += "\n本次请用英文回答，扮演不会中文的外国患者。";
    }
    const r = await callChat(messages, { maxTokens: cfg.maxTokensPerCall });
    r.content = embedClues(r.content, caseObj);
    r.demo = false;
    return r;
  }

  /* ---------- 高层封装 2：原始文本 -> 结构化病例 ---------- */
  async function generateCase(rawText, meta = {}) {
    const s = status();
    if (s.mode !== AIPS.API_MODE.REAL) {
      const c = AIPS.mock.buildStructuredCase(rawText, meta);
      return { case: c, demo: true, reason: s.reason };
    }
    const cfg = config();
    const schema = `请仅返回如下 JSON 结构（不要解释）：
{
 "title":"病例标题",
 "type":"病例类型",
 "patient":{"name":"【姓名】","age":"年龄","gender":"性别","others":"其他基本信息"},
 "chiefComplaint":"主诉",
 "presentIllness":"现病史",
 "pastHistory":"既往史",
 "exam":"体格检查",
 "auxExam":"辅助检查",
 "diagnosis":"诊断",
 "differential":"鉴别诊断",
 "clues":[{"word":"关键线索词","info":"对应临床信息"}],
 "knowledge":{"disease":"疾病要点","inquiry":"问诊要点","differential":"鉴别诊断","clinicalTip":"临床提示","humanistic":"人文关怀要点"},
 "quizzes":[ 4 道选择题(含stem/options数组/answer索引/analysis) 与 1 道简答题(stem/reference/keyPoints数组) ]
}`;
    const messages = [
      { role: "system", content: cfg.systemPrompt },
      {
        role: "user",
        content:
          "请将以下（已去隐私化）的病历资料转换为结构化病例，并按 JSON 输出：\n\n" +
          rawText +
          "\n\n" +
          schema,
      },
    ];
    const r = await callChat(messages, { maxTokens: cfg.maxTokensPerCall });
    try {
      const json = extractJSON(r.content);
      const c = Object.assign(AIPS.mock.buildStructuredCase(rawText, meta), json, {
        id: util.uid("case"),
        source: "hospital",
        reviewed: false,
        enabled: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      c.quizzes = json.quizzes && json.quizzes.length ? json.quizzes : AIPS.mock.generateQuiz(c);
      c.clues = json.clues && json.clues.length ? json.clues : c.clues;
      return { case: c, demo: false };
    } catch (e) {
      // 解析失败则回退 mock
      const c = AIPS.mock.buildStructuredCase(rawText, meta);
      return { case: c, demo: true, reason: "AI 返回格式异常，已回退演示模式生成" };
    }
  }

  function extractJSON(str) {
    const i = str.indexOf("{");
    const j = str.lastIndexOf("}");
    if (i < 0 || j < 0) throw new Error("no json");
    return JSON.parse(str.slice(i, j + 1));
  }

  /* ---------- 高层封装 3：针对病例出题 ---------- */
  async function generateQuiz(caseObj) {
    const s = status();
    if (s.mode !== AIPS.API_MODE.REAL) {
      return { quizzes: AIPS.mock.generateQuiz(caseObj), demo: true };
    }
    const cfg = config();
    const messages = [
      { role: "system", content: cfg.systemPrompt },
      {
        role: "user",
        content:
          "请基于以下病例出 4 道医学选择题（每题4选项、给出answer索引与analysis）和 1 道简答题（含reference与keyPoints数组），仅返回 JSON 数组：\n" +
          JSON.stringify({
            title: caseObj.title,
            diagnosis: caseObj.diagnosis,
            chiefComplaint: caseObj.chiefComplaint,
            knowledge: caseObj.knowledge,
          }),
      },
    ];
    const r = await callChat(messages, { maxTokens: cfg.maxTokensPerCall });
    try {
      const arr = extractJSON(r.content);
      return { quizzes: arr, demo: false };
    } catch (e) {
      return { quizzes: AIPS.mock.generateQuiz(caseObj), demo: true };
    }
  }

  /* 初始化：确保有演示病例可用 */
  function init() {
    AIPS.mock.seedDemoCases();
  }

  return {
    status,
    isDemo,
    callChat,
    chatAsPatient,
    generateCase,
    generateQuiz,
    init,
  };
})();
