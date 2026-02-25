import { getCurrentWeek } from './services/gameService.js';

const currentWeek = await getCurrentWeek();
console.log('Current week from service:', currentWeek);

const actualCurrentYear = new Date().getFullYear();
console.log('Actual current year:', actualCurrentYear);

process.exit(0);