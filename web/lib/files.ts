/**
 * Trims a file input's selection down to a single file.
 *
 * Phone galleries hand back several photos even for an input that asks for
 * one: Android's picker offers the tick boxes anyway, and iOS keeps whatever
 * the library had selected. The form would then post the first and drop the
 * rest without a word, which reads as "it lost my photo". This replaces the
 * selection with a real one-file list and returns a label that says what
 * happened, so the dropzone shows it.
 */
export function keepFirstFile(input: HTMLInputElement): string | null {
  const files = input.files;
  if (!files || files.length === 0) return null;

  const first = files[0];
  if (files.length === 1) return first.name;

  try {
    const only = new DataTransfer();
    only.items.add(first);
    input.files = only.files;
  } catch {
    // No DataTransfer (older Safari). The server reads one file regardless,
    // so the label below is still the truth.
  }
  return `${first.name} — one photo at a time`;
}
