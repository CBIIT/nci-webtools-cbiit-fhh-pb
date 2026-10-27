
let family_tree = [];

let data = {};
let furthest_right = 0;
let furthest_left = 0;


export function set_data (d) {
  data = d;
}

export function get_data (d) {
  return data;
}

export function get_config (d) {
  return data;
}

///////////////////////////////

export function get_generation_count() {
  const generation_count = get_youngest_generation() - get_oldest_generation();
  return generation_count + 1; // Add one for the proband row
}

export function get_furthest_right() {
  return furthest_right;
}

export function reset_furthest_locations() {
  furthest_left = 0;
  furthest_right = 0;
}

export function get_furthest_left() {
  return furthest_left;
}

export function get_oldest_generation() {
  let min = 0;
  for (const person_id in data["people"]) {
    const person = data["people"][person_id];
    if (person.gen < min) min = person.gen;
  }
  return min;
}
export function get_youngest_generation() {
  let max = 0;
  for (const person_id in data["people"]) {
    const person = data["people"][person_id];
    if (person.gen > max) max = person.gen;
  }
  return max;
}

//////////////////////// Support functions

function find_other_parent(child_id, parent_id) {
  if (!data["people"][child_id]) return null;
  if (data["people"][child_id].mother == parent_id ) return data["people"][child_id].father;
  else if (data["people"][child_id].father == parent_id ) return data["people"][child_id].mother;
  else return null;
}

export function find_all_children(person_id, direction) {
  let children = [];
  for (const candidate_id in data["people"]) {
    const candidate = data["people"][candidate_id];
    if (candidate.mother == person_id || candidate.father == person_id) children.push(candidate_id);
  }
  return children;
}

export function find_all_descendants(person_id, descendants) {

  const partners = find_all_partners(person_id);
  for (const i in partners) {
    const partner_id = partners[i];
    descendants.push(partner_id);
  }
  const children = find_all_children(person_id);
  for (const i in children) {
    const child_id = children[i];
    descendants.push(child_id);
    find_all_descendants(child_id, descendants);
  }
  return descendants;
}


export function find_all_partners(person_id) {
  if (!person_id || !data["people"][person_id]) return [];

  const partners = [];
  for (const child_id of find_all_children(person_id)) {
    const child = data["people"][child_id];
    if (!child.mother) child.mother = ensure_placeholder("m_" + person_id, "Female", "Partner of " + person_id);
    if (!child.father) child.father = ensure_placeholder("f_" + person_id, "Male", "Partner of " + person_id);
    const other = child.mother == person_id ? child.father : child.mother;
    if (other && other != person_id && !partners.includes(other)) partners.push(other);
  }
  return partners;
}

function ensure_placeholder(id, gender, name) {
  if (!data["people"][id]) {
    data["people"][id] = { id, name, placeholder: true, demographics: { gender } };
  }
  return id;
}

/////////////////////////////////////// Layout
//
// Every family is laid out as a rigid "block" whose extent is tracked per
// generation row (a contour). Blocks never share horizontal space on a row, so
// connectors from different families cannot cross. Blocks are built bottom-up
// and slid together until their contours touch (Reingold–Tilford style), and
// each sibship is centred under its parents' marriage line.

const GAP = 1;

let families = new Map();
let families_of = new Map();
let generations = new Map();
let visited = new Set();
let ancestors = new Set();

function exists(id) {
  return !!(id && data["people"][id]);
}

function gender_of(id) {
  return data["people"][id]?.demographics?.gender;
}

function add_missing_parents() {
  for (const child_id of Object.keys(data["people"])) {
    const child = data["people"][child_id];
    if (!child.mother && !child.father) continue;
    if (!child.mother) child.mother = ensure_placeholder("m_" + child.father, "Female", "Partner of " + child.father);
    else if (!exists(child.mother)) ensure_placeholder(child.mother, "Female", "Mother of " + child_id);
    if (!child.father) child.father = ensure_placeholder("f_" + child.mother, "Male", "Partner of " + child.mother);
    else if (!exists(child.father)) ensure_placeholder(child.father, "Male", "Father of " + child_id);
  }
}

function index_families() {
  families = new Map();
  families_of = new Map();
  for (const id of Object.keys(data["people"])) {
    const person = data["people"][id];
    if (!exists(person.mother) || !exists(person.father) || person.mother == person.father) continue;
    const key = person.mother + "|" + person.father;
    let family = families.get(key);
    if (!family) {
      family = { mother: person.mother, father: person.father, children: [] };
      families.set(key, family);
      for (const parent_id of [person.mother, person.father]) {
        if (!families_of.has(parent_id)) families_of.set(parent_id, []);
        families_of.get(parent_id).push(family);
      }
    }
    family.children.push(id);
  }
}

