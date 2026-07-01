/*
 * Voice User Search — fuzzySearch.ts
 *
 * Lightweight, dependency-free fuzzy matcher + ranking so we don't need to
 * pull in an external fuzzy-search package for a single-purpose plugin.
 */

import { MatchRank } from "./types";

export interface CandidateName {
    username: string;
    nick: string | null;
    globalName: string | null;
}

export interface MatchResult {
    rank: MatchRank;
    score: number;
}

function normalize(s: string): string {
    return s.toLowerCase().normalize("NFKD");
}

/**
 * Subsequence fuzzy match (like VSCode's Quick Open / Discord's Quick Switcher).
 * Returns a score (higher is better) or null if the query isn't a subsequence
 * of the target at all.
 */
function fuzzyScore(query: string, target: string): number | null {
    if (query.length === 0) return 0;

    let qi = 0;
    let score = 0;
    let consecutiveBonus = 0;

    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
        if (target[ti] === query[qi]) {
            // Reward consecutive matches and matches near the start.
            score += 10 + consecutiveBonus - Math.min(ti, 20) * 0.1;
            consecutiveBonus = Math.min(consecutiveBonus + 5, 25);
            qi++;
        } else {
            consecutiveBonus = 0;
        }
    }

    return qi === query.length ? score : null;
}

/**
 * Determine the best match rank + score for a single candidate against the
 * query, checking username / nickname / display name per the spec's
 * priority order: exact > nickname > partial > fuzzy.
 */
export function matchCandidate(query: string, candidate: CandidateName, fuzzyEnabled: boolean): MatchResult | null {
    const q = normalize(query.trim());
    if (q.length === 0) {
        return { rank: MatchRank.PartialMatch, score: 0 };
    }

    const uname = normalize(candidate.username);
    const nick = candidate.nick ? normalize(candidate.nick) : null;
    const gname = candidate.globalName ? normalize(candidate.globalName) : null;

    // 1. Exact match (any field equals the query exactly)
    if (uname === q || nick === q || gname === q) {
        return { rank: MatchRank.ExactName, score: 1000 };
    }

    // 2. Nickname match (query is a prefix/substring of the server nickname)
    if (nick && nick.includes(q)) {
        const score = nick.startsWith(q) ? 500 : 300;
        return { rank: MatchRank.NicknameMatch, score };
    }

    // 3. Partial match (substring in username or global/display name)
    const partialFields = [uname, gname].filter(Boolean) as string[];
    for (const field of partialFields) {
        if (field.includes(q)) {
            const score = field.startsWith(q) ? 200 : 100;
            return { rank: MatchRank.PartialMatch, score };
        }
    }

    // 4. Fuzzy match across all fields, best score wins
    if (fuzzyEnabled) {
        const allFields = [uname, nick, gname].filter(Boolean) as string[];
        let best: number | null = null;
        for (const field of allFields) {
            const s = fuzzyScore(q, field);
            if (s !== null && (best === null || s > best)) best = s;
        }
        if (best !== null) {
            return { rank: MatchRank.FuzzyMatch, score: best };
        }
    }

    return null;
}
