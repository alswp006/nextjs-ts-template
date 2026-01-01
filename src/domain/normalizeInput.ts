export function normalizeInput(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new Error("Input is empty");
  }

  return normalized;
}
