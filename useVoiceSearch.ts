import { findStoreLazy } from "@webpack";
import {
  GuildChannelStore,
  GuildMemberStore,
  GuildStore,
  PermissionsBits,
  PermissionStore,
  UserStore, // 🔥 ADDED: UserStore to fetch actual user data
  useMemo,
  useStateFromStores,
} from "@webpack/common";

import { matchCandidate } from "./fuzzySearch";
import { MatchRank, VoiceMemberResult } from "./types";

interface VoiceStateEntry {
  userId: string;
}

interface VoiceStateStoreShape {
  getVoiceStatesForChannel(
    channelId: string,
  ): Record<string, VoiceStateEntry> | undefined;
}

const VoiceStateStore = findStoreLazy(
  "VoiceStateStore",
) as VoiceStateStoreShape | null;

export interface VoiceSearchOptions {
  guildId: string;
  query: string;
  showOfflineUsers: boolean;
  includeStageChannels: boolean;
  includeAfkChannel: boolean;
  onlyShowInVoice: boolean;
  fuzzySearchEnabled: boolean;
}

interface VoiceChannelInfo {
  id: string;
  name: string;
  isStage: boolean;
  isAfk: boolean;
  isLocked: boolean;
  memberIds: string[];
}

function getVisibleVoiceChannels(
  guildId: string,
  includeStage: boolean,
  includeAfk: boolean,
): VoiceChannelInfo[] {
  const guild = GuildStore.getGuild(guildId);
  if (!guild) return [];

  const guildChannels: any = GuildChannelStore.getChannels(guildId) ?? {};
  const vocalChannels = guildChannels.VOCAL ?? [];

  const result: VoiceChannelInfo[] = [];

  for (const { channel } of vocalChannels) {
    if (!channel) continue;

    if (!PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel)) continue;

    const isStage = channel.type === 13;
    if (isStage && !includeStage) continue;

    const isAfk = guild.afkChannelId === channel.id;
    if (isAfk && !includeAfk) continue;

    const states = VoiceStateStore?.getVoiceStatesForChannel(channel.id) ?? {};

    const memberIds = Object.keys(states);
    if (!memberIds.length) continue;

    const isLocked = !PermissionStore.can(PermissionsBits.CONNECT, channel);

    result.push({
      id: channel.id,
      name: channel.name,
      isStage,
      isAfk,
      isLocked,
      memberIds,
    });
  }

  return result;
}

/**
 * 🔥 FIXED NAME RESOLUTION
 * Using UserStore directly ensures we get the globalName and username.
 */
function resolveDisplayName(guildId: string, userId: string) {
  const gm = GuildMemberStore.getMember(guildId, userId);
  const user = UserStore.getUser(userId);

  // BEST POSSIBLE ORDER (Discord-safe)
  return (
    GuildMemberStore.getDisplayName?.(guildId, userId) ||
    GuildMemberStore.getNick?.(guildId, userId) ||
    gm?.nick ||
    user?.globalName ||
    user?.username ||
    `User-${userId.slice(0, 5)}`
  );
}

export function useVoiceSearch(
  options: VoiceSearchOptions,
): VoiceMemberResult[] {
  const {
    guildId,
    query,
    showOfflineUsers,
    includeStageChannels,
    includeAfkChannel,
    onlyShowInVoice,
    fuzzySearchEnabled,
  } = options;

  const voiceChannels = useStateFromStores(
    [VoiceStateStore, GuildChannelStore, GuildStore, PermissionStore],
    () =>
      getVisibleVoiceChannels(guildId, includeStageChannels, includeAfkChannel),
    [guildId, includeStageChannels, includeAfkChannel],
  );

  const memberIds = useStateFromStores(
    [GuildMemberStore],
    () => GuildMemberStore.getMemberIds(guildId) ?? [],
    [guildId],
  );

  return useMemo(() => {
    const userToChannel = new Map<string, VoiceChannelInfo>();

    for (const channel of voiceChannels) {
      for (const userId of channel.memberIds) {
        userToChannel.set(userId, channel);
      }
    }

    const results: VoiceMemberResult[] = [];

    const idsToConsider = onlyShowInVoice
      ? Array.from(userToChannel.keys())
      : showOfflineUsers
        ? memberIds
        : memberIds.filter((id) => userToChannel.has(id));

    for (const userId of idsToConsider) {
      const member = GuildMemberStore.getMember(guildId, userId);
      const user = UserStore.getUser(userId);

      // If we don't have user or member data, skip to avoid empty rows
      if (!user && !member) continue;

      // 🔥 FIXED: Pull from 'user' directly, not 'member.user'
      const username = user?.username || "unknown";
      const globalName = user?.globalName || null;
      const nick = member?.nick || null;

      const displayName = resolveDisplayName(guildId, userId);

      const channel = userToChannel.get(userId) ?? null;
      const inVoice = !!channel;

      const match = matchCandidate(
        query,
        { username, nick, globalName },
        fuzzySearchEnabled,
      );

      if (!match) continue;

      // 🔥 FIXED: Pull avatar directly from the user object
      const avatarUrl = user?.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.webp?size=64`
        : "";

      results.push({
        userId,
        username,
        globalName,
        nick,
        displayName,

        avatarUrl,

        inVoice,
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
        channelUserCount: channel?.memberIds.length ?? 0,

        isStage: channel?.isStage ?? false,
        isAfk: channel?.isAfk ?? false,
        isLocked: channel?.isLocked ?? false,

        matchRank: inVoice ? match.rank : MatchRank.NotInVoice,
        matchScore: match.score,
      });
    }

    results.sort((a, b) => {
      if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      return a.displayName.localeCompare(b.displayName);
    });

    return results;
  }, [
    voiceChannels,
    memberIds,
    guildId,
    query,
    showOfflineUsers,
    onlyShowInVoice,
    fuzzySearchEnabled,
  ]);
}
