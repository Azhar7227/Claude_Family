# OneDrive Setup

This note records where my AgentOS workspace lives and why it lives there.
Read this first before creating or moving any AgentOS file.

## The OneDrive path I selected

All AgentOS files live in this OneDrive folder:

```
OneDrive - RealPage\AgentOS
```

On my machine the full path is:

```
C:\Users\amohammad\OneDrive - RealPage\AgentOS
```

This is the single home for AgentOS. Everything — start-here notes,
workflows, prompts, outputs — sits under this one folder.

## The one rule

**Every AgentOS file must stay inside `OneDrive - RealPage\AgentOS`.**

- Do not save AgentOS files to the Desktop, Downloads, `C:\Temp`, or any
  folder that is not synced by OneDrive.
- If a file shows up outside this folder, move it back in. Do not copy it —
  move it, so there is only one copy.
- New subfolders (for example `02_Prompts`, `04_Workflows`) go *inside*
  this folder, never beside it.

If it is not in this folder, it is not part of AgentOS.

## Why building in OneDrive matters at RealPage

RealPage work has to be **auditable, shareable, and reusable across teams.**
A normal folder on my laptop cannot do that. OneDrive can:

- **Auditable** — OneDrive keeps version history and tracks who changed
  what and when. If someone asks "where did this come from," the history
  is already there.
- **Shareable** — A OneDrive folder can be shared with a teammate or a
  whole team with a link, instead of emailing copies around.
- **Reusable** — Because the workspace is in one synced, shared place, other
  teams can pick up the same workflows and prompts instead of rebuilding
  them from scratch.
- **Backed up and safe** — Files sync to the cloud automatically. If my
  laptop dies or is replaced, the workspace is not lost.

A local-only folder gives none of this. That is the whole reason AgentOS
lives in OneDrive.

## Quick check: am I building in the right place?

Before I start working, confirm the folder is really in OneDrive and not a
local-only copy:

1. **Look at the path.** It must start with `OneDrive - RealPage`.
   If the path starts with something like `C:\Users\<me>\Desktop` or
   `C:\Temp`, stop — that is a local-only folder.
2. **Look at the sync icon.** In File Explorer the AgentOS folder and its
   files should show a OneDrive status icon — a green check (synced) or
   blue arrows (syncing). A file with **no** OneDrive icon is local only.
3. **Check it from the web.** Sign in to OneDrive in the browser. If I can
   see the `AgentOS` folder there, it is truly synced. If it is missing,
   the files never left my machine.

If any of these fail, I am building from a local-only folder. Move the work
into `OneDrive - RealPage\AgentOS` before continuing.
