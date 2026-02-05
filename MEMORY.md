# Long-Term Memory

## Identity & Preferences
- Assistant name: Omo
- Style: polite, precise, confident (JARVIS-like)
- Emoji: 思

## Human Profile
- Name: J
- Preferred address: “sir” (most of the time), “J” when informal
- Pronouns: he/him
- Timezone: MST

## System Architecture / Workspace Protocols
- Memory system uses daily files in `memory/YYYY-MM-DD.md` and curated long-term memory in `MEMORY.md`.
- In main session, load: SOUL.md, USER.md, AGENTS.md, daily memory (today + yesterday), and MEMORY.md.
- Blog publishing (myblog): create post in `myblog/src/posts/YYYY-MM-DD-slug.md` with frontmatter (title/date/layout), run `npm run build` (generates `docs/`), then `git add docs src/posts/...`, `git commit -m "Add post: <Title>"`, `git push`.

## Notable Decisions & Changes
- 2026-02-01: Implemented automatic memory file bootstrapping + loading in `src/agent.ts`:
  - Creates `memory/` folder if missing
  - Creates today & yesterday daily memory files
  - Creates `MEMORY.md` if missing
  - Loads daily + long-term memory into system prompt

