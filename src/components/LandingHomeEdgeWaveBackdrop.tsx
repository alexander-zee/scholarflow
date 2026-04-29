import { useId } from "react";

/**
 * Subtle edge wave fields + soft glows — fixed between atmosphere (z-0) and page content (z-10).
 * Cyan/blue only; does not capture pointer events.
 */
export default function LandingHomeEdgeWaveBackdrop() {
  const raw = useId();
  const id = raw.replace(/:/g, "");
  const grad = `sf-edge-wave-grad-${id}`;
  const blur = `sf-edge-soft-blur-${id}`;

  const pathsBL = [
    "M -80 620 C 120 480, 280 400, 520 260 C 680 160, 820 100, 1020 20",
    "M -100 660 C 100 520, 260 440, 500 300 C 660 200, 800 130, 1000 60",
    "M -60 580 C 140 450, 300 370, 540 230 C 700 140, 860 80, 1040 0",
    "M -120 700 C 80 560, 250 470, 480 330 C 640 230, 790 150, 980 70",
    "M -40 540 C 160 410, 320 340, 560 210 C 720 120, 880 60, 1060 -10",
    "M -90 640 C 110 500, 270 420, 510 280 C 670 180, 830 110, 1010 40",
    "M -70 600 C 130 470, 290 390, 530 250 C 690 160, 850 95, 1030 25",
    "M -110 680 C 90 540, 260 450, 490 310 C 650 210, 810 135, 990 55",
    "M -50 560 C 150 430, 310 355, 550 220 C 710 130, 870 70, 1050 5",
    "M -130 720 C 70 580, 240 490, 470 350 C 630 250, 800 165, 970 80",
    "M -30 520 C 170 400, 330 325, 570 195 C 730 105, 890 50, 1070 -20",
    "M -85 630 C 105 495, 265 415, 505 275 C 665 175, 825 105, 1005 35",
    "M -55 570 C 145 440, 295 365, 535 235 C 695 145, 855 85, 1035 15",
    "M -95 650 C 95 510, 255 430, 495 290 C 655 190, 815 120, 995 45",
    "M -75 610 C 125 480, 285 400, 525 265 C 685 170, 845 100, 1025 30",
    "M -105 670 C 85 530, 245 445, 475 305 C 635 205, 795 128, 985 50",
  ];

  const strokeWidths = [1.1, 0.9, 1.3, 1.0, 1.2, 0.85, 1.15, 1.0, 1.25, 0.95, 1.05, 1.2, 0.9, 1.1, 1.0, 1.15];
  const opacities = [0.12, 0.1, 0.14, 0.09, 0.16, 0.08, 0.13, 0.11, 0.15, 0.09, 0.17, 0.1, 0.12, 0.14, 0.11, 0.13];

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      <div className="absolute -bottom-32 -left-32 h-[400px] w-[600px] rounded-full bg-cyan-500/[0.05] blur-[120px]" />
      <div className="absolute -top-32 -right-32 h-[400px] w-[600px] rounded-full bg-blue-500/[0.05] blur-[120px]" />

      <div className="absolute -bottom-40 -left-40 h-[700px] w-[900px] opacity-30">
        <svg className="h-full w-full" viewBox="0 0 1000 800" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMax slice">
          <defs>
            <linearGradient id={grad} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </linearGradient>
            <filter id={blur} x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          <g filter={`url(#${blur})`}>
            {pathsBL.map((d, i) => (
              <path
                key={`bl-${i}`}
                d={d}
                stroke={`url(#${grad})`}
                strokeWidth={strokeWidths[i % strokeWidths.length]}
                strokeLinecap="round"
                strokeOpacity={opacities[i % opacities.length]}
                transform={`translate(0 ${i * 10})`}
              />
            ))}
          </g>
        </svg>
      </div>

      <div className="absolute -right-40 -top-40 h-[700px] w-[900px] rotate-180 opacity-25">
        <svg className="h-full w-full" viewBox="0 0 1000 800" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMaxYMin slice">
          <defs>
            <linearGradient id={`${grad}-tr`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </linearGradient>
            <filter id={`${blur}-tr`} x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          <g filter={`url(#${blur}-tr)`}>
            {pathsBL.map((d, i) => (
              <path
                key={`tr-${i}`}
                d={d}
                stroke={`url(#${grad}-tr)`}
                strokeWidth={strokeWidths[(i + 3) % strokeWidths.length]}
                strokeLinecap="round"
                strokeOpacity={opacities[(i + 5) % opacities.length]}
                transform={`translate(0 ${i * 9})`}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
