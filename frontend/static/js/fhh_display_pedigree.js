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
const pencil_cursor = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22m4 20 4-.8L20 7.2 16.8 4 4.8 16z%22 fill=%22white%22 stroke=%22black%22 stroke-width=%222%22/%3E%3C/svg%3E") 4 20, crosshair';
var config;
var data;
var annotations;
var study_name;
let other_alerts = {};

let family_tree = [];
let people_drawn = [];
let pending_line_start = null;
let pending_line_element = null;
let pending_text_annotation = null;
let selected_annotation = null;
let alert_dismiss_timer = null;
let alert_is_pinned = false;
const alert_auto_dismiss_delay = 10000;
const annotation_selection_tolerance = 14;
const annotation_endpoint_tolerance = 18;
const annotation_colors = {
  lines: "#000000",
  arrows: "#000000",
  texts: "#000000",
};
let dragging_annotation = false;
let annotation_move_origin = null;

let increment = 0;

function set_selection_loading(is_loading) {
  const loading_overlay = document.getElementById("selection-loading-overlay");
  if (!loading_overlay) return;
  loading_overlay.style.display = is_loading ? "flex" : "none";
  loading_overlay.setAttribute("aria-hidden", String(!is_loading));
}

const debug_offset = { x: 5000, y: 400 };
var center_offset = {};

export function get_config() {
  return config;
}


let study_select = document.getElementById("study_select");
study_select.addEventListener("change", function (event) {
  study_name = event.target.value;
  set_selection_loading(true);
  Promise.all([
    load_study_config(study_name)
      .then((loadedConfig) => {
        config = loadedConfig;
        update_build_mode_actions_visibility();
      }),
    check_for_families(study_name),
  ])
    .catch((error) => {
      console.error("Failed to load study data:", error);
    })
    .finally(() => {
      set_selection_loading(false);
    });
});

let family_select = document.getElementById("families_select");
family_select.addEventListener("change", function (event) {
  if (!study_name) {
    return;
  }

  set_selection_loading(true);
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
    })
    .finally(() => {
      set_selection_loading(false);
    });
});

let clear_alert_elem = document.getElementById("clear-alert-button");
clear_alert_elem.addEventListener("click", function () {
  const alert_elem = document.getElementById("alert");
  clearTimeout(alert_dismiss_timer);
  alert_dismiss_timer = null;
  alert_is_pinned = false;
  alert_elem.replaceChildren(clear_alert_elem);
  alert_elem.style.backgroundColor = "#FFF";
  alert_elem.style.border = "none";
  alert_elem.style.display = "none";
});

let warning_area_elem = document.getElementById("alert");
warning_area_elem.addEventListener("click", function () {
  if (warning_area_elem.style.display === "none") return;
  alert_is_pinned = true;
  clearTimeout(alert_dismiss_timer);
  alert_dismiss_timer = null;
});

let save_elem = document.getElementById("save-button");
save_elem.addEventListener("click", async function () {
  finish_pending_text_annotation();
  try {
    await save_positions_and_annotations(data, annotations);
    show_save_export_status("File saved.", true);
  } catch (error) {
    show_save_export_status(`File save failed: ${error?.message || "Unknown error"}`, false);
  }
});

let delete_annotation_elem = document.getElementById("delete-annotation-button");
delete_annotation_elem.addEventListener("click", delete_selected_annotation);
const annotation_color_input = document.getElementById("annotation-color");
annotation_color_input.addEventListener("input", function () {
  const color = annotation_color_input.value;
  Object.keys(annotation_colors).forEach((collection) => {
    annotation_colors[collection] = color;
  });
  if (selected_annotation) update_annotation_color(selected_annotation, color);
});

// Non-standard attributes used internally to wire up interactivity (see fhh_move.js
// attribute selectors); PowerPoint's SVG parser rejects them, so strip them on export.
const CUSTOM_SVG_ATTRIBUTES = [
  "name",
  "sex",
  "mother_id",
  "father_id",
  "p_mother_id",
  "p_father_id",
  "child_id",
  "c_mother_id",
  "c_father_id",
];

function strip_custom_svg_attributes(svg_elem) {
  const clone = svg_elem.cloneNode(true);
  clone.querySelectorAll("*").forEach((el) => {
    CUSTOM_SVG_ATTRIBUTES.forEach((attr) => el.removeAttribute(attr));
  });
  return clone;
}

let save_svg_elem = document.getElementById("save-svg-button");
save_svg_elem.addEventListener("click", function () {
  try {
    const svg_elem = document.getElementById("svg");
    if (!svg_elem) throw new Error("No pedigree SVG is available to export.");

    const clean_svg_elem = strip_custom_svg_attributes(svg_elem);
    const svg_markup = new XMLSerializer().serializeToString(clean_svg_elem);
    const family_id = family_select.value?.trim() || "family";
    const filename = `${family_id}.svg`;

    const blob = new Blob([svg_markup], { type: "image/svg+xml" });
    const download_url = URL.createObjectURL(blob);
    const download_link = document.createElement("a");
    download_link.href = download_url;
    download_link.download = filename;
    document.body.appendChild(download_link);
    download_link.click();
    download_link.remove();
    URL.revokeObjectURL(download_url);
    show_save_export_status("File exported.", true);
  } catch (error) {
    show_save_export_status(`File export failed: ${error?.message || "Unknown error"}`, false);
  }
});

let save_family_elem = document.getElementById("save-family-button");
if (save_family_elem) {
  save_family_elem.addEventListener("click", async function () {
    try {
      await save_family_json(data);
      show_save_export_status("File saved.", true);
    } catch (error) {
      console.error("Error saving family:", error);
      show_save_export_status(`File save failed: ${error?.message || "Unknown error"}`, false);
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
    finish_pending_text_annotation();
    set_current_action_mode(radio_elem.value);
    clear_pending_line();
    if (radio_elem.value !== "annotation-select") {
      clear_selected_annotation();
    }
  });
});


