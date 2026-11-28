#!/usr/bin/env node
/* Sumo live prediction record: after each live refresh (.github/workflows/sumo-preview-live-refresh.yml),
   save the announced day's picks before it is fought, and score saved picks once fought.
   Reads data/sumo/preview-details.json and data/sumo/predictor.json; writes data/sumo/prediction-log.json
   only when something changed. Offline: no requests. Rules in assets/sumo-prediction-log.mjs. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { recordPicks, scoreLog, emptyLog } from '../assets/sumo-prediction-log.mjs';

const ROOT = new URL('../', import.meta.url);
const LOG = new URL('data/sumo/prediction-log.json', ROOT);
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const details = read('data/sumo/preview-details.json'), model = read('data/sumo/predictor.json');
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : emptyLog();
const before = JSON.stringify(log);
const scored = scoreLog(log, details).scored;
const { saved, reason } = recordPicks(log, details, model);
if (JSON.stringify(log) !== before) writeFileSync(LOG, JSON.stringify(log) + '\n');
console.log('prediction log:', saved.length ? 'saved day ' + details.announcedDay + ' ' + saved.join(', ') : reason, '| results added:', scored);
