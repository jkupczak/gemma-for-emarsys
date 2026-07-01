(function () {
  if (window.gemShowToast) return;

  window.gemShowToast = function gemShowToast(message, opts = {}) {
    try {
      const type = opts.type || "info";
      const baseDurationMs = typeof opts.durationMs === "number" ? opts.durationMs : 2400;
      const durationMs = baseDurationMs * 2;

      let container = document.getElementById("gem-toast-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "gem-toast-container";
        container.style.position = "fixed";
        container.style.right = "16px";
        container.style.bottom = "16px";
        container.style.zIndex = "100000";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "10px";
        container.style.pointerEvents = "none";
        document.body.appendChild(container);
      }

      const toast = document.createElement("div");
      toast.className = "gem-toast";
      toast.style.pointerEvents = "auto";
      toast.style.userSelect = "text";
      toast.style.webkitUserSelect = "text";
      toast.style.cursor = "text";
      toast.style.padding = "10px 12px";
      toast.style.borderRadius = "10px";
      toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.20)";
      toast.style.border = "1px solid var(--token-box-default-border, rgba(0,0,0,0.12))";
      toast.style.background = "var(--token-box-default-background, #fff)";
      toast.style.color = "var(--token-font-default, #111)";
      toast.style.fontSize = "13px";
      toast.style.maxWidth = "420px";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      toast.style.transition = "opacity 140ms ease, transform 140ms ease";

      const accent =
        type === "success"
          ? "var(--token-green-600, #16a34a)"
          : type === "warn"
            ? "var(--token-orange-600, #ea580c)"
            : type === "error"
              ? "var(--token-red-600, #dc2626)"
              : "var(--token-blue-600, #2563eb)";
      toast.style.borderLeft = `4px solid ${accent}`;

      toast.textContent = String(message || "");
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });

      let dismissTimer = null;
      let removeTimer = null;

      const dismissToast = () => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(6px)";
        removeTimer = setTimeout(() => toast.remove(), 180);
      };

      const scheduleDismiss = (delayMs) => {
        if (dismissTimer) clearTimeout(dismissTimer);
        if (removeTimer) clearTimeout(removeTimer);
        dismissTimer = setTimeout(dismissToast, delayMs);
      };

      scheduleDismiss(durationMs);

      toast.addEventListener("mouseenter", () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        if (removeTimer) clearTimeout(removeTimer);
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });

      toast.addEventListener("mouseleave", () => {
        scheduleDismiss(1200);
      });
    } catch (_) {}
  };
})();