document.addEventListener("DOMContentLoaded", async function () {
  set_selection_loading(true);
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
      const result = await load_config_and_data(study_name, family, study_name);
      if (result) {
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
      }
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    set_selection_loading(false);
  }
});

function show_all_blocks() {
  const text_blocks = document.getElementsByClassName("textblock");
  Array.from(text_blocks).forEach(block => {
    block.style.display = "block";
  });

  const alert_blocks = document.getElementsByClassName("alertbar");
  Array.from(alert_blocks).forEach(block => {
    block.style.display = block.querySelector(".alert-line, .alert-status") ? "grid" : "none";
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
  clear_pending_line();
  clear_selected_annotation();
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
  draw_annotation_lines();
  draw_annotation_arrows();
  draw_annotation_texts();

  add_alert_bar();
}

function add_alert_bar() {
  let active_alerts = false;
  const alert_elem = document.getElementById("alert");
  clearTimeout(alert_dismiss_timer);
  alert_dismiss_timer = null;
  alert_is_pinned = false;
  alert_elem.replaceChildren(clear_alert_elem);

  active_alerts |= add_overlap_alerts(alert_elem);
  active_alerts |= add_unplaced_people_alerts(alert_elem);
  active_alerts |= add_other_alerts(alert_elem);
  alert_elem.style.display = active_alerts ? "grid" : "none";

  if (!active_alerts) {
    alert_elem.style.backgroundColor = "white";
    alert_elem.style.border = "";
    return;
  }

  alert_dismiss_timer = setTimeout(function () {
    if (!alert_is_pinned) alert_elem.style.display = "none";
    alert_dismiss_timer = null;
  }, alert_auto_dismiss_delay);
}

function show_save_export_status(message, succeeded) {
  const alert_elem = document.getElementById("alert");
  clearTimeout(alert_dismiss_timer);
  alert_dismiss_timer = null;
  alert_is_pinned = false;
  alert_elem.replaceChildren(clear_alert_elem);

  const status_elem = document.createElement("div");
  status_elem.className = "alert-status";
  status_elem.textContent = message;
  alert_elem.append(status_elem);
  alert_elem.style.backgroundColor = succeeded ? "#DFF0D8" : "#FDD";
  alert_elem.style.border = succeeded ? "1px solid #39824A" : "1px dashed #F00";
  alert_elem.style.display = "grid";

  alert_dismiss_timer = setTimeout(function () {
    if (!alert_is_pinned) alert_elem.style.display = "none";
    alert_dismiss_timer = null;
  }, alert_auto_dismiss_delay);
}

function add_overlap_alerts(alert_elem) {
  const overlaps = check_for_overlaps(family_tree);

  if (overlaps && Object.keys(overlaps).length > 0) {
    alert_elem.style.backgroundColor = "#FDD";
    alert_elem.style.border = "1px dashed #F00";
    const p = document.createElement("p");
    p.classList.add("alert-line");
    alert_elem.append(p);
    add_alert_heading(p, "Overlaps:");
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
    add_alert_heading(p, "Missing People:");
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
    add_alert_heading(p, "Other Alerts:");
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

function add_alert_heading(alert_line, text) {
  const heading = document.createElement("span");
  heading.classList.add("alert-heading");
  heading.textContent = text;
  alert_line.append(heading);
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

  // Saved annotation positions can fall outside the default grid-based frame
  // (e.g. after manual dragging); grow the canvas before drawing the header so
  // the header text can be anchored to the true (possibly expanded) left edge.
  if (annotations?.positions) {
    for (const person_id in data["people"]) {
      const person = data["people"][person_id];
      if (person.gen != null && person.loc != null) {
        const center = get_center(person);
        expand_canvas_to_fit(center.x, center.y);
      }
    }
  }

  draw_svg_header_info();

  //const r2 = draw_rectangle(width_of_svg - 2, height_of_svg - 2, 1, 1);
  //r2.setAttributeNS(null, "stroke", "black");
  //r2.setAttributeNS(null, "fill", "white");
  //r2.setAttributeNS(null, "stroke-width", "2");

  //  const center = draw_circle(10, center_offset.x, center_offset.y);
  //  center.setAttributeNS(null, "fill", "blue");
}

// Expands the live SVG's viewBox/width/height (in place) so the given point,
// plus some padding for the shape and its label, stays within the visible canvas.
function expand_canvas_to_fit(x, y) {
  const svgElem = document.getElementById("svg");
  if (!svgElem) return;

  const viewBox = svgElem.getAttribute("viewBox");
  if (!viewBox) return;
  const [min_x, min_y, width, height] = viewBox.split(" ").map(Number);
  const padding = (config?.size || 40) * 1.5;

  const new_min_x = Math.min(min_x, x - padding);
  const new_min_y = Math.min(min_y, y - padding);
  const new_max_x = Math.max(min_x + width, x + padding);
  const new_max_y = Math.max(min_y + height, y + padding);

  if (new_min_x === min_x && new_min_y === min_y && new_max_x === min_x + width && new_max_y === min_y + height) {
    return;
  }

  const new_width = new_max_x - new_min_x;
  const new_height = new_max_y - new_min_y;

  svgElem.setAttributeNS(null, "viewBox", new_min_x + " " + new_min_y + " " + new_width + " " + new_height);
  svgElem.setAttributeNS(null, "width", new_width);
  svgElem.setAttributeNS(null, "height", new_height);
}

// Called from fhh_move.js while the user drags a person outside the current canvas.
export function ensure_canvas_fits_point(x, y) {
  expand_canvas_to_fit(x, y);
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
  add_annotation_arrow_marker(svgElem);

  var svgContainer = document.getElementById("main");
  svgContainer.innerHTML = "";
  svgContainer.appendChild(svgElem);

  addSvgListeners(svgElem);
  svgElem.addEventListener("click", handle_line_annotation_click);
  svgElem.addEventListener("dblclick", handle_text_annotation_double_click);
  svgElem.addEventListener("mousemove", update_line_annotation_preview);
  svgElem.addEventListener("mousemove", update_annotation_hover);
  svgElem.addEventListener("mousedown", select_annotation_on_mousedown);
  svgElem.addEventListener("mousedown", start_annotation_move);
  svgElem.addEventListener("mousemove", move_selected_annotation);
  svgElem.addEventListener("mouseup", finish_annotation_move);
  svgElem.addEventListener("mouseleave", finish_annotation_move);
  update_line_cursor();
  return svgElem;
}

function update_line_cursor() {
  const svg_elem = document.getElementById("svg");
  if (!svg_elem) return;
  if (dragging_annotation) {
    svg_elem.style.cursor = "grabbing";
  } else if (current_action_mode === "annotation-select" && selected_annotation) {
    svg_elem.style.cursor = "grab";
  } else if (current_action_mode !== "annotation-line" && current_action_mode !== "annotation-arrow") {
    svg_elem.style.cursor = "";
  } else {
    svg_elem.style.cursor = pending_line_start ? "crosshair" : pencil_cursor;
  }
}

function get_svg_point(svg_elem, event) {
  const screen_matrix = svg_elem.getScreenCTM();
  if (!screen_matrix) return null;

  const screen_point = svg_elem.createSVGPoint();
  screen_point.x = event.clientX;
  screen_point.y = event.clientY;
  return screen_point.matrixTransform(screen_matrix.inverse());
}

function update_annotation_hover(event) {
  if (dragging_annotation) return;

  if (pending_line_start && (current_action_mode === "annotation-line" || current_action_mode === "annotation-arrow")) {
    update_line_cursor();
    return;
  }

  const point = get_svg_point(event.currentTarget, event);
  if (point && find_annotation_at_point(point)) {
    event.currentTarget.style.cursor = "grab";
  } else {
    update_line_cursor();
  }
}

function select_annotation_on_mousedown(event) {
  if (pending_line_start && (current_action_mode === "annotation-line" || current_action_mode === "annotation-arrow")) return;

  const point = get_svg_point(event.currentTarget, event);
  const hit_annotation = point ? find_annotation_at_point(point) : null;
  if (hit_annotation) activate_annotation_selection(event.currentTarget, hit_annotation);
}

function activate_annotation_selection(svg_elem, annotation) {
  clear_pending_line();
  const select_radio = document.getElementById("annotation-select");
  if (select_radio && !select_radio.checked) {
    select_radio.checked = true;
    select_radio.dispatchEvent(new Event("change"));
  }
  set_selected_annotation(annotation);
  svg_elem.style.cursor = "grab";
}

function handle_line_annotation_click(event) {
  const svg_elem = event.currentTarget;
  const point = get_svg_point(svg_elem, event);
  if (!point) return;

  const completing_line = pending_line_start &&
    (current_action_mode === "annotation-line" || current_action_mode === "annotation-arrow");
  const hit_annotation = completing_line ? null : find_annotation_at_point(point);
  if (hit_annotation) {
    activate_annotation_selection(svg_elem, hit_annotation);
    return;
  }

  if (current_action_mode === "annotation-text") {
    start_text_annotation(event, point);
    return;
  }

  if (current_action_mode === "annotation-select") {
    set_selected_annotation(null);
    return;
  }

  if (current_action_mode !== "annotation-line" && current_action_mode !== "annotation-arrow") return;

  if (!pending_line_start) {
    pending_line_start = { x: point.x, y: point.y };
    const collection = current_action_mode === "annotation-arrow" ? "arrows" : "lines";
    pending_line_element = current_action_mode === "annotation-arrow"
      ? draw_arrow(point.x, point.y, point.x, point.y, annotation_colors.arrows)
      : draw_line(point.x, point.y, point.x, point.y);
    pending_line_element.setAttribute("stroke", annotation_colors[collection]);
    pending_line_element.setAttribute("stroke-width", "2");
    pending_line_element.setAttribute("pointer-events", "none");
    update_line_cursor();
    return;
  }

  pending_line_element.setAttribute("x2", point.x);
  pending_line_element.setAttribute("y2", point.y);
  annotations = annotations || {};
  const collection = current_action_mode === "annotation-arrow" ? "arrows" : "lines";
  annotations[collection] = Array.isArray(annotations[collection]) ? annotations[collection] : [];
  const annotation_index = annotations[collection].length;
  annotations[collection].push({
    x1: pending_line_start.x,
    y1: pending_line_start.y,
    x2: point.x,
    y2: point.y,
    color: annotation_colors[collection],
  });
  pending_line_element.setAttribute("data-annotation-collection", collection);
  pending_line_element.setAttribute("data-annotation-index", annotation_index);
  pending_line_start = null;
  pending_line_element = null;
  update_line_cursor();
}

function handle_text_annotation_double_click(event) {
  const point = get_svg_point(event.currentTarget, event);
  if (!point) return;

  const hit_annotation = find_annotation_at_point(point);
  if (!hit_annotation || hit_annotation.collection !== "texts") return;

  event.preventDefault();
  const select_radio = document.getElementById("annotation-select");
  if (select_radio && !select_radio.checked) {
    select_radio.checked = true;
    select_radio.dispatchEvent(new Event("change"));
  }
  set_selected_annotation(hit_annotation);
  start_text_annotation_edit(event, hit_annotation);
}

function update_line_annotation_preview(event) {
  if ((current_action_mode !== "annotation-line" && current_action_mode !== "annotation-arrow") || !pending_line_element) return;

  const point = get_svg_point(event.currentTarget, event);
  if (!point) return;
  pending_line_element.setAttribute("x2", point.x);
  pending_line_element.setAttribute("y2", point.y);
}

function clear_pending_line() {
  pending_line_start = null;
  pending_line_element?.remove();
  pending_line_element = null;
  update_line_cursor();
}

function draw_annotation_lines() {
  if (!Array.isArray(annotations?.lines)) return;

  annotations.lines.forEach((line, index) => {
    const line_elem = draw_line(line.x1, line.y1, line.x2, line.y2);
    line_elem.setAttribute("stroke", line.color || "#000000");
    line_elem.setAttribute("stroke-width", "2");
    line_elem.setAttribute("pointer-events", "none");
    line_elem.setAttribute("data-annotation-collection", "lines");
    line_elem.setAttribute("data-annotation-index", index);
  });
}

function draw_annotation_arrows() {
  if (!Array.isArray(annotations?.arrows)) return;

  annotations.arrows.forEach((arrow, index) => {
    const arrow_elem = draw_arrow(arrow.x1, arrow.y1, arrow.x2, arrow.y2, arrow.color || "#000000");
    arrow_elem.setAttribute("stroke-width", "2");
    arrow_elem.setAttribute("pointer-events", "none");
    arrow_elem.setAttribute("data-annotation-collection", "arrows");
    arrow_elem.setAttribute("data-annotation-index", index);
  });
}

function draw_annotation_texts() {
  if (!Array.isArray(annotations?.texts)) return;

  annotations.texts.forEach((text, index) => {
    create_annotation_text_element(text, index);
  });
}

function create_annotation_text_element(text, index) {
  const text_elem = document.createElementNS(svgns, "text");
  text_elem.setAttribute("x", text.x);
  text_elem.setAttribute("y", text.y);
  text_elem.setAttribute("dominant-baseline", "hanging");
  text_elem.setAttribute("font-family", "Arial, sans-serif");
  text_elem.setAttribute("font-size", Math.max(16, (config?.size || 40) * 0.5));
  text_elem.setAttribute("fill", text.color || "#000000");
  text_elem.setAttribute("stroke", "none");
  text_elem.setAttribute("pointer-events", "none");
  text_elem.setAttribute("data-annotation-collection", "texts");
  text_elem.setAttribute("data-annotation-index", index);
  text_elem.textContent = text.text || "";
  document.getElementById("svg").appendChild(text_elem);
  return text_elem;
}

function start_text_annotation(event, point) {
  finish_pending_text_annotation();
  annotations = annotations || {};
  annotations.texts = Array.isArray(annotations.texts) ? annotations.texts : [];

  const text_annotation = { x: point.x, y: point.y, text: "", color: annotation_colors.texts };
  const text_index = annotations.texts.length;
  annotations.texts.push(text_annotation);
  const text_element = create_annotation_text_element(text_annotation, text_index);
  open_text_annotation_editor(event, text_annotation, text_element, text_index, true);
}

function start_text_annotation_edit(event, annotation) {
  finish_pending_text_annotation();
  const text_annotation = annotations.texts[annotation.index];
  open_text_annotation_editor(event, text_annotation, annotation.element, annotation.index, false);
}

function open_text_annotation_editor(event, text_annotation, text_element, text_index, is_new) {
  const editor = document.createElement("textarea");
  editor.className = "annotation-text-editor";
  editor.setAttribute("aria-label", "Annotation text");
  editor.rows = 1;
  editor.style.left = `${event.clientX}px`;
  editor.style.top = `${event.clientY}px`;
  editor.value = text_annotation.text || "";
  document.body.appendChild(editor);

  pending_text_annotation = {
    collection: "texts",
    index: text_index,
    item: text_annotation,
    element: text_element,
    editor,
    is_new,
    original_text: text_annotation.text || "",
  };
  editor.addEventListener("input", function () {
    text_annotation.text = editor.value;
    text_element.textContent = editor.value;
  });
  editor.addEventListener("keydown", function (key_event) {
    if (key_event.key === "Enter") {
      key_event.preventDefault();
      finish_pending_text_annotation();
    } else if (key_event.key === "Escape") {
      key_event.preventDefault();
      cancel_pending_text_annotation();
    }
  });
  editor.focus();
}

function finish_pending_text_annotation() {
  if (!pending_text_annotation) return;

  const pending = pending_text_annotation;
  pending.item.text = pending.editor.value;
  pending.element.textContent = pending.editor.value;
  pending.editor.remove();
  pending_text_annotation = null;

  if (!pending.item.text.trim()) {
    remove_annotation_at(pending.collection, pending.index);
  }
}

function cancel_pending_text_annotation() {
  if (!pending_text_annotation) return;

  const pending = pending_text_annotation;
  pending.editor.remove();
  pending_text_annotation = null;
  if (pending.is_new) {
    remove_annotation_at(pending.collection, pending.index);
  } else {
    pending.item.text = pending.original_text;
    pending.element.textContent = pending.original_text;
  }
}

function find_annotation_at_point(point) {
  let nearest_annotation = null;
  let nearest_distance = annotation_endpoint_tolerance;

  ["lines", "arrows", "texts"].forEach((collection) => {
    const items = annotations?.[collection];
    if (!Array.isArray(items)) return;

    items.forEach((item, index) => {
      const element = document.querySelector(
        `#svg [data-annotation-collection="${collection}"][data-annotation-index="${index}"]`
      );
      if (!element) return;

      const distance = collection === "texts"
        ? distance_to_text(point, element)
        : distance_to_segment(point, item);
      if (distance <= nearest_distance) {
        nearest_distance = distance;
        nearest_annotation = { collection, index, element };
      }
    });
  });

  return nearest_annotation;
}

function distance_to_segment(point, segment) {
  const delta_x = segment.x2 - segment.x1;
  const delta_y = segment.y2 - segment.y1;
  const length_squared = delta_x * delta_x + delta_y * delta_y;
  const projection = length_squared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - segment.x1) * delta_x + (point.y - segment.y1) * delta_y) / length_squared));
  const nearest_x = segment.x1 + projection * delta_x;
  const nearest_y = segment.y1 + projection * delta_y;
  return Math.hypot(point.x - nearest_x, point.y - nearest_y);
}

