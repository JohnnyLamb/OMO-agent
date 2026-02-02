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



Omo: A few setup wins we can do next, sir:

- Capture current projects/goals in USER.md context
- Add any tool details (paths, API keys, repos) to TOOLS.md if you keep one
- Set a heartbeat checklist in HEARTBEAT.md (email/calendar checks, etc.)