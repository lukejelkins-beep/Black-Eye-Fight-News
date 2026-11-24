/** BEFN UFC V4 R2 — pure, fail-closed career-view publication gate.
 * Offline module only. Nothing here enables a public UI or authorizes release.
 * The caller must provide a completed, successful, exact-commit FULL-COHORT audit.
 */
export function canShowVerifiedCareer({featureEnabled=false, fighterSlug, audit, expectedCommit, duplicateIdentitySlugs=[]}={}) {
  const deny=(reason)=>({allowed:false,reason});
  if(featureEnabled!==true)return deny('feature_disabled');
  if(typeof fighterSlug!=='string'||!fighterSlug)return deny('invalid_fighter');
  if(!audit||audit.status!=='success'||audit.scope!=='full_cohort'||audit.approved!==783||
      audit.passed!==true||typeof expectedCommit!=='string'||!/^[a-f0-9]{40}$/.test(expectedCommit)||
      audit.commitSha!==expectedCommit)return deny('audit_not_verified');
  if(!Array.isArray(audit.certifiedSlugs)||new Set(audit.certifiedSlugs).size!==audit.certifiedSlugs.length||
      audit.certifiedSlugs.length!==audit.certified||audit.certified+audit.exceptions!==783)
    return deny('audit_cohort_invalid');
  if(!Array.isArray(duplicateIdentitySlugs)||duplicateIdentitySlugs.includes(fighterSlug))
    return deny('identity_unresolved');
  if(!audit.certifiedSlugs.includes(fighterSlug))return deny('fighter_not_certified');
  return {allowed:true,reason:'certified_at_exact_commit'};
}
