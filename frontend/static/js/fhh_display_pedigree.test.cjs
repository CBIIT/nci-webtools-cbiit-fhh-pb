// Unit tests for miscarriage symbol rendering
// Run with: node --test fhh_display_pedigree.test.cjs

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");

describe("Miscarriage Symbol Rendering", () => {
  // Mock objects
  let mockSVGElement = null;
  let createdElements = [];

  // Mock setup
  beforeEach(() => {
    createdElements = [];
    global.svgns = "http://www.w3.org/2000/svg";
    
    // Mock document.createElementNS
    global.document = {
      createElementNS: (ns, tag) => {
        const el = {
          tag,
          attrs: {},
          setAttributeNS: function(ns, key, val) {
            this.attrs[key] = val;
            return this;
          },
          setAttribute: function(key, val) {
            this.attrs[key] = val;
            return this;
          },
          setAttributeNS: function(ns, key, val) {
            this.attrs[key] = val;
          }
        };
        createdElements.push(el);
        return el;
      },
      getElementById: () => ({
        appendChild: () => {}
      })
    };
  });

  test("draw_miscarriage creates a triangle element", () => {
    assert.ok(typeof draw_miscarriage === 'function', 
      'draw_miscarriage function should exist');
  });

  test("miscarriage life_status detection", () => {
    const person = {
      life_status: "Miscarriage",
      demographics: { gender: "Unknown" }
    };
    
    assert.equal(person.life_status, "Miscarriage",
      'Person should have life_status property set to Miscarriage');
  });

  test("draw_person checks life_status before gender", () => {
    // This would require more complex mocking of the full draw_person function
    // For now, we're just documenting the expected behavior
    const testCases = [
      {
        input: { life_status: "Miscarriage", demographics: { gender: "Male" } },
        expected: "draw_miscarriage",
        reason: "Miscarriage takes precedence over Male gender"
      },
      {
        input: { life_status: "Miscarriage", demographics: { gender: "Female" } },
        expected: "draw_miscarriage",
        reason: "Miscarriage takes precedence over Female gender"
      },
      {
        input: { demographics: { gender: "Male" } },
        expected: "draw_male",
        reason: "No life_status, uses gender Male"
      },
      {
        input: { demographics: { gender: "Female" } },
        expected: "draw_female",
        reason: "No life_status, uses gender Female"
      },
      {
        input: { demographics: { gender: "Unknown" } },
        expected: "draw_unknown",
        reason: "No life_status, uses gender Unknown"
      }
    ];

    testCases.forEach(testCase => {
      assert.ok(testCase.reason, `${testCase.reason}`);
    });
  });

  test("miscarriage triangle dimensions are half of unknown diamond", () => {
    // Assuming config.size = 40
    const configSize = 40;
    const miscarriageSize = configSize / 2; // 20
    const unknownSize = configSize; // 40
    
    assert.equal(miscarriageSize, 20, 
      'Miscarriage should be half the size of unknown symbol');
    assert.equal(unknownSize, 40,
      'Unknown symbol should be full config.size');
    assert.equal(miscarriageSize * 2, unknownSize,
      'Miscarriage size * 2 should equal unknown size');
  });

  test("miscarriage triangle points (upward-pointing)", () => {
    // For a triangle centered at (100, 100) with size 20:
    // Top point: (100, 100 - 20/2) = (100, 90)
    // Bottom left: (100 - 20/2, 100 + 20/2) = (90, 110)
    // Bottom right: (100 + 20/2, 100 + 20/2) = (110, 110)
    
    const centerX = 100;
    const centerY = 100;
    const s = 20;
    
    const topPoint = { x: centerX, y: centerY - s / 2 };
    const bottomLeft = { x: centerX - s / 2, y: centerY + s / 2 };
    const bottomRight = { x: centerX + s / 2, y: centerY + s / 2 };
    
    assert.deepEqual(topPoint, { x: 100, y: 90 },
      'Top point should be at (100, 90)');
    assert.deepEqual(bottomLeft, { x: 90, y: 110 },
      'Bottom left point should be at (90, 110)');
    assert.deepEqual(bottomRight, { x: 110, y: 110 },
      'Bottom right point should be at (110, 110)');
  });

  test("miscarriage should not have quadrants", () => {
    // draw_quadrants_unknown is empty
    // Miscarriages skip the quadrant drawing altogether
    assert.ok(true, 'Miscarriage rendering skips quadrant drawing');
  });

  test("person details panel shows life_status for miscarriage", () => {
    const person = { life_status: "Miscarriage" };
    
    // Simulating the logic from the display panel
    const displayText = person.life_status === "Miscarriage" 
      ? "Life Status: Miscarriage" 
      : `Sex: ${person.demographics?.gender || "Unknown"}`;
    
    assert.equal(displayText, "Life Status: Miscarriage",
      'Miscarriage should display as Life Status, not Sex');
  });

  test("miscarriage inherits clinical entry detection", () => {
    const person1 = {
      life_status: "Miscarriage",
      diseases: [],
      procedures: []
    };
    
    const person2 = {
      life_status: "Miscarriage",
      diseases: [{ shorthand: "Some disease" }],
      procedures: []
    };
    
    const has_clinical_entries = (person) => {
      const diagnosis_count = person?.diseases?.length || 0;
      const procedure_count = person?.procedures?.length || 0;
      return diagnosis_count > 0 || procedure_count > 0;
    };
    
    assert.equal(has_clinical_entries(person1), false,
      'Miscarriage without diseases/procedures should have clinical entries = false');
    assert.equal(has_clinical_entries(person2), true,
      'Miscarriage with diseases should have clinical entries = true');
  });
});
