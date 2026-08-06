// campaign-links-data.js — extract link rows from content-blocks campaign snapshots
(function () {
  'use strict';

  function isTrackingEnabled(attributes) {
    if (!attributes || typeof attributes !== 'object') return true;
    const notrack = attributes['ems:notrack'];
    return notrack !== 'true' && notrack !== true;
  }

  // Emarsys treats mailto links and bare browse-href token forms as non-trackable.
  // Embedded variants (e.g. https://example.com/?url=#HTML_BROWSE_HREF#) remain trackable.
  function isEmarsysNonTrackableSystemHref(href) {
    const normalized = String(href || '').trim();
    if (/^mailto:/i.test(normalized)) return true;
    return normalized === '#HTML_BROWSE_HREF#' || normalized === '#HTML_BROWSE_HREF#?';
  }

  function resolveReadOnlyLinkTracking(readOnlyLinks, anchorIndex) {
    if (!Array.isArray(readOnlyLinks)) return null;

    const entry = readOnlyLinks[anchorIndex];
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.is_tracked === 'boolean') return entry.is_tracked;

    return null;
  }

  function resolveLinkTracking(href, anchor, readOnlyLinks, anchorIndex, configuredUrlField) {
    const normalizedHref = String(href || '').trim();
    if (!normalizedHref) return true;

    const readOnlyTracked = resolveReadOnlyLinkTracking(readOnlyLinks, anchorIndex);
    if (readOnlyTracked !== null) return readOnlyTracked;

    if (isEmarsysNonTrackableSystemHref(normalizedHref)) {
      return false;
    }

    if (configuredUrlField) {
      return configuredUrlField.tracked;
    }

    const notrack = anchor && anchor.getAttribute('ems:notrack');
    if (notrack !== null && String(notrack).trim() !== '') {
      return isTrackingEnabled({ 'ems:notrack': notrack });
    }

    return true;
  }

  function resolveAnchorTracking(anchor, readOnlyLinks, anchorIndex, configuredUrlField) {
    const href = configuredUrlField
      ? configuredUrlField.href
      : String(anchor && anchor.getAttribute('href') || '').trim();

    return resolveLinkTracking(href, anchor, readOnlyLinks, anchorIndex, configuredUrlField);
  }

  function stripHtml(html) {
    const raw = String(html || '');
    if (!raw) return '';

    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      return String(doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function buildLinkRecord(href, tracked, locked, associatedText, associatedTextKind) {
    const normalizedHref = String(href || '').trim();
    if (!normalizedHref) return null;

    return {
      href: normalizedHref,
      tracked: !!tracked,
      locked: !!locked,
      associatedText: String(associatedText || ''),
      associatedTextKind: associatedTextKind === 'image' || associatedTextKind === 'text'
        ? associatedTextKind
        : null,
    };
  }

  function getPairedTextFieldValue(fields, urlFieldKey) {
    if (!fields || !urlFieldKey) return '';

    const textKey = String(urlFieldKey).replace(/URL$/i, 'Text');
    const field = fields[textKey];
    if (!field || typeof field.value !== 'string') return '';

    return stripHtml(field.value);
  }

  function getAnchorAssociatedText(anchor, fields, urlFieldKey) {
    if (!anchor) {
      return { associatedText: '', associatedTextKind: null };
    }

    const img = anchor.querySelector('img');
    if (img) {
      const alt = String(img.getAttribute('alt') || '').trim();
      return { associatedText: alt, associatedTextKind: 'image' };
    }

    const pairedText = urlFieldKey ? getPairedTextFieldValue(fields, urlFieldKey) : '';
    if (pairedText) {
      return { associatedText: pairedText, associatedTextKind: 'text' };
    }

    const text = String(anchor.textContent || '').replace(/\s+/g, ' ').trim();
    return { associatedText: text, associatedTextKind: 'text' };
  }

  function getFieldLinkAssociatedText(field) {
    const alt = field
      && field.attributes
      && String(field.attributes.alt || '').trim();

    return {
      associatedText: alt || '',
      associatedTextKind: 'image',
    };
  }

  function getHtmlAnchorAssociatedText(anchor) {
    if (!anchor) {
      return { associatedText: '', associatedTextKind: null };
    }

    const img = anchor.querySelector('img');
    if (img) {
      return {
        associatedText: String(img.getAttribute('alt') || '').trim(),
        associatedTextKind: 'image',
      };
    }

    return {
      associatedText: String(anchor.textContent || '').replace(/\s+/g, ' ').trim(),
      associatedTextKind: 'text',
    };
  }

  function extractLinkFromFieldLink(field) {
    const link = field && field.link;
    if (!link || typeof link !== 'object') return null;

    const href = String(link.href || '').trim();
    if (!href) return null;

    const { associatedText, associatedTextKind } = getFieldLinkAssociatedText(field);

    return buildLinkRecord(
      href,
      isTrackingEnabled(link),
      false,
      associatedText,
      associatedTextKind
    );
  }

  function extractLinksFromHtml(html) {
    const links = [];
    const raw = String(html || '');
    if (!raw || !raw.includes('<a')) return links;

    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      doc.querySelectorAll('a[href]').forEach((anchor) => {
        const href = String(anchor.getAttribute('href') || '').trim();
        if (!href) return;

        const { associatedText, associatedTextKind } = getHtmlAnchorAssociatedText(anchor);
        const record = buildLinkRecord(
          href,
          resolveLinkTracking(href, anchor, null, null, null),
          false,
          associatedText,
          associatedTextKind
        );
        if (record) links.push(record);
      });
    } catch (_) {}

    return links;
  }

  function buildBlockTemplateIndex(snapshot) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const templates = campaign
      && campaign.template_resources
      && campaign.template_resources.available_block_templates;
    const index = new Map();

    if (!Array.isArray(templates)) return index;

    templates.forEach((template) => {
      const id = String(template && template._id || '').trim();
      if (id) index.set(id, template);
    });

    return index;
  }

  function resolveBlockHtml(block, templateIndex) {
    if (!block) return '';

    if (typeof block.html === 'string' && block.html.trim()) {
      return block.html;
    }

    const templateId = String(block.template || '').trim();
    if (!templateId || !templateIndex) return '';

    const template = templateIndex.get(templateId);
    return template && typeof template.html === 'string' ? template.html : '';
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function resolveBlockOptionals(block, templateIndex) {
    const blockOptionals = block && block.optionals && typeof block.optionals === 'object'
      ? block.optionals
      : {};
    if (Object.keys(blockOptionals).length) return blockOptionals;

    const templateId = String(block && block.template || '').trim();
    if (!templateId || !templateIndex) return blockOptionals;

    const template = templateIndex.get(templateId);
    if (template && template.optionals && typeof template.optionals === 'object') {
      return template.optionals;
    }

    return blockOptionals;
  }

  function collectEditableNamesFromHtmlString(html) {
    const names = new Set();
    const raw = String(html || '');
    if (!raw || !raw.includes('e-editable')) return names;

    const pattern = /\be-editable\s*=\s*(["'])([^"']+)\1/gi;
    let match = pattern.exec(raw);
    while (match) {
      const name = String(match[2] || '').trim();
      if (name) names.add(name);
      match = pattern.exec(raw);
    }

    return names;
  }

  function extractOptionalSegmentInnerHtml(html, optionalName) {
    const blockHtml = String(html || '');
    const name = String(optionalName || '').trim();
    if (!blockHtml || !name || !blockHtml.includes('e-optional')) return '';

    const escapedName = escapeRegExp(name);
    const pattern = new RegExp(
      `<e-optional\\b[^>]*\\bname\\s*=\\s*(["'])${escapedName}\\1[^>]*>([\\s\\S]*?)<\\/e-optional>`,
      'i'
    );
    const match = pattern.exec(blockHtml);
    return match ? match[2] : '';
  }

  function collectDisabledOptionalEditables(html, optionals) {
    const disabled = new Set();
    const map = optionals && typeof optionals === 'object' ? optionals : {};
    const blockHtml = String(html || '');
    if (!blockHtml || !blockHtml.includes('e-optional')) return disabled;

    Object.entries(map).forEach(([optionalName, entry]) => {
      if (!entry || typeof entry !== 'object' || entry.enabled !== false) return;

      const segment = extractOptionalSegmentInnerHtml(blockHtml, optionalName);
      if (!segment) return;

      collectEditableNamesFromHtmlString(segment).forEach((editableName) => {
        disabled.add(editableName);
      });
    });

    return disabled;
  }

  function filterContentForDisabledOptionals(content, disabledEditables) {
    const fields = content && typeof content === 'object' ? content : {};
    if (!Object.keys(fields).length || !disabledEditables || !disabledEditables.size) {
      return fields;
    }

    const filtered = {};
    Object.entries(fields).forEach(([fieldKey, field]) => {
      const editableName = String(fieldKey || '').trim();
      if (editableName && disabledEditables.has(editableName)) return;
      filtered[fieldKey] = field;
    });

    return filtered;
  }

  function isEditableExcluded(editable, excludedEditables) {
    if (!excludedEditables || !excludedEditables.size) return false;
    const name = String(editable || '').trim();
    return !!name && excludedEditables.has(name);
  }

  function stripInactiveOptionalBranches(html, optionals) {
    const blockHtml = String(html || '');
    const map = optionals && typeof optionals === 'object' ? optionals : {};
    if (!blockHtml || !blockHtml.includes('e-optional')) return blockHtml;

    const hasDisabledBranch = Object.values(map).some(
      (entry) => entry && typeof entry === 'object' && entry.enabled === false
    );
    if (!hasDisabledBranch) return blockHtml;

    try {
      const doc = new DOMParser().parseFromString(blockHtml, 'text/html');
      const root = doc.body || doc.documentElement;
      if (!root) return blockHtml;

      root.querySelectorAll('e-optional[name]').forEach((node) => {
        const name = String(node.getAttribute('name') || '').trim();
        if (!name) return;

        const entry = map[name];
        if (entry && typeof entry === 'object' && entry.enabled === false) {
          node.remove();
        }
      });

      return root.innerHTML;
    } catch (_) {
      return blockHtml;
    }
  }

  function collectEditableNamesFromHtml(html) {
    const names = new Set();
    const blockHtml = String(html || '');
    if (!blockHtml || !blockHtml.includes('e-editable')) return names;

    try {
      const doc = new DOMParser().parseFromString(blockHtml, 'text/html');
      doc.querySelectorAll('[e-editable]').forEach((el) => {
        const name = String(el.getAttribute('e-editable') || '').trim();
        if (name) names.add(name);
      });
    } catch (_) {}

    return names;
  }

  function filterContentForStrippedHtml(rawHtml, strippedHtml, content) {
    const fields = content && typeof content === 'object' ? content : {};
    if (!Object.keys(fields).length) return fields;

    const rawEditables = collectEditableNamesFromHtml(rawHtml);
    if (!rawEditables.size) return fields;

    const strippedEditables = collectEditableNamesFromHtml(strippedHtml);
    const filtered = {};

    Object.entries(fields).forEach(([fieldKey, field]) => {
      const editableName = String(fieldKey || '').trim();
      if (!editableName) return;
      if (rawEditables.has(editableName) && !strippedEditables.has(editableName)) return;
      filtered[fieldKey] = field;
    });

    return filtered;
  }

  function cssEscapeAttrValue(value) {
    const raw = String(value || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(raw);
    }
    return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function applyLinkAttributes(anchor, link) {
    if (!anchor || !link || typeof link !== 'object') return;
    const href = String(link.href || '').trim();
    if (href) anchor.setAttribute('href', href);
    Object.entries(link).forEach(([key, val]) => {
      if (key === 'href' || key === 'title') return;
      if (val == null || val === '') return;
      anchor.setAttribute(key, String(val));
    });
    const title = String(link.title || '').trim();
    if (title) anchor.setAttribute('title', title);
  }

  function mergeFieldIntoEditableElement(el, fieldKey, field) {
    if (!el || !field || typeof field !== 'object') return;

    const tag = String(el.tagName || '').toLowerCase();
    const attrs = field.attributes && typeof field.attributes === 'object'
      ? field.attributes
      : null;

    if (tag === 'img') {
      if (attrs) {
        Object.entries(attrs).forEach(([key, val]) => {
          if (val == null || val === '') return;
          el.setAttribute(key, String(val));
        });
      }
      const anchor = el.closest('a');
      if (field.link) applyLinkAttributes(anchor, field.link);
      return;
    }

    if (tag === 'a') {
      if (/URL$/i.test(fieldKey) && attrs && attrs.href) {
        el.setAttribute('href', String(attrs.href));
        Object.entries(attrs).forEach(([key, val]) => {
          if (key === 'href' || val == null || val === '') return;
          el.setAttribute(key, String(val));
        });
      } else if (field.link) {
        applyLinkAttributes(el, field.link);
      }
      if (typeof field.value === 'string') {
        el.innerHTML = field.value;
      }
      return;
    }

    if (typeof field.value === 'string') {
      el.innerHTML = field.value;
    }

    if (field.link) {
      const anchor = el.querySelector('a') || (el.closest('a') !== el ? el.closest('a') : null);
      applyLinkAttributes(anchor, field.link);
    }
  }

  function mergeBlockContentIntoHtml(html, content) {
    const blockHtml = String(html || '');
    const fields = content && typeof content === 'object' ? content : {};
    if (!blockHtml || !Object.keys(fields).length) return blockHtml;

    try {
      const doc = new DOMParser().parseFromString(blockHtml, 'text/html');
      const root = doc.body || doc.documentElement;
      if (!root) return blockHtml;

      Object.entries(fields).forEach(([fieldKey, field]) => {
        const editableName = String(fieldKey || '').trim();
        if (!editableName || !field || typeof field !== 'object') return;

        root.querySelectorAll(`[e-editable="${cssEscapeAttrValue(editableName)}"]`).forEach((el) => {
          mergeFieldIntoEditableElement(el, fieldKey, field);
        });
      });

      return root.innerHTML;
    } catch (_) {
      return blockHtml;
    }
  }

  function extractLinksFromBlockContent(html, content, readOnlyLinks, excludedEditables) {
    const links = [];
    const fields = content && typeof content === 'object' ? content : {};
    const urlFieldHrefs = new Map();

    Object.entries(fields).forEach(([fieldKey, field]) => {
      if (!field || typeof field !== 'object') return;
      if (isEditableExcluded(fieldKey, excludedEditables)) return;
      if (!/URL$/i.test(fieldKey) || !field.attributes) return;

      const href = String(field.attributes.href || '').trim();
      if (!href) return;

      urlFieldHrefs.set(fieldKey, {
        href,
        tracked: isTrackingEnabled(field.attributes),
      });
    });

    const blockHtml = typeof html === 'string' ? html : '';
    if (blockHtml && blockHtml.includes('<a')) {
      try {
        const doc = new DOMParser().parseFromString(blockHtml, 'text/html');
        const anchors = doc.querySelectorAll('a[href]');
        anchors.forEach((anchor, anchorIndex) => {
          const editable = String(anchor.getAttribute('e-editable') || '').trim();
          if (isEditableExcluded(editable, excludedEditables)) return;

          const templateHref = String(anchor.getAttribute('href') || '').trim();
          const configured = editable && urlFieldHrefs.has(editable)
            ? urlFieldHrefs.get(editable)
            : null;

          if (configured) {
            const { associatedText, associatedTextKind } = getAnchorAssociatedText(anchor, fields, editable);
            const record = buildLinkRecord(
              configured.href,
              resolveAnchorTracking(anchor, readOnlyLinks, anchorIndex, configured),
              false,
              associatedText,
              associatedTextKind
            );
            if (record) links.push(record);
            urlFieldHrefs.delete(editable);
            return;
          }

          if (!templateHref) return;

          const { associatedText, associatedTextKind } = getAnchorAssociatedText(anchor, fields, '');
          const record = buildLinkRecord(
            templateHref,
            resolveAnchorTracking(anchor, readOnlyLinks, anchorIndex, null),
            true,
            associatedText,
            associatedTextKind
          );
          if (record) links.push(record);
        });
      } catch (_) {}
    }

    urlFieldHrefs.forEach(({ href, tracked }, fieldKey) => {
      if (isEditableExcluded(fieldKey, excludedEditables)) return;

      const pairedText = getPairedTextFieldValue(fields, fieldKey);
      const record = buildLinkRecord(
        href,
        resolveLinkTracking(href, null, readOnlyLinks, null, { href, tracked }),
        false,
        pairedText,
        pairedText ? 'text' : null
      );
      if (record) links.push(record);
    });

    Object.entries(fields).forEach(([fieldKey, field]) => {
      if (!field || typeof field !== 'object') return;
      if (isEditableExcluded(fieldKey, excludedEditables)) return;
      if (/URL$/i.test(fieldKey)) return;

      const fieldLink = extractLinkFromFieldLink(field);
      if (fieldLink) {
        fieldLink.tracked = resolveLinkTracking(
          fieldLink.href,
          null,
          readOnlyLinks,
          null,
          { href: fieldLink.href, tracked: fieldLink.tracked }
        );
        links.push(fieldLink);
      }

      if (typeof field.value === 'string') {
        links.push(...extractLinksFromHtml(field.value));
      }
    });

    return links;
  }

  function extractLinksFromBlock(block, templateIndex) {
    if (!block) return [];

    const rawContent = block.content && typeof block.content === 'object' ? block.content : {};
    const rawHtml = resolveBlockHtml(block, templateIndex);
    const optionals = resolveBlockOptionals(block, templateIndex);
    const disabledEditables = collectDisabledOptionalEditables(rawHtml, optionals);
    const html = stripInactiveOptionalBranches(rawHtml, optionals);
    let content = filterContentForStrippedHtml(rawHtml, html, rawContent);
    content = filterContentForDisabledOptionals(content, disabledEditables);
    const readOnlyLinks = Array.isArray(block.read_only_links) ? block.read_only_links : null;
    return extractLinksFromBlockContent(html, content, readOnlyLinks, disabledEditables);
  }

  function normalizeLinkRow(link, frequency) {
    const href = String(link && link.href || '').trim();
    if (!href) return null;

    return {
      href,
      tracked: !!(link && link.tracked),
      locked: !!(link && link.locked),
      associatedText: String(link && link.associatedText || ''),
      associatedTextKind: link && link.associatedTextKind === 'image'
        ? 'image'
        : (link && link.associatedTextKind === 'text' ? 'text' : null),
      frequency: typeof frequency === 'number' ? frequency : 1,
    };
  }

  function finalizeLinkRows(rawLinks, combineDuplicates) {
    const raw = rawLinks || [];
    if (combineDuplicates) {
      return aggregateLinks(raw);
    }

    return raw
      .map((link) => normalizeLinkRow(link, 1))
      .filter(Boolean);
  }

  function aggregateLinks(rawLinks) {
    const groups = new Map();
    const order = [];

    (rawLinks || []).forEach((link) => {
      const href = String(link && link.href || '').trim();
      if (!href) return;

      const tracked = !!(link && link.tracked);
      const locked = !!(link && link.locked);
      const key = `${href}\0${tracked ? '1' : '0'}\0${locked ? '1' : '0'}`;

      if (!groups.has(key)) {
        groups.set(key, normalizeLinkRow(link, 0));
        order.push(key);
      }

      groups.get(key).frequency += 1;
    });

    return order.map((key) => groups.get(key));
  }

  function extractLinksForLanguage(snapshot, languageKey, options) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const contents = campaign && campaign.contents;
    if (!contents || typeof contents !== 'object') return [];

    const lang = String(languageKey || '').trim();
    const langContent = contents[lang];
    const blocks = langContent && Array.isArray(langContent.blocks) ? langContent.blocks : [];
    const templateIndex = buildBlockTemplateIndex(snapshot);

    const raw = [];
    blocks.forEach((block) => {
      raw.push(...extractLinksFromBlock(block, templateIndex));
    });

    const combineDuplicates = !!(options && options.combineDuplicates);
    return finalizeLinkRows(raw, combineDuplicates);
  }

  function resolveLanguageKeys(snapshot, requestedKeys) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const contents = campaign && campaign.contents;
    if (!contents || typeof contents !== 'object') return [];

    const available = Object.keys(contents);
    if (!available.length) return [];

    const resolved = [];
    (requestedKeys || []).forEach((key) => {
      const lang = String(key || '').trim();
      if (!lang) return;

      if (lang === 'current') {
        const master = String(campaign.master_locale || '').trim();
        resolved.push(master && contents[master] ? master : available[0]);
        return;
      }

      if (contents[lang]) {
        resolved.push(lang);
        return;
      }

      const match = available.find((candidate) => candidate.toLowerCase() === lang.toLowerCase());
      if (match) resolved.push(match);
    });

    return [...new Set(resolved)];
  }

  function buildBodyHtmlForLanguage(snapshot, languageKey) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const contents = campaign && campaign.contents;
    if (!contents || typeof contents !== 'object') return '';

    const lang = String(languageKey || '').trim();
    const langContent = contents[lang];
    if (!langContent) return '';

    const templateIndex = buildBlockTemplateIndex(snapshot);
    const blocks = Array.isArray(langContent.blocks) ? langContent.blocks : [];
    const parts = [];

    blocks.forEach((block) => {
      const templateHtml = resolveBlockHtml(block, templateIndex);
      const content = block.content && typeof block.content === 'object' ? block.content : {};
      const mergedHtml = mergeBlockContentIntoHtml(templateHtml, content);
      if (mergedHtml) parts.push(mergedHtml);
    });

    return parts.join('\n');
  }

  function extractEslSourcesForLanguage(snapshot, languageKey) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const contents = campaign && campaign.contents;
    const lang = String(languageKey || '').trim();
    const langContent = contents && lang ? contents[lang] : null;
    const basics = langContent && langContent.email_basics && typeof langContent.email_basics === 'object'
      ? langContent.email_basics
      : {};

    return {
      bodyHtml: buildBodyHtmlForLanguage(snapshot, lang),
      subjectHtml: String(basics.subject || ''),
      preheaderText: String(basics.preheader || ''),
    };
  }

  function extractEslSourcesByLanguage(snapshot, requestedKeys) {
    const requested = Array.isArray(requestedKeys)
      ? requestedKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];

    const resolvedKeys = resolveLanguageKeys(snapshot, requested);
    const eslSourcesByLanguage = {};

    requested.forEach((requestedKey, index) => {
      const resolved = resolveLanguageKeys(snapshot, [requestedKey]);
      const langKey = resolved[0] || resolvedKeys[index] || requestedKey;
      eslSourcesByLanguage[requestedKey] = extractEslSourcesForLanguage(snapshot, langKey);
    });

    return eslSourcesByLanguage;
  }

  window.gemCampaignLinksData = {
    isTrackingEnabled,
    isEmarsysNonTrackableSystemHref,
    resolveReadOnlyLinkTracking,
    resolveLinkTracking,
    resolveAnchorTracking,
    stripHtml,
    buildLinkRecord,
    extractLinkFromFieldLink,
    extractLinksFromHtml,
    buildBlockTemplateIndex,
    resolveBlockHtml,
    resolveBlockOptionals,
    collectDisabledOptionalEditables,
    filterContentForDisabledOptionals,
    stripInactiveOptionalBranches,
    filterContentForStrippedHtml,
    mergeBlockContentIntoHtml,
    extractLinksFromBlockContent,
    extractLinksFromBlock,
    aggregateLinks,
    finalizeLinkRows,
    extractLinksForLanguage,
    resolveLanguageKeys,
    extractEslSourcesForLanguage,
    extractEslSourcesByLanguage,
  };
})();
