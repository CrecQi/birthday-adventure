if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* 本地 file:// 或旧浏览器静默失败 */
    });
  });
}