function distance_to_text(point, element) {
  const bounds = element.getBBox();
  const distance_x = Math.max(bounds.x - point.x, 0, point.x - bounds.x - bounds.width);
  const distance_y = Math.max(bounds.y - point.y, 0, point.y - bounds.y - bounds.height);
  return Math.hypot(distance_x, distance_y);
}

function get_annotation_move_target(point, annotation) {
  if (annotation.collection === "texts") {
    return distance_to_text(point, annotation.element) <= annotation_selection_tolerance ? "whole" : null;
  }

  const item = annotations[annotation.collection][annotation.index];
  const start_distance = Math.hypot(point.x - item.x1, point.y - item.y1);
  const end_distance = Math.hypot(point.x - item.x2, point.y - item.y2);
  if (Math.min(start_distance, end_distance) <= annotation_endpoint_tolerance) {
    return start_distance <= end_distance ? "start" : "end";
  }
  return distance_to_segment(point, item) <= annotation_selection_tolerance ? "whole" : null;
}

function start_annotation_move(event) {
  if (current_action_mode !== "annotation-select") return;

  const point = get_svg_point(event.currentTarget, event);
  if (!point) return;
  const hit_annotation = find_annotation_at_point(point);
  if (!hit_annotation) return;

  set_selected_annotation(hit_annotation);
  const move_target = get_annotation_move_target(point, hit_annotation);
  if (!move_target) return;

  const item = annotations[hit_annotation.collection][hit_annotation.index];
  annotation_move_origin = {
    target: move_target,
    point,
    x: item.x,
    y: item.y,
    x1: item.x1,
    y1: item.y1,
    x2: item.x2,
    y2: item.y2,
  };
  dragging_annotation = true;
  event.preventDefault();
  update_line_cursor();
}

