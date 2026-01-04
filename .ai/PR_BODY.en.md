# Summary
Implement `normalizeInput()` utility function that trims whitespace and collapses consecutive spaces, tabs, and newlines into a single space. Throws an error if the input is empty after trimming.

# How to test
1. Run `pnpm test` to execute the tests.
2. Test the function with various input strings to ensure it behaves as expected.

# Risk & rollback
- Risk: The function may not handle all edge cases correctly.
- Rollback: Revert the changes in `normalizeInput.ts` if issues arise.

# Notes
- Ensure to add corresponding tests for the `normalizeInput` function in the tests directory.
