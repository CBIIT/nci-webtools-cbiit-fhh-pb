const assert = require("node:assert/strict");
const { before, test } = require("node:test");

let adoption;

before(async () => {
  adoption = await import("./fhh_adoption.js");
});

test("adopted-in uses brackets and a dotted child connector", () => {
  assert.deepEqual(adoption.adoption_notation("Yes-Adopted in"), {
    bracket: true,
    connector: "dotted",
    question: false,
  });
});

test("adopted-out uses brackets and a solid child connector", () => {
  assert.deepEqual(adoption.adoption_notation("Yes-Adopted out"), {
    bracket: true,
    connector: "solid",
    question: false,
  });
});

test("confirmed adoption with unknown direction uses brackets and a question mark", () => {
  for (const value of ["Yes", "Yes (QC)"]) {
    assert.deepEqual(adoption.adoption_notation(value), {
      bracket: true,
      connector: "solid",
      question: true,
    });
  }
});

test("unknown adoption status uses brackets and a question mark", () => {
  assert.deepEqual(adoption.adoption_notation("Don't Know"), {
    bracket: true,
    connector: "solid",
    question: true,
  });
});

test("non-adoption values leave the pedigree unchanged", () => {
  for (const value of ["", "No", "Unrecognized"]) {
    assert.deepEqual(adoption.adoption_notation(value), {
      bracket: false,
      connector: "solid",
      question: false,
    });
  }
});

test("question marks are centered on an existing child connector", () => {
  assert.deepEqual(
    adoption.adoption_question_position(
      { x: 100, y: 200 },
      40,
      false,
      { x1: 100, y1: 120, x2: 100, y2: 200 }
    ),
    { x: 100, y: 160 }
  );
});

test("question marks sit beside a symbol when its parent connector is missing", () => {
  assert.deepEqual(
    adoption.adoption_question_position({ x: 100, y: 200 }, 40, false, null),
    { x: 126, y: 200 }
  );
  assert.deepEqual(
    adoption.adoption_question_position({ x: 100, y: 200 }, 50, true, null),
    { x: 145, y: 200 }
  );
});

test("brackets enclose the symbol with six line segments", () => {
  assert.deepEqual(adoption.adoption_bracket_segments({ x: 100, y: 200 }, 50), [
    [63, 163, 63, 227],
    [63, 163, 71, 163],
    [63, 227, 71, 227],
    [137, 163, 137, 227],
    [129, 163, 137, 163],
    [129, 227, 137, 227],
  ]);
});

test("bracket hooks clear square outlines at different symbol sizes", () => {
  const center = { x: 100, y: 200 };
  for (const size of [20, 40, 50, 80, 120]) {
    const segments = adoption.adoption_bracket_segments(center, size);
    const square_left = center.x - size / 2;
    const square_right = center.x + size / 2;
    const square_bottom = center.y + size / 2;

    assert.ok(segments[2][2] <= square_left - 3);
    assert.ok(segments[5][0] >= square_right + 3);
    assert.ok(segments[2][1] > square_bottom);
    assert.ok(segments[2][1] <= square_bottom + 3);
  }
});

test("question marks beside a symbol clear its brackets", () => {
  const center = { x: 100, y: 200 };
  for (const size of [20, 40, 50, 80, 120]) {
    const right_bracket = adoption.adoption_bracket_segments(center, size)[3][0];
    const position = adoption.adoption_question_position(center, size, true, null);
    assert.ok(position.x >= right_bracket + 8);
  }
});
