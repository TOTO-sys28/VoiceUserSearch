/*
 * Vencord / Vesktop plugin — Voice User Search
 *
 * Instantly search for members currently connected to voice channels in the
 * active server, without manually browsing every channel.
 *
 * Install by placing this folder at:
 *   src/userplugins/voiceUserSearch/
 * inside your Vencord (or Vesktop) source checkout, then rebuild.
 */

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { closeModal, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, SelectedGuildStore } from "@webpack/common";

import { VoiceSearchModal } from "./SearchModal";
import "./styles.css";

// A short, readable representation of the configured shortcut, e.g. "ctrl+shift+f".
function parseShortcut(raw: string) {
    const parts = raw.toLowerCase().split("+").map(p => p.trim());
    return {
        ctrl: parts.includes("ctrl") || parts.includes("control"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        key: parts.find(p => !["ctrl", "control", "shift", "alt"].includes(p)) ?? "",
    };
}

export const settings = definePluginSettings({
    shortcut: {
        type: OptionType.STRING,
        description: "Keyboard shortcut to open the search modal (e.g. ctrl+shift+f)",
        default: "ctrl+shift+f",
    },
    autoJoinOnEnter: {
        type: OptionType.BOOLEAN,
        description: "Auto-join the selected user's voice channel when pressing Enter (otherwise just opens it)",
        default: true,
    },
    showOfflineUsers: {
        type: OptionType.BOOLEAN,
        description: "Include members not currently in voice in search results by default",
        default: false,
    },
    showAvatars: {
        type: OptionType.BOOLEAN,
        description: "Show user avatars in the results list",
        default: true,
    },
    showChannelMemberCount: {
        type: OptionType.BOOLEAN,
        description: "Show how many members are in each voice channel",
        default: true,
    },
    enableFuzzySearch: {
        type: OptionType.BOOLEAN,
        description: "Enable fuzzy matching (e.g. 'ali' matches 'AliDev') in addition to exact/partial matches",
        default: true,
    },
    searchDelay: {
        type: OptionType.SLIDER,
        description: "Debounce delay for search input (ms)",
        default: 100,
        markers: [0, 50, 100, 150, 200, 300],
        stickToMarkers: false,
    },
    modalWidth: {
        type: OptionType.SLIDER,
        description: "Search modal width (px)",
        default: 520,
        markers: [400, 460, 520, 600, 680],
        stickToMarkers: false,
    },
});

let keydownListener: ((e: KeyboardEvent) => void) | null = null;

// Tracks the currently-open modal's key (from openModal's return value), not
// just a boolean. A plain boolean flag can get stuck `true` if some close
// path (backdrop click, Discord's own global Escape handling, etc.) doesn't
// route back through our onClose callback — after that, the shortcut would
// silently no-op forever. Tracking the actual key lets us recover: if the
// shortcut fires while we still have a key on record, we force-close that
// modal via closeModal() instead of doing nothing.
let openModalKey: string | null = null;

export function openVoiceSearchModal() {
    const guildId = SelectedGuildStore.getGuildId();
    if (!guildId) return; // e.g. in DMs — there's no server voice list to search.

    if (openModalKey) {
        // Toggle behavior: pressing the shortcut again forcibly closes
        // whatever we last opened, even if it was already visually closed
        // and we just failed to hear about it. This guarantees the
        // shortcut always does *something* instead of silently failing.
        closeModal(openModalKey);
        openModalKey = null;
        return;
    }

    document.documentElement.style.setProperty(
        "--vc-voice-user-search-modal-width",
        `${settings.store.modalWidth}px`,
    );

    openModalKey = openModal(props => (
        <VoiceSearchModal
            {...props}
            guildId={guildId}
            onClose={() => {
                openModalKey = null;
                props.onClose();
            }}
        />
    ));
}

const guildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (!guild) return;
    const group = findGroupChildrenByChildId("privacy", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="vc-voice-user-search-open"
            label="Search Voice Members"
            action={openVoiceSearchModal}
        />,
    );
};

export default definePlugin({
    name: "VoiceUserSearch",
    description: "Instantly search for members currently connected to voice channels in the selected server.",
    authors: [Devs.Ven], // placeholder — replace with your own Devs entry
    settings,

    start() {
        keydownListener = (e: KeyboardEvent) => {
            const combo = parseShortcut(settings.store.shortcut);
            if (!combo.key) return;

            const key = e.key.toLowerCase();
            if (
                key === combo.key &&
                e.ctrlKey === combo.ctrl &&
                e.shiftKey === combo.shift &&
                e.altKey === combo.alt
            ) {
                e.preventDefault();
                // Stops any other keydown listener on the same element
                // (including Discord's own built-in keybind handling) from
                // also processing this event. preventDefault() alone only
                // cancels the browser's native default action — it does NOT
                // stop other JS listeners, so without this a same-key
                // Discord shortcut could still fire alongside ours.
                e.stopImmediatePropagation();
                // Deferred by a tick so the OS/Electron finishes processing
                // the key-up for Ctrl/Shift before we steal focus into the
                // modal — opening synchronously inside the same keydown
                // dispatch is what caused Shift to appear "stuck" afterward.
                setTimeout(openVoiceSearchModal, 0);
            }
        };
        // Capture phase so we see the event before Discord's own listeners
        // (which are typically bubble-phase) get a chance to act on it.
        document.addEventListener("keydown", keydownListener, true);

        addContextMenuPatch("guild-context", guildContextMenuPatch);
        addContextMenuPatch("guild-header-popout", guildContextMenuPatch);
    },

    stop() {
        if (keydownListener) {
            document.removeEventListener("keydown", keydownListener, true);
            keydownListener = null;
        }
        openModalKey = null;
        removeContextMenuPatch("guild-context", guildContextMenuPatch);
        removeContextMenuPatch("guild-header-popout", guildContextMenuPatch);
    },

    commands: [
        {
            name: "voicesearch",
            description: "Open the Voice User Search modal for the current server",
            // Pure UI side effect — deliberately doesn't send a chat message.
            execute: () => {
                openVoiceSearchModal();
            },
        },
    ],
});
