/** Optional R2 adapter for the existing V3 fighter dialog.
 * Not loaded by index.html; caller explicitly opts in only for pilot QA.
 */
import {renderVerifiedCareerPanel} from './ufc-v4-r2-career-panel.mjs';
export function mountVerifiedCareerPilot(dialog,{fighterSlug,...options}={}){
  if(!dialog||typeof dialog.querySelector!=='function')return {mounted:false,reason:'no_dialog'};
  // Repeated V3 profile updates must not create duplicate history panels.
  const previous=dialog.querySelector('[data-befn-r2-career-pilot]');
  if(previous)previous.remove();
  const result=renderVerifiedCareerPanel({fighterSlug,...options});
  if(!result.visible)return {mounted:false,reason:result.reason};
  const host=dialog.querySelector('.befn-profile-insights[data-befn-profile]');
  if(!host)return {mounted:false,reason:'no_v3_profile'};
  const panel=dialog.ownerDocument.createElement('div');
  panel.dataset.befnR2CareerPilot='true';
  panel.innerHTML=result.html;
  host.append(panel);
  return {mounted:true,reason:result.reason};
}
