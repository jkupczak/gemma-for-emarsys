#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT_DIR, 'extension');

let failures = 0;

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

function logPass(name) {
  console.log(`PASS ${name}`);
}

function logFail(name, error) {
  failures += 1;
  const message = error && error.message ? error.message : String(error);
  console.error(`FAIL ${name}: ${message}`);
}

function runCheck(name, fn) {
  try {
    fn();
    logPass(name);
  } catch (error) {
    logFail(name, error);
  }
}

function getSection(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert(start >= 0, `Missing start token: ${startToken}`);
  const end = source.indexOf(endToken, start);
  assert(end >= 0, `Missing end token: ${endToken}`);
  return source.slice(start, end);
}

runCheck('manifest contains debug gate before platform in global content script', () => {
  const manifest = JSON.parse(readFile('extension/manifest.json'));
  const globalScript = (manifest.content_scripts || []).find((entry) =>
    Array.isArray(entry.matches) &&
    entry.matches.includes('https://*.emarsys.net/*') &&
    entry.world !== 'MAIN' &&
    Array.isArray(entry.js) &&
    entry.js.includes('debug-logging-gate.js')
  );

  assert(globalScript, 'Global content script entry not found');
  assert(Array.isArray(globalScript.js), 'Global content script "js" array not found');

  const debugIndex = globalScript.js.indexOf('debug-logging-gate.js');
  const platformIndex = globalScript.js.indexOf('platform.js');
  assert(debugIndex >= 0, 'debug-logging-gate.js missing from global script list');
  assert(platformIndex >= 0, 'platform.js missing from global script list');
  assert(debugIndex < platformIndex, 'debug-logging-gate.js must load before platform.js');

  const mainBridgeEntry = (manifest.content_scripts || []).find((entry) =>
    entry &&
    entry.world === 'MAIN' &&
    Array.isArray(entry.matches) &&
    entry.matches.includes('https://*.emarsys.net/*') &&
    Array.isArray(entry.js) &&
    entry.js.includes('debug-logging-page-bridge.js')
  );
  assert(mainBridgeEntry, 'MAIN-world debug-logging-page-bridge.js entry missing');
  assert(mainBridgeEntry.all_frames === true, 'MAIN-world debug bridge must run in all frames');
  assert(mainBridgeEntry.run_at === 'document_start', 'MAIN-world debug bridge must run at document_start');
});

