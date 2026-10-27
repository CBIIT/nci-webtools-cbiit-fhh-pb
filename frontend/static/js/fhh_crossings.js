// Finds connector lines that cross each other or pass through a person's symbol.

const EPS = 0.5;

function orient(a, b, c) {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < EPS ? 0 : Math.sign(v);
}

function on_segment(a, b, p) {
  return Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS;
}

function same_point(p, q) {
  return Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
}

function is_end(segment, p) {
  return same_point(segment.a, p) || same_point(segment.b, p);
}

// True if the segments cross or overlap anywhere other than a shared endpoint.
export function segments_cross(s, t) {
  const { a, b } = s;
  const c = t.a;
  const d = t.b;
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - EPS || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - EPS) return false;
  if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - EPS || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - EPS) return false;
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 === 0 && o2 === 0) {
    const k = Math.abs(a[1] - b[1]) < EPS && Math.abs(c[1] - d[1]) < EPS ? 0 : 1;
    const lo = Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k]));
    const hi = Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k]));
    return hi - lo > EPS;
  }
  if (o1 !== o2 && o3 !== o4) {
    let p = null;
    for (const q of [c, d]) if (orient(a, b, q) === 0 && on_segment(a, b, q)) p = q;
    for (const q of [a, b]) if (orient(c, d, q) === 0 && on_segment(c, d, q)) p = q;
    return !(p && is_end(s, p) && is_end(t, p));
  }
  return false;
}

export function segment_hits_box(segment, center, half) {
  const [x0, y0] = segment.a;
  const [x1, y1] = segment.b;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, x0 - (center[0] - half)],
    [dx, center[0] + half - x0],
    [-dy, y0 - (center[1] - half)],
    [dy, center[1] + half - y0],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t1 - t0 > 1e-9;
}

// people: id -> {x, y, mother, father}; bar_y(parents_y, child_ys) gives the sibship line height.
// Overlaps among the lines of someone with 3+ partners can't always be avoided, so they are
// reported separately in `multi_partner` (person id -> segments involved).
export function find_layout_problems(people, size, bar_y) {
  const placed = (id) => people[id] && people[id].x != null && people[id].y != null;
  const families = new Map();
  for (const id of Object.keys(people)) {
    const person = people[id];
    if (!placed(id) || !placed(person.mother) || !placed(person.father)) continue;
    const key = person.mother + "|" + person.father;
    if (!families.has(key)) families.set(key, { mother: person.mother, father: person.father, children: [] });
    families.get(key).children.push(id);
  }
  // Childless couples are only known from `partners` records but still get a marriage line.
  for (const id of Object.keys(people)) {
    for (const partner of people[id].partners || []) {
      const spouse_id = partner?.spouse_id;
      if (!placed(id) || !placed(spouse_id) || spouse_id === id) continue;
      if (families.has(id + "|" + spouse_id) || families.has(spouse_id + "|" + id)) continue;
      families.set(id + "|" + spouse_id, { mother: id, father: spouse_id, children: [] });
    }
  }

  const partners = {};
  for (const family of families.values()) {
    (partners[family.mother] ||= new Set()).add(family.father);
    (partners[family.father] ||= new Set()).add(family.mother);
  }
  const many_partners = (id) => partners[id] && partners[id].size >= 3;

  const segments = [];
  for (const [key, family] of families) {
    const mother = people[family.mother];
    const father = people[family.father];
    const drop_x = (mother.x + father.x) / 2;
    const parents_y = (mother.y + father.y) / 2;
    const line_y = bar_y(parents_y, family.children.map((id) => people[id].y));
    const members = [family.mother, family.father];
    segments.push({ key, members, owners: members, kind: "marriage", a: [mother.x, mother.y], b: [father.x, father.y] });
    if (family.children.length > 0) segments.push({ key, members, owners: [], kind: "drop", a: [drop_x, parents_y], b: [drop_x, line_y] });
    for (const child_id of family.children) {
      const child = people[child_id];
      segments.push({ key, members, owners: [], kind: "bar", child: child_id, a: [drop_x, line_y], b: [child.x, line_y] });
      segments.push({ key, members, owners: [child_id], kind: "stub", child: child_id, a: [child.x, child.y], b: [child.x, line_y] });
    }
  }

  const crossings = [];
  const multi_partner = new Map();
  const note_multi = (id, ...involved) => {
    if (!multi_partner.has(id)) multi_partner.set(id, new Set());
    involved.forEach((segment) => multi_partner.get(id).add(segment));
  };
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (s.key === t.key) continue;
      if (!segments_cross(s, t)) continue;
      const shared = s.members.find((id) => t.members.includes(id) && many_partners(id));
      if (shared) note_multi(shared, s, t);
      else crossings.push([s, t]);
    }
  }

  const hits = [];
  const half = size / 2;
  for (const s of segments) {
    const crowded = s.kind === "marriage" || s.kind === "drop" ? s.members.find(many_partners) : null;
    for (const id of Object.keys(people)) {
      if (!placed(id) || s.owners.includes(id)) continue;
      if (!segment_hits_box(s, [people[id].x, people[id].y], half)) continue;
      if (crowded) note_multi(crowded, s);
      else hits.push({ segment: s, person_id: id });
    }
  }

  return {
    crossings,
    hits,
    multi_partner: [...multi_partner].map(([person_id, involved]) => ({ person_id, segments: [...involved] })),
  };
}
