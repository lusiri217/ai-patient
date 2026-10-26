/* ============================================================
   hospital.js — 医院端：病例上传（对话式）+ 病例库管理
   支持：文本粘贴、PDF(pdf.js 解析)、图片(OCR 适配器)，
   AI 结构化 + 去隐私化，预览可编辑后入库，病例库查看/筛选/编辑/删除/启停。
   ============================================================ */

(function () {
  const util = AIPS.util;
  const $ = util.$;

  // OCR 适配器（演示占位；替换为实现即可，例如接入 Tesseract.js / 后端 OCR）
  window.AIPS.ocrAdapter = window.AIPS.ocrAdapter || {
    name: "demo-ocr",
    async recognize(file) {
      // 演示：返回占位文本，不真正识别
      return (
        "[图片OCR占位文本] 已接收图片：" +
        file.name +
        "。请接入 Tesseract.js 或后端 OCR 服务以获取真实文字（见 README 适配点）。"
      );
    },
  };

  let pendingSources = []; // {type:'text'|'pdf'|'image', name, content}
  let pendingImages = []; // {name, url}

  /* ---------- 视图切换 ---------- */
  function switchView(view) {
    ["upload", "library"].forEach((v) => {
      const sec = $("#view-" + v);
      if (sec) sec.style.display = v === view ? "" : "none";
    });
    util.$$(".sidebar-nav a[data-view]").forEach((a) => {
      a.classList.toggle("active", a.dataset.view === view);
    });
  }

  /* ---------- 聊天消息渲染 ---------- */
  function addSystem(text) {
    const body = $("#chatBody");
    body.appendChild(util.el("div", { class: "msg-system", text }));
    scrollChat();
  }
  function addUserBubble(html) {
    const body = $("#chatBody");
    const m = util.el("div", { class: "msg msg-user" }, [
      util.el("div", { class: "msg-avatar", text: "🏥" }),
      util.el("div", {}, [
        util.el("div", { class: "msg-bubble", html }),
        util.el("div", { class: "msg-time", text: util.formatTime(Date.now()) }),
      ]),
    ]);
    body.appendChild(m);
    scrollChat();
  }
  function scrollChat() {
    const body = $("#chatBody");
    body.scrollTop = body.scrollHeight;
  }

  /* ---------- 文本提交 ---------- */
  function submitText() {
    const ta = $("#textInput");
    const text = ta.value.trim();
    if (!text) {
      util.toast("请输入文本病例", "warning");
      return;
    }
    addUserBubble("📄 提交文本病例：<br>" + util.escapeHtml(text.slice(0, 300)) + (text.length > 300 ? "…" : ""));
    pendingSources.push({ type: "text", name: "文本病例", content: text });
    ta.value = "";
    addSystem("已接收文本，可继续上传或点击下方“转换为结构化病例”。");
  }

  /* ---------- PDF 解析 ---------- */
  async function handlePdf(file) {
    addUserBubble('📕 上传 PDF：<span class="mono">' + util.escapeHtml(file.name) + "</span>");
    if (!window.pdfjsLib) {
      addSystem("⚠️ pdf.js 未加载（可能网络不可用），无法解析 PDF。请联网后重试或手动粘贴文本。");
      util.toast("pdf.js 未加载，无法解析 PDF", "error");
      return;
    }
    addSystem("正在解析 PDF…");
    try {
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map((it) => it.str).join(" ") + "\n";
      }
      pendingSources.push({ type: "pdf", name: file.name, content: text });
      addSystem("✓ PDF 解析完成（" + pdf.numPages + " 页），已加入待转换队列。");
    } catch (e) {
      addSystem("⚠️ PDF 解析失败：" + e.message);
      util.toast("PDF 解析失败", "error");
    }
  }

  /* ---------- 图片 + OCR ---------- */
  async function handleImage(file) {
    const url = URL.createObjectURL(file);
    pendingImages.push({ name: file.name, url });
    addUserBubble(
      '🖼️ 上传图片：<span class="mono">' +
        util.escapeHtml(file.name) +
        '</span><br><img class="img-preview" src="' +
        url +
        '">'
    );
    addSystem("正在进行图片 OCR（演示适配器）…");
    try {
      const ocrText = await window.AIPS.ocrAdapter.recognize(file);
      pendingSources.push({ type: "image", name: file.name, content: ocrText });
      addSystem("✓ 图片已接收，OCR 文本已加入待转换队列。");
    } catch (e) {
      addSystem("⚠️ OCR 失败：" + e.message);
    }
  }

  /* ---------- 生成结构化病例 ---------- */
  async function generateCase() {
    if (pendingSources.length === 0) {
      util.toast("请先上传文本 / PDF / 图片", "warning");
      return;
    }
    const raw = pendingSources.map((s) => s.content).join("\n\n");
    addSystem("🤖 AI 正在将资料转换为结构化病例并去隐私化…");
    showTyping();
    try {
      const res = await AIPS.api.generateCase(raw, {});
      removeTyping();
      if (res.demo) addSystem("（演示模式）" + (res.reason || ""));
      renderResultCard(res.case);
    } catch (e) {
      removeTyping();
      addSystem("⚠️ 生成失败：" + e.message);
      util.toast("生成失败：" + e.message, "error");
    }
  }

  let typingNode = null;
  function showTyping() {
    const body = $("#chatBody");
    typingNode = util.el("div", { class: "msg msg-bot", id: "typingNode" }, [
      util.el("div", { class: "msg-avatar", text: "🤖" }),
      util.el("div", { class: "msg-bubble" }, [
        util.el("div", { class: "typing" }, [
          util.el("span"), util.el("span"), util.el("span"),
        ]),
      ]),
    ]);
    body.appendChild(typingNode);
    scrollChat();
  }
  function removeTyping() {
    if (typingNode) typingNode.remove();
  }

  /* ---------- 结果卡片（可编辑预览）---------- */
  function renderResultCard(c) {
    const body = $("#chatBody");
    const card = util.el("div", { class: "msg msg-bot", style: "max-width:95%;" }, [
      util.el("div", { class: "msg-avatar", text: "🤖" }),
      util.el("div", { class: "msg-bubble", style: "width:100%;" }),
    ]);
    const inner = card.querySelector(".msg-bubble");

    const form = util.el("div");
    const field = (label, val, key, type = "input") => {
      const f = util.el("div", { class: "field" }, [
        util.el("label", { text: label }),
      ]);
      const inp =
        type === "textarea"
          ? util.el("textarea", { class: "textarea", id: "rc-" + key })
          : util.el("input", { class: "input", id: "rc-" + key, value: val || "" });
      if (type === "textarea") inp.value = val || "";
      f.appendChild(inp);
      return f;
    };

    inner.appendChild(
      util.el("div", { class: "result-card" }, [
        util.el("div", { class: "rc-head", text: "📋 AI 结构化病例（可编辑后入库）" }),
        util.el("div", { class: "rc-body" }, [
          field("病例标题", c.title, "title"),
          field("病例类型", c.type, "type"),
          field("主诉", c.chiefComplaint, "chiefComplaint", "textarea"),
          field("现病史", c.presentIllness, "presentIllness", "textarea"),
          field("既往史", c.pastHistory, "pastHistory", "textarea"),
          field("体格检查", c.exam, "exam", "textarea"),
          field("辅助检查", c.auxExam, "auxExam", "textarea"),
          field("诊断", c.diagnosis, "diagnosis", "textarea"),
          field("鉴别诊断", c.differential, "differential", "textarea"),
        ]),
      ])
    );

    // 线索词
    const clueWrap = util.el("div", { class: "field" }, [util.el("label", { text: "关键线索词与临床信息" })]);
    const clueList = util.el("div", { id: "rc-clues" });
    (c.clues || []).forEach((cl, i) => {
      clueList.appendChild(
        util.el("div", { class: "field-row", style: "margin-bottom:6px;" }, [
          util.el("input", { class: "input", value: cl.word, "data-clue-word": i }),
          util.el("input", { class: "input", value: cl.info, "data-clue-info": i }),
        ])
      );
    });
    clueWrap.appendChild(clueList);
    inner.appendChild(clueWrap);

    // 知识点
    const kn = c.knowledge || {};
    const knWrap = util.el("div", { class: "field" }, [util.el("label", { text: "知识点总结" })]);
    ["disease", "inquiry", "differential", "clinicalTip", "humanistic"].forEach((k) => {
      knWrap.appendChild(field(AIPS_KN_LABEL[k] || k, kn[k], "kn_" + k, "textarea"));
    });
    inner.appendChild(knWrap);

    inner.appendChild(
      util.el("div", { class: "flex gap-2 mt-3" }, [
        util.el("button", { class: "btn btn-success", text: "✓ 确认入库", onclick: () => confirmCase(c) }),
        util.el("button", { class: "btn btn-ghost", text: "放弃", onclick: () => { card.remove(); addSystem("已放弃该结构化病例，未入库。"); } }),
      ])
    );

    body.appendChild(card);
    scrollChat();
  }

  const AIPS_KN_LABEL = {
    disease: "疾病要点",
    inquiry: "问诊要点",
    differential: "鉴别诊断",
    clinicalTip: "临床提示",
    humanistic: "人文关怀要点",
  };

  function confirmCase(base) {
    const get = (id) => ($("#rc-" + id) ? $("#rc-" + id).value : "");
    const clues = [];
    util.$$("#rc-clues [data-clue-word]").forEach((w) => {
      const i = w.getAttribute("data-clue-word");
      const info = document.querySelector('[data-clue-info="' + i + '"]');
      clues.push({ word: w.value.trim(), info: info ? info.value.trim() : "" });
    });
    const kn = {};
    ["disease", "inquiry", "differential", "clinicalTip", "humanistic"].forEach((k) => {
      kn[k] = get("kn_" + k);
    });
    const c = Object.assign({}, base, {
      title: get("title"),
      type: get("type") || "其他",
      chiefComplaint: get("chiefComplaint"),
      presentIllness: get("presentIllness"),
      pastHistory: get("pastHistory"),
      exam: get("exam"),
      auxExam: get("auxExam"),
      diagnosis: get("diagnosis"),
      differential: get("differential"),
      clues,
      knowledge: kn,
      updatedAt: Date.now(),
    });
    AIPS.store.upsertCase(c);
    addSystem("✓ 已入库病例：《" + c.title + "》（待管理端审核启用）。");
    util.toast("病例已入库，待审核", "success");
    pendingSources = [];
    pendingImages = [];
  }

  /* ---------- 病例库 ---------- */
  function renderLibrary() {
    const list = $("#libraryList");
    if (!list) return;
    let cases = AIPS.store.getCases();
    const typeFilter = $("#libTypeFilter") ? $("#libTypeFilter").value : "";
    if (typeFilter) cases = cases.filter((c) => c.type === typeFilter);
    const q = $("#libSearch") ? $("#libSearch").value.trim().toLowerCase() : "";
    if (q) cases = cases.filter((c) => (c.title + c.diagnosis).toLowerCase().includes(q));

    if (cases.length === 0) {
      list.innerHTML = "";
      list.appendChild(
        util.el("div", { class: "empty-state" }, [
          util.el("div", { class: "empty-ico", text: "🗂️" }),
          util.el("h3", { text: "暂无病例" }),
          util.el("p", { text: "去“上传病例”上传并入库吧。" }),
        ])
      );
      return;
    }
    list.innerHTML = "";
    cases.forEach((c) => {
      const item = util.el("div", { class: "card card-flat card-hover", style: "margin-bottom:12px;padding:16px;" }, [
        util.el("div", { class: "flex-between flex-wrap gap-2" }, [
          util.el("div", {}, [
            util.el("b", { text: c.title, style: "font-size:15px;" }),
            util.el("span", { class: "badge badge-info", text: c.type, style: "margin-left:8px;" }),
          ]),
          util.el("div", { class: "flex gap-2 wrap" }, [
            util.el("span", {
              class: "badge " + (c.reviewed ? "badge-success" : "badge-warning"),
              text: c.reviewed ? "已审核" : "待审核",
            }),
            util.el("span", {
              class: "badge " + (c.enabled ? "badge-primary" : "badge-muted"),
              text: c.enabled ? "已启用" : "停用",
            }),
          ]),
        ]),
        util.el("p", { class: "text-muted text-sm mt-3", text: "诊断：" + (c.diagnosis || "—") }),
        util.el("div", { class: "flex gap-2 mt-3 wrap" }, [
          util.el("button", { class: "btn btn-sm btn-ghost", text: c.enabled ? "停用" : "启用", onclick: () => { c.enabled = !c.enabled; c.reviewed = true; AIPS.store.upsertCase(c); renderLibrary(); util.toast(c.enabled ? "已启用" : "已停用", "success"); } }),
          util.el("button", { class: "btn btn-sm btn-ghost", text: "编辑", onclick: () => editCase(c) }),
          util.el("button", { class: "btn btn-sm btn-danger", text: "删除", onclick: async () => { const ok = await util.confirmModal({ title: "删除病例", message: "确认删除《" + c.title + "》？此操作不可恢复。", danger: true }); if (ok) { AIPS.store.deleteCase(c.id); renderLibrary(); util.toast("已删除", "success"); } } }),
        ]),
      ]);
      list.appendChild(item);
    });
  }

  function editCase(c) {
    const body = util.el("div");
    const inputs = {};
    const fields = [
      ["title", "病例标题"], ["type", "病例类型"], ["chiefComplaint", "主诉"],
      ["presentIllness", "现病史"], ["diagnosis", "诊断"], ["differential", "鉴别诊断"],
    ];
    fields.forEach(([k, label]) => {
      const ta = util.el(k === "presentIllness" || k === "chiefComplaint" || k === "differential" ? "textarea" : "input", { class: k === "presentIllness" ? "textarea" : "input" });
      ta.value = c[k] || "";
      inputs[k] = ta;
      body.appendChild(util.el("div", { class: "field" }, [util.el("label", { text: label }), ta]));
    });
    const m = util.openModal({ title: "编辑病例", body, large: true });
    const foot = m.modal.querySelector(".modal-foot");
    foot.innerHTML = "";
    foot.appendChild(util.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => m.overlay.remove() }));
    foot.appendChild(util.el("button", {
      class: "btn btn-primary", text: "保存", onclick: () => {
        fields.forEach(([k]) => (c[k] = inputs[k].value));
        c.updatedAt = Date.now();
        AIPS.store.upsertCase(c);
        m.overlay.remove();
        renderLibrary();
        util.toast("已保存", "success");
      },
    }));
  }

  /* ---------- 初始化 ---------- */
  function init() {
    AIPS.api.init();
    // 侧栏导航
    util.$$(".sidebar-nav a[data-view]").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); switchView(a.dataset.view); });
    });
    switchView("upload");

    // 按钮绑定
    const bind = (id, fn) => { const e = $("#" + id); if (e) e.addEventListener("click", fn); };
    bind("btnText", submitText);
    bind("btnGenerate", generateCase);
    bind("textInput", () => {});
    const pdfInput = $("#pdfInput");
    if (pdfInput) pdfInput.addEventListener("change", (e) => { if (e.target.files[0]) handlePdf(e.target.files[0]); e.target.value = ""; });
    const imgInput = $("#imgInput");
    if (imgInput) imgInput.addEventListener("change", (e) => { if (e.target.files[0]) handleImage(e.target.files[0]); e.target.value = ""; });
    const libType = $("#libTypeFilter");
    if (libType) libType.addEventListener("change", renderLibrary);
    const libSearch = $("#libSearch");
    if (libSearch) libSearch.addEventListener("input", util.debounce(renderLibrary, 250));

    renderLibrary();
    addSystem("👋 欢迎使用医院端。可粘贴文本、上传 PDF 或图片，AI 将转换为结构化病例并去隐私化。");
    $("#textInput") && $("#textInput").focus();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
