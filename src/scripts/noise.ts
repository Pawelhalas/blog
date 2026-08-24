// Marks this file as a module. Without it TypeScript treats both this and
// theme.ts as global scripts, and their identically named helpers collide.
export {};

const NOISE_KEY = "noise";
const OFF = "off";
const ON = "on";

/**
 * Mirrors src/scripts/theme.ts: the reader's choice is stored and reflected on
 * <html>, and re-applied after View Transitions navigation. Default is on -
 * absence of a stored value means the noise runs. The reduced-motion case is
 * handled in CSS, not here, so it stays true even while the value says "on".
 */
function getPreferredNoise(): string {
  return localStorage.getItem(NOISE_KEY) ?? ON;
}

let noiseValue: string =
  (window as unknown as { __noise?: { value: string } }).__noise?.value ??
  getPreferredNoise();

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-noise", noiseValue);

  document
    .querySelectorAll<HTMLButtonElement>("[data-noise-btn]")
    .forEach(btn => {
      const isOff = noiseValue === OFF;
      // Labels are authored on the button so the wording stays in the markup
      // rather than being reconstructed here.
      btn.textContent = isOff
        ? (btn.dataset.labelOn ?? "włącz szum")
        : (btn.dataset.labelOff ?? "wyłącz szum");
      btn.setAttribute("aria-pressed", String(isOff));
    });
}

function persist(): void {
  localStorage.setItem(NOISE_KEY, noiseValue);
  reflect();
}

function setup(): void {
  reflect();
  document
    .querySelectorAll<HTMLButtonElement>("[data-noise-btn]")
    .forEach(btn => {
      btn.addEventListener("click", () => {
        noiseValue = noiseValue === OFF ? ON : OFF;
        persist();
      });
    });
}

setup();

document.addEventListener("astro:after-swap", setup);
