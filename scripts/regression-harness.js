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
    Array.isArray(entry.matches) && entry.matches.includes('https://*.emarsys.net/*')
  );

  assert(globalScript, 'Global content script entry not found');
  assert(Array.isArray(globalScript.js), 'Global content script "js" array not found');

  const debugIndex = globalScript.js.indexOf('debug-logging-gate.js');
  const platformIndex = globalScript.js.indexOf('platform.js');
  assert(debugIndex >= 0, 'debug-logging-gate.js missing from global script list');
  assert(platformIndex >= 0, 'platform.js missing from global script list');
  assert(debugIndex < platformIndex, 'debug-logging-gate.js must load before platform.js');
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

runCheck('expanded mode is wired into settings panel UI + storage', () => {
  const src = readFile('extension/settings-panel.js');
  assert(src.includes('const GEM_EXPANDED_MODE_STORAGE_KEY = "fullscreenActive";'));
  assert(src.includes('id="opt-enable-expanded-mode"'));
  assert(src.includes('applyExpandedMode('));
  assert(src.includes('[GEM_EXPANDED_MODE_STORAGE_KEY]'));
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

runCheck('syntax check for edited files', () => {
  const filesToCheck = [
    'settings-panel.js',
    'verticalnav-enhancer.js',
    'overlay-panel-controls.js',
    'email-campaign-list.js',
    'keyword-swap.js',
    'debug-logging-gate.js',
    'platform.js',
    'background.js'
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
