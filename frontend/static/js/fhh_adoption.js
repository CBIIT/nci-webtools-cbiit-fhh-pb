export function adoption_notation(value) {
  switch (typeof value === "string" ? value.trim() : "") {
    case "Yes-Adopted in":
      return { bracket: true, connector: "dotted", question: false };
    case "Yes-Adopted out":
      return { bracket: true, connector: "solid", question: false };
    case "Yes":
    case "Yes (QC)":
    case "Don't Know":
      return { bracket: true, connector: "solid", question: true };
    default:
      return { bracket: false, connector: "solid", question: false };
  }
}

export function adoption_bracket_padding(size) {
  return Math.max(8, size * 0.24);
}

export function adoption_question_position(center, size, has_bracket, connector) {
  if (
    connector &&
    [connector.x1, connector.y1, connector.x2, connector.y2].every(Number.isFinite)
  ) {
    return {
      x: (connector.x1 + connector.x2) / 2,
      y: (connector.y1 + connector.y2) / 2,
    };
  }

  return {
    x: center.x + size / 2 + (has_bracket
      ? adoption_bracket_padding(size) + Math.max(8, size * 0.12)
      : 6),
    y: center.y,
  };
}

export function adoption_bracket_segments(center, size) {
  const padding = adoption_bracket_padding(size);
  const hook = Math.max(5, size * 0.16);
  const left = center.x - size / 2 - padding;
  const right = center.x + size / 2 + padding;
  const top = center.y - size / 2 - padding;
  const bottom = center.y + size / 2 + Math.min(3, size * 0.04);

  return [
    [left, top, left, bottom],
    [left, top, left + hook, top],
    [left, bottom, left + hook, bottom],
    [right, top, right, bottom],
    [right - hook, top, right, top],
    [right - hook, bottom, right, bottom],
  ];
}
