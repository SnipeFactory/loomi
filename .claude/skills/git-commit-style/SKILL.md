# Skill: Git Commit Style

This skill ensures all git commit messages follow the project's strict standards.

## When to use

- When the user asks to "commit", "wrap up", "prepare a PR", or "save changes".
- When you are about to run `git commit`.

## Standards

1.  **Language:** ALWAYS write commit messages in **English**.
2.  **Format:** Use **Conventional Commits** (e.g., `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `style:`, `ci:`, `perf:`).
3.  **Structure:**
    - A short summary line (max 50 chars).
    - A blank line.
    - (Optional) A detailed body explaining the "why" if the change is complex.
4.  **Imperative Mood:** Use "Add feature" instead of "Added feature" or "Adds feature".

## Workflow

1.  Check status and diff: `git status && git diff HEAD`.
2.  Propose a draft message in the terminal for the user to review.
3.  Only proceed with the actual `git commit` after confirmation.
