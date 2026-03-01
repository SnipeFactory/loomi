# New Adapter Scaffolding

Create a new adapter for Loomi's Universal AI History Hub.

## Input

$ARGUMENTS — adapter name in kebab-case (e.g., `gemini-cli`)

## Steps

1. **Copy template**: Copy `adapters/_template/` to `adapters/$ARGUMENTS/`

2. **Edit manifest.json**: Update `id`, `name`, `description`, `provider`, and `filePatterns` based on the adapter name:
   - Infer provider from the name (e.g., `gemini-*` → `google`, `ollama-*` → `local`, `gpt-*` → `openai`)
   - Set appropriate file patterns for the tool's log format

3. **Edit index.ts**:
   - Update the `detectFile` method with proper file detection logic
   - Add a basic `parseLines` or `parseFile` implementation skeleton
   - Import path should be `../../src/core/adapters/types` and `../../src/core/parsers/types`

4. **Register in discover.ts**:
   - Add import in `src/core/adapters/discover.ts`
   - Add `adapterRegistry.register(new XxxAdapter())` in `registerBuiltinAdapters()`
   - Only do this if the adapter is a built-in. For external adapters, the auto-discovery handles it.

5. **Verify**: Run `npm run build` to check for TypeScript errors

## Output

Report the created files and any manual steps needed.
