/**
 * Team building. The point of the game is to mix departments, so each team is
 * assembled from different departments wherever possible.
 */

export type Candidate = { id: string; department: string | null };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeTeams(users: Candidate[], size: number, seed: number): Candidate[][] {
  const rnd = mulberry32(seed);
  if (users.length < size) return users.length ? [users.slice()] : [];

  // Buckets by department, shuffled inside each one.
  const buckets = new Map<string, Candidate[]>();
  for (const u of shuffled(users, rnd)) {
    const key = u.department ?? "—";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(u);
  }

  const teamCount = Math.floor(users.length / size);
  const teams: Candidate[][] = Array.from({ length: teamCount }, () => []);
  const takenDept: Set<string>[] = Array.from({ length: teamCount }, () => new Set());

  const biggestFirst = () =>
    [...buckets.entries()].filter(([, v]) => v.length > 0).sort((a, b) => b[1].length - a[1].length);

  for (let slot = 0; slot < size; slot++) {
    for (let t = 0; t < teamCount; t++) {
      const ordered = biggestFirst();
      if (!ordered.length) break;
      // Draw from the largest bucket whose department is not in the team yet.
      const entry = ordered.find(([dept]) => !takenDept[t].has(dept)) ?? ordered[0];
      const [dept, list] = entry;
      const user = list.shift()!;
      teams[t].push(user);
      takenDept[t].add(dept);
    }
  }

  // Spread the remainder across the smallest teams: a couple of teams of four
  // is better than one that is out of the running before it starts.
  const leftovers = [...buckets.values()].flat();
  for (const u of leftovers) {
    teams.sort((a, b) => a.length - b.length);
    teams[0].push(u);
  }

  return teams;
}

const ADJ = [
  "Frantic", "Lazy", "Sly", "Loud", "Fluffy", "Grumpy", "Swift", "Sleepy",
  "Cheeky", "Jolly", "Stubborn", "Nimble", "Fearsome", "Shaggy", "Cunning", "Brisk",
  "Daring", "Furry", "Valiant", "Ginger", "Striped", "Toothy", "Round", "Noisy",
  "Restless", "Scruffy", "Hungry", "Content", "Sudden", "Chipper", "Gloomy", "Rebel",
  "Velvet", "Buzzing", "Floppy", "Ruthless", "Hasty", "Pensive", "Midnight",
  "Unflappable", "Desperate", "Glossy", "Resolute", "Curious", "Creaky", "Spotted",
  "Breathless", "Impeccable",
];

const NOUN = [
  "hamsters", "possums", "raccoons", "cats", "mice", "badgers", "otters", "gophers",
  "hedgehogs", "beavers", "foxes", "jerboas", "meerkats", "moles", "sloths", "penguins",
  "mongooses", "squirrels", "platypuses", "capybaras", "llamas", "armadillos", "tapirs", "lemurs",
  "chipmunks", "ferrets", "coatis", "pangolins", "wombats", "alpacas", "toucans", "fennecs",
  "lizards", "pelicans", "walruses", "owls", "boars", "porcupines", "nutrias", "chinchillas",
  "koalas", "marmots", "lynxes", "deer", "herons", "quokkas", "jackdaws", "squids",
];

/**
 * Team names. The adjective advances every step while the noun advances by a
 * coprime stride, so the pair walks all ADJ × NOUN combinations before any
 * repeats — 2304 names from two lists of 48. Driving both indices off the same
 * counter would cap the output at 48 and leave the rest as "Team N".
 */
export function teamNames(count: number, seed: number, taken: Set<string> = new Set()): string[] {
  const rnd = mulberry32(seed ^ 0x5f3a);
  const adj = shuffled(ADJ, rnd);
  const noun = shuffled(NOUN, rnd);

  // The noun step is coprime with the list length, so pairs do not repeat early.
  const step = pickStep(noun.length, rnd);

  const names: string[] = [];
  const used = new Set(taken);
  for (let i = 0; names.length < count && i < adj.length * noun.length; i++) {
    const a = i % adj.length;
    const lap = Math.floor(i / adj.length);
    const name = `${adj[a]} ${noun[(lap + a * step) % noun.length]}`;
    if (used.has(name)) continue;
    used.add(name);
    names.push(name);
  }
  for (let i = names.length; i < count; i++) names.push(`Team ${i + 1}`);
  return names;
}

function pickStep(n: number, rnd: () => number): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  for (let tries = 0; tries < 50; tries++) {
    const k = 1 + Math.floor(rnd() * (n - 1));
    if (gcd(k, n) === 1) return k;
  }
  return 1;
}
