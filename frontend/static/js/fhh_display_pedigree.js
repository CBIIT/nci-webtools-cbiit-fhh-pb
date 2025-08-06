
import {   build_entire_family_tree, set_data, get_data,
            get_furthest_left, get_furthest_right, get_generation_count, get_youngest_generation, get_oldest_generation,
            check_for_overlaps, check_for_unplaced_people, reset_furthest_locations
        } from './fhh_build_pedigree.js';

import { check_for_files, load_files_into_select, load_config_and_data, save_positions_and_annotations } from "./fhh_load.js";

import { addSvgListeners, start_free_move, start_slide_move } from "./fhh_move.js";

const svgns = "http://www.w3.org/2000/svg";
var config;
var data;
var annotations;
let family_tree = [];
let people_drawn = [];

let increment = 0;

const debug_offset = {"x": 5000, "y":400};
var center_offset = {};

export function get_config() {
  return config;
}

let select = document.getElementById('file_select');
select.addEventListener('change', function(event) {
  // Code to be executed when the value changes
  const promise = load_config_and_data(event.target.value, "basic");
  promise.then(([d, a, c]) => {
    data = d;
    annotations = a;
    config = c;
    display_pedigree();
  });
});

let clear_alert_elem = document.getElementById('clear-alert-button');
clear_alert_elem.addEventListener('click', function() {
  const alert_elem = document.getElementById("alert");
  alert_elem.innerHTML = "";
  alert_elem.style.backgroundColor = "#FFF";
  alert_elem.style.border = 'none';
});

let log_elem = document.getElementById('log-button');
log_elem.addEventListener('click', function() {
  console.log(data);
});

let save_elem = document.getElementById('save-button');
save_elem.addEventListener('click', function() {
  console.log("Clicked on Save for Family");

  save_positions_and_annotations(data);
});



document.addEventListener('DOMContentLoaded', function() {
  try {

    const urlParams = new URLSearchParams(window.location.search);
    const family = urlParams.get('family');

    check_for_files();

    let filename = null;
    if (family) {
      filename = family + ".json";
    }
    const promise = load_config_and_data(family, "basic");
    promise.then(([d, a, c]) => {
      data = d;
      annotations = a;
      config = c;
      display_pedigree();
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  }
});

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
  console.log(get_furthest_left() );
  const proband_id = data.proband;
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
    alert_elem.style.border = ''
  }
}

function add_overlap_alerts(alert_elem) {
  const overlaps = check_for_overlaps(family_tree);

  if (overlaps && Object.keys(overlaps).length > 0) {

    alert_elem.style.backgroundColor = "#FDD";
    alert_elem.style.border = '4px dashed #F00';
    const p = document.createElement("p");
    p.classList.add("alert-line");
    alert_elem.append(p)
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
    alert_elem.style.border = '4px dashed #F00';
    const p = document.createElement("p");
    p.classList.add("alert-line");
    alert_elem.append(p)
    p.append("Missing People: ");
    for (const index in missing_people) {
      const person_id = missing_people[index];
      const children = find_children(person_id);
      const text = person_id + " [" + children.length + "]"
      const button = create_button(text);
      p.append(button);
    }
    return true;
  } else {
    return false;
  }
}

function create_button(text) {
  let button = document.createElement('button');
  button.textContent = text;
  button.className = 'alert-button';
  return button;
}

function draw_frame() {
  const furthest_right = get_furthest_right();
  const furthest_left = get_furthest_left();
  const total_width = furthest_right - furthest_left + 1;
  const num_generations = get_generation_count();
  const oldest_generation = get_oldest_generation();

  console.log("WIDTH (" + total_width + "): " + furthest_left + " <-> " + furthest_right);
  console.log("HEIGHT:" + num_generations);

  center_offset.x = config.margin + (-furthest_left * config.h_spacing) ;
  center_offset.y = config.margin + (-oldest_generation * config.v_spacing);
  console.log ("CENTER: " + center_offset.x + "," + center_offset.y);

  const width_of_svg = (2 * config.margin) + (total_width * (config.h_spacing) );
  const height_of_svg = (2 * config.margin) + (num_generations * config.v_spacing);

  const svgElem = create_svg(width_of_svg, height_of_svg);
  const r2 = draw_rectangle(width_of_svg-2,height_of_svg-2, 1, 1);
  r2.setAttributeNS(null, "stroke", "black");
  r2.setAttributeNS(null, "fill", "white");
  r2.setAttributeNS(null, "stroke-width", "2");

//  const center = draw_circle(10, center_offset.x, center_offset.y);
//  center.setAttributeNS(null, "fill", "blue");

}


