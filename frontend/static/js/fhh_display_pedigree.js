import {
  build_entire_family_tree,
  set_data,
  get_data,
  get_furthest_left,
  get_furthest_right,
  get_generation_count,
  get_youngest_generation,
  get_oldest_generation,
  check_for_overlaps,
  check_for_unplaced_people,
  reset_furthest_locations,
  find_all_children
} from "./fhh_build_pedigree.js";

import {
  load_initial_config,
  check_for_families,
  load_families_into_select,
  load_config_and_data,
  save_positions_and_annotations,
  check_for_studies,    
} from "./fhh_load.js";

import {
  addSvgListeners,
  start_free_move,
  start_slide_move,
} from "./fhh_move.js";

const svgns = "http://www.w3.org/2000/svg";
var config;
var data;
var annotations;
var study_name;

let family_tree = [];
let people_drawn = [];

let increment = 0;

const debug_offset = { x: 5000, y: 400 };
var center_offset = {};

export function get_config() {
  return config;
}


let study_select = document.getElementById("study_select");
study_select.addEventListener("change", function (event) {
  // Code to be executed when the value changes
  const study_id = event.target.value;
  console.log("Selected study ID:", study_id);
  check_for_families(study_id);

});

let family_select = document.getElementById("families_select");
family_select.addEventListener("change", function (event) {
  // Code to be executed when the value changes
  if (!study_name) study_name = "lfss";
  
  const promise = load_config_and_data(event.target.value, study_name);
  promise.then(([d, a, c]) => {
    data = d;
    annotations = a;
    config = c;
    display_pedigree();
    show_all_blocks();
    show_summary_block();
    set_study_summary();
    set_family_summary();
  });
});

let clear_alert_elem = document.getElementById("clear-alert-button");
clear_alert_elem.addEventListener("click", function () {
  const alert_elem = document.getElementById("alert");
  alert_elem.innerHTML = "";
  alert_elem.style.backgroundColor = "#FFF";
  alert_elem.style.border = "none";
});

let log_elem = document.getElementById("log-button");
log_elem.addEventListener("click", function () {
  console.log(data);
});

let save_elem = document.getElementById("save-button");
save_elem.addEventListener("click", function () {
  console.log("Clicked on Save for Family");

  save_positions_and_annotations(data);
});

let raw_data_elem = document.getElementById("raw_data_button");
raw_data_elem.addEventListener("click", function () {
  const elem = document.getElementById("details_textbox");
  const raw_elem = document.getElementById("raw_data_text");
  if (raw_elem.style.display === "block") {
    raw_elem.style.display = "none";
    raw_data_elem.innerHTML = "Show Raw Data";
  } else {
    raw_elem.style.display = "block";
    raw_data_elem.innerHTML = "Hide Raw Data";
  }
});


