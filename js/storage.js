/* ============================================================
   storage.js — localStorage 统一读写封装
   所有页面通过本模块访问数据，避免重复代码与键名漂移。
   ============================================================ */

window.AIPS = window.AIPS || {};

AIPS.store = (function () {
  const NS = AIPS.NS;

  function fullKey(key) {
    return NS + key;
  }

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("[AIPS] 读取失败:", key, e);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(fullKey(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("[AIPS] 写入失败:", key, e);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(fullKey(key));
  }

  /* ---------- 配置 ---------- */
  function getConfig() {
    const saved = get(AIPS.KEYS.config, null);
    // 合并默认，保证新增字段有默认
    const base = AIPS.defaultConfig();
    return Object.assign(base, saved || {});
  }
  function saveConfig(cfg) {
    return set(AIPS.KEYS.config, cfg);
  }

  /* ---------- 病例库 ---------- */
  function getCases() {
    return get(AIPS.KEYS.cases, []);
  }
  function saveCases(list) {
    return set(AIPS.KEYS.cases, list);
  }
  function getCaseById(id) {
    return getCases().find((c) => c.id === id) || null;
  }
  function upsertCase(c) {
    const list = getCases();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c;
    else list.push(c);
    saveCases(list);
    return c;
  }
  function deleteCase(id) {
    const list = getCases().filter((c) => c.id !== id);
    saveCases(list);
  }

  /* ---------- 诊断记录 ---------- */
  function getDiagnosisRecords() {
    return get(AIPS.KEYS.diagnosisRecords, []);
  }
  function saveDiagnosisRecords(list) {
    return set(AIPS.KEYS.diagnosisRecords, list);
  }
  function addDiagnosisRecord(rec) {
    const list = getDiagnosisRecords();
    list.unshift(rec);
    saveDiagnosisRecords(list);
    return rec;
  }

  /* ---------- 做题记录 ---------- */
  function getQuizRecords() {
    return get(AIPS.KEYS.quizRecords, []);
  }
  function saveQuizRecords(list) {
    return set(AIPS.KEYS.quizRecords, list);
  }
  function addQuizRecord(rec) {
    const list = getQuizRecords();
    list.unshift(rec);
    saveQuizRecords(list);
    return rec;
  }

  /* ---------- 积分明细 ---------- */
  function getPointsRecords() {
    return get(AIPS.KEYS.pointsRecords, []);
  }
  function savePointsRecords(list) {
    return set(AIPS.KEYS.pointsRecords, list);
  }
  function addPointsRecord(rec) {
    const list = getPointsRecords();
    list.unshift(rec);
    savePointsRecords(list);
    return rec;
  }
  function getPointsTotal() {
    return getPointsRecords().reduce((s, r) => s + (r.delta || 0), 0);
  }

  /* ---------- Token 用量 ---------- */
  function getTokenUsage() {
    const u = get(AIPS.KEYS.tokenUsage, null);
    const today = new Date().toISOString().slice(0, 10);
    if (!u || u.date !== today) {
      // 跨日自动重置当日累计
      return { date: today, used: 0 };
    }
    return u;
  }
  function addTokenUsage(n) {
    const u = getTokenUsage();
    u.used += n;
    set(AIPS.KEYS.tokenUsage, u);
    return u;
  }

  /* ---------- 学生姓名（个性化）---------- */
  function getStudentName() {
    return get(AIPS.KEYS.studentName, "") || "";
  }
  function setStudentName(name) {
    return set(AIPS.KEYS.studentName, name);
  }

  return {
    get,
    set,
    remove,
    getConfig,
    saveConfig,
    getCases,
    saveCases,
    getCaseById,
    upsertCase,
    deleteCase,
    getDiagnosisRecords,
    saveDiagnosisRecords,
    addDiagnosisRecord,
    getQuizRecords,
    saveQuizRecords,
    addQuizRecord,
    getPointsRecords,
    savePointsRecords,
    addPointsRecord,
    getPointsTotal,
    getTokenUsage,
    addTokenUsage,
    getStudentName,
    setStudentName,
  };
})();
