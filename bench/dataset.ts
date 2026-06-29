/**
 * Benchmark dataset — 100+ messy, real-world routine descriptions with
 * lightweight gold labels. Gold asserts only what is UNAMBIGUOUS (a keyword the
 * title should contain, and — where clear — recurrence / type / time), so the
 * score is fair across providers and not over-fit to one phrasing.
 */

import type { Category } from '../src/domain/types.ts';

export type Recurrence = 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface ExpectItem {
  kw: string; // lowercase substring the extracted title should contain
  type?: 'fixed' | 'flexible';
  cat?: Category;
  rec?: Recurrence;
  time?: string; // "HH:mm"
}

export interface BenchCase {
  id: string;
  input: string;
  expect: ExpectItem[];
}

const c = (id: string, input: string, expect: ExpectItem[]): BenchCase => ({ id, input, expect });

export const DATASET: BenchCase[] = [
  c('work-hours', 'I work monday to friday from 9 to 6', [{ kw: 'work', type: 'fixed', rec: 'weekdays', time: '09:00' }]),
  c('wake-daily', 'wake me every day at 5', [{ kw: 'wake', rec: 'daily', time: '05:00' }]),
  c('gym-after-work', 'hit the gym after work', [{ kw: 'gym', type: 'flexible', cat: 'health' }]),
  c('study-1h', 'study salesforce for one hour every day', [{ kw: 'study', type: 'flexible', cat: 'learning', rec: 'daily' }]),
  c('pray-once', 'pray at 5:10', [{ kw: 'pray', type: 'fixed', cat: 'faith', time: '05:10' }]),
  c('read-30', 'read 30 minutes daily', [{ kw: 'read', type: 'flexible', rec: 'daily' }]),
  c('sleep-11', 'sleep at 11 pm', [{ kw: 'sleep', time: '23:00' }]),
  c('water-2h', 'drink water every two hours', [{ kw: 'water', cat: 'health' }]),
  c('medicine-breakfast', 'take medicine after breakfast', [{ kw: 'medicine', cat: 'health' }]),
  c('standup-weekday', 'daily standup at 9:30 on weekdays', [{ kw: 'standup', type: 'fixed', rec: 'weekdays', time: '09:30' }]),
  c('doctor-appt', 'doctor appointment next tuesday at 3pm', [{ kw: 'doctor', type: 'fixed', time: '15:00' }]),
  c('rent-monthly', 'pay rent on the 1st every month', [{ kw: 'rent', rec: 'monthly' }]),
  c('kids-school', 'drop kids at school at 8am weekdays', [{ kw: 'school', rec: 'weekdays', time: '08:00' }]),
  c('pickup-3', 'pick up the kids at 3:15', [{ kw: 'pick', time: '15:15' }]),
  c('gym-mwf', 'gym on monday wednesday friday at 7am', [{ kw: 'gym', type: 'flexible', rec: 'weekly', time: '07:00' }]),
  c('walk-evening', 'go for a walk every evening', [{ kw: 'walk', rec: 'daily' }]),
  c('meditate-morning', 'meditate for 10 min each morning', [{ kw: 'meditat', rec: 'daily' }]),
  c('lunch-1', 'lunch at 1pm', [{ kw: 'lunch', time: '13:00' }]),
  c('team-meeting-weekly', 'team meeting every monday 10am', [{ kw: 'meeting', type: 'fixed', rec: 'weekly', time: '10:00' }]),
  c('flight-friday', 'flight friday 6:45am', [{ kw: 'flight', type: 'fixed', time: '06:45' }]),
  c('protein-shake', 'protein shake after gym', [{ kw: 'protein', cat: 'health' }]),
  c('supplements-am', 'take supplements every morning at 8', [{ kw: 'supplement', rec: 'daily', time: '08:00' }]),
  c('language-duolingo', 'practice spanish 15 minutes a day', [{ kw: 'spanish', type: 'flexible', rec: 'daily' }]),
  c('1on1-thursday', '1:1 with manager thursdays at 2', [{ kw: '1:1', type: 'fixed', rec: 'weekly', time: '14:00' }]),
  c('groceries-sat', 'grocery shopping saturday morning', [{ kw: 'grocery', rec: 'weekly' }]),
  c('call-mom-sunday', 'call mom every sunday evening', [{ kw: 'call', rec: 'weekly' }]),
  c('journal-night', 'journal before bed', [{ kw: 'journal' }]),
  c('coffee-7', 'coffee at 7am', [{ kw: 'coffee', time: '07:00' }]),
  c('commute-830', 'leave for office at 8:30 on weekdays', [{ kw: 'office', rec: 'weekdays', time: '08:30' }]),
  c('yoga-tue-thu', 'yoga tuesday and thursday 6pm', [{ kw: 'yoga', rec: 'weekly', time: '18:00' }]),
  c('run-5k', 'morning run 5k at 6', [{ kw: 'run', cat: 'health', time: '06:00' }]),
  c('dentist', 'dentist on the 15th at 11', [{ kw: 'dentist', type: 'fixed', time: '11:00' }]),
  c('water-plants', 'water the plants every other day', [{ kw: 'plant' }]),
  c('budget-review', 'review budget monthly', [{ kw: 'budget', rec: 'monthly' }]),
  c('school-pta', 'pta meeting first monday of the month', [{ kw: 'pta', type: 'fixed', rec: 'monthly' }]),
  c('vitamins-night', 'vitamins at night', [{ kw: 'vitamin', cat: 'health' }]),
  c('emails-9', 'check emails at 9 and 4', [{ kw: 'email' }]),
  c('nap-2', 'short nap at 2pm', [{ kw: 'nap', time: '14:00' }]),
  c('prayers-5', 'i pray five times a day fajr dhuhr asr maghrib isha', [{ kw: 'pray', type: 'fixed', cat: 'faith' }]),
  c('gym-evening-typo', 'go too the gym evry day at 6pm', [{ kw: 'gym', rec: 'daily', time: '18:00' }]),
  c('study-runon', 'study salesforce gym after work read at night sleep by 11', [{ kw: 'study', cat: 'learning' }, { kw: 'gym', cat: 'health' }, { kw: 'read' }, { kw: 'sleep' }]),
  c('mtg-recur-biweekly', 'sprint planning every other monday at 10', [{ kw: 'sprint', type: 'fixed', time: '10:00' }]),
  c('school-bus-715', 'kids catch the bus at 7:15', [{ kw: 'bus', time: '07:15' }]),
  c('gym-leg-day', 'leg day at the gym mondays', [{ kw: 'gym', rec: 'weekly' }]),
  c('water-8-glasses', 'drink 8 glasses of water a day', [{ kw: 'water', rec: 'daily' }]),
  c('stretch-am', 'stretch for 5 minutes when i wake up', [{ kw: 'stretch' }]),
  c('standup-daily-2', 'standup 9am mon-fri', [{ kw: 'standup', rec: 'weekdays', time: '09:00' }]),
  c('class-eng-101', 'english 101 lecture tue thu 11am', [{ kw: 'english', rec: 'weekly', time: '11:00' }]),
  c('gym-pm-flex', 'workout sometime in the evening', [{ kw: 'workout', type: 'flexible' }]),
  c('breakfast-7', 'breakfast at 7:30 every morning', [{ kw: 'breakfast', rec: 'daily', time: '07:30' }]),
  c('client-call-wed', 'client call wednesday 4pm', [{ kw: 'client', type: 'fixed', time: '16:00' }]),
  c('meds-twice', 'take blood pressure pills morning and evening', [{ kw: 'pill', cat: 'health' }]),
  c('school-homework', 'help kids with homework after dinner', [{ kw: 'homework', cat: 'family' }]),
  c('gym-3x', 'gym three times a week', [{ kw: 'gym', type: 'flexible' }]),
  c('meeting-allhands', 'all hands first friday monthly 3pm', [{ kw: 'all hands', type: 'fixed', rec: 'monthly', time: '15:00' }]),
  c('water-curry', 'curry leaves water every morning', [{ kw: 'curry' }]),
  c('amla-daily', 'amla every day', [{ kw: 'amla', rec: 'daily' }]),
  c('flaxseed', 'flaxseed with breakfast', [{ kw: 'flaxseed' }]),
  c('milk-kids-8', 'give kids milk at 8pm', [{ kw: 'milk', time: '20:00' }]),
  c('school-drop-am', 'school drop off 8:15 weekdays', [{ kw: 'school', rec: 'weekdays', time: '08:15' }]),
  c('study-cert', 'prepare for aws certification 2 hours daily', [{ kw: 'aws', type: 'flexible', rec: 'daily' }]),
  c('phone-detox', 'no phone after 10pm', [{ kw: 'phone' }]),
  c('weigh-in', 'weigh myself every monday morning', [{ kw: 'weigh', rec: 'weekly' }]),
  c('water-reminder-typo', 'remnd me to drnk watr evry 2 hrs', [{ kw: 'wat', cat: 'health' }]),
  c('gym-then-shower', 'gym then shower then commute', [{ kw: 'gym' }, { kw: 'shower' }]),
  c('mtg-retro', 'retro every other friday 2pm', [{ kw: 'retro', type: 'fixed', time: '14:00' }]),
  c('lunch-meeting', 'lunch meeting with sara thursday noon', [{ kw: 'lunch', type: 'fixed', time: '12:00' }]),
  c('prayer-times-list', 'remind me to pray at 5:10 1:10 5:30 7:00 and 8:30', [{ kw: 'pray', type: 'fixed', cat: 'faith' }]),
  c('school-exam', 'math exam on the 20th at 9am', [{ kw: 'exam', type: 'fixed', time: '09:00' }]),
  c('gym-cardio', 'cardio 20 min before work', [{ kw: 'cardio', cat: 'health' }]),
  c('meds-antibiotic', 'antibiotics every 8 hours for a week', [{ kw: 'antibiotic', cat: 'health' }]),
  c('standup-remote', 'remote standup 9:15 weekdays on zoom', [{ kw: 'standup', rec: 'weekdays', time: '09:15' }]),
  c('reading-club', 'book club last thursday of month 7pm', [{ kw: 'book club', rec: 'monthly', time: '19:00' }]),
  c('school-music', 'piano lesson saturdays 10am', [{ kw: 'piano', rec: 'weekly', time: '10:00' }]),
  c('water-gym-combo', 'gym at 6 and drink water through the day', [{ kw: 'gym', time: '06:00' }, { kw: 'water' }]),
  c('commute-train', 'catch the 7:40 train', [{ kw: 'train', time: '07:40' }]),
  c('dinner-family', 'family dinner at 7:30 every night', [{ kw: 'dinner', cat: 'family', rec: 'daily', time: '19:30' }]),
  c('study-night', 'revise notes for 45 min nightly', [{ kw: 'revise', rec: 'daily' }]),
  c('mtg-onethirty', 'design sync at 1:30pm tuesdays', [{ kw: 'design', type: 'fixed', rec: 'weekly', time: '13:30' }]),
  c('gym-weekend', 'long workout on saturdays', [{ kw: 'workout', rec: 'weekly' }]),
  c('meds-insulin', 'insulin before meals', [{ kw: 'insulin', cat: 'health' }]),
  c('school-assembly', 'school assembly monday 8:45', [{ kw: 'assembly', time: '08:45' }]),
  c('walk-dog', 'walk the dog twice a day', [{ kw: 'dog' }]),
  c('study-pomodoro', 'study in pomodoros every afternoon', [{ kw: 'study', rec: 'daily' }]),
  c('appt-haircut', 'haircut next saturday 11:30', [{ kw: 'haircut', time: '11:30' }]),
  c('mtg-board', 'board meeting quarterly', [{ kw: 'board' }]),
  c('gym-am-pm', 'gym at 6am and walk at 6pm', [{ kw: 'gym', time: '06:00' }, { kw: 'walk', time: '18:00' }]),
  c('prayer-fajr', 'fajr prayer at 5:10 every day', [{ kw: 'fajr', cat: 'faith', rec: 'daily', time: '05:10' }]),
  c('school-parents', 'parent teacher meeting on the 12th 4pm', [{ kw: 'parent', type: 'fixed', time: '16:00' }]),
  c('water-bottle', 'finish my water bottle by noon', [{ kw: 'water' }]),
  c('study-gre', 'gre prep one hour after dinner', [{ kw: 'gre', type: 'flexible' }]),
  c('mtg-1530', 'weekly review friday 3:30pm', [{ kw: 'review', rec: 'weekly', time: '15:30' }]),
  c('breakfast-meds', 'eat breakfast then take metformin', [{ kw: 'breakfast' }, { kw: 'metformin', cat: 'health' }]),
  c('gym-pushday', 'push day at 5pm monday', [{ kw: 'push', rec: 'weekly', time: '17:00' }]),
  c('school-soccer', 'soccer practice wed and fri 4pm', [{ kw: 'soccer', rec: 'weekly', time: '16:00' }]),
  c('study-thesis', 'work on thesis 9 to 11 every morning', [{ kw: 'thesis', rec: 'daily', time: '09:00' }]),
  c('appt-vet', 'vet appointment thursday 2:30', [{ kw: 'vet', type: 'fixed', time: '14:30' }]),
  c('water-am', 'glass of water first thing in the morning', [{ kw: 'water' }]),
  c('mtg-interview', 'interview candidate monday 11am', [{ kw: 'interview', type: 'fixed', time: '11:00' }]),
  c('gym-swim', 'swim laps tuesday thursday 7am', [{ kw: 'swim', rec: 'weekly', time: '07:00' }]),
  c('study-react', 'learn react 30 min daily before work', [{ kw: 'react', type: 'flexible', rec: 'daily' }]),
  c('chore-trash', 'take out the trash every tuesday night', [{ kw: 'trash', rec: 'weekly' }]),
  c('chore-laundry', 'laundry on sundays', [{ kw: 'laundry', rec: 'weekly' }]),
  c('multi-morning', 'wake at 5, pray at 5:10, gym at 6, work at 9', [{ kw: 'wake', time: '05:00' }, { kw: 'pray', time: '05:10' }, { kw: 'gym', time: '06:00' }, { kw: 'work', time: '09:00' }]),
  c('multi-evening', 'dinner at 8, read 30 min, sleep by 11', [{ kw: 'dinner', time: '20:00' }, { kw: 'read' }, { kw: 'sleep' }]),
  c('messy-1', 'mon to fri office 9-6 then gym then dinner w family 8pm', [{ kw: 'office', rec: 'weekdays', time: '09:00' }, { kw: 'gym' }, { kw: 'dinner', time: '20:00' }]),
  c('messy-2', 'study java 1hr every day and walk 20 min', [{ kw: 'java', rec: 'daily' }, { kw: 'walk' }]),
  c('messy-3', 'kids: school 8am, pickup 3pm, milk 8pm, sleep 9pm', [{ kw: 'school', time: '08:00' }, { kw: 'pickup', time: '15:00' }, { kw: 'milk', time: '20:00' }, { kw: 'sleep', time: '21:00' }]),
];
