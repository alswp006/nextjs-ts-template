cat > .ai/TASK.md << 'EOF'

# Task

## Goal

- Implement `normalizeInput()` utility and tests.

## Files to create

- src/domain/normalizeInput.ts
- src/domain/**tests**/normalizeInput.test.ts

## Requirements

- Input is a string.
- Trim leading/trailing whitespace.
- Collapse any consecutive whitespace (spaces/tabs/newlines) into a single space.
- If the result is empty string, throw an Error with message: "Input is empty".
- Return the normalized string.

## Tests (Vitest)

1. trims and collapses spaces
   - " hello world " -> "hello world"
2. collapses tabs/newlines into spaces
   - "hello\\t\\tworld\\nnext" -> "hello world next"
3. keeps single spaces
   - "a b c" -> "a b c"
4. throws on empty after trim
   - " " -> throws Error("Input is empty")
     EOF
