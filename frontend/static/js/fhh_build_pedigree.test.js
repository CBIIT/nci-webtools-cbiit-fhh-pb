import {  set_data, determine_age, find_children, find_all_partners, find_children_from_both_parents,
          find_all_parents_of_list, build_family_tree_with_ancestors, build_entire_family_tree,
          expand_one_generation_to_include_partners, expand_next_generation_to_include_all_children,
          determine_sex, find_orphaned_people, place_orphaned_people, find_in_tree,
          find_first_in_generation, find_last_in_generation, set_all_locations,
          find_parent_of_male_in_couple, find_parent_of_female_in_couple
       } from './fhh_build_pedigree';

import d from './fhh_pedigree.test.json';

// This loads the sample data we will use for the tests
beforeAll(() => {
  set_data(d);
});

// Testing the determine_age function
// Do we need to test these types of functions?
// If so, how do we handle the age changing over time
test('Test determine age by birthdate', () => {
  const proband = d["proband"];

  const age = determine_age("10001-01-001");
  expect(age).toBe(56);
});


// Testing the find_children function
test('Test that the FindChildren function works for the example proband', () => {
  const proband = d["proband"];

  const children = find_children(d["proband"]);
  expect(children).toContain("10001-03-001"); // First Daughter is proband child
  expect(children).toContain("10001-03-002"); // Second Daughter is proband child
  expect(children).toContain("10001-03-003"); // First Son is not proband child
});

test("Test that the children of the proband's parents includes the proband as a child", () => {
  const proband = d["proband"];
  const father = d["people"][proband]["father"];
  const mother = d["people"][proband]["mother"];


  const fathers_children = find_children(father);
  expect(fathers_children).toContain(proband);

  const mothers_children = find_children(mother);
  expect(mothers_children).toContain(proband);
});

test("Test that we can find all partners of the proband", () => {
  const proband = d["proband"];
  const partners = find_all_partners(proband);
//  expect(partners).toContain("10001-01-002"); // First partner of Proband
//  expect(partners).toContain("10001-01-003"); // Second partner of Proband

});

test("Test that we can find children of both parents without using the exception", () => {
  const children = find_children_from_both_parents("10001-01-001", "10001-01-002");

  expect(children).toContain("10001-03-001"); // Daughter with first partner
  expect(children).toContain("10001-03-002"); // Daughter with first partner
  expect(children).not.toContain("10001-03-003"); // Son with other partner should not be there

  // Now try the other partner
  const children_from_different_mom = find_children_from_both_parents("10001-01-001", "10001-01-003");
  expect(children_from_different_mom).not.toContain("10001-03-001"); // Daughter with first partner
  expect(children_from_different_mom).not.toContain("10001-03-002"); // Daughter with first partner
  expect(children_from_different_mom).toContain("10001-03-003"); // Son with other partner should not be there


});

test("Test that we can find children of both parents with the exception (Full Siblings)", () => {
  const children = find_children_from_both_parents("10001-01-001", "10001-01-002", "10001-03-001");

  expect(children).not.toContain("10001-03-001"); // Daughter with first partner
  expect(children).toContain("10001-03-002"); // Daughter with first partner
  expect(children).not.toContain("10001-03-003"); // Son with other partner should not be there
});

test("Test that we can find all the parents of a list of people (proband only)", () => {

  const list = [{"father":"10001-01-001"}];

  const parents_list = find_all_parents_of_list(list);
//  console.log(parents_list);


  expect(parents_list[0].father).toContain("10001-02-001"); // Father
  expect(parents_list[0].mother).toContain("10001-02-002"); // Mother
});

test("Test that we can find all the parents of a list of people (all parents of all of probands children)", () => {
  const list = [{"father": "10001-03-001"}, {"father": "10001-03-002"}, {"father": "10001-03-003"}];

  const parents_list = find_all_parents_of_list(list);
//  console.log(parents_list);

  expect(parents_list[0].father).toContain("10001-01-001"); // Father
  expect(parents_list[0].mother).toContain("10001-01-002"); // Mother of daughters
  expect(parents_list[1].father).toContain("10001-01-001"); // Mother of daughters
  expect(parents_list[1].mother).toContain("10001-01-003"); // Mother of son (different mother)
});

test("Test see if we can find all grandparents", () => {
  const list = [{"father":"10001-01-001"}];

  const parents_list = find_all_parents_of_list(list);
  const grandparents_list = find_all_parents_of_list(parents_list);
//  console.log(grandparents_list);

  expect(grandparents_list[0].father).toContain("10001-04-003"); // Maternal Grandfather
  expect(grandparents_list[0].mother).toContain("10001-04-004");
  expect(grandparents_list[1].father).toContain("10001-04-001");
  expect(grandparents_list[1].mother).toContain("10001-04-002");
});

test("Test see if we can find all great-grandparents", () => {
  const list = [{"father":"10001-01-001"}];

  const parents_list = find_all_parents_of_list(list);
  const grandparents_list = find_all_parents_of_list(parents_list);
  const great_grandparents_list = find_all_parents_of_list(grandparents_list);

//  console.log(great_grandparents_list);

  expect(great_grandparents_list[0].father).toContain("10001-06-007");
  expect(great_grandparents_list[0].mother).toContain("10001-06-008");
  expect(great_grandparents_list[1].father).toContain("10001-06-005");
  expect(great_grandparents_list[1].mother).toContain("10001-06-006");
  expect(great_grandparents_list[2].father).toContain("10001-06-003");
  expect(great_grandparents_list[2].mother).toContain("10001-06-004");
  expect(great_grandparents_list[3].father).toContain("10001-06-001");
  expect(great_grandparents_list[3].mother).toContain("10001-06-002");
});

