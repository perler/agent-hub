# Agent Hub: cheat sheet

Formerly "Claude Code Helper": settings are now `agentHub.*`, and an unset one falls back to its old `claudeHelper.*` value.

## 1. Queue buttons (New Task view)

| Button | Queue |
|---|---|
| 📅 Today | your tasks due today or overdue |
| ⏳ Input | tasks waiting on your input |
| 📥 Both | the two above as one queue |
| 📁 project | one project, walked in a single inbox-zero session |
| ✉️ Mail | your inbox: one mail, or several at a time |

A queue button opens a checklist; tasks a live session is already working are left out. ▶ on a row opens that task now, in its own session and tab; ↗ opens it in Asana; ✓ marks it done (the notification offers Undo). Tick tasks, then Enter (or 💬 in the title bar) walks them in one inbox-zero session — nothing ticked walks the whole queue.

✉️ Mail works the other way round: click a row (or Enter) to open that mail now, ☐ on the right ticks it, ↗ opens it in Gmail, and 💬 works the ticked mails in one triage session. One ticked is routed like a single mail; nothing ticked triages the whole inbox.

⚡ Quick Session (title bar, beside refresh and help) starts a session straight away in a new ~/tasks/YYYY-MM-DD-HHMM folder: no prompt, no routing, for a question that belongs to no client or project. The folder takes the session's title once it ends.

☁ Upload (title bar, beside ⚡) opens a small panel: click Choose files… or drop files anywhere on it, and they are saved to ~/transfer/YYYY-MM-DD (today's folder, the one #today points to). A name that already exists gets -2, -3 instead of being overwritten; the finished card says so per file and offers Copy paths, Upload more and Done.

Sessions started in the Claude app always open in ~; when the router sent one to a project, its row shows that folder name before the age, the tooltip says "Routed from the Claude app to <folder>", and the filter matches the folder. Resume still runs in the real start folder.

Sessions, right-click a row: Pin Session (keeps it in a Pinned group at the top, past the age and row limits, until you Unpin it), Resume and Compact (only on sessions that are not running: resumes it and runs `/compact`, to keep working on the same job with room again) and Start Session (a fresh session in that row's folder, for a clean context; the old session is left alone). Favourites and Sessions share one layout: on hover ▶ new session, ↻ resume, 📂 reveal the folder; right-click has the same Run and Folder groups (terminal, reveal, copy folder path), then the session or favourite specifics.

Rooms (guest sessions): a **Rooms** group in Sessions (at the top while an active room had a chat message in the last 24 hours, otherwise at the bottom) lists every room on the rooms server with one icon (a speech bubble with three dots, green while active like a live session, grey when ended); ended rooms are in a collapsed **Ended** sub-group. The row shows the topic, then room id, the first guest (with `+N` when there are more, "no guests yet" when none) and spend/cap; the tooltip adds model, status and created time. Click a row to open the guest page in the external browser (Cloudflare Access login refuses to render inside the Simple Browser). ▶ or right-click **Work in Room** starts a local session in the rooms folder named after the room id, with a prompt pointing at its meta.json, transcript.md and Drive folder and telling it to create and edit the room's files only with the `rooms` CLI (acts as info@erler-edv-beratung.de, not perler@gmail.com); the next click resumes that same session. Right-click also has Copy Room ID, Copy Guest Link and Open Drive Folder. The list follows the rooms' meta.json files; a room removed in the rooms UI (`hidden: true`) is not listed.

## 2. Tab badges

`*` working, `?` asking, `!` finished and not looked at yet.

## 3. Unlocking a task session

A session that works an Asana task cannot change remote systems while the task carries the `readonly` tag. Instead of removing the tag in Asana, type into the session:

| You type | What happens |
|---|---|
| `unlock` | removes `readonly`, opens the lock, counts as your go-ahead |
| `unlock, deploy it` | the same; everything after the word is your instruction |
| `unlock carefully` | also removes `⚠️ read carefully`; plain `unlock` leaves such a task locked |

`unlock` must be the first word of the message. Removing the tag in Asana still works and takes up to a minute.

A task born from an email also locks credential files. That lock lifts by itself while you are attached; if it does not, run `bridge-unlock <task folder>` in a terminal.

## 5. Tab right-click menu

Open Asana Task, Reveal Session Folder.