///. This is the entry function /////////
document.addEventListener("DOMContentLoaded", function () {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const family = urlParams.get("family");
    console.log("Family: " + family);
    load_initial_config();
    check_for_families("lfss");
    check_for_studies();

    let filename = null;
    if (family) {
      filename = family + ".json";
    }
    if (filename) { 
      const promise = load_config_and_data(family, "lfss");
      promise.then(([d, a, c]) => {
        data = d;
        annotations = a;
        config = c;
        console.log("Loaded family from URL param: " + filename);
          show_all_blocks();
          show_summary_block();
          set_study_summary();
          set_family_summary();
          display_pedigree();
      });
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
});

function show_all_blocks() {
  const text_blocks = document.getElementsByClassName("textblock");
  Array.from(text_blocks).forEach(block => {
    block.style.display = "block";
  });

  const alert_blocks = document.getElementsByClassName("alertbar");
  Array.from(alert_blocks).forEach(block => {
    block.style.display = "block";
  });

  const pedigree_blocks = document.getElementsByClassName("fhh_pedigree");
  Array.from(pedigree_blocks).forEach(block => {
    block.style.display = "block";
  });
  
}



function add_placeholder_children() {
  for (const person_id in data["people"]) {
    if (is_childless(person_id)) {
      // console.log (person_id + " is childless");
    }
  }
}

export function display_pedigree() {
  console.log(data);
  console.log(annotations);
  set_data(data);

  reset_furthest_locations();
  console.log(get_furthest_left());
  const proband_id = data.general?.proband;

  if (!proband_id) {
    console.error("No proband ID found in data structure");
    return;
  }

  family_tree = build_entire_family_tree(proband_id);

  draw_frame();
  draw_family_tree(family_tree);

  console.log(family_tree);
  add_alert_bar();
}

function add_alert_bar() {
  let active_alerts = false;
  const alert_elem = document.getElementById("alert");
  alert_elem.innerHTML = "";

  active_alerts |= add_overlap_alerts(alert_elem);
  active_alerts |= add_unplaced_people_alerts(alert_elem);

  if (!active_alerts) {
    alert_elem.style.backgroundColor = "white";
    alert_elem.style.border = "";
  }
}

function add_overlap_alerts(alert_elem) {
  const overlaps = check_for_overlaps(family_tree);

  if (overlaps && Object.keys(overlaps).length > 0) {
    alert_elem.style.backgroundColor = "#FDD";
    alert_elem.style.border = "1px dashed #F00";
    const p = document.createElement("p");
    p.classList.add("alert-line");
    alert_elem.append(p);
    p.append("Overlaps: ");
    for (const person_name in overlaps) {
      const button = create_button(person_name);
      p.append(button);
    }
    return true;
  } else {
    return false;
  }
}

function add_unplaced_people_alerts(alert_elem) {
  const missing_people = check_for_unplaced_people(data);

  if (missing_people && Object.keys(missing_people).length > 0) {
    alert_elem.style.backgroundColor = "#FDD";
    alert_elem.style.border = "1px dashed #F00";
    const p = document.createElement("p");
    p.classList.add("alert-line");
    alert_elem.append(p);
    p.append("Missing People: ");
    for (const index in missing_people) {
      const person_id = missing_people[index];
      const children = find_all_children(person_id);
      const text = person_id + " [" + children.length + "]";
      const button = create_button(text);
      p.append(button);
    }
    return true;
  } else {
    return false;
  }
}

function create_button(text) {
  let button = document.createElement("button");
  button.textContent = text;
  button.className = "alert-button";
  return button;
}

function draw_frame() {
  const furthest_right = get_furthest_right();
  const furthest_left = get_furthest_left();
  const total_width = furthest_right - furthest_left + 1;
  const num_generations = get_generation_count();
  const oldest_generation = get_oldest_generation();

  console.log(
    "WIDTH (" + total_width + "): " + furthest_left + " <-> " + furthest_right
  );
  console.log("HEIGHT:" + num_generations);

  center_offset.x = config.margin + -furthest_left * config.h_spacing;
  center_offset.y = config.margin + -oldest_generation * config.v_spacing;
  console.log("CENTER: " + center_offset.x + "," + center_offset.y);

  const width_of_svg = 2 * config.margin + total_width * config.h_spacing;
  const height_of_svg = 2 * config.margin + num_generations * config.v_spacing;

  const svgElem = create_svg(width_of_svg, height_of_svg);
  
  //const r2 = draw_rectangle(width_of_svg - 2, height_of_svg - 2, 1, 1);
  //r2.setAttributeNS(null, "stroke", "black");
  //r2.setAttributeNS(null, "fill", "white");
  //r2.setAttributeNS(null, "stroke-width", "2");

  //  const center = draw_circle(10, center_offset.x, center_offset.y);
  //  center.setAttributeNS(null, "fill", "blue");
}

export function create_svg(width, height) {
  const default_color = config.default_color || "lightblue";
  let svgElem = document.createElementNS(svgns, "svg");
  svgElem.setAttributeNS(null, "viewBox", "0 0 " + width + " " + height);
  svgElem.setAttributeNS(null, "width", width);
  svgElem.setAttributeNS(null, "height", height);
  svgElem.setAttributeNS(null, "fill", default_color);
  svgElem.setAttributeNS(null, "stroke", "black");
  svgElem.setAttributeNS(null, "stroke-width", "5");

  svgElem.style.display = "block";
  svgElem.id = "svg";

  var svgContainer = document.getElementById("main");
  svgContainer.innerHTML = "";
  svgContainer.appendChild(svgElem);

  addSvgListeners(svgElem);
  return svgElem;
}
///////////////////////////////////////////////

function draw_family_tree(family_tree) {
  console.log("draw_family_tree");

  ``;
  for (const person_id in data["people"]) {
    const person = data["people"][person_id];
    if (person.gen != null && person.loc != null) {
      draw_person_connectors(person_id);
    }
  }

  for (const person_id in data["people"]) {
    const person = data["people"][person_id];
    if (person.gen != null && person.loc != null) {
      draw_person(person_id);
    }
  }

  draw_proband_arrow();
}

function draw_proband_arrow() {
  let proband_id = data.general?.proband;

  if (!proband_id) {
    console.error("No proband ID found in data");
    return;
  }

  let proband = data["people"][proband_id];

  if (proband.demographics.gender == "Male") {
    let arrow_line = draw_line(
      proband.x + config.size / 2 + 3,
      proband.y + 17,
      proband.x + config.size / 2 + 32,
      proband.y + 32
    );
    arrow_line.setAttributeNS(null, "id", proband_id);
    arrow_line.setAttributeNS(null, "stroke-width", "2");
    let arrow_triange = draw_triangle(
      proband.x + config.size / 2 + 3,
      proband.y + 17,
      proband.x + config.size / 2 + 21,
      proband.y + 18,
      proband.x + config.size / 2 + 14,
      proband.y + 30
    );
    arrow_triange.setAttributeNS(null, "id", proband_id);
  } else {
    let arrow_line = draw_line(
      proband.x - (config.size / 2) * 0.7071 - 7,
      proband.y + (config.size / 2) * 0.7071 - 5,
      proband.x - (config.size / 2) * 0.7071 - 37,
      proband.y + (config.size / 2) * 0.7071 + 15
    );
    arrow_line.setAttributeNS(null, "id", proband_id);
    arrow_line.setAttributeNS(null, "stroke-width", "2");
    let arrow_triange = draw_triangle(
      proband.x - (config.size / 2) * 0.7071 - 7,
      proband.y + (config.size / 2) * 0.7071 - 5,
      proband.x - (config.size / 2) * 0.7071 - 24,
      proband.y + ((config.size / 2) * 0.7071 - 3),
      proband.x - (config.size / 2) * 0.7071 - 16,
      proband.y + (config.size / 2) * 0.7071 + 10
    );

    arrow_triange.setAttributeNS(null, "id", proband_id);
  }
}

function draw_person(person_id) {
  //  console.log(person_id);
  const person = data["people"][person_id];

  if (person && person["demographics"]["gender"] == "Male") {
    draw_male(person_id);
    draw_quadrants_male(person_id);
  } else if (person && person["demographics"]["gender"] == "Female") {
    draw_female(person_id);
    draw_quadrants_female(person_id);
  } else {
    draw_unknown(person_id);
    draw_quadrants_unknown(person_id);
  }

  if (data["people"][person_id].deceased) {
    draw_slash(person_id);
  }
}

function draw_person_connectors(person_id) {
  //  console.log(person_id);
  const person = data["people"][person_id];

  if (person.mother == null && person.father != null)
    console.log("Missing Mother for " + person_id);
  if (person.father == null && person.mother != null)
    console.log("Missing Father for " + person_id);

  if (person) draw_connector(person_id, person.mother, person.father);
}

function get_center(person) {
  let center = {};

  if (annotations) {
    if (annotations["positions"][person.id]) {
      const saved_position = annotations["positions"][person.id];
      center.x = saved_position.x;
      center.y = saved_position.y;
    } else {
      center.x =
        center_offset.x + config.margin + person.loc * config.h_spacing;
      center.y =
        center_offset.y + config.margin + person.gen * config.v_spacing;
    }
  } else {
    center.x = center_offset.x + config.margin + person.loc * config.h_spacing;
    center.y = center_offset.y + config.margin + person.gen * config.v_spacing;
  }

  return center;
}

//////////////////////

function show_summary_block() {
  const summary_elem = document.getElementsByClassName("summary-display-section");
  summary_elem[0].style.display = "block";
  const person_elem = document.getElementsByClassName("person-display-section");
  person_elem[0].style.display = "none";

  summary_elem[0].innerHTML = "";
}


function set_study_summary() { 
  const summary_elem = document.getElementsByClassName("study-display-section");
  summary_elem[0].innerHTML = "";

  const study_name = config.study_name || "Unknown Study";
  const study = data.general?.study;

  const top_left = config.quadrants.top_left?.name || "Unknown";
  const top_right = config.quadrants.top_right?.name || "Unknown";
  const bottom_left = config.quadrants.bottom_left?.name || "Unknown";
  const bottom_right = config.quadrants.bottom_right?.name || "Unknown";

  const table = document.createElement("table");
  table.classList.add("data-display-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const codeHeader = document.createElement("th");
  codeHeader.colSpan = 2;
  codeHeader.textContent = study_name + " - Study Summary";
  headerRow.appendChild(codeHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  add_row_to_table(tbody, "Top Left", top_left);
  add_row_to_table(tbody, "Top Right", top_right);
  add_row_to_table(tbody, "Bottom Left", bottom_left);
  add_row_to_table(tbody, "Bottom Right", bottom_right);

  table.appendChild(tbody);
  summary_elem[0].appendChild(table);

}

function set_family_summary() {  
  const summary_elem = document.getElementsByClassName("summary-display-section");
 
  const proband_id = data.general?.proband;
  const study = data.general?.study;
  const family_classification = data.general?.family_classification;
  const family_genetic_status = data.general?.family_genetic_status;
  
  
  const number_of_people = Object.keys(data.people).length;
  const number_of_diagnoses = Object.values(data.people).reduce((acc, person) => acc + (person.diseases ? person.diseases.length : 0), 0);
  const number_of_procedures = Object.values(data.people).reduce((acc, person) => acc + (person.procedures ? person.procedures.length : 0), 0);

  

  const table = document.createElement("table");
  table.classList.add("data-display-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const codeHeader = document.createElement("th");
  codeHeader.colSpan = 2;
  codeHeader.textContent = proband_id + " - Family Summary";
  headerRow.appendChild(codeHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  add_row_to_table(tbody, "Proband", proband_id);
  add_row_to_table(tbody, "Family Classification", family_classification);
  add_row_to_table(tbody, "Family Genetic Status", family_genetic_status);
  add_row_to_table(tbody, "People", number_of_people);
  add_row_to_table(tbody, "Diagnoses", number_of_diagnoses);
  add_row_to_table(tbody, "Procedures", number_of_procedures);
  table.appendChild(tbody);
  summary_elem[0].appendChild(table);

}


function set_raw_data_of_person(person_id) {
  const elem = document.getElementById("raw_data_text");
  elem.innerHTML = "";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(data["people"][person_id], null, 2);
  pre.classList.add("raw_data");
  elem.appendChild(pre);
}

function set_demographics_of_person(person_id) {
  const elem = document.getElementById("person_demographics");
  elem.innerHTML = "";

  const h2 = document.createElement("h2");
  h2.textContent = data["people"][person_id]["name"];
  elem.appendChild(h2); 

  const table = document.createElement("table");
  table.classList.add("data-display-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const codeHeader = document.createElement("th");
  codeHeader.colSpan = 2;
  codeHeader.textContent = "Demographics";
  headerRow.appendChild(codeHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  add_row_to_table(tbody, "ID", person_id);
  add_row_to_table(tbody, "Sex", data["people"][person_id]["demographics"]["gender"]);

  add_row_to_table(tbody, "Birthdate", data["people"][person_id]["born"]);
  add_row_to_table(tbody, "Deceased", data["people"][person_id]["deceased"]);
  add_row_to_table(tbody, "Pedigree Symbol", data["people"][person_id]["pedigree_symbol"]);
  add_row_to_table(tbody, "Mother", data["people"][person_id]["mother"]);
  add_row_to_table(tbody, "Father", data["people"][person_id]["father"]);
  table.appendChild(tbody);
  elem.appendChild(table);
}

function add_row_to_table(tbody, label, value) {
  if (!value) return;
  if (value == "UN/UN/UNKN" || value == "00/00/0000") return;
  if (value == "Unknown") return;
  if (value == "UNK") return;


  const row = document.createElement("tr");
  const label_cell = document.createElement("td");
  label_cell.textContent = label;
  const value_cell = document.createElement("td");
  value_cell.textContent = value;
  row.appendChild(label_cell);
  row.appendChild(value_cell);
  tbody.appendChild(row);
}

function set_diagnoses_of_person(person_id) {
  const elem = document.getElementById("person_diagnoses");
  elem.innerHTML = "";

  const diseases = data["people"][person_id]["diseases"];
  if (diseases && diseases.length > 0) {
    const h2 = document.createElement("h2");
    h2.textContent = "Diagnoses";
    elem.appendChild(h2);


    for (const disease of diseases) {
      // There is a potential error in the code for non-cancer diseases, they include the shorthand as well.  So for now I will trim the code to dbefore the -
      const code = trimAfterCharacter(disease.code, "-");

     
      const table = document.createElement("table");
      table.classList.add("data-display-table");
      if (code[0] == "C") table.classList.add("cancer-diagnosis");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const codeHeader = document.createElement("th");
      codeHeader.colSpan = 2;
      codeHeader.textContent = code + " - " + disease.shorthand;
      headerRow.appendChild(codeHeader);
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      add_row_to_table(tbody, "Code", code);
      add_row_to_table(tbody, "Shorthand", disease.shorthand);
      add_row_to_table(tbody, "Age of Diagnosis", disease.age_of_diagnosis);
      add_row_to_table(tbody, "Date of Diagnosis", disease.date_of_diagnosis);
      add_row_to_table(tbody, "Laterality", disease.laterality);
      add_row_to_table(tbody, "D Num", disease.d_num);
      
      table.appendChild(tbody);
      elem.appendChild(table);
    }
  }
} 

function set_procedures_of_person(person_id) {
  const elem = document.getElementById("person_procedures");
  elem.innerHTML = "";

  const procedures = data["people"][person_id]["procedures"];
  if (procedures && procedures.length > 0) {
    const h2 = document.createElement("h2");
    h2.textContent = "Procedures";
    elem.appendChild(h2);


    for (const procedure of procedures) {
      // There is a potential error in the code for non-cancer diseases, they include the shorthand as well.  So for now I will trim the code to dbefore the -
      const code = trimAfterCharacter(procedure.code, "-");

      const table = document.createElement("table");
      table.classList.add("data-display-table");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const codeHeader = document.createElement("th");
      codeHeader.colSpan = 2;
      codeHeader.textContent = code + " - " + procedure.shorthand;
      headerRow.appendChild(codeHeader);
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      add_row_to_table(tbody, "Code", code);
      add_row_to_table(tbody, "Shorthand", procedure.shorthand);
      add_row_to_table(tbody, "Date of Procedure", procedure.date_of_procedure);
      add_row_to_table(tbody, "Procedure #", procedure.proc_num);

      table.appendChild(tbody);
      elem.appendChild(table);
    }
  }
} 

function set_details_of_person(person_id) {
  const summary_elem = document.getElementsByClassName("summary-display-section");
  summary_elem[0].style.display = "none";
  const person_elem = document.getElementsByClassName("person-display-section");
  person_elem[0].style.display = "block";

  set_demographics_of_person(person_id);
  set_diagnoses_of_person(person_id);
  set_procedures_of_person(person_id);

  set_raw_data_of_person(person_id);
}

function add_clicking_to_element(el, person_id) {
  el.addEventListener("mousedown", (e) => {
    const selectedValue = document.querySelector(
      'input[name="action_choice"]:checked'
    ).value;

    if (selectedValue == "details") {
      // Log the person data to the console
      set_study_summary();
      set_details_of_person(person_id);

      console.log(data["people"][person_id]);
    } else if (selectedValue == "free") {
      start_free_move(e);
    } else if (selectedValue == "slide") {
      start_slide_move(e);
    }
  });
}

function draw_male(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;

  const el = draw_square(
    config.size,
    center.x - config.size / 2,
    center.y - config.size / 2,
    config.default_color || "lightgrey"
  );

  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "sex", "Male");
 
  if (data["people"][person_id]["diseases"]) {
    el.setAttributeNS(null, "stroke-width", "3");
  } 

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);

  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
    draw_pedigree_symbol(center, person_id);
    draw_born_and_deceased(center, person_id);
  }
}

function draw_female(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;

  const el = draw_circle(config.size, center.x, center.y);
  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "sex", "Female");

  if (data["people"][person_id]["diseases"]) {
    el.setAttributeNS(null, "stroke-width", "3");
  } 

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);
  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
    draw_pedigree_symbol(center, person_id);
    draw_born_and_deceased(center, person_id);
  }

}

function draw_unknown(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;

  let x = person.x;
  let y = person.y;
  let s = config.size;

  const el = draw_diamond(config.size, center.x, center.y);
  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "sex", "Unknown");
  el.setAttributeNS(null, "cx", center.x);
  el.setAttributeNS(null, "cy", center.y);

 if (data["people"][person_id]["diseases"]) {
    el.setAttributeNS(null, "stroke-width", "3");
  } 

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);
  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
  }

}

