# OMO-Agent Roadmap

## Completed ✅

- [x] Core agent loop with ChatGPT Codex API
- [x] Independent OAuth flow (`~/.omo/auth.json`)
- [x] Tools: read, write, edit, bash
- [x] CLI with `/login`, `/logout`, `/help`

---

## Planned Features

### 1. System Prompt / Identity
- [ ] Create `IDENTITY.md` for OMO's personality and instructions
- [ ] Load system prompt on startup
- [ ] Support for project-specific `.omo/identity.md`

### 2. More Tools
- [ ] `grep` - Search files with pattern matching
- [ ] `list` - List directory contents
- [ ] `web` - Web search integration
- [ ] `ask` - Ask user for input/confirmation

### 3. Better Error Handling
- [ ] Rate limit retries with exponential backoff
- [ ] Connection error recovery
- [ ] Friendly error messages

### 4. Conversation History
- [ ] Save chat sessions to `~/.omo/sessions/`
- [ ] `/history` command to list past sessions
- [ ] `/load <id>` to resume a session

### 5. Token Refresh on Error
- [ ] Auto-refresh on 401 responses
- [ ] Re-login prompt when refresh fails

### 6. Streaming Improvements
- [ ] Show thinking/reasoning content
- [ ] Display token usage
- [ ] Progress indicators for long operations

---

## Learning / Education

### Materials
- [ ] System Design School – <https://systemdesignschool.io>
- [ ] Roadmap.sh Projects – <https://roadmap.sh/projects>
- [ ] Book: *Computer Systems: A Programmer's Perspective*
- [ ] Book: *Designing Data-Intensive Applications*
- [ ] Product School: PMC material (to blog)
- [ ] Product School: AI PMC material (to blog)

### Publishing Plan
- [ ] Add all learning materials above to GitHub repo
- [ ] Publish all learning materials above to blog

### GitHub Repo Structure (proposed)
```
learning/
  system-design-school/
    notes/
    projects/
    summaries.md
  roadmap-sh/
    project-1/
    project-2/
  books/
    csapp/
      chapter-notes/
      exercises/
    ddia/
      chapter-notes/
      summaries.md
```

### Blog Structure (proposed)
- Categories:
  - System Design School
  - Roadmap.sh Projects
  - Book Notes (CSAPP, DDIA)
  - Product School PMC / AI PMC
- Post types:
  - Weekly Digest
  - Deep Dives
  - Project Write-ups

### Cadence (proposed)
- Mon/Wed/Fri: Notes + GitHub commits
- Saturday: Blog summary / publish 1 post
- Monthly: "What I learned this month"

