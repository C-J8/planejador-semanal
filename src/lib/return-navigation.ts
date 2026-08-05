export function safeReturnTo(
  value: FormDataEntryValue | string | undefined,
  fallback: string,
) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : fallback;
}
