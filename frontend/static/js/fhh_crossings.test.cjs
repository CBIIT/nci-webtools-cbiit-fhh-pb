const assert = require("node:assert/strict");
const { before, test } = require("node:test");

const fixture = require("./fhh_pedigree.test.json");

let crossings;
let pedigree;

before(async () => {
  crossings = await import("./fhh_crossings.js");
  pedigree = await import("./fhh_build_pedigree.js");
});

const bar_y = (parents_y, child_ys) => Math.max(Math.min(parents_y + 100, ...child_ys.map((y) => y - 50)), parents_y + 12.5);

function laid_out(data) {
  const original_log = console.log;
  console.log = () => {};
  try {
    pedigree.set_data(data);
    pedigree.build_entire_family_tree(data.proband);
  } finally {
    console.log = original_log;
  }
  for (const person of Object.values(data.people)) {
    if (person.loc != null) {
      person.x = person.loc * 120;
      person.y = person.gen * 200;
    }
  }
  return data.people;
}

test("segments_cross ignores shared endpoints but catches T-junctions and overlaps", () => {
  const seg = (a, b) => ({ a, b });
  assert.equal(crossings.segments_cross(seg([0, 0], [10, 0]), seg([10, 0], [10, 10])), false);
  assert.equal(crossings.segments_cross(seg([0, 0], [10, 0]), seg([5, 0], [5, 10])), true);
  assert.equal(crossings.segments_cross(seg([0, 0], [10, 0]), seg([5, 0], [15, 0])), true);
  assert.equal(crossings.segments_cross(seg([0, 0], [10, 10]), seg([0, 10], [10, 0])), true);
});

test("the automatic layout of the sample family has no line problems", () => {
  const people = laid_out(JSON.parse(JSON.stringify(fixture)));
  const problems = crossings.find_layout_problems(people, 50, bar_y);

  assert.equal(problems.crossings.length, 0);
  assert.equal(problems.hits.length, 0);
});

test("moving a child under another family is reported", () => {
  const people = laid_out(JSON.parse(JSON.stringify(fixture)));
  const child = people["10001-03-008"];
  const other_child = people["10001-03-001"];
  child.x = other_child.x + 30;

  const problems = crossings.find_layout_problems(people, 50, bar_y);
  assert.ok(problems.crossings.length + problems.hits.length > 0);
});
