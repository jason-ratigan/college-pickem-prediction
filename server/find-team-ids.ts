import { db } from './db.js';
import { teams } from '@college-pickem/shared';
import { like } from 'drizzle-orm';

const teamNames = ['Ole Miss', 'Oklahoma', 'Auburn', 'Arkansas'];

for (const teamName of teamNames) {
  const results = await db.select({
    id: teams.id,
    name: teams.name
  }).from(teams)
  .where(like(teams.name, `%${teamName}%`));
  
  console.log(`${teamName}:`, results);
}

process.exit(0);