function draw_slash(person_id) {
  console.log("draw_slash for " + person_id);
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;
  const s = config.size / 2;
  const slash_elem = draw_line(
    person.x - s - 5 ,
    person.y + s + 5,
    person.x + s + 5,
    person.y - s - 5
  );
  slash_elem.setAttributeNS(null, "id", person_id);
}

function draw_connector(person_id, mother_id, father_id) {
  const person = data["people"][person_id];
  const mother = data["people"][mother_id];
  const father = data["people"][father_id];

  if (mother && father) {
    let child_loc = get_center(person);

    let mother_loc = get_center(mother);
    let father_loc = get_center(father);

    if ( Number.isNaN(mother_loc.x) || Number.isNaN(mother_loc.y) || Number.isNaN(father_loc.x) || Number.isNaN(father_loc.y) ) {
      console.log("NaN in connector for " + person_id);
      return;
    }


    draw_line_top_of_child(child_loc, person_id);
    draw_line_between_parents(mother_loc, father_loc, mother_id, father_id);
    draw_line_connecting_parents_down(
      mother_loc,
      father_loc,
      mother_id,
      father_id
    );
    draw_line_child_to_parents(
      child_loc,
      mother_loc,
      father_loc,
      person_id,
      mother_id,
      father_id
    );
    //    console.log(person_id + ":" + mother_id + "," +    father_id);
  }
}

