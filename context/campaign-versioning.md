# Emarsys campaign versioning

## Overview

On the campaign editor page (`bootstrap.php?r=contentBlocks/campaign`), Emarsys may expose a version selector when a campaign has been split into A/B/C test versions.

By default, campaigns are **not** versioned. Users can optionally version a campaign, which creates:

- **Version A** — the original campaign
- **Version B** — initially an exact duplicate of A
- **Version C, D, …** — additional duplicates as needed

Each version after A receives its own unique campaign ID. Versions can be edited independently while continuing to share some data (for example campaign name and send audience).

## DOM detection

The version UI is rendered as `cb-version-selector`:

```html
<cb-version-selector class="cb-header-button e-layout__action">
  <e-select inline="">
    <select class="e-select e-select-inline">
      <option value="3612457" selected="true">Version #a</option>
      <option value="3612458">Version #b</option>
    </select>
  </e-select>
</cb-version-selector>
```

**Detection rule:** query `cb-version-selector select option`. If there is **more than one** option, the campaign is versioned.

Each option provides:

| Attribute / content | Meaning |
|---------------------|---------|
| `value` | Unique campaign ID for that version |
| Label text (e.g. `Version #a`) | Human-readable version label; letter maps to A, B, C, … |

The selected option reflects the version currently open in the editor.

## Gemma storage and UI

Gemma reads this selector on the main campaign editor page and stores version metadata on Recent Campaigns entries in `chrome.storage.local` (`gemRecentCampaigns`):

| Field | Type | When set |
|-------|------|----------|
| `versionLetter` | `string` | Uppercase letter (`A`, `B`, `C`, …) when the campaign is part of a 2+ version set; empty string otherwise |
| `versionGroupId` | `string` | Campaign ID of Version A (first option `value`); shared by all siblings in the group |
| `versionBackfilled` | `boolean` | `true` when the row was created from sibling detection without a direct visit |

When a versioned campaign is visited, Gemma:

1. Updates the visited version’s recent row.
2. **Backfills** sibling versions (using each option’s `value` as `id` and `urlBase`) if they are not already in recent storage.
3. Patches `versionLetter` and `versionGroupId` on all sibling IDs already present.

### Recent Campaigns drawer grouping

When two or more recent items share the same `versionGroupId`, the drawer renders **one row** for the campaign:

- Shared title, subject, and language chips (union across siblings)
- Clickable **A / B / C** chips to open each version (`option value` → campaign URL)
- Backfilled versions use a muted chip until opened directly
- Open tabs highlight the matching version chip(s)
- Overflow menu actions use the most recently visited sibling

While the user is on any version in a group, the whole group is hidden from the main list (shown in the Active tab section instead).

### Preserving version metadata on sibling pages

Visits to `camp_id` pages (for example **Edit Settings** on `campaignmanager.php`) do not include `_versionInfo`. Those upserts **preserve** existing `versionLetter`, `versionGroupId`, and `versionBackfilled` values so grouped rows stay grouped.

Only payloads from the main campaign editor (`extractCampaignPayload`) may change or clear version fields.

### Removing deleted versions

When the editor’s version selector is present but has **one or fewer** options (campaign was un-versioned or versions were deleted), Gemma:

1. Clears version metadata on the remaining campaign row(s) in that former group.
2. **Removes** backfilled recent rows for deleted version IDs.
3. Keeps previously visited deleted versions as normal unversioned rows (version fields cleared).

The selector’s remaining option `value`(s) are the source of truth (`remainingIds` in `extractCampaignVersionInfo()`).

Implementation: `extractCampaignVersionInfo()`, `pruneRemovedCampaignVersions()`, and grouping helpers in `recent-campaigns.js`.

## Compare Versions preview

When a campaign has two or more versions, Gemma injects a **Compare Versions** button at the top of the `cb-versions` tab panel (`.e-section__content`), parallel to **Compare Languages** on `cb-locales-tab`.

**Data source:** `cb-version-selector select option` — same options used for Recent Campaigns version metadata (`value` = campaign ID, label → version letter).

**Preview URL:** each column loads an iframe with the same URL as Campaign List and Recent Campaigns drawer previews:

```
/preview_fs_iframe.php?session_id=<current>&camp_id=<versionCampaignId>
```

**Modal behavior:**

- Title: **Version Comparison**
- One column per version; current editor version (`?id=` in URL) is sorted first and marked **Active**
- Desktop/Mobile width and zoom controls share settings with Compare Languages (`gemCompareLanguagesDesktopWidth`, etc.)
- Column overflow menu: **Switch to version** (navigate to editor) and **Hide**
- Closing the modal clears iframe sources to stop background loads

Implementation: `compare-versions.js`.
