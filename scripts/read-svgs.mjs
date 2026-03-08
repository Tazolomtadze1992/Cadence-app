import { readFileSync } from 'fs';

const files = [
  'public/icons/overdue.svg',
  'public/icons/due-today.svg',
  'public/icons/due-tomorrow.svg',
  'public/icons/due-soon.svg',
];

for (const file of files) {
  console.log(`\n=== ${file} ===`);
  console.log(readFileSync(file, 'utf-8'));
}
