/* ============================================================
   student-diagnosis.js — 学生端·诊断页
   微信式对话：AI 模拟患者，学生扮演医生；关键线索词可点击查看
   临床信息；支持英文外国患者（概率可配置）；结束诊断后自动评估并计分。
   ============================================================ */

(function () {
  const util = AIPS.util;
  const $ = util.$;

  let currentCase = null;
  let conversation = []; // {role:'doctor'|'patient', text}
  let isEnglish = false;
  let started = false;

  /* ---------- 顶部积分/昵称 ---------- */
  function refreshHeader() {
    const nameEl = $("#studentName");
    if (nameEl) nameEl.textContent = AIPS.auth.getStudentName();
    const ptsEl = $("#pointsTotal");
    if (ptsEl) ptsEl.textContent = AIPS.store.getPointsTotal();
  }

  /* ---------- 病例列表（左侧）---------- */
  function renderCaseList() {
    const list = $("#caseList");
    if (!list) return;
    const filter = $("#caseTypeFilter") ? $("#caseTypeFilter").value : "";
    let cases = AIPS.store.getCases().filter((c) => c.enabled);
    if (filter) cases = cases.filter((c) => c.type === filter);
    if (cases.length === 0) {
      list.innerHTML = "";
      list.appendChild(util.el("div", { class: "empty-state", style: "padding:24px;" }, [
        util.el("div", { class: "empty-ico", text: "🔍" }),
        util.el("h3", { text: "暂无可诊断病例" }),
        util.el("p", { text: "等待管理端审核启用病例，或先体验演示病例。" }),
      ]));
      return;
    }
    list.innerHTML = "";
    cases.forEach((c) => {
      list.appendChild(util.el("div", { class: "card card-flat", style: "margin-bottom:10px;padding:14px;cursor:pointer;" }, [
        util.el("div", { class: "flex-between" }, [
          util.el("b", { text: c.title, style: "font-size:14px;" }),
          util.el("span", { class: "badge badge-info", text: c.type }),
        ]),
        util.el("p", { class: "text-muted text-sm mt-3", text: "诊断：" + (c.diagnosis || "—").slice(0, 40) }),
        util.el("button", {
          class: "btn btn-primary btn-sm btn-block mt-3",
          text: "开始诊断",
          onclick: () => startDiagnosis(c.id),
        }),
      ]));
    });
  }

  /* ---------- 聊天气泡 ---------- */
  function parseClues(text) {
    const esc = util.escapeHtml(text);
    return esc.replace(/\[\[(.+?)\]\]/g, '<span class="clue" data-word="$1">$1</span>');
  }
  function addDoctorBubble(text) {
    const body = $("#chatBody");
    body.appendChild(util.el("div", { class: "msg msg-user" }, [
      util.el("div", { class: "msg-avatar", text: "🧑‍⚕️" }),
      util.el("div", {}, [
        util.el("div", { class: "msg-bubble", text }),
        util.el("div", { class: "msg-time", text: util.formatTime(Date.now()) }),
      ]),
    ]));
    scrollChat();
  }
  function addPatientBubble(text) {
    const body = $("#chatBody");
    const m = util.el("div", { class: "msg msg-bot" }, [
      util.el("div", { class: "msg-avatar", text: "🤒" }),
      util.el("div", {}, [
        util.el("div", { class: "msg-bubble", html: parseClues(text) }),
        util.el("div", { class: "msg-time", text: util.formatTime(Date.now()) }),
      ]),
    ]);
    body.appendChild(m);
    // 绑定线索点击
    util.$$(".clue", m).forEach((span) => {
      span.addEventListener("click", () => showClue(span.dataset.word, span));
    });
    scrollChat();
  }
  function addSystem(text) {
    const body = $("#chatBody");
    body.appendChild(util.el("div", { class: "msg-system", text }));
    scrollChat();
  }
  function scrollChat() {
    const body = $("#chatBody");
    body.scrollTop = body.scrollHeight;
  }

  /* ---------- 线索弹卡 ---------- */
  let cluePop = null;
  function showClue(word, anchor) {
    if (!cluePop) {
      cluePop = util.el("div", { class: "clue-pop" }, [
        util.el("span", { class: "clue-pop-close", text: "×", onclick: () => cluePop.classList.remove("open") }),
        util.el("h4", { id: "cluePopTitle" }),
        util.el("div", { id: "cluePopBody" }),
      ]);
      document.body.appendChild(cluePop);
    }
    const cl = (currentCase.clues || []).find((c) => c.word === word);
    $("#cluePopTitle").textContent = word;
    $("#cluePopBody").textContent = cl ? cl.info : "（暂无详细临床信息，可在病例中补充）";
    cluePop.classList.add("open");
    const r = anchor.getBoundingClientRect();
    let top = r.bottom + 8;
    if (top + 160 > window.innerHeight) top = r.top - 160;
    cluePop.style.top = Math.max(8, top) + "px";
    cluePop.style.left = Math.min(r.left, window.innerWidth - 340) + "px";
  }

  /* ---------- 开始诊断 ---------- */
  async function startDiagnosis(caseId) {
    const c = AIPS.store.getCaseById(caseId);
    if (!c) return;
    const cfg = AIPS.store.getConfig();
    currentCase = c;
    isEnglish = Math.random() < (cfg.englishPatientProb || 0.1);
    conversation = [];
    started = true;

    // 头部
    $("#chatTitle") && ($("#chatTitle").textContent = c.title);
    const badges = $("#chatBadges");
    if (badges) {
      const st = AIPS.api.status();
      badges.innerHTML = "";
      badges.appendChild(util.el("span", { class: "badge " + (st.mode === AIPS.API_MODE.REAL ? "badge-success" : "badge-warning"), text: st.mode === AIPS.API_MODE.REAL ? "真实 AI" : "演示模式" }));
      if (isEnglish) badges.appendChild(util.el("span", { class: "badge badge-info", text: "🌐 外国患者·英文" }));
      if (st.stopped) badges.appendChild(util.el("span", { class: "badge badge-danger", text: "管理员已停止调用" }));
    }
    // 横幅
    const banner = $("#demoBanner");
    if (banner) {
      const st = AIPS.api.status();
      if (st.mode !== AIPS.API_MODE.REAL) {
        banner.style.display = "";
        banner.className = "banner " + (st.stopped ? "banner-warning" : "banner-info");
        banner.textContent = (st.stopped ? "⏸ 管理员已停止 API 调用，当前为" : "ℹ 当前为") + "演示模式（模拟患者），不发起真实请求。";
      } else banner.style.display = "none";
    }

    $("#chatBody").innerHTML = "";
    $("#chatPanel").style.display = "";
    addSystem("▶ 开始诊断：《" + c.title + "》" + (isEnglish ? "（外国患者，将使用英文交流）" : ""));
    addSystem("你扮演接诊医生，请通过问诊引导患者，最终给出诊断结论。");

    // 医生开场白 + 患者首句
    const greeting = isEnglish
      ? "Hello, I am the doctor on duty. Could you tell me what brings you in today?"
      : "您好，我是接诊医生。请先说说您哪里不舒服，慢慢讲。";
    conversation.push({ role: "doctor", text: greeting });
    addDoctorBubble(greeting);

    await botRespond();
  }

  /* ---------- 发送消息 ---------- */
  async function sendMessage() {
    if (!started || !currentCase) { util.toast("请先选择病例开始诊断", "warning"); return; }
    const ta = $("#chatInput");
    const text = ta.value.trim();
    if (!text) return;
    conversation.push({ role: "doctor", text });
    addDoctorBubble(text);
    ta.value = "";
    autoGrow(ta);
    await botRespond();
  }

  let typingNode = null;
  async function botRespond() {
    showTyping();
    try {
      const r = await AIPS.api.chatAsPatient(currentCase, conversation, isEnglish);
      removeTyping();
      conversation.push({ role: "patient", text: r.content });
      addPatientBubble(r.content);
      if (r.demo && r.reason) {
        // 轻提示（避免刷屏，仅在首次）
        if (!window._demoNoted) { addSystem("（" + r.reason + "）"); window._demoNoted = true; }
      }
    } catch (e) {
      removeTyping();
      addSystem("⚠️ " + e.message);
      util.toast(e.message, "error");
    }
  }
  function showTyping() {
    const body = $("#chatBody");
    typingNode = util.el("div", { class: "msg msg-bot", id: "typingNode" }, [
      util.el("div", { class: "msg-avatar", text: "🤒" }),
      util.el("div", { class: "msg-bubble" }, [util.el("div", { class: "typing" }, [util.el("span"), util.el("span"), util.el("span")])]),
    ]);
    body.appendChild(typingNode);
    scrollChat();
  }
  function removeTyping() { if (typingNode) typingNode.remove(); }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }

  /* ---------- 结束诊断 & 评估 ---------- */
  function endDiagnosis() {
    if (!started || conversation.length < 2) { util.toast("对话过少，无法评估", "warning"); return; }
    const ta = util.el("textarea", { class: "textarea", placeholder: "请写下你的最终诊断结论（如：急性ST段抬高型心肌梗死）" });
    const m = util.openModal({ title: "提交诊断结论", body: (() => { const w = util.el("div"); w.appendChild(util.el("p", { class: "text-muted text-sm", text: "系统将根据你的问诊完整性、人文关怀与诊断准确性进行评估并计分。" })); w.appendChild(ta); return w; })() });
    const foot = m.modal.querySelector(".modal-foot");
    foot.innerHTML = "";
    foot.appendChild(util.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => m.overlay.remove() }));
    foot.appendChild(util.el("button", { class: "btn btn-primary", text: "提交并评估", onclick: () => { const sub = ta.value.trim(); if (!sub) { util.toast("请填写诊断结论", "warning"); return; } m.overlay.remove(); evaluate(sub); } }));
    ta.focus();
  }

  function evaluate(submitted) {
    const doctorMsgs = conversation.filter((m) => m.role === "doctor").map((m) => m.text);
    const empathyWords = /(您好|你好|别担心|不用担心|请|理解|放心|慢慢|不着急|我明白|我理解|安抚|辛苦|抱歉|陪您|会好|别怕|注意身体|别紧张)/;
    let empCount = 0;
    doctorMsgs.forEach((t) => { if (empathyWords.test(t)) empCount++; });
    const empRatio = doctorMsgs.length ? empCount / doctorMsgs.length : 0;
    let empathy = "normal";
    if (empRatio >= 0.45) empathy = "good";
    else if (doctorMsgs.length >= 3 && empRatio < 0.15) empathy = "poor";

    // 问诊完整性：医生是否问到了线索词
    const clues = currentCase.clues || [];
    let referenced = 0;
    clues.forEach((cl) => {
      if (doctorMsgs.some((t) => t.includes(cl.word))) referenced++;
    });
    const completenessPct = clues.length ? Math.round((referenced / clues.length) * 100) : 100;

    // 诊断正确性
    const mainDx = (currentCase.diagnosis || "").replace(/【.*?】/g, "").trim();
    let correct = false;
    if (mainDx && !mainDx.startsWith("【")) {
      correct = submitted.includes(mainDx) || mainDx.split(/[，,、\s]/).some((tok) => tok.length >= 3 && submitted.includes(tok));
    } else {
      // 占位诊断：以线索命中数作为代理
      correct = referenced >= Math.ceil(clues.length / 2);
    }

    const diagScore = correct ? 100 : 40;
    const empathyScore = empathy === "good" ? 100 : empathy === "poor" ? 40 : 70;
    const score = Math.round(0.5 * diagScore + 0.3 * completenessPct + 0.2 * empathyScore);

    // 计分
    const before = AIPS.store.getPointsTotal();
    AIPS.points.settleDiagnosis({ correct, empathy }, currentCase.title);
    const after = AIPS.store.getPointsTotal();
    const pointsDelta = after - before;

    // 保存记录
    AIPS.store.addDiagnosisRecord({
      id: util.uid("diag"),
      caseId: currentCase.id,
      caseTitle: currentCase.title,
      ts: Date.now(),
      conversation: conversation.map((m) => ({ role: m.role, text: m.text.replace(/\[\[|\]\]/g, "") })),
      submittedDiagnosis: submitted,
      eval: { correct, completenessPct, empathy, score },
      pointsDelta,
      isEnglish,
    });

    showResult({ correct, completenessPct, empathy, score, pointsDelta });
    refreshHeader();
  }

  function showResult(ev) {
    const kn = currentCase.knowledge || {};
    const body = util.el("div");
    body.appendChild(util.el("div", { class: "score-grid mb-4" }, [
      scoreItem(ev.score, "综合得分"),
      scoreItem(ev.correct ? "正确" : "错误", "诊断结论"),
      scoreItem(ev.completenessPct + "%", "问诊完整度"),
      scoreItem(ev.empathy === "good" ? "优秀" : ev.empathy === "poor" ? "欠缺" : "一般", "人文关怀"),
      scoreItem((ev.pointsDelta >= 0 ? "+" : "") + ev.pointsDelta, "积分变化"),
    ]));
    body.appendChild(util.el("div", { class: "card card-flat", style: "padding:16px;" }, [
      util.el("h4", { text: "📚 知识点总结", style: "margin-bottom:10px;" }),
      knItem("疾病要点", kn.disease),
      knItem("问诊要点", kn.inquiry),
      knItem("鉴别诊断", kn.differential),
      knItem("临床提示", kn.clinicalTip),
      knItem("人文关怀要点", kn.humanistic),
    ]));
    const m = util.openModal({ title: "诊断评估报告", body, large: true });
    const foot = m.modal.querySelector(".modal-foot");
    foot.innerHTML = "";
    foot.appendChild(util.el("button", { class: "btn btn-ghost", text: "查看记录", onclick: () => { m.overlay.remove(); location.href = "student-records.html"; } }));
    foot.appendChild(util.el("button", { class: "btn btn-primary", text: "继续", onclick: () => m.overlay.remove() }));
  }
  function scoreItem(v, label) {
    return util.el("div", { class: "score-item" }, [util.el("b", { text: String(v) }), util.el("span", { text: label })]);
  }
  function knItem(label, val) {
    if (!val) return util.el("div");
    return util.el("div", { style: "margin-bottom:8px;" }, [
      util.el("b", { text: label + "：", class: "text-sm" }),
      util.el("span", { class: "text-sm", text: val }),
    ]);
  }

  function restart() {
    started = false;
    currentCase = null;
    conversation = [];
    $("#chatBody").innerHTML = "";
    $("#chatPanel").style.display = "none";
    $("#chatTitle") && ($("#chatTitle").textContent = "未开始诊断");
    const badges = $("#chatBadges"); if (badges) badges.innerHTML = "";
    renderCaseList();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    AIPS.api.init();
    refreshHeader();
    const filter = $("#caseTypeFilter");
    if (filter) {
      // 填充类型
      AIPS.CASE_TYPES.forEach((t) => filter.appendChild(util.el("option", { value: t, text: t })));
      filter.insertBefore(util.el("option", { value: "", text: "全部类型" }), filter.firstChild);
      filter.addEventListener("change", renderCaseList);
    }
    renderCaseList();

    const sendBtn = $("#btnSend");
    sendBtn && sendBtn.addEventListener("click", sendMessage);
    const ta = $("#chatInput");
    if (ta) {
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
      ta.addEventListener("input", () => autoGrow(ta));
    }
    $("#btnEnd") && $("#btnEnd").addEventListener("click", endDiagnosis);
    $("#btnRestart") && $("#btnRestart").addEventListener("click", restart);
    $("#btnSetName") && $("#btnSetName").addEventListener("click", () => {
      window._onStudentNameSet = refreshHeader;
      AIPS.auth.promptStudentName();
    });

    // 默认隐藏聊天面板
    const cp = $("#chatPanel"); if (cp) cp.style.display = "none";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
