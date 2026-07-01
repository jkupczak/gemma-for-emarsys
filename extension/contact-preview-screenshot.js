(function () {
  "use strict";

  const CONTACT_PREVIEW_ROOT_MARKER = ".cp-contact_preview_section_container, .cp-contact_preview__content";
  const CONTACT_PREVIEW_HEADER_SELECTOR = ".e-dialog__header";
  const CONTACT_PREVIEW_HEADLINE_SLOT_SELECTOR = '[data-testid="headlineSlot"]';
  const CONTACT_PREVIEW_HEADLINE_SLOT_FALLBACK = ".e-dialog__headline-slot";
  const CONTACT_PREVIEW_IFRAME_SELECTOR = "vce-iframes-container iframe";
  const CONTACT_PREVIEW_IFRAME_FALLBACK = ".cp-contact_preview__preview vce-iframes-container iframe";
  const CAPTURE_BUTTON_ATTR = "data-gem-contact-preview-capture-btn";

  /** @type {WeakMap<HTMLElement, HTMLButtonElement>} */
  const buttonsByRoot = new WeakMap();

  function showToast(message, type) {
    if (typeof window.gemShowToast === "function") {
      window.gemShowToast(message, { type: type || "info" });
    }
  }

  function getContactPreviewRoot() {
    const containers = document.querySelectorAll("e-float-container");
    for (const container of containers) {
      if (container.querySelector(CONTACT_PREVIEW_ROOT_MARKER)) {
        return container;
      }
    }
    return null;
  }

  function getContactPreviewHeader(root) {
    if (!root) return null;
    return root.querySelector(CONTACT_PREVIEW_HEADER_SELECTOR);
  }

  function getContactPreviewHeadlineSlot(root) {
    if (!root) return null;
    const header = getContactPreviewHeader(root);
    const scopes = header ? [header, root] : [root];
    for (const scope of scopes) {
      const slot =
        scope.querySelector(CONTACT_PREVIEW_HEADLINE_SLOT_SELECTOR) ||
        scope.querySelector(CONTACT_PREVIEW_HEADLINE_SLOT_FALLBACK);
      if (slot) return slot;
    }
    return null;
  }

  function getContactPreviewSourceIframe(root) {
    if (!root) return null;
    let iframe = root.querySelector(CONTACT_PREVIEW_IFRAME_SELECTOR);
    if (!iframe) {
      iframe = root.querySelector(CONTACT_PREVIEW_IFRAME_FALLBACK);
    }
    if (!iframe) {
      iframe = root.querySelector(".cp-contact_preview__content iframe");
    }
    if (!iframe || !iframe.isConnected) return null;
    try {
      if (!iframe.contentDocument || !iframe.contentDocument.documentElement) {
        return null;
      }
    } catch (_) {
      return null;
    }
    return iframe;
  }

  function findContactPreviewIframeElement(root) {
    if (!root) return null;
    return (
      root.querySelector(CONTACT_PREVIEW_IFRAME_SELECTOR) ||
      root.querySelector(CONTACT_PREVIEW_IFRAME_FALLBACK) ||
      root.querySelector(".cp-contact_preview__content iframe")
    );
  }

  function bindIframeLoadSync(root, iframe) {
    if (!iframe || iframe.dataset.gemContactPreviewCaptureLoadBound === "true") return;
    iframe.dataset.gemContactPreviewCaptureLoadBound = "true";
    iframe.addEventListener("load", syncContactPreviewCaptureButton);
  }

  function syncCaptureButtonState(root, btn) {
    const ready = !!getContactPreviewSourceIframe(root);
    btn.disabled = !ready;
    btn.setAttribute("aria-disabled", ready ? "false" : "true");

    if (!ready) {
      bindIframeLoadSync(root, findContactPreviewIframeElement(root));
    }
  }

  function handleCaptureClick(root) {
    if (!root) return;
    const iframe = getContactPreviewSourceIframe(root);
    if (!iframe) {
      return;
    }
    if (typeof window.gemOpenShareScreenshotStage !== "function") {
      showToast("Screenshot capture is unavailable on this page.", "error");
      return;
    }
    window.gemOpenShareScreenshotStage({ sourceIframe: iframe });
  }

  function ensureCaptureButton(root) {
    const headlineSlot = getContactPreviewHeadlineSlot(root);
    if (!headlineSlot) return;

    let btn = buttonsByRoot.get(root);
    if (!btn || !btn.isConnected) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "e-btn e-btn-borderless gem-contact-preview-capture-btn";
      btn.setAttribute(CAPTURE_BUTTON_ATTR, "true");
      btn.textContent = "Capture Screenshot";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleCaptureClick(root);
      });

      headlineSlot.insertAdjacentElement("afterend", btn);
      buttonsByRoot.set(root, btn);
    }

    syncCaptureButtonState(root, btn);
  }

  function syncContactPreviewCaptureButton() {
    const root = getContactPreviewRoot();
    if (!root) {
      document.querySelectorAll(`[${CAPTURE_BUTTON_ATTR}]`).forEach((btn) => {
        btn.remove();
      });
      return;
    }
    ensureCaptureButton(root);
  }

  function initializeContactPreviewCaptureButton() {
    syncContactPreviewCaptureButton();

    if (typeof window.gemDomWatchSubscribe === "function") {
      window.gemDomWatchSubscribe(syncContactPreviewCaptureButton);
      return;
    }

    const observer = new MutationObserver(syncContactPreviewCaptureButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeContactPreviewCaptureButton);
  } else {
    initializeContactPreviewCaptureButton();
  }
})();