function birth_family(id) {
  const person = data["people"][id];
  return families.get(person.mother + "|" + person.father) || null;
}

function partner_in(family, id) {
  return family.mother == id ? family.father : family.mother;
}

function assign_generations(proband_id) {
  generations = new Map([[proband_id, 0]]);
  const queue = [proband_id];
  const visit = (id, gen) => {
    if (exists(id) && !generations.has(id)) {
      generations.set(id, gen);
      queue.push(id);
    }
  };
  while (queue.length) {
    const id = queue.shift();
    const gen = generations.get(id);
    const parents = birth_family(id);
    if (parents) {
      visit(parents.mother, gen - 1);
      visit(parents.father, gen - 1);
    }
    for (const family of families_of.get(id) || []) {
      visit(partner_in(family, id), gen);
      for (const child_id of family.children) visit(child_id, gen + 1);
    }
  }
}

function collect_ancestors(id) {
  ancestors.add(id);
  const parents = birth_family(id);
  if (!parents) return;
  for (const parent_id of [parents.mother, parents.father]) {
    if (!ancestors.has(parent_id)) collect_ancestors(parent_id);
  }
}

// People who will be laid out as part of the proband's own ancestry, so must not be pulled in elsewhere.
function is_reserved(id) {
  if (ancestors.has(id)) return true;
  const parents = birth_family(id);
  return !!parents && ancestors.has(parents.mother) && ancestors.has(parents.father);
}

// `pend` holds an in-law's ancestry not yet attached on that side; it is carried
// outwards while its anchor stays outermost on its row, so the ancestry ends up
// outside of everything it would otherwise be squeezed between.
function new_block() {
  return { pos: new Map(), rows: new Map(), pend: { left: null, right: null } };
}

function is_outermost(block, id, side) {
  const row = block.rows.get(generations.get(id));
  const x = block.pos.get(id);
  return side == "left" ? row[0] >= x : row[1] <= x;
}

function count_people(block, gen_filter) {
  let count = 0;
  for (const id of block.pos.keys()) if (gen_filter(generations.get(id))) count++;
  return count;
}

function attach(block, pending, side) {
  if (side == "right") return couple_block(block, pending.p, pending.Q, pending.q, pending.kids);
  return couple_block(pending.Q, pending.q, block, pending.p, pending.kids);
}

function resolve(block, side) {
  const pending = block.pend[side];
  if (!pending) return block;
  block.pend[side] = null;
  return attach(block, pending, side);
}

function extend_row(block, gen, lo, hi) {
  const row = block.rows.get(gen);
  if (!row) block.rows.set(gen, [lo, hi]);
  else {
    if (lo < row[0]) row[0] = lo;
    if (hi > row[1]) row[1] = hi;
  }
}

function single_block(id) {
  visited.add(id);
  const block = new_block();
  block.pos.set(id, 0);
  extend_row(block, generations.get(id), 0, 0);
  return block;
}

function shift(block, dx) {
  if (dx) {
    for (const [id, x] of block.pos) block.pos.set(id, x + dx);
    for (const row of block.rows.values()) {
      row[0] += dx;
      row[1] += dx;
    }
  }
  return block;
}

function absorb(target, source) {
  for (const [id, x] of source.pos) target.pos.set(id, x);
  for (const [gen, row] of source.rows) extend_row(target, gen, row[0], row[1]);
  return target;
}

// Smallest shift of `right` that keeps it entirely to the right of `left` on every shared row.
function min_offset(left, right) {
  let offset = -Infinity;
  for (const [gen, row] of right.rows) {
    const left_row = left.rows.get(gen);
    if (left_row) offset = Math.max(offset, left_row[1] - row[0] + GAP);
  }
  return offset;
}

// True when carrying an in-law's ancestry past `blocks` (crossing their people on and
// below p's row) is cheaper than leaving it under the marriage line one row up.
function cheaper_outside(pending, blocks) {
  const gen = generations.get(pending.p);
  const outer = blocks.reduce((sum, block) => sum + count_people(block, (g) => g >= gen), 0);
  return outer < count_people(pending.Q, (g) => g == gen - 1);
}

