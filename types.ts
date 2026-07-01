/*
 * Voice User Search — types.ts
 * Shared type definitions.
 */

export interface VoiceMemberResult {
    userId: string;
    username: string;
    globalName: string | null;
    nick: string | null;
    displayName: string; // resolved: nick ?? globalName ?? username
    avatarUrl: string;
    inVoice: boolean;
    channelId: string | null;
    channelName: string | null;
    channelUserCount: number;
    isStage: boolean;
    isAfk: boolean;
    isLocked: boolean; // connected but current user lacks VIEW_CHANNEL/CONNECT
    matchRank: MatchRank;
    matchScore: number; // higher = better, used as tiebreaker within a rank
}

// Lower numeric value = higher priority, matches the spec's sort order.
export enum MatchRank {
    ExactName = 0,
    NicknameMatch = 1,
    PartialMatch = 2,
    FuzzyMatch = 3,
    NotInVoice = 4,
}

export interface VoiceChannelSummary {
    id: string;
    name: string;
    isStage: boolean;
    isAfk: boolean;
    memberCount: number;
    viewable: boolean;
    connectable: boolean;
}
