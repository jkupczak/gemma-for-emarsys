console.log("[gem] share-screenshot.js loaded");

(function () {
  "use strict";

  const SOURCE_IFRAME_SELECTOR = "iframe.e-contentblocks-preview__iframe-desktop";
  const DEFAULT_WIDTH = 620;
  const MIN_WIDTH = 200;
  const MAX_WIDTH = 1200;
  const IFRAME_HEIGHT = "90vh";
  const CONTROLS_GAP_PX = 16;
  const ASSET_FETCH_TIMEOUT_MS = 12000;
  const ASSET_PROXY_CONCURRENCY = 6;
  const PAGE_FETCH_HOST_PATTERN = /^https?:\/\/(?:[^/]+\.)?(?:cf\.)?emarsys\.net(?:\/|$)/i;
  const CAPTURE_TIMEOUT_MS = 120000;
  const CLIPBOARD_WRITE_TIMEOUT_MS = 30000;
  const SHARE_SCREENSHOT_WIDTH_STORAGE_KEY = "gemShareScreenshotWidth";

  /** @type {null | {
   *   sourceIframe: HTMLIFrameElement,
   *   backdrop: HTMLElement,
   *   iframe: HTMLIFrameElement,
   *   controls: HTMLElement,
   *   widthInput: HTMLInputElement,
   *   captureBtn: HTMLButtonElement,
   *   cancelBtn: HTMLButtonElement,
   *   spinner: HTMLElement,
   *   escapeUnsub: (() => void) | null,
   *   resizeHandler: (() => void) | null,
   *   capturing: boolean,
   * }} */
  let activeStage = null;

  function isDebugEnabled() {
    try {
      if (typeof window.gemIsDebugLoggingEnabled === "function") {
        return !!window.gemIsDebugLoggingEnabled();
      }
      if (typeof window.GEM_DEBUG === "boolean") return window.GEM_DEBUG;
    } catch (_) {}
    return false;
  }

  function logShareScreenshotError(label, err, detail) {
    if (!isDebugEnabled()) return;
    const message = err && err.message ? err.message : String(err || label);
    console.warn(`[Gem-ShareScreenshot] ${label}:`, message, detail || err || "");
  }

  function getShareScreenshotErrorToast(err) {
    const code = err && err.message ? err.message : "unknown";
    if (code === "clipboard_unavailable" || code.includes("NotAllowed")) {
      return "Failed to copy screenshot — clipboard access was blocked.";
    }
    if (code === "html2canvas_unavailable") {
      return "Screenshot capture library failed to load — reload the extension.";
    }
    if (code === "asset_fetch_failed" || code.includes("fetch_failed") || code === "asset_fetch_timeout") {
      return "Failed to load an image for the screenshot — check network access.";
    }
    if (code === "asset_access_denied") {
      return "Screenshot needs permission to load external images — grant access in Preflight, then try again.";
    }
    if (code === "capture_timeout") {
      return "Failed to copy screenshot — capture took too long. Try again.";
    }
    if (code === "clipboard_write_timeout") {
      return "Failed to copy screenshot — clipboard write timed out.";
    }
    if (code === "clone_sync_failed") {
      return "Failed to prepare a clean preview for the screenshot.";
    }
    if (code === "canvas_too_large") {
      return "Failed to copy screenshot — the email preview is too tall to capture.";
    }
    if (isDebugEnabled()) {
      return `Failed to copy screenshot (${code}).`;
    }
    return "Failed to copy screenshot to clipboard.";
  }

  function showToast(message, type) {
    if (typeof window.gemShowToast === "function") {
      window.gemShowToast(message, { type: type || "info" });
    }
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label}_timeout`));
      }, ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  function isInboxPreviewActive() {
    if (typeof window.gemIsInboxPreviewActive === "function") {
      return window.gemIsInboxPreviewActive();
    }
    const el = document.querySelector("cb-campaign-inbox-preview");
    return !!(el && !el.hasAttribute("hidden"));
  }

  function getSourcePreviewIframe() {
    return document.querySelector(SOURCE_IFRAME_SELECTOR);
  }

  function resolveShareScreenshotSourceIframe(options) {
    const opts = options && typeof options === "object" ? options : {};
    const candidate = opts.sourceIframe;
    if (candidate && candidate.isConnected) {
      try {
        if (candidate.contentDocument && candidate.contentDocument.documentElement) {
          return candidate;
        }
      } catch (_) {}
    }
    return getSourcePreviewIframe();
  }

  function raiseShareScreenshotLayer(el, tier) {
    if (typeof window.gemLayerRaise === "function") {
      return window.gemLayerRaise(el, { tier });
    }
    return parseInt(el.style.zIndex || "0", 10) || 0;
  }

  function normalizeWidth(value) {
    const parsed = parseInt(String(value || "").trim(), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed));
  }

  function getStageLayoutWidth() {
    if (!activeStage) return DEFAULT_WIDTH;
    const parsed = parseInt(String(activeStage.widthInput.value || "").trim(), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed));
  }

  function commitStageWidthInput() {
    if (!activeStage) return;
    activeStage.widthInput.value = String(getStageWidth());
  }

  function getStageWidth() {
    if (!activeStage) return DEFAULT_WIDTH;
    return normalizeWidth(activeStage.widthInput.value);
  }

  function readRememberedShareScreenshotWidth(callback) {
    const finish = (value) => {
      callback(normalizeWidth(value));
    };
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ [SHARE_SCREENSHOT_WIDTH_STORAGE_KEY]: DEFAULT_WIDTH }, (res) => {
          if (chrome.runtime.lastError) {
            finish(DEFAULT_WIDTH);
            return;
          }
          finish(res && res[SHARE_SCREENSHOT_WIDTH_STORAGE_KEY]);
        });
        return;
      }
    } catch (_) {}
    finish(DEFAULT_WIDTH);
  }

  function rememberShareScreenshotWidth(width) {
    const value = normalizeWidth(width);
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [SHARE_SCREENSHOT_WIDTH_STORAGE_KEY]: value });
      }
    } catch (_) {}
  }

  function syncScreenshotClone() {
    if (!activeStage) return false;
    if (typeof window.gemSyncSanitizedPreviewClone !== "function") return false;
    return window.gemSyncSanitizedPreviewClone(activeStage.sourceIframe, activeStage.iframe, {
      hideScrollbars: true,
      breakLongWords: false,
    });
  }

  function layoutShareScreenshotStage() {
    if (!activeStage) return;

    const width = getStageLayoutWidth();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const iframeHeightPx = viewportH * 0.9;
    const iframeLeft = Math.max(0, (viewportW - width) / 2);
    const iframeTop = Math.max(0, (viewportH - iframeHeightPx) / 2);

    const { backdrop, iframe } = activeStage;

    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.width = "100%";
    backdrop.style.height = "100%";
    const backdropZ = raiseShareScreenshotLayer(backdrop, "modal");
    backdrop.style.zIndex = String(backdropZ);

    iframe.style.position = "fixed";
    iframe.style.top = `${iframeTop}px`;
    iframe.style.left = `${iframeLeft}px`;
    iframe.style.right = "auto";
    iframe.style.bottom = "auto";
    iframe.style.width = `${width}px`;
    iframe.style.height = IFRAME_HEIGHT;
    iframe.style.maxWidth = "none";
    iframe.style.minWidth = "0";
    iframe.style.margin = "0";
    iframe.style.transform = "none";
    iframe.style.overflow = "auto";
    iframe.style.border = "0";
    iframe.style.background = "#fff";
    iframe.classList.add("gem-share-screenshot-iframe--staged");

    const previewZ = raiseShareScreenshotLayer(iframe, "modal");
    iframe.style.zIndex = String(Math.max(previewZ, backdropZ + 1));

    const controlsRect = activeStage.controls.getBoundingClientRect();
    const controlsWidth = controlsRect.width || 180;
    let controlsLeft = iframeLeft - CONTROLS_GAP_PX - controlsWidth;
    if (controlsLeft < 12) controlsLeft = 12;
    const controlsTop = iframeTop + Math.max(0, (iframeHeightPx - controlsRect.height) / 2);

    activeStage.controls.style.position = "fixed";
    activeStage.controls.style.left = `${controlsLeft}px`;
    activeStage.controls.style.top = `${controlsTop}px`;
    const controlsZ = raiseShareScreenshotLayer(activeStage.controls, "modal");
    activeStage.controls.style.zIndex = String(Math.max(controlsZ, previewZ + 1));
  }

  function setCaptureBusy(busy) {
    if (!activeStage) return;
    activeStage.capturing = busy;
    activeStage.captureBtn.disabled = busy;
    activeStage.cancelBtn.disabled = busy;
    activeStage.widthInput.disabled = busy;
    activeStage.captureBtn.classList.toggle("gem-share-screenshot-capture--busy", busy);
    activeStage.spinner.hidden = !busy;
  }

  async function waitForIframeImages(doc) {
    const imgs = Array.from(doc.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve(undefined);
              return;
            }
            const done = () => resolve(undefined);
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          }),
      ),
    );
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(undefined));
      });
    });
  }

  function resolveScreenshotImageUrl(raw, baseUri) {
    const trimmed = String(raw || "").trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;
    try {
      return new URL(trimmed, baseUri || location.href).href;
    } catch (_) {
      return null;
    }
  }

  function isSvgImageUrl(url) {
    return /\.svg(?:$|[?#])/i.test(String(url || ""));
  }

  function shouldProxyImageForCapture(raw, baseUri) {
    const absolute = resolveScreenshotImageUrl(raw, baseUri);
    return !!(absolute && /^https?:/i.test(absolute));
  }

  function waitForImageElement(img) {
    return new Promise((resolve) => {
      if (img.complete) {
        resolve(undefined);
        return;
      }
      img.onload = () => resolve(undefined);
      img.onerror = () => resolve(undefined);
    });
  }

  function rasterizeImageDataUrl(dataUrl, targetImg) {
    return new Promise((resolve) => {
      const attrW = parseInt(String(targetImg.getAttribute("width") || targetImg.width || ""), 10);
      const attrH = parseInt(String(targetImg.getAttribute("height") || targetImg.height || ""), 10);
      const styleMaxW = parseInt(String(targetImg.style.maxWidth || ""), 10);
      const fallbackW = Math.max(1, attrW || styleMaxW || targetImg.clientWidth || 100);
      const fallbackH = Math.max(1, attrH || targetImg.clientHeight || 37);

      const img = new Image();
      img.onload = () => {
        const w = Math.max(1, attrW || img.naturalWidth || fallbackW);
        const h = Math.max(1, attrH || img.naturalHeight || fallbackH);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.crossOrigin = "anonymous";
      img.src = dataUrl;
    });
  }

  async function applyProxiedImageSrc(img, dataUrl, absolute) {
    img.removeAttribute("srcset");
    img.crossOrigin = "anonymous";

    if (isSvgImageUrl(absolute)) {
      const pngDataUrl = await rasterizeImageDataUrl(dataUrl, img);
      if (pngDataUrl) {
        img.src = pngDataUrl;
        await waitForImageElement(img);
        return;
      }
    }

    img.src = dataUrl;
    await waitForImageElement(img);
  }

  function canFetchScreenshotAssetInPage(absolute) {
    return PAGE_FETCH_HOST_PATTERN.test(String(absolute || ""));
  }

  async function blobToScreenshotDataUrl(blob, absoluteUrl) {
    const mime = blob && blob.type ? blob.type : "";
    if (mime === "image/svg+xml" || isSvgImageUrl(absoluteUrl)) {
      const text = await blob.text();
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result ? String(reader.result) : "";
        if (result) resolve(result);
        else reject(new Error("blob_read_failed"));
      };
      reader.onerror = () => reject(new Error("blob_read_failed"));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchScreenshotAssetInPage(url) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`fetch_failed_${response.status}`);
    }
    const blob = await response.blob();
    return blobToScreenshotDataUrl(blob, url);
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error("extension_runtime_unavailable"));
        return;
      }
      chrome.runtime.sendMessage(payload, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "runtime_message_failed"));
          return;
        }
        resolve(res);
      });
    });
  }

  async function fetchScreenshotAssetDataUrl(url) {
    if (canFetchScreenshotAssetInPage(url)) {
      try {
        return await withTimeout(fetchScreenshotAssetInPage(url), ASSET_FETCH_TIMEOUT_MS, "asset_fetch_page");
      } catch (_) {
        // Fall back to background fetch for Emarsys URLs if in-page fetch fails.
      }
    }

    return withTimeout(
      sendRuntimeMessage({ action: "gemFetchScreenshotAsset", url }).then((res) => {
        if (!res || !res.ok || !res.dataUrl) {
          throw new Error((res && res.reason) || "asset_fetch_failed");
        }
        return res.dataUrl;
      }),
      ASSET_FETCH_TIMEOUT_MS,
      "asset_fetch",
    );
  }

  async function runWithConcurrency(items, limit, worker) {
    if (!items.length) return;
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    });
    await Promise.all(runners);
  }

  async function proxyIframeImagesForCapture(doc) {
    const baseUri = doc.baseURI || location.href;
    const imgs = Array.from(doc.querySelectorAll("img"));
    /** @type {{ img: HTMLImageElement, src: string | null, srcset: string | null, crossOrigin: string | null }[]} */
    const restores = [];
    const proxyTargets = imgs
      .map((img) => {
        const raw = String(img.currentSrc || img.getAttribute("src") || "").trim();
        const absolute = shouldProxyImageForCapture(raw, baseUri)
          ? resolveScreenshotImageUrl(raw, baseUri)
          : null;
        return absolute ? { img, raw, absolute } : null;
      })
      .filter(Boolean);

    await runWithConcurrency(proxyTargets, ASSET_PROXY_CONCURRENCY, async ({ img, absolute }) => {
      try {
        const dataUrl = await fetchScreenshotAssetDataUrl(absolute);
        restores.push({
          img,
          src: img.getAttribute("src"),
          srcset: img.getAttribute("srcset"),
          crossOrigin: img.getAttribute("crossorigin"),
        });
        await applyProxiedImageSrc(img, dataUrl, absolute);
      } catch (err) {
        logShareScreenshotError("image proxy failed", err, { url: absolute });
      }
    });

    return restores;
  }

  function restoreProxiedImages(restores) {
    restores.forEach(({ img, src, srcset, crossOrigin }) => {
      if (!img.isConnected) return;
      if (src == null) img.removeAttribute("src");
      else img.setAttribute("src", src);
      if (srcset == null) img.removeAttribute("srcset");
      else img.setAttribute("srcset", srcset);
      if (crossOrigin == null) img.removeAttribute("crossorigin");
      else img.setAttribute("crossorigin", crossOrigin);
    });
  }

  const MAX_CANVAS_EDGE_PX = 16384;

  function fitCanvasDimensions(width, height) {
    let w = Math.max(1, Math.round(width));
    let h = Math.max(1, Math.round(height));
    const fit = Math.min(1, MAX_CANVAS_EDGE_PX / w, MAX_CANVAS_EDGE_PX / h);
    if (fit < 1) {
      w = Math.round(w * fit);
      h = Math.round(h * fit);
    }
    return { width: w, height: h, fit };
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("blob_failed"));
      }, "image/png");
    });
  }

  async function captureStagedPreview() {
    if (!activeStage) throw new Error("preview_unavailable");
    const { iframe } = activeStage;

    if (!syncScreenshotClone()) {
      throw new Error("clone_sync_failed");
    }

    const doc = iframe.contentDocument;
    if (!doc) throw new Error("preview_unavailable");

    if (typeof html2canvas !== "function") throw new Error("html2canvas_unavailable");

    const scrollRoot = doc.documentElement;
    const body = doc.body;
    if (!scrollRoot) throw new Error("preview_unavailable");

    const width = getStageWidth();
    const contentHeight = Math.max(
      scrollRoot.scrollHeight,
      body ? body.scrollHeight : 0,
      scrollRoot.clientHeight,
    );
    if (contentHeight <= 0) throw new Error("preview_unavailable");

    const originalScrollY = iframe.contentWindow
      ? iframe.contentWindow.scrollY
      : scrollRoot.scrollTop || 0;

    let proxiedImages = [];

    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.scrollTo(0, 0);
      } else {
        scrollRoot.scrollTop = 0;
      }
      await waitForPaint();

      proxiedImages = await proxyIframeImagesForCapture(doc);

      await waitForIframeImages(doc);
      await waitForPaint();

      const fitted = fitCanvasDimensions(width, contentHeight);
      const target = body || scrollRoot;

      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        logging: isDebugEnabled(),
        useCORS: true,
        allowTaint: false,
        scale: fitted.fit,
        windowWidth: width,
        windowHeight: contentHeight,
        width,
        height: contentHeight,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
      });

      if (fitted.fit < 1 && isDebugEnabled()) {
        logShareScreenshotError("capture scaled down for canvas limits", null, {
          contentHeight,
          fitted,
        });
      }

      return canvas;
    } finally {
      restoreProxiedImages(proxiedImages);
      if (iframe.contentWindow) {
        iframe.contentWindow.scrollTo(0, originalScrollY);
      } else {
        scrollRoot.scrollTop = originalScrollY;
      }
    }
  }

  function teardownShareScreenshotStage(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (!activeStage) return;

    const { backdrop, iframe, controls, escapeUnsub, resizeHandler } = activeStage;

    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
    }
    if (typeof escapeUnsub === "function") {
      escapeUnsub();
    }

    backdrop.remove();
    if (typeof window.gemLayerRelease === "function") {
      window.gemLayerRelease(backdrop);
    }

    iframe.remove();
    if (typeof window.gemLayerRelease === "function") {
      window.gemLayerRelease(iframe);
    }

    controls.remove();
    if (typeof window.gemLayerRelease === "function") {
      window.gemLayerRelease(controls);
    }

    document.documentElement.classList.remove("gem-share-screenshot-stage-open");
    activeStage = null;

    if (opts.toastMessage) {
      showToast(opts.toastMessage, opts.toastType || "success");
    }
  }

  async function handleCaptureClick() {
    if (!activeStage || activeStage.capturing) return;
    setCaptureBusy(true);

    /** @type {((value: Blob) => void) | null} */
    let resolveClipboardBlob = null;
    /** @type {((reason?: unknown) => void) | null} */
    let rejectClipboardBlob = null;
    /** @type {Promise<void> | null} */
    let clipboardWritePromise = null;

    try {
      if (navigator.clipboard && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const blobPromise = new Promise((resolve, reject) => {
          resolveClipboardBlob = resolve;
          rejectClipboardBlob = reject;
        });
        clipboardWritePromise = navigator.clipboard.write([
          new ClipboardItem({ "image/png": blobPromise }),
        ]);
      }

      const canvas = await withTimeout(captureStagedPreview(), CAPTURE_TIMEOUT_MS, "capture");
      const blob = await canvasToBlob(canvas);

      if (resolveClipboardBlob) {
        resolveClipboardBlob(blob);
        await withTimeout(clipboardWritePromise, CLIPBOARD_WRITE_TIMEOUT_MS, "clipboard_write");
      } else {
        await copyCanvasToClipboard(canvas);
      }

      rememberShareScreenshotWidth(getStageWidth());
      teardownShareScreenshotStage({
        toastMessage: "Preview screenshot copied to clipboard.",
        toastType: "success",
      });
    } catch (err) {
      if (rejectClipboardBlob) {
        rejectClipboardBlob(err);
        if (clipboardWritePromise) {
          await clipboardWritePromise.catch(() => {});
        }
      }
      logShareScreenshotError("capture failed", err);
      setCaptureBusy(false);
      showToast(getShareScreenshotErrorToast(err), "error");
    }
  }

  async function copyCanvasToClipboard(canvas) {
    const blob = await canvasToBlob(canvas);
    if (!navigator.clipboard || typeof ClipboardItem === "undefined" || !navigator.clipboard.write) {
      throw new Error("clipboard_unavailable");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }

  function handleCancelClick() {
    if (!activeStage || activeStage.capturing) return;
    teardownShareScreenshotStage();
  }

  function openShareScreenshotStage(options) {
    if (activeStage) return;

    if (isInboxPreviewActive()) {
      showToast("Share Screenshot is unavailable while Inbox Preview is active.", "error");
      return;
    }

    const sourceIframe = resolveShareScreenshotSourceIframe(options);
    if (!sourceIframe) {
      showToast("Desktop preview is not available.", "error");
      return;
    }

    if (typeof window.gemSyncSanitizedPreviewClone !== "function") {
      showToast("Screenshot preview clone is unavailable.", "error");
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "gem-share-screenshot-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.addEventListener("click", handleCancelClick);

    const cloneIframe = document.createElement("iframe");
    cloneIframe.className = "gem-share-screenshot-clone gem-share-screenshot-iframe--staged";
    cloneIframe.setAttribute("title", "Screenshot preview");
    document.body.appendChild(backdrop);
    document.body.appendChild(cloneIframe);

    if (!window.gemSyncSanitizedPreviewClone(sourceIframe, cloneIframe, {
      hideScrollbars: true,
      breakLongWords: false,
    })) {
      backdrop.remove();
      cloneIframe.remove();
      showToast("Could not prepare a clean preview for the screenshot.", "error");
      return;
    }

    const controls = document.createElement("div");
    controls.className = "gem-share-screenshot-controls";
    controls.setAttribute("role", "dialog");
    controls.setAttribute("aria-label", "Share screenshot controls");

    const widthLabel = document.createElement("label");
    widthLabel.className = "gem-share-screenshot-controls__width-field";

    const widthLabelText = document.createElement("span");
    widthLabelText.className = "gem-share-screenshot-controls__width-label";
    widthLabelText.textContent = "Width (px)";

    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.className = "gem-share-screenshot-controls__width-input";
    widthInput.min = String(MIN_WIDTH);
    widthInput.max = String(MAX_WIDTH);
    widthInput.step = "1";
    widthInput.value = String(DEFAULT_WIDTH);
    widthInput.setAttribute("aria-label", "Preview width in pixels");
    widthLabel.appendChild(widthLabelText);
    widthLabel.appendChild(widthInput);

    const captureBtn = document.createElement("button");
    captureBtn.type = "button";
    captureBtn.className = "e-btn gem-share-screenshot-capture";

    const captureLabel = document.createElement("span");
    captureLabel.className = "gem-share-screenshot-capture__label";
    captureLabel.textContent = "Copy Screenshot";

    const spinner = document.createElement("span");
    spinner.className = "gem-share-screenshot-capture__spinner";
    spinner.setAttribute("aria-hidden", "true");
    spinner.hidden = true;

    captureBtn.appendChild(captureLabel);
    captureBtn.appendChild(spinner);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "e-btn e-btn-borderless gem-share-screenshot-cancel";
    cancelBtn.textContent = "Cancel";

    controls.appendChild(widthLabel);
    controls.appendChild(captureBtn);
    controls.appendChild(cancelBtn);
    document.body.appendChild(controls);

    const resizeHandler = () => layoutShareScreenshotStage();
    window.addEventListener("resize", resizeHandler);

    let escapeUnsub = null;
    if (typeof window.gemLayerBindEscape === "function") {
      escapeUnsub = window.gemLayerBindEscape(() => {
        handleCancelClick();
      }, {
        whileConnected: () => !!activeStage && !activeStage.capturing,
      });
    }

    activeStage = {
      sourceIframe,
      backdrop,
      iframe: cloneIframe,
      controls,
      widthInput,
      captureBtn,
      cancelBtn,
      spinner,
      escapeUnsub,
      resizeHandler,
      capturing: false,
    };

    widthInput.addEventListener("input", () => {
      layoutShareScreenshotStage();
    });
    widthInput.addEventListener("change", () => {
      commitStageWidthInput();
      layoutShareScreenshotStage();
    });
    widthInput.addEventListener("blur", () => {
      commitStageWidthInput();
      layoutShareScreenshotStage();
    });
    captureBtn.addEventListener("click", () => {
      void handleCaptureClick();
    });
    cancelBtn.addEventListener("click", handleCancelClick);

    readRememberedShareScreenshotWidth((width) => {
      if (!activeStage) return;
      activeStage.widthInput.value = String(width);
      document.documentElement.classList.add("gem-share-screenshot-stage-open");
      layoutShareScreenshotStage();
    });
  }

  window.gemOpenShareScreenshotStage = openShareScreenshotStage;
})();