function merge_row(blocks) {
  let merged = null;
  blocks.forEach((block, i) => {
    if (!merged) {
      merged = block;
      return;
    }
    const later = blocks.slice(i);
    const carry_right = !!merged.pend.right && later.every((b) => !b.pend.right) && cheaper_outside(merged.pend.right, later);
    if (!carry_right) merged = resolve(merged, "right");
    const carried_left = !merged.pend.left && block.pend.left && cheaper_outside(block.pend.left, [merged]) ? block.pend.left : null;
    if (carried_left) block.pend.left = null;
    block = resolve(block, "left");
    const offset = min_offset(merged, block);
    absorb(merged, shift(block, offset === -Infinity ? 0 : offset));
    if (!carry_right) merged.pend.right = block.pend.right;
    if (carried_left) merged.pend.left = carried_left;
  });
  return merged;
}

function children_block(children) {
  const ids = children.filter((id) => !visited.has(id) && !ancestors.has(id));
  if (ids.length == 0) return null;
  const order = arrange_sibship(ids, null, null);
  return { ids: order.map((s) => s.id), block: merge_row(order.map((s) => build_own(s.id, null, s.side))) };
}

// A partner who brings their own ancestry must sit at the outside end of the sibship.
function needs_end(id) {
  return (families_of.get(id) || []).some((family) => {
    const q = partner_in(family, id);
    return !visited.has(q) && !is_reserved(q) && !!birth_family(q);
  });
}

// Orders a sibship left to right. x (if given) is pinned at `edge`; siblings whose
// partners bring ancestry take the free ends (the right end first when `prefer_right`),
// with that partner facing outwards.
function arrange_sibship(ids, x, edge, prefer_right = false) {
  let left_end = null;
  let right_end = null;
  let left_free = true;
  let right_free = true;
  if (x != null) {
    if (edge == "right") {
      right_end = { id: x, side: "right", strict: true };
      right_free = false;
    } else if (edge == "left") {
      left_end = { id: x, side: "left", strict: true };
      left_free = false;
    } else if (needs_end(x)) {
      if (prefer_right) {
        right_end = { id: x, side: "left" };
        right_free = false;
      } else {
        left_end = { id: x, side: "right" };
        left_free = false;
      }
    }
  }
  const pinned = new Set([left_end?.id, right_end?.id]);
  for (const id of ids) {
    if (pinned.has(id) || !needs_end(id)) continue;
    if (right_free && (prefer_right || !left_free)) {
      right_end = { id, side: "left" };
      right_free = false;
    } else if (left_free) {
      left_end = { id, side: "right" };
      left_free = false;
    } else break;
    pinned.add(id);
  }

  let middle = ids.filter((id) => !pinned.has(id)).map((id) => ({ id, side: null }));
  if (x != null && edge) {
    // Siblings married into another reserved branch go next to x, closest to that branch.
    const linked = (s) => (families_of.get(s.id) || []).some((family) => is_reserved(partner_in(family, s.id)) && partner_in(family, s.id) != x);
    const near = middle.filter(linked);
    const far = middle.filter((s) => !linked(s));
    middle = edge == "right" ? [...far, ...near] : [...near, ...far];
  }
  return [left_end, ...middle, right_end].filter(Boolean);
}

function add_sibship_bar(block, children, drop_x) {
  const xs = children.map((id) => block.pos.get(id));
  extend_row(block, generations.get(children[0]), Math.min(drop_x, ...xs), Math.max(drop_x, ...xs));
}

// Joins left block L (containing x) and right block R (containing y) as a couple,
// with their children block hanging centred under the marriage line.
function couple_block(L, x, R, y, kids) {
  L = resolve(L, "right");
  R = resolve(R, "left");
  const px = L.pos.get(x);
  const py = R.pos.get(y);
  const min_r = Math.max(min_offset(L, R), px + GAP - py);
  if (!kids) {
    absorb(L, shift(R, min_r));
    L.pend.right = R.pend.right;
    return L;
  }

  let C = kids.block;
  for (const side of ["left", "right"]) {
    const pending = C.pend[side];
    if (!pending) continue;
    // Carrying it outwards crosses whatever L/R has on p's row and below; attaching
    // now puts the in-law's relatives on x's row under the x–y marriage line. Pick the cheaper.
    const gen = generations.get(pending.p);
    const outer_cost = count_people(side == "left" ? L : R, (g) => g >= gen);
    const inner_cost = count_people(pending.Q, (g) => g == generations.get(x));
    if (outer_cost > 0 && inner_cost <= outer_cost) C = resolve(C, side);
  }
  const centre = (C.pos.get(kids.ids[0]) + C.pos.get(kids.ids[kids.ids.length - 1])) / 2;
  const min_c = min_offset(L, C);
  const min_rc = min_offset(C, R);
  const r_for = (oc) => Math.max(min_r, oc + min_rc);
  const imbalance = (oc) => oc + centre - (px + py + r_for(oc)) / 2;

  let oc, or;
  if (min_c > -Infinity && imbalance(min_c) >= 0) {
    // Children are pushed right of the couple's midpoint: spread the couple apart instead.
    oc = min_c;
    or = Math.max(r_for(oc), 2 * (oc + centre) - px - py);
  } else {
    oc = (px + py + min_r) / 2 - centre;
    if (oc + min_rc > min_r) oc = px + py + min_rc - 2 * centre;
    or = r_for(oc);
  }

  absorb(L, shift(C, oc));
  absorb(L, shift(R, or));
  add_sibship_bar(L, kids.ids, (px + py + or) / 2);
  L.pend.right = R.pend.right;

  let merged = L;
  for (const side of ["left", "right"]) {
    const pending = C.pend[side];
    if (!pending) continue;
    if (!merged.pend[side] && is_outermost(merged, pending.p, side)) merged.pend[side] = pending;
    else merged = attach(merged, pending, side);
  }
  return merged;
}

