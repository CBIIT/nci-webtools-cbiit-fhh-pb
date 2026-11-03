const QUADRANT_KEYS = ["top_right", "top_left", "bottom_left", "bottom_right"];

export function get_quadrant_abbreviations(entry) {
  const values = entry?.quad_abbrs ?? entry?.quad_abbr;
  return Array.isArray(values) ? values : [];
}

export function get_procedure_quadrant_abbreviations(procedure) {
  const values = procedure?.quad_abbrs ?? procedure?.quad_abbr;
  if (Array.isArray(values)) return values;
  if (typeof procedure?.abbr === "string" && procedure.abbr.includes(";")) {
    return procedure.abbr.split(";").map((value) => value.trim());
  }
  return [];
}

export function get_matching_quadrants(abbreviations, quadrants) {
  if (!quadrants || !Array.isArray(abbreviations)) return [];
  return QUADRANT_KEYS.flatMap((key, index) => {
    const quadrant = quadrants[key];
    return quadrant?.name && abbreviations[index]
      ? [{ name: quadrant.name, color: quadrant.color || "" }]
      : [];
  });
}

export function get_person_quadrant_flags(person) {
  const flags = QUADRANT_KEYS.map((_, index) => Boolean(person?.quad_flags?.[index]));
  const entries = [
    ...(person?.diseases || []).map(get_quadrant_abbreviations),
    ...(person?.procedures || []).map(get_procedure_quadrant_abbreviations),
  ];
  for (const abbreviations of entries) {
    for (let index = 0; index < flags.length; index++) {
      if (abbreviations[index]) flags[index] = true;
    }
  }
  return flags;
}

export function remove_procedure_quadrant_flags(person, procedure) {
  if (!Array.isArray(person.quad_flags)) return;
  const removed = get_procedure_quadrant_abbreviations(procedure);
  const remaining = get_person_quadrant_flags({ ...person, quad_flags: [] });
  person.quad_flags = person.quad_flags.map((flag, index) =>
    removed[index] && !remaining[index] ? false : flag
  );
}

export function get_procedure_display_name(procedure) {
  const abbr = procedure?.abbr;
  if (typeof abbr === "string" && abbr.includes(";")) {
    const label = abbr.split(";").map((value) => value.trim()).filter(Boolean).join(";");
    return label || procedure.description || procedure.code;
  }
  return abbr || procedure?.description || procedure?.code;
}
