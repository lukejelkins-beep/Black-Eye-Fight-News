/* A prompt where supported; clear home-screen instructions where it is not. */
(() => {
  'use strict';
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if(standalone()) return;
  let promptEvent = null;
  let button = null;
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = apple || /Android/.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    createButton();
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    if(button) button.remove();
    button = null;
  });
  function help() {
    if(document.querySelector('.befn-install-backdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'befn-install-backdrop';
    const panel = document.createElement('section');
    panel.className = 'befn-install-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','befn-install-title');
    const title = document.createElement('h2');
    title.id='befn-install-title';
    title.textContent='Install Black Eye Fight News';
    const instructions = document.createElement('p');
    instructions.textContent = apple
      ? 'On iPhone or iPad, open this page in Safari, tap Share, then choose Add to Home Screen and tap Add.'
      : /Android/.test(navigator.userAgent)
      ? 'Open your browser menu and choose Install app or Add to Home screen.'
      : 'Open your browser menu and choose Install app or Create shortcut.';
    const note = document.createElement('p');
    note.textContent='Your fight cards, results and news stay connected to the live website.';
    const close = document.createElement('button');
    close.type='button';close.textContent='Got it';
    const dismiss=()=>{backdrop.remove();window.removeEventListener('keydown',escape);if(button)button.focus();};
    const escape=event=>{if(event.key==='Escape')dismiss();};
    close.addEventListener('click',dismiss);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)dismiss();});
    panel.append(title,instructions,note,close);
    backdrop.append(panel);
    document.body.append(backdrop);
    window.addEventListener('keydown',escape);
    close.focus();
  }
  async function install() {
    if(!promptEvent){help();return;}
    const event = promptEvent;promptEvent=null;
    try { await event.prompt(); await event.userChoice; }
    catch { help(); }
  }
  function createButton() {
    if(button || standalone()) return;
    const host = document.querySelector('.navrail') || document.body;
    button=document.createElement('button');
    button.type='button';
    button.className='befn-install-button';
    button.textContent='Install app';
    button.setAttribute('aria-label','Install Black Eye Fight News app');
    button.addEventListener('click',install);
    host.append(button);
  }
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',()=>{if(mobile)createButton();},{once:true});
  } else if(mobile) createButton();
})();