function hang_children(B, p, kids) {
  const C = resolve(resolve(kids.block, "left"), "right");
  const centre = (C.pos.get(kids.ids[0]) + C.pos.get(kids.ids[kids.ids.length - 1])) / 2;
  absorb(B, shift(C, Math.max(min_offset(B, C), B.pos.get(p) - centre)));
  add_sibship_bar(B, kids.ids, B.pos.get(p));
}

// Person p with all of their partner families except `exclude`. With `strict`, p is
// kept at the `side` ("left"/"right") edge of its row so a caller can attach to it.
// Otherwise `side` only says which way is outwards: a partner bringing ancestry goes
// there (deferred, see `pend`) and any other partners go inside.
function build_own(p, exclude, side, strict = false) {
  let B = single_block(p);
  let own_families = (families_of.get(p) || []).filter((family) => partner_in(family, p) != exclude);
  let first_left = null;
  const outward_left = side == "right";
  const brings_ancestry = (family) => {
    const q = partner_in(family, p);
    return !visited.has(q) && !is_reserved(q) && !!birth_family(q);
  };
  const deferred = side && !strict ? own_families.find(brings_ancestry) : null;
  if (deferred) own_families = [...own_families.filter((family) => family != deferred), deferred];

  own_families.forEach((family, i) => {
    const q = partner_in(family, p);
    let q_left;
    if (family == deferred) q_left = outward_left;
    else if (deferred) q_left = !outward_left;
    else if (side == "right") q_left = true;
    else if (side == "left") q_left = false;
    else if (i == 0) q_left = gender_of(q) == "Female" || (gender_of(p) != "Female" && gender_of(q) != "Male");
    else q_left = !first_left;
    if (i == 0) first_left = q_left;

    const kids = children_block(family.children);
    if (visited.has(q) || is_reserved(q)) {
      if (kids) hang_children(B, p, kids);
      return;
    }
    const Q = anc_side(q, q_left ? "right" : "left", p);
    if (family == deferred || (side && own_families.length == 1 && birth_family(q))) {
      B.pend[q_left ? "left" : "right"] = { p, q, Q, kids };
      return;
    }
    B = q_left ? couple_block(Q, q, B, p, kids) : couple_block(B, p, Q, q, kids);
  });
  return B;
}

// Person x together with x's parents, siblings and further ancestry, with x
// pinned at `edge` of its sibship so x's partner can attach from that side.
function anc_side(x, edge, exclude) {
  const parents = birth_family(x);
  const blocked = (id) => visited.has(id) || (ancestors.has(id) && !ancestors.has(x));
  if (!parents || blocked(parents.mother) || blocked(parents.father)) {
    return build_own(x, exclude, edge);
  }
  visited.add(parents.mother);
  visited.add(parents.father);

  // Whatever hangs off the inner parent ends up on x's row next to x's partner, so keep the lighter parent inside.
  // A parent whose own parents are already placed (a pedigree loop) goes inside to keep the loop short.
  const min_gen = generations.get(x);
  const looped = (id) => {
    const grandparents = birth_family(id);
    return !!grandparents && (visited.has(grandparents.mother) || visited.has(grandparents.father));
  };
  let mother_weight = side_weight(parents.mother, parents.father, min_gen);
  let father_weight = side_weight(parents.father, parents.mother, min_gen);
  if (looped(parents.mother) != looped(parents.father)) {
    mother_weight = looped(parents.mother) ? -1 : 1;
    father_weight = -mother_weight;
  }
  let left = parents.mother;
  let right = parents.father;
  if ((edge == "left" && mother_weight > father_weight) || (edge == "right" && father_weight > mother_weight)) {
    left = parents.father;
    right = parents.mother;
  }

  const siblings = parents.children.filter((id) => id == x || (!visited.has(id) && !ancestors.has(id)));
  const order = arrange_sibship(siblings, x, edge, !edge && father_weight < mother_weight);
  const blocks = new Map();
  for (const s of order) {
    if (s.id == x) blocks.set(x, build_own(x, exclude, s.side, s.strict));
    else if (!visited.has(s.id)) blocks.set(s.id, build_own(s.id, null, s.side));
  }
  const ids = order.map((s) => s.id).filter((id) => blocks.has(id));
  const kids = { ids, block: merge_row(ids.map((id) => blocks.get(id))) };

  const L = anc_side(left, "right", right);
  const R = anc_side(right, "left", left);
  return couple_block(L, left, R, right, kids);
}

