/* ============================================================
   auth.js — 轻量鉴权与身份
   纯前端原型：管理端默认直接进入；若管理端配置了 adminPasscode，
   则进入管理页前需输入口令（用于教学演示时锁定后台）。
   学生端记录一个本地昵称用于个性化，不涉及真实登录。
   ============================================================ */

window.AIPS = window.AIPS || {};

AIPS.auth = (function () {
  const KEY_ADMIN_SESSION = "aips:adminSession";

  /* 管理端守卫：返回 true 表示放行 */
  function guardAdmin() {
    const cfg = AIPS.store.getConfig();
    if (!cfg.adminPasscode) {
      // 默认无口令，直接放行
      sessionStorage.setItem(KEY_ADMIN_SESSION, "1");
      return true;
    }
    const ok = sessionStorage.getItem(KEY_ADMIN_SESSION) === "1";
    if (ok) return true;

    // 弹出口令输入
    const { openModal } = AIPS.util;
    const input = AIPS.util.el("input", {
      class: "input",
      type: "password",
      placeholder: "请输入管理端口令",
    });
    const m = openModal({
      title: "管理端访问验证",
      body: (() => {
        const wrap = AIPS.util.el("div");
        wrap.appendChild(
          AIPS.util.el("p", {
            text: "本管理端已设置访问口令，请输入后进入。",
            class: "text-muted text-sm",
          })
        );
        wrap.appendChild(input);
        return wrap;
      })(),
      large: false,
    });
    // 替换底部按钮为验证逻辑
    const foot = m.modal.querySelector(".modal-foot");
    foot.innerHTML = "";
    foot.appendChild(
      AIPS.util.el("button", {
        class: "btn btn-ghost",
        text: "取消",
        onclick: () => {
          m.overlay.remove();
          location.href = "index.html";
        },
      })
    );
    foot.appendChild(
      AIPS.util.el("button", {
        class: "btn btn-primary",
        text: "进入",
        onclick: () => {
          if (input.value === cfg.adminPasscode) {
            sessionStorage.setItem(KEY_ADMIN_SESSION, "1");
            m.overlay.remove();
            location.reload();
          } else {
            AIPS.util.toast("口令错误", "error");
          }
        },
      })
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") foot.querySelector(".btn-primary").click();
    });
    input.focus();
    return false;
  }

  function setPasscode(pass) {
    const cfg = AIPS.store.getConfig();
    cfg.adminPasscode = pass || "";
    AIPS.store.saveConfig(cfg);
  }

  function getStudentName() {
    let n = AIPS.store.getStudentName();
    if (!n) {
      n = "医学生";
    }
    return n;
  }

  function promptStudentName() {
    const cur = AIPS.store.getStudentName();
    const input = AIPS.util.el("input", {
      class: "input",
      value: cur || "",
      placeholder: "例如：李明（学号2023xxxx）",
    });
    const m = AIPS.util.openModal({
      title: "设置学习者昵称",
      body: (() => {
        const w = AIPS.util.el("div");
        w.appendChild(
          AIPS.util.el("p", {
            text: "昵称仅用于本地个性化展示，不会上传。",
            class: "text-muted text-sm",
          })
        );
        w.appendChild(input);
        return w;
      })(),
    });
    const foot = m.modal.querySelector(".modal-foot");
    foot.innerHTML = "";
    foot.appendChild(
      AIPS.util.el("button", {
        class: "btn btn-primary",
        text: "保存",
        onclick: () => {
          AIPS.store.setStudentName(input.value.trim() || "医学生");
          m.overlay.remove();
          if (typeof window._onStudentNameSet === "function")
            window._onStudentNameSet();
        },
      })
    );
    input.focus();
    return cur;
  }

  return { guardAdmin, setPasscode, getStudentName, promptStudentName };
})();