function draw_line_child_to_parents(
  child_loc,
  mother_loc,
  father_loc,
  person_id,
  mother_id,
  father_id
) {
  //  const x1 = mother_loc.x + config.h_spacing;
  const x1 = (mother_loc.x + father_loc.x) / 2;
  const y1 = mother_loc.y + config.v_spacing / 2;

  const x2 = child_loc.x;
  const y2 = child_loc.y - config.v_spacing / 2;

  let elem = draw_line(x1, y1, x2, y2);
  elem.setAttributeNS(null, "stroke-width", "2");
  elem.setAttributeNS(null, "child_id", person_id);
  elem.setAttributeNS(null, "c_mother_id", mother_id);
  elem.setAttributeNS(null, "c_father_id", father_id);
}

function draw_line_top_of_child(child_loc, person_id) {
  //  let elem = draw_line(child_loc.x, child_loc.y - config.size/2, child_loc.x, child_loc.y - config.size - config.v_spacing/2);
  let elem = draw_line(
    child_loc.x,
    child_loc.y,
    child_loc.x,
    child_loc.y - config.v_spacing / 2
  );
  elem.setAttributeNS(null, "id", person_id);
  elem.setAttributeNS(null, "stroke-width", "2");
}

function draw_line_between_parents(
  mother_loc,
  father_loc,
  mother_id,
  father_id
) {
  let elem = draw_line(mother_loc.x, mother_loc.y, father_loc.x, father_loc.y);
  elem.setAttributeNS(null, "stroke-width", "2");
  elem.setAttributeNS(null, "mother_id", mother_id);
  elem.setAttributeNS(null, "father_id", father_id);
}

