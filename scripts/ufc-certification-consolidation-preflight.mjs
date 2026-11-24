#!/usr/bin/env node
/**
 * BEFN UFC certification consolidation preflight (offline, read only).
 *
 * ONE canonical independently attested register is authoritative. Secondary
 * branches may supply evidence, but overlap never adds a second certificate.
 * This script classifies candidates; it does not grant certification or write
 * to the canonical register. The full 783-person strict Stage3 audit remains
 * the only certificate gate.
 *
 * Usage:
 *   node scripts/ufc-certification-consolidation-preflight.mjs [candidate.json...]
 * Candidate files must contain a { fighters: { slug: proof } } object.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.resolve(root, p), 'utf8'));
const canonicalPath = 'data/ufc-independent-full-career-verification.json';

const UFCSTATS_FIGHT = /^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/;
const UFCSTATS_FIGHTER = /^https:\/\/ufcstats\.com\/fighter-details\/[0-9a-f]{16}$/;
function isUfcStatsProof(proof) {
  return !proof.certificationStandard && UFCSTATS_FIGHTER.test(String(proof.fighterUrl || '')) &&
    proof.bouts.every(b => !b?.nativeBoutId && !b?.nativeFighterId);
}

function validEntries(document, label, approved) {
  if (!document || !document.fighters || typeof document.fighters !== 'object' ||
      Array.isArray(document.fighters)) throw Error(label + ': invalid fighter register');
  const entries = Object.entries(document.fighters);
  for (const [slug, proof] of entries) {
    if (!approved.has(slug)) throw Error(label + ': unapproved fighter ' + slug);
    if (proof?.sourceCoverageAttested !== true ||
        !['complete_official_ufc_career', 'full_ufc_career_from_debut_to_snapshot'].includes(proof?.scope) ||
        !Array.isArray(proof?.bouts) || !proof.bouts.length)
      throw Error(label + ': incomplete source evidence for ' + slug);
    const ids = new Set();
    const semantic = proof.certificationStandard === 'ufcalendar_first';
    // UFCStats-sourced proofs carry no numeric native IDs; they are identified by the fighter-details
    // page and one fight-details URL per bout instead.
    const ufcstats = !semantic && isUfcStatsProof(proof);
    if (semantic && (
        proof.verificationMethod !== 'full_official_ufc_fight_listing_crosscheck' ||
        !/^https:\/\/www\.ufc\.com\/athlete\/[a-z0-9-]+\/?$/i.test(String(proof.officialFighterUrl||'')) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(proof.verifiedAt||'')) ||
        !String(proof.fighterName||'').trim()))
      throw Error(label + ': unverified UFCalendar-first official identity for ' + slug);
    for (const bout of proof.bouts) {
      const id = String(bout?.nativeBoutId || '');
      if (semantic) {
        const date=String(bout?.date||''),opponent=String(bout?.opponent||'')
          .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
          .replace(/[^a-z0-9]/g,'');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !opponent ||
            !['win','loss','draw','no_contest'].includes(String(bout?.result||'').toLowerCase()))
          throw Error(label + ': missing official UFC chronology for ' + slug);
        const fingerprint=date+'|'+opponent;
        if (ids.has(fingerprint)) throw Error(label + ': duplicated official bout ' + slug + '/' + fingerprint);
        ids.add(fingerprint);
      } else if (ufcstats && bout?.roadToUfcFinal === true && bout?.savedHistoryGap === true && !bout?.fightUrl) {
        // Owner, 24 Nov 2026: a Road to UFC final is a result-only gap bout with no UFCStats page; it is
        // identified by its UFC.com source, date and opponent instead.
        const opponent=String(bout?.opponent||'').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bout?.date||'')) || !opponent ||
            !['win','loss'].includes(String(bout?.result||'').toLowerCase()) ||
            !/^https:\/\/www\.ufc\.com\//i.test(String(bout?.officialUfcSourceUrl||'')))
          throw Error(label + ': missing Road to UFC final source for ' + slug);
        const key='rtu:'+bout.date+'|'+opponent.toLowerCase();
        if (ids.has(key)) throw Error(label + ': duplicated Road to UFC final ' + slug);
        ids.add(key);
      } else if (ufcstats) {
        const opponent=String(bout?.opponent||'').trim(),url=String(bout?.fightUrl||'');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bout?.date||'')) || !opponent ||
            !['win','loss','draw','no_contest'].includes(String(bout?.result||'').toLowerCase()) ||
            !UFCSTATS_FIGHT.test(url))
          throw Error(label + ': missing UFCStats bout identity for ' + slug);
        if (ids.has(url)) throw Error(label + ': duplicated UFCStats bout ' + slug + '/' + url);
        ids.add(url);
      } else {
        if (!id || !bout?.fightUrl || !bout?.nativeFighterId || !bout?.result)
          throw Error(label + ': missing native/source bout identity for ' + slug);
        if (ids.has(id)) throw Error(label + ': duplicated native bout ' + slug + '/' + id);
        ids.add(id);
      }
    }
  }
  return entries;
}

/** Check stable source-native identities, NOT innocuous review prose or aliases. */
export function sourceNativeSignature(proof) {
  if(proof.certificationStandard === 'ufcalendar_first')
    return 'official:' + proof.bouts.map(b=>[
      String(b.date), String(b.opponent||'').normalize('NFKD')
       .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''),
      String(b.result).toLowerCase()
    ].join('|')).sort().join(';;');
  if(isUfcStatsProof(proof))
    return 'ufcstats:' + proof.bouts.map(b=>[
      String(b.fightUrl || ('rtu:' + b.date + '|' + b.opponent)), String(b.result).toLowerCase()
    ].join('|')).sort().join(';;');
  return 'native:' + proof.bouts.map(b => [
    String(b.nativeBoutId), String(b.nativeFighterId),
    String(b.fightUrl), String(b.result).toLowerCase()
  ].join('|')).sort().join(';;');
}

