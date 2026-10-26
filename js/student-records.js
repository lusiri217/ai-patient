/* ============================================================
   student-records.js — 学生端·问诊记录与知识点总结
   查看过往诊断记录（含对话、评估、得分、积分），并关联病例知识点。
   ============================================================ */

(function () {
  const util = AIPS.util;
  const $ = util.$;

  function refreshHeader() {
    const e = $("#pointsTotal");
    if (e) e.textContent = AIPS.store.getPointsTotal();
  }

  function renderRecords() {
    const list = $("#recordList");
    if (!list) return;
    const recs = AIPS.store.getDiagnosisRecords();
    if (recs.length === 0) {
      list.innerHTML = "";
      list.appendChild(util.el("div", { class: "empty-state" }, [
        util.el("div", { class: "empty-ico", text: "📭" }),
        util.el("h3", { text: "暂无问诊记录" }),
        util.el("p", { text: "去“诊断练习”完成一次诊断后，记录会显示在这里。" }),
      ]));
      return;
    }
    list.innerHTML = "";
    recs.forEach((r) => {
      const card = util.el("div", { class: "card card-flat", style: "margin-bottom:14px;overflow:hidden;" });
      const head = util.el("div", { class: "flex-between flex-wrap gap-2", style: "padding:16px;border-bottom:1px solid var(--border);" }, [
        util.el("div", {}, [
          util.el("b", { text: r.caseTitle || "病例", style: "font-size:15px;" }),
          util.el("span", { class: "text-muted text-sm", text: "  ｜  " + util.formatTime(r.ts) }),
        ]),
        util.el("div", { class: "flex gap-2 wrap" }, [
          util.el("span", { class: "badge " + (r.eval && r.eval.correct ? "badge-success" : "badge-danger"), text: r.eval && r.eval.correct ? "诊断正确" : "诊断偏差" }),
          util.el("span", { class: "badge badge-primary", text: (r.eval ? r.eval.score : 0) + " 分" }),
          util.el("span", { class: "badge " + (r.pointsDelta >= 0 ? "badge-success" : "badge-danger"), text: (r.pointsDelta >= 0 ? "+" : "") + r.pointsDelta + " 积分" }),
        ]),
      ]);
      card.appendChild(head);

      const summary = util.el("div", { style: "padding:12px 16px;" }, [
        util.el("div", { class: "text-sm" }, [util.el("b", { text: "提交诊断：" }), util.el("span", { text: r.submittedDiagnosis || "—" })]),
        util.el("div", { class: "text-sm mt-3" }, [
          util.el("b", { text: "问诊完整度：" }), util.el("span", { text: (r.eval ? r.eval.completenessPct : 0) + "%  " }),
          util.el("b", { text: "人文关怀：" }), util.el("span", { text: r.eval && r.eval.empathy === "good" ? "优秀" : r.eval && r.eval.empathy === "poor" ? "欠缺" : "一般" }),
        ]),
        util.el("button", { class: "btn btn-sm btn-ghost mt-3", text: "展开完整对话与知识点 ▾", onclick: () => toggleDetail(detail) }),
      ]);
      card.appendChild(summary);

      const detail = util.el("div", { style: "display:none;padding:0 16px 16px;border-top:1px solid var(--border);", "data-rid": r.id });
      card.appendChild(detail);
      list.appendChild(card);
    });
  }

  function toggleDetail(detail) {
    if (detail.style.display === "none") {
      if (!detail.dataset.filled) {
        fillDetail(detail);
        detail.dataset.filled = "1";
      }
      detail.style.display = "";
    } else {
      detail.style.display = "none";
    }
  }

  function fillDetail(detail) {
    // 通过稳定的记录 id 查找对应记录
    const rec = AIPS.store.getDiagnosisRecords().find((r) => r.id === detail.dataset.rid);
    if (!rec) return;
    // 对话
    detail.appendChild(util.el("h4", { text: "💬 完整对话", style: "margin:14px 0 8px;" }));
    const conv = util.el("div", { style: "max-height:360px;overflow:auto;background:var(--bg-input);border-radius:12px;padding:12px;" });
    rec.conversation.forEach((m) => {
      conv.appendChild(util.el("div", { class: "msg " + (m.role === "doctor" ? "msg-user" : "msg-bot"), style: "max-width:100%;margin-bottom:10px;" }, [
        util.el("div", { class: "msg-bubble", text: m.text }),
      ]));
    });
    detail.appendChild(conv);

    // 知识点
    const c = AIPS.store.getCaseById(rec.caseId);
    const kn = c ? c.knowledge : null;
    if (kn) {
      detail.appendChild(util.el("h4", { text: "📚 知识点总结", style: "margin:16px 0 8px;" }));
      const knBox = util.el("div", { class: "card card-flat", style: "padding:14px;" });
      [["disease","疾病要点"],["inquiry","问诊要点"],["differential","鉴别诊断"],["clinicalTip","临床提示"],["humanistic","人文关怀要点"]].forEach(([k, label]) => {
        if (kn[k]) knBox.appendChild(util.el("div", { style: "margin-bottom:8px;" }, [util.el("b", { class: "text-sm", text: label + "：" }), util.el("span", { class: "text-sm", text: kn[k] })]));
      });
      detail.appendChild(knBox);
    } else {
      detail.appendChild(util.el("p", { class: "text-muted text-sm mt-3", text: "（该病例已被删除，无法展示关联知识点）" }));
    }
  }

  /* 积分明细 */
  function renderPoints() {
    const list = $("#pointsList");
    if (!list) return;
    const recs = AIPS.store.getPointsRecords();
    if (recs.length === 0) { list.innerHTML = '<div class="empty-state"><div class="empty-ico">🪙</div><h3>暂无积分明细</h3></div>'; return; }
    list.innerHTML = "";
    const labels = {
      diagCorrect: "诊断正确", diagWrong: "诊断错误", empathyGood: "人文优秀",
      empathyPoor: "缺乏人文", quizCorrect: "选择题对", quizWrong: "选择题错", quizShortDone: "简答题完成",
    };
    recs.slice(0, 40).forEach((r) => {
      list.appendChild(util.el("div", { class: "flex-between", style: "padding:10px 0;border-bottom:1px solid var(--border);" }, [
        util.el("div", {}, [
          util.el("div", { text: labels[r.type] || r.type, style: "font-weight:600;" }),
          util.el("div", { class: "text-muted text-sm", text: (r.detail || "") + " ｜ " + util.formatTime(r.ts) }),
        ]),
        util.el("span", { class: "badge " + (r.delta >= 0 ? "badge-success" : "badge-danger"), text: (r.delta >= 0 ? "+" : "") + r.delta }),
      ]));
    });
  }

  function init() {
    AIPS.api.init();
    refreshHeader();
    renderRecords();
    renderPoints();
    $("#btnSetName") && $("#btnSetName").addEventListener("click", () => {
      window._onStudentNameSet = refreshHeader;
      AIPS.auth.promptStudentName();
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
