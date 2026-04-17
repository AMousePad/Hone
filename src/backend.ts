declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { FrontendToBackend, BackendToFrontend, UndoEntry, StageRecord } from "./types";
import { getSettings, updateSettings } from "./settings";
import {
  refineSingle,
  undoRefine,
  refineBulk,
  enhanceUserMessage,
} from "./refinement";
import {
  getStats,
  getUndo,
  saveUndo,
  listUndoEntriesForMessage,
  listRefinedKeysInChat,
  replaceUndoFileForMessage,
} from "./history";
import {
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  duplicatePreset,
  exportPreset,
  importPreset,
} from "./presets";
import { previewStage } from "./refinement";
import { enqueueChatOperation } from "./chat-queue";
import {
  listModelProfiles,
  getModelProfile,
  getDefaultProfile,
  createModelProfile,
  saveModelProfile,
  deleteModelProfile,
  duplicateModelProfile,
  DEFAULT_PROFILE_ID,
} from "./model-profiles";
import {
  listPovPresets,
  savePovPreset,
  deletePovPreset,
  duplicatePovPreset,
  isBuiltInPovPresetId,
  DEFAULT_POV_PRESET_ID,
  DEFAULT_USER_POV_PRESET_ID,
} from "./pov-presets";
import * as hlog from "./hlog";

const grantedPermissions = new Set<string>();

async function initPermissions() {
  try {
    const granted = await spindle.permissions.getGranted();
    for (const p of granted) grantedPermissions.add(p);
    spindle.log.info(`Permissions initialized: ${[...grantedPermissions].join(", ") || "none"}`);
  } catch (err) {
    spindle.log.warn(`Failed to load permissions: ${err instanceof Error ? err.message : err}`);
  }
}

function hasPermission(p: string): boolean {
  return grantedPermissions.has(p);
}

spindle.permissions.onChanged((detail) => {
  grantedPermissions.clear();
  for (const p of detail.allGranted) grantedPermissions.add(p);
  spindle.log.info(`Permissions updated: ${detail.allGranted.join(", ") || "none"}`);
});

spindle.permissions.onDenied((detail) => {
  spindle.log.warn(`Permission denied: ${detail.permission} for ${detail.operation}`);
});

function sendTo(msg: BackendToFrontend, userId: string): void {
  spindle.sendToFrontend(msg, userId);
}

function requirePermission(permission: string, userId: string, messageId?: string): boolean {
  if (hasPermission(permission)) return true;
  const errorMsg = `Missing '${permission}' permission. Grant it in extension settings.`;
  spindle.log.warn(errorMsg);
  sendTo({ type: "refine-error", messageId: messageId || "", error: errorMsg }, userId);
  return false;
}

async function getActiveChatIdFor(userId: string): Promise<string | null> {
  try {
    const active = await spindle.chats.getActive(userId);
    return active?.id || null;
  } catch (err) {
    // A throw (not a null resolve) means permission denied, invalid
    // userId, or infra failure: surface it loudly rather than hide.
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`getActiveChatIdFor(${userId}) failed: ${message}`);
    return null;
  }
}

/** Single-pass snapshot of the chat's refined state.
 *
 *  Returns the last assistant message's id, whether its visible swipe
 *  is refined, any pipeline stages for it, and the full list of
 *  currently-refined assistant message ids in the chat. Computed in
 *  one helper so event handlers get a consistent view from a single
 *  `getMessages` call.
 *
 *  `refinedMessageIds` is per-current-swipe by construction: swiping
 *  to a sibling without an undo entry drops the message from the list. */
async function snapshotLastAiState(
  userId: string,
  chatId: string
): Promise<{
  messageId: string | null;
  refined: boolean;
  stages?: StageRecord[];
  refinedMessageIds: string[];
}> {
  try {
    const messages = await spindle.chat.getMessages(chatId);
    hlog.debug(userId, `snapshotLastAiState: got ${messages.length} messages in chat ${chatId.slice(0, 8)}`);

    // One index read answers "which (messageId, swipeId) pairs are
    // refined?" for the whole chat. No per-message file reads.
    const refinedKeys = await listRefinedKeysInChat(userId, chatId);
    const refinedMessageIds: string[] = [];
    let assistantCount = 0;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      assistantCount++;
      if (refinedKeys.has(`${m.id}:${m.swipe_id}`)) refinedMessageIds.push(m.id);
    }
    hlog.debug(userId, `snapshotLastAiState: scanned ${assistantCount} assistants, ${refinedMessageIds.length} refined`);

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return { messageId: null, refined: false, refinedMessageIds };
    const lastIsRefined = refinedKeys.has(`${lastAssistant.id}:${lastAssistant.swipe_id}`);
    if (!lastIsRefined) return { messageId: lastAssistant.id, refined: false, refinedMessageIds };
    // Only the last assistant needs its full entry loaded (for stages).
    const lastEntry = await getUndo(userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
    if (!lastEntry) return { messageId: lastAssistant.id, refined: false, refinedMessageIds };

    const stages =
      lastEntry.stages && lastEntry.stages.length > 0 ? lastEntry.stages : undefined;
    return { messageId: lastAssistant.id, refined: true, stages, refinedMessageIds };
  } catch (err) {
    // Return a safe "not refined" snapshot so the UI stays usable;
    // log the underlying error so "why is my undo toggle stuck" is
    // debuggable.
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`snapshotLastAiState(${userId}, ${chatId}) failed: ${message}`);
    return { messageId: null, refined: false, refinedMessageIds: [] };
  }
}

