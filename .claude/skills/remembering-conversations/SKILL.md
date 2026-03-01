# Skill: Remembering Past Conversations

You have access to an episodic memory system that indexes all past coding conversations.
Use it to recover decisions, solutions, debugging approaches, and architectural context.

## When to Search

- After understanding a task: "how should I approach this?", "what's the best pattern?"
- When stuck on a problem — past conversations may have solutions
- Historical signals in user messages: "last time", "before", "we discussed", "do you remember"
- When making architectural decisions — check if similar decisions were made before
- Before proposing a new approach — verify it wasn't already tried and failed

## When NOT to Search

- For current codebase structure — use Grep/Read tools first
- When the information is already in the current conversation
- Before understanding what the user is asking

## How to Search

ALWAYS dispatch a subagent instead of calling MCP tools directly (saves 50-100x context):

```
Task tool:
  description: "Search past conversations for [topic]"
  prompt: "Search for [specific query]. Focus on [decisions/patterns/gotchas/code examples]."
  subagent_type: "search-conversations"
```

## Search Tips

- Use specific technical terms, not vague descriptions
- For complex topics, use multi-concept queries: `["authentication", "JWT", "refresh tokens"]`
- Use date filters when you know the approximate timeframe: `after: "2025-01-01"`
- Always read the full conversation (`show` tool) for the top 2-3 results to get full context
