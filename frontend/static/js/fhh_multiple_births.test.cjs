const assert = require("node:assert/strict");
const { before, test } = require("node:test");

let multiples;

before(async () => {
  multiples = await import("./fhh_multiple_births.js");
});

function sibling(type, born = "03/06/2011", parents = { mother: "m", father: "f" }) {
  return { ...parents, born, ...(type ? { multiple_birth_type: type } : {}) };
}

test("groups explicitly marked siblings without inferring multiples from a shared birthday", () => {
  const people = {
    a: sibling("Unknown"),
    b: sibling("Unknown"),
    c: sibling(null),
  };
  assert.deepEqual(multiples.find_multiple_birth_groups(people), {
    groups: [{ key: "a|b", members: ["a", "b"], kind: "unknown" }],
    issues: [],
  });
});

test("maps fraternal, identical, and triplet types", () => {
  const people = {
    a: sibling("Twin, Fraternal", "01/01/2000"),
    b: sibling("Twin, Fraternal", "01/01/2000"),
    c: sibling("Twin, Identical", "02/02/2001"),
    d: sibling("Twin, Identical", "02/02/2001"),
    e: sibling("Triplets", "03/03/2002"),
    f: sibling("Triplets", "03/03/2002"),
    g: sibling("Triplets", "03/03/2002"),
  };
  assert.deepEqual(
    multiples.find_multiple_birth_groups(people).groups.map((group) => [group.kind, group.members]),
    [["fraternal", ["a", "b"]], ["identical", ["c", "d"]], ["triplets", ["e", "f", "g"]]]
  );
});

test("matches the recorded partial birth date without treating it as an unspecified type", () => {
  const people = {
    a: sibling("Twin, Fraternal", "5/UN/1915"),
    b: sibling("Twin, Fraternal", "05/UN/1915"),
  };
  assert.equal(multiples.find_multiple_birth_groups(people).groups[0].kind, "fraternal");
});

test("keeps different parentages and birth dates in separate groups", () => {
  const people = {
    a: sibling("Unknown"),
    b: sibling("Unknown"),
    c: sibling("Unknown", "03/06/2011", { mother: "other", father: "f" }),
    d: sibling("Unknown", "03/06/2011", { mother: "other", father: "f" }),
    e: sibling("Unknown", "03/06/2012"),
    f: sibling("Unknown", "03/06/2012"),
  };
  assert.deepEqual(
    multiples.find_multiple_birth_groups(people).groups.map((group) => group.members),
    [["a", "b"], ["c", "d"], ["e", "f"]]
  );
});

test("reports incomplete, conflicting, and ambiguous groups without guessing", () => {
  const people = {
    a: sibling("Unknown"),
    b: sibling("Twin, Fraternal"),
    c: sibling("Triplets", "01/01/2010"),
    d: sibling("Triplets", "01/01/2010"),
    e: sibling("Unknown", "02/02/2010", {}),
  };
  const result = multiples.find_multiple_birth_groups(people);
  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.issues.map((issue) => issue.person_id).sort(), ["a", "b", "c", "d", "e"]);
});

test("constructs one shared junction, an identical crossbar, and an unknown-type marker", () => {
  const group = { members: ["a", "b"], kind: "identical" };
  const people = {
    a: { x: 0, y: 200 },
    b: { x: 120, y: 200 },
  };
  const geometry = multiples.multiple_birth_geometry(group, people, 50, 100);
  assert.deepEqual(geometry.anchor, [60, 100]);
  assert.deepEqual(geometry.junction, [60, 126.25]);
  assert.deepEqual(geometry.branches.map((branch) => branch.end), [[0, 200], [120, 200]]);
  assert.equal(geometry.crossbar[0][1], geometry.crossbar[1][1]);
  assert.ok(geometry.crossbar[0][0] < geometry.crossbar[1][0]);
  assert.equal(geometry.question[0], geometry.junction[0]);
  assert.ok(geometry.question[1] > geometry.junction[1] && geometry.question[1] < 175);
});

test("recognizes separation by another person or a differing vertical position", () => {
  const group = { members: ["a", "b"] };
  const people = {
    a: { x: 0, y: 200, gen: 0 },
    b: { x: 120, y: 200, gen: 0 },
    c: { x: 240, y: 200, gen: 0 },
  };
  assert.equal(multiples.multiple_births_are_adjacent(group, people), true);
  people.c.x = 60;
  assert.equal(multiples.multiple_births_are_adjacent(group, people), false);
  people.c.gen = 1;
  assert.equal(multiples.multiple_births_are_adjacent(group, people), true);
  people.b.y = 100;
  assert.equal(multiples.multiple_births_are_adjacent(group, people), false);
});

test("suggests adjacent saved positions without moving unrelated people", () => {
  const group = { members: ["a", "b"] };
  const people = {
    a: { x: 0, y: 200, gen: 0, mother: "m", father: "f" },
    b: { x: 240, y: 200, gen: 0, mother: "m", father: "f" },
    c: { x: 120, y: 200, gen: 0 },
    m: { x: -60, y: 0, gen: -1 },
    f: { x: 60, y: 0, gen: -1 },
  };
  const original = JSON.parse(JSON.stringify(people));
  const positions = multiples.suggest_multiple_birth_positions(group, people, 50, 120, "a");
  assert.deepEqual(people, original);
  assert.deepEqual(positions.find((position) => position.id === "a"), { id: "a", x: 0, y: 200 });
  for (const position of positions) Object.assign(people[position.id], position);
  assert.equal(multiples.multiple_births_are_adjacent(group, people), true);
  assert.deepEqual(people.c, original.c);
});

test("does not suggest unsafe multiple-birth spacing", () => {
  const group = { members: ["a", "b"] };
  const people = {
    a: { x: 0, y: 0, gen: 0 },
    b: { x: 100, y: 10, gen: 0 },
  };
  assert.equal(multiples.suggest_multiple_birth_positions(group, people, 50, 20, "a"), null);
});
