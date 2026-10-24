/*
 * Vencord userplugin: FakeDeafen
 * Other people see you as deafened (and optionally muted) while you can still hear the call.
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { SelectedChannelStore, showToast } from "@webpack/common";

const VoiceActions = findByPropsLazy("toggleSelfDeaf", "toggleSelfMute");

const VOICE_STATE_UPDATE = 4;

const IS_MAC = navigator.platform.toLowerCase().includes("mac");
const SHORTCUT_LABEL = IS_MAC ? "⌘ + ⌥ + D" : "Ctrl + Alt + D";

const settings = definePluginSettings({
    fakeMute: {
        type: OptionType.BOOLEAN,
        description: "Also appear muted while fake deafened",
        default: true
    },
    enableShortcut: {
        type: OptionType.BOOLEAN,
        description: `Toggle fake deafen with ${SHORTCUT_LABEL}`,
        default: true
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when toggling fake deafen",
        default: true
    }
});

let enabled = false;
let originalSend: typeof WebSocket.prototype.send | null = null;

function patchPayload(data: unknown) {
    if (!enabled || typeof data !== "string" || !data.includes("self_deaf")) return data;

    try {
        const payload = JSON.parse(data);
        if (payload?.op !== VOICE_STATE_UPDATE || !payload.d) return data;

        payload.d.self_deaf = true;
        if (settings.store.fakeMute) payload.d.self_mute = true;

        return JSON.stringify(payload);
    } catch {
        return data;
    }
}

// Toggling deafen twice makes the client send two fresh voice state updates,
// so the server picks up the new (fake or real) state without any visible flicker.
function resendVoiceState() {
    if (!SelectedChannelStore.getVoiceChannelId()) return;
    VoiceActions.toggleSelfDeaf();
    setTimeout(() => VoiceActions.toggleSelfDeaf(), 100);
}

function toggle() {
    enabled = !enabled;
    resendVoiceState();

    if (settings.store.showToasts) {
        showToast({
            text: enabled ? "Fake deafen enabled" : "Fake deafen disabled",
            variant: enabled ? "success" : "default"
        });
    }
}

// Match on e.code: on macOS, Option changes e.key (Option + D gives "∂").
function onKeyDown(e: KeyboardEvent) {
    if (!settings.store.enableShortcut || e.code !== "KeyD" || !e.altKey || e.shiftKey) return;
    if (IS_MAC ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();
    toggle();
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Appear deafened to others while still hearing everyone in the call",
    authors: [{ name: "You", id: 0n }],
    settings,

    toolboxActions: {
        "Toggle Fake Deafen": toggle
    },

    commands: [
        {
            name: "fakedeafen",
            description: "Toggle fake deafen",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: (_, ctx) => {
                toggle();
                sendBotMessage(ctx.channel.id, {
                    content: `Fake deafen is now **${enabled ? "on" : "off"}**.`
                });
            }
        }
    ],

    start() {
        originalSend = WebSocket.prototype.send;
        const send = originalSend;
        WebSocket.prototype.send = function (data) {
            return send.call(this, patchPayload(data) as any);
        };
        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, true);
        if (enabled) {
            enabled = false;
            resendVoiceState();
        }
        if (originalSend) {
            WebSocket.prototype.send = originalSend;
            originalSend = null;
        }
    }
});
