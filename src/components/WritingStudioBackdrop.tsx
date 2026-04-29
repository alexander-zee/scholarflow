/**
 * Full-viewport diffuse blue background for the writing studio route.
 * Rendered as `position: fixed` from the dashboard shell so it sits behind
 * gutters and the padded root layout, not only behind the review `<main>`.
 */
const lightLayers = `
    radial-gradient(ellipse 55vw 48vh at 8% 12%, rgba(147, 197, 253, 0.38), transparent 58%),
    radial-gradient(ellipse 50vw 44vh at 92% 8%, rgba(125, 211, 252, 0.32), transparent 55%),
    radial-gradient(ellipse 48vw 42vh at 78% 88%, rgba(96, 165, 250, 0.28), transparent 52%),
    radial-gradient(ellipse 44vw 40vh at 18% 85%, rgba(191, 219, 254, 0.34), transparent 50%),
    radial-gradient(circle 36vw at 50% 38%, rgba(59, 130, 246, 0.12), transparent 62%),
    radial-gradient(circle 28vw at 58% 22%, rgba(186, 230, 253, 0.28), transparent 58%),
    radial-gradient(circle 24vw at 40% 62%, rgba(165, 243, 252, 0.2), transparent 55%),
    linear-gradient(168deg, rgb(220 230 242 / 0.88) 0%, rgb(214 226 238 / 0.92) 38%, rgb(203 213 225 / 0.94) 100%)
  `;

const darkLayers = `
    radial-gradient(ellipse 55vw 48vh at 8% 12%, rgba(147, 197, 253, 0.22), transparent 58%),
    radial-gradient(ellipse 50vw 44vh at 92% 8%, rgba(125, 211, 252, 0.18), transparent 55%),
    radial-gradient(ellipse 48vw 42vh at 78% 88%, rgba(96, 165, 250, 0.16), transparent 52%),
    radial-gradient(ellipse 44vw 40vh at 18% 85%, rgba(191, 219, 254, 0.18), transparent 50%),
    radial-gradient(circle 36vw at 50% 38%, rgba(59, 130, 246, 0.08), transparent 62%),
    radial-gradient(circle 28vw at 58% 22%, rgba(186, 230, 253, 0.14), transparent 58%),
    radial-gradient(circle 24vw at 40% 62%, rgba(165, 243, 252, 0.1), transparent 55%),
    linear-gradient(168deg, rgb(2 6 23) 0%, rgb(15 23 42) 45%, rgb(2 6 23) 100%)
  `;

export default function WritingStudioBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-slate-100 dark:bg-slate-950">
      <div
        className="absolute inset-0 dark:hidden"
        style={{ backgroundImage: lightLayers }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ backgroundImage: darkLayers }}
      />
    </div>
  );
}
