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

function validEntries(document, label, approved) {
  if (!document || !document.fighters || typeof document.fighters !== 'object' ||
      Array.isArray(document.fighters)) throw Error(label + ': invalid fighter register');
  const entries = Object.entries(document.fighters);
  for (const [slug, proof] of entries) {
    if (!approved.has(slug)) throw Error(label + ': unapproved fighter ' + slug);
    if (proof?.sourceCoverageAttested !== true ||
        proof?.scope !== 'complete_official_ufc_career' ||
        !Array.isArray(proof?.bouts) || !proof.bouts.length)
      throw Error(label + ': incomplete source evidence for ' + slug);
    const ids = new Set();
    for (const bout of proof.bouts) {
      const id = String(bout?.nativeBoutId || '');
      if (!id || !bout?.fightUrl || !bout?.nativeFighterId || !bout?.result)
        throw Error(label + ': missing native/source bout identity for ' + slug);
      if (ids.has(id)) throw Error(label + ': duplicated native bout ' + slug + '/' + id);
      ids.add(id);
    }
  }
  return entries;
}

/** Check stable source-native identities, NOT innocuous review prose or aliases. */
export function sourceNativeSignature(proof) {
  return proof.bouts.map(b => [
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
