import { setupDomPortal } from "@metervara/dom-portal";
import { createEye } from './eye'
import "@metervara/dom-portal/dist/dom-portal.css";
import './style.css'

let destroyEye: (() => void) | null = null;

window.addEventListener("DOMContentLoaded", () => {
  console.log("Welcome to Metervara.");

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
  requestAnimationFrame(() => {
    const eyeRoot = document.querySelector('.metervara-portal-content-container .portal-content-eye .eye-container') as HTMLElement;
    destroyEye = createEye(eyeRoot).destroy;
  });
});

window.addEventListener('portal:closed', (_e: Event) => {
  if (destroyEye) {
    destroyEye();
    destroyEye = null;
  }
});
