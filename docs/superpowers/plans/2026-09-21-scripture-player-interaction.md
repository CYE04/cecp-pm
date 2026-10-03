# Scripture Drawer and Compact Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline sliding scripture reader, a moderately compact song player, and a click-to-open synchronized lyrics reader to the afternoon meeting page.

**Architecture:** Keep the existing Bible and shared Youth player renderers. `bible.js` will own an explicit animated content wrapper and accessible toggle state; `songs.js` will add afternoon-only classes and a lyrics dialog after the shared player renders; `style.css` will define compact dimensions, transitions, and both themes without affecting Youth pages.

**Tech Stack:** Static HTML, CSS custom properties, plain JavaScript, Node built-in test runner, Playwright browser checks.

## Global Constraints

- Scripture expands downward in place and collapses upward; it never overlays page content.
- Player height targets roughly 75%–80% of the current player and keeps cover, metadata, progress, controls, volume, and readable current lyrics.
- Clicking an available lyrics area opens a larger lyrics reader that follows playback; songs without lyrics remain non-clickable.
- Reduced-motion mode disables sliding movement.
- Halo mount markup contains no fallback “打开下午聚会程序” link.
- All visible interface text is Chinese, except standard musical notation.
- Changes remain scoped to `cecp-pm` and must not modify Youth behavior.

---

### Task 1: Accessible inline scripture drawer

**Files:**
- Modify: `bible.js:8-95`
- Modify: `style.css:61-76`
- Test: `tests/core.test.cjs`

**Interfaces:**
- Consumes: `PMFeatures.el`, `PMFeatures.button`, existing `load(book, chapter, range)`.
- Produces: `PMBible.setDrawerState(details, panel, open, options)` for deterministic state tests; `.bible-reader-toggle` and `.bible-reader-panel` markup.

- [ ] **Step 1: Add a failing state helper test**

Append a VM test that calls `setDrawerState(details, panel, true, { reduceMotion:true })` and asserts `details.dataset.open === 'true'`, `aria-expanded === 'true'`, and `panel.hidden === false`; call with `false` and assert the inverse.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-name-pattern="经文抽拉" tests/core.test.cjs`
Expected: FAIL because `setDrawerState` is not exported.

- [ ] **Step 3: Replace native summary behavior with an explicit animated panel**

Create a button-like `summary` with class `bible-reader-toggle`, a text span, and an arrow span. Wrap form, title, tools, feedback, content, and pager in `.bible-reader-panel-inner`, then `.bible-reader-panel`. Implement `setDrawerState` to update `details.open`, `data-open`, `aria-expanded`, label text, `hidden`, and panel height. Use `requestAnimationFrame` to animate `height: 0` to `scrollHeight`; on close, freeze the current height before transitioning to zero. Clear inline height to `auto` after opening so fetched verses can grow naturally. Guard rapid toggles with a transition token. Preserve first-open lazy loading.

- [ ] **Step 4: Add drawer styling**

Style the toggle as a full-width rounded row with icon, label and rotating arrow; style the panel as `overflow:clip` with height transition. Use `--raised`, `--line`, `--accent`, and `--muted`. Add `@media (prefers-reduced-motion:reduce)` to remove panel and arrow transitions.

- [ ] **Step 5: Run tests and syntax checks**

Run: `node --test tests/core.test.cjs && node --check bible.js`
Expected: all tests pass and syntax check exits 0.

- [ ] **Step 6: Commit the scripture drawer**

```bash
git add bible.js style.css tests/core.test.cjs
git commit -m "Improve scripture drawer interaction"
```

### Task 2: Moderately compact player and lyrics reader

**Files:**
- Modify: `songs.js:116-178`
- Modify: `style.css:92-145`
- Test: `tests/core.test.cjs`

**Interfaces:**
- Consumes: DOM returned by `YouthEngine.renderSongObjects(scores)`, including `.ym-pl`, `.ym-pl-lrc`, `.ym-pl-lrc-line`, and audio elements.
- Produces: `PMSongs.enhancePlayer(scoreHost)` and `PMSongs.openLyricsReader(player)`; `.pm-compact-player`, `.pm-lyrics-trigger`, `.pm-lyrics-dialog`.

- [ ] **Step 1: Add failing player enhancement tests**

Create a minimal DOM fixture or a pure selector helper test that verifies a player with lyric lines receives `pm-lyrics-trigger` and a player without lyric lines does not. Test that player enhancement always adds `pm-compact-player`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-name-pattern="紧凑播放器|歌词阅读" tests/core.test.cjs`
Expected: FAIL because `enhancePlayer` is not exported.

