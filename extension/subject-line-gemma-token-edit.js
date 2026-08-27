(function () {
  'use strict';

  const MODAL_ID = 'gem-subject-line-token-modal';
  const BACKDROP_ID = 'gem-subject-line-token-backdrop';
  const PERSONALIZABLE_HOST_SELECTOR =
    'cb-personalizable-input-with-context, cb-personalizable-input';

  function isGemmaPersMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.type === 'cust_esl') return true;
    if (meta.token && meta.token.type === 'cust_esl') return true;
    return false;
  }

  function isGemmaPersTokenDef(tokenDef) {
    if (!tokenDef) return false;
    return isGemmaPersMeta(tokenDef.tokenData);
  }

  function parseAllPersTokens(html) {
    if (typeof window.gemParsePersTokensInHtml === 'function') {
      return window.gemParsePersTokensInHtml(html);
    }
    return [];
  }

  function getGemmaTokensFromHtml(html) {
    return parseAllPersTokens(html).filter((token) => isGemmaPersMeta(token.meta));
  }

  function resolvePersonalizableCmFromTarget(target) {
    if (!target || !target.closest) return null;

    const host = target.closest(PERSONALIZABLE_HOST_SELECTOR);
    if (!host || !host.querySelector('pe-code-editor-token-plugin')) return null;

    const vceCm = target.closest('vce-codemirror');
    if (!vceCm || !host.contains(vceCm)) return null;

    const cmEl = vceCm.querySelector('.CodeMirror');
    if (!cmEl) return null;

    return { host, vceCm, cmEl };
  }

  function resolveCtxFromVceCm(vceCm) {
    if (!vceCm) return null;
    const host = vceCm.closest(PERSONALIZABLE_HOST_SELECTOR);
    if (!host || !host.querySelector('pe-code-editor-token-plugin')) return null;
    const cmEl = vceCm.querySelector('.CodeMirror');
    if (!cmEl) return null;
    return { host, vceCm, cmEl };
  }

  function resolveFocusedPersonalizableVceCm() {
    const focusedCm = document.querySelector('.CodeMirror-focused');
    if (focusedCm) {
      const fromFocus = resolvePersonalizableCmFromTarget(focusedCm);
      if (fromFocus) return fromFocus;
    }

    const subjectCm = document.querySelector('#subject-line-input vce-codemirror');
    return resolveCtxFromVceCm(subjectCm);
  }

  function getCodeMirrorHtml(vceCm, cmInstance) {
    let attrHtml = null;
    if (vceCm) {
      attrHtml = vceCm.getAttribute('html');
    }
    let cmValue = '';
    try {
      cmValue = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
    } catch (_) {}

    if (attrHtml != null && attrHtml.includes('pers-token:1')) return attrHtml;
    if (cmValue.includes('pers-token:1')) return cmValue;
    if (attrHtml != null) return attrHtml;
    return cmValue;
  }

  function resolveCodeMirrorInstance(ctx) {
    if (!ctx) return null;
    if (typeof window.gemResolveCodeMirrorInstance === 'function') {
      return window.gemResolveCodeMirrorInstance(ctx.cmEl, ctx.vceCm, null);
    }
    return ctx.cmEl?.CodeMirror || null;
  }

  function listCodeMirrorWidgets(cmEl) {
    if (!cmEl) return [];
    return Array.from(cmEl.querySelectorAll('.CodeMirror-widget'));
  }

  function resolveGemmaTokenForWidget(widget, ctx) {
    if (!widget || !ctx?.vceCm) return null;

    const cmInstance = resolveCodeMirrorInstance(ctx);
    const html = getCodeMirrorHtml(ctx.vceCm, cmInstance);
    if (!html.includes('pers-token:1')) return null;

    if (cmInstance && typeof cmInstance.posAtDOM === 'function') {
      try {
        const pos = cmInstance.posAtDOM(widget, 0, widget);
        if (pos && typeof cmInstance.indexFromPos === 'function') {
          const index = cmInstance.indexFromPos(pos);
          const byPos =
            typeof window.gemFindPersTokenAtIndex === 'function'
              ? window.gemFindPersTokenAtIndex(html, index)
              : null;
          if (byPos && isGemmaPersMeta(byPos.meta)) return byPos;
        }
      } catch (_) {}
    }

    const allTokens = parseAllPersTokens(html);
    if (!allTokens.length) return null;

    const widgets = listCodeMirrorWidgets(ctx.cmEl);
    const widgetIndex = widgets.indexOf(widget);
    if (widgetIndex >= 0 && widgetIndex < allTokens.length) {
      const byIndex = allTokens[widgetIndex];
      if (isGemmaPersMeta(byIndex?.meta)) return byIndex;
    }

    const label = String(widget.textContent || '').trim();
    if (!label) return null;

    const matches = getGemmaTokensFromHtml(html).filter((token) => token.meta?.tokenName === label);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && widgetIndex >= 0) {
      return matches[Math.min(widgetIndex, matches.length - 1)];
    }

    return matches[0] || null;
  }

  function resolveTokenRangeFromDef(tokenDef, html) {
    if (!tokenDef) return null;

    const pos = tokenDef.position;
    if (pos && typeof pos.from === 'number' && typeof pos.to === 'number') {
      const byRange =
        typeof window.gemFindPersTokenByRange === 'function'
          ? window.gemFindPersTokenByRange(html, pos.from, pos.to)
          : null;
      if (byRange && isGemmaPersMeta(byRange.meta)) return byRange;
    }

    if (pos && typeof pos.from === 'number' && typeof window.gemFindPersTokenAtIndex === 'function') {
      const byIndex = window.gemFindPersTokenAtIndex(html, pos.from);
      if (byIndex && isGemmaPersMeta(byIndex.meta)) return byIndex;
    }

    const label = String(tokenDef.tokenName || tokenDef.tokenData?.tokenName || '').trim();
    if (label) {
      const matches = getGemmaTokensFromHtml(html).filter((token) => token.meta?.tokenName === label);
      if (matches.length >= 1) return matches[0];
    }

    return null;
  }

  function getTokenScript(token, tokenDef) {
    if (token) {
      return (
        token.meta?.token?.content?.script ||
        token.meta?.preview ||
        token.preview ||
        ''
      );
    }
    return tokenDef?.tokenData?.token?.content?.script || tokenDef?.tokenData?.preview || '';
  }

  function getTokenName(token, tokenDef) {
    if (token) {
      return token.meta?.tokenName || token.meta?.token?.name || 'ESL snippet';
    }
    return tokenDef?.tokenName || tokenDef?.tokenData?.tokenName || 'ESL snippet';
  }

  function closeInlineTokenEditor() {
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(BACKDROP_ID)?.remove();
  }

  function openInlineTokenEditor({ name, code, onApply }) {
    closeInlineTokenEditor();

    const backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:613;';

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.style.cssText =
      'position:fixed;inset:0;z-index:614;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
<div class="e-dialog__container" tabindex="-1" style="width:100%;max-width:650px;height:auto;min-height:auto;">
  <header class="e-dialog__header">
    <span class="e-dialog__title">Edit Emarsys Scripting Language snippet</span>
    <e-tooltip class="e-dialog__close_tooltip" content="Close Dialog">
      <button type="button" class="e-btn e-btn-borderless e-btn-onlyicon e-dialog__close e-dialog__header_actions" data-gem-close>
        <e-icon icon="close" color="inherit">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon text-color-inherit" style="margin:0;">×</div>
          </div>
        </e-icon>
      </button>
    </e-tooltip>
  </header>
  <div class="e-dialog__content" style="max-width:none;">
    <div class="e-field">
      <label class="e-field__label e-field__label-inline" for="gem-subject-line-token-name">Snippet name</label>
      <input class="e-input" id="gem-subject-line-token-name" type="text" maxlength="100" placeholder="Enter snippet name">
    </div>
    <div class="e-field">
      <label class="e-field__label e-field__label-inline" for="gem-subject-line-token-code">Code snippet</label>
      <textarea class="e-input gem-scrollable" id="gem-subject-line-token-code" placeholder="Enter your ESL code snippet" style="background-color:var(--token-input-default-background);font-family:var(--token-font-monospace,monospace);width:100%;min-height:200px;resize:vertical;padding:10px 12px;"></textarea>
    </div>
  </div>
  <div class="e-dialog__footer">
    <div class="e-buttongroup" style="display:flex;align-items:center;justify-content:flex-end;width:100%;gap:10px;">
      <button class="e-btn" type="button" data-gem-cancel>Cancel</button>
      <button class="e-btn e-btn-primary" type="button" data-gem-apply>Apply</button>
    </div>
  </div>
</div>`;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const nameInput = modal.querySelector('#gem-subject-line-token-name');
    const codeInput = modal.querySelector('#gem-subject-line-token-code');
    const applyBtn = modal.querySelector('[data-gem-apply]');
    const cancelBtn = modal.querySelector('[data-gem-cancel]');
    const closeBtn = modal.querySelector('[data-gem-close]');

    if (nameInput) nameInput.value = String(name || '');
    if (codeInput) codeInput.value = String(code || '');

    const close = () => closeInlineTokenEditor();

    backdrop.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);

    applyBtn?.addEventListener('click', () => {
      if (applyBtn.disabled || applyBtn.getAttribute('aria-disabled') === 'true') return;
      const nextName = nameInput ? nameInput.value.trim() : '';
      const nextCode = codeInput ? codeInput.value : '';
      if (!nextName || !nextCode.trim()) {
        window.gemShowToast?.('Snippet name and code are required.', { type: 'warn', durationMs: 2200 });
        return;
      }
      if (typeof onApply === 'function') {
        onApply({ name: nextName, code: nextCode });
      }
      close();
    });

    requestAnimationFrame(() => {
      codeInput?.focus();
      codeInput?.select();
    });
  }

  function applyGemmaTokenEdit(ctx, token, tokenDef, name, code) {
    const wrapped =
      typeof window.gemBuildGemmaCodeMirrorToken === 'function'
        ? window.gemBuildGemmaCodeMirrorToken(name, code)
        : null;
    if (!wrapped || !ctx?.vceCm) {
      window.gemShowToast?.('Could not update Gemma token.', { type: 'warn', durationMs: 2200 });
      return false;
    }

    const html = getCodeMirrorHtml(ctx.vceCm, resolveCodeMirrorInstance(ctx));
    const resolved = token || resolveTokenRangeFromDef(tokenDef, html);
    if (!resolved) {
      window.gemShowToast?.('Could not locate Gemma token to update.', { type: 'warn', durationMs: 2200 });
      return false;
    }

    const ok =
      typeof window.gemReplacePersonalizableCodeMirrorTokenRange === 'function'
        ? window.gemReplacePersonalizableCodeMirrorTokenRange(
            ctx.vceCm,
            ctx.cmEl,
            resolved.start,
            resolved.end,
            wrapped,
            resolved.start + wrapped.length
          )
        : false;

    if (!ok) {
      window.gemShowToast?.('Could not update Gemma token.', { type: 'warn', durationMs: 2200 });
    } else {
      requestAnimationFrame(() => {
        const freshCtx = resolveCtxFromVceCm(ctx.vceCm);
        if (freshCtx) scanAndHijackGemmaWidgets(freshCtx);
      });
    }
    return ok;
  }

  let lastGemmaTokenEditorOpenAt = 0;

  function openGemmaTokenEditorOnce(ctx, token, tokenDef) {
    const now = Date.now();
    if (now - lastGemmaTokenEditorOpenAt < 400) return;
    lastGemmaTokenEditorOpenAt = now;
    openInlineTokenEditor({
      name: getTokenName(token, tokenDef),
      code: getTokenScript(token, tokenDef),
      onApply: ({ name, code }) => {
        applyGemmaTokenEdit(ctx, token, tokenDef, name, code);
      },
    });
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function isPrimaryPointerEvent(event) {
    if (!event) return false;
    if (event.type === 'contextmenu') return false;
    if (typeof event.button === 'number' && event.button !== 0) return false;
    return true;
  }

  function hijackGemmaWidgetIfNeeded(widget, ctx) {
    if (!widget || !ctx) return false;
    if (widget.dataset.gemGemmaLabelHijacked === '1') return true;

    const token = resolveGemmaTokenForWidget(widget, ctx);
    if (!token) return false;

    const label = widget.querySelector('.e-label');
    if (!label || !label.parentNode) return false;

    const replacement = label.cloneNode(true);
    label.parentNode.replaceChild(replacement, label);
    widget.dataset.gemGemmaLabelHijacked = '1';

    const openEditor = (event) => {
      if (!isPrimaryPointerEvent(event)) return;
      blockEvent(event);
      const resolved = resolveGemmaTokenForWidget(widget, ctx) || token;
      openGemmaTokenEditorOnce(ctx, resolved, null);
    };

    replacement.addEventListener('mousedown', openEditor, true);
    replacement.addEventListener('click', openEditor, true);
    return true;
  }

  function scanAndHijackGemmaWidgets(ctx) {
    if (!ctx?.cmEl) return;
    listCodeMirrorWidgets(ctx.cmEl).forEach((widget) => {
      if (widget.dataset.gemGemmaLabelHijacked === '1') return;
      if (hijackGemmaWidgetIfNeeded(widget, ctx)) return;
      requestAnimationFrame(() => {
        hijackGemmaWidgetIfNeeded(widget, ctx);
      });
    });
  }

  function handleGuardedWidgetPointer(event, ctx, widget) {
    if (!isPrimaryPointerEvent(event)) return false;
    if (widget?.dataset?.gemGemmaLabelHijacked === '1') return true;

    const token = resolveGemmaTokenForWidget(widget, ctx);
    if (!token) return false;

    blockEvent(event);
    openGemmaTokenEditorOnce(ctx, token, null);
    return true;
  }

  function setupVceCodeMirrorWidgetGuards(vceCm) {
    const ctx = resolveCtxFromVceCm(vceCm);
    if (!ctx || vceCm.dataset.gemWidgetGuardsInstalled === '1') return;
    vceCm.dataset.gemWidgetGuardsInstalled = '1';

    scanAndHijackGemmaWidgets(ctx);

    const onPointer = (event) => {
      const widget = event.target.closest?.('.CodeMirror-widget');
      if (!widget || !ctx.cmEl.contains(widget)) return;
      handleGuardedWidgetPointer(event, ctx, widget);
    };

    vceCm.addEventListener('pointerdown', onPointer, true);
    vceCm.addEventListener('mousedown', onPointer, true);
    vceCm.addEventListener('click', onPointer, true);

    if (ctx.cmEl._gemWidgetHijackObserver) return;
    const observer = new MutationObserver(() => {
      scanAndHijackGemmaWidgets(ctx);
    });
    observer.observe(ctx.cmEl, { childList: true, subtree: true });
    ctx.cmEl._gemWidgetHijackObserver = observer;
  }

  function setupPersonalizableHosts(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(PERSONALIZABLE_HOST_SELECTOR).forEach((host) => {
      if (!host.querySelector('pe-code-editor-token-plugin')) return;
      host.querySelectorAll('vce-codemirror').forEach((vceCm) => {
        setupVceCodeMirrorWidgetGuards(vceCm);
        const ctx = resolveCtxFromVceCm(vceCm);
        if (ctx) scanAndHijackGemmaWidgets(ctx);
      });
    });
  }

  function handleGemmaTokenFromPlugin(tokenDef) {
    const ctx = resolveFocusedPersonalizableVceCm();
    if (!ctx) return;

    const html = getCodeMirrorHtml(ctx.vceCm, resolveCodeMirrorInstance(ctx));
    const token = resolveTokenRangeFromDef(tokenDef, html);
    openGemmaTokenEditorOnce(ctx, token, tokenDef);
  }

  function wrapFindTokens(strategy) {
    if (!strategy || typeof strategy.findTokens !== 'function' || strategy.findTokens._gemGemmaWrapped) {
      return;
    }

    const originalFindTokens = strategy.findTokens.bind(strategy);
    strategy.findTokens = function (html) {
      const tokens = originalFindTokens(html) || [];
      return tokens.map((tokenDef) => {
        if (!isGemmaPersTokenDef(tokenDef)) return tokenDef;
        return {
          ...tokenDef,
          onClick: () => {
            handleGemmaTokenFromPlugin(tokenDef);
          },
        };
      });
    };
    strategy.findTokens._gemGemmaWrapped = true;
  }

  function patchTokenPluginElement(pluginEl) {
    if (!pluginEl || pluginEl._gemTokenPluginPatched || typeof pluginEl.getStrategy !== 'function') {
      return;
    }

    const originalGetStrategy = pluginEl.getStrategy.bind(pluginEl);
    pluginEl.getStrategy = function () {
      const strategy = originalGetStrategy();
      wrapFindTokens(strategy);
      return strategy;
    };

    try {
      wrapFindTokens(pluginEl.getStrategy());
    } catch (_) {}

    pluginEl._gemTokenPluginPatched = true;
  }

  function patchAllTokenPlugins(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('pe-code-editor-token-plugin').forEach(patchTokenPluginElement);
  }

  function handlePersonalizableCmPointer(event) {
    const ctx = resolvePersonalizableCmFromTarget(event.target);
    if (!ctx) return;

    const widget = event.target.closest?.('.CodeMirror-widget');
    if (!widget || !ctx.cmEl.contains(widget)) return;

    handleGuardedWidgetPointer(event, ctx, widget);
  }

  function setupPersonalizableCodeMirrorGemmaTokenClickHandler() {
    if (document.documentElement.dataset.gemSubjectLineTokenEditInstalled) return;
    document.documentElement.dataset.gemSubjectLineTokenEditInstalled = '1';

    patchAllTokenPlugins(document);
    setupPersonalizableHosts(document);

    const onDomChange = () => {
      setupPersonalizableHosts(document);
      patchAllTokenPlugins(document);
    };

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            setupPersonalizableHosts(node);
            patchAllTokenPlugins(node);
          });
        });
      });
    } else {
      new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            onDomChange();
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('pointerdown', handlePersonalizableCmPointer, true);
    document.addEventListener('mousedown', handlePersonalizableCmPointer, true);
    document.addEventListener('click', handlePersonalizableCmPointer, true);
  }

  window.gemSetupPersonalizableCodeMirrorGemmaTokenClickHandler =
    setupPersonalizableCodeMirrorGemmaTokenClickHandler;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPersonalizableCodeMirrorGemmaTokenClickHandler);
  } else {
    setupPersonalizableCodeMirrorGemmaTokenClickHandler();
  }
})();