async function sendRefinedStateFor(userId: string): Promise<void> {
  const chatId = await getActiveChatIdFor(userId);
  if (!chatId) {
    hlog.debug(userId, `sendRefinedStateFor: no active chat`);
    return;
  }
  const snap = await snapshotLastAiState(userId, chatId);
  hlog.debug(
    userId,
    `sendRefinedStateFor: chat=${chatId.slice(0, 8)} lastRefined=${snap.refined} lastMsg=${snap.messageId?.slice(0, 8) ?? "none"} stages=${snap.stages?.length ?? 0} refinedCount=${snap.refinedMessageIds.length}`
  );
  sendTo(
    {
      type: "active-chat",
      chatId,
      lastMessageRefined: snap.refined,
      lastAiMessageId: snap.messageId,
      lastAiStages: snap.stages,
      refinedMessageIds: snap.refinedMessageIds,
    },
    userId
  );
}

type BoundSender = (msg: BackendToFrontend) => void;

/** Bind a sender to a specific user. Every IPC handler creates one of
 *  these once it knows the authenticated userId. */
function bindSender(userId: string): BoundSender {
  return (msg) => sendTo(msg, userId);
}

spindle.onFrontendMessage(async (raw, userId) => {
  const msg = raw as FrontendToBackend;

  hlog.debug(userId, `IPC received: ${msg?.type || "unknown"}`);

  if (!msg || typeof msg.type !== "string") {
    spindle.log.warn("Received invalid IPC message (missing type)");
    return;
  }

  hlog.debug(userId, `ipc in: ${msg.type}${"chatId" in msg && typeof (msg as { chatId?: unknown }).chatId === "string" ? ` chatId=${(msg as { chatId: string }).chatId.slice(0, 8)}` : ""}${"messageId" in msg && typeof (msg as { messageId?: unknown }).messageId === "string" ? ` msgId=${(msg as { messageId: string }).messageId.slice(0, 8)}` : ""}`);

  // Bound sender scoped to the authenticated user. Every push in
  // this handler targets the sender of the IPC. No broadcasts.
  const send = bindSender(userId);

  try {
    switch (msg.type) {
      case "refine":
        if (!requirePermission("chat_mutation", userId, msg.messageId)) break;
        hlog.debug(userId, `Refining message ${msg.messageId} in chat ${msg.chatId}`);
        await refineSingle(msg.chatId, msg.messageId, userId, send);
        await sendRefinedStateFor(userId);
        break;

      case "undo":
        if (!requirePermission("chat_mutation", userId, msg.messageId)) break;
        hlog.debug(userId, `Undoing refinement for ${msg.messageId} in chat ${msg.chatId}`);
        await undoRefine(msg.chatId, msg.messageId, userId, send);
        await sendRefinedStateFor(userId);
        break;

      case "bulk-refine":
        if (!requirePermission("chat_mutation", userId)) break;
        hlog.debug(userId, `Bulk refining ${msg.messageIds.length} messages in chat ${msg.chatId}`);
        await refineBulk(msg.chatId, msg.messageIds, userId, send);
        break;

      case "enhance":
        if (!requirePermission("chat_mutation", userId)) break;
        hlog.debug(userId, `Enhancing user message in chat ${msg.chatId} (mode: ${msg.mode})`);
        await enhanceUserMessage(msg.text, msg.chatId, userId, msg.mode, send);
        break;

      case "get-settings": {
        const settings = await getSettings(userId);
        send({ type: "settings", settings });
        break;
      }

      case "update-settings": {
        const updated = await updateSettings(userId, msg.settings);
        send({ type: "settings", settings: updated });
        // When a debug-related field changed, push fresh hlog buffer
        // state in the same handler so the settings page updates its
        // "N / M entries (recording)" line without a separate IPC
        // round-trip (which could race with a concurrent get-debug-logs).
        if ("debugLogging" in msg.settings || "debugLogMaxEntries" in msg.settings) {
          const stats = hlog.bufferStats(userId);
          send({
            type: "debug-logs",
            formatted: hlog.formatLogs(userId),
            count: stats.count,
            capacity: stats.capacity,
            enabled: stats.enabled,
          });
        }
        break;
      }

      case "get-stats": {
        if (!requirePermission("chats", userId)) break;
        const stats = await getStats(userId, msg.chatId);
        send({ type: "stats", stats });
        break;
      }

      case "view-diff": {
        if (!requirePermission("chats", userId, msg.messageId)) break;
        try {
          const messages = await spindle.chat.getMessages(msg.chatId);
          const targetMsg = messages.find((m) => m.id === msg.messageId);
          if (!targetMsg) {
            send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
            break;
          }
          const entry = await getUndo(userId, msg.chatId, msg.messageId, targetMsg.swipe_id);
          if (entry) {
            send({ type: "diff", original: entry.originalContent, refined: entry.refinedContent });
          } else {
            send({ type: "refine-error", messageId: msg.messageId, error: "No diff data found for this swipe" });
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc view-diff: FAILED: ${error}`);
          send({ type: "refine-error", messageId: msg.messageId, error });
        }
        break;
      }

      case "list-presets": {
        hlog.debug(userId, `ipc list-presets: fetching`);
        const presets = await listPresets(userId);
        const settings = await getSettings(userId);
        hlog.debug(userId, `ipc list-presets: returning ${presets.length} presets, activeId="${settings.currentPresetId}"`);
        send({ type: "presets", presets, activeId: settings.currentPresetId, activeInputId: settings.currentInputPresetId });
        break;
      }

      case "get-preset": {
        hlog.debug(userId, `ipc get-preset: id="${msg.id}"`);
        const preset = await getPreset(userId, msg.id);
        if (!preset) {
          hlog.debug(userId, `ipc get-preset: "${msg.id}" not found, falling back`);
          // Push the preset list so the frontend can reconcile its
          // dropdown. Without this it would wait for a `preset`
          // message that never comes.
          const settings = await getSettings(userId);
          const presets = await listPresets(userId);
          send({ type: "presets", presets, activeId: settings.currentPresetId, activeInputId: settings.currentInputPresetId });
          break;
        }
        hlog.debug(userId, `ipc get-preset: sending "${preset.name}" strategy=${preset.strategy} prompts=${preset.prompts.length}`);
        send({ type: "preset", preset });
        break;
      }

      case "save-preset": {
        hlog.debug(userId, `ipc save-preset: id="${msg.preset.id}" name="${msg.preset.name}"`);
        try {
          await savePreset(userId, msg.preset);
          const presets = await listPresets(userId);
          const settings = await getSettings(userId);
          hlog.debug(userId, `ipc save-preset: saved successfully, pushing updated list`);
          send({ type: "presets", presets, activeId: settings.currentPresetId, activeInputId: settings.currentInputPresetId });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc save-preset: FAILED: ${error}`);
          spindle.log.warn(`[Hone] save-preset failed: ${error}`);
          send({ type: "preset-import-result", success: false, error });
        }
        break;
      }

      case "delete-preset": {
        hlog.debug(userId, `ipc delete-preset: id="${msg.id}"`);
        try {
          await deletePreset(userId, msg.id);
          hlog.debug(userId, `ipc delete-preset: deleted "${msg.id}"`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc delete-preset: FAILED: ${error}`);
          spindle.log.warn(`[Hone] delete-preset failed: ${error}`);
          send({ type: "refine-error", messageId: "", error: `Failed to delete preset: ${error}` });
          const presets = await listPresets(userId);
          const settings = await getSettings(userId);
          send({ type: "presets", presets, activeId: settings.currentPresetId, activeInputId: settings.currentInputPresetId });
          break;
        }
        // If the deleted preset was active in either slot, fall back
        // to that slot's built-in default. Both slots are checked,
        // since a single preset id can be active in both slots at once.
        const settings = await getSettings(userId);
        const { DEFAULT_ACTIVE_PRESET_ID, DEFAULT_INPUT_ACTIVE_PRESET_ID } = await import("./preset-defaults");
        const fallbacks: Partial<import("./types").HoneSettings> = {};
        if (settings.currentPresetId === msg.id) {
          hlog.debug(userId, `ipc delete-preset: deleted active output preset, falling back to "${DEFAULT_ACTIVE_PRESET_ID}"`);
          fallbacks.currentPresetId = DEFAULT_ACTIVE_PRESET_ID;
        }
        if (settings.currentInputPresetId === msg.id) {
          hlog.debug(userId, `ipc delete-preset: deleted active input preset, falling back to "${DEFAULT_INPUT_ACTIVE_PRESET_ID}"`);
          fallbacks.currentInputPresetId = DEFAULT_INPUT_ACTIVE_PRESET_ID;
        }
        if (Object.keys(fallbacks).length > 0) {
          await updateSettings(userId, fallbacks);
        }
        const presets = await listPresets(userId);
        const freshSettings = await getSettings(userId);
        send({ type: "presets", presets, activeId: freshSettings.currentPresetId, activeInputId: freshSettings.currentInputPresetId });
        break;
      }

      case "duplicate-preset": {
        hlog.debug(userId, `ipc duplicate-preset: source="${msg.id}" slot=${msg.slot}`);
        try {
          const copy = await duplicatePreset(userId, msg.id);
          hlog.debug(userId, `ipc duplicate-preset: created "${copy.name}" (id="${copy.id}"), setting as active ${msg.slot} preset`);
          const settingsKey = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
          await updateSettings(userId, { [settingsKey]: copy.id });
          const presets = await listPresets(userId);
          const dupSettings = await getSettings(userId);
          send({ type: "presets", presets, activeId: dupSettings.currentPresetId, activeInputId: dupSettings.currentInputPresetId });
          send({ type: "preset", preset: copy });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc duplicate-preset: FAILED: ${error}`);
          spindle.log.warn(`[Hone] duplicate-preset failed: ${error}`);
          send({ type: "preset-import-result", success: false, error });
        }
        break;
      }

      case "set-active-preset": {
        hlog.debug(userId, `ipc set-active-preset: id="${msg.id}" slot=${msg.slot}`);
        const preset = await getPreset(userId, msg.id);
        if (!preset) {
          hlog.debug(userId, `ipc set-active-preset: "${msg.id}" not found`);
          spindle.log.warn(`[Hone] set-active-preset: preset "${msg.id}" not found`);
          break;
        }
        const settingsKey = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
        await updateSettings(userId, { [settingsKey]: msg.id });
        hlog.debug(userId, `ipc set-active-preset: switched ${msg.slot} to "${preset.name}"`);
        const presets = await listPresets(userId);
        const setActiveSettings = await getSettings(userId);
        send({ type: "presets", presets, activeId: setActiveSettings.currentPresetId, activeInputId: setActiveSettings.currentInputPresetId });
        send({ type: "preset", preset });
        break;
      }

      case "export-preset": {
        hlog.debug(userId, `ipc export-preset: id="${msg.id}"`);
        try {
          const exported = await exportPreset(userId, msg.id);
          hlog.debug(userId, `ipc export-preset: exported "${exported.name}": ${exported.json.length} chars`);
          send({
            type: "preset-exported",
            id: exported.id,
            name: exported.name,
            json: exported.json,
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc export-preset: FAILED: ${error}`);
          spindle.log.warn(`[Hone] export-preset failed: ${error}`);
          send({ type: "preset-import-result", success: false, error });
        }
        break;
      }

      case "import-preset": {
        hlog.debug(userId, `ipc import-preset: ${msg.json.length} chars slot=${msg.slot}`);
        try {
          const imported = await importPreset(userId, msg.json, msg.slot);
          hlog.debug(userId, `ipc import-preset: saved "${imported.name}" (id="${imported.id}"), setting as active ${msg.slot} preset`);
          const settingsKey = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
          await updateSettings(userId, { [settingsKey]: imported.id });
          const presets = await listPresets(userId);
          const importSettings = await getSettings(userId);
          send({ type: "presets", presets, activeId: importSettings.currentPresetId, activeInputId: importSettings.currentInputPresetId });
          send({ type: "preset", preset: imported });
          send({ type: "preset-import-result", success: true, id: imported.id });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc import-preset: FAILED: ${error}`);
          spindle.log.warn(`[Hone] import-preset failed: ${error}`);
          send({ type: "preset-import-result", success: false, error });
        }
        break;
      }

      case "preview-stage": {
        // Frontend doesn't track chatId (backend is the authority), so
        // resolve the active chat when the message omits one.
        const previewChatId = msg.chatId || (await getActiveChatIdFor(userId)) || undefined;
        hlog.debug(userId, `ipc preview-stage: slot=${msg.slot} path=${JSON.stringify(msg.path)} stageIndex=${msg.stageIndex} chatId=${previewChatId?.slice(0, 8) || "none"} (resolved=${!msg.chatId})`);
        try {
          const settings = await getSettings(userId);
          const presetId = msg.slot === "input" ? settings.currentInputPresetId : settings.currentPresetId;
          const preset = await getPreset(userId, presetId);
          if (!preset) {
            hlog.debug(userId, `ipc preview-stage: no active ${msg.slot} preset (id="${presetId}")`);
            spindle.log.warn(`[Hone] preview-stage: no active ${msg.slot} preset`);
            break;
          }
          hlog.debug(userId, `ipc preview-stage: using preset="${preset.name}" strategy=${preset.strategy}`);
          const pipeline =
            msg.path.kind === "pipeline"
              ? preset.pipeline
              : msg.path.kind === "proposal"
                ? preset.parallel?.proposals[msg.path.proposalIndex]
                : preset.parallel?.aggregator;
          if (!pipeline) {
            hlog.debug(userId, `ipc preview-stage: pipeline not found for path ${JSON.stringify(msg.path)}`);
            spindle.log.warn(`[Hone] preview-stage: pipeline not found for path ${JSON.stringify(msg.path)}`);
            break;
          }
          hlog.debug(userId, `ipc preview-stage: pipeline has ${pipeline.stages.length} stages`);
          const stage = pipeline.stages[msg.stageIndex];
          if (!stage) {
            hlog.debug(userId, `ipc preview-stage: stage ${msg.stageIndex} out of range (max ${pipeline.stages.length - 1})`);
            spindle.log.warn(`[Hone] preview-stage: stage ${msg.stageIndex} not found`);
            break;
          }
          // Placeholder proposals for aggregator previews so
          // `{{proposal_N}}` macros resolve to visible markers.
          const proposals =
            msg.path.kind === "aggregator" && preset.parallel
              ? preset.parallel.proposals.map(
                  (_, i) => `<proposal ${i + 1} output: placeholder since no LLM was called for the preview>`
                )
              : undefined;
          hlog.debug(userId, `ipc preview-stage: calling previewStage for "${stage.name}" (${msg.stageIndex}/${pipeline.stages.length})`);
          const result = await previewStage(
            preset,
            stage,
            msg.stageIndex,
            pipeline.stages.length,
            userId,
            proposals,
            previewChatId,
            msg.slot
          );
          hlog.debug(userId, `ipc preview-stage: done: ${result.messages.length} messages, ${result.diagnostics.length} diagnostics`);
          send({
            type: "preview-result",
            path: msg.path,
            stageIndex: msg.stageIndex,
            messages: result.messages,
            diagnostics: result.diagnostics,
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          hlog.debug(userId, `ipc preview-stage: FAILED: ${error}`);
          spindle.log.warn(`[Hone] preview-stage failed: ${error}`);
        }
        break;
      }

      case "get-connections": {
        if (!requirePermission("generation", userId)) break;
        try {
          const conns = await spindle.connections.list(userId);
          send({
            type: "connections",
            connections: (conns ?? []).map((c: any) => ({
              id: c.id,
              name: c.name,
              provider: c.provider || "",
              model: c.model || "",
              is_default: !!c.is_default,
              has_api_key: !!c.has_api_key,
            })),
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          spindle.log.warn(`get-connections failed: ${error}`);
          send({ type: "connections", connections: [], error });
        }
        break;
      }

      case "get-active-chat": {
        const chatId = await getActiveChatIdFor(userId);
        hlog.debug(userId, `Active chat: ${chatId || "none"}`);
        if (!chatId) {
          send({
            type: "active-chat",
            chatId: null,
            lastMessageRefined: false,
            lastAiMessageId: null,
            refinedMessageIds: [],
          });
          break;
        }
        const snap = await snapshotLastAiState(userId, chatId);
        send({
          type: "active-chat",
          chatId,
          lastMessageRefined: snap.refined,
          lastAiMessageId: snap.messageId,
          lastAiStages: snap.stages,
          refinedMessageIds: snap.refinedMessageIds,
        });
        break;
      }

      case "refine-last": {
        if (!requirePermission("chat_mutation", userId)) break;
        if (!requirePermission("chats", userId)) break;
        try {
          const chatId = await getActiveChatIdFor(userId);
          if (!chatId) {
            send({ type: "refine-error", messageId: "", error: "No active chat" });
            break;
          }

          const messages = await spindle.chat.getMessages(chatId);
          const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
          if (!lastAssistant) {
            send({ type: "refine-error", messageId: "", error: "No assistant message found in chat" });
            break;
          }
          hlog.debug(userId, `Refine-last: refining ${lastAssistant.id} in chat ${chatId}`);
          await refineSingle(chatId, lastAssistant.id, userId, send);
          await sendRefinedStateFor(userId);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          send({ type: "refine-error", messageId: "", error });
        }
        break;
      }

      case "undo-last": {
        if (!requirePermission("chat_mutation", userId)) break;
        if (!requirePermission("chats", userId)) break;
        try {
          const chatId = await getActiveChatIdFor(userId);
          if (!chatId) {
            send({ type: "refine-error", messageId: "", error: "No active chat" });
            break;
          }

          const messages = await spindle.chat.getMessages(chatId);
          const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
          if (!lastAssistant) {
            send({ type: "refine-error", messageId: "", error: "No assistant message in chat" });
            break;
          }
          const entry = await getUndo(userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
          if (!entry) {
            send({ type: "refine-error", messageId: "", error: "No undo available for the current swipe" });
            break;
          }
          hlog.debug(userId, `Undo-last: undoing ${lastAssistant.id} swipe ${lastAssistant.swipe_id}`);
          await undoRefine(chatId, lastAssistant.id, userId, send);
          await sendRefinedStateFor(userId);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          send({ type: "refine-error", messageId: "", error });
        }
        break;
      }

      case "refine-all": {
        if (!requirePermission("chat_mutation", userId)) break;
        if (!requirePermission("chats", userId)) break;
        try {
          const chatId = await getActiveChatIdFor(userId);
          if (!chatId) {
            send({ type: "refine-error", messageId: "", error: "No active chat" });
            break;
          }

          const messages = await spindle.chat.getMessages(chatId);
          // Assistant-only. User messages route through the enhance
          // pipeline, which has its own per-message trigger.
          const assistantIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
          if (assistantIds.length === 0) {
            send({ type: "refine-error", messageId: "", error: "No assistant messages in chat" });
            break;
          }
          hlog.debug(userId, `Refine-all: refining ${assistantIds.length} assistant messages in chat ${chatId}`);
          await refineBulk(chatId, assistantIds, userId, send);
          await sendRefinedStateFor(userId);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          send({ type: "refine-error", messageId: "", error });
        }
        break;
      }

      case "use-stage-version": {
        if (!requirePermission("chat_mutation", userId)) break;
        try {
          // Stages live inside the undo entry itself; there's no
          // separate stage-history store. Read the live entry on the
          // current swipe to find the outputs to flip between.
          const currentMsg = (await spindle.chat.getMessages(msg.chatId)).find((m) => m.id === msg.messageId);
          if (!currentMsg) {
            send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
            break;
          }
          const swipeId = currentMsg.swipe_id;
          const existingEntry = await getUndo(userId, msg.chatId, msg.messageId, swipeId);
          if (!existingEntry) {
            send({ type: "refine-error", messageId: msg.messageId, error: "No active refinement on this swipe" });
            break;
          }
          if (!existingEntry.stages || existingEntry.stages.length === 0) {
            send({ type: "refine-error", messageId: msg.messageId, error: "This refinement has no pipeline stages to pick from" });
            break;
          }
          const stage = existingEntry.stages.find(
            (s) => s.index === msg.stageIndex && s.kind === msg.stageKind
          );
          if (!stage) {
            send({
              type: "refine-error",
              messageId: msg.messageId,
              error: `Stage ${msg.stageKind}[${msg.stageIndex}] not found`,
            });
            break;
          }

          // Re-save the undo entry with the picked stage as the live
          // refined content, preserving originalContent + stages. The
          // user can flip between stages freely; undo always restores
          // to originalContent regardless of which stage was last picked.
          const updatedEntry: UndoEntry = {
            ...existingEntry,
            refinedContent: stage.text,
            strategy: `stage-${stage.name}`,
            timestamp: Date.now(),
          };
          await saveUndo(userId, msg.chatId, msg.messageId, swipeId, updatedEntry);

          // Two-write compensation: if updateMessage fails, restore
          // the prior entry (not delete; there WAS a valid
          // refinement before the flip).
          try {
            await spindle.chat.updateMessage(msg.chatId, msg.messageId, {
              content: stage.text,
              metadata: { ...(currentMsg.metadata || {}), hone_refined: true },
            });
          } catch (updateErr) {
            const updateError = updateErr instanceof Error ? updateErr.message : String(updateErr);
            spindle.log.warn(
              `[Hone] rollback: use-stage-version updateMessage failed for ${msg.messageId} swipe ${swipeId}: ${updateError}; restoring prior undo entry`
            );
            try {
              await saveUndo(userId, msg.chatId, msg.messageId, swipeId, existingEntry);
              spindle.log.warn(`[Hone] rollback: prior undo entry restored for ${msg.messageId} swipe ${swipeId}`);
            } catch (rollbackErr) {
              const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
              spindle.log.error(
                `[Hone] rollback FAILED for ${msg.messageId} swipe ${swipeId}: ${rollbackError}. Undo entry now points at a stage that was not applied; next refine/undo of this swipe will reconcile`
              );
            }
            throw updateErr;
          }

          // Diff against originalContent (preserved across flips);
          // currentMsg.content holds the previous stage's text, not
          // the pre-refinement original.
          send({ type: "diff", original: existingEntry.originalContent, refined: stage.text });
          send({ type: "refine-complete", messageId: msg.messageId, success: true });
          await sendRefinedStateFor(userId);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          send({ type: "refine-error", messageId: msg.messageId, error });
        }
        break;
      }

      case "list-model-profiles": {
        hlog.debug(userId, `ipc in: list-model-profiles`);
        const profiles = await listModelProfiles(userId);
        send({ type: "model-profiles", profiles });
        break;
      }

      case "get-model-profile": {
        hlog.debug(userId, `ipc in: get-model-profile`);
        const id = msg.id;
        if (id === DEFAULT_PROFILE_ID) {
          send({ type: "model-profile", profile: getDefaultProfile() });
        } else {
          const profile = await getModelProfile(userId, id);
          if (profile) {
            send({ type: "model-profile", profile });
          } else {
            // Not found. Push the default so the UI doesn't stay
            // stuck on "Loading model profile...".
            hlog.debug(userId, `ipc get-model-profile: "${id}" not found, falling back to default`);
            send({ type: "model-profile", profile: getDefaultProfile() });
            const settings = await getSettings(userId);
            if (settings.activeModelProfileId === id) {
              await updateSettings(userId, { activeModelProfileId: "" });
              send({ type: "settings", settings: { ...settings, activeModelProfileId: "" } });
            }
          }
        }
        break;
      }

      case "create-model-profile": {
        hlog.debug(userId, `ipc in: create-model-profile`);
        const profile = await createModelProfile(userId, msg.connectionProfileId, msg.name);
        send({ type: "model-profile", profile });
        await updateSettings(userId, { activeModelProfileId: profile.id });
        const updatedSettings = await getSettings(userId);
        send({ type: "settings", settings: updatedSettings });
        send({ type: "model-profiles", profiles: await listModelProfiles(userId) });
        break;
      }

      case "save-model-profile": {
        hlog.debug(userId, `ipc in: save-model-profile`);
        await saveModelProfile(userId, msg.profile);
        send({ type: "model-profile", profile: msg.profile });
        send({ type: "model-profiles", profiles: await listModelProfiles(userId) });
        break;
      }

      case "delete-model-profile": {
        hlog.debug(userId, `ipc in: delete-model-profile`);
        await deleteModelProfile(userId, msg.id);
        const settings = await getSettings(userId);
        if (settings.activeModelProfileId === msg.id) {
          await updateSettings(userId, { activeModelProfileId: "" });
          const updatedSettings = await getSettings(userId);
          send({ type: "settings", settings: updatedSettings });
        }
        send({ type: "model-profiles", profiles: await listModelProfiles(userId) });
        break;
      }

      case "duplicate-model-profile": {
        hlog.debug(userId, `ipc in: duplicate-model-profile`);
        // The virtual Default profile has no persisted state, so
        // "duplicate" is semantically identical to "create new". The
        // frontend routes that path through create-model-profile; this
        // branch is a defensive fallback for direct IPC callers.
        const dup = msg.id === DEFAULT_PROFILE_ID
          ? await createModelProfile(userId, "", "New Profile")
          : await duplicateModelProfile(userId, msg.id);
        if (dup) {
          await updateSettings(userId, { activeModelProfileId: dup.id });
          const updatedSettings = await getSettings(userId);
          send({ type: "settings", settings: updatedSettings });
          send({ type: "model-profile", profile: dup });
          send({ type: "model-profiles", profiles: await listModelProfiles(userId) });
        } else {
          hlog.debug(userId, `ipc duplicate-model-profile: source "${msg.id}" not found`);
        }
        break;
      }

      case "list-pov-presets": {
        hlog.debug(userId, `ipc in: list-pov-presets`);
        const presets = await listPovPresets(userId);
        send({ type: "pov-presets", presets });
        break;
      }

      case "save-pov-preset": {
        hlog.debug(userId, `ipc in: save-pov-preset id="${msg.preset.id}"`);
        try {
          if (isBuiltInPovPresetId(msg.preset.id)) {
            throw new Error(
              `Cannot save over built-in POV preset "${msg.preset.id}"; duplicate it first.`
            );
          }
          await savePovPreset(userId, msg.preset);
          send({ type: "pov-presets", presets: await listPovPresets(userId) });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          spindle.log.warn(`[Hone] save-pov-preset failed: ${error}`);
          send({ type: "pov-presets", presets: await listPovPresets(userId) });
          send({ type: "pov-preset-error", error: `Failed to save POV preset: ${error}` });
        }
        break;
      }

      case "delete-pov-preset": {
        hlog.debug(userId, `ipc in: delete-pov-preset id="${msg.id}"`);
        try {
          if (isBuiltInPovPresetId(msg.id)) {
            throw new Error(`Cannot delete built-in POV preset "${msg.id}".`);
          }
          await deletePovPreset(userId, msg.id);
          const settings = await getSettings(userId);
          const patch: Partial<import("./types").HoneSettings> = {};
          if (settings.pov === msg.id) patch.pov = DEFAULT_POV_PRESET_ID;
          if (settings.userPov === msg.id) patch.userPov = DEFAULT_USER_POV_PRESET_ID;
          if (Object.keys(patch).length > 0) {
            const updated = await updateSettings(userId, patch);
            send({ type: "settings", settings: updated });
          }
          send({ type: "pov-presets", presets: await listPovPresets(userId) });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          spindle.log.warn(`[Hone] delete-pov-preset failed: ${error}`);
          send({ type: "pov-presets", presets: await listPovPresets(userId) });
          send({ type: "pov-preset-error", error: `Failed to delete POV preset: ${error}` });
        }
        break;
      }

      case "duplicate-pov-preset": {
        hlog.debug(userId, `ipc in: duplicate-pov-preset id="${msg.id}" slot=${msg.slot}`);
        try {
          const copy = await duplicatePovPreset(userId, msg.id);
          const settingsKey = msg.slot === "input" ? "userPov" : "pov";
          const updated = await updateSettings(userId, { [settingsKey]: copy.id });
          send({ type: "settings", settings: updated });
          send({ type: "pov-presets", presets: await listPovPresets(userId) });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          spindle.log.warn(`[Hone] duplicate-pov-preset failed: ${error}`);
          send({ type: "pov-presets", presets: await listPovPresets(userId) });
          send({ type: "pov-preset-error", error: `Failed to duplicate POV preset: ${error}` });
        }
        break;
      }

      case "get-debug-logs": {
        // Purely in-memory per-user state. No permission check.
        const formatted = hlog.formatLogs(userId);
        const stats = hlog.bufferStats(userId);
        send({
          type: "debug-logs",
          formatted,
          count: stats.count,
          capacity: stats.capacity,
          enabled: stats.enabled,
        });
        break;
      }

      case "log": {
        // Frontend -> backend log bridge (see src/ui/flog.ts). Errors
        // go to spindle.log.warn so operators see them; all levels go
        // to the user's hlog buffer so their debug export captures
        // the full event stream across both sides of the IPC boundary.
        if (msg.level === "error") {
          spindle.log.warn(`[Hone][frontend] ERROR ${msg.msg}`);
        }
        hlog.debug(userId, `[frontend ${msg.level}] ${msg.msg}`);
        break;
      }

      case "clear-debug-logs": {
        hlog.clearLogs(userId);
        const stats = hlog.bufferStats(userId);
        send({
          type: "debug-logs",
          formatted: hlog.formatLogs(userId),
          count: stats.count,
          capacity: stats.capacity,
          enabled: stats.enabled,
        });
        break;
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`IPC handler error (${msg.type}): ${error}`);
  }
});

// Per-user in-flight generation tracking. Each user's UI has its own
// "Generating..." indicator; overlapping generations can't leave one
// user's UI stuck when another user's generation ends.
const activeGenerationsByUser = new Map<string, Set<string>>();

function addActiveGeneration(userId: string, generationId: string): void {
  let set = activeGenerationsByUser.get(userId);
  if (!set) {
    set = new Set();
    activeGenerationsByUser.set(userId, set);
  }
  set.add(generationId);
}

function removeActiveGeneration(userId: string, generationId: string): void {
  const set = activeGenerationsByUser.get(userId);
  if (!set) return;
  set.delete(generationId);
  if (set.size === 0) activeGenerationsByUser.delete(userId);
}

function publishGeneratingFor(userId: string): void {
  const generating = (activeGenerationsByUser.get(userId)?.size ?? 0) > 0;
  sendTo({ type: "generation-state", generating }, userId);
}

spindle.on("GENERATION_STARTED", (payload: any, userId?: string) => {
  const id = payload?.generationId;
  if (!id || !userId) return;
  addActiveGeneration(userId, id);
  hlog.debug(userId, `GENERATION_STARTED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
  publishGeneratingFor(userId);
});

spindle.on("GENERATION_STOPPED", (payload: any, userId?: string) => {
  const id = payload?.generationId;
  if (!id || !userId) return;
  removeActiveGeneration(userId, id);
  hlog.debug(userId, `GENERATION_STOPPED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
  publishGeneratingFor(userId);
});

spindle.on("GENERATION_ENDED", async (payload: any, userId?: string) => {
  const id = payload?.generationId;
  if (!userId) return;
  if (id) removeActiveGeneration(userId, id);
  hlog.debug(userId, `GENERATION_ENDED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
  publishGeneratingFor(userId);

  const settings = await getSettings(userId);
  if (!settings.enabled || !settings.autoRefine) return;
  if (!hasPermission("chat_mutation")) return;

  const chatId = payload.chatId;
  const messageId = payload.messageId;
  if (!chatId || !messageId) return;

  const send = bindSender(userId);

  try {
    const messages = await spindle.chat.getMessages(chatId);
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.role !== "assistant") return;

    hlog.debug(userId, `Auto-refine triggered for ${messageId} in chat ${chatId}`);
    send({ type: "auto-refine-started", messageId });
    await refineSingle(chatId, messageId, userId, send);
    send({ type: "auto-refine-complete", messageId, success: true });
    await sendRefinedStateFor(userId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`Auto-refine failed: ${error}`);
    send({ type: "auto-refine-complete", messageId, success: false });
  }
});

// TODO(auto-enhance): wire a MESSAGE_SENT handler that runs the input
// preset pipeline when settings.userAutoEnhance is true. Until then,
// user-message enhancement is triggered exclusively by the manual
// Hone button in the chat input bar (-> "enhance" IPC handler above).

// MESSAGE_EDITED is intentionally NOT listened to: edits must preserve
// undo so users can still undo after manually tweaking a refined
// message. Ignoring every event is equivalent to removing the listener,
// and removing it eliminates self-loop races from our own updateMessage
// calls during refinement.

/** Reconcile per-swipe undo storage after a deleteSwipe event.
 *
 *  MUST run inside `enqueueChatOperation`. Not re-entrant safe.
 *
 *  - The entry at `deletedSwipeId` is dropped.
 *  - Entries above `deletedSwipeId` shift down by 1 to match the new
 *    `message.swipes[]` layout.
 *  - Entries below `deletedSwipeId` are untouched. */
async function handleSwipeDeletion(
  userId: string,
  chatId: string,
  messageId: string,
  deletedSwipeId: number
): Promise<void> {
  const stored = await listUndoEntriesForMessage(userId, chatId, messageId);
  if (stored.length === 0) return;

  // Compute the new shape in memory, then write the whole message
  // file + index in one pass via replaceUndoFileForMessage. Avoids
  // the interleaved delete/save that could lose data on partial failure.
  const next: Array<{ swipeId: number; entry: UndoEntry }> = [];
  for (const { swipeId, entry } of stored) {
    if (swipeId === deletedSwipeId) {
      hlog.debug(userId, `Undo dropped for ${messageId} swipe ${swipeId}: swipe deleted`);
      continue;
    }
    if (swipeId > deletedSwipeId) {
      const newIndex = swipeId - 1;
      next.push({ swipeId: newIndex, entry: { ...entry, swipeId: newIndex } });
      hlog.debug(userId, `Undo re-keyed for ${messageId}: swipe ${swipeId} -> ${newIndex} (deleteSwipe shift)`);
    } else {
      next.push({ swipeId, entry });
    }
  }
  await replaceUndoFileForMessage(userId, chatId, messageId, next);
}

// MESSAGE_SWIPED discriminator (Lumiverse ≥ spindle-types 0.4.17):
//   added:     new swipe appended. No existing undo state to touch.
//   updated:   a swipe's content was edited. Edits never invalidate
//              undo; nothing to do.
//   deleted:   slot at `swipeId` removed. Drop its undo entry and
//              shift higher indices down by 1.
//   navigated: cycled to a different slot. No storage change.
// Every action still triggers a UI refresh so the active-chat snapshot
// reflects the new active swipe.
spindle.on("MESSAGE_SWIPED", async (payload: any, userId?: string) => {
  const { chatId, message, action, swipeId } = payload;
  if (!userId) return;

  hlog.debug(userId, `MESSAGE_SWIPED(${action}) chat=${chatId.slice(0, 8)} msg=${message.id.slice(0, 8)} swipeId=${swipeId}`);

  if (action === "deleted") {
    // Serialize through the same chat queue refineSingle uses so a
    // concurrent refine + swipe-delete can't interleave reads/writes.
    await enqueueChatOperation(`${userId}:${chatId}`, () =>
      handleSwipeDeletion(userId, chatId, message.id, swipeId)
    );
  }

  await sendRefinedStateFor(userId);
});

spindle.on("MESSAGE_DELETED", async (payload: any, userId?: string) => {
  const { chatId, messageId } = payload || {};
  if (!userId || !chatId || !messageId) return;
  hlog.debug(userId, `MESSAGE_DELETED chat=${chatId.slice(0, 8)} msg=${messageId.slice(0, 8)}`);

  await enqueueChatOperation(`${userId}:${chatId}`, () =>
    replaceUndoFileForMessage(userId, chatId, messageId, [])
  );
  await sendRefinedStateFor(userId);
});

// CHAT_CHANGED fires only on chat metadata updates (title, favorite,
// avatar, reattribution); never affects refined-state for the last
// message, so no backend listener.
//
// SETTINGS_UPDATED(activeChatId) is how Lumiverse signals chat-switching.
// The frontend subscribes to it and sends a fresh `get-active-chat`
// IPC, which carries the authenticated userId. Backend listener would
// be redundant.

async function init() {
  await initPermissions();
  // Settings are per-user and lazy-loaded on first IPC.
  spindle.log.info("Hone extension loaded");
}

init();
