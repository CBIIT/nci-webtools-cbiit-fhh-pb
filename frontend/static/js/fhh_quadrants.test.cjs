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

test("procedure headings use the description when an abbreviation is absent or blank", () => {
  for (const abbr of [undefined, null, "", "   ", " ; ; "]) {
    assert.equal(
      quadrants.get_procedure_display_name({ abbr, code: "8891", description: "MRI Brain" }),
      "MRI Brain"
    );
  }
  assert.equal(
    quadrants.get_procedure_display_name({ abbr: "HCT;;;", code: "4100", description: "Bone marrow transplant" }),
    "HCT"
  );
});

test("procedure headings use legacy shorthand as the description instead of the code", () => {
  assert.equal(
    quadrants.get_procedure_display_name({ code: "8741", shorthand: "CT Scan Chest" }),
    "CT Scan Chest"
  );
  assert.equal(
    quadrants.get_procedure_display_name({ code: "8741", description: "  ", shorthand: "CT Scan Chest" }),
    "CT Scan Chest"
  );
  assert.equal(
    quadrants.get_procedure_display_name({ code: "8741", description: "Description", shorthand: "Legacy" }),
    "Description"
  );
  assert.equal(
    quadrants.get_procedure_display_name({ code: "8741", description: "NOTITLE", shorthand: "CT Scan Chest" }),
    "CT Scan Chest"
  );
});

test("procedure headings do not fall back to a code when no description is available", () => {
  assert.equal(quadrants.get_procedure_display_name({ code: "8741" }), "Procedure");
  assert.equal(quadrants.get_procedure_display_name({ abbr: ";;;", code: "8741" }), "Procedure");
  assert.equal(quadrants.get_procedure_display_name({ code: "8741", description: "NOTITLE" }), "Procedure");
});

test("diagnosis titles prefer abbreviations and never fall back to codes", () => {
  assert.equal(quadrants.get_diagnosis_display_name({ abbr: " BC ", code: "C50" }, true), "BC");
  assert.equal(quadrants.get_diagnosis_display_name({ abbr: "AML;;MDS" }, true), "AML;MDS");
  assert.equal(
    quadrants.get_diagnosis_display_name({ abbr: "  ", code: "D61.0", description: "Fanconi anemia" }, false),
    "Fanconi anemia"
  );
  assert.equal(
    quadrants.get_diagnosis_display_name({ code: "D61.0", description: " ", shorthand: "Legacy FA" }, false),
    "Legacy FA"
  );
  assert.equal(
    quadrants.get_diagnosis_display_name({ code: "D61.0", description: "NOTITLE" }, false),
    "Diagnosis"
  );
  assert.equal(quadrants.get_diagnosis_display_name({ code: "D61.0" }, false), "Diagnosis");
});

test("cancer diagnosis titles fall back to topography and morphology", () => {
  assert.equal(
    quadrants.get_diagnosis_display_name({ code: "C50", topography: "Breast", morphology: "Ductal carcinoma" }, true),
    "Breast:Ductal carcinoma"
  );
  assert.equal(
    quadrants.get_diagnosis_display_name({ code: "C50", morphology: "Ductal carcinoma" }, true),
    "Ductal carcinoma"
  );
  assert.equal(
    quadrants.get_diagnosis_display_name({ code: "C50", shorthand: "Breast cancer" }, true),
    "Breast cancer"
  );
  assert.equal(
    quadrants.get_diagnosis_display_name({ code: "C50", topography: "NOTITLE", description: "Breast cancer" }, true),
    "Breast cancer"
  );
  assert.equal(quadrants.get_diagnosis_display_name({ code: "C50" }, true), "Diagnosis");
});

test("diagnosis details retain legacy codes and current cancer coding", () => {
  assert.deepEqual(
    quadrants.get_diagnosis_code_rows({ code: "C34.9", description: "Lung cancer" }, true),
    [["Code", "C34.9"]]
  );
  assert.deepEqual(
    quadrants.get_diagnosis_code_rows({ coding: "C34.9:8500/3" }, true),
    [["Coding", "C34.9:8500/3"]]
  );
  assert.deepEqual(
    quadrants.get_diagnosis_code_rows({ code: "C34.9", coding: "C50.9:8500/3" }, true),
    [["Coding", "C50.9:8500/3"], ["Code", "C34.9"]]
  );
  assert.deepEqual(
    quadrants.get_diagnosis_code_rows({ code: "C34.9", coding: "C34.9" }, true),
    [["Coding", "C34.9"]]
  );
  assert.deepEqual(
    quadrants.get_diagnosis_code_rows({ code: "D6109" }, false),
    [["Code", "D6109"]]
  );
  assert.deepEqual(quadrants.get_diagnosis_code_rows({}, true), []);
});