function move_selected_annotation(event) {
  if (!dragging_annotation || !selected_annotation || !annotation_move_origin) return;

  const point = get_svg_point(event.currentTarget, event);
  if (!point) return;

  const delta_x = point.x - annotation_move_origin.point.x;
  const delta_y = point.y - annotation_move_origin.point.y;
  const item = annotations[selected_annotation.collection][selected_annotation.index];
  if (selected_annotation.collection === "texts") {
    item.x = annotation_move_origin.x + delta_x;
    item.y = annotation_move_origin.y + delta_y;
    selected_annotation.element.setAttribute("x", item.x);
    selected_annotation.element.setAttribute("y", item.y);
  } else if (annotation_move_origin.target === "start") {
    item.x1 = annotation_move_origin.x1 + delta_x;
    item.y1 = annotation_move_origin.y1 + delta_y;
    selected_annotation.element.setAttribute("x1", item.x1);
    selected_annotation.element.setAttribute("y1", item.y1);
  } else if (annotation_move_origin.target === "end") {
    item.x2 = annotation_move_origin.x2 + delta_x;
    item.y2 = annotation_move_origin.y2 + delta_y;
    selected_annotation.element.setAttribute("x2", item.x2);
    selected_annotation.element.setAttribute("y2", item.y2);
  } else {
    item.x1 = annotation_move_origin.x1 + delta_x;
    item.y1 = annotation_move_origin.y1 + delta_y;
    item.x2 = annotation_move_origin.x2 + delta_x;
    item.y2 = annotation_move_origin.y2 + delta_y;
    selected_annotation.element.setAttribute("x1", item.x1);
    selected_annotation.element.setAttribute("y1", item.y1);
    selected_annotation.element.setAttribute("x2", item.x2);
    selected_annotation.element.setAttribute("y2", item.y2);
  }
  event.preventDefault();
}

