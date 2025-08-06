
var family_tree = [];

var data = {};
var furthest_right = 0;
var furthest_left = 0;
//var gen = 1;


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
  console.log( (get_youngest_generation()-1) + "<->" + (get_oldest_generation()-1) + ":" + generation_count );
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


function find_all_children_from_both_parents(person_id, partner_id, direction) {
  let children = [];
  for (const candidate_id in data["people"]) {
    const candidate = data["people"][candidate_id];
    if (candidate.father == person_id && candidate.mother == partner_id) add_unique(children, candidate_id);
    if (candidate.mother == person_id && candidate.father == partner_id) add_unique(children, candidate_id);
    if (candidate.father == person_id && partner_id == "UNKNOWN" && candidate.mother == null) add_unique(children, candidate_id);
    if (candidate.mother == person_id && partner_id == "UNKNOWN" && candidate.father == null) add_unique(children, candidate_id);

  }
  return children;
}

function find_all_children_from_a_parent(person_id) {
  if (!person_id) return null;
  let children = [];
  for (const candidate_id in data["people"]) {
    const candidate = data["people"][candidate_id];
    if (candidate.father == person_id ) add_unique(children, candidate_id);
    if (candidate.mother == person_id ) add_unique(children, candidate_id);
  }
  return children;
}

function add_unique(array, value) {
  if (!array.includes(value)) array.push(value);
}

export function find_all_partners(person_id) {
  if (!person_id) return [];
  let partners = [];

  let children = find_all_children(person_id);

  for (const i in children) {
    const child_id = children[i];
    const father_id = data['people'][child_id]['father'];
    const mother_id = data['people'][child_id]['mother'];
    if (father_id && father_id != person_id && !partners.includes(father_id)) add_unique(partners,father_id);
    if (mother_id && mother_id != person_id && !partners.includes(mother_id)) add_unique(partners,mother_id);

    const gen = data["people"][person_id].gen;
    if (!mother_id) {
      const placeholder_id = create_placeholder_partner(person_id, gen, "unknown", "mother");
      data["people"][child_id].mother = placeholder_id;
    }
    if (!father_id) {
      const placeholder_id = create_placeholder_partner(person_id, gen, "unknown", "father");
      data["people"][child_id].father = placeholder_id;
    }
//    if (!mother_id) add_unique(partners, "UNKNOWN");
//    if (!father_id) add_unique(partners, "UNKNOWN");
  }
  return partners;
}


///////////////////////////////////////

export function  build_entire_family_tree (proband_id) {
  console.log(furthest_left);
  family_tree = [];

  organize_parents(proband_id, 0, "proband");

  console.log(family_tree);
  console.log (data);

  set_locations(family_tree);

  return family_tree;
}

function organize_parents(person_id, gen, side) {
  if (person_id == null || person_id == "") return;
  let person = data["people"][person_id];

  organize_children(person_id, gen + 1, side);

  let mother_id = person.mother;
  let father_id = person.father;
  if (mother_id || father_id) {
    if (!mother_id) {
      create_placeholder_parent(person_id, gen, side, "mother");
    }
    if (!father_id) {
      create_placeholder_parent(person_id, gen, side, "father");
    }

    if (side == "proband") {
      organize_parents(person.mother, gen - 1, "maternal");
      organize_parents(person.father, gen - 1, "paternal");
    } else {
      organize_parents(person.mother, gen - 1, side);
      organize_parents(person.father, gen - 1, side);
    }
  } else {
    // DO nothing
  }

  place_person(person_id, gen, side);

}

function create_placeholder_parent(person_id, gen, side, role) {
  let person = {};
  person.placeholder = true;
  person.demographics = {};
  if (role == "mother") {
    person.demographics.gender = "Female";
    person.name = "Mother of " + person_id;
    person.id = "m_" + person_id;
  } else {
    person.demographics.gender = "Male";
    person.name = "Father of " + person_id;
    person.id = "f_" + person_id;
  }
  place_person(person_id, gen - 1, side)
}