export function preflight(canonical, approvedSlugs, candidates = []) {
  if (!Array.isArray(approvedSlugs) || approvedSlugs.length !== 783 ||
      new Set(approvedSlugs).size !== 783)
    throw Error('Refusing preflight: immutable 783 approved fighter list required');
  const approved = new Set(approvedSlugs);
  const current = new Map(validEntries(canonical, 'canonical', approved));
  const seenNew = new Map();
  const result = {
    schema: 1,
    scope: 'ufc-canonical-certification-consolidation-preflight',
    approved: 783,
    canonicalEvidenceEntries: current.size,
    sourceOnlyNewCandidates: [],
    alreadyInCanonical: [],
    repeatedCandidateNoops: [],
    conflictingCandidates: [],
    certificationGranted: false,
    canonicalModified: false
  };
  for (const { label, document } of candidates) {
    for (const [slug, proof] of validEntries(document, label, approved)) {
      const signature = sourceNativeSignature(proof);
      if (current.has(slug)) {
        if (sourceNativeSignature(current.get(slug)) === signature)
          result.alreadyInCanonical.push({ slug, from: label });
        else
          result.conflictingCandidates.push({ slug, from: label, reason: 'canonical_source_native_identity_or_outcome_mismatch' });
        continue;
      }
      if (seenNew.has(slug)) {
        if (seenNew.get(slug) === signature)
          result.repeatedCandidateNoops.push({ slug, from: label });
        else
          result.conflictingCandidates.push({ slug, from: label, reason: 'parallel_candidate_source_native_mismatch' });
        continue;
      }
      seenNew.set(slug, signature);
      result.sourceOnlyNewCandidates.push({ slug, from: label, requiresStrictStage3: true });
    }
  }
  result.counts = {
    canonical: current.size,
    newCandidates: result.sourceOnlyNewCandidates.length,
    alreadyCertifiedNoops: result.alreadyInCanonical.length,
    repeatedNoops: result.repeatedCandidateNoops.length,
    conflicts: result.conflictingCandidates.length
  };
  result.safeToReview = result.counts.conflicts === 0;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const roster = read('data/ufc-36-month-roster-approval.json');
  if (roster.status !== 'approved') throw Error('Unapproved roster');
  const candidates = process.argv.slice(2).map(p => ({ label: p, document: read(p) }));
  const result = preflight(read(canonicalPath), roster.approvedFighters, candidates);
  console.log('BEFN_CERTIFICATION_CONSOLIDATION=' + JSON.stringify(result));
  if (!result.safeToReview) {
    console.error('BLOCKED: overlapping histories contradict canonical native/source evidence; resolve manually. Nothing imported.');
    process.exitCode = 1;
  }
}