function draw_line_connecting_parents_down(
  mother_loc,
  father_loc,
  mother_id,
  father_id
) {
  const x = (mother_loc.x + father_loc.x) / 2;
  //  const x = mother_loc.x + config.h_spacing;
  const y1 = mother_loc.y;
  const y2 = mother_loc.y + config.v_spacing / 2;
  let elem = draw_line(x, y1, x, y2);
  elem.setAttributeNS(null, "stroke-width", "2");
  elem.setAttributeNS(null, "p_mother_id", mother_id);
  elem.setAttributeNS(null, "p_father_id", father_id);
}

function draw_name(center, person_id) {
  const loc_x = center.x;
  const loc_y = center.y + config.size / 2 + config.v_padding;

  //  if (data["people"][person_id] && data["people"][person_id].name) {
  //    text = data["people"][person_id].name;
  //  }
  const id_elem = draw_label(person_id, loc_x, loc_y);
  id_elem.setAttribute("id", person_id);

  let name = data["people"][person_id]["name"];
  if (name && name != "Unknown") {
    const elem = draw_label(name, loc_x, loc_y + 14);
    elem.setAttribute("id", person_id);
  }
}

function draw_born_and_deceased(center, person_id) {
  let born = data["people"][person_id]["born"];
  if (born == "UN/UN/UNKN" || born == "00/00/0000") born = null;
  let deceased = data["people"][person_id]["deceased"];
  if (deceased == "UN/UN/UNKN" || deceased == "00/00/0000") deceased = null;

  let born_deceased = null;
  if (born && !deceased) {
    born_deceased = "b. " + born;
  } else if (born && deceased) {
    born_deceased = born + "-" + deceased;
  } else if (!born && deceased) {
    born_deceased = "d. " + deceased;
  }

  if (born_deceased) {
    const loc_x = center.x;
    const loc_y = center.y + config.size / 2 + 2 * config.v_padding;
    const elem = draw_label(born_deceased, loc_x , loc_y );
    if (born_deceased.length > 15) {
      elem.setAttribute("font-size", 10);
    }
    elem.setAttribute("id", person_id);

  }

}

