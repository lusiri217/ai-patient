/* ============================================================
   utils.js — 通用工具：选择器、DOM 创建、Toast、二次确认、
   时间格式化、脱敏、HTML 转义等
   ============================================================ */

window.AIPS = window.AIPS || {};

AIPS.util = (function () {
  /* 选择器 */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* 创建元素 */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== null && v !== undefined && v !== false) {
        node.setAttribute(k, v);
      }
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Toast 提示 */
  let toastStack = null;
  function toast(message, type = "info", duration = 2600) {
    if (!toastStack) {
      toastStack = el("div", { class: "toast-stack" });
      document.body.appendChild(toastStack);
    }
    const icons = { success: "✓", error: "✕", warning: "!", info: "i" };
    const t = el("div", { class: "toast " + type }, [
      el("span", { text: icons[type] || "i" }),
      el("span", { text: message }),
    ]);
    toastStack.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .3s";
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  /* 自定义二次确认弹窗 */
  function confirmModal(opts) {
    return new Promise((resolve) => {
      const o = Object.assign(
        {
          title: "确认操作",
          message: "确定要执行该操作吗？",
          confirmText: "确定",
          cancelText: "取消",
          danger: false,
        },
        opts || {}
      );
      const overlay = el("div", { class: "modal-overlay open" });
      const modal = el("div", { class: "modal" });
      const head = el("div", { class: "modal-head" }, [
        el("h3", { text: o.title }),
        el("button", {
          class: "modal-close",
          text: "×",
          onclick: () => close(false),
        }),
      ]);
      const body = el("div", { class: "modal-body" }, [
        el("p", { text: o.message, style: "margin:0;line-height:1.6;" }),
      ]);
      const foot = el("div", { class: "modal-foot" }, [
        el("button", {
          class: "btn btn-ghost",
          text: o.cancelText,
          onclick: () => close(false),
        }),
        el("button", {
          class: "btn " + (o.danger ? "btn-danger" : "btn-primary"),
          text: o.confirmText,
          onclick: () => close(true),
        }),
      ]);
      modal.append(head, body, foot);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      function close(val) {
        overlay.remove();
        resolve(val);
      }
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
    });
  }

  /* 通用模态框（用于展示内容）*/
  function openModal(opts) {
    const o = Object.assign({ title: "", body: "", large: false }, opts || {});
    const overlay = el("div", { class: "modal-overlay open" });
    const modal = el("div", { class: "modal" + (o.large ? " modal-lg" : "") });
    const head = el("div", { class: "modal-head" }, [
      el("h3", { text: o.title }),
      el("button", {
        class: "modal-close",
        text: "×",
        onclick: () => overlay.remove(),
      }),
    ]);
    const body = el("div", { class: "modal-body" });
    if (typeof o.body === "string") body.innerHTML = o.body;
    else if (o.body) body.appendChild(o.body);
    const foot = el("div", { class: "modal-foot" }, [
      el("button", {
        class: "btn btn-ghost",
        text: "关闭",
        onclick: () => overlay.remove(),
      }),
    ]);
    modal.append(head, body, foot);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    return { overlay, modal, body };
  }

  /* 时间格式化 */
  function formatTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
  }

  function uid(prefix = "id") {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 7)
    );
  }

  /* API Key 脱敏 */
  function maskKey(key) {
    if (!key) return "";
    if (key.length <= 8) return "****" + key.slice(-2);
    return key.slice(0, 3) + "****" + key.slice(-4);
  }

  function debounce(fn, wait = 300) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  return {
    $,
    $$,
    el,
    escapeHtml,
    toast,
    confirmModal,
    openModal,
    formatTime,
    uid,
    maskKey,
    debounce,
  };
})();
