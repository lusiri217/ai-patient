/* ============================================================
   student-quiz.js — 学生端·题库练习
   从已启用病例的 quizzes 中抽取题目，可按病例筛选；
   选择题即时判分并展示解析，简答题展示参考答案与评分要点并自评，
   做题结果影响积分。
   ============================================================ */

(function () {
  const util = AIPS.util;
  const $ = util.$;

  let pool = []; // {caseTitle, caseId, q}
  let currentFilter = "";

  function refreshHeader() {
    const e = $("#pointsTotal");
    if (e) e.textContent = AIPS.store.getPointsTotal();
  }

  function buildPool() {
    const cases = AIPS.store.getCases().filter((c) => c.enabled && c.quizzes && c.quizzes.length);
    const arr = [];
    cases.forEach((c) => {
      c.quizzes.forEach((q) => arr.push({ caseId: c.id, caseTitle: c.title, q }));
    });
    return arr;
  }

  function fillCaseFilter() {
    const sel = $("#quizCaseFilter");
    if (!sel) return;
    sel.innerHTML = "";
    sel.appendChild(util.el("option", { value: "", text: "全部病例" }));
    const cases = AIPS.store.getCases().filter((c) => c.enabled && c.quizzes && c.quizzes.length);
    cases.forEach((c) => sel.appendChild(util.el("option", { value: c.id, text: c.title })));
    sel.addEventListener("change", () => { currentFilter = sel.value; renderQuiz(); });
  }

  function renderQuiz() {
    const wrap = $("#quizList");
    if (!wrap) return;
    let items = pool;
    if (currentFilter) items = items.filter((it) => it.caseId === currentFilter);
    if (items.length === 0) {
      wrap.innerHTML = "";
      wrap.appendChild(util.el("div", { class: "empty-state" }, [
        util.el("div", { class: "empty-ico", text: "✏️" }),
        util.el("h3", { text: "暂无题目" }),
        util.el("p", { text: "等待管理端启用含题库的病例。" }),
      ]));
      return;
    }
    wrap.innerHTML = "";
    // 打乱顺序
    const shuffled = items.slice().sort(() => Math.random() - 0.5);
    shuffled.forEach((it, idx) => wrap.appendChild(renderQuestion(it, idx)));
  }

  function renderQuestion(it, idx) {
    const q = it.q;
    const box = util.el("div", { class: "quiz-q" });
    box.appendChild(util.el("div", { class: "flex-between" }, [
      util.el("span", { class: "badge badge-info", text: it.caseTitle }),
      util.el("span", { class: "badge " + (q.type === "choice" ? "badge-primary" : "badge-warning"), text: q.type === "choice" ? "选择题" : "简答题" }),
    ]));
    box.appendChild(util.el("div", { class: "q-title mt-3", text: (idx + 1) + ". " + q.stem }));

    if (q.type === "choice") {
      const opts = util.el("div", { class: "mt-3" });
      const state = { chosen: -1 };
      q.options.forEach((opt, i) => {
        const row = util.el("div", { class: "quiz-opt" }, [
          util.el("div", { class: "opt-mark", text: "○" }),
          util.el("div", { text: opt }),
        ]);
        row.addEventListener("click", () => {
          if (state.submitted) return;
          state.chosen = i;
          util.$$(".quiz-opt", opts).forEach((o) => o.classList.remove("selected"));
          row.classList.add("selected");
          submitBtn.disabled = false;
        });
        opts.appendChild(row);
      });
      box.appendChild(opts);
      const submitBtn = util.el("button", { class: "btn btn-primary btn-sm mt-3", text: "提交", disabled: true, onclick: () => gradeChoice(box, q, state.chosen) });
      box.appendChild(submitBtn);
    } else {
      const ta = util.el("textarea", { class: "textarea mt-3", placeholder: "在此作答…" });
      const submitBtn = util.el("button", { class: "btn btn-primary btn-sm mt-3", text: "提交", onclick: () => gradeShort(box, q, ta.value.trim()) });
      box.appendChild(ta);
      box.appendChild(submitBtn);
    }
    return box;
  }

  function gradeChoice(box, q, chosen) {
    if (chosen < 0) return;
    const opts = box.querySelectorAll(".quiz-opt");
    opts.forEach((o, i) => {
      o.classList.add("disabled");
      if (i === q.answer) o.classList.add("correct");
      if (i === chosen && i !== q.answer) o.classList.add("wrong");
    });
    const correct = chosen === q.answer;
    AIPS.points.settleQuizChoice(correct, q.stem.slice(0, 20));
    AIPS.store.addQuizRecord({ id: util.uid("qr"), type: "choice", caseTitle: q._caseTitle || "", correct, ts: Date.now() });
    // 解析
    box.appendChild(util.el("div", { class: "card card-flat mt-3", style: "padding:12px;background:var(--color-success-soft);" }, [
      util.el("b", { text: correct ? "✓ 回答正确" : "✗ 回答错误", style: "color:var(--color-success);" }),
      util.el("p", { class: "text-sm mt-3", text: q.analysis || "" }),
    ]));
    // 禁用提交
    const btn = box.querySelector(".btn");
    if (btn) btn.disabled = true;
    refreshHeader();
  }

  function gradeShort(box, q, answer) {
    if (!answer) { util.toast("请先作答", "warning"); return; }
    const ref = util.el("div", { class: "card card-flat mt-3", style: "padding:12px;" }, [
      util.el("b", { text: "参考答案 / 评分要点：" }),
      util.el("p", { class: "text-sm mt-3", text: q.reference || "" }),
    ]);
    box.appendChild(ref);
    // 自评
    const rate = util.el("div", { class: "flex gap-2 mt-3 wrap" }, [
      util.el("span", { class: "text-sm", text: "自评：" }),
      util.el("button", { class: "btn btn-sm btn-success", text: "完全答对 +分", onclick: () => finishShort(box, true) }),
      util.el("button", { class: "btn btn-sm btn-ghost", text: "部分答对", onclick: () => finishShort(box, false) }),
    ]);
    box.appendChild(rate);
  }
  function finishShort(box, full) {
    AIPS.points.settleQuizShort("");
    AIPS.store.addQuizRecord({ id: util.uid("qr"), type: "short", caseTitle: "", correct: full, ts: Date.now() });
    const btn = box.querySelector(".btn");
    if (btn) btn.disabled = true;
    util.toast("已记录简答题完成", "success");
    refreshHeader();
  }

  function init() {
    AIPS.api.init();
    refreshHeader();
    pool = buildPool();
    fillCaseFilter();
    renderQuiz();
    $("#btnSetName") && $("#btnSetName").addEventListener("click", () => {
      window._onStudentNameSet = refreshHeader;
      AIPS.auth.promptStudentName();
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
