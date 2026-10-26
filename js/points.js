/* ============================================================
   points.js — 积分机制
   覆盖：诊断正确率、人文关怀表现、选择题/简答题正确与否。
   规则可在管理端配置（存于 aiPatientConfig.points）。
   ============================================================ */

window.AIPS = window.AIPS || {};

AIPS.points = (function () {
  function getRules() {
    const cfg = AIPS.store.getConfig();
    return Object.assign(AIPS.defaultPoints(), cfg.points || {});
  }

  /* 记录一条积分变动，并刷新总额（总额由各条 delta 实时求和得到）*/
  function log(type, detail, amount) {
    const rec = {
      id: AIPS.util.uid("pt"),
      type,
      detail: detail || "",
      delta: amount,
      total: 0, // 占位，读取时实时计算
      ts: Date.now(),
    };
    AIPS.store.addPointsRecord(rec);
    return rec;
  }

  /* 根据类型自动计算分值并记录 */
  function award(type, detail) {
    const rules = getRules();
    const amount = rules[type];
    if (amount === undefined) return null;
    return log(type, detail, amount);
  }

  function total() {
    return AIPS.store.getPointsTotal();
  }

  function records() {
    return AIPS.store.getPointsRecords();
  }

  /* 诊断结束：综合评估后发积分
     evalResult: { correct:bool, empathy:'good'|'poor'|'normal' } */
  function settleDiagnosis(evalResult, caseTitle) {
    const { correct, empathy } = evalResult;
    if (correct) award("diagCorrect", "诊断正确：" + (caseTitle || ""));
    else award("diagWrong", "诊断错误：" + (caseTitle || ""));

    if (empathy === "good") award("empathyGood", "人文关怀表现优秀");
    else if (empathy === "poor") award("empathyPoor", "缺乏人文关怀");
  }

  /* 做题：选择题对错 */
  function settleQuizChoice(correct, qBrief) {
    if (correct) award("quizCorrect", "选择题答对：" + (qBrief || ""));
    else award("quizWrong", "选择题答错：" + (qBrief || ""));
  }

  /* 简答题完成 */
  function settleQuizShort(qBrief) {
    award("quizShortDone", "简答题完成：" + (qBrief || ""));
  }

  return {
    getRules,
    log,
    award,
    total,
    records,
    settleDiagnosis,
    settleQuizChoice,
    settleQuizShort,
  };
})();