function finish_annotation_move() {
  if (!dragging_annotation) return;
  dragging_annotation = false;
  annotation_move_origin = null;
  update_line_cursor();
}

function set_selected_annotation(annotation) {
  if (selected_annotation?.element) {
    const previous_item = annotations?.[selected_annotation.collection]?.[selected_annotation.index];
    const previous_color = previous_item?.color || "#000000";
    if (selected_annotation.collection === "texts") {
      selected_annotation.element.setAttribute("fill", previous_color);
    } else {
      selected_annotation.element.setAttribute("stroke", previous_color);
      selected_annotation.element.setAttribute("stroke-width", "2");
    }
  }

  selected_annotation = annotation;
  if (selected_annotation?.element) {
    const item = annotations?.[selected_annotation.collection]?.[selected_annotation.index];
    const color = item?.color || "#000000";
    Object.keys(annotation_colors).forEach((collection) => {
      annotation_colors[collection] = color;
    });
    annotation_color_input.value = color;
    if (selected_annotation.collection === "texts") {
      selected_annotation.element.setAttribute("fill", "#d34b35");
    } else {
      selected_annotation.element.setAttribute("stroke", "#d34b35");
      selected_annotation.element.setAttribute("stroke-width", "5");
    }
  }
  delete_annotation_elem.disabled = !selected_annotation;
  update_line_cursor();
}

function update_annotation_color(annotation, color) {
  const item = annotations?.[annotation.collection]?.[annotation.index];
  if (!item) return;
  item.color = color;

  const is_selected = selected_annotation?.collection === annotation.collection && selected_annotation.index === annotation.index;
  if (annotation.collection === "texts") {
    annotation.element.setAttribute("fill", is_selected ? "#d34b35" : color);
  } else {
    annotation.element.setAttribute("stroke", is_selected ? "#d34b35" : color);
    if (annotation.collection === "arrows") {
      const marker_id = add_annotation_arrow_marker(document.getElementById("svg"), color);
      annotation.element.setAttribute("marker-end", `url(#${marker_id})`);
    }
  }
}

function clear_selected_annotation() {
  set_selected_annotation(null);
}

function delete_selected_annotation() {
  finish_pending_text_annotation();
  if (!selected_annotation) return;

  const { collection, index, element } = selected_annotation;
  element.remove();
  remove_annotation_at(collection, index);
}

