/* ============================================================
   admin.js — 管理端共享逻辑
   包含：仪表盘、API Key 管理、AI 设置、病例审核、统计 五个页面的初始化。
   所有配置读写均通过 AIPS.store / AIPS.api，API Key 不写死在源码。
   ============================================================ */

window.AIPS = window.AIPS || {};
AIPS.admin = (function () {
  const util = AIPS.util;

  function getCfg() { return AIPS.store.getConfig(); }
  function saveCfg(cfg) { AIPS.store.saveConfig(cfg); util.toast("已保存", "success"); }

  function setActiveNav(page) {
    util.$$(".sidebar-nav a[data-page]").forEach((a) => {
      a.classList.toggle("active", a.dataset.page === page);
    });
  }

  /* ---------------- 仪表盘 ---------------- */
  function initDashboard() {
    AIPS.api.init();
    setActiveNav("dashboard");
    const cfg = getCfg();
    const st = AIPS.api.status();
    const cases = AIPS.store.getCases();
    const diag = AIPS.store.getDiagnosisRecords();
    const quiz = AIPS.store.getQuizRecords();
    const pts = AIPS.store.getPointsTotal();
    const usage = AIPS.store.getTokenUsage();

    // 状态横幅
    const banner = $("#statusBanner");
    if (banner) {
      if (st.mode === AIPS.API_MODE.REAL) {
        banner.className = "banner banner-success";
        banner.innerHTML = "✓ 状态正常：真实 API 调用已启用（Key 已配置）。";
      } else if (st.stopped) {
        banner.className = "banner banner-warning";
        banner.innerHTML = "⏸ " + (st.reason || "管理员已停止 API 调用");
      } else {
        banner.className = "banner banner-info";
        banner.innerHTML = "ℹ " + (st.reason || "演示模式");
      }
    }

    const set = (id, v) => { const e = $("#" + id); if (e) e.textContent = v; };
    set("statApiKey", cfg.apiKey ? util.maskKey(cfg.apiKey) : "未配置");
    set("statApiOn", cfg.apiEnabled ? "运行中" : "已停止");
    set("statToken", usage.used + " / " + cfg.dailyTokenLimit);
    set("statCases", cases.length);
    set("statEnabled", cases.filter((c) => c.enabled).length);
    set("statDiag", diag.length);
    set("statQuiz", quiz.length);
    set("statPoints", pts);
  }

  /* ---------------- API Key 管理 ---------------- */
  function initApiKey() {
    setActiveNav("apikey");
    const cfg = getCfg();
    const keyInput = $("#apiKey");
    const baseInput = $("#baseURL");
    const modelInput = $("#model");
    const masked = $("#maskedKey");
    const statusBadge = $("#keyStatus");
    const switchOn = $("#apiEnabled");

    function refresh() {
      const c = getCfg();
      if (masked) masked.textContent = c.apiKey ? util.maskKey(c.apiKey) : "（未配置）";
      if (statusBadge) {
        if (!c.apiEnabled) { statusBadge.className = "badge badge-danger badge-dot"; statusBadge.textContent = "已停止"; }
        else if (!c.apiKey) { statusBadge.className = "badge badge-warning badge-dot"; statusBadge.textContent = "未配置 Key"; }
        else { statusBadge.className = "badge badge-success badge-dot"; statusBadge.textContent = "运行中"; }
      }
      if (switchOn) switchOn.checked = c.apiEnabled;
    }
    refresh();

    $("#btnSaveKey") && $("#btnSaveKey").addEventListener("click", () => {
      const c = getCfg();
      const v = keyInput.value.trim();
      if (v) c.apiKey = v; // 仅当有输入才覆盖（避免清空已保存）
      c.baseURL = baseInput.value.trim() || "https://api.openai.com/v1";
      c.model = modelInput.value.trim() || "gpt-4o-mini";
      saveCfg(c);
      keyInput.value = "";
      refresh();
    });

    $("#btnEraseKey") && $("#btnEraseKey").addEventListener("click", async () => {
      const ok = await util.confirmModal({
        title: "抹除 API Key",
        message: "确认抹除当前 API Key？抹除后需重新填写才能发起真实调用。",
        confirmText: "确认抹除",
        danger: true,
      });
      if (ok) {
        const c = getCfg();
        c.apiKey = "";
        saveCfg(c);
        refresh();
        util.toast("API Key 已抹除", "warning");
      }
    });

    switchOn && switchOn.addEventListener("change", async () => {
      const wantOn = switchOn.checked;
      if (!wantOn) {
        const ok = await util.confirmModal({
          title: "停止 API 调用",
          message: "停止后学生端、医院端将不再发起真实请求，并提示“管理员已停止 API 调用”。确认停止？",
          confirmText: "确认停止",
          danger: true,
        });
        if (!ok) { switchOn.checked = true; return; }
      }
      const c = getCfg();
      c.apiEnabled = wantOn;
      saveCfg(c);
      refresh();
      util.toast(wantOn ? "已恢复 API 调用" : "已停止 API 调用", wantOn ? "success" : "warning");
    });
  }

  /* ---------------- AI 设置 ---------------- */
  function initAiSettings() {
    setActiveNav("ai");
    const cfg = getCfg();
    const bindVal = (id, key, isNum) => {
      const e = $("#" + id);
      if (e) e.value = isNum ? cfg[key] : cfg[key];
    };
    bindVal("systemPrompt", "systemPrompt");
    bindVal("patientPrompt", "patientPrompt");
    bindVal("humanisticPrompt", "humanisticPrompt");
    bindVal("englishProb", "englishPatientProb", true);
    bindVal("temperature", "temperature", true);
    bindVal("maxTokens", "maxTokensPerCall", true);
    bindVal("dailyToken", "dailyTokenLimit", true);
    const demoSwitch = $("#demoMode");
    if (demoSwitch) demoSwitch.checked = cfg.demoMode;

    const pr = cfg.points || AIPS.defaultPoints();
    ["diagCorrect","diagWrong","empathyGood","empathyPoor","quizCorrect","quizWrong","quizShortDone"].forEach((k) => {
      const e = $("#pt_" + k);
      if (e) e.value = pr[k];
    });

    $("#btnSaveAi") && $("#btnSaveAi").addEventListener("click", () => {
      const c = getCfg();
      c.systemPrompt = $("#systemPrompt").value;
      c.patientPrompt = $("#patientPrompt").value;
      c.humanisticPrompt = $("#humanisticPrompt").value;
      c.englishPatientProb = Math.min(1, Math.max(0, parseFloat($("#englishProb").value) || 0));
      c.temperature = parseFloat($("#temperature").value) || 0.8;
      c.maxTokensPerCall = parseInt($("#maxTokens").value) || 1500;
      c.dailyTokenLimit = parseInt($("#dailyToken").value) || 50000;
      c.demoMode = demoSwitch ? demoSwitch.checked : c.demoMode;
      const points = {};
      ["diagCorrect","diagWrong","empathyGood","empathyPoor","quizCorrect","quizWrong","quizShortDone"].forEach((k) => {
        points[k] = parseInt($("#pt_" + k).value) || 0;
      });
      c.points = points;
      saveCfg(c);
    });
  }

  /* ---------------- 病例审核 / 管理 ---------------- */
  function renderAdminCases() {
    const list = $("#adminCaseList");
    if (!list) return;
    let cases = AIPS.store.getCases();
    const tf = $("#adminTypeFilter") ? $("#adminTypeFilter").value : "";
    if (tf) cases = cases.filter((c) => c.type === tf);
    if (cases.length === 0) {
      list.innerHTML = "";
      list.appendChild(util.el("div", { class: "empty-state" }, [
        util.el("div", { class: "empty-ico", text: "🗂️" }),
        util.el("h3", { text: "暂无病例" }),
      ]));
      return;
    }
    list.innerHTML = "";
    cases.forEach((c) => {
      list.appendChild(util.el("div", { class: "card card-flat card-hover", style: "margin-bottom:12px;padding:16px;" }, [
        util.el("div", { class: "flex-between flex-wrap gap-2" }, [
          util.el("div", {}, [
            util.el("b", { text: c.title, style: "font-size:15px;" }),
            util.el("span", { class: "badge badge-info", text: c.type, style: "margin-left:8px;" }),
          ]),
          util.el("div", { class: "flex gap-2 wrap" }, [
            util.el("span", { class: "badge " + (c.reviewed ? "badge-success" : "badge-warning"), text: c.reviewed ? "已审核" : "待审核" }),
            util.el("span", { class: "badge " + (c.enabled ? "badge-primary" : "badge-muted"), text: c.enabled ? "已启用" : "停用" }),
          ]),
        ]),
        util.el("p", { class: "text-muted text-sm mt-3", text: "诊断：" + (c.diagnosis || "—") + " ｜ 来源：" + (c.source || "—") }),
        util.el("div", { class: "flex gap-2 mt-3 wrap" }, [
          util.el("button", { class: "btn btn-sm btn-ghost", text: c.reviewed && c.enabled ? "停用" : "审核并启用", onclick: () => { c.reviewed = true; c.enabled = !(c.reviewed && c.enabled ? true : false); c.enabled = true; AIPS.store.upsertCase(c); renderAdminCases(); util.toast("已审核并启用", "success"); } }),
          util.el("button", { class: "btn btn-sm btn-ghost", text: c.enabled ? "停用" : "启用", onclick: () => { c.enabled = !c.enabled; c.reviewed = true; AIPS.store.upsertCase(c); renderAdminCases(); } }),
          util.el("button", { class: "btn btn-sm btn-danger", text: "删除", onclick: async () => { const ok = await util.confirmModal({ title: "删除病例", message: "确认删除《" + c.title + "》？", danger: true }); if (ok) { AIPS.store.deleteCase(c.id); renderAdminCases(); util.toast("已删除", "success"); } } }),
        ]),
      ]));
    });
  }

  function initCases() {
    setActiveNav("cases");
    AIPS.api.init();
    const tf = $("#adminTypeFilter");
    if (tf) tf.addEventListener("change", renderAdminCases);
    renderAdminCases();
  }

  /* ---------------- 统计 ---------------- */
  function initStats() {
    setActiveNav("stats");
    AIPS.api.init();
    const cfg = getCfg();
    const usage = AIPS.store.getTokenUsage();
    const diag = AIPS.store.getDiagnosisRecords();
    const quiz = AIPS.store.getQuizRecords();
    const ptsRecords = AIPS.store.getPointsRecords();

    // Token
    const pct = Math.min(100, Math.round((usage.used / cfg.dailyTokenLimit) * 100));
    const prog = $("#tokenProgress");
    if (prog) { prog.style.width = pct + "%"; prog.textContent = ""; }
    const set = (id, v) => { const e = $("#" + id); if (e) e.textContent = v; };
    set("statTokenUsed", usage.used);
    set("statTokenLimit", cfg.dailyTokenLimit);
    set("statDiagCount", diag.length);
    const avg = diag.length ? (diag.reduce((s, r) => s + (r.score || 0), 0) / diag.length).toFixed(1) : "—";
    set("statDiagAvg", avg);

    // 做题正确率
    const choiceRecords = quiz.filter((r) => r.type === "choice");
    const correctCount = choiceRecords.filter((r) => r.correct).length;
    const acc = choiceRecords.length ? Math.round((correctCount / choiceRecords.length) * 100) : 0;
    set("statQuizCount", quiz.length);
    set("statQuizAcc", acc + "%");

    // 积分汇总
    const byType = {};
    ptsRecords.forEach((r) => { byType[r.type] = (byType[r.type] || 0) + r.delta; });
    set("statPointsTotal", AIPS.store.getPointsTotal());
    const ptList = $("#pointsBreakdown");
    if (ptList) {
      ptList.innerHTML = "";
      const labels = {
        diagCorrect: "诊断正确", diagWrong: "诊断错误", empathyGood: "人文优秀",
        empathyPoor: "缺乏人文", quizCorrect: "选择题对", quizWrong: "选择题错", quizShortDone: "简答题完成",
      };
      Object.entries(byType).forEach(([k, v]) => {
        ptList.appendChild(util.el("div", { class: "score-item" }, [
          util.el("b", { text: (v >= 0 ? "+" : "") + v }),
          util.el("span", { text: labels[k] || k }),
        ]));
      });
    }

    // 最近诊断记录表
    const tbl = $("#recentDiag");
    if (tbl) {
      tbl.innerHTML = "";
      diag.slice(0, 10).forEach((r) => {
        const tr = util.el("tr");
        tr.appendChild(util.el("td", { text: util.formatTime(r.ts) }));
        tr.appendChild(util.el("td", { text: r.caseTitle || "—" }));
        tr.appendChild(util.el("td", { text: (r.submittedDiagnosis || "").slice(0, 30) || "—" }));
        tr.appendChild(util.el("td", { text: (r.score || 0) + " 分" }));
        tr.appendChild(util.el("td", { text: (r.empathy === "good" ? "优秀" : r.empathy === "poor" ? "欠缺" : "一般") }));
        tbl.appendChild(tr);
      });
    }
  }

  return {
    setActiveNav,
    initDashboard, initApiKey, initAiSettings, initCases, initStats,
  };
})();
