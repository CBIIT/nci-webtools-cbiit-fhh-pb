const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { before, test } = require("node:test");
const fa_config = require("../../config/FA.json");

let quadrants;
const quadrant_colors = {
  top_right: "blue",
  top_left: "red",
  bottom_left: "yellow",
  bottom_right: "purple",
};

before(async () => {
  quadrants = await import("./fhh_quadrants.js");
});

test("study configurations use consistent colors for quadrant positions", () => {
  const config_directory = join(__dirname, "../../config");
  const config_files = readdirSync(config_directory).filter((file) => file.endsWith(".json"));
  assert.ok(config_files.length > 0);

  for (const file of config_files) {
    const config = JSON.parse(readFileSync(join(config_directory, file), "utf8"));
    for (const [position, quadrant] of Object.entries(config.quadrants || {})) {
      assert.ok(Object.hasOwn(quadrant_colors, position), `${file}: unknown quadrant ${position}`);
      assert.equal(quadrant.color, quadrant_colors[position], `${file}: ${position}`);
    }
  }
});

test("Fanconi quadrant positions match the study specification", () => {
  assert.deepEqual(fa_config.quadrants, {
    top_right: { name: "Transplant", color: "blue" },
    top_left: { name: "Solid Tumors", color: "red" },
    bottom_left: { name: "Hematological Malignancy", color: "yellow" },
    bottom_right: { name: "FANS", color: "purple" },
  });
});

test("diagnoses and procedures use the same positional quadrant abbreviations", () => {
  const abbreviations = ["HCT", "TUMOR", "MDS", "FANS"];
  assert.deepEqual(quadrants.get_quadrant_abbreviations({ quad_abbrs: abbreviations }), abbreviations);
  assert.deepEqual(quadrants.get_quadrant_abbreviations({ quad_abbr: abbreviations }), abbreviations);
  assert.deepEqual(quadrants.get_procedure_quadrant_abbreviations({ quad_abbrs: abbreviations }), abbreviations);
  assert.deepEqual(quadrants.get_procedure_quadrant_abbreviations({ quad_abbr: abbreviations }), abbreviations);
  assert.deepEqual(quadrants.get_matching_quadrants(abbreviations, fa_config.quadrants), [
    { name: "Transplant", color: "blue" },
    { name: "Solid Tumors", color: "red" },
    { name: "Hematological Malignancy", color: "yellow" },
    { name: "FANS", color: "purple" },
  ]);
});

test("procedure quadrant metadata takes precedence over legacy abbreviation text", () => {
  assert.deepEqual(
    quadrants.get_procedure_quadrant_abbreviations({ quad_abbrs: ["", "TUMOR"], abbr: "HCT;;;" }),
    ["", "TUMOR"]
  );
  assert.deepEqual(
    quadrants.get_procedure_quadrant_abbreviations({ quad_abbrs: [], abbr: "HCT;;;" }),
    []
  );
});

test("procedure rendering supports the processor's preserved separators and null quadrants", () => {
  const transplant = { quad_abbrs: ["HCT", "", "", ""], abbr: "HCT;;;" };
  const plain = { quad_abbrs: null, abbr: "MRI, BRAIN" };

  assert.deepEqual(quadrants.get_person_quadrant_flags({ procedures: [transplant] }), [true, false, false, false]);
  assert.equal(quadrants.get_procedure_display_name(transplant), "HCT");
  assert.deepEqual(quadrants.get_person_quadrant_flags({ procedures: [plain] }), [false, false, false, false]);
  assert.equal(quadrants.get_procedure_display_name(plain), "MRI, BRAIN");
});

test("legacy positional procedure abbreviations are recognized without marking plain labels", () => {
  assert.deepEqual(
    quadrants.get_procedure_quadrant_abbreviations({ quad_abbrs: null, abbr: " HCT ; ; ; " }),
    ["HCT", "", "", ""]
  );
  assert.deepEqual(quadrants.get_procedure_quadrant_abbreviations({ abbr: "MRI, BRAIN" }), []);
  assert.deepEqual(quadrants.get_procedure_quadrant_abbreviations({ abbr: "HCT" }), []);
  assert.deepEqual(quadrants.get_procedure_quadrant_abbreviations({}), []);
});

test("matching quadrants ignore empty positions and unconfigured quadrants", () => {
  assert.deepEqual(
    quadrants.get_matching_quadrants(["HCT", "", "MDS", "FANS"], {
      top_right: { name: "Transplant", color: "blue" },
      bottom_left: {},
      bottom_right: { name: "FANS", color: "purple" },
    }),
    [{ name: "Transplant", color: "blue" }, { name: "FANS", color: "purple" }]
  );
});

test("person flags combine stored, diagnosis, and procedure quadrants", () => {
  const person = {
    quad_flags: [false, true, false, false],
    diseases: [{ quad_abbrs: ["", "", "MDS", ""] }],
    procedures: [{ quad_abbrs: ["HCT", "", "", "FANS"] }],
  };
  assert.deepEqual(quadrants.get_person_quadrant_flags(person), [true, true, true, true]);
  assert.deepEqual(person.quad_flags, [false, true, false, false]);
  assert.deepEqual(
    quadrants.get_person_quadrant_flags({ procedures: [{ abbr: "HCT;;;" }] }),
    [true, false, false, false]
  );
  assert.deepEqual(
    quadrants.get_person_quadrant_flags({ procedures: [{ abbr: "MRI, BRAIN" }] }),
    [false, false, false, false]
  );
});

test("removing a procedure clears only flags no longer supported by another entry", () => {
  const removed = { quad_abbrs: ["HCT", "", "", "FANS"] };
  const person = {
    quad_flags: [true, true, true, true],
    diseases: [{ quad_abbrs: ["", "", "", "FANS"] }],
    procedures: [{ quad_abbrs: ["", "", "MDS", ""] }],
  };
  quadrants.remove_procedure_quadrant_flags(person, removed);
  assert.deepEqual(person.quad_flags, [false, true, true, true]);
  assert.deepEqual(quadrants.get_person_quadrant_flags(person), [false, true, true, true]);
});

test("procedure headings remove positional separators without changing plain labels", () => {
  assert.equal(quadrants.get_procedure_display_name({ abbr: "HCT;;;" }), "HCT");
  assert.equal(quadrants.get_procedure_display_name({ abbr: "; one ;; two " }), "one;two");
  assert.equal(quadrants.get_procedure_display_name({ abbr: "MRI, BRAIN" }), "MRI, BRAIN");
  assert.equal(quadrants.get_procedure_display_name({ abbr: ";;;", description: "Procedure" }), "Procedure");
});
