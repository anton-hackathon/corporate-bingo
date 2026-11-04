/**
 * Avatar colour and initials, shared by the feed and the board so the same
 * person is the same colour wherever they turn up.
 */
const AVA = ["var(--brand)", "var(--grape)", "var(--coral)", "var(--mint)", "var(--sun)"];

export function avaColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVA[h % AVA.length];
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
