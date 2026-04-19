export const STYLES = `
/* Drawer tab styles */
.hone-drawer {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px;
}

.hone-drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 6px);
  background: var(--lumiverse-fill-subtle);
  margin-bottom: 12px;
}

.hone-drawer-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--lumiverse-text);
}

.hone-drawer-hint {
  font-size: 11px;
  color: var(--lumiverse-text-muted);
  margin: 0;
  line-height: 1.4;
}

.hone-drawer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hone-drawer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
  color: var(--lumiverse-text);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--lumiverse-transition-fast, 150ms),
              border-color var(--lumiverse-transition-fast, 150ms);
  white-space: nowrap;
}

.hone-drawer-btn:hover {
  background: var(--lumiverse-fill-subtle);
  border-color: var(--lumiverse-primary);
}

.hone-drawer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hone-drawer-btn--primary {
  background: var(--lumiverse-primary-020, rgba(147, 112, 219, 0.2));
  border-color: var(--lumiverse-primary-050, rgba(147, 112, 219, 0.5));
  color: var(--lumiverse-primary);
}

.hone-drawer-btn--primary:hover {
  background: var(--lumiverse-primary-050, rgba(147, 112, 219, 0.5));
  border-color: var(--lumiverse-primary);
}

.hone-drawer-btn--sm {
  padding: 4px 8px;
  font-size: 11px;
}

.hone-drawer-btn--xs {
  padding: 2px 6px;
  font-size: 10px;
}

/* Armed-for-confirmation state. Used by refine-all / undo-last after the
 * first click: amber tint + pulsing outline to signal "this will happen
 * on your next click". Reset on click-away or 4-second timeout. */
.hone-drawer-btn--confirm,
.hone-drawer-btn--primary.hone-drawer-btn--confirm {
  background: #d97706;
  border-color: #f59e0b;
  color: #fff;
  animation: hone-confirm-pulse 1.2s ease-in-out infinite;
}

.hone-drawer-btn--confirm:hover,
.hone-drawer-btn--primary.hone-drawer-btn--confirm:hover {
  background: #b45309;
  opacity: 1;
}

@keyframes hone-confirm-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
  50%      { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0); }
}

.hone-drawer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.hone-drawer-row label {
  font-size: 12px;
  color: var(--lumiverse-text);
  white-space: nowrap;
}

.hone-drawer-input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
  color: var(--lumiverse-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.hone-drawer-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hone-drawer-empty {
  font-size: 12px;
  color: var(--lumiverse-text-muted);
  margin: 0;
  font-style: italic;
}

/* Footer slot for the Quick Actions step picker while a pipeline run is
 * still in progress. Replaces the Undo button until refinement finishes. */
.hone-drawer-progress {
  font-size: 12px;
  color: var(--lumiverse-primary);
  padding: 6px 12px;
  text-align: center;
  font-style: italic;
  animation: hone-pulse 1.2s ease-in-out infinite;
}

.hone-drawer-stage-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
}

.hone-drawer-stage-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--lumiverse-text-muted);
}

.hone-drawer-stage-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
  border-bottom: 1px solid var(--lumiverse-border);
}

.hone-drawer-stage-entry:last-of-type {
  border-bottom: none;
}

.hone-drawer-stage-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--lumiverse-text);
}

.hone-drawer-stage-preview {
  font-size: 11px;
  color: var(--lumiverse-text-muted);
  line-height: 1.3;
  max-height: 40px;
  overflow: hidden;
}

.hone-drawer-history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hone-drawer-history-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
}

.hone-drawer-history-info {
  font-size: 11px;
  color: var(--lumiverse-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hone-drawer-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--lumiverse-text);
  padding: 2px 0;
}

/* Indent modifier for child rows: visually groups a follow-up control
 * (e.g. Enhance Mode) under its parent toggle. */
.hone-drawer-stat-row--indent {
  padding-left: 16px;
  border-left: 2px solid var(--lumiverse-border);
  margin-left: 4px;
}

/* Dims a whole row to signal that its control is intentionally inert;
 * used for "coming soon" placeholders where the toggle is present but
 * not functional yet. */
.hone-drawer-stat-row--disabled {
  opacity: 0.5;
}

.hone-drawer-coming-soon {
  font-style: normal;
  font-size: 11px;
  color: var(--lumiverse-text-dim, rgba(230, 230, 240, 0.55));
  margin-left: 4px;
}

.hone-drawer-select {
  padding: 3px 6px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 12px;
  max-width: 220px;
}

.hone-drawer-stat-divider {
  height: 1px;
  background: var(--lumiverse-border);
  margin: 4px 0;
}

/* Float widget: two render modes live in the same DOM at once; the
 * .hone-float-widget--lumia class on the button picks which is
 * visible. See float-widget.ts for the dual-subtree rationale.
 *
 * touch-action: none is applied inline on the widget root (see
 * float-widget.ts) so drag + tap work cleanly on mobile without the
 * browser swallowing the gesture for page scroll. */
.hone-float-widget {
  width: 100%;
  height: 100%;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* ── Lumia mode: chibi PNG that swaps by state ───────────────── */

.hone-float-widget--lumia {
  border: none;
  background: transparent;
}

.hone-float-chibi {
  /* Slightly smaller than the widget root so the hover/armed scale-up
   * (~1.08) doesn't spill past the viewport clamp. Default hidden;
   * only shown inside .hone-float-widget--lumia. */
  width: 92%;
  height: 92%;
  object-fit: contain;
  pointer-events: none;
  display: none;
  transition: filter 180ms ease, transform 180ms ease, opacity 180ms ease;
}
.hone-float-widget--lumia .hone-float-chibi {
  display: block;
}

.hone-float-widget--lumia:hover:not(.hone-float-widget--disabled):not(.hone-float-widget--armed) .hone-float-chibi {
  filter: drop-shadow(0 0 4px var(--lumiverse-primary, #4a90e2));
  transform: scale(1.06);
}

.hone-float-widget--lumia.hone-float-widget--armed .hone-float-chibi {
  transform: scale(1.08);
  animation: hone-float-armed-pulse 1.2s ease-in-out infinite;
}

.hone-float-widget--lumia.hone-float-widget--disabled .hone-float-chibi {
  opacity: 0.45;
}

/* State label beneath the chibi. Absolute-positioned below the widget
 * bounds so it doesn't cramp the artwork; only visible in Lumia mode.
 * The body of the text is swapped by render() based on the same
 * priority order used for chibi selection, so image and label always
 * agree on what state the widget is in. */
.hone-float-label {
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
  display: none;
}
.hone-float-widget--lumia .hone-float-label {
  display: inline-block;
}

/* ── Classic mode: circular icon pill ────────────────────────── */

.hone-float-widget:not(.hone-float-widget--lumia) {
  border: 1px solid var(--lumiverse-border);
  border-radius: 50%;
  background: var(--lumiverse-fill-subtle, var(--lumiverse-fill));
  color: var(--lumiverse-text-muted, var(--lumiverse-text));
  transition: background var(--lumiverse-transition-fast, 120ms ease),
    color var(--lumiverse-transition-fast, 120ms ease),
    box-shadow var(--lumiverse-transition-fast, 120ms ease);
}

.hone-float-widget:not(.hone-float-widget--lumia):hover:not(.hone-float-widget--disabled):not(.hone-float-widget--armed) {
  box-shadow: 0 0 0 2px var(--lumiverse-primary, #4a90e2);
  color: var(--lumiverse-text, inherit);
}

.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--refined {
  color: var(--lumiverse-primary, #4a90e2);
}

.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--armed {
  background: #d97706;
  color: #fff;
  box-shadow: 0 0 0 2px #f59e0b;
  animation: hone-confirm-pulse 1.2s ease-in-out infinite;
}

.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--disabled {
  opacity: 0.5;
  cursor: default;
}

.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--busy {
  color: var(--lumiverse-primary, #4a90e2);
  cursor: default;
}

/* Classic-mode icon visibility. Shared show-refine / show-undo /
 * busy classes on the button; each SVG span is shown only when its
 * class matches. In Lumia mode the .hone-float-icon default
 * display:none keeps them fully hidden regardless of state. */
.hone-float-widget .hone-float-icon {
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--show-refine .hone-float-icon--refine {
  display: inline-flex;
}
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--show-undo .hone-float-icon--undo {
  display: inline-flex;
}
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--busy .hone-float-icon--spinner {
  display: inline-flex;
  animation: hone-float-spin 1s linear infinite;
  transform-origin: 50% 50%;
}
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--busy .hone-float-icon--refine,
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--busy .hone-float-icon--undo {
  display: none;
}

.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--show-cancel .hone-float-icon--spinner,
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--show-cancel .hone-float-icon--refine,
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--show-cancel .hone-float-icon--undo {
  display: none;
}
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--show-cancel .hone-float-icon--cancel {
  display: inline-flex;
}
.hone-float-widget:not(.hone-float-widget--lumia).hone-float-widget--armed-cancel {
  color: #f59e0b;
  cursor: pointer;
}
.hone-float-widget--lumia.hone-float-widget--armed-cancel {
  cursor: pointer;
}
.hone-float-widget--lumia.hone-float-widget--armed-cancel .hone-float-chibi {
  animation: hone-float-armed-pulse 1.2s ease-in-out infinite;
}

/* ── Shared keyframes ─────────────────────────────────────────── */

@keyframes hone-float-armed-pulse {
  0%, 100% { filter: drop-shadow(0 0 4px #f59e0b); }
  50% { filter: drop-shadow(0 0 12px #f59e0b); }
}

@keyframes hone-float-spin {
  to { transform: rotate(360deg); }
}

@keyframes hone-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── Settings card wrapper ─────────────────────────────── */

.hone-settings-card {
  border: 1px solid var(--lumiverse-border);
  border-radius: calc(var(--lumiverse-radius, 6px) + 2px);
  background: linear-gradient(180deg, var(--lumiverse-fill, #1a1a1a) 0%, var(--lumiverse-fill-subtle, #141414) 100%);
  overflow: hidden;
}
.hone-settings-card__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--lumiverse-border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.hone-settings-card__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--lumiverse-text);
}
.hone-settings-card__version {
  font-size: 11px;
  color: var(--lumiverse-text-dim);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--lumiverse-border);
}

.hone-settings {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.hone-tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--lumiverse-border);
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.hone-tab-btn {
  padding: 8px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--lumiverse-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--lumiverse-transition-fast, 150ms),
              border-color var(--lumiverse-transition-fast, 150ms);
  white-space: nowrap;
}

.hone-tab-btn:hover {
  color: var(--lumiverse-text);
}

.hone-tab-btn.active {
  color: var(--lumiverse-primary);
  border-bottom-color: var(--lumiverse-primary);
}

.hone-tab-panel {
  display: none;
  flex-direction: column;
  gap: 16px;
}

.hone-tab-panel.active {
  display: flex;
}

.hone-settings h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lumiverse-text);
}

.hone-settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 6px);
  background: var(--lumiverse-fill-subtle);
}

.hone-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  overflow: hidden;
}

.hone-settings-row label {
  font-size: 13px;
  color: var(--lumiverse-text);
  flex-shrink: 0;
  white-space: nowrap;
}

.hone-settings-row select {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hone-settings-row input[type="number"] {
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 13px;
}

/* Number-input row: label on its own line, input on the next line. Used
 * for numeric context limits where the label text can run long and the
 * input needs a little more breathing room than the 80px inline rows. */
.hone-settings-row--number {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.hone-settings-row--number label {
  white-space: normal;
}
.hone-settings-row--number input[type="number"] {
  width: 96px;
  align-self: flex-start;
}

.hone-settings-row textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
  color: var(--lumiverse-text);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.hone-textarea-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hone-textarea-row label {
  font-size: 13px;
  color: var(--lumiverse-text);
}

.hone-custom-rules-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hone-custom-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
}

.hone-custom-rule .rule-label {
  font-size: 13px;
  font-weight: 500;
  min-width: 80px;
}

.hone-custom-rule .rule-prompt {
  font-size: 12px;
  color: var(--lumiverse-text-muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hone-custom-rule .rule-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.hone-custom-rule .rule-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--lumiverse-radius, 4px);
  background: transparent;
  color: var(--lumiverse-text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.hone-custom-rule .rule-actions button:hover {
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
}

.hone-rule-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--lumiverse-primary);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
}

.hone-rule-editor input,
.hone-rule-editor textarea {
  padding: 6px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
  font-size: 13px;
  font-family: inherit;
}

.hone-rule-editor textarea {
  min-height: 60px;
  resize: vertical;
}

.hone-rule-editor-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.hone-add-rule-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: transparent;
  color: var(--lumiverse-text-muted);
  cursor: pointer;
  font-size: 13px;
}

.hone-add-rule-btn:hover {
  border-color: var(--lumiverse-primary);
  color: var(--lumiverse-primary);
}

.hone-section-description {
  font-size: 12px;
  color: var(--lumiverse-text-muted);
  margin: 0 0 4px 0;
  line-height: 1.4;
}

.hone-pipeline-stage {
  padding: 10px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hone-pipeline-stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hone-pipeline-stage-header input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
  font-size: 13px;
  font-weight: 500;
}

.hone-pipeline-stage-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hone-pipeline-stage-rules label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--lumiverse-text);
  cursor: pointer;
}

.hone-pipeline-stage-rules input[type="checkbox"] {
  margin: 0;
}

.hone-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--lumiverse-border);
  border: 1px solid var(--lumiverse-border);
  cursor: pointer;
  transition: background var(--lumiverse-transition-fast, 150ms),
              border-color var(--lumiverse-transition-fast, 150ms);
}

.hone-toggle.on {
  background: var(--lumiverse-primary, #4a90e2);
  border-color: var(--lumiverse-primary, #4a90e2);
}

.hone-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform var(--lumiverse-transition-fast, 150ms);
}

.hone-toggle.on::after {
  transform: translateX(16px);
}

.hone-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hone-settings-row--disabled > label {
  opacity: 0.7;
}

/* The diff content. Intentionally has NO max-height / overflow of its own
 * so the host modal's body is the single scroll container; otherwise the
 * inner max-height can exceed the outer modal's fixed maxHeight (520px)
 * and you get nested scrollbars whenever the diff is long. */
.hone-diff-modal {
  padding: 16px;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.hone-diff-add {
  background: rgba(46, 160, 67, 0.15);
  color: #2ea043;
}

.hone-diff-remove {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  text-decoration: line-through;
}

/* Navigation bar shown at the top of the diff modal when multiple diffs
 * are queued (e.g. user refined several messages in quick succession and
 * more diff events arrived while an earlier one was still on screen).
 *
 * Sticky-positioned so it stays visible while the user scrolls through
 * a long diff; they shouldn't have to scroll back to the top to flip
 * between queued diffs. Negative horizontal margin cancels the host
 * body's 16px padding so the nav stretches edge-to-edge; the solid
 * background is required so scrolling content doesn't show through. */
.hone-diff-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  margin: -16px -16px 0 -16px;
  position: sticky;
  top: -16px;
  z-index: 1;
  background: var(--lumiverse-bg, #1a1a1a);
  border-bottom: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.25));
  font-size: 13px;
}

.hone-diff-nav-btn {
  background: transparent;
  border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.25));
  color: var(--lumiverse-text, inherit);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 13px;
  transition: background var(--lumiverse-transition-fast, 150ms);
}

.hone-diff-nav-btn:hover:not(:disabled) {
  background: var(--lumiverse-bg-hover, rgba(128, 128, 128, 0.1));
}

.hone-diff-nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.hone-diff-nav-counter {
  font-variant-numeric: tabular-nums;
  color: var(--lumiverse-text-dim, inherit);
}

/* Debug logging section in the Advanced tab. The buttons are grouped
 * horizontally so the row matches other settings rows. */
.hone-settings-help {
  font-size: 12px;
  line-height: 1.5;
  color: var(--lumiverse-text-dim, inherit);
  margin: 0 0 12px 0;
  padding: 0 4px;
}

.hone-settings-btn {
  background: transparent;
  border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.25));
  color: var(--lumiverse-text, inherit);
  border-radius: var(--lumiverse-radius, 6px);
  padding: 4px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background var(--lumiverse-transition-fast, 150ms);
}

.hone-settings-btn:hover {
  background: var(--lumiverse-bg-hover, rgba(128, 128, 128, 0.1));
}

.hone-settings-btn--danger {
  border-color: rgba(248, 81, 73, 0.5);
  color: #f85149;
}

.hone-settings-btn--danger:hover {
  background: rgba(248, 81, 73, 0.12);
}

.hone-settings-btn--sm {
  padding: 2px 8px;
  font-size: 12px;
}

/* ── Shield config tab ─────────────────────────────────── */

.hone-shield-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hone-shield-pattern-list {
  border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.25));
  border-radius: var(--lumiverse-radius, 6px);
  padding: 10px 12px;
  background: var(--lumiverse-fill-subtle, rgba(128, 128, 128, 0.04));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hone-shield-pattern-list__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--lumiverse-text, inherit);
}

.hone-shield-pattern-list__defaults {
  margin: 0 0 4px 0;
  font-style: italic;
  color: var(--lumiverse-text-dim, inherit);
}

.hone-shield-pattern-list__rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
}

.hone-shield-pattern-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hone-shield-pattern-input {
  flex: 1 1 280px;
  min-width: 160px;
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.25));
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text, inherit);
  font-family: var(--lumiverse-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
}

.hone-shield-pattern-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hone-shield-pattern-error {
  flex: 0 0 auto;
  font-size: 11px;
  color: #f85149;
}

.hone-shield-reset-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.hone-debug-stats-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hone-debug-stats {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--lumiverse-text-dim, inherit);
}

/* Inline refresh icon next to the buffer status text. Tinted to match
 * the dim text by default and brightens on hover so it reads as an
 * affordance attached to the value rather than a separate control. */
.hone-debug-refresh-icon {
  background: transparent;
  border: none;
  color: var(--lumiverse-text-dim, inherit);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--lumiverse-transition-fast, 150ms),
              color var(--lumiverse-transition-fast, 150ms),
              transform var(--lumiverse-transition-fast, 150ms);
}

.hone-debug-refresh-icon:hover {
  background: var(--lumiverse-bg-hover, rgba(128, 128, 128, 0.1));
  color: var(--lumiverse-text, inherit);
}

.hone-debug-refresh-icon:active {
  transform: rotate(90deg);
}

.hone-debug-btn-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Sampler sliders (Lumiverse-style) */
.hone-slider-row {
  padding: 6px 0 4px;
}

.hone-slider-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
  position: relative;
  z-index: 1;
}

.hone-slider-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.hone-slider-label.is-set {
  color: var(--lumiverse-text);
}

.hone-slider-label.is-unset {
  color: var(--lumiverse-text-dim, var(--lumiverse-text-muted));
}

.hone-slider-input {
  width: 72px;
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-family: var(--lumiverse-font-mono, monospace);
  text-align: right;
  outline: none;
  -moz-appearance: textfield;
  transition: border-color var(--lumiverse-transition-fast, 150ms),
              box-shadow var(--lumiverse-transition-fast, 150ms);
}

.hone-slider-input::-webkit-outer-spin-button,
.hone-slider-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.hone-slider-input.is-set {
  background: var(--lumiverse-input-bg, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--lumiverse-border);
  color: var(--lumiverse-text);
}

.hone-slider-input.is-set:focus {
  border-color: var(--lumiverse-primary-muted, var(--lumiverse-primary));
  box-shadow: 0 0 0 2px var(--lumiverse-primary-010, rgba(147, 112, 219, 0.1));
}

.hone-slider-input.is-unset {
  background: transparent;
  border: 1px solid transparent;
  color: var(--lumiverse-text-dim, var(--lumiverse-text-muted));
}

.hone-slider-track {
  position: relative;
  height: 6px;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 3px;
  cursor: pointer;
  touch-action: none;
}

/* Invisible 44px touch target (Apple HIG / WCAG 2.5.8) */
.hone-slider-track::before {
  content: '';
  position: absolute;
  inset: -19px 0;
}

.hone-slider-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--lumiverse-primary);
  border-radius: 3px;
  pointer-events: none;
  opacity: 0.8;
}

.hone-slider-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: var(--lumiverse-primary);
  border: 2px solid var(--lumiverse-bg, #1a1a2e);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25),
              0 0 0 1px var(--lumiverse-primary-020, rgba(147, 112, 219, 0.2));
}

/* ── Preset bar (above tabs) ─────────────────────────────── */

.hone-preset-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--lumiverse-fill-subtle, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 6px);
  flex-wrap: wrap;
}
.hone-preset-bar__label {
  font-weight: 600;
  color: var(--lumiverse-text);
  font-size: 13px;
}
.hone-preset-bar__select {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hone-preset-bar__name {
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg);
  color: var(--lumiverse-text);
  font-size: 13px;
  font-weight: 600;
  min-width: 120px;
  max-width: 260px;
}
.hone-preset-bar__name:focus {
  border-color: var(--lumiverse-primary);
  outline: none;
}
.hone-preset-bar__indicator {
  font-size: 11px;
  color: var(--lumiverse-text-dim);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--lumiverse-border);
  white-space: nowrap;
}
.hone-preset-bar__actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
  flex-wrap: wrap;
}
.hone-preset-bar--stacked .hone-preset-bar__actions {
  flex-basis: 100%;
  margin-left: 0;
}
.hone-preset-bar__scope {
  width: 100%;
  font-size: 11px;
  color: var(--lumiverse-text-dim);
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--lumiverse-border);
}

.hone-pov-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.hone-pov-editor__bar {
  margin-bottom: 0;
}
.hone-pov-editor__textarea {
  width: 100%;
  min-height: 84px;
  padding: 8px 10px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-fill, transparent);
  color: var(--lumiverse-text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
  box-sizing: border-box;
}
.hone-pov-editor__textarea:focus {
  border-color: var(--lumiverse-primary);
  outline: none;
}
.hone-pov-editor__textarea[readonly] {
  opacity: 0.75;
  cursor: default;
}

.hone-readonly-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  background: var(--lumiverse-warning, #f59e0b);
  color: white;
  border-radius: var(--lumiverse-radius, 6px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  font-size: 13px;
  z-index: 10000;
  max-width: 480px;
  text-align: center;
  animation: hone-toast-in 200ms ease-out;
}
@keyframes hone-toast-in {
  from { opacity: 0; transform: translate(-50%, -8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.hone-readonly-banner {
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--lumiverse-radius, 4px);
  font-size: 12px;
  color: var(--lumiverse-text);
  margin: 8px 0;
}
.hone-inline-notice {
  margin-top: 6px;
  padding: 6px 10px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--lumiverse-radius, 4px);
  font-size: 12px;
  color: var(--lumiverse-text);
  animation: hone-inline-notice-in 150ms ease-out;
}
@keyframes hone-inline-notice-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Pipeline editor ───────────────────────────────────── */

.hone-pipeline-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
.hone-pipeline-stage {
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 6px);
  padding: 8px;
  background: var(--lumiverse-fill-subtle, rgba(128, 128, 128, 0.04));
}
.hone-pipeline-stage__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.hone-pipeline-stage__name {
  flex: 1 1 200px;
  min-width: 140px;
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-weight: 600;
  font-size: 13px;
}
.hone-pipeline-stage__name:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.hone-pipeline-stage__controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.hone-pipeline-stage__connection {
  padding: 4px 6px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 11px;
  max-width: 180px;
}
.hone-pipeline-stage__preview {
  padding: 4px 10px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: transparent;
  color: var(--lumiverse-text-muted);
  font-size: 11px;
  cursor: pointer;
}
.hone-pipeline-stage__preview:hover {
  border-color: var(--lumiverse-primary);
  color: var(--lumiverse-primary);
}
.hone-pipeline-stage__icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: transparent;
  color: var(--lumiverse-text-muted);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.hone-pipeline-stage__icon-btn:hover:not(:disabled) {
  border-color: var(--lumiverse-primary);
  color: var(--lumiverse-primary);
}
.hone-pipeline-stage__icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.hone-pipeline-stage__delete:hover:not(:disabled) {
  border-color: var(--lumiverse-danger, #dc2626);
  color: var(--lumiverse-danger, #dc2626);
}
.hone-pipeline-stage__rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hone-pipeline-row-warning {
  padding: 6px 10px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--lumiverse-radius, 4px);
  color: var(--lumiverse-text);
  font-size: 11px;
}
.hone-pipeline-arrow {
  text-align: center;
  font-size: 18px;
  color: var(--lumiverse-text-dim);
  line-height: 1;
  padding: 2px 0;
}
.hone-pipeline-add-stage {
  padding: 8px 14px;
  border: 1px dashed var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: transparent;
  color: var(--lumiverse-text-muted);
  cursor: pointer;
  font-size: 12px;
  align-self: flex-start;
}
.hone-pipeline-add-stage:hover {
  border-color: var(--lumiverse-primary);
  color: var(--lumiverse-primary);
  border-style: solid;
}

/* ── Chip input ────────────────────────────────────────── */

.hone-chip-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  background: var(--lumiverse-bg, transparent);
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
}
.hone-chip-input__role {
  flex: 0 0 auto;
}
.hone-chip-input__role-label {
  display: inline-block;
  padding: 2px 8px;
  background: var(--lumiverse-fill-subtle, rgba(128, 128, 128, 0.1));
  color: var(--lumiverse-text-dim);
  border-radius: 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.hone-chip-input__role-select {
  padding: 2px 6px;
  border: 1px solid var(--lumiverse-border);
  border-radius: 10px;
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
}
.hone-chip-input__chips {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 28px;
}
.hone-chip-input__text {
  flex: 1 1 120px;
  min-width: 100px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--lumiverse-text);
  font-size: 12px;
  padding: 4px 2px;
}
.hone-chip-input__text::placeholder {
  color: var(--lumiverse-text-dim);
  opacity: 0.7;
}
.hone-chip-input__suggestions {
  z-index: 10001;
  max-height: 240px;
  overflow-y: auto;
  background: var(--lumiverse-bg, #1f1f1f);
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: 4px 0;
}
.hone-chip-input__suggestion {
  padding: 6px 12px;
  color: var(--lumiverse-text);
  cursor: pointer;
  font-size: 12px;
}
.hone-chip-input__suggestion:hover,
.hone-chip-input__suggestion--active {
  background: var(--lumiverse-primary-020, rgba(147, 112, 219, 0.2));
  color: var(--lumiverse-primary);
}
.hone-chip-input__suggestion--empty {
  color: var(--lumiverse-text-dim);
  cursor: default;
  font-style: italic;
}
.hone-chip-input__suggestion--empty:hover {
  background: transparent;
  color: var(--lumiverse-text-dim);
}

/* Individual chips: matches Lumiverse's active nav button scheme:
   primary-colored text on a translucent primary-020 background so
   chips are readable against both light and dark themes. */
.hone-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px 2px 7px;
  background: var(--lumiverse-primary-020, rgba(147, 112, 219, 0.2));
  color: var(--lumiverse-primary);
  border: 1px solid var(--lumiverse-primary-050, rgba(147, 112, 219, 0.5));
  touch-action: none;
  border-radius: 10px;
  font-size: 10px;
  cursor: grab;
  user-select: none;
  white-space: nowrap;
  /* Shrink-to-content by default (flex-basis: auto, no grow). A long
   * prompt name is capped at half the row width via max-width so it
   * can never dominate; beyond that, the label ellipsises via
   * .hone-chip__label's overflow rules. min-width: 0 is still
   * required to let the ellipsis actually kick in inside a flex item. */
  flex: 0 0 auto;
  max-width: calc(50% - 3px);
  min-width: 0;
  box-sizing: border-box;
}
.hone-chip:active {
  cursor: grabbing;
}
.hone-chip--dragging {
  opacity: 0.4;
}
.hone-chip--drop-target {
  outline: 2px dashed var(--lumiverse-text);
  outline-offset: 2px;
}
.hone-chip--missing {
  background: var(--lumiverse-danger, #dc2626);
}
/* Head Collection meta-chip: distinguishable from regular prompt chips so
 * authors can tell at a glance which row reuses the bundled head. Uses an
 * accent border + tinted background. */
.hone-chip--head {
  background: var(--lumiverse-accent-020, rgba(255, 191, 0, 0.18));
  color: var(--lumiverse-accent, #f5b342);
  border-color: var(--lumiverse-accent-050, rgba(245, 179, 66, 0.55));
  font-weight: 600;
}
.hone-chip-input__suggestion--head {
  font-weight: 600;
  color: var(--lumiverse-accent, #f5b342);
  border-bottom: 1px solid var(--lumiverse-border, rgba(255, 255, 255, 0.08));
}
.hone-chip__label {
  pointer-events: none;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hone-chip__remove {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.7;
}
.hone-chip__remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.15);
}

/* ── Parallel agent layout ────────────────────────────── */

.hone-agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.hone-agent-header__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--lumiverse-text);
}
.hone-agent-divider {
  border: none;
  border-top: 1px solid var(--lumiverse-border);
  margin: 12px 0;
}

/* ── Macro reference (collapsible card inside Prompts tab) ── */

.hone-macro-reference {
  margin: 8px 0 14px;
  padding: 8px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 6px);
  background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.03));
}
.hone-macro-reference > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--lumiverse-text-dim, rgba(230, 230, 240, 0.6));
  user-select: none;
  padding: 2px 0;
}
.hone-macro-reference > summary:hover {
  color: var(--lumiverse-text, rgba(230, 230, 240, 0.92));
}
.hone-macro-reference__list {
  margin: 8px 0 0;
  padding: 0;
  font-size: 12px;
}
/* Stacked layout: macro name on its own line, description below.
 * A two-column grid breaks in the narrow drawer: wide macro names would
 * push the description column to zero width, wrapping the text into an
 * invisible sliver. */
.hone-macro-reference__list dt {
  font-family: var(--lumiverse-font-mono, ui-monospace, "SF Mono", Consolas, monospace);
  color: var(--lumiverse-primary, #8c82ff);
  margin: 12px 0 3px;
  overflow-wrap: anywhere;
}
.hone-macro-reference__list dt:first-child {
  margin-top: 0;
}
.hone-macro-reference__list dd {
  margin: 0;
  color: var(--lumiverse-text, rgba(230, 230, 240, 0.82));
  line-height: 1.5;
}
.hone-macro-reference__footnote {
  margin: 10px 0 0;
  padding-top: 8px;
  border-top: 1px dashed var(--lumiverse-border);
  font-size: 11px;
  font-style: italic;
  color: var(--lumiverse-text-dim, rgba(230, 230, 240, 0.55));
}

/* ── Prompt config ────────────────────────────────────── */

.hone-prompt-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* Head Collection editor: sits above the prompt list, styled like a
 * prompt card but with an accent border so it reads as the "meta" entry. */
.hone-head-collection {
  border: 1px solid var(--lumiverse-accent-050, rgba(245, 179, 66, 0.55));
  border-radius: var(--lumiverse-radius, 6px);
  padding: 10px;
  margin-bottom: 10px;
  background: var(--lumiverse-accent-010, rgba(245, 179, 66, 0.06));
}
.hone-head-collection__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.hone-head-collection__title {
  margin: 0;
  font-size: 13px;
  color: var(--lumiverse-accent, #f5b342);
}
.hone-head-collection__chips {
  margin-top: 6px;
}
.hone-prompt-card {
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 6px);
  padding: 10px;
  background: var(--lumiverse-fill-subtle, rgba(128, 128, 128, 0.04));
}
.hone-prompt-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.hone-prompt-card__name {
  flex: 1 1 auto;
  padding: 4px 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-weight: 600;
  font-size: 13px;
}
.hone-prompt-card__name:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.hone-prompt-card__content {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  background: var(--lumiverse-bg, transparent);
  color: var(--lumiverse-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  resize: vertical;
  min-height: 120px;
}
.hone-prompt-card__content:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* ── Preview modal ────────────────────────────────────── */

.hone-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 24px;
}
.hone-preview-modal {
  background: var(--lumiverse-bg, #1f1f1f);
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 8px);
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.hone-preview-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--lumiverse-border);
}
.hone-preview-modal__header h3 {
  margin: 0;
  font-size: 14px;
  color: var(--lumiverse-text);
}
.hone-preview-modal__close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--lumiverse-text-muted);
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
}
.hone-preview-modal__close:hover {
  background: var(--lumiverse-bg-hover, rgba(128, 128, 128, 0.15));
  color: var(--lumiverse-text);
}
.hone-preview-modal__body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hone-preview-modal__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--lumiverse-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.hone-preview-modal__diagnostics {
  padding: 10px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--lumiverse-radius, 4px);
  margin-bottom: 8px;
}
.hone-preview-modal__diagnostics h4 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: var(--lumiverse-text);
}
.hone-preview-modal__diagnostics ul {
  margin: 0;
  padding-left: 18px;
  font-size: 11px;
  color: var(--lumiverse-text-muted);
}
.hone-preview-msg {
  border: 1px solid var(--lumiverse-border);
  border-radius: var(--lumiverse-radius, 4px);
  overflow: hidden;
}
.hone-preview-msg__role {
  padding: 4px 10px;
  background: var(--lumiverse-fill-subtle, rgba(128, 128, 128, 0.1));
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  color: var(--lumiverse-text-muted);
}
.hone-preview-msg__content {
  margin: 0;
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--lumiverse-text);
  background: var(--lumiverse-bg, transparent);
  max-height: 400px;
  overflow-y: auto;
}

/* ── Subtab bar (used inside drawer tabs) ── */

.hone-subtab-bar {
  display: flex;
  gap: 0;
  margin: 8px 0;
  border-bottom: 1px solid var(--lumiverse-border, rgba(255,255,255,0.12));
}

.hone-subtab-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--lumiverse-text-muted, #888);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 120ms ease, border-color 120ms ease;
}

.hone-subtab-btn:hover {
  color: var(--lumiverse-text, #fff);
}

.hone-subtab-btn.active {
  color: var(--lumiverse-primary, #4a90e2);
  border-bottom-color: var(--lumiverse-primary, #4a90e2);
}

.hone-subtab-content {
  min-height: 100px;
}

/* ── Drawer automation toggle ── */

.hone-drawer-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.hone-drawer-toggle input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--lumiverse-fill-subtle, rgba(255,255,255,0.1));
  border: 1px solid var(--lumiverse-border, rgba(255,255,255,0.15));
  position: relative;
  cursor: pointer;
  transition: background 150ms ease;
}

.hone-drawer-toggle input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--lumiverse-text-muted, #888);
  transition: transform 150ms ease, background 150ms ease;
}

.hone-drawer-toggle input[type="checkbox"]:checked {
  background: var(--lumiverse-primary, #4a90e2);
  border-color: var(--lumiverse-primary, #4a90e2);
}

.hone-drawer-toggle input[type="checkbox"]:checked::after {
  transform: translateX(16px);
  background: #fff;
}

.hone-drawer-toggle-track {
  display: none;
}

/* ── Mobile responsiveness ── */

@media (max-width: 480px) {
  .hone-drawer {
    padding: 8px;
  }
  .hone-preset-bar {
    flex-wrap: wrap;
    gap: 6px;
  }
  .hone-preset-bar__select {
    min-width: 0;
    flex: 1 1 100%;
  }
  .hone-preset-bar__actions {
    flex-wrap: wrap;
    gap: 4px;
  }
  .hone-preset-bar__name {
    flex: 1 1 100%;
  }
  .hone-preset-bar__indicator {
    flex: 1 1 100%;
    text-align: left;
  }
  .hone-subtab-btn {
    padding: 6px 10px;
    font-size: 11px;
  }
  .hone-slider-row {
    padding: 4px 0;
  }
  .hone-slider-header {
    flex-wrap: wrap;
  }
  .hone-prompt-card__content {
    min-height: 80px;
  }
  .hone-settings-btn {
    padding: 4px 8px;
    font-size: 11px;
  }
  .hone-drawer-section {
    padding: 8px;
  }
}

@media (max-width: 360px) {
  .hone-preset-bar__actions {
    justify-content: stretch;
  }
  .hone-preset-bar__actions .hone-settings-btn {
    flex: 1;
    text-align: center;
  }
}
`;
