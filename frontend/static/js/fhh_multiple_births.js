const MULTIPLE_BIRTH_TYPES = {
  "Twin, Identical": { kind: "identical", count: 2 },
  "Twin, Fraternal": { kind: "fraternal", count: 2 },
  "Unknown": { kind: "unknown", count: 2 },
  "Triplets": { kind: "triplets", count: 3 },
};

function birth_date_key(value) {
  const date = typeof value === "string" ? value.trim().toUpperCase() : "";
  const parts = date.split("/");
  if (parts.length !== 3) return date;
  return parts.map((part) => /^\d+$/.test(part) ? part.padStart(2, "0") : part).join("/");
}

// The type marks a multiple birth; parentage and the recorded date identify its members.
export function find_multiple_birth_groups(people) {
  const buckets = new Map();
  const issues = [];

  for (const [id, person] of Object.entries(people)) {
    const type = person.multiple_birth_type;
    if (!type) continue;
    if (!Object.hasOwn(MULTIPLE_BIRTH_TYPES, type)) {
      issues.push({ person_id: id, message: `Unrecognized multiple birth type: ${type}` });
      continue;
    }
    if (!person.mother && !person.father) {
      issues.push({ person_id: id, message: "Multiple birth cannot be matched without a recorded parent" });
      continue;
    }

    const key = JSON.stringify([person.mother || null, person.father || null, birth_date_key(person.born)]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ id, type });
  }

  const groups = [];
  for (const members of buckets.values()) {
    const type = members[0].type;
    const definition = MULTIPLE_BIRTH_TYPES[type];
    if (members.length !== definition.count || members.some((member) => member.type !== type)) {
      for (const member of members) {
        issues.push({
          person_id: member.id,
          message: "Multiple birth group is incomplete or ambiguous",
        });
      }
      continue;
    }
    const ids = members.map((member) => member.id).sort();
    groups.push({ key: ids.join("|"), members: ids, kind: definition.kind });
  }
  return { groups, issues };
}

export function multiple_birth_geometry(group, people, size, bar_y) {
  const members = group.members
    .map((id) => ({ id, x: people[id].x, y: people[id].y }))
    .sort((left, right) => left.x - right.x);
  const anchor_x = (members[0].x + members[members.length - 1].x) / 2;
  const nearest_top = Math.min(...members.map((person) => person.y - size / 2));
  const junction_y = bar_y + Math.max(0, nearest_top - bar_y) * 0.35;
  const junction = [anchor_x, junction_y];
  const crossbar_y = junction_y + Math.max(0, nearest_top - junction_y) * 0.55;
  const branch_point = (person) => {
    const fraction = person.y === junction_y ? 0 : (crossbar_y - junction_y) / (person.y - junction_y);
    return [anchor_x + (person.x - anchor_x) * fraction, crossbar_y];
  };

  return {
    anchor: [anchor_x, bar_y],
    junction,
    branches: members.map((person) => ({ id: person.id, end: [person.x, person.y] })),
    crossbar: [branch_point(members[0]), branch_point(members[members.length - 1])],
    question: [anchor_x, junction_y + Math.max(0, nearest_top - junction_y) * 0.7],
  };
}

export function multiple_births_are_adjacent(group, people) {
  const members = group.members.map((id) => people[id]);
  if (members.some((person) => !person || !Number.isFinite(person.x) || !Number.isFinite(person.y))) return false;
  const generation = members[0].gen;
  if (members.some((person) => person.gen !== generation || Math.abs(person.y - members[0].y) > 0.5)) return false;
  const left = Math.min(...members.map((person) => person.x));
  const right = Math.max(...members.map((person) => person.x));
  return !Object.entries(people).some(([id, person]) =>
    !group.members.includes(id) && person.gen === generation &&
    Number.isFinite(person.x) && person.x > left && person.x < right
  );
}

export function suggest_multiple_birth_positions(group, people, size, spacing, proband_id) {
  if (multiple_births_are_adjacent(group, people)) return [];
  if (!Number.isFinite(size) || !Number.isFinite(spacing) || size <= 0 || spacing < size) return null;

  const members = group.members
    .map((id) => ({ id, ...people[id] }))
    .sort((left, right) => left.x - right.x);
  if (members.some((person) => !Number.isFinite(person.x) || !Number.isFinite(person.y) ||
      person.gen !== members[0].gen)) return null;

  const mother = people[members[0].mother];
  const father = people[members[0].father];
  const parent_x = Number.isFinite(mother?.x) && Number.isFinite(father?.x)
    ? (mother.x + father.x) / 2
    : members[0].x;
  const anchor = members.find((person) => person.id === proband_id) ||
    members.reduce((best, person) =>
      Math.abs(person.x - parent_x) < Math.abs(best.x - parent_x) ? person : best
    );
  const others = Object.entries(people)
    .filter(([id, person]) => !group.members.includes(id) && Number.isFinite(person.x) && Number.isFinite(person.y))
    .map(([, person]) => person);
  const xs = others.map((person) => person.x);
  const anchors = [anchor.x];
  for (let step = 1; step <= others.length + members.length; step++) {
    anchors.push(anchor.x - step * spacing, anchor.x + step * spacing);
  }
  if (xs.length) anchors.push(Math.min(...xs) - members.length * spacing, Math.max(...xs) + members.length * spacing);

  let best = null;
  for (const anchor_x of anchors) {
    for (let anchor_index = 0; anchor_index < members.length; anchor_index++) {
      const order = members.filter((person) => person.id !== anchor.id);
      order.splice(anchor_index, 0, anchor);
      const positions = order.map((person, index) => ({
        id: person.id,
        x: anchor_x + (index - anchor_index) * spacing,
        y: anchor.y,
      }));
      const left = positions[0].x;
      const right = positions[positions.length - 1].x;
      if (others.some((person) => person.gen === anchor.gen && person.x > left && person.x < right)) continue;
      if (positions.some((position) => others.some((person) =>
        Math.abs(person.x - position.x) < size && Math.abs(person.y - position.y) < size
      ))) continue;
      const score = positions.reduce((sum, position) => {
        const before = people[position.id];
        return sum + (position.x - before.x) ** 2 + (position.y - before.y) ** 2;
      }, 0);
      const anchor_distance = Math.abs(anchor_x - anchor.x);
      if (!best || anchor_distance < best.anchor_distance ||
          (anchor_distance === best.anchor_distance && score < best.score)) {
        best = { positions, score, anchor_distance };
      }
    }
  }
  return best?.positions ?? null;
}
