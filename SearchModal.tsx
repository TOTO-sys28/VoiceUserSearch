/*
 * Voice User Search — SearchModal.tsx
 *
 * The Quick-Switcher-style modal: search box, live filtered results,
 * per-row Join/Open buttons, and full keyboard navigation.
 */

import { classNameFactory } from "@api/Styles";
import { ModalContent, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { findByPropsLazy } from "@webpack";
import {
    NavigationRouter,
    React,
    Text,
    Toasts,
    Tooltip,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "@webpack/common";

import { useDebouncedValue } from "./useDebouncedValue";
import { useVoiceSearch } from "./useVoiceSearch";
import { settings } from "./index";
import { VoiceMemberResult } from "./types";

const cl = classNameFactory("vc-voice-user-search-");

// selectVoiceChannel isn't part of the stable @webpack/common surface, so we
// resolve it lazily — this exact prop pair is confirmed working in Vencord's
// real-world FollowUser plugin.
const VoiceActions = findByPropsLazy("selectVoiceChannel", "disconnect");

interface Props extends ModalProps {
    guildId: string;
}

function statusDotClass(result: VoiceMemberResult): string {
    if (!result.inVoice) return cl("dot-offline");
    if (result.isLocked) return cl("dot-locked");
    return cl("dot-online");
}

function ResultRow({
    result,
    active,
    onHover,
    onJoin,
    onOpen,
}: {
    result: VoiceMemberResult;
    active: boolean;
    onHover: () => void;
    onJoin: () => void;
    onOpen: () => void;
}) {
    return (
        <div
            className={cl("row") + (active ? " " + cl("row-active") : "")}
            onMouseEnter={onHover}
            onClick={onJoin}
        >
            <div className={cl("avatar-wrap")}>
                {settings.store.showAvatars && result.avatarUrl && (
                    <img className={cl("avatar")} src={result.avatarUrl} alt="" />
                )}
                <span className={statusDotClass(result)} />
            </div>

            <div className={cl("info")}>
                <Text variant="text-sm/semibold" className={cl("display-name")}>
                    {result.displayName}
                </Text>
                <Text variant="text-xs/normal" className={cl("username")}>
                    @{result.username}
                </Text>
            </div>

            <div className={cl("channel-info")}>
                {result.inVoice ? (
                    <>
                        <Text variant="text-sm/normal" className={cl("channel-name")}>
                            {result.isStage ? "🎙️ " : "🔊 "}
                            {result.channelName}
                            {result.isAfk ? " (AFK)" : ""}
                        </Text>
                        {settings.store.showChannelMemberCount && (
                            <Text variant="text-xs/normal" className={cl("channel-count")}>
                                {result.channelUserCount} member{result.channelUserCount === 1 ? "" : "s"}
                            </Text>
                        )}
                    </>
                ) : (
                    <Text variant="text-sm/normal" className={cl("not-in-voice")}>
                        Not in voice
                    </Text>
                )}
            </div>

            {result.inVoice && (
                <div className={cl("actions")}>
                    <Tooltip text={result.isLocked ? "You can't join this channel" : "Join voice channel"}>
                        {tooltipProps => (
                            <button
                                {...tooltipProps}
                                className={cl("btn-join")}
                                disabled={result.isLocked}
                                onClick={e => {
                                    e.stopPropagation();
                                    onJoin();
                                }}
                            >
                                Join
                            </button>
                        )}
                    </Tooltip>
                    <Tooltip text="Open channel without joining">
                        {tooltipProps => (
                            <button
                                {...tooltipProps}
                                className={cl("btn-open")}
                                onClick={e => {
                                    e.stopPropagation();
                                    onOpen();
                                }}
                            >
                                Open
                            </button>
                        )}
                    </Tooltip>
                </div>
            )}
        </div>
    );
}

export function VoiceSearchModal({ guildId, ...modalProps }: Props) {
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [onlyShowInVoice, setOnlyShowInVoice] = useState(true);
    const [showOfflineUsers, setShowOfflineUsers] = useState(settings.store.showOfflineUsers);
    const [includeStageChannels, setIncludeStageChannels] = useState(true);
    const [includeAfkChannel, setIncludeAfkChannel] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const debouncedQuery = useDebouncedValue(query, settings.store.searchDelay);

    const results = useVoiceSearch({
        guildId,
        query: debouncedQuery,
        showOfflineUsers,
        includeStageChannels,
        includeAfkChannel,
        onlyShowInVoice,
        fuzzySearchEnabled: settings.store.enableFuzzySearch,
    });

    useEffect(() => {
        setActiveIndex(0);
    }, [results.length, debouncedQuery]);

    useEffect(() => {
        // Deliberately deferred: focusing synchronously while the shortcut's
        // modifier keys (Ctrl/Shift) are still being physically released can
        // cause Electron to miss the key-up event for them once focus jumps
        // to this new input. That leaves Shift "stuck" from the browser's
        // perspective, so the next normal typing in Discord's chat box
        // behaves like Shift+typing (selecting/highlighting text) instead of
        // typing normally. Deferring one tick lets the key-up land first.
        const handle = setTimeout(() => inputRef.current?.focus(), 0);
        return () => clearTimeout(handle);
    }, []);

    const joinChannel = useCallback(
        (result: VoiceMemberResult) => {
            if (!result.channelId) return;
            if (result.isLocked) {
                Toasts.show({
                    message: `You don't have permission to join ${result.channelName}.`,
                    id: Toasts.genId(),
                    type: Toasts.Type.FAILURE,
                });
                return;
            }
            try {
                VoiceActions.selectVoiceChannel(result.channelId);
                modalProps.onClose();
            } catch {
                Toasts.show({
                    message: `Couldn't join ${result.channelName}. It may no longer exist.`,
                    id: Toasts.genId(),
                    type: Toasts.Type.FAILURE,
                });
            }
        },
        [modalProps],
    );

    const openChannel = useCallback(
        (result: VoiceMemberResult) => {
            if (!result.channelId) return;
            NavigationRouter.transitionTo(`/channels/${guildId}/${result.channelId}`);
            modalProps.onClose();
        },
        [guildId, modalProps],
    );

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                const result = results[activeIndex];
                if (!result || !result.inVoice) return;
                if (settings.store.autoJoinOnEnter) joinChannel(result);
                else openChannel(result);
            } else if (e.key === "Escape") {
                modalProps.onClose();
            }
        },
        [results, activeIndex, joinChannel, openChannel, modalProps],
    );

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={cl("modal")}>
            <ModalContent className={cl("content")}>
                <div className={cl("header")}>
                    <input
                        ref={inputRef}
                        className={cl("search-input")}
                        placeholder="Search members currently in voice…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                    />
                </div>

                <div className={cl("filters")}>
                    <label className={cl("filter-toggle")}>
                        <input
                            type="checkbox"
                            checked={onlyShowInVoice}
                            onChange={e => setOnlyShowInVoice(e.target.checked)}
                        />
                        In voice only
                    </label>
                    <label className={cl("filter-toggle")}>
                        <input
                            type="checkbox"
                            checked={showOfflineUsers}
                            onChange={e => setShowOfflineUsers(e.target.checked)}
                            disabled={onlyShowInVoice}
                        />
                        Show offline users
                    </label>
                    <label className={cl("filter-toggle")}>
                        <input
                            type="checkbox"
                            checked={includeStageChannels}
                            onChange={e => setIncludeStageChannels(e.target.checked)}
                        />
                        Include stages
                    </label>
                    <label className={cl("filter-toggle")}>
                        <input
                            type="checkbox"
                            checked={includeAfkChannel}
                            onChange={e => setIncludeAfkChannel(e.target.checked)}
                        />
                        Include AFK channel
                    </label>
                </div>

                <div className={cl("results")}>
                    {results.length === 0 && (
                        <Text variant="text-sm/normal" className={cl("empty-state")}>
                            No members found.
                        </Text>
                    )}
                    {results.map((result, i) => (
                        <ResultRow
                            key={result.userId}
                            result={result}
                            active={i === activeIndex}
                            onHover={() => setActiveIndex(i)}
                            onJoin={() => joinChannel(result)}
                            onOpen={() => openChannel(result)}
                        />
                    ))}
                </div>

                <div className={cl("footer-hints")}>
                    <span>↑↓ Navigate</span>
                    <span>Enter {settings.store.autoJoinOnEnter ? "Join" : "Open"}</span>
                    <span>Esc Close</span>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}
