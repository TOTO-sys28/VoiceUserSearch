# Voice User Search

A Vencord  plugin that lets you instantly search for members currently
connected to voice channels in the selected server — no more clicking through
every channel by hand.





## Demo



<img width="1349" height="774" alt="image" src="https://github.com/user-attachments/assets/56e9b215-f139-4b31-a10d-254bcaaca811" />

## Features

- Open a Quick-Switcher-style modal with `Ctrl+Shift+F` (configurable), the
  server context menu, or `/voicesearch`.
- Instant, case-insensitive, fuzzy search across username, nickname, and
  display name.
- Live updates on join/leave/switch/nickname-change — no manual refresh,
  no polling.
- Green/gray/red status dots, per-channel member counts, and one-click
  **Join** / **Open** buttons.
- Full keyboard navigation (`↑`/`↓`/`Enter`/`Esc`).
- Filters for offline users, stage channels, and the AFK channel.
- Respects Discord permissions — never reveals channels you can't see.

## Installation

1. Clone the Vencord  source if you haven't already:
   ```bash
   git clone https://github.com/Vendicated/Vencord
   cd Vencord
   ```

2. Clone repo:
   ```bash
   git clone https://github.com/TOTO-sys28/VoiceUserSearch
   ```
3. Copy this folder into `src/userplugins/`:
   ```bash
   cp -r VoiceUserSearch /src/plugins/VoiceUserSearch/
   ```
4. Build and inject as usual:
   ```bash
   pnpm install
   pnpm build
   pnpm inject
   ```
5. Restart Discord, then enable **Voice User Search** in
   Settings → Plugins.

## Files

| File                    | Purpose                                            |
| ------------------------| --------------------------------------------------- |
| `index.tsx`             | Plugin definition, settings, shortcut, commands     |
| `SearchModal.tsx`       | Modal UI + keyboard navigation                      |
| `useVoiceSearch.ts`     | Reactive Flux-store data layer (no polling)         |
| `fuzzySearch.ts`        | Matching/ranking logic (exact > nick > partial > fuzzy) |
| `useDebouncedValue.ts`  | Search-input debounce hook                          |
| `types.ts`              | Shared TypeScript types                             |
| `styles.css`            | Theme-aware styling using Discord's CSS variables   |

## Notes on Discord internals used

This plugin relies on Vencord's `@webpack/common` re-exports for
`GuildChannelStore`, `GuildMemberStore`, `GuildStore`, and `PermissionStore`,
plus two things resolved manually via `findStoreLazy`/`findByPropsLazy`
because they are **not** part of the stable `@webpack/common` surface:
`VoiceStateStore` (voice connection data) and the `selectVoiceChannel` voice
action. Because these are internal, unversioned Discord webpack modules, a
Discord client update can occasionally change their shape — if the plugin
stops working after a Discord update, check for a Vencord update first,
since these lookups are the most likely thing to need adjusting.

**Known limitation:** Discord's client only keeps a full `GuildMemberStore`
member list loaded for guilds it has reason to fully fetch; in very large
guilds (tens/hundreds of thousands of members) `GuildMemberStore.getMemberIds`
only returns a partial list unless more has been explicitly requested. This
doesn't affect the default "in voice only" mode (voice-connected users are
always available via `VoiceStateStore` regardless of guild size), but the
"show offline users" toggle will be incomplete on huge guilds — that's a
constraint of Discord's client itself, not something a plugin can fully work
around.

Before publishing, update the `authors` field in `index.tsx` from the
placeholder `Devs.Ven` to your own entry in Vencord's `Devs` constants.

## Changelog

- **v1.2** — Fixed keystrokes leaking into Discord's chat as text
  selection/highlighting after using the modal a second time. Root cause:
  opening the modal and autofocusing its search input happened synchronously
  inside the same keydown dispatch as the `Ctrl+Shift+F` shortcut, which can
  cause Electron to miss the key-up event for Shift/Ctrl once focus jumps
  away mid-release — leaving Shift "stuck" from the browser's perspective.
  Fixed by deferring both the modal open and the input autofocus by one
  tick (`setTimeout(..., 0)`), and removing the redundant `autoFocus`
  attribute that was racing with the manual focus call.

- **v1.1** — Fixed a hard client crash on opening the search modal.
  `VoiceStateStore` was being imported from `@webpack/common`, where it
  doesn't actually exist, so it was `undefined` and the first call into it
  threw an uncaught error during render. Fixed by resolving it via
  `findStoreLazy("VoiceStateStore")` and switching the data-gathering logic
  to enumerate the guild's voice channels via `GuildChannelStore` and query
  each one with `VoiceStateStore.getVoiceStatesForChannel()`, matching the
  pattern used by several real, published Vencord plugins.
