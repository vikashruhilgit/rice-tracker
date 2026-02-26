export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function errorResult(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }],
    isError: true as const,
  };
}