function draw_pedigree_symbol(center, person_id) {
  const pedigree_symbol = data["people"][person_id]["pedigree_symbol"];
  if (pedigree_symbol) {
    const loc_x = center.x + 8;  // just enough to knock it off the centerline
    const loc_y = center.y - config.size / 2 - 8;
    const elem = draw_label(pedigree_symbol, loc_x , loc_y );
    elem.setAttribute("text-anchor", "left");
    elem.setAttribute("id", person_id);
  }
}

function draw_label(text, x, y) {
  var textElem = document.createElementNS(svgns, "text");
  textElem.setAttribute("x", x);
  textElem.setAttribute("y", y);
  textElem.setAttribute("font-size", 12);
  textElem.setAttribute("font-family", "Arial, Helvetica, sans-serif");
  textElem.setAttribute("text-anchor", "middle");
  textElem.setAttribute("fill", "black");
  textElem.setAttribute("stroke-width", "1");
  increment++;
  textElem.textContent = text;

  var svg = document.getElementById("svg");
  svg.appendChild(textElem);
  return textElem;
}

/////////////////////////

function draw_rectangle(width, height, x, y) {
  let rectElem = document.createElementNS(svgns, "rect");
  rectElem.setAttribute("width", width);
  rectElem.setAttribute("height", height);
  rectElem.setAttribute("x", x);
  rectElem.setAttribute("y", y);
  rectElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(rectElem);

  return rectElem;
}

