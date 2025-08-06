
import { find_all_partners, find_all_children, find_all_descendants, get_data } from "./fhh_build_pedigree.js";
import { get_config} from "./fhh_display_pedigree.js";

var free_move = false;
var slide_move = false;

var page_x;
var page_y;
var original_x;
var original_y;
var target = null;


/// Free Move Functions

export function start_free_move(e) {
  target = e.target;

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
  for (const i in elements) {
    move_element(elements[i], diff_x, diff_y);
  }

  // Then if this is a child, move the connector above the child
  const parent_connector_line = document.querySelectorAll("[child_id=\"" + person_id + "\"]");
  for (const i in parent_connector_line) {
    move_last_point_of_line(parent_connector_line[i], diff_x, diff_y);
  }

  // Then move the line to the other partner
  const mother_connector_line = document.querySelectorAll("[mother_id=\"" + person_id + "\"]");
  for (const i in mother_connector_line) {
    move_first_point_of_line(mother_connector_line[i], diff_x, diff_y);
  }

  // Then move the line to the other partner
  const father_connector_line = document.querySelectorAll("[father_id=\"" + person_id + "\"]");
  for (const i in father_connector_line) {
    move_last_point_of_line(father_connector_line[i], diff_x, diff_y);
  }

  // NOTE: the divide by 2 is because we are only moving one of the endpoints, therefore the center line only moves by half
  const mother_line_down = document.querySelectorAll("[p_mother_id=\"" + person_id + "\"]");
  for (const i in mother_line_down) {
    move_first_point_of_line(mother_line_down[i], diff_x/2, diff_y/2);
    move_last_point_of_line(mother_line_down[i], diff_x/2, diff_y/2);
  }
  const father_line_down = document.querySelectorAll("[p_father_id=\"" + person_id + "\"]");
  for (const i in father_line_down) {
    move_first_point_of_line(father_line_down[i], diff_x/2, diff_y/2);
    move_last_point_of_line(father_line_down[i], diff_x/2, diff_y/2);
  }

  const child_mother_line_down = document.querySelectorAll("[c_mother_id=\"" + person_id + "\"]");
  for (const i in child_mother_line_down) {
    move_first_point_of_line(child_mother_line_down[i], diff_x/2, diff_y/2);
  }
  const child_father_line_down = document.querySelectorAll("[c_father_id=\"" + person_id + "\"]");
  for (const i in child_father_line_down) {
    move_first_point_of_line(child_father_line_down[i], diff_x/2, diff_y/2);
  }

}

function stop_free_move(e) {
  let diff_x = e.pageX - original_x;
  let diff_y = e.pageY - original_y;

  console.log(e.target.id);

  free_move = false;
}

// Tree Slide functions

export function start_slide_move(e) {
  target = e.target;

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

  el.attributes.x.value = new_x;
  el.attributes.y.value = new_y;

  const person_id = el.attributes.id.value;
  let data = get_data();
  if (person_id && data["people"][person_id]) {
    const person = data["people"][person_id]
    person.x = new_x + config.size/2;  // Center of Males is offset by half the size of the box
    person.y = new_y + config.size/2;
    person.moved = true;
  }
}

function move_circle(el, diff_x, diff_y) {
  var current_x = el.attributes.cx.value;
  var current_y = el.attributes.cy.value;
  var new_x = current_x - diff_x;
  var new_y = current_y - diff_y;

  el.attributes.cx.value = new_x;
  el.attributes.cy.value = new_y;

  const person_id = el.attributes.id.value;
  let data = get_data();
  if (person_id && data["people"][person_id]) {
    const person = data["people"][person_id]
    person.x = new_x;
    person.y = new_y;
    person.moved = true;
  }
}

function move_poly(el, diff_x, diff_y) {
  var current_x = el.attributes.cx.value;
  var current_y = el.attributes.cy.value;
  var new_x = current_x - diff_x;
  var new_y = current_y - diff_y;

  let current_points = el.attributes.points.value;
  const new_points = shift_points(current_points, diff_x, diff_y);
  el.attributes.points.value = new_points;

  const person_id = el.attributes.id.value;
  let data = get_data();
  if (person_id && data["people"][person_id]) {
    const person = data["people"][person_id]
    person.x = new_x;
    person.y = new_y;
    person.moved = true;
  }
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

  el.attributes.x.value = new_x;
  el.attributes.y.value = new_y;
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

  el.attributes.x1.value = new_x1;
  el.attributes.y1.value = new_y1;
  el.attributes.x2.value = new_x2;
  el.attributes.y2.value = new_y2;
}

function move_first_point_of_line(el, diff_x, diff_y) {
  if (el.attributes === undefined) return;  // Only move items with the right values
  var current_x1 = el.attributes.x1.value;
  var current_y1 = el.attributes.y1.value;
  var new_x1 = current_x1 - diff_x;
  var new_y1 = current_y1 - diff_y;

  el.attributes.x1.value = new_x1;
  el.attributes.y1.value = new_y1;
}

function move_last_point_of_line(el, diff_x, diff_y) {
  if (el.attributes === undefined) return;  // Only move items with the right values
  var current_x2 = el.attributes.x2.value;
  var current_y2 = el.attributes.y2.value;
  var new_x2 = current_x2 - diff_x;
  var new_y2 = current_y2 - diff_y;

  el.attributes.x2.value = new_x2;
  el.attributes.y2.value = new_y2;
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