function create_placeholder_partner(person_id, gen, side, role) {
  let person = {};
  person.placeholder = true;
  person.gen = gen;
  person.demographics = {};
  if (role == "mother") {
    person.demographics.gender = "Female";
    person.name = "Mother of " + person_id;
    person.id = "m_" + person_id;
  } else {
    person.demographics.gender = "Male";
    person.name = "Father of " + person_id;
    person.id = "f_" + person_id;
  }
  console.log ("Ready to place person: " + person.id + "," + gen + "," + side);
  data["people"][person.id] = person;
  place_person(person.id, gen, side)

  return person.id;
}

function organize_children(person_id, gen, side) {
  if (family_tree.includes(person_id)) return;
  let children = find_all_children_from_a_parent(person_id);

  for (const i in children) {
    let child_id = children[i];
    // We have to handle cases where there are unknown or unrelated people in tree_is_complete
    const childs_mother = data["people"][child_id].mother;
    const childs_father = data["people"][child_id].father;
    organize_children(child_id, gen + 1, side);
  }
  place_person(person_id, gen, side);

  let partners = find_all_partners(person_id);
  if (partners[0] == "UNKNOWN") console.log ("UNKNOWN:" + person_id);
  for (const i in partners) {
    const partner_id = partners[i];
    organize_children(partner_id, gen , side);
    place_person(partner_id, gen, side);
  }

  return;
}

function place_person(person_id, gen, side) {
  if (!person_id || person_id == "UNKNOWN" || !data["people"][person_id]) return;
  if (!family_tree.includes(person_id)) {

    data["people"][person_id].gen = gen;
    data["people"][person_id].side = side;
    data["people"][person_id].id = person_id;
    family_tree.push(person_id);
  }
}

function set_locations(list) {
  let oldest_gen = get_oldest_generation();
  let youngest_gen = get_youngest_generation();


  for (const i in list) {
    const person_id = list[i];
    console.log("Placing: " + person_id);

    const partners = find_all_partners(person_id);
    if (partners && partners.length > 1) {
      find_location_of_multiple_partners(person_id);
    } else {
      const midpoint = get_midpoint_of_children(person_id);
      if (midpoint == null) {
        const side = data["people"][person_id].side;
        if (side == "maternal" || side == "proband") {
          furthest_left-=2;
          data["people"][person_id].loc = furthest_left;
        } else {
          furthest_right+=2;
          data["people"][person_id].loc = furthest_right;
        }
      } else {
        if (data["people"][person_id].demographics.gender == "Female") data["people"][person_id].loc = midpoint - 1;
        else data["people"][person_id].loc = midpoint;
      }
    }
  }
}

function find_location_of_multiple_partners(person_id) {
  const partners = find_all_partners(person_id);
  for (const p in partners) {
    const partner_id = partners[p];
    const midpoint = get_midpoint_of_children_from_both_parents(person_id, partner_id);
    if (!data["people"][partner_id]) return;
    console.log ("PLACING(P): " + person_id + ":" + midpoint);

    if (data["people"][person_id].demographics.gender == "Female") {
      data["people"][person_id].loc = midpoint - 1;
      data["people"][partner_id].loc = midpoint;
    } else {
      data["people"][person_id].loc = midpoint;
      data["people"][partner_id].loc = midpoint - 1;
    }
  }
}

function get_midpoint_of_children(person_id) {
  const children = find_all_children(person_id);
  if (!children || children.length == 0) return null;

  let first_child = children[0];
  let last_child = children[children.length-1];

  let min = data["people"][first_child].loc;
  let max = data["people"][last_child].loc;

  return Math.round((max + min) / 2);
}

function get_midpoint_of_children_from_both_parents(person_id, partner_id) {
  const children = find_all_children_from_both_parents(person_id, partner_id);
  if (!children || children.length == 0) return null;

  let first_child = children[0];
  let last_child = children[children.length-1];

  let min = data["people"][first_child].loc;
  let max = data["people"][last_child].loc;

  return Math.round((max + min) / 2);
}

/////////////

export function check_for_unplaced_people() {
  let missing_people = [];

  for (const person_id in data["people"]) {
    const person = data["people"][person_id];

    if (!person.x || person.x < 0) { missing_people.push(person_id); console.log(person_id);}
    else if (!person.y || person.u < 0) { missing_people.push(person_id); console.log(person_id);}
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
        console.log("Found overlap");
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
