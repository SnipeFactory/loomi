# /add-core-api — Add Core Data Access API

Creates a new Core API function and its HTTP wrapper. Argument: `$ARGUMENTS` (Feature name, e.g., `analytics`)

## Architectural Rules

- **Core API (`src/core/api/`)**: Synchronous TypeScript functions. Called within the same process, no HTTP overhead.
- **HTTP Route (`src/app/api/`)**: Thin wrapper. Calls the Core API function and returns a `NextResponse.json`.
- **DB Query Logic**: Must reside exclusively within the Core API.

## Created/Modified Files

### 1. `src/core/api/$ARGUMENTS.ts` — Core API Function

Refer to existing patterns (e.g., `src/core/api/sessions.ts`):

```typescript
import { getDb } from "../db";
import { tableName } from "../db/schema";
// Required drizzle-orm imports

export function functionName(opts?: OptionType): ReturnType {
  const db = getDb();
  // Drizzle ORM Query (Synchronous)
  return result;
}
```

### 2. `src/core/api/types.ts` — Add Types (if needed)

Define request options and response types here:

```typescript
export interface OptionType {
  limit?: number;
  page?: number;
  // ...
}
```

### 3. `src/app/api/$ARGUMENTS/route.ts` — HTTP Thin Wrapper

```typescript
import { NextResponse } from "next/server";
import { functionName } from "@core/api/$ARGUMENTS";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Extract parameters from searchParams
  const result = functionName({ /* opts */ });
  return NextResponse.json(result);
}
```

### 4. `src/core/db/schema.ts` — New Table (Only if necessary)

Only add a table if new data storage is required. Check if existing tables are sufficient first.

## Checklist

- [ ] Confirm Core API function is synchronous (better-sqlite3 is sync).
- [ ] Types defined in `src/core/api/types.ts`.
- [ ] HTTP route is a thin wrapper calling the Core API.
- [ ] No inline DB queries in the route file.
- [ ] Confirm `npm run build` succeeds.
