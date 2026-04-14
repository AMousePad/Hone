# Multi-User and Privacy

A short page on what's private to you and what isn't, plus the debug-log story for bug reports. Implementation detail (how isolation is enforced in code) lives in [[Architecture]].

## Your data is yours

Each user's Hone setup is independent:

- Settings.
- Custom presets.
- Model profiles.
- Refinements / chat data.
- Per-chat refinement stats.
- Debug log buffer.

Other users on the same Lumiverse instance can't see any of this. The Lumiverse operator (the person hosting your instance) has filesystem access to your user storage, so technically they could read the JSON files on disk, but that's the same threat model as the rest of your Lumiverse data. If you don't trust your operator, don't use their instance.

## Debug logging

Hone has an opt-in per-user debug log buffer for diagnosing problems. Off by default.

Enable it under Lumiverse -> Settings -> Extensions -> Hone -> Debug Logging. While it's on, Hone records detailed traces of what the backend is doing on your behalf.

Logging is:

- Per-user. Nobody else on the instance sees it, even the Lumiverse operator.
- In-memory only. Lost when the extension reloads or when you turn debug logging off.
- Capped at 2000 entries by default (configurable 100–20000 in the same settings panel). When full, the oldest entries are dropped.

### What gets captured

For each refinement, the buffer records what stage ran, what model and connection were used, how many tokens of context, what got returned, how long it took, and so on. Enough information to diagnose "why did this refinement produce this output", or atleast reproduction steps.

### Exporting for a bug report

When you hit a bug:

1. Settings -> Extensions -> Hone -> Debug Logging -> on.
2. Reproduce the bug.
3. Click Copy Debug Logs. The buffer is formatted with timestamps and copied to your clipboard.
4. Paste into a [GitHub issue](https://github.com/AMousePad/Hone/issues) or DM `amousepad` on Discord.

`⚠` You should redact sensitive content from the paste before sending. Most bugs can be diagnosed from the structural information alone (lengths, message counts, stage counts, timing), without anyone needing to see your actual prompt content.

When you're done, turn Debug Logging off. The buffer clears.

## Per-user extension installation

Lumiverse's extension model is operator-scoped. One install of Hone, all users on the instance use that version. You can't have user A on Hone 1.0.219 while user B is on 1.0.220.

But each user's *configuration* is independent. Different presets, different model profiles, different settings, different stats. Functionally, Hone feels per-user even though there's one shared install.

When there is Lumiverse support for user-scoped extensions, Hone may change to user-scoped.

## Next

- [[Settings Reference#debug-logging-section]]. The exact UI for debug logging.
- [[Troubleshooting]]. When to enable debug logging.
