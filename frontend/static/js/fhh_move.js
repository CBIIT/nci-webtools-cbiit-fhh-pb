
import { find_all_partners, find_all_children, find_all_descendants, get_data } from "./fhh_build_pedigree.js";
import { get_config, ensure_canvas_fits_point } from "./fhh_display_pedigree.js";

var free_move = false;
var slide_move = false;

var page_x;
var page_y;
var original_x;
var original_y;
var target = null;


/// Free Move Functions

export function start_free_move(e, move_target = e.target) {
  target = move_target;

  let id = e.target.attributes.name.value;

  page_x = e.pageX;
  page_y = e.pageY;
  original_x = e.pageX;
  original_y = e.pageY;

  free_move = true;
}

function free_move_element(e) {
  let diff_x = page_x - e.pageX;
  let diff_y = page_y - e.pageY;
  page_x = e.pageX;
  page_y = e.pageY;

  if (target) {

    const person_id = target.attributes.id.value;

    move_all_elements_of_a_person(person_id, diff_x, diff_y);
  }
}

function move_all_elements_of_a_person(person_id, diff_x, diff_y) {
  // First Move all the elements of the person_id
  // This will include the line above the person if there
  // And the label
  const elements = document.querySelectorAll("[id=\"" + person_id + "\"]");
  for (const el of elements) {
    move_element(el, diff_x, diff_y);
  }

  // Then if this is a child, move the connector above the child
  const parent_connector_line = document.querySelectorAll("[child_id=\"" + person_id + "\"]");
  for (const el of parent_connector_line) {
    move_last_point_of_line(el, diff_x, diff_y);
  }

  // Then move the line to the other partner
  const mother_connector_line = document.querySelectorAll("[mother_id=\"" + person_id + "\"]");
  for (const el of mother_connector_line) {
    move_first_point_of_line(el, diff_x, diff_y);
  }

  // Then move the line to the other partner
  const father_connector_line = document.querySelectorAll("[father_id=\"" + person_id + "\"]");
  for (const el of father_connector_line) {
    move_last_point_of_line(el, diff_x, diff_y);
  }

  // These connector lines are anchored to the midpoint of both parents (X and Y both
  // move by half when either parent moves, since the anchor is the average of the two).
  const mother_line_down = document.querySelectorAll("[p_mother_id=\"" + person_id + "\"]");
  for (const el of mother_line_down) {
    move_first_point_of_line(el, diff_x/2, diff_y/2);
    move_last_point_of_line(el, diff_x/2, diff_y/2);
  }
  const father_line_down = document.querySelectorAll("[p_father_id=\"" + person_id + "\"]");
  for (const el of father_line_down) {
    move_first_point_of_line(el, diff_x/2, diff_y/2);
    move_last_point_of_line(el, diff_x/2, diff_y/2);
  }

  const child_mother_line_down = document.querySelectorAll("[c_mother_id=\"" + person_id + "\"]");
  for (const el of child_mother_line_down) {
    move_first_point_of_line(el, diff_x/2, diff_y/2);
  }
  const child_father_line_down = document.querySelectorAll("[c_father_id=\"" + person_id + "\"]");
  for (const el of child_father_line_down) {
    move_first_point_of_line(el, diff_x/2, diff_y/2);
  }

}

function stop_free_move(e) {
  let diff_x = e.pageX - original_x;
  let diff_y = e.pageY - original_y;


  free_move = false;
}

// Tree Slide functions

export function start_slide_move(e, move_target = e.target) {
  target = move_target;

  let id = e.target.attributes.name.value;

  page_x = e.pageX;
  page_y = e.pageY;
  original_x = e.pageX;
  original_y = e.pageY;

  slide_move = true;
}

// Sliding does not allow vertical movement, so zero that youngest_gen
function slide_move_element(e) {
  let diff_x = page_x - e.pageX;
  let diff_y = 0;
  page_x = e.pageX;
  page_y = e.pageY;


  if (target) {

    const person_id = target.attributes.id.value;
    move_all_elements_of_a_person(person_id, diff_x, diff_y);

    const partners = find_all_partners(person_id);

    let descendants = [];
    descendants = find_all_descendants(person_id, descendants);
    for (const i in descendants) {
      const descendant_id = descendants[i];
      move_all_elements_of_a_person(descendant_id, diff_x, diff_y);
    }
  }
}


function stop_slide_move(e) {
  let diff_x = e.pageX - original_x;
  let diff_y = e.pageY - original_y;

  slide_move = false;
}

////  General Move Functions

function move_element(obj, diff_x, diff_y) {
  if (obj.tagName == "rect") move_rect(obj, diff_x, diff_y);
  if (obj.tagName == "circle") move_circle(obj, diff_x, diff_y);
  if (obj.tagName == "polygon") move_poly(obj, diff_x, diff_y);
  if (obj.tagName == "path") move_path(obj, diff_x, diff_y);
  else if (obj.tagName == "line") move_line(obj, diff_x, diff_y);
  else if (obj.tagName == "text") move_text(obj, diff_x, diff_y);
}

// Applied to rect, circles, text; anything with a fixed point as x,y
function move_rect(el, diff_x, diff_y) {
  const config = get_config();

  var current_x = el.attributes.x.value;
  var current_y = el.attributes.y.value;
  var new_x = current_x - diff_x;
  var new_y = current_y - diff_y;

  el.setAttribute("x", new_x);
  el.setAttribute("y", new_y);

  if (el.getAttribute("is_decoration") === "true") return;

  const person_id = el.attributes.id.value;
  let data = get_data();
  if (person_id && data["people"][person_id]) {
    const person = data["people"][person_id]
    person.x = new_x + config.size/2;  // Center of Males is offset by half the size of the box
    person.y = new_y + config.size/2;
    person.moved = true;
    ensure_canvas_fits_point(person.x, person.y);
  }
}

