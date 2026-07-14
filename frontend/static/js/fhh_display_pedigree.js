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
  ensureConfigLoaded,
  load_study_config,
  check_for_families,
  load_families_into_select,
  load_config_and_data,
  save_positions_and_annotations,
  save_family_json,
  check_for_studies,
  create_study_directory,
  create_family_file,
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
let other_alerts = {};

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
  study_name = event.target.value;
  load_study_config(study_name)
    .then((loadedConfig) => {
      config = loadedConfig;
      update_build_mode_actions_visibility();
    })
    .catch((error) => {
      console.error("Failed to load study config:", error);
    });
  check_for_families(study_name);
});

let family_select = document.getElementById("families_select");
family_select.addEventListener("change", function (event) {
  if (!study_name) {
    return;
  }
  
  load_config_and_data(study_name, event.target.value, study_name)
    .then(([d, a, c]) => {
      data = d;
      annotations = a;
      config = c;
      display_pedigree();
      show_all_blocks();
      show_summary_block();
      set_study_summary();
      set_family_summary();
    })
    .catch((error) => {
      console.error("Failed to load family data:", error);
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
});

let save_elem = document.getElementById("save-button");
save_elem.addEventListener("click", function () {

  save_positions_and_annotations(data);
});

let save_family_elem = document.getElementById("save-family-button");
if (save_family_elem) {
  save_family_elem.addEventListener("click", async function () {
    try {
      await save_family_json(data);
      window.alert("Family saved.");
    } catch (error) {
      console.error("Error saving family:", error);
      window.alert("Unable to save family. " + (error?.message || ""));
    }
  });
}

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

let build_mode_actions_elem = document.getElementById("build-mode-actions");

function update_build_mode_actions_visibility() {
  if (!build_mode_actions_elem) return;
  const is_build_mode = config?.build_mode === true;
  if (save_family_elem) save_family_elem.style.display = is_build_mode ? "inline-block" : "none";
  build_mode_actions_elem.style.display = is_build_mode ? "flex" : "none";
}

let new_study_button_elem = document.getElementById("new-study-button");
if (new_study_button_elem) {
  new_study_button_elem.addEventListener("click", async function () {
    const entered_study_id = window.prompt("Enter new study ID");
    if (entered_study_id === null) return;

    const study_id = entered_study_id.trim();
    if (!study_id) {
      window.alert("Study ID is required.");
      return;
    }

    try {
      await create_study_directory(study_id);
      await check_for_studies();
      study_select.value = study_id;
      check_for_families(study_id);
    } catch (error) {
      console.error("Error creating study:", error);
      window.alert("Unable to create study. " + (error?.message || ""));
    }
  });
}

let new_family_button_elem = document.getElementById("new-family-button");
if (new_family_button_elem) {
  new_family_button_elem.addEventListener("click", async function () {
    const selected_study = study_select?.value?.trim();
    if (!selected_study) {
      window.alert("Please select a study first.");
      return;
    }

    const entered_family_id = window.prompt("Enter Family ID");
    if (entered_family_id === null) return;
    const family_id = entered_family_id.trim();
    if (!family_id) {
      window.alert("Family ID is required.");
      return;
    }

    const entered_proband_id = window.prompt("Enter Proband ID");
    if (entered_proband_id === null) return;
    const proband_id = entered_proband_id.trim();
    if (!proband_id) {
      window.alert("Proband ID is required.");
      return;
    }

    const entered_proband_name = window.prompt("Enter Proband Name");
    if (entered_proband_name === null) return;
    const proband_name = entered_proband_name.trim();

    try {
      await create_family_file(selected_study, family_id, proband_id, proband_name);
      await check_for_families(selected_study);
      family_select.value = family_id;
      family_select.dispatchEvent(new Event("change"));
    } catch (error) {
      console.error("Error creating family:", error);
      window.alert("Unable to create family. " + (error?.message || ""));
    }
  });
}

let action_mode_radio_elems = document.querySelectorAll('input[name="action_choice"]');
let current_action_mode = "details";

function get_checked_action_radio_value() {
  const checked_radio = document.querySelector('input[name="action_choice"]:checked');
  if (!checked_radio) return null;
  return checked_radio.value;
}

function set_current_action_mode(mode) {
  current_action_mode = mode;
}

function is_pedigree_build_mode() {
  return current_action_mode == "details" && config?.build_mode === true;
}

set_current_action_mode(get_checked_action_radio_value() || "details");

action_mode_radio_elems.forEach((radio_elem) => {
  radio_elem.addEventListener("change", function () {
    set_current_action_mode(radio_elem.value);
  });
});


document.addEventListener("DOMContentLoaded", async function () {
  try {
    const loadedConfig = await ensureConfigLoaded();
    if (loadedConfig) {
      config = loadedConfig;
      update_build_mode_actions_visibility();
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const family = urlParams.get("family");
    let filename = null;
    if (family) {
      filename = family + ".json";
    }
    const study = urlParams.get("study");

    const studies = await check_for_studies();

    if (study) {
      study_name = study;
    }
    // If no study param, leave blank option selected unless a family was specified in the URL

    if (study_name) {
      study_select.value = study_name;
      config = await load_study_config(study_name);
      update_build_mode_actions_visibility();
      await check_for_families(study_name);
    }
    if (filename) { 
      const promise = load_config_and_data(study_name, family, study_name);
      promise.then((result) => {
        if (!result) return;
        const [d, a, c] = result;
        data = d;
        annotations = a;
        config = c;
        update_build_mode_actions_visibility();
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
  set_data(data);
  other_alerts = {};

  reset_furthest_locations();
  const proband_id = data.general?.proband;

  if (!proband_id) {
    console.error("No proband ID found in data structure");
    return;
  }

  family_tree = build_entire_family_tree(proband_id);

  draw_frame();
  draw_family_tree(family_tree);

  add_alert_bar();
}

function add_alert_bar() {
  let active_alerts = false;
  const alert_elem = document.getElementById("alert");
  alert_elem.innerHTML = "";

  active_alerts |= add_overlap_alerts(alert_elem);
  active_alerts |= add_unplaced_people_alerts(alert_elem);
  active_alerts |= add_other_alerts(alert_elem);

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

function add_other_alerts(alert_elem) {
  // other_alerts is a global person_id -> message map in this file

  const person_ids = Object.keys(other_alerts);

  if (person_ids.length > 0) {
    alert_elem.style.backgroundColor = "#FDD";
    alert_elem.style.border = "1px dashed #F00";
    const p = document.createElement("p");
    p.classList.add("alert-line");
    alert_elem.append(p);
    p.append("Other Alerts: ");
    for (const person_id of person_ids) {
      const text = person_id + ": " + other_alerts[person_id];
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

  center_offset.x = config.margin + -furthest_left * config.h_spacing;
  center_offset.y = config.margin + -oldest_generation * config.v_spacing;

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

  const deceased_state = get_deceased_state(data["people"][person_id]);
  if (deceased_state.isDeceased) {
    draw_slash(person_id);
  }
}

function draw_person_connectors(person_id) {
  //  console.log(person_id);
  const person = data["people"][person_id];

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

  const top_left = config.quadrants?.top_left?.name || "Unknown";
  const top_right = config.quadrants?.top_right?.name || "Unknown";
  const bottom_left = config.quadrants?.bottom_left?.name || "Unknown";
  const bottom_right = config.quadrants?.bottom_right?.name || "Unknown";

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

  if (config.quadrants && Object.keys(config.quadrants).length > 0) {
    add_row_to_table(tbody, "Top Left", top_left);
    add_row_to_table(tbody, "Top Right", top_right);
    add_row_to_table(tbody, "Bottom Left", bottom_left);
    add_row_to_table(tbody, "Bottom Right", bottom_right);
  } else {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.textContent = "No quadrant information available";
    cell.style.fontStyle = "italic";
    cell.style.color = "#888";
    row.appendChild(cell);
    tbody.appendChild(row);
  }

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

function set_optional_text_field(person, key, value) {
  const trimmed_value = value.trim();
  person[key] = trimmed_value ? trimmed_value : null;
}

function get_deceased_state(person) {
  if (typeof person.deceased === "boolean") {
    return {
      isDeceased: person.deceased,
      deathDate: person.deathdate || "",
    };
  }

  if (person.deceased && typeof person.deceased === "string") {
    const deceased_date = person.deceased == "UN/UN/UNKN" || person.deceased == "00/00/0000" ? "" : person.deceased;
    return {
      isDeceased: true,
      deathDate: deceased_date,
    };
  }

  return {
    isDeceased: false,
    deathDate: person.deathdate || "",
  };
}

function show_demographics_edit_dialog(person) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.classList.add("edit-dialog");

    const form = document.createElement("form");
    form.classList.add("edit-dialog-form");
    form.method = "dialog";

    const title = document.createElement("h3");
    title.textContent = "Edit Demographics";
    form.appendChild(title);

    const { isDeceased, deathDate } = get_deceased_state(person);

    const sex_row = document.createElement("label");
    sex_row.classList.add("edit-dialog-row");
    const sex_label = document.createElement("span");
    sex_label.textContent = "Sex";
    const sex_select = document.createElement("select");
    sex_select.name = "gender";
    ["Male", "Female", "Unknown"].forEach((option_value) => {
      const option = document.createElement("option");
      option.value = option_value;
      option.textContent = option_value;
      if ((person.demographics?.gender || "Unknown") == option_value) option.selected = true;
      sex_select.appendChild(option);
    });
    sex_row.appendChild(sex_label);
    sex_row.appendChild(sex_select);
    form.appendChild(sex_row);

    const birthdate_row = document.createElement("label");
    birthdate_row.classList.add("edit-dialog-row");
    const birthdate_label = document.createElement("span");
    birthdate_label.textContent = "Birthdate";
    const birthdate_input = document.createElement("input");
    birthdate_input.type = "date";
    birthdate_input.name = "born";
    birthdate_input.value = person.born || "";
    birthdate_row.appendChild(birthdate_label);
    birthdate_row.appendChild(birthdate_input);
    form.appendChild(birthdate_row);

    const deceased_row = document.createElement("label");
    deceased_row.classList.add("edit-dialog-row");
    const deceased_label = document.createElement("span");
    deceased_label.textContent = "Deceased";
    const deceased_select = document.createElement("select");
    deceased_select.name = "is_deceased";
    [
      { value: "false", label: "False" },
      { value: "true", label: "True" },
    ].forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if ((isDeceased ? "true" : "false") == opt.value) option.selected = true;
      deceased_select.appendChild(option);
    });
    deceased_row.appendChild(deceased_label);
    deceased_row.appendChild(deceased_select);
    form.appendChild(deceased_row);

    const deathdate_row = document.createElement("label");
    deathdate_row.classList.add("edit-dialog-row");
    deathdate_row.setAttribute("id", "deathdate-row");
    const deathdate_label = document.createElement("span");
    deathdate_label.textContent = "Deathdate";
    const deathdate_input = document.createElement("input");
    deathdate_input.type = "date";
    deathdate_input.name = "deathdate";
    deathdate_input.value = deathDate || "";
    deathdate_row.appendChild(deathdate_label);
    deathdate_row.appendChild(deathdate_input);
    form.appendChild(deathdate_row);

    const pedigree_symbol_row = document.createElement("label");
    pedigree_symbol_row.classList.add("edit-dialog-row");
    const pedigree_symbol_label = document.createElement("span");
    pedigree_symbol_label.textContent = "Pedigree Symbol";
    const pedigree_symbol_input = document.createElement("input");
    pedigree_symbol_input.type = "text";
    pedigree_symbol_input.name = "pedigree_symbol";
    pedigree_symbol_input.value = person.pedigree_symbol || "";
    pedigree_symbol_row.appendChild(pedigree_symbol_label);
    pedigree_symbol_row.appendChild(pedigree_symbol_input);
    form.appendChild(pedigree_symbol_row);

    function toggle_deathdate_visibility() {
      const selected = deceased_select.value === "true";
      deathdate_row.style.display = selected ? "grid" : "none";
      if (!selected) deathdate_input.value = "";
    }

    deceased_select.addEventListener("change", toggle_deathdate_visibility);
    toggle_deathdate_visibility();

    const actions = document.createElement("div");
    actions.classList.add("edit-dialog-actions");

    const cancel_button = document.createElement("button");
    cancel_button.type = "button";
    cancel_button.textContent = "Cancel";

    const save_button = document.createElement("button");
    save_button.type = "button";
    save_button.textContent = "Save";

    actions.appendChild(cancel_button);
    actions.appendChild(save_button);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    cancel_button.addEventListener("click", function () {
      dialog.close();
      dialog.remove();
      resolve(null);
    });

    save_button.addEventListener("click", function () {
      const result = {
        gender: sex_select.value,
        born: birthdate_input.value,
        is_deceased: deceased_select.value,
        deathdate: deathdate_input.value,
        pedigree_symbol: pedigree_symbol_input.value,
      };

      dialog.close();
      dialog.remove();
      resolve(result);
    });

    dialog.addEventListener("cancel", function () {
      dialog.remove();
      resolve(null);
    });

    dialog.showModal();
  });
}

async function edit_demographics_of_person(person_id) {
  const person = data["people"][person_id];
  if (!person) return;

  if (!person.demographics) person.demographics = {};

  const updated = await show_demographics_edit_dialog(person);
  if (!updated) return;

  person.demographics.gender = updated.gender.trim() ? updated.gender.trim() : null;
  set_optional_text_field(person, "born", updated.born);
  person.deceased = updated.is_deceased === "true";
  set_optional_text_field(person, "deathdate", updated.deathdate);
  if (!person.deceased) person.deathdate = null;
  set_optional_text_field(person, "pedigree_symbol", updated.pedigree_symbol);

  set_demographics_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function show_add_diagnosis_dialog() {
  const diagnosis_fields = [
    { key: "code", label: "Code", type: "text" },
    { key: "shorthand", label: "Shorthand", type: "text" },
    { key: "age_of_diagnosis", label: "Age at Diagnosis", type: "text" },
    { key: "date_of_diagnosis", label: "Date of Diagnosis", type: "date" },
    { key: "laterality", label: "Laterality", type: "text" },
    { key: "d_num", label: "Diagnosis #", type: "text" },
  ];

  return show_item_dialog({
    title: "Add Diagnosis",
    submit_text: "Add",
    fields: diagnosis_fields,
    initial_values: {},
    validate: (diagnosis, inputs) => {
      if (!diagnosis.code && !diagnosis.shorthand) {
        inputs.code.focus();
        return false;
      }
      return true;
    },
  });
}

async function add_diagnosis_to_person(person_id) {
  const person = data["people"][person_id];
  if (!person) return;

  const diagnosis = await show_add_diagnosis_dialog();
  if (!diagnosis) return;

  if (!person.diseases) person.diseases = [];
  person.diseases.push(diagnosis);

  set_diagnoses_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function show_edit_diagnosis_dialog(existing_diagnosis) {
  const diagnosis_fields = [
    { key: "code", label: "Code", type: "text" },
    { key: "shorthand", label: "Shorthand", type: "text" },
    { key: "age_of_diagnosis", label: "Age at Diagnosis", type: "text" },
    { key: "date_of_diagnosis", label: "Date of Diagnosis", type: "date" },
    { key: "laterality", label: "Laterality", type: "text" },
    { key: "d_num", label: "Diagnosis #", type: "text" },
  ];

  return show_item_dialog({
    title: "Edit Diagnosis",
    submit_text: "Save",
    fields: diagnosis_fields,
    initial_values: existing_diagnosis || {},
    validate: (diagnosis, inputs) => {
      if (!diagnosis.code && !diagnosis.shorthand) {
        inputs.code.focus();
        return false;
      }
      return true;
    },
  });
}

async function edit_diagnosis_of_person(person_id, diagnosis_index) {
  const person = data["people"][person_id];
  if (!person || !person.diseases || !person.diseases[diagnosis_index]) return;

  const existing_diagnosis = person.diseases[diagnosis_index];
  const updated_diagnosis = await show_edit_diagnosis_dialog(existing_diagnosis);
  if (!updated_diagnosis) return;

  person.diseases[diagnosis_index] = updated_diagnosis;

  set_diagnoses_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function remove_diagnosis_from_person(person_id, diagnosis_index) {
  const person = data["people"][person_id];
  if (!person || !person.diseases || !person.diseases[diagnosis_index]) return;

  const diagnosis = person.diseases[diagnosis_index];
  const diagnosis_label = diagnosis.code || diagnosis.shorthand || ("Diagnosis #" + (diagnosis_index + 1));
  const confirmation = window.confirm("Remove diagnosis '" + diagnosis_label + "'?");
  if (!confirmation) return;

  person.diseases.splice(diagnosis_index, 1);

  set_diagnoses_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function show_add_procedure_dialog() {
  const procedure_fields = [
    { key: "code", label: "Code", type: "text" },
    { key: "shorthand", label: "Shorthand", type: "text" },
    { key: "date_of_procedure", label: "Date of Procedure", type: "date" },
    { key: "proc_num", label: "Procedure #", type: "text" },
  ];

  return show_item_dialog({
    title: "Add Procedure",
    submit_text: "Add",
    fields: procedure_fields,
    initial_values: {},
    validate: (procedure, inputs) => {
      if (!procedure.code && !procedure.shorthand) {
        inputs.code.focus();
        return false;
      }
      return true;
    },
  });
}

async function add_procedure_to_person(person_id) {
  const person = data["people"][person_id];
  if (!person) return;

  const procedure = await show_add_procedure_dialog();
  if (!procedure) return;

  if (!person.procedures) person.procedures = [];
  person.procedures.push(procedure);

  set_procedures_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function show_edit_procedure_dialog(existing_procedure) {
  const procedure_fields = [
    { key: "code", label: "Code", type: "text" },
    { key: "shorthand", label: "Shorthand", type: "text" },
    { key: "date_of_procedure", label: "Date of Procedure", type: "date" },
    { key: "proc_num", label: "Procedure #", type: "text" },
  ];

  return show_item_dialog({
    title: "Edit Procedure",
    submit_text: "Save",
    fields: procedure_fields,
    initial_values: existing_procedure || {},
    validate: (procedure, inputs) => {
      if (!procedure.code && !procedure.shorthand) {
        inputs.code.focus();
        return false;
      }
      return true;
    },
  });
}

function show_item_dialog(options) {
  const {
    title,
    submit_text,
    fields,
    initial_values,
    validate,
  } = options;

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.classList.add("edit-dialog");

    const form = document.createElement("form");
    form.classList.add("edit-dialog-form");
    form.method = "dialog";

    const title_elem = document.createElement("h3");
    title_elem.textContent = title;
    form.appendChild(title_elem);

    const inputs = {};
    fields.forEach((field) => {
      const row = document.createElement("label");
      row.classList.add("edit-dialog-row");

      const label = document.createElement("span");
      label.textContent = field.label;

      const input = document.createElement("input");
      input.type = field.type;
      input.name = field.key;
      input.value = initial_values[field.key] || "";

      row.appendChild(label);
      row.appendChild(input);
      form.appendChild(row);
      inputs[field.key] = input;
    });

    const actions = document.createElement("div");
    actions.classList.add("edit-dialog-actions");

    const cancel_button = document.createElement("button");
    cancel_button.type = "button";
    cancel_button.textContent = "Cancel";

    const save_button = document.createElement("button");
    save_button.type = "button";
    save_button.textContent = submit_text;

    actions.appendChild(cancel_button);
    actions.appendChild(save_button);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    cancel_button.addEventListener("click", function () {
      dialog.close();
      dialog.remove();
      resolve(null);
    });

    save_button.addEventListener("click", function () {
      const item = {};
      fields.forEach((field) => {
        const value = inputs[field.key].value;
        item[field.key] = field.type == "date" ? value : value.trim();
      });

      if (!validate(item, inputs)) {
        return;
      }

      dialog.close();
      dialog.remove();
      resolve(item);
    });

    dialog.addEventListener("cancel", function () {
      dialog.remove();
      resolve(null);
    });

    dialog.showModal();
  });
}

async function edit_procedure_of_person(person_id, procedure_index) {
  const person = data["people"][person_id];
  if (!person || !person.procedures || !person.procedures[procedure_index]) return;

  const existing_procedure = person.procedures[procedure_index];
  const updated_procedure = await show_edit_procedure_dialog(existing_procedure);
  if (!updated_procedure) return;

  person.procedures[procedure_index] = updated_procedure;

  set_procedures_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function remove_procedure_from_person(person_id, procedure_index) {
  const person = data["people"][person_id];
  if (!person || !person.procedures || !person.procedures[procedure_index]) return;

  const procedure = person.procedures[procedure_index];
  const procedure_label = procedure.code || procedure.shorthand || ("Procedure #" + (procedure_index + 1));
  const confirmation = window.confirm("Remove procedure '" + procedure_label + "'?");
  if (!confirmation) return;

  person.procedures.splice(procedure_index, 1);

  set_procedures_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function delete_person_from_data(person_id) {
  const person = data["people"][person_id];
  if (!person) return;

  const person_name = person.name || person_id;
  const confirmation = window.confirm(
    "Delete " + person_name + " (" + person_id + ")? This cannot be undone."
  );
  if (!confirmation) return;

  delete data["people"][person_id];

  for (const candidate_id in data["people"]) {
    const candidate = data["people"][candidate_id];
    if (candidate.mother == person_id) candidate.mother = null;
    if (candidate.father == person_id) candidate.father = null;
  }

  if (annotations && annotations["positions"]) {
    delete annotations["positions"][person_id];
  }

  if (data.general?.proband == person_id) {
    const remaining_people = Object.keys(data["people"]);
    data.general.proband = remaining_people.length > 0 ? remaining_people[0] : null;
  }

  show_summary_block();
  set_study_summary();
  set_family_summary();

  const raw_elem = document.getElementById("raw_data_text");
  if (raw_elem) raw_elem.innerHTML = "";

  display_pedigree();
}

function person_has_no_parents(person) {
  const has_mother = Boolean(person?.mother);
  const has_father = Boolean(person?.father);
  return !has_mother && !has_father;
}

function show_add_parents_dialog() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.classList.add("edit-dialog");

    const form = document.createElement("form");
    form.classList.add("edit-dialog-form");
    form.method = "dialog";

    const title = document.createElement("h3");
    title.textContent = "Add Parents";
    form.appendChild(title);

    const fields = [
      { key: "mother_id", label: "Mother ID", type: "text" },
      { key: "mother_name", label: "Mother Name", type: "text" },
      { key: "father_id", label: "Father ID", type: "text" },
      { key: "father_name", label: "Father Name", type: "text" },
    ];

    const inputs = {};
    fields.forEach((field) => {
      const row = document.createElement("label");
      row.classList.add("edit-dialog-row");

      const label = document.createElement("span");
      label.textContent = field.label + (field.key.endsWith("_id") ? " *" : " (optional)");

      const input = document.createElement("input");
      input.type = field.type;
      input.name = field.key;

      row.appendChild(label);
      row.appendChild(input);
      form.appendChild(row);
      inputs[field.key] = input;
    });

    const error_text = document.createElement("div");
    error_text.classList.add("edit-dialog-error");
    form.appendChild(error_text);

    const actions = document.createElement("div");
    actions.classList.add("edit-dialog-actions");

    const cancel_button = document.createElement("button");
    cancel_button.type = "button";
    cancel_button.textContent = "Cancel";

    const save_button = document.createElement("button");
    save_button.type = "button";
    save_button.textContent = "Add Parents";

    actions.appendChild(cancel_button);
    actions.appendChild(save_button);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    cancel_button.addEventListener("click", function () {
      dialog.close();
      dialog.remove();
      resolve(null);
    });

    save_button.addEventListener("click", function () {
      const result = {
        mother_id: inputs.mother_id.value.trim(),
        mother_name: inputs.mother_name.value.trim(),
        father_id: inputs.father_id.value.trim(),
        father_name: inputs.father_name.value.trim(),
      };

      if (!result.mother_id) {
        error_text.textContent = "Mother ID is required.";
        inputs.mother_id.focus();
        return;
      }

      if (!result.father_id) {
        error_text.textContent = "Father ID is required.";
        inputs.father_id.focus();
        return;
      }

      if (result.mother_id === result.father_id) {
        error_text.textContent = "Mother ID and Father ID must be different.";
        inputs.father_id.focus();
        return;
      }

      dialog.close();
      dialog.remove();
      resolve(result);
    });

    dialog.addEventListener("cancel", function () {
      dialog.remove();
      resolve(null);
    });

    dialog.showModal();
  });
}

function build_parent_person(parent_id, parent_name, gender) {
  return {
    id: parent_id,
    name: parent_name || parent_id,
    demographics: { gender: gender },
    mother: null,
    father: null,
    diseases: [],
    procedures: [],
    deceased: false,
    deathdate: null,
  };
}

async function add_parents_to_person(person_id) {
  const person = data["people"][person_id];
  if (!person || !person_has_no_parents(person)) return;

  const parent_data = await show_add_parents_dialog();
  if (!parent_data) return;

  if (data["people"][parent_data.mother_id]) {
    window.alert("Mother ID already exists in this family. Please use a unique ID.");
    return;
  }

  if (data["people"][parent_data.father_id]) {
    window.alert("Father ID already exists in this family. Please use a unique ID.");
    return;
  }

  data["people"][parent_data.mother_id] = build_parent_person(
    parent_data.mother_id,
    parent_data.mother_name,
    "Female"
  );
  data["people"][parent_data.father_id] = build_parent_person(
    parent_data.father_id,
    parent_data.father_name,
    "Male"
  );

  person.mother = parent_data.mother_id;
  person.father = parent_data.father_id;

  set_demographics_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function get_partner_ids_for_person(person_id) {
  const partners = [];

  for (const candidate_id in data["people"]) {
    const candidate = data["people"][candidate_id];
    if (candidate.mother == person_id && candidate.father) {
      if (!partners.includes(candidate.father)) partners.push(candidate.father);
    }
    if (candidate.father == person_id && candidate.mother) {
      if (!partners.includes(candidate.mother)) partners.push(candidate.mother);
    }
  }

  return partners;
}

function infer_partner_gender(person_gender) {
  if (person_gender == "Male") return "Female";
  if (person_gender == "Female") return "Male";
  return "Unknown";
}

function build_child_person(child_id, child_name, child_gender, child_birthdate) {
  return {
    id: child_id,
    name: child_name || child_id,
    demographics: { gender: child_gender || "Unknown" },
    mother: null,
    father: null,
    born: child_birthdate || null,
    diseases: [],
    procedures: [],
    deceased: false,
    deathdate: null,
  };
}

function assign_parent_links(child_person, current_person_id, current_person_gender, partner_id, partner_gender) {
  if (current_person_gender == "Male") {
    child_person.father = current_person_id;
    child_person.mother = partner_id;
    return;
  }
  if (current_person_gender == "Female") {
    child_person.mother = current_person_id;
    child_person.father = partner_id;
    return;
  }

  if (partner_gender == "Female") {
    child_person.mother = partner_id;
    child_person.father = current_person_id;
    return;
  }
  if (partner_gender == "Male") {
    child_person.mother = current_person_id;
    child_person.father = partner_id;
    return;
  }

  child_person.mother = current_person_id;
  child_person.father = partner_id;
}

function show_add_child_dialog(partner_ids) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.classList.add("edit-dialog");

    const form = document.createElement("form");
    form.classList.add("edit-dialog-form");
    form.method = "dialog";

    const title = document.createElement("h3");
    title.textContent = "Add Child";
    form.appendChild(title);

    const partner_row = document.createElement("label");
    partner_row.classList.add("edit-dialog-row");
    const partner_label = document.createElement("span");
    partner_label.textContent = "Partner ID";
    const partner_select = document.createElement("select");
    partner_select.name = "partner_id";

    const blank_partner_option = document.createElement("option");
    blank_partner_option.value = "";
    blank_partner_option.textContent = "Select partner";
    partner_select.appendChild(blank_partner_option);
    partner_ids.forEach((partner_id) => {
      const option = document.createElement("option");
      option.value = partner_id;
      option.textContent = partner_id;
      partner_select.appendChild(option);
    });
    const new_partner_option = document.createElement("option");
    new_partner_option.value = "__new_partner__";
    new_partner_option.textContent = "New Partner";
    partner_select.appendChild(new_partner_option);
    partner_row.appendChild(partner_label);
    partner_row.appendChild(partner_select);
    form.appendChild(partner_row);

    const new_partner_row = document.createElement("label");
    new_partner_row.classList.add("edit-dialog-row");
    new_partner_row.style.display = "none";
    const new_partner_label = document.createElement("span");
    new_partner_label.textContent = "New Partner ID";
    const new_partner_input = document.createElement("input");
    new_partner_input.type = "text";
    new_partner_input.name = "new_partner_id";
    new_partner_row.appendChild(new_partner_label);
    new_partner_row.appendChild(new_partner_input);
    form.appendChild(new_partner_row);

    const child_id_row = document.createElement("label");
    child_id_row.classList.add("edit-dialog-row");
    const child_id_label = document.createElement("span");
    child_id_label.textContent = "Child ID";
    const child_id_input = document.createElement("input");
    child_id_input.type = "text";
    child_id_input.name = "child_id";
    child_id_row.appendChild(child_id_label);
    child_id_row.appendChild(child_id_input);
    form.appendChild(child_id_row);

    const child_name_row = document.createElement("label");
    child_name_row.classList.add("edit-dialog-row");
    const child_name_label = document.createElement("span");
    child_name_label.textContent = "Child Name";
    const child_name_input = document.createElement("input");
    child_name_input.type = "text";
    child_name_input.name = "child_name";
    child_name_row.appendChild(child_name_label);
    child_name_row.appendChild(child_name_input);
    form.appendChild(child_name_row);

    const child_sex_row = document.createElement("label");
    child_sex_row.classList.add("edit-dialog-row");
    const child_sex_label = document.createElement("span");
    child_sex_label.textContent = "Child Sex (optional)";
    const child_sex_select = document.createElement("select");
    child_sex_select.name = "child_gender";
    ["Unknown", "Male", "Female"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      child_sex_select.appendChild(option);
    });
    child_sex_row.appendChild(child_sex_label);
    child_sex_row.appendChild(child_sex_select);
    form.appendChild(child_sex_row);

    const child_birthdate_row = document.createElement("label");
    child_birthdate_row.classList.add("edit-dialog-row");
    const child_birthdate_label = document.createElement("span");
    child_birthdate_label.textContent = "Child Birthdate (optional)";
    const child_birthdate_input = document.createElement("input");
    child_birthdate_input.type = "date";
    child_birthdate_input.name = "child_birthdate";
    child_birthdate_row.appendChild(child_birthdate_label);
    child_birthdate_row.appendChild(child_birthdate_input);
    form.appendChild(child_birthdate_row);

    const error_text = document.createElement("div");
    error_text.classList.add("edit-dialog-error");
    form.appendChild(error_text);

    const actions = document.createElement("div");
    actions.classList.add("edit-dialog-actions");

    const cancel_button = document.createElement("button");
    cancel_button.type = "button";
    cancel_button.textContent = "Cancel";

    const save_button = document.createElement("button");
    save_button.type = "button";
    save_button.textContent = "Add Child";

    actions.appendChild(cancel_button);
    actions.appendChild(save_button);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    function toggle_new_partner_visibility() {
      const using_new_partner = partner_select.value === "__new_partner__";
      new_partner_row.style.display = using_new_partner ? "grid" : "none";
      if (using_new_partner) new_partner_input.focus();
      else new_partner_input.value = "";
    }

    partner_select.addEventListener("change", toggle_new_partner_visibility);
    toggle_new_partner_visibility();

    save_button.addEventListener("click", function () {
      const using_new_partner = partner_select.value === "__new_partner__";
      const selected_partner_id = using_new_partner ? "" : partner_select.value;
      const typed_new_partner_id = using_new_partner ? new_partner_input.value.trim() : "";

      const result = {
        partner_id: selected_partner_id,
        new_partner_id: typed_new_partner_id,
        child_id: child_id_input.value.trim(),
        child_name: child_name_input.value.trim(),
        child_gender: child_sex_select.value,
        child_birthdate: child_birthdate_input.value,
      };

      if (!result.child_id) {
        error_text.textContent = "Child ID is required.";
        child_id_input.focus();
        return;
      }

      if (using_new_partner && !result.new_partner_id) {
        error_text.textContent = "New Partner ID is required.";
        new_partner_input.focus();
        return;
      }

      if (!using_new_partner && !result.partner_id) {
        error_text.textContent = "Please select a partner.";
        partner_select.focus();
        return;
      }

      dialog.close();
      dialog.remove();
      resolve(result);
    });

    cancel_button.addEventListener("click", function () {
      dialog.close();
      dialog.remove();
      resolve(null);
    });

    dialog.addEventListener("cancel", function () {
      dialog.remove();
      resolve(null);
    });

    dialog.showModal();
  });
}

async function add_child_to_person(person_id) {
  const person = data["people"][person_id];
  if (!person) return;

  const partner_ids = get_partner_ids_for_person(person_id);
  const child_data = await show_add_child_dialog(partner_ids);
  if (!child_data) return;

  if (data["people"][child_data.child_id]) {
    window.alert("Child ID already exists in this family. Please use a unique ID.");
    return;
  }

  const partner_id = child_data.new_partner_id || child_data.partner_id;
  if (!partner_id) {
    window.alert("Partner ID is required.");
    return;
  }

  let partner = data["people"][partner_id];
  if (child_data.new_partner_id) {
    if (data["people"][child_data.new_partner_id]) {
      window.alert("New partner ID already exists in this family. Please use a unique ID.");
      return;
    }
    const partner_gender = infer_partner_gender(person.demographics?.gender);
    data["people"][child_data.new_partner_id] = build_parent_person(
      child_data.new_partner_id,
      "",
      partner_gender
    );
    data["people"][child_data.new_partner_id].name = "";
    partner = data["people"][child_data.new_partner_id];
  }

  if (!partner) {
    window.alert("Selected partner was not found.");
    return;
  }

  const child_person = build_child_person(
    child_data.child_id,
    child_data.child_name,
    child_data.child_gender,
    child_data.child_birthdate
  );
  assign_parent_links(
    child_person,
    person_id,
    person.demographics?.gender,
    partner_id,
    partner.demographics?.gender
  );

  data["people"][child_data.child_id] = child_person;

  set_demographics_of_person(person_id);
  set_diagnoses_of_person(person_id);
  set_procedures_of_person(person_id);
  set_raw_data_of_person(person_id);
  display_pedigree();
}

function set_demographics_of_person(person_id) {
  const elem = document.getElementById("person_demographics");
  elem.innerHTML = "";

  const person = data["people"][person_id];

  if (is_pedigree_build_mode() && person_has_no_parents(person)) {
    const add_parents_button = document.createElement("button");
    add_parents_button.classList.add("add-parents-button", "edit-name-button");
    add_parents_button.type = "button";
    add_parents_button.textContent = "Add Parents";
    add_parents_button.addEventListener("click", function () {
      add_parents_to_person(person_id);
    });
    elem.appendChild(add_parents_button);
  }

  const name_row = document.createElement("div");
  name_row.classList.add("person-name-row");

  const h2 = document.createElement("h2");
  h2.textContent = data["people"][person_id]["name"];
  name_row.appendChild(h2);

  if (is_pedigree_build_mode()) {
    const name_actions = document.createElement("div");
    name_actions.classList.add("person-name-actions");
    const children = find_all_children(person_id) || [];
    const has_children = children.length > 0;

    const edit_name_button = document.createElement("button");
    edit_name_button.classList.add("edit-name-button");
    edit_name_button.type = "button";
    edit_name_button.title = "Edit Name";
    edit_name_button.innerHTML = "&#9998;";

    edit_name_button.addEventListener("click", function () {
      const current_name = data["people"][person_id]["name"] || "";
      const updated_name = window.prompt("Edit name", current_name);
      if (updated_name === null) return;

      const trimmed_name = updated_name.trim();
      if (!trimmed_name) return;

      data["people"][person_id]["name"] = trimmed_name;
      set_demographics_of_person(person_id);
      set_raw_data_of_person(person_id);
      display_pedigree();
    });

    name_actions.appendChild(edit_name_button);
    if (!has_children) {
      const delete_name_button = document.createElement("button");
      delete_name_button.classList.add("edit-name-button", "delete-name-button");
      delete_name_button.type = "button";
      delete_name_button.title = "Delete Person";
      delete_name_button.innerHTML = "&#128465;";
      delete_name_button.addEventListener("click", function () {
        delete_person_from_data(person_id);
      });
      name_actions.appendChild(delete_name_button);
    }

    name_row.appendChild(name_actions);
  }

  elem.appendChild(name_row);

  const table = document.createElement("table");
  table.classList.add("data-display-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const demographics_header = document.createElement("th");
  demographics_header.colSpan = 2;

  const header_content = document.createElement("div");
  header_content.classList.add("section-header-content");

  const header_label = document.createElement("span");
  header_label.textContent = "Demographics";
  header_content.appendChild(header_label);

  if (is_pedigree_build_mode()) {
    const edit_demographics_button = document.createElement("button");
    edit_demographics_button.classList.add("edit-name-button");
    edit_demographics_button.type = "button";
    edit_demographics_button.title = "Edit Demographics";
    edit_demographics_button.innerHTML = "&#9998;";
    edit_demographics_button.addEventListener("click", function () {
      edit_demographics_of_person(person_id);
    });
    header_content.appendChild(edit_demographics_button);
  }

  demographics_header.appendChild(header_content);
  headerRow.appendChild(demographics_header);

  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  add_row_to_table(tbody, "ID", person_id);
  add_row_to_table(tbody, "Sex", data["people"][person_id]["demographics"]["gender"]);

  add_row_to_table(tbody, "Birthdate", data["people"][person_id]["born"]);
  const deceased_state = get_deceased_state(data["people"][person_id]);
  add_row_to_table(tbody, "Deceased", deceased_state.isDeceased ? "true" : "false");
  if (deceased_state.isDeceased) add_row_to_table(tbody, "Deathdate", deceased_state.deathDate);
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
  const show_header = is_pedigree_build_mode() || (diseases && diseases.length > 0);
  if (show_header) {
    const section_header = document.createElement("div");
    section_header.classList.add("section-title-row");

    const h2 = document.createElement("h2");
    h2.textContent = "Diagnoses";
    section_header.appendChild(h2);

    if (is_pedigree_build_mode()) {
      const add_button = document.createElement("button");
      add_button.classList.add("section-add-button");
      add_button.type = "button";
      add_button.title = "Add Diagnosis";
      add_button.textContent = "+";
      add_button.addEventListener("click", function () {
        add_diagnosis_to_person(person_id);
      });
      section_header.appendChild(add_button);
    }

    elem.appendChild(section_header);
  }

  if (diseases && diseases.length > 0) {
    diseases.forEach((disease, diagnosis_index) => {
      // There is a potential error in the code for non-cancer diseases, they include the shorthand as well.  So for now I will trim the code to dbefore the -
      const code = trimAfterCharacter(disease.code, "-");

     
      const table = document.createElement("table");
      table.classList.add("data-display-table");
      if (code[0] == "C") table.classList.add("cancer-diagnosis");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const codeHeader = document.createElement("th");
      codeHeader.colSpan = 2;

      const header_content = document.createElement("div");
      header_content.classList.add("section-header-content");

      const header_label = document.createElement("span");
      header_label.textContent = code + " - " + disease.shorthand;
      header_content.appendChild(header_label);

      if (is_pedigree_build_mode()) {
        const header_actions = document.createElement("div");
        header_actions.classList.add("section-header-actions");

        const edit_button = document.createElement("button");
        edit_button.classList.add("edit-name-button");
        edit_button.type = "button";
        edit_button.title = "Edit Diagnosis";
        edit_button.innerHTML = "&#9998;";
        edit_button.addEventListener("click", function () {
          edit_diagnosis_of_person(person_id, diagnosis_index);
        });

        const delete_button = document.createElement("button");
        delete_button.classList.add("edit-name-button", "delete-name-button");
        delete_button.type = "button";
        delete_button.title = "Remove Diagnosis";
        delete_button.innerHTML = "&#128465;";
        delete_button.addEventListener("click", function () {
          remove_diagnosis_from_person(person_id, diagnosis_index);
        });

        header_actions.appendChild(edit_button);
        header_actions.appendChild(delete_button);
        header_content.appendChild(header_actions);
      }

      codeHeader.appendChild(header_content);
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
    });
  }
} 

function set_procedures_of_person(person_id) {
  const elem = document.getElementById("person_procedures");
  elem.innerHTML = "";

  const procedures = data["people"][person_id]["procedures"];
  const show_header = is_pedigree_build_mode() || (procedures && procedures.length > 0);
  if (show_header) {
    const section_header = document.createElement("div");
    section_header.classList.add("section-title-row");

    const h2 = document.createElement("h2");
    h2.textContent = "Procedures";
    section_header.appendChild(h2);

    if (is_pedigree_build_mode()) {
      const add_button = document.createElement("button");
      add_button.classList.add("section-add-button");
      add_button.type = "button";
      add_button.title = "Add Procedure";
      add_button.textContent = "+";
      add_button.addEventListener("click", function () {
        add_procedure_to_person(person_id);
      });
      section_header.appendChild(add_button);
    }

    elem.appendChild(section_header);
  }

  if (procedures && procedures.length > 0) {
    procedures.forEach((procedure, procedure_index) => {
      // There is a potential error in the code for non-cancer diseases, they include the shorthand as well.  So for now I will trim the code to dbefore the -
      const code = trimAfterCharacter(procedure.code, "-");

      const table = document.createElement("table");
      table.classList.add("data-display-table");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const codeHeader = document.createElement("th");
      codeHeader.colSpan = 2;

      const header_content = document.createElement("div");
      header_content.classList.add("section-header-content");

      const header_label = document.createElement("span");
      header_label.textContent = code + " - " + procedure.shorthand;
      header_content.appendChild(header_label);

      if (is_pedigree_build_mode()) {
        const header_actions = document.createElement("div");
        header_actions.classList.add("section-header-actions");

        const edit_button = document.createElement("button");
        edit_button.classList.add("edit-name-button");
        edit_button.type = "button";
        edit_button.title = "Edit Procedure";
        edit_button.innerHTML = "&#9998;";
        edit_button.addEventListener("click", function () {
          edit_procedure_of_person(person_id, procedure_index);
        });

        const delete_button = document.createElement("button");
        delete_button.classList.add("edit-name-button", "delete-name-button");
        delete_button.type = "button";
        delete_button.title = "Remove Procedure";
        delete_button.innerHTML = "&#128465;";
        delete_button.addEventListener("click", function () {
          remove_procedure_from_person(person_id, procedure_index);
        });

        header_actions.appendChild(edit_button);
        header_actions.appendChild(delete_button);
        header_content.appendChild(header_actions);
      }

      codeHeader.appendChild(header_content);
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
    });
  }

  if (is_pedigree_build_mode()) {
    const add_child_button = document.createElement("button");
    add_child_button.classList.add("add-child-button", "edit-name-button");
    add_child_button.type = "button";
    add_child_button.textContent = "Add Child";
    add_child_button.addEventListener("click", function () {
      add_child_to_person(person_id);
    });
    elem.appendChild(add_child_button);
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
    const selectedValue = current_action_mode;

    if (selectedValue == "details") {
      // Log the person data to the console
      set_study_summary();
      set_details_of_person(person_id);

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

  if (has_clinical_entries(person)) el.setAttributeNS(null, "stroke-width", "3");
  else el.setAttributeNS(null, "stroke-width", "1");

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

  if (has_clinical_entries(person)) el.setAttributeNS(null, "stroke-width", "3");
  else el.setAttributeNS(null, "stroke-width", "1");

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

  if (has_clinical_entries(person)) el.setAttributeNS(null, "stroke-width", "3");
  else el.setAttributeNS(null, "stroke-width", "1");

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);
  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
  }

}

function draw_slash(person_id) {
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

function has_clinical_entries(person) {
  const diagnosis_count = person?.diseases?.length || 0;
  const procedure_count = person?.procedures?.length || 0;
  return diagnosis_count > 0 || procedure_count > 0;
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

  const deceased_state = get_deceased_state(data["people"][person_id]);
  const deceased = deceased_state.isDeceased ? deceased_state.deathDate : null;

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

export function set_other_alert(person_id, message) {
  other_alerts[person_id] = message;
}

///
// Quadrants

function check_quadrant_tr(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  return check_quadrant_match(person_id, config.quadrants?.top_right);
}


function check_quadrant_tl(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  return check_quadrant_match(person_id, config.quadrants?.top_left);
}

function check_quadrant_bl(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  return check_quadrant_match(person_id, config.quadrants?.bottom_left);
}

function check_quadrant_br(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  return check_quadrant_match(person_id, config.quadrants?.bottom_right);
}

function normalize_disease_code(raw_code) {
  if (!raw_code || typeof raw_code !== "string") return null;

  const without_decimals = raw_code.toUpperCase().replace(/\./g, "").trim();
  const match = without_decimals.match(/^([A-Z]\d{2,})/);
  if (!match) return null;

  return match[1];
}

function normalize_quadrant_code(raw_code) {
  if (!raw_code || typeof raw_code !== "string") return null;

  const without_decimals = raw_code.toUpperCase().replace(/\./g, "").trim();
  const match = without_decimals.match(/^([A-Z]\d{2,})/);
  if (!match) return null;

  return match[1];
}

function normalize_children_of_prefix(raw_code) {
  if (!raw_code || typeof raw_code !== "string") return null;

  const without_decimals = raw_code.toUpperCase().replace(/\./g, "").trim();
  if (!without_decimals) return null;

  // Support broad prefixes like "C" and preserve alphanumeric markers like "D70X".
  const match = without_decimals.match(/^([A-Z][A-Z0-9]*)/);
  if (!match) return null;

  return match[1];
}

function normalize_disease_prefix_code(raw_code) {
  if (!raw_code || typeof raw_code !== "string") return null;

  const without_decimals = raw_code.toUpperCase().replace(/\./g, "").trim();
  const match = without_decimals.match(/^([A-Z][A-Z0-9]*)/);
  if (!match) return null;

  return match[1];
}

function check_quadrant_match(person_id, quadrant_config) {
  const quadrant_type = quadrant_config?.type;
  if (!quadrant_config || (quadrant_type !== "disease" && quadrant_type !== "cancer")) return;

  const person = data["people"][person_id];
  if (!person?.diseases?.length) return;

  const valid_codes = (quadrant_config.codes || [])
    .map(normalize_quadrant_code)
    .filter(Boolean);
  const child_prefixes = (quadrant_config.children_of || [])
    .map(normalize_children_of_prefix)
    .filter(Boolean);

  for (const disease of person.diseases) {
    if (!disease.code) {
      set_other_alert(person_id, "has null diseases");
      continue;
    }

    const normalized_code = normalize_disease_code(disease.code);
    if (!normalized_code) continue;

    if (valid_codes.includes(normalized_code)) {
      return normalized_code;
    }

    const normalized_prefix_code = normalize_disease_prefix_code(disease.code);
    if (normalized_prefix_code && child_prefixes.some((prefix) => normalized_prefix_code.startsWith(prefix))) {
      return normalized_prefix_code;
    }
  }
}

function draw_quadrants_male(person_id) {

  const size = config.size / 2;
  const center_x = data["people"][person_id].x;
  const center_y = data["people"][person_id].y;
  let code = false;

  if (code = check_quadrant_tr(person_id)) {
    const el = draw_square(size, center_x, center_y - size, config.quadrants.top_right?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
  }
  if (code = check_quadrant_tl(person_id)) {
    const el = draw_square(size, center_x - size, center_y -size, config.quadrants.top_left?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
  }
  if (code = check_quadrant_br(person_id)) {
    const el = draw_square(size, center_x, center_y, config.quadrants.bottom_right?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
  }
  if (code = check_quadrant_bl(person_id)) {
    const el = draw_square(size, center_x - size, center_y, config.quadrants.bottom_left?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
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
  el.setAttributeNS(null, "pointer-events", "none");

  var svg = document.getElementById("svg");
  svg.appendChild(el);

  return el;

}


function draw_quadrants_unknown(person_id) {
}


/////////////////////