test("Test see if we can find all great-great-grandparents", () => {
  const list = [{"father":"10001-01-001"}];

  const parents_list = find_all_parents_of_list(list);
  const grandparents_list = find_all_parents_of_list(parents_list);
  const great_grandparents_list = find_all_parents_of_list(grandparents_list);
  const great_great_grandparents_list = find_all_parents_of_list(great_grandparents_list);

//  console.log(great_grandparents_list);

  expect(great_great_grandparents_list[0].father).toContain("10001-08-003");
  expect(great_great_grandparents_list[0].mother).toContain("10001-08-004");
  expect(great_great_grandparents_list[1].father).toContain("10001-08-001");
  expect(great_great_grandparents_list[1].mother).toContain("10001-08-002");
});

test("Test see if we build a family tree of ancestors", () => {
  const family_tree = build_family_tree_with_ancestors();
  console.log(family_tree);

  expect(family_tree[0][0].father).toContain("10001-08-003");
  expect(family_tree[1][0].father).toContain("10001-06-007");
  expect(family_tree[2][0].father).toContain("10001-04-003");
  expect(family_tree[3][0].father).toContain("10001-02-001");
  expect(family_tree[4][0].father).toContain("10001-01-001");

});

test("Test check that determine_sex function works correctly", () => {

  expect(determine_sex("10001-02-001")).toBe("Male");
  expect(determine_sex("10001-02-002")).toBe("Female");

});

test("Test expand_one_generation_to_include_partners", () => {
  const family_tree = build_family_tree_with_ancestors();

//  console.log(family_tree[0]);
  let generation = expand_one_generation_to_include_partners(family_tree[0]);
  console.log(generation);
  expect(generation[0].mother).toContain("UNKNOWN");  // The first Mother is not in the pedigree, only the father
  expect(generation[1].mother).toContain("10001-08-004");
  expect(generation[2].mother).toContain("10001-08-005");
  expect(generation[3].mother).toContain("10001-08-002");
  expect(generation[4].mother).toContain("10001-08-002");
  expect(generation[0].father).toContain("10001-08-003");
  expect(generation[1].father).toContain("10001-08-003");
  expect(generation[2].father).toContain("10001-08-001");
  expect(generation[3].father).toContain("10001-08-001");
  expect(generation[4].father).toContain("10001-08-006");
});

test("Test expand_next_generation_to_include_all_children", () => {
  const family_tree = build_family_tree_with_ancestors();
//  console.log(family_tree[0]);
  family_tree[0] = expand_one_generation_to_include_partners(family_tree[0]);
  console.log(family_tree[0]);
  console.log(family_tree[1]);
  let next_generation = expand_next_generation_to_include_all_children(family_tree[0], family_tree[1]);
  console.log(next_generation);
  const final_look = expand_one_generation_to_include_partners(next_generation);
  console.log(final_look);

  expect(next_generation[0].mother).toContain("10001-06-008");
  expect(next_generation[1].mother).toContain("10001-06-006");
  expect(next_generation[2].mother).toContain("10001-06-004");
  expect(next_generation[3].mother).toContain("10001-06-012");
  expect(next_generation[4].mother).toContain("10001-06-002");
  expect(next_generation[5].mother).toContain("10001-06-010");  // This Person was added as sibling of 002
  expect(next_generation[6].mother).toBeUndefined();  // This is a male
  expect(next_generation[0].father).toContain("10001-06-007");
  expect(next_generation[1].father).toContain("10001-06-005");
  expect(next_generation[2].father).toContain("10001-06-003");
  expect(next_generation[3].father).toBeUndefined();  // This is a female
  expect(next_generation[4].father).toContain("10001-06-001");
  expect(next_generation[5].father).toBeUndefined();  // The is a Female
  expect(next_generation[6].father).toContain("10001-06-011");  // The last uncle is related to 001

});

test("Test build_entire_family_tree", () => {
  const family_tree = build_entire_family_tree();
  console.log(family_tree);

});
/*
test("Test find_orphaned_people", () => {
  const orphaned_list = find_orphaned_people();
  console.log(orphaned_list);
});

test("Test place_orphaned_people", () => {
  place_orphaned_people();
});

test("Test find_in_tree", () => {
  const family_tree = build_family_tree_with_ancestors();

  find_in_tree("10001-06-007", family_tree);

});
*/
test("Test find_in_generation", () => {
  const family_tree = build_entire_family_tree();
  const first = find_first_in_generation("10001-01-001", family_tree[4]);
  const last = find_last_in_generation("10001-01-001", family_tree[4]);
  const invalid = find_last_in_generation("BOO", family_tree[4]);
  console.log (family_tree[4]);
  console.log (first + ":" + last);
  console.log (invalid);
  expect(first).toBe(0);
  expect(last).toBe(2);
  expect(invalid).toBeNull();
});

test("Test set_all_locations", () => {
  const family_tree = build_entire_family_tree();
  set_all_locations(family_tree);
  console.log(family_tree);

});

test("Test find_parent_of_couple", () => {
  const family_tree = build_entire_family_tree();
  set_all_locations(family_tree);
  console.log(family_tree);
  const girl_couple = family_tree[5][0];
  console.log (girl_couple);
  let girls_parent = find_parent_of_female_in_couple(girl_couple, family_tree);
  console.log (girls_parent);
  const boy_couple = family_tree[5][3];
  const boys_parent = find_parent_of_male_in_couple(boy_couple, family_tree);
  console.log (boys_parent);
});