function draw_square(size, x, y, color) {
  let rectElem = document.createElementNS(svgns, "rect");
  rectElem.setAttribute("width", size);
  rectElem.setAttribute("height", size);
  rectElem.setAttribute("x", x);
  rectElem.setAttribute("y", y);
  rectElem.setAttribute("stroke-width", "1");
  rectElem.setAttribute("fill", color);

  var svg = document.getElementById("svg");
  svg.appendChild(rectElem);

  return rectElem;
}

function draw_circle(radius, x, y) {
  let circleElem = document.createElementNS(svgns, "circle");
  circleElem.setAttribute("r", radius / 2);
  circleElem.setAttribute("cx", x);
  circleElem.setAttribute("cy", y);
  circleElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(circleElem);

  return circleElem;
}

function draw_diamond(s, x, y) {
  let points = "";
  points += x + "," + (y - s / 2) + " ";
  points += x + s / 2 + "," + y + " ";
  points += x + "," + (y + s / 2) + " ";
  points += x - s / 2 + "," + y;

  console.log("Points:" + points);

  let diamondElem = document.createElementNS(svgns, "polygon");
  diamondElem.setAttribute("points", points);
  diamondElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(diamondElem);

  return diamondElem;
}

function draw_triangle(x1, y1, x2, y2, x3, y3) {
  let points = "";
  points += x1 + "," + y1 + " ";
  points += x2 + "," + y2 + " ";
  points += x3 + "," + y3;

  console.log("Points:" + points);

  let triangleElem = document.createElementNS(svgns, "polygon");
  triangleElem.setAttribute("points", points);
  triangleElem.setAttribute("stroke-width", "1");
  triangleElem.setAttribute("fill", "black");
  triangleElem.setAttribute("cx", x1);
  triangleElem.setAttribute("cy", y1);

  var svg = document.getElementById("svg");
  svg.appendChild(triangleElem);

  return triangleElem;
}

function draw_line(x1, y1, x2, y2) {
  let lineElem = document.createElementNS(svgns, "line");
  lineElem.setAttribute("x1", x1);
  lineElem.setAttribute("y1", y1);
  lineElem.setAttribute("x2", x2);
  lineElem.setAttribute("y2", y2);
  lineElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(lineElem);

  return lineElem;
}

/////. Helper functions /////
function trimAfterCharacter(str, char) {
  const index = str.indexOf(char); // Find the index of the first occurrence of the character

  if (index !== -1) { // If the character is found
    return str.substring(0, index); // Return the substring from the beginning up to the character's index
  } else {
    return str; // If the character is not found, return the original string
  }
}

///
// Quadrants

function check_quadrant_tr(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  const top_right_type = config.quadrants.top_right?.type || "Unknown";
  if (top_right_type == "disease") {
    if (person.diseases && person.diseases.length > 0) {
      const valid_codes = config.quadrants.top_right?.codes || [];
      for (const disease of person.diseases) {
        const code = trimAfterCharacter(disease.code, "-");
        console.log("For " + person_id + " checking disease code " + code);
        if (valid_codes.includes(code)) {
          return code;
        }
      }
    }
  }
}


