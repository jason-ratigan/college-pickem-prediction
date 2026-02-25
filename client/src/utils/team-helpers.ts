interface Team {
  name: string;
  abbreviation?: string | null;
}

/**
 * Gets the preferred short name for a team.
 * Prioritizes the official abbreviation if it exists.
 * Falls back to the last word of the team's full name.
 * @param team - The team object, which must have a `name` and may have an `abbreviation`.
 * @returns The team's short name as a string.
 */
export const getShortName = (team: Team | null | undefined): string => {
  if (!team) return '';
  return team.abbreviation || team.name.split(' ').pop() || '';
};