function remove_annotation_at(collection, index) {
  if (!Array.isArray(annotations?.[collection])) return;
  annotations[collection].splice(index, 1);
  if (selected_annotation?.collection === collection) {
    if (selected_annotation.index === index) {
      clear_selected_annotation();
    } else if (selected_annotation.index > index) {
      selected_annotation.index -= 1;
    }
  }
  document
    .querySelectorAll(`#svg [data-annotation-collection="${collection}"]`)
    .forEach((annotation_element, remaining_index) => {
      annotation_element.setAttribute("data-annotation-index", remaining_index);
    });
}

function add_annotation_arrow_marker(svg_elem, color = "#000000") {
  const defs = document.createElementNS(svgns, "defs");
  const marker = document.createElementNS(svgns, "marker");
  const color_id = color.toLowerCase().replace(/[^a-z0-9]/g, "") || "000000";
  const marker_id = `annotation-arrowhead-${color_id}`;
  const existing_marker = svg_elem.querySelector(`#${marker_id}`);
  if (existing_marker) return marker_id;

  marker.setAttribute("id", marker_id);
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "8");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "4");
  marker.setAttribute("orient", "auto");

  const arrowhead = document.createElementNS(svgns, "path");
  arrowhead.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
  arrowhead.setAttribute("fill", color);
  arrowhead.setAttribute("stroke", "none");
  marker.appendChild(arrowhead);
  defs.appendChild(marker);
  svg_elem.appendChild(defs);
  return marker_id;
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
    arrow_triange.setAttributeNS(null, "is_decoration", "true");
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
    arrow_triange.setAttributeNS(null, "is_decoration", "true");
  }
}