runCheck('debug-logging-gate suppresses all [Gem…] prefixes when disabled', () => {
  const gateSrc = readFile('extension/debug-logging-gate.js');
  const bridgeSrc = readFile('extension/debug-logging-page-bridge.js');
  assert(
    /prefixRegex\s*=\s*\/\^\\\[gem\/i/.test(gateSrc),
    'debug-logging-gate.js must use /^\\[gem/i prefix regex'
  );
  assert(
    /prefixRegex\s*=\s*\/\^\\\[gem\/i/.test(bridgeSrc),
    'debug-logging-page-bridge.js must use /^\\[gem/i prefix regex'
  );
  assert(
    !gateSrc.includes('Gemma debug logging is available.'),
    'debug-logging-gate.js must not emit ungated help text on install'
  );
  assert(
    !bridgeSrc.includes('Gemma Regression Harness:'),
    'debug-logging-page-bridge.js must not emit ungated harness text on install'
  );

  const prefixRegex = /^\[gem/i;
  [
    '[Gem]',
    '[Gem][FocusLayout]',
    '[Gem][TokenReplace]',
    '[Gem][DraftDirty]',
    '[Gem][BodySync][Bridge]',
    '[Gem][SwapDebug]',
    '[Gem][EmailListOtherRecent]',
    '[Gem][KeywordSwap]'
  ].forEach((sample) => {
    assert(prefixRegex.test(sample), `prefix regex should match ${sample}`);
  });
  assert(!prefixRegex.test('Gemma debug logging is available.'), 'unbracketed help text is not a gated prefix');
});

runCheck('Gemma console log prefixes use [Gem][Feature] formatting', () => {
  const files = [
    'extension/content-block-toolbar.js',
    'extension/keyword-swap.js',
    'extension/focus-layout.js',
    'extension/email-campaign-list.js',
    'extension/mobile-view.js',
    'extension/gem-snippet-iframe-bridge.js',
    'extension/find-replace-dom-utils.js',
    'extension/find-replace-panel.js',
    'extension/magic-fill-panel.js',
    'extension/snippets-tab.js',
    'extension/snippet-context-menu.js',
    'extension/language-load-overlay.js',
    'extension/background.js'
  ];
  const banned = [
    '[gem]',
    '[Gem-Keyword-Swap]',
    '[Gem-Focus-Layout]',
    '[gem:swap-debug]',
    '[GemTokenReplace]',
    '[GemDraftDirty]',
    '[GemBodySync]',
    '[Gemma email-campaign-list]',
    '[Gem mobile-view]',
    '[Gem] BG]',
    '[Gem][CM Token Insert]',
    '[Gem] Language Load Overlay'
  ];
  files.forEach((rel) => {
    const src = readFile(rel);
    banned.forEach((prefix) => {
      assert(!src.includes(prefix), `${rel} still contains legacy prefix ${prefix}`);
    });
  });
  assert(readFile('extension/content-block-toolbar.js').includes("[Gem][DraftDirty]"));
  assert(readFile('extension/keyword-swap.js').includes('[Gem][KeywordSwap]'));
  assert(readFile('extension/email-campaign-list.js').includes('[Gem][EmailCampaignList]'));
});

runCheck('platform.js is not duplicated in campaign-specific script list', () => {
  const manifest = JSON.parse(readFile('extension/manifest.json'));
  const campaignScript = (manifest.content_scripts || []).find((entry) =>
    Array.isArray(entry.matches) &&
    entry.matches.some((match) => match.includes('contentBlocks/campaign'))
  );

  assert(campaignScript, 'Campaign content script entry not found');
  const occurrences = (campaignScript.js || []).filter((name) => name === 'platform.js').length;
  assert.strictEqual(occurrences, 0, 'platform.js should not be in the campaign script list');
});

runCheck('Focus Layout is wired into settings panel UI + storage', () => {
  const src = readFile('extension/settings-panel.js');
  assert(src.includes('const GEM_FOCUS_LAYOUT_STORAGE_KEY = "fullscreenActive";'));
  assert(src.includes('id="opt-enable-focus-layout"'));
  assert(src.includes('applyFocusLayout('));
  assert(src.includes('[GEM_FOCUS_LAYOUT_STORAGE_KEY]'));
});

runCheck('Focus Layout boots early on <html> at document_start', () => {
  const manifest = JSON.parse(readFile('extension/manifest.json'));
  const bootEntry = (manifest.content_scripts || []).find(
    (entry) =>
      Array.isArray(entry.js) &&
      entry.js.includes('gem-focus-layout-boot.js') &&
      entry.run_at === 'document_start'
  );
  assert(bootEntry, 'gem-focus-layout-boot.js document_start entry missing');
  assert(
    Array.isArray(bootEntry.css) && bootEntry.css.includes('css--focus-layout.css'),
    'css--focus-layout.css should inject at document_start with boot script'
  );

  const bootSrc = readFile('extension/gem-focus-layout-boot.js');
  assert(bootSrc.includes('document.documentElement'));
  assert(bootSrc.includes('gem-focus-layout'));
  assert(bootSrc.includes('fullscreenActive'));

  const css = readFile('extension/css--focus-layout.css');
  assert(css.includes('html.gem-focus-layout'));

  const enhancer = readFile('extension/verticalnav-enhancer.js');
  assert(!enhancer.includes('waitForElement("main.e-layout__content"'));
  assert(enhancer.includes('document.documentElement'));
});

runCheck('email campaign list waits for enabled state without polling intervals', () => {
  const src = readFile('extension/email-campaign-list.js');
  const section = getSection(
    src,
    'function waitForEnabled(selector, callback, options = {})',
    'function gemRunEmailCampaignListLoadAll()'
  );
  assert(!section.includes('setInterval('), 'waitForEnabled should not use setInterval polling');
  assert(section.includes('new MutationObserver('), 'waitForEnabled should use MutationObserver');
});

runCheck('save button sync no longer uses perpetual interval fallback', () => {
  const src = readFile('extension/overlay-panel-controls.js');
  const section = getSection(
    src,
    'function setupSaveButtonSync()',
    'function initializeOverlayPanelControls()'
  );
  assert(!section.includes('setInterval('), 'setupSaveButtonSync should not use setInterval');
  assert(section.includes('new MutationObserver('), 'setupSaveButtonSync should use MutationObserver');
});

runCheck('keyword swap readiness event wiring exists', () => {
  const overlaySrc = readFile('extension/overlay-panel-controls.js');
  const keywordSwapSrc = readFile('extension/keyword-swap.js');
  assert(overlaySrc.includes('gem:keyword-swap-ready'));
  assert(keywordSwapSrc.includes("window.dispatchEvent(new CustomEvent('gem:keyword-swap-ready'))"));
});

runCheck('email body replacements use allowlisted HTML sanitizer', () => {
  const src = readFile('extension/find-replace-dom-utils.js');
  assert(src.includes('function sanitizeAllowlistedHtml('));
  assert(src.includes("'strike'"));
  assert(src.includes('function applyTextReplacementsInEditableRoot('));
  assert(src.includes('if (hasReplacement && !simulateOnly)'));
  assert(src.includes('applyTextReplacementsInEditableRoot(root, matcher, replacement, context)'));
});

runCheck('image alt and subject paths stay plain-text replace', () => {
  const src = readFile('extension/find-replace-dom-utils.js');
  const scanImageAlts = getSection(src, 'function scanImageAlts(', 'function bodySyncLog(');
  assert(!scanImageAlts.includes('applyTextReplacementsInEditableRoot'));
  assert(scanImageAlts.includes('replaceInString(alt, matcher, replacement)'));
  const processSection = getSection(src, 'function processHtmlOrTextContent(', 'function makeSnippetFromChange(');
  assert(!processSection.includes('applyTextReplacementsInEditableRoot'));
  assert(processSection.includes('textNode.nodeValue = result.text'));
});

runCheck('Magic Fill panel still escapes preview HTML in UI', () => {
  const src = readFile('extension/magic-fill-panel.js');
  assert(src.includes('function escapeHtml('));
  assert(src.includes('escapeHtml(item.value)'));
});

runCheck('body dirty path keeps Emarsys focus nudge for Save', () => {
  const frDom = readFile('extension/find-replace-dom-utils.js');
  const markDirty = getSection(frDom, 'function markEmailBodyDirty(', 'function markImageAltsDirty(');
  assert(markDirty.includes('gemMarkEmarsysDraftDirty'));
  assert(
    markDirty.includes('gemNudgeEmarsysDirtyDetectionViaFocus'),
    'markEmailBodyDirty must nudge focus so Emarsys enables Save'
  );
  assert(
    frDom.includes('capturePreviewScrollFromContainer') && frDom.includes('restorePreviewScroll'),
    'container content writes must preserve preview iframe scroll'
  );

  const snippets = readFile('extension/snippets-tab.js');
  const insertHtml = getSection(
    snippets,
    'async function insertHtmlIntoContentEditable(',
    'function notifyEmarsysAfterContentEditableInsert('
  );
  // 14.0.0 behavior: TinyMCE/bridge inserts leave focus in-field for natural blur dirty.
  assert(insertHtml.includes('if (!insertedViaTinyMCE)'));
  assert(insertHtml.includes('notifyEmarsysAfterContentEditableInsert'));
  assert(insertHtml.includes('nudgeFocus: true'));
  assert(
    insertHtml.includes('tinymce-insert + toolbar-style nudge') ||
      insertHtml.includes('after-nudge-request'),
    'TinyMCE inserts should use toolbar-style focus nudge for Save'
  );
  assert(
    !insertHtml.includes('syncTouchedEditablesIntoContainerContent'),
    'TinyMCE inserts must not surgical-sync container (rebuilds iframe, wipes dirty)'
  );
  assert(
    !/markEmailBodyDirty\(doc,\s*\[element\]\)/.test(insertHtml),
    'contenteditable TinyMCE inserts must not force markEmailBodyDirty (blocks natural blur dirty)'
  );

  const toolbar = readFile('extension/content-block-toolbar.js');
  const swapFn = getSection(toolbar, 'function applyTextSwapForBlock(', 'function escapeTokenContentForAttribute(');
  assert(
    swapFn.includes('nudgeEmarsysDirtyDetectionViaFocus') &&
      !/markEmailBodyDirty\s*\(/.test(swapFn),
    'keyword swap must use light dirty nudge (not markEmailBodyDirty surgical sync)'
  );

  const ctxMenu = readFile('extension/snippet-context-menu.js');
  assert(
    ctxMenu.includes('querySelectorAll(MCE_ESL_WIDGET_SELECTOR)') &&
      ctxMenu.includes('GEM_MCE_INSERT_TOKENS_CLASS'),
    'Insert Tokens button must inject into every TinyMCE ESL toolbar, not a singleton id'
  );
});

runCheck('main nav injectors support legacy and UI5 menus', () => {
  const manifest = readFile('extension/manifest.json');
  assert(manifest.includes('nav-menu-utils.js'), 'manifest must load nav-menu-utils.js');
  assert(
    manifest.indexOf('nav-menu-utils.js') < manifest.indexOf('nav-menu-inject.js'),
    'nav-menu-utils.js must load before nav-menu-inject.js'
  );

  const utils = readFile('extension/nav-menu-utils.js');
  assert(utils.includes('ui5-side-navigation-ds-nav'));
  assert(utils.includes('e-navigation__menu_list'));
  assert(utils.includes('buildUi5ActionItem'));
  assert(utils.includes('collectEmarsysNavLinks'));

  const inject = readFile('extension/nav-menu-inject.js');
  assert(inject.includes('buildUi5SettingsItem') && inject.includes('buildLegacySettingsItem'));

  const notes = readFile('extension/notes.js');
  assert(notes.includes('buildUi5NotesNavItem') && notes.includes('buildLegacyNotesNavItem'));

  const recent = readFile('extension/recent-campaigns.js');
  assert(recent.includes('buildUi5RecentNavItem') && recent.includes('buildLegacyRecentNavItem'));

  const palette = readFile('extension/command-palette.js');
  assert(palette.includes('gemNavMenu.collectEmarsysNavLinks') || palette.includes('collectEmarsysNavLinks'));
});

runCheck('personalization tokens prefetch once per campaign page load', () => {
  const src = readFile('extension/personalization-tokens.js');
  assert(src.includes('function ensurePersonalizationTokensLoaded('));
  assert(src.includes('if (sessionTokens !== null)'));
  assert(src.includes('if (sessionFetchPromise)'));
  assert(src.includes('function schedulePersonalizationTokensIdlePrefetch('));
  assert(src.includes('requestIdleCallback'));
  assert(src.includes('schedulePersonalizationTokensIdlePrefetch()'));
});

runCheck('syntax check for edited files', () => {
  const filesToCheck = [
    'settings-panel.js',
    'verticalnav-enhancer.js',
    'overlay-panel-controls.js',
    'email-campaign-list.js',
    'keyword-swap.js',
    'find-replace-dom-utils.js',
    'magic-fill-panel.js',
    'debug-logging-gate.js',
    'platform.js',
    'background.js',
    'emarsys-auth.js',
    'recent-campaigns.js',
    'nav-menu-utils.js',
    'nav-menu-inject.js',
    'notes.js',
    'command-palette.js'
  ];

  filesToCheck.forEach((fileName) => {
    const fullPath = path.join(EXT_DIR, fileName);
    const result = spawnSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`node --check failed for ${fileName}: ${(result.stderr || result.stdout || '').trim()}`);
    }
  });
});

if (failures > 0) {
  console.error(`\nRegression harness completed with ${failures} failing check(s).`);
  process.exit(1);
}

console.log('\nRegression harness completed successfully.');
