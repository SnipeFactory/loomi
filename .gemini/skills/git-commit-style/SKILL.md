---
name: git-commit-style
description: Use this skill when writing, formatting, or reviewing git commit messages to ensure they follow project standards.
---

# Git Commit Style Guide

This skill ensures all git commit messages follow the project's strict standards.

## Commit Standards

1.  **Language:** ALWAYS write commit messages in **English**.
2.  **Format:** Use **Conventional Commits** (v1.0.0).
    - `feat:` for new features
    - `fix:` for bug fixes
    - `docs:` for documentation changes
    - `refactor:` for code changes that neither fix a bug nor add a feature
    - `chore:` for updating build tasks, package manager configs, etc.
    - `test:` for adding or fixing tests
3.  **Summary Line:** Max 50 characters, imperative mood ("Add" not "Added").
4.  **Body (Optional):** Explain the "why" and "what", not the "how".

## Mandatory Workflow

1.  **Analyze:** Run `git status` and `git diff HEAD` (or `--staged`) to understand the changes.
2.  **Draft:** Propose a draft message to the user.
3.  **Confirm:** Ask the user if they want to proceed with this message.
4.  **Execute:** Run `git commit -m "..."` only after confirmation.
