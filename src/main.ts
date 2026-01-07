import { setupDomPortal } from "@metervara/dom-portal";
import { createEye } from './eye'
import "@metervara/dom-portal/dist/dom-portal.css";
import './style.css'

let destroyEye: (() => void) | null = null;

// document.documentElement.style.setProperty('--mv-transition-duration', '0s');

window.addEventListener("DOMContentLoaded", () => {
  console.log("Welcome to Metervara.");

  // requestAnimationFrame(() => {
  //   document.documentElement.style.removeProperty('--mv-transition-duration');
  // });

  const { portal } = setupDomPortal({
    portalTarget: "#app",
    routerMode: "none",
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      portal.closePortal(0, 0);
    }
  });
});

// Portal events 


window.addEventListener('portal:opening', (_e: Event) => {
  // console.log('portal:opening')
  requestAnimationFrame(() => {
    const eyeRoot = document.querySelector('.metervara-portal-content-container .portal-content-eye .eye-container') as HTMLElement;
    destroyEye = createEye(eyeRoot).destroy;
  });
});

window.addEventListener('portal:closing', (_e: Event) => {
  // console.log('portal:closing')
  if (destroyEye) {
    destroyEye();
    destroyEye = null;
  }
});

/*
window.addEventListener('portal:open', (_e: Event) => {
  console.log('portal:open')
});
window.addEventListener('portal:closed', (_e: Event) => {
  console.log('portal:closed')
});
*/
