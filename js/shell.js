/* ============================================================
   shell.js — 应用外壳交互（移动端侧边栏抽屉、导航高亮）
   被各页面统一引入，HTML 只负责结构，交互集中于此。
   ============================================================ */

(function () {
  function init() {
    const shell = document.querySelector(".app-shell");
    const toggle = document.querySelector(".menu-toggle");
    if (toggle && shell) {
      toggle.addEventListener("click", () => shell.classList.toggle("nav-open"));
    }
    // 移动端点导航后收起抽屉
    document.querySelectorAll(".sidebar-nav a").forEach((a) => {
      a.addEventListener("click", () => shell && shell.classList.remove("nav-open"));
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
