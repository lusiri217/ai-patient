/* ============================================================
   config.js — 全局常量、默认配置、默认积分规则
   注意：任何真实 API Key 都不在此处写死，只放默认值占位。
   ============================================================ */

window.AIPS = window.AIPS || {};

/* 统一 localStorage 命名空间前缀，避免与其它应用冲突 */
AIPS.NS = "aips:";

/* 各数据键 */
AIPS.KEYS = {
  config: "aiPatientConfig",
  cases: "cases",
  diagnosisRecords: "diagnosisRecords",
  quizRecords: "quizRecords",
  pointsRecords: "pointsRecords",
  tokenUsage: "tokenUsage",
  studentName: "studentName",
};

/* 病例类型（可扩展） */
AIPS.CASE_TYPES = [
  "内科",
  "外科",
  "妇产科",
  "儿科",
  "急诊科",
  "神经内科",
  "心血管科",
  "其他",
];

/* API 调用状态常量 */
AIPS.API_MODE = {
  REAL: "real", // 真实调用
  DEMO: "demo", // 演示模式（mock）
  BLOCKED: "blocked", // 被阻止（停止 / 超限 / 无 Key）
};

/* 默认管理端配置 —— 不含任何真实密钥 */
AIPS.DEFAULT_CONFIG = {
  // API 连接（均为空，必须由管理端填写）
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o-mini",

  // 总开关：true=允许调用，false=停止（所有端口禁止真实请求）
  apiEnabled: true,

  // Token 限制
  maxTokensPerCall: 1500, // 单次最大输出 token
  dailyTokenLimit: 50000, // 每日总 token 上限

  // 演示模式（无 Key / 被停止时是否自动回退到 mock）
  demoMode: true,

  // 英文外国患者概率（0~1），默认 10%
  englishPatientProb: 0.1,

  // 生成参数
  temperature: 0.8,

  // 可选管理端访问口令；为空则直接进入（教学验收友好）
  adminPasscode: "",

  // 提示词模板
  systemPrompt:
    "你是一个专业的医学模拟教学系统。你的任务是扮演真实患者，帮助医学生练习问诊与诊断。" +
    "你必须始终从患者视角回答，使用第一人称，语气自然、口语化，可适当表现焦虑、担忧等情绪。" +
    "你不得主动直接说出最终诊断结论，应通过描述症状、病史引导医生逐步问诊。" +
    "当医生表现出人文关怀（如安抚、解释、尊重）时，你应给予积极回应；当医生问诊生硬、缺乏共情时，可委婉表达不适。",
  patientPrompt:
    "请严格按照给定病例的基本信息、主诉、现病史、既往史、体格检查、辅助检查来扮演患者。" +
    "回答要具体、生活化。涉及关键线索时可以用自然的方式透露（如‘我最近总是觉得…’）。" +
    "不要一次性把所有信息倒出来，要根据医生的提问逐步回应。",
  humanisticPrompt:
    "在整个问诊过程中，请体现医患沟通与人文关怀：患者可以因医生的态度而情绪变化。" +
    "若医生使用了安抚性语言、解释病情、尊重患者意愿，患者会更配合；反之可表现出抵触或紧张。",

  /* 积分规则（管理端可配置默认值）*/
  points: {
    diagCorrect: 30,
    diagWrong: -15,
    empathyGood: 15,
    empathyPoor: -10,
    quizCorrect: 5,
    quizWrong: -2,
    quizShortDone: 8,
  },
};

/* 默认积分规则 */
AIPS.DEFAULT_POINTS = {
  diagCorrect: 30, // 诊断正确加分
  diagWrong: -15, // 诊断错误扣分
  empathyGood: 15, // 人文关怀优秀加分
  empathyPoor: -10, // 缺乏人文关怀扣分
  quizCorrect: 5, // 选择题答对加分
  quizWrong: -2, // 选择题答错扣分
  quizShortDone: 8, // 简答题完成加分
};

/* 取得默认配置（深拷贝，避免外部修改污染） */
AIPS.defaultConfig = function () {
  return JSON.parse(JSON.stringify(AIPS.DEFAULT_CONFIG));
};
AIPS.defaultPoints = function () {
  return JSON.parse(JSON.stringify(AIPS.DEFAULT_POINTS));
};
