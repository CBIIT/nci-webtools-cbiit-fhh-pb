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
  pedigree.set_data(cloneFixture());
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
  assert.equal(data.people[fixture.proband].gen, 1);
  assert.equal(data.people["10001-04-021"].gen, -1);
  assert.equal(pedigree.get_oldest_generation(), -1);
  assert.equal(pedigree.get_youngest_generation(), 2);
  assert.equal(pedigree.get_generation_count(), 4);
});

test("build_entire_family_tree assigns locations without overlaps on the sample fixture", () => {
  const tree = runSilently(() => pedigree.build_entire_family_tree(fixture.proband));
  const data = pedigree.get_data();

  assert.equal(Object.keys(pedigree.check_for_overlaps(tree)).length, 0);
  assert.notEqual(data.people[fixture.proband].loc, undefined);
  assert.ok(pedigree.get_furthest_left() < 0);
  assert.equal(pedigree.get_furthest_right(), 0);
});

test("reset_furthest_locations clears placement bounds", () => {
  runSilently(() => pedigree.build_entire_family_tree(fixture.proband));

  assert.ok(pedigree.get_furthest_left() < 0);

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