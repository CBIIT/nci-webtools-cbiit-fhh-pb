const assert = require("node:assert/strict");
const { before, beforeEach, test } = require("node:test");

const fixture = require("./fhh_pedigree.test.json");

let pedigree;

before(async () => {
  pedigree = await import("./fhh_build_pedigree.js");
});

function cloneFixture() {
  return JSON.parse(JSON.stringify(fixture));
}

function runSilently(callback) {
  const originalConsoleLog = console.log;
  console.log = () => {};
  try {
    return callback();
  } finally {
    console.log = originalConsoleLog;
  }
}

beforeEach(() => {
  pedigree.reset_furthest_locations();
  pedigree.set_hidden_people([]);
  pedigree.set_data(cloneFixture());
});

test("hidden (collapsed) children are left out while their parents stay a couple", () => {
  const hidden = ["10001-03-001", "10001-03-002", "10001-03-003"];
  pedigree.set_hidden_people(hidden);
  const tree = runSilently(() => pedigree.build_entire_family_tree(fixture.proband));
  const people = pedigree.get_data().people;

  for (const id of hidden) {
    assert.ok(!tree.includes(id));
    assert.equal(people[id].loc, null);
  }
  assert.ok(tree.includes("10001-01-005"));
  assert.equal(Math.abs(people[fixture.proband].loc - people["10001-01-005"].loc), 1);
});

test("set_data and get_data use the active dataset", () => {
  const data = cloneFixture();
  pedigree.set_data(data);

  assert.equal(pedigree.get_data(), data);
});

test("find_all_children returns the proband children", () => {
  const children = pedigree.find_all_children(fixture.proband).sort();

  assert.deepEqual(children, ["10001-03-001", "10001-03-002", "10001-03-003"]);
});

test("find_all_partners and find_all_descendants include the spouse branch", () => {
  const partners = pedigree.find_all_partners(fixture.proband);
  const descendants = pedigree.find_all_descendants(fixture.proband, []).sort();

  assert.deepEqual(partners, ["10001-01-005"]);
  assert.deepEqual(descendants, [
    "10001-01-005",
    "10001-03-001",
    "10001-03-002",
    "10001-03-003",
  ]);
});

test("build_entire_family_tree adds placeholder ancestors and generation metadata", () => {
  const tree = runSilently(() => pedigree.build_entire_family_tree(fixture.proband));
  const data = pedigree.get_data();

  assert.equal(tree.length, 21);
  assert.ok(tree.includes(fixture.proband));
  assert.ok(tree.includes("10001-01-005"));
  assert.ok(tree.includes("m_10001-04-021"));
  assert.equal(data.people["m_10001-04-021"].placeholder, true);
  assert.equal(data.people[fixture.proband].gen, 0);
  assert.equal(data.people["10001-04-021"].gen, -2);
  assert.equal(pedigree.get_oldest_generation(), -2);
  assert.equal(pedigree.get_youngest_generation(), 1);
  assert.equal(pedigree.get_generation_count(), 4);
});

test("build_entire_family_tree assigns locations without overlaps on the sample fixture", () => {
  const tree = runSilently(() => pedigree.build_entire_family_tree(fixture.proband));
  const data = pedigree.get_data();

  assert.equal(Object.keys(pedigree.check_for_overlaps(tree)).length, 0);
  const proband_loc = data.people[fixture.proband].loc;
  assert.ok(pedigree.get_furthest_left() <= proband_loc);
  assert.ok(pedigree.get_furthest_right() >= proband_loc);
  assert.ok(pedigree.get_furthest_left() < pedigree.get_furthest_right());
});

test("build_entire_family_tree keeps sibship lines of different families apart", () => {
  const tree = runSilently(() => pedigree.build_entire_family_tree(fixture.proband));
  const people = pedigree.get_data().people;
  const bars = {};
  for (const id of tree) {
    const person = people[id];
    if (!people[person.mother] || !people[person.father]) continue;
    const drop = (people[person.mother].loc + people[person.father].loc) / 2;
    const key = person.mother + "|" + person.father;
    const bar = (bars[key] ||= { gen: person.gen, lo: drop, hi: drop });
    bar.lo = Math.min(bar.lo, person.loc);
    bar.hi = Math.max(bar.hi, person.loc);
  }
  const list = Object.values(bars);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.gen == b.gen) assert.ok(a.hi < b.lo || b.hi < a.lo, "sibship lines overlap");
    }
  }
});

test("reset_furthest_locations clears placement bounds", () => {
  runSilently(() => pedigree.build_entire_family_tree(fixture.proband));

  assert.ok(pedigree.get_furthest_left() < pedigree.get_furthest_right());

  pedigree.reset_furthest_locations();

  assert.equal(pedigree.get_furthest_left(), 0);
  assert.equal(pedigree.get_furthest_right(), 0);
});

test("check_for_unplaced_people reports records missing screen coordinates", () => {
  const data = cloneFixture();
  data.people[fixture.proband].x = 10;
  data.people[fixture.proband].y = 15;
  data.people["10001-03-001"].x = -1;
  data.people["10001-03-001"].y = 15;
  data.people["10001-03-002"].x = 12;

  pedigree.set_data(data);

  const missingPeople = pedigree.check_for_unplaced_people();

  assert.ok(!missingPeople.includes(fixture.proband));
  assert.ok(missingPeople.includes("10001-03-001"));
  assert.ok(missingPeople.includes("10001-03-002"));
});