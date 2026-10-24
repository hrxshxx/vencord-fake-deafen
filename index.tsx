/*
 * Vencord userplugin: FakeDeafen
 * Other people see you as deafened (and optionally muted) while you can still hear the call.
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findComponentByCodeLazy, findStoreLazy } from "@webpack";
import { SelectedChannelStore, showToast, useEffect, useState } from "@webpack/common";

import managedStyle from "./style.css?managed";

const VoiceActions = findByPropsLazy("toggleSelfDeaf", "toggleSelfMute");
const GatewayConnectionStore = findStoreLazy("GatewayConnectionStore");
// The same button component Discord uses for mute / deafen in the user panel
const PanelButton = findComponentByCodeLazy(".GREEN,positionKeyStemOverride:");

const VOICE_STATE_UPDATE = 4;

const IS_MAC = navigator.platform.toLowerCase().includes("mac");
const SHORTCUT_LABEL = IS_MAC ? "⌘ + ⌥ + D" : "Ctrl + Alt + D";

const settings = definePluginSettings({
    showPanelButton: {
        type: OptionType.BOOLEAN,
        description: "Show a fake deafen button next to the mute / deafen buttons",
        default: true
    },
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
let restoreGatewayHooks: (() => void) | null = null;
const listeners = new Set<(enabled: boolean) => void>();

function useFakeDeafenEnabled() {
    const [state, setState] = useState(enabled);
    useEffect(() => {
        listeners.add(setState);
        return () => void listeners.delete(setState);
    }, []);
    return state;
}

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

// The desktop app talks to the gateway in binary ETF, not JSON, so the WebSocket hook
// alone never sees the voice state there. Hook Discord's gateway socket instead, before
// the payload gets encoded, which works whatever the encoding is.
function hookGatewaySocket() {
    const socket = GatewayConnectionStore?.getSocket?.();
    if (!socket) {
        console.warn("[FakeDeafen] Gateway socket not found, only the JSON fallback is active");
        return;
    }

    const restores: (() => void)[] = [];
    const hook = (name: string, wrap: (orig: Function) => Function) => {
        if (typeof socket[name] !== "function") return;
        const hadOwn = Object.prototype.hasOwnProperty.call(socket, name);
        const orig = socket[name];
        socket[name] = wrap(orig);
        restores.push(() => hadOwn ? socket[name] = orig : delete socket[name]);
    };

    hook("voiceStateUpdate", orig => function (this: any, args: any, ...rest: any[]) {
        if (enabled && args) {
            args = { ...args, selfDeaf: true };
            if (settings.store.fakeMute) args.selfMute = true;
        }
        return orig.call(this, args, ...rest);
    });

    hook("send", orig => function (this: any, op: number, d: any, ...rest: any[]) {
        if (enabled && op === VOICE_STATE_UPDATE && d) {
            d = { ...d, self_deaf: true };
            if (settings.store.fakeMute) d.self_mute = true;
        }
        return orig.call(this, op, d, ...rest);
    });

    console.log(`[FakeDeafen] Hooked gateway socket (${restores.length} methods)`);
    restoreGatewayHooks = () => restores.forEach(r => r());
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
    listeners.forEach(l => l(enabled));
    resendVoiceState();

    if (settings.store.showToasts) {
        showToast({
            text: enabled ? "Fake deafen enabled" : "Fake deafen disabled",
            variant: enabled ? "success" : "default"
        });
    }
}

function FakeDeafenIcon() {
    const on = useFakeDeafenEnabled();

    return (
        <svg width="20" height="20" viewBox="0 0 24 24">
            <path
                fill={on ? "var(--status-danger)" : "currentColor"}
                mask={on ? "url(#vc-fakeDeafen-mask)" : void 0}
                d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H5a7 7 0 0 1 14 0h-3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9Z"
            />
            {/* small "ghost" dot marks this as the fake deafen button */}
            <circle cx="12" cy="17" r="2" fill={on ? "var(--status-danger)" : "currentColor"} />
            {on && <>
                <path fill="var(--status-danger)" d="M22.7 2.7a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4Z" />
                <mask id="vc-fakeDeafen-mask">
                    <rect fill="white" x="0" y="0" width="24" height="24" />
                    <path fill="black" d="M23.27 4.73 19.27 .73 -.27 20.27 3.73 24.27Z" />
                </mask>
            </>}
        </svg>
    );
}

function FakeDeafenButton(props: { nameplate?: any; }) {
    const { showPanelButton } = settings.use(["showPanelButton"]);
    const on = useFakeDeafenEnabled();

    if (!showPanelButton) return null;

    return (
        <PanelButton
            tooltipText={on ? "Disable Fake Deafen" : "Enable Fake Deafen"}
            icon={FakeDeafenIcon}
            role="switch"
            ariaChecked={on}
            redGlow={on}
            plated={props?.nameplate != null}
            onClick={toggle}
        />
    );
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
    managedStyle,

    patches: [
        {
            // User panel (avatar + mute / deafen / settings) at the bottom left
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: {
                // Tolerates buttons other plugins (e.g. GameActivityToggle) already inserted here
                match: /children:\[(?=(?:\$self\.\w+\(arguments\[0\]\),)*.{0,25}?accountContainerRef)/,
                replace: "children:[$self.FakeDeafenButton(arguments[0]),"
            }
        }
    ],

    FakeDeafenButton: ErrorBoundary.wrap(FakeDeafenButton, { noop: true }),

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
        hookGatewaySocket();
        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, true);
        if (enabled) {
            enabled = false;
            listeners.forEach(l => l(false));
            resendVoiceState();
        }
        restoreGatewayHooks?.();
        restoreGatewayHooks = null;
        if (originalSend) {
            WebSocket.prototype.send = originalSend;
            originalSend = null;
        }
    }
});
