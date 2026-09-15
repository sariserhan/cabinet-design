import {
  designSchema,
  newDesign,
  fromObject,
  normalizeOpenings,
  type Design,
} from './model';
import { surveySchema, type Survey } from './measurement-schema';
export const toInches = (value: number, unit: Survey['originalUnit']) =>
  value / { in: 1, cm: 2.54, mm: 25.4 }[unit];
export const fromInches = (value: number, unit: Survey['originalUnit']) =>
  Math.round(value * { in: 1, cm: 2.54, mm: 25.4 }[unit] * 100) / 100;
export function surveyIssues(survey: Survey) {
  const issues: string[] = [];
  if (
    [survey.north, survey.south, survey.east, survey.west, survey.height].some(
      (n) => !Number.isFinite(n) || n < 36 || n > 600,
    )
  )
    issues.push(
      'Room dimensions must be between 36 and 600 inches (or the equivalent in your chosen unit).',
    );
  if (
    survey.openings.some(
      (o) => o.width <= 0 || o.height <= 0 || o.offset < 0 || o.sill < 0,
    )
  )
    issues.push(
      'Openings need positive width and height, with non-negative offsets and sills.',
    );
  if (
    Math.abs(survey.north - survey.south) > 0.5 ||
    Math.abs(survey.east - survey.west) > 0.5
  )
    issues.push(
      'Opposite walls differ by more than ½ inch. Recheck measurements or use the custom room outline for a non-rectangular room.',
    );
  for (const opening of survey.openings) {
    const length =
      opening.wall === 'north' || opening.wall === 'south'
        ? survey.north
        : survey.east;
    if (opening.offset + opening.width > length)
      issues.push(`${opening.kind} on ${opening.wall} extends past the wall.`);
    if (opening.sill + opening.height > survey.height)
      issues.push(
        `${opening.kind} on ${opening.wall} extends above the ceiling.`,
      );
    if (opening.kind === 'door' && opening.sill !== 0)
      issues.push('Door sill must start at floor level.');
  }
  survey.openings.forEach((a, index) =>
    survey.openings.slice(index + 1).forEach((b) => {
      if (
        a.wall === b.wall &&
        a.offset < b.offset + b.width &&
        a.offset + a.width > b.offset &&
        a.sill < b.sill + b.height &&
        a.sill + a.height > b.sill
      )
        issues.push(`Openings overlap on the ${a.wall} wall.`);
    }),
  );
  for (const utility of survey.utilities) {
    const length =
      utility.wall === 'north' || utility.wall === 'south'
        ? survey.north
        : survey.east;
    if (utility.offset > length || utility.height > survey.height)
      issues.push(
        `${utility.kind} location is outside the ${utility.wall} wall.`,
      );
  }
  if (
    new Set(survey.openings.map((o) => o.id)).size !== survey.openings.length ||
    new Set(survey.utilities.map((o) => o.id)).size !== survey.utilities.length
  )
    issues.push('Each measured opening and utility needs a unique identifier.');
  return issues;
}
export function measuredDesign(input: Survey): Design {
  const survey = surveySchema.parse(input),
    issues = surveyIssues(survey);
  if (issues.length) throw Error(issues.join(' '));
  const design = newDesign();
  design.name = 'Measured kitchen';
  design.room = {
    ...design.room,
    width: survey.north,
    depth: survey.east,
    height: survey.height,
  };
  design.items = survey.openings.map((o) => ({
    ...fromObject(o.kind),
    id: o.id,
    width: o.width,
    height: o.height,
    elevation: o.sill,
    wall: o.wall,
    wallSegment: { north: 0, east: 1, south: 2, west: 3 }[o.wall],
    rotation: { north: 0, east: 90, south: 180, west: 270 }[o.wall],
    x: o.wall === 'east' ? survey.north - 4 : o.wall === 'west' ? 0 : o.offset,
    y: o.wall === 'south' ? survey.east - 4 : o.wall === 'north' ? 0 : o.offset,
  }));
  return designSchema.parse({
    ...normalizeOpenings(design),
    measurements: survey,
  });
}
export function utilityPoint(
  survey: Pick<Survey, 'north' | 'east'>,
  utility: Survey['utilities'][number],
) {
  return {
    x:
      utility.wall === 'east'
        ? survey.north
        : utility.wall === 'west'
          ? 0
          : utility.offset,
    y:
      utility.wall === 'south'
        ? survey.east
        : utility.wall === 'north'
          ? 0
          : utility.offset,
  };
}
