# Gemini CLI - Research & Execution Guidelines

This document defines the core principles for Gemini CLI when working on the Loomi project.

## Language Preference

**Crucial: Always communicate with the user in their preferred language (e.g., Korean).** While these instructions are in English for better model consistency, all responses and interactions should remain in the language used by the user.

## Selective Memory Research Protocol (Mandatory)

Before starting any technical task, you must consult the **Loomi Episodic Memory** to recover past context and decisions.

### Step-by-Step Workflow
1.  **Selective Search:** Use the `loomi-memory:search` tool only when receiving a **Directive** (implementation, architecture, or complex bug fixes). Skip for simple inquiries (listing files, reading code).
2.  **Context Alignment:** If relevant records are found, inform the user: "Based on past records, I see we decided to use [X]. I will proceed with that context."
3.  **Code Discovery:** Only after memory search, proceed with `grep_search` or `glob` to analyze the current codebase.
4.  **Execution:** Combine historical context with current code for the optimal strategy.

## Engineering Standards

- **Contextual Precedence:** These guidelines (`GEMINI.md`) override general workflows.
- **Surgical Updates:** Use the `replace` tool for precise, minimal code changes.
- **Validation:** All changes must be verified via builds or tests.
- **Node Memory:** Use scripts with `NODE_OPTIONS='--max-old-space-size=4096'` to prevent OOM errors during intensive embedding tasks.

## Tech Stack & Architecture

Refer to `CLAUDE.md` for the detailed architecture. Loomi is strictly divided into Core, Feature, and Module layers. Ensure your code aligns with the appropriate layer.
