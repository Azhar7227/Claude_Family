# Tool Setup

This note records the AI tool I use to build and run AgentOS, and how it
connects to the OneDrive workspace.

## The AI tool I am using

**Claude (claude.ai)** — Anthropic's Claude web/desktop app.

This is the assistant I use to draft prompts, run workflows, and produce
outputs for AgentOS.

## How the tool and the workspace fit together

- The **thinking** happens in Claude (claude.ai).
- The **files** live in OneDrive at `OneDrive - RealPage, Inc.\AgentOS`.
- Anything worth keeping — a prompt, a workflow, an output — gets saved
  back into that OneDrive folder. Nothing important stays only in a chat.

A chat window is not storage. If I want to find it, share it, or reuse it
later, it has to be a file in the AgentOS folder.

## The one rule (same as OneDrive_Setup.md)

**Every AgentOS file must stay inside `OneDrive - RealPage, Inc.\AgentOS`.**

When I copy something out of Claude — a prompt, a result, a checklist —
I save it straight into that folder (or a subfolder inside it). I do not
drop it on the Desktop or in Downloads "for now."

## Why this matters at RealPage

RealPage work needs to be **auditable, shareable, and reusable across
teams.** Keeping the saved files in OneDrive is what makes that real:

- The tool can generate, but only saved files can be audited later.
- A teammate can open a shared file; they cannot open my chat history.
- Other teams can reuse a saved prompt or workflow; they cannot reuse a
  conversation that lives only in my account.

## Quick check before I start working

1. **Right tool:** I am working in Claude (claude.ai), signed in with my
   RealPage account.
2. **Right destination:** I know which OneDrive subfolder this output
   belongs in before I generate it.
3. **Saved, not just chatted:** When I finish, the result is saved as a
   file inside `OneDrive - RealPage, Inc.\AgentOS` — not left sitting in
   the chat window.

If the output only exists in the chat, the work is not done yet.
