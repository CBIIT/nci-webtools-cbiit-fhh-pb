
import { find_all_descendants, get_data } from "./fhh_build_pedigree.js";
import { get_config, ensure_canvas_fits_point, sibship_bar_y, record_change, get_zoom } from "./fhh_display_pedigree.js";
import { find_multiple_birth_groups, multiple_birth_geometry } from "./fhh_multiple_births.js";
import { adoption_notation, adoption_question_position } from "./fhh_adoption.js";

var free_move = false;
var slide_move = false;

var page_x;
var page_y;
var original_x;
var original_y;
var target = null;
let moving_birth_members = [];

function move_group_for(person_id) {
  const people = get_data()["people"];
  const group = find_multiple_birth_groups(people).groups.find((item) => item.members.includes(person_id));
  if (!group || !group.members.every((id) => people[id].gen != null && people[id].loc != null)) {
    return [person_id];
  }
  return group.members;
}

/// Free Move Functions

export function start_free_move(e, move_target = e.target) {
  target = move_target;

  let id = e.target.attributes.name.value;

  page_x = e.pageX;
  page_y = e.pageY;
  original_x = e.pageX;
  original_y = e.pageY;
  moving_birth_members = move_group_for(move_target.attributes.id.value);

  free_move = true;
}

function free_move_element(e) {
  let diff_x = (page_x - e.pageX) / get_zoom();
  let diff_y = (page_y - e.pageY) / get_zoom();
  page_x = e.pageX;
  page_y = e.pageY;

  if (target) {

    for (const person_id of moving_birth_members) {
      move_all_elements_of_a_person(person_id, diff_x, diff_y);
    }
  }
}

function move_all_elements_of_a_person(person_id, diff_x, diff_y) {
  // First Move all the elements of the person_id
  // This will include the line above the person if there
  // And the label
  const elements = document.querySelectorAll("[id=\"" + person_id + "\"]");
  for (const el of elements) {
    if (!el.hasAttribute("stub_id")) move_element(el, diff_x, diff_y);
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

  refresh_family_connectors(person_id);
}

// Redraws the drop, horizontal sibship line and child stubs of every family the person belongs to.
function refresh_family_connectors(person_id) {
  const people = get_data()["people"];
  const person = people[person_id];
  if (!person) return;
  const couples = new Set();
  const multiple_birth_by_person = new Map();
  for (const group of find_multiple_birth_groups(people).groups) {
    if (group.members.every((id) => people[id].gen != null && people[id].loc != null)) {
      for (const id of group.members) multiple_birth_by_person.set(id, group);
    }
  }
  if (person.mother && person.father) couples.add(person.mother + "|" + person.father);
  for (const id in people) {
    if (people[id].mother == person_id || people[id].father == person_id) couples.add(people[id].mother + "|" + people[id].father);
  }

  for (const couple of couples) {
    const [mother_id, father_id] = couple.split("|");
    const mother = people[mother_id];
    const father = people[father_id];
    if (!mother || !father || mother.x == null || father.x == null) continue;
    const children = Object.keys(people).filter((id) => people[id].mother == mother_id && people[id].father == father_id && people[id].x != null);
    const drop_x = (mother.x + father.x) / 2;
    const parents_y = (mother.y + father.y) / 2;
    const bar_y = sibship_bar_y(parents_y, children.map((id) => people[id].y));

    for (const drop of document.querySelectorAll("[p_mother_id=\"" + mother_id + "\"][p_father_id=\"" + father_id + "\"]")) {
      set_line(drop, drop_x, parents_y, drop_x, bar_y);
    }
    for (const child_id of children) {
      const child = people[child_id];
      const group = multiple_birth_by_person.get(child_id);
      const geometry = group && multiple_birth_geometry(group, people, get_config().size, bar_y);
      for (const bar of document.querySelectorAll("[child_id=\"" + child_id + "\"][c_mother_id=\"" + mother_id + "\"]")) {
        set_line(bar, drop_x, bar_y, geometry?.anchor[0] ?? child.x, bar_y);
      }
      for (const stub of document.querySelectorAll("[stub_id=\"" + child_id + "\"]")) {
        set_line(stub, child.x, child.y, geometry?.junction[0] ?? child.x, geometry?.junction[1] ?? bar_y);
        if (adoption_notation(child.adoption).question) {
          refresh_adoption_question_position(child_id, stub);
        }
      }
      if (geometry && group.members[0] === child_id) {
        for (const marker of document.querySelectorAll("[data-multiple-birth-group]")) {
          if (marker.getAttribute("data-multiple-birth-group") !== group.key) continue;
          const part = marker.getAttribute("data-multiple-birth-part");
          if (part === "stem") set_line(marker, ...geometry.anchor, ...geometry.junction);
          else if (part === "crossbar") set_line(marker, ...geometry.crossbar[0], ...geometry.crossbar[1]);
          else if (part === "question") {
            marker.setAttribute("x", geometry.question[0]);
            marker.setAttribute("y", geometry.question[1]);
          }
        }
      }
    }
  }
}

function refresh_adoption_question_position(person_id, connector) {
  const question = [...document.querySelectorAll("[data-adoption-question-for]")]
    .find((element) => element.getAttribute("data-adoption-question-for") === person_id);
  if (!question) return;

  const person = get_data().people[person_id];
  const size = get_config().size;
  const notation = adoption_notation(person?.adoption);
  const coordinates = connector && Object.fromEntries(
    ["x1", "y1", "x2", "y2"].map((key) => [key, Number(connector.getAttribute(key))])
  );
  const position = adoption_question_position(
    { x: person.x, y: person.y }, size, notation.bracket, coordinates
  );
  question.setAttribute("x", position.x);
  question.setAttribute("y", position.y);
}

function set_line(el, x1, y1, x2, y2) {
  el.setAttribute("x1", x1);
  el.setAttribute("y1", y1);
  el.setAttribute("x2", x2);
  el.setAttribute("y2", y2);
}

function stop_free_move(e) {
  let diff_x = e.pageX - original_x;
  let diff_y = e.pageY - original_y;


  free_move = false;
  if (diff_x || diff_y) record_change();
}

// Tree Slide functions

export function start_slide_move(e, move_target = e.target) {
  target = move_target;

  let id = e.target.attributes.name.value;

  page_x = e.pageX;
  page_y = e.pageY;
  original_x = e.pageX;
  original_y = e.pageY;
  moving_birth_members = move_group_for(move_target.attributes.id.value);

  slide_move = true;
}

// Sliding does not allow vertical movement, so zero that youngest_gen
function slide_move_element(e) {
  let diff_x = (page_x - e.pageX) / get_zoom();
  let diff_y = 0;
  page_x = e.pageX;
  page_y = e.pageY;


  if (target) {

    const moving_people = new Set(moving_birth_members);
    for (const person_id of moving_birth_members) {
      for (const descendant_id of find_all_descendants(person_id, [])) {
        moving_people.add(descendant_id);
      }
    }
    for (const person_id of moving_people) {
      move_all_elements_of_a_person(person_id, diff_x, diff_y);
    }
  }
}


function stop_slide_move(e) {
  let diff_x = e.pageX - original_x;
  let diff_y = e.pageY - original_y;

  slide_move = false;
  if (diff_x) record_change();
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
      const new_x = Number(x) - diff_x;
      const new_y = Number(y) - diff_y;
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