function draw_person(person_id) {
  //  console.log(person_id);
  const person = data["people"][person_id];

  // Check for miscarriage first (takes precedence over gender)
  if (person && person["life_status"] == "Miscarriage") {
    draw_miscarriage(person_id);
    // Miscarriages don't have quadrants
  } else if (person && person["demographics"]["gender"] == "Male") {
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


function add_collapsible_summary_toggle(header_cell, tbody, label) {
  header_cell.style.cursor = "pointer";
  header_cell.textContent = "\u25BC " + label;
  header_cell.addEventListener("click", function () {
    const is_collapsed = tbody.style.display === "none";
    tbody.style.display = is_collapsed ? "" : "none";
    header_cell.textContent = (is_collapsed ? "\u25BC " : "\u25B6 ") + label;
  });
}

function set_study_summary() { 
  const summary_elem = document.getElementsByClassName("study-display-section");
  summary_elem[0].innerHTML = "";

  const study_name = config.study_name || "Unknown Study";
  const study = data.general?.study;

  const table = document.createElement("table");
  table.classList.add("data-display-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const codeHeader = document.createElement("th");
  codeHeader.colSpan = 2;
  headerRow.appendChild(codeHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");

  if (config.quadrants && Object.keys(config.quadrants).length > 0) {
    add_quadrant_row_to_table(tbody, "Top Right", config.quadrants?.top_right);
    add_quadrant_row_to_table(tbody, "Top Left", config.quadrants?.top_left);
    add_quadrant_row_to_table(tbody, "Bottom Left", config.quadrants?.bottom_left);
    add_quadrant_row_to_table(tbody, "Bottom Right", config.quadrants?.bottom_right);
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
  add_collapsible_summary_toggle(codeHeader, tbody, study_name + " - Study Summary");

}

function set_family_summary() {  
  const summary_elem = document.getElementsByClassName("summary-display-section");
 
  const proband_id = data.general?.proband;
  const study = data.general?.study;
  const family_classification = data.general?.family_classification;
  const family_genetic_status = data.general?.family_genetic_status;
  const last_updated = format_last_updated(data.general?.data_pulled_dtm || data.general?.last_updated);
  
  
  const number_of_people = Object.keys(data.people).length;
  const number_of_diagnoses = Object.values(data.people).reduce((acc, person) => acc + (person.diseases ? person.diseases.length : 0), 0);
  const number_of_procedures = Object.values(data.people).reduce((acc, person) => acc + (person.procedures ? person.procedures.length : 0), 0);

  const annotations_updated_at = format_last_updated(annotations?.updated_at);
  const annotations_updated_by = annotations?.updated_by;

  const table = document.createElement("table");
  table.classList.add("data-display-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const codeHeader = document.createElement("th");
  codeHeader.colSpan = 2;
  headerRow.appendChild(codeHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  add_row_to_table(tbody, "Proband", proband_id);
  add_row_to_table(tbody, "Family Classification", family_classification);
  add_row_to_table(tbody, "Family Genetic Status", family_genetic_status);
  add_row_to_table(tbody, "Last Updated", last_updated);
  add_row_to_table(tbody, "Locations Updated", annotations_updated_at);
  add_row_to_table(tbody, "Locations Updated By", annotations_updated_by);
  add_row_to_table(tbody, "People", number_of_people);
  add_row_to_table(tbody, "Diagnoses", number_of_diagnoses);
  add_row_to_table(tbody, "Procedures", number_of_procedures);
  table.appendChild(tbody);
  summary_elem[0].appendChild(table);
  add_collapsible_summary_toggle(codeHeader, tbody, proband_id + " - Family Summary");

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
    return {
      isDeceased: true,
      deathDate: person.deceased,
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
  const diagnosis_label = diagnosis.code || get_diagnosis_display_name(diagnosis) || ("Diagnosis #" + (diagnosis_index + 1));
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
  
  // Show life_status if it's Miscarriage, otherwise show Sex
  if (person["life_status"] == "Miscarriage") {
    add_row_to_table(tbody, "Life Status", "Miscarriage");
  } else {
    add_row_to_table(tbody, "Sex", person["demographics"]["gender"]);
  }

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

  const row = document.createElement("tr");
  const label_cell = document.createElement("td");
  label_cell.textContent = label;
  const value_cell = document.createElement("td");
  value_cell.textContent = value;
  row.appendChild(label_cell);
  row.appendChild(value_cell);
  tbody.appendChild(row);
}

function add_quadrant_row_to_table(tbody, label, quadrant_config) {
  const name = quadrant_config?.name;
  if (!name) return;

  const row = document.createElement("tr");
  const label_cell = document.createElement("td");
  label_cell.textContent = label;

  const value_cell = document.createElement("td");
  const value_content = document.createElement("span");
  value_content.style.display = "inline-flex";
  value_content.style.alignItems = "center";
  value_content.style.gap = "6px";

  const swatch = create_color_swatch_container([quadrant_config.color]);
  if (swatch) value_content.appendChild(swatch);

  const name_span = document.createElement("span");
  name_span.textContent = name;
  value_content.appendChild(name_span);

  value_cell.appendChild(value_content);
  row.appendChild(label_cell);
  row.appendChild(value_cell);
  tbody.appendChild(row);
}

function format_last_updated(raw_value) {
  if (!raw_value) return null;
  const parsed_date = new Date(raw_value);
  if (isNaN(parsed_date)) return raw_value;
  return parsed_date.toLocaleDateString();
}

function get_standardized_diagnosis_label(diagnosis) {
  return diagnosis.abbr || null;
}

function get_diagnosis_display_name(diagnosis) {
  return get_standardized_diagnosis_label(diagnosis) || "NOTITLE";
}

function create_color_swatch_container(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return null;

  const unique_colors = [...new Set(colors.filter(Boolean))];
  if (unique_colors.length === 0) return null;

  const swatch_container = document.createElement("span");
  swatch_container.style.display = "inline-flex";
  swatch_container.style.gap = "6px";
  swatch_container.style.alignItems = "center";

  unique_colors.forEach((color) => {
    const swatch = document.createElement("span");
    swatch.style.display = "inline-block";
    swatch.style.width = "12px";
    swatch.style.height = "12px";
    swatch.style.border = "1px solid #333";
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch_container.appendChild(swatch);
  });

  return swatch_container;
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
      // Non-cancers are keyed by ICD code; cancers are displayed as topography:morphology.
      const code = disease.code;
      const topography = disease.topography;
      const morphology = disease.morphology;
      const cancer_identifier = [topography, morphology].filter(Boolean).join(":");
      const coding_identifier = disease.coding;
      const is_cancer_diagnosis = Boolean(cancer_identifier)
        || (disease.d_num && String(disease.d_num).startsWith("C"))
        || (code && code[0] === "C");
      const diagnosis_identifier = is_cancer_diagnosis ? (cancer_identifier || code) : code;
      const matching_quadrants = get_matching_quadrants_for_disease(disease, person_id);
      const matching_quadrant_names = matching_quadrants.map((quadrant) => quadrant.name);
      const matching_quadrant_colors = matching_quadrants.map((quadrant) => quadrant.color).filter(Boolean);
      const quadrant_suffix = matching_quadrant_names.length > 0
        ? " (" + matching_quadrant_names.join(", ") + ")"
        : "";
      const header_text = (disease.abbr || diagnosis_identifier) + quadrant_suffix;

     
      const table = document.createElement("table");
      table.classList.add("data-display-table");
      if (is_cancer_diagnosis) table.classList.add("cancer-diagnosis");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const codeHeader = document.createElement("th");
      codeHeader.colSpan = 2;

      const header_content = document.createElement("div");
      header_content.classList.add("section-header-content");

      const header_title = document.createElement("span");
      header_title.style.display = "inline-flex";
      header_title.style.alignItems = "center";
      header_title.style.gap = "6px";

      const swatches = create_color_swatch_container(matching_quadrant_colors);
      if (swatches) {
        header_title.appendChild(swatches);
      }

      const header_label = document.createElement("span");
      header_label.textContent = header_text;
      header_title.appendChild(header_label);
      header_content.appendChild(header_title);

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
      if (is_cancer_diagnosis) {
        add_row_to_table(tbody, "Coding", coding_identifier);
        add_row_to_table(tbody, "Topography", topography);
        add_row_to_table(tbody, "Morphology", morphology);
      } else {
        add_row_to_table(tbody, "Code", code);
      }
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
      const code = procedure.code;

      const table = document.createElement("table");
      table.classList.add("data-display-table");
      if (procedure.abbr) table.classList.add("procedure-abbr");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const codeHeader = document.createElement("th");
      codeHeader.colSpan = 2;

      const header_content = document.createElement("div");
      header_content.classList.add("section-header-content");

      const header_label = document.createElement("span");
      header_label.textContent = procedure.abbr || procedure.description || code;
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
    draw_highlighted_diseases(center, person_id);
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
    draw_highlighted_diseases(center, person_id);
  }

}

function draw_miscarriage(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;

  let x = person.x;
  let y = person.y;
  let s = config.size / 2;  // Half height (same as top half of diamond)

  // Draw upward-pointing triangle: upper half of the unknown diamond
  // Same width as diamond (config.size), half the height
  // Top point: (x, y - s)
  // Bottom left: (x - s, y)
  // Bottom right: (x + s, y)
  const el = draw_triangle(
    x,
    y - s,
    x - s,
    y,
    x + s,
    y
  );
  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "sex", "Miscarriage");
  el.setAttributeNS(null, "cx", center.x);
  el.setAttributeNS(null, "cy", center.y);
  el.setAttributeNS(null, "fill", config.default_color || "lightblue");

  if (has_clinical_entries(person)) el.setAttributeNS(null, "stroke-width", "3");
  else el.setAttributeNS(null, "stroke-width", "1");

  people_drawn.push(person_id);
  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
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
    draw_born_and_deceased(center, person_id);
    draw_highlighted_diseases(center, person_id);
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
  const y1 = (mother_loc.y + father_loc.y) / 2 + config.v_spacing / 2;

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
  const y1 = (mother_loc.y + father_loc.y) / 2;
  const y2 = y1 + config.v_spacing / 2;
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

function draw_highlighted_diseases(center, person_id) {
  const highlighted_diseases = config?.highlighted_diseases;
  if (!Array.isArray(highlighted_diseases) || highlighted_diseases.length === 0) return;

  const person = data["people"][person_id];
  const matches = (person?.diseases || [])
    .map((disease) => disease.abbr)
    .filter((abbr) => highlighted_diseases.includes(abbr));
  if (matches.length === 0) return;

  const loc_x = center.x;
  const loc_y = center.y + config.size / 2 + 2 * config.v_padding + 14;
  const elem = draw_label(matches.join(", "), loc_x, loc_y);
  elem.setAttribute("id", person_id);
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

function draw_svg_header_info() {
  const study_name = config.study_name || data.general?.study;
  const proband_id = data.general?.proband;
  const proband_name = proband_id ? data["people"]?.[proband_id]?.name : null;
  const proband_label = [proband_id, proband_name].filter(Boolean).join(" - ");
  const family_classification = data.general?.family_classification;
  const family_genetic_status = data.general?.family_genetic_status;
  const last_updated = format_last_updated(data.general?.data_pulled_dtm || data.general?.last_updated);
  const locations_updated_at = format_last_updated(annotations?.updated_at);
  const locations_updated_by = annotations?.updated_by;
  const locations_updated_label = locations_updated_at && "Locations Updated on " + locations_updated_at + (locations_updated_by ? " by " + locations_updated_by : "");

  const lines = [
    study_name,
    proband_label && "Proband: " + proband_label,
    family_classification && "Family Classification: " + family_classification,
    family_genetic_status && "Family Genetic Status: " + family_genetic_status,
    last_updated && "Last Updated: " + last_updated,
    locations_updated_label,
  ].filter(Boolean);

  // Anchor to the canvas's current left/top edge so the header stays pinned to
  // the corner even after the viewBox has been expanded to fit saved positions.
  const svgElem = document.getElementById("svg");
  const [view_min_x, view_min_y] = (svgElem?.getAttribute("viewBox") || "0 0").split(" ").map(Number);
  const start_x = view_min_x + 10;
  const line_height = 16;

  lines.forEach((line, index) => {
    const elem = draw_label(line, start_x, view_min_y + 16 + index * line_height);
    elem.setAttribute("text-anchor", "start");
    if (index === 0) elem.setAttribute("font-weight", "bold");
  });
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

function draw_arrow(x1, y1, x2, y2, color = "#000000") {
  const arrow_elem = draw_line(x1, y1, x2, y2);
  arrow_elem.setAttribute("stroke", color);
  const marker_id = add_annotation_arrow_marker(document.getElementById("svg"), color);
  arrow_elem.setAttribute("marker-end", `url(#${marker_id})`);
  return arrow_elem;
}

/////. Helper functions /////

export function set_other_alert(person_id, message) {
  other_alerts[person_id] = message;
}

///
// Quadrants

// person.quad_flags and disease.quad_abbrs (formerly quad_abbr) are indexed [top_right, bottom_right, bottom_left, top_left].
function check_quadrant_tr(person_id) {
  return !!data["people"][person_id]?.quad_flags?.[0];
}

function check_quadrant_br(person_id) {
  return !!data["people"][person_id]?.quad_flags?.[1];
}

function check_quadrant_bl(person_id) {
  return !!data["people"][person_id]?.quad_flags?.[2];
}

function check_quadrant_tl(person_id) {
  return !!data["people"][person_id]?.quad_flags?.[3];
}

function get_matching_quadrants_for_disease(disease) {
  const quadrants = config?.quadrants;
  const quad_abbrs = disease?.quad_abbrs || disease?.quad_abbr;
  if (!quadrants || !Array.isArray(quad_abbrs)) return [];

  const ordered_quadrants = [
    quadrants.top_right,
    quadrants.bottom_right,
    quadrants.bottom_left,
    quadrants.top_left,
  ];

  const matches = [];
  ordered_quadrants.forEach((quadrant, index) => {
    if (!quadrant?.name) return;
    if (quad_abbrs[index]) {
      matches.push({ name: quadrant.name, color: quadrant.color || "" });
    }
  });

  return matches;
}

function draw_quadrants_male(person_id) {

  const size = config.size / 2;
  const center_x = data["people"][person_id].x;
  const center_y = data["people"][person_id].y;
  let code = false;

  if (code = check_quadrant_tr(person_id)) {
    const el = draw_square(size, center_x, center_y - size, config.quadrants?.top_right?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
    el.setAttributeNS(null, "is_decoration", "true");
  }
  if (code = check_quadrant_tl(person_id)) {
    const el = draw_square(size, center_x - size, center_y -size, config.quadrants?.top_left?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
    el.setAttributeNS(null, "is_decoration", "true");
  }
  if (code = check_quadrant_br(person_id)) {
    const el = draw_square(size, center_x, center_y, config.quadrants?.bottom_right?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
    el.setAttributeNS(null, "is_decoration", "true");
  }
  if (code = check_quadrant_bl(person_id)) {
    const el = draw_square(size, center_x - size, center_y, config.quadrants?.bottom_left?.color || "grey");
    el.setAttributeNS(null, "id", person_id);
    el.setAttributeNS(null, "pointer-events", "none");
    el.setAttributeNS(null, "stroke-width", "2");
    el.setAttributeNS(null, "is_decoration", "true");
  }
}

function draw_quadrants_female(person_id) {
  let el;
  const size = config.size / 2;
  const center_x = data["people"][person_id].x;
  const center_y = data["people"][person_id].y;
  let color = "grey";
  let code = false;

  if (code = check_quadrant_tr(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "tr", config.quadrants?.top_right?.color || "grey"); }
  if (code = check_quadrant_tl(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "tl", config.quadrants?.top_left?.color || "grey"); }
  if (code = check_quadrant_bl(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "bl", config.quadrants?.bottom_left?.color || "grey"); }
  if (code = check_quadrant_br(person_id)) { el = draw_arc_90(person_id, center_x, center_y, size, "br", config.quadrants?.bottom_right?.color || "grey"); }
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