function check_quadrant_tl(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  const top_left_type = config.quadrants.top_left?.type || "Unknown";
  if (top_left_type == "disease") {
    if (person.diseases && person.diseases.length > 0) {
      const valid_codes = config.quadrants.top_left?.codes || [];
      for (const disease of person.diseases) {
        const code = trimAfterCharacter(disease.code, "-");
        console.log("For " + person_id + " checking disease code " + code);
        if (valid_codes.includes(code)) {
          return code;
        }
      }
    }
  }
}

function check_quadrant_bl(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  const bottom_left_type = config.quadrants.bottom_left?.type || "Unknown";
  if (bottom_left_type == "disease") {
    if (person.diseases && person.diseases.length > 0) {
      const valid_codes = config.quadrants.bottom_left?.codes || [];
      console.log(valid_codes);
      for (const disease of person.diseases) {
        const code = trimAfterCharacter(disease.code, "-");
        console.log("For " + person_id + " checking disease code " + code);
        if (valid_codes.includes(code)) {
          return code;
        }
      }
    }
  }
}

function check_quadrant_br(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  const bottom_right_type = config.quadrants.bottom_right?.type || "Unknown";
  if (bottom_right_type == "disease") {
    if (person.diseases && person.diseases.length > 0) {
      const valid_codes = config.quadrants.bottom_right?.codes || [];
      console.log(valid_codes);
      for (const disease of person.diseases) {
        const code = trimAfterCharacter(disease.code, "-");
        console.log("For " + person_id + " checking disease code " + code);
        if (valid_codes.includes(code)) {
          return code;
        }
      }
    }
  }
}

function draw_quadrants_male(person_id) {
  console.log("draw_quadrants_male");

  let el;
  const size = config.size / 2;
  const center_x = data["people"][person_id].x;
  const center_y = data["people"][person_id].y;
  let color = "grey";
  let code = false;

  if (code = check_quadrant_tr(person_id)) { el = draw_square(size, center_x, center_y - size, config.quadrants.top_right?.color || "grey"); } 
  if (code = check_quadrant_tl(person_id)) { el = draw_square(size, center_x - size, center_y -size, config.quadrants.top_left?.color || "grey"); }
  if (code = check_quadrant_br(person_id)) { el = draw_square(size, center_x, center_y, config.quadrants.bottom_right?.color || "grey"); }
  if (code = check_quadrant_bl(person_id)) { el = draw_square(size, center_x - size, center_y, config.quadrants.bottom_left?.color || "grey"); }
  if (el) { 
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "stroke-width", "2");
  }
}

function draw_quadrants_female(person_id) {
  let el;
  const size = config.size / 2;
  const center_x = data["people"][person_id].x;
  const center_y = data["people"][person_id].y;
  let color = "grey";
  let code = false;

  if (code = check_quadrant_tr(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "tr", config.quadrants.top_right?.color || "grey"); }
  if (code = check_quadrant_tl(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "tl", config.quadrants.top_left?.color || "grey"); }
  if (code = check_quadrant_bl(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "bl", config.quadrants.bottom_left?.color || "grey"); }
  if (code = check_quadrant_br(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "br", config.quadrants.bottom_right?.color || "grey"); }
  if (el) {

  }
  console.log("draw_quadrants_female");
}

function draw_arc_90(person_id, center_x, center_y, radius, quadrant, color) {
  
  let path = "M " + center_x + " " + center_y + " ";
  if (quadrant == "tr") {
    path += "L " + (center_x + radius) + " " + center_y + " ";
    path += "A " + radius + " " + radius + " 0 0 0 " + (center_x) + " " + (center_y - radius);
  } else if (quadrant == "tl") {
    path += "L " + (center_x - radius) + " " + center_y + " ";
    path += "A " + radius + " " + radius + " 1 0 1 " + (center_x) + " " + (center_y - radius);
  } else if (quadrant == "bl") {
    path += "L " + (center_x - radius) + " " + center_y + " ";
    path += "A " + radius + " " + radius + " 0 0 0 " + (center_x) + " " + (center_y + radius);
  } else if (quadrant == "br") {
    path += "L " + (center_x + radius) + " " + center_y + " ";
    path += "A " + radius + " " + radius + " 1 0 1 " + (center_x) + " " + (center_y + radius);
  }
  path += " L " + center_x + " " + center_y + " Z";


  let el = document.createElementNS(svgns, "path");
  el.setAttributeNS(null, "d", path);
  el.setAttributeNS(null, "stroke-width", "2");
  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "fill", color);

  var svg = document.getElementById("svg");
  svg.appendChild(el);

  return el;

}


function draw_quadrants_unknown(person_id) {
  console.log("draw_quadrants_unknown");
}


/////////////////////