// Number of not-yet-placed people at generation >= min_gen that would be laid out alongside `id` (excluding the family with `partner`).
function side_weight(id, partner, min_gen) {
  const seen = new Set([id]);
  const stack = [];
  let weight = 0;
  const push = (other) => {
    if (exists(other) && !seen.has(other) && !visited.has(other)) {
      seen.add(other);
      stack.push(other);
      if (generations.get(other) >= min_gen) weight++;
    }
  };
  for (const family of families_of.get(id) || []) {
    if (partner_in(family, id) == partner) continue;
    push(partner_in(family, id));
    family.children.forEach(push);
  }
  const parents = birth_family(id);
  if (parents) {
    push(parents.mother);
    push(parents.father);
  }
  while (stack.length) {
    const other = stack.pop();
    const other_parents = birth_family(other);
    if (other_parents) {
      push(other_parents.mother);
      push(other_parents.father);
    }
    for (const family of families_of.get(other) || []) {
      push(partner_in(family, other));
      family.children.forEach(push);
    }
  }
  return weight;
}

///////////////////////////////////////

export function build_entire_family_tree(proband_id) {
  family_tree = [];
  if (!exists(proband_id)) return family_tree;

  add_missing_parents();
  index_families();
  assign_generations(proband_id);
  visited = new Set();
  ancestors = new Set();
  collect_ancestors(proband_id);

  let block = anc_side(proband_id, null, null);
  while (block.pend.left || block.pend.right) block = resolve(resolve(block, "left"), "right");

  // Pedigree loops can leave people unreached by the recursion; lay them out alongside.
  visited = new Set(block.pos.keys());
  for (const id of generations.keys()) {
    if (visited.has(id)) continue;
    block = merge_row([block, anc_side(id, null, null)]);
    while (block.pend.left || block.pend.right) block = resolve(resolve(block, "left"), "right");
  }

  let min = Infinity;
  let max = -Infinity;
  for (const [id, loc] of block.pos) {
    const person = data["people"][id];
    person.id = id;
    person.gen = generations.get(id);
    person.loc = loc;
    family_tree.push(id);
    min = Math.min(min, loc);
    max = Math.max(max, loc);
  }
  furthest_left = min;
  furthest_right = max;

  return family_tree;
}

/////////////

export function check_for_unplaced_people() {
  let missing_people = [];

  for (const person_id in data["people"]) {
    const person = data["people"][person_id];

    if (!person.x || person.x < 0) { missing_people.push(person_id); }
    else if (!person.y || person.u < 0) { missing_people.push(person_id); }
  }

  return missing_people;
}

export function check_for_overlaps(tree) {
  let gen_loc_list = [];
  let overlap = {};

  for (const i in tree) {
    const person_id = tree[i];

    const loc = data["people"][person_id].loc;
    const gen = data["people"][person_id].gen;

    const gen_loc = {"gen": gen, "loc": loc, "id": person_id};
    for (const x in gen_loc_list) {
      const compare_gen_loc = gen_loc_list[x];
      if (gen_loc_equal(gen_loc, compare_gen_loc)) {
        overlap[gen_loc.id] = gen_loc;
        overlap[compare_gen_loc.id] = compare_gen_loc;
      }
    }
    gen_loc_list.push(gen_loc);
  }
  return overlap;
}

function gen_loc_equal(gen_loc1, gen_loc2) {
  if (!gen_loc1 || !gen_loc2 ) return false;
  if (gen_loc1.gen == gen_loc2.gen && gen_loc1.loc == gen_loc2.loc) return true;
  else return false;
}