- [ ] **Step 3: Add afternoon-only player enhancement**

After the shared player renders, add `.pm-compact-player` to each `.ym-pl`. Mark lyric containers containing at least one non-empty `.ym-pl-lrc-line` as buttons with `tabindex="0"`, `role="button"`, `aria-label="打开完整歌词"`, and `.pm-lyrics-trigger`. Open the reader on click or Enter/Space. Leave empty lyric containers unchanged.

- [ ] **Step 4: Build the lyrics dialog**

Create one `dialog.pm-lyrics-dialog` per page on demand. Clone the active song’s lyric lines into `.pm-lyrics-dialog-lines`, preserving active-line class updates through a `MutationObserver`. Scroll the active line into the reader with `block:'center'`. Close through the Chinese close button, Escape, or clicking the dialog backdrop. Disconnect observers on close. Playback and current time remain on the original audio.

- [ ] **Step 5: Add compact player and dialog styling**

Reduce player padding, cover size, inter-panel gaps, lyric viewport height, and control padding to approximately 75%–80% of current vertical space. Keep lyric type at a readable minimum of 18px and at least two visible lines. Add a subtle hover/focus cue and “点击查看完整歌词” hint. Style the dialog with theme variables; use a nearly full-screen sheet on widths below 620px.

- [ ] **Step 6: Verify tests and syntax**

Run: `node --test tests/core.test.cjs && node --check songs.js`
Expected: all tests pass and syntax check exits 0.

- [ ] **Step 7: Commit compact player behavior**

```bash
git add songs.js style.css tests/core.test.cjs
git commit -m "Add compact player and lyrics reader"
```

### Task 3: Halo markup, browser verification, and graph refresh

**Files:**
- Modify: `README.md`
- Modify: `graphify-out/graph.json` and generated graph artifacts through `graphify update .`

**Interfaces:**
- Consumes: `embed.js` mount lookup for `#cecp-pm` and `data-date`.
- Produces: Halo snippet with an empty mount node and the existing embed script.

- [ ] **Step 1: Update Halo embed documentation**

Use exactly:

```html
<div id="cecp-pm" data-date="2026-09-20"></div>
<script src="https://cye04.github.io/cecp-pm/embed.js"></script>
```

Remove prose suggesting a visible fallback link.

- [ ] **Step 2: Run the complete automated checks**

Run: `node --test tests/core.test.cjs && node --check bible.js && node --check songs.js && node --check embed.js`
Expected: all tests pass and all syntax checks exit 0.

- [ ] **Step 3: Verify desktop and mobile in both themes**

Start a loopback-only server for the `cecp-pm` directory. In Playwright, check 1180×900 and 390×844 viewports with `theme=light` and `theme=dark`. Assert: drawer opens and closes; no panel clipping after verses render; compact player retains cover/progress/controls/volume; lyrics dialog opens and closes; no `pageerror`; no horizontal overflow.

- [ ] **Step 4: Verify reduced motion and failure states**

Emulate `reducedMotion:'reduce'` and confirm drawer state changes immediately. Stub the Bible endpoint to fail and confirm the open drawer displays the retry action. Use a song without lyrics and confirm no lyrics trigger appears.

- [ ] **Step 5: Refresh the project graph**

Run: `graphify update .`
Expected: graph files rebuild successfully.

- [ ] **Step 6: Commit documentation and generated graph metadata**

```bash
git add README.md graphify-out
git commit -m "Document afternoon meeting embed"
```