export function create_svg(width, height) {
    let svgElem =  document.createElementNS(svgns, "svg");
    svgElem.setAttributeNS(null, "viewBox", "0 0 " + width + " " + height);
    svgElem.setAttributeNS(null, "width", width);
    svgElem.setAttributeNS(null, "height", height);
    svgElem.setAttributeNS(null, "fill", "lightblue");
    svgElem.setAttributeNS(null, "stroke", "black");
    svgElem.setAttributeNS(null, "stroke-width", "5");

    svgElem.style.display = "block";
    svgElem.id = "svg";

    var svgContainer = document.getElementById("main");
    svgContainer.innerHTML = '';
    svgContainer.appendChild(svgElem);

    addSvgListeners(svgElem);
    return svgElem;
}
///////////////////////////////////////////////


function draw_family_tree(family_tree) {
  console.log("draw_family_tree");

``
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
  let proband_id = data["proband"];

  let proband = data["people"][proband_id];
  if (proband.demographics.gender == "Male") {
    let arrow_line = draw_line(proband.x+config.size/2+3, proband.y+17, proband.x+config.size/2+32, proband.y+32);
    arrow_line.setAttributeNS(null, "id", proband_id);
    arrow_line.setAttributeNS(null, "stroke-width", "2");
    let arrow_triange = draw_triangle(proband.x+config.size/2+3, proband.y+17,
                                      proband.x+config.size/2+21, proband.y+18,
                                      proband.x+config.size/2+14, proband.y+30);
    arrow_triange.setAttributeNS(null, "id", proband_id);

  } else {
    let arrow_line = draw_line(proband.x-(config.size/2*.7071)-7, proband.y+(config.size/2*.7071)-5,
                               proband.x-(config.size/2*.7071)-37, proband.y+(config.size/2*.7071)+15);
    arrow_line.setAttributeNS(null, "id", proband_id);
    arrow_line.setAttributeNS(null, "stroke-width", "2");
    let arrow_triange = draw_triangle(proband.x-(config.size/2*.7071)-7, proband.y+(config.size/2*.7071)-5,
                                      proband.x-(config.size/2*.7071)-24, proband.y+(config.size/2*.7071-3),
                                      proband.x-(config.size/2*.7071)-16, proband.y+(config.size/2*.7071)+10);

    arrow_triange.setAttributeNS(null, "id", proband_id);
  }



}

function draw_person(person_id) {
//  console.log(person_id);
  const person = data["people"][person_id];

  if (person && person["demographics"]["gender"] == "Male") draw_male(person_id);
  else if (person && person["demographics"]["gender"] == "Female") draw_female(person_id);
  else draw_unknown(person_id);

}

function draw_person_connectors(person_id) {
//  console.log(person_id);
  const person = data["people"][person_id];


  if (person.mother == null && person.father != null) console.log ("Missing Mother for " + person_id);
  if (person.father == null && person.mother != null) console.log ("Missing Father for " + person_id);


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
      center.x = center_offset.x + config.margin + ((person.loc) * (config.h_spacing));
      center.y = center_offset.y + config.margin + ((person.gen) * (config.v_spacing));
    }
  } else {
    center.x = center_offset.x + config.margin + ((person.loc) * (config.h_spacing));
    center.y = center_offset.y + config.margin + ((person.gen) * (config.v_spacing));
  }

  console.log("POSITION: " + person.id + ":" + center.x + "," + center.y);
  return center;
}

function add_clicking_to_element(el, person_id) {
  el.addEventListener('mousedown', (e) => {
    const selectedValue = document.querySelector('input[name="action_choice"]:checked').value;

    if (selectedValue == "details") {
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
  console.log (person.id + ":" + person.x + "," + person.y)

//  const el = draw_square(config.size, center.x , center.y );
  const el = draw_square(config.size, center.x - config.size/2, center.y - config.size/2);
  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "sex", "Male");

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);

  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
  }

  if (data["people"][person_id].deceased) {
    draw_slash(person_id)
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

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);
  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
  }

  if (data["people"][person_id].deceased) {
    draw_slash(person_id)
  }
}

function draw_unknown(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];



  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;

  let x = person.x; let y = person.y; let s = config.size;


  const el = draw_diamond(config.size, center.x, center.y);
  el.setAttributeNS(null, "id", person_id);
  el.setAttributeNS(null, "name", person_id);
  el.setAttributeNS(null, "sex", "Unknown");
  el.setAttributeNS(null, "cx", center.x);
  el.setAttributeNS(null, "cy", center.y);

  if (person.placeholder) el.setAttributeNS(null, "fill", "White");

  people_drawn.push(person_id);
  add_clicking_to_element(el, person_id);

  if (!data["people"][person_id].placeholder) {
    draw_name(center, person_id);
  }

  if (data["people"][person_id].deceased) {
    draw_slash(person_id)
  }

}


