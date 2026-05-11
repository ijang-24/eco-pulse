---
name: rtk-mandatory
description: Mandates the use of rtk (Rust Token Killer) for all CLI operations to optimize token usage. Use this skill to ensure all commands are proxied through rtk and to monitor token savings.
---

# RTK Mandatory

## Overview

This skill ensures that all CLI commands executed within the Gemini CLI environment are optimized for token usage by leveraging `rtk` (Rust Token Killer). It mandates prefixing supported commands with `rtk` and provides guidance on using `rtk` meta-commands for analytics and debugging.

## Mandated Workflow

1. **Prefix All Commands**: For EVERY shell command, especially those involving file I/O or search, always use the `rtk` proxy to save tokens.
   - **Source Control**: Use `rtk git status`, `rtk git diff`.
   - **Navigation/Listing**: Use `rtk ls -la`, `rtk find .`.
   - **Reading Files**: Use `rtk cat <file>`, `rtk head <file>`, `rtk tail <file>`.
   - **Searching Content**: Use `rtk grep -r "pattern" .`, `rtk rg "pattern"`.
   - **File Modification**: Use `rtk sed`, `rtk awk`, or `rtk echo "content" > file`.

2. **Monitor Savings**: Regularly check token savings using `rtk gain`.
   - `rtk gain`: Show token savings analytics.
   - `rtk gain --history`: Show command usage history with savings.

3. **Analyze History**: Use `rtk discover` to analyze command history for missed optimization opportunities.

4. **Bypass for Debugging**: If a command fails or behaves unexpectedly through the proxy, use `rtk proxy <cmd>` to execute the raw command.

## Core Commands

| Command | Purpose |
|---------|---------|
| `rtk <cmd>` | Execute `<cmd>` through the token-optimized proxy. |
| `rtk gain` | View analytics on token savings. |
| `rtk discover` | Identify missed opportunities for token optimization. |
| `rtk proxy <cmd>` | Execute a command without filtering (bypass). |

## Guidelines

- **Token Efficiency**: The primary goal is to minimize token usage for every single turn. Using `rtk` is the standard operating procedure for all CLI interactions.
- **Consistency**: Never execute a standard CLI command without the `rtk` prefix unless explicitly debugging a proxy issue.
- **Reporting**: When reporting progress to the user, occasionally mention the token savings achieved via `rtk gain` if significant.