function move_circle(el, diff_x, diff_y) {
  var current_x = el.attributes.cx.value;
  var current_y = el.attributes.cy.value;
  var new_x = current_x - diff_x;
  var new_y = current_y - diff_y;

  el.setAttribute("cx", new_x);
  el.setAttribute("cy", new_y);

  const person_id = el.attributes.id.value;
  let data = get_data();
  if (person_id && data["people"][person_id]) {
    const person = data["people"][person_id]
    person.x = new_x;
    person.y = new_y;
    person.moved = true;
    ensure_canvas_fits_point(person.x, person.y);
  }
}

function move_poly(el, diff_x, diff_y) {
  var current_x = el.attributes.cx.value;
  var current_y = el.attributes.cy.value;
  var new_x = current_x - diff_x;
  var new_y = current_y - diff_y;

  // Keep cx/cy in sync with the shape so repeated moves (multiple mousemove events
  // in one drag) accumulate correctly instead of only reflecting the latest step.
  el.setAttribute("cx", new_x);
  el.setAttribute("cy", new_y);

  let current_points = el.attributes.points.value;
  const new_points = shift_points(current_points, diff_x, diff_y);
  el.setAttribute("points", new_points);

  if (el.getAttribute("is_decoration") === "true") return;

  const person_id = el.attributes.id.value;
  let data = get_data();
  if (person_id && data["people"][person_id]) {
    const person = data["people"][person_id]
    person.x = new_x;
    person.y = new_y;
    person.moved = true;
    ensure_canvas_fits_point(person.x, person.y);
  }
}

function move_path(el, diff_x, diff_y) {
  let d = el.attributes.d.value;
  const commands = d.split(" ");
  let new_d = "";
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    if (isString(command)) {
      if (command == "M") {
        i++; const x = commands[i] - diff_x;
        i++; const y = commands[i] - diff_y;
        new_d += "M " + x + " " + y + " ";
      } else if (command == "L") {
        i++; const x = commands[i] - diff_x;
        i++; const y = commands[i] - diff_y;
        new_d += "L " + x + " " + y + " ";
      } else if (command == "A") {
        // Arc command has multiple parameters
        i++; const rx = commands[i]; 
        i++; const ry = commands[i]; 
        i++; const x_axis_rotation = commands[i]; 
        i++; const large_arc_flag = commands[i]; 
        i++; const sweep_flag = commands[i];
        i++; const x = commands[i] - diff_x; 
        i++; const y = commands[i] - diff_y;  
        new_d += "A " + rx + " " + ry + " " + x_axis_rotation + " " + large_arc_flag + " " + sweep_flag + " " + x + " " + y + " ";

      } else {
        // Just copy over other commands like Z
        new_d += command + " ";
      }
    }
  }
  el.setAttribute("d", new_d);
} 

function shift_points(points, diff_x, diff_y) {
  let new_points = "";
  const point_array = points.split(' ');
  for (const i in point_array) {
    const point = point_array[i];
    if (point && point.length > 0) {
      const [x, y] = point.split(',');
      const new_x = parseInt(x) - diff_x;
      const new_y = parseInt(y) - diff_y;
      new_points += new_x + "," + new_y + " ";
    }
  }
  return new_points;
}

function move_text(el, diff_x, diff_y) {
  var current_x = el.attributes.x.value;
  var current_y = el.attributes.y.value;
  var new_x = current_x - diff_x;
  var new_y = current_y - diff_y;

  el.setAttribute("x", new_x);
  el.setAttribute("y", new_y);
}

function isString(variable) {
  return typeof variable === 'string';
}

function move_line(el, diff_x, diff_y) {
  if (el.attributes === undefined) return;  // Only move items with the right values

  var current_x1 = el.attributes.x1.value;
  var current_y1 = el.attributes.y1.value;
  var current_x2 = el.attributes.x2.value;
  var current_y2 = el.attributes.y2.value;
  var new_x1 = current_x1 - diff_x;
  var new_y1 = current_y1 - diff_y;
  var new_x2 = current_x2 - diff_x;
  var new_y2 = current_y2 - diff_y;

  el.setAttribute("x1", new_x1);
  el.setAttribute("y1", new_y1);
  el.setAttribute("x2", new_x2);
  el.setAttribute("y2", new_y2);
}

function move_first_point_of_line(el, diff_x, diff_y) {
  if (el.attributes === undefined) return;  // Only move items with the right values
  var current_x1 = el.attributes.x1.value;
  var current_y1 = el.attributes.y1.value;
  var new_x1 = current_x1 - diff_x;
  var new_y1 = current_y1 - diff_y;

  el.setAttribute("x1", new_x1);
  el.setAttribute("y1", new_y1);
}

function move_last_point_of_line(el, diff_x, diff_y) {
  if (el.attributes === undefined) return;  // Only move items with the right values
  var current_x2 = el.attributes.x2.value;
  var current_y2 = el.attributes.y2.value;
  var new_x2 = current_x2 - diff_x;
  var new_y2 = current_y2 - diff_y;

  el.setAttribute("x2", new_x2);
  el.setAttribute("y2", new_y2);
}


export function addSvgListeners(el) {
  el.addEventListener('mouseup', (e) => {
    if (free_move) stop_free_move(e);
    else if (slide_move) stop_slide_move(e);
  });

  el.addEventListener('mousemove', (e) => {
    if (free_move) free_move_element(e);
    else if (slide_move) slide_move_element(e);
  });

  el.addEventListener('mouseleave', (e) => {
    if (free_move) stop_free_move(e);
    if (slide_move) stop_slide_move(e);
  });

}