function draw_slash(person_id) {
  if (!data["people"][person_id]) return;
  let person = data["people"][person_id];

  let center = get_center(person);
  person.x = center.x;
  person.y = center.y;
  const s = config.size/2;
  const slash_elem = draw_line(person.x-s, person.y+s, person.x+s, person.y-s);
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

    draw_line_top_of_child(child_loc, person_id);
    draw_line_between_parents(mother_loc, father_loc, mother_id, father_id);
    draw_line_connecting_parents_down(mother_loc, father_loc, mother_id, father_id);
    draw_line_child_to_parents(child_loc, mother_loc, father_loc, person_id, mother_id, father_id);
//    console.log(person_id + ":" + mother_id + "," +    father_id);
  }
}

function draw_line_child_to_parents(child_loc, mother_loc, father_loc, person_id, mother_id, father_id) {
//  const x1 = mother_loc.x + config.h_spacing;
  const x1 = (mother_loc.x + father_loc.x) / 2;
  const y1 = mother_loc.y + config.v_spacing/2;

  const x2 = child_loc.x;
  const y2 = child_loc.y - config.v_spacing/2;

  let elem = draw_line(x1,y1, x2,y2);
  elem.setAttributeNS(null, "stroke-width", "2");
  elem.setAttributeNS(null, "child_id", person_id);
  elem.setAttributeNS(null, "c_mother_id", mother_id);
  elem.setAttributeNS(null, "c_father_id", father_id);

}

function draw_line_top_of_child(child_loc, person_id) {


//  let elem = draw_line(child_loc.x, child_loc.y - config.size/2, child_loc.x, child_loc.y - config.size - config.v_spacing/2);
  let elem = draw_line(child_loc.x, child_loc.y, child_loc.x, child_loc.y - config.v_spacing/2);
  elem.setAttributeNS(null, "id", person_id);
  elem.setAttributeNS(null, "stroke-width", "2");

}

function draw_line_between_parents(mother_loc, father_loc, mother_id, father_id) {
  let elem = draw_line(mother_loc.x, mother_loc.y, father_loc.x, father_loc.y);
  elem.setAttributeNS(null, "stroke-width", "2");
  elem.setAttributeNS(null, "mother_id", mother_id);
  elem.setAttributeNS(null, "father_id", father_id);
}

function draw_line_connecting_parents_down(mother_loc, father_loc, mother_id, father_id) {
  const x = (mother_loc.x + father_loc.x)/2;
//  const x = mother_loc.x + config.h_spacing;
  const y1 = mother_loc.y;
  const y2 = mother_loc.y + config.v_spacing/2;
  let elem = draw_line(x, y1, x, y2);
  elem.setAttributeNS(null, "stroke-width", "2");
  elem.setAttributeNS(null, "p_mother_id", mother_id);
  elem.setAttributeNS(null, "p_father_id", father_id);
}

function draw_name(center, person_id) {
  const loc_x = center.x;
  const loc_y = center.y + config.size/2 + config.v_padding;

//  if (data["people"][person_id] && data["people"][person_id].name) {
//    text = data["people"][person_id].name;
//  }
  const id_elem = draw_label(person_id, loc_x, loc_y);
  id_elem.setAttribute("id", person_id);

  let name = data["people"][person_id]["name"];
  if (name && name != "Unknown") {
    const name_elem = draw_label(name, loc_x, loc_y+14);
    name_elem.setAttribute("id", person_id);
  }


}

function draw_label(text, x, y) {
  var textElem = document.createElementNS(svgns, 'text');
  textElem.setAttribute('x', x);
  textElem.setAttribute('y', y);
  textElem.setAttribute('font-size', 12);
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

function draw_square(size, x, y) {
  let rectElem = document.createElementNS(svgns, "rect");
  rectElem.setAttribute("width", size);
  rectElem.setAttribute("height", size);
  rectElem.setAttribute("x", x);
  rectElem.setAttribute("y", y);
  rectElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(rectElem);

  return rectElem;
}

function draw_circle(radius, x, y) {
  let circleElem = document.createElementNS(svgns, "circle");
  circleElem.setAttribute("r", radius/2);
  circleElem.setAttribute("cx", x);
  circleElem.setAttribute("cy", y);
  circleElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(circleElem);

  return circleElem;
}

function draw_diamond(s, x, y) {

  let points = "";
  points += x + "," + (y-s/2) + " ";
  points += (x+s/2) + "," + (y) + " ";
  points += (x) + "," + (y + s/2) + " ";
  points += (x-s/2) + "," + (y);

  console.log("Points:" + points);

  let diamondElem = document.createElementNS(svgns, "polygon");
  diamondElem.setAttribute("points", points);
  diamondElem.setAttribute("stroke-width", "1");

  var svg = document.getElementById("svg");
  svg.appendChild(diamondElem);

  return diamondElem;

}

function draw_triangle(x1,y1, x2,y2, x3,y3) {
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
