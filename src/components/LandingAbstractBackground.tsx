"use client";

type LandingAbstractVariant = "hero" | "flowLeft" | "arcRight" | "mesh" | "bottom";

type LandingAbstractBackgroundProps = {
  variant: LandingAbstractVariant;
  className?: string;
};

const BASE = "pointer-events-none absolute inset-0 z-0 overflow-hidden";

export default function LandingAbstractBackground({ variant, className = "" }: LandingAbstractBackgroundProps) {
  if (variant === "hero") {
    return (
      <div
        className={`${BASE} ${className} [mask-image:linear-gradient(to_right,transparent_0%,black_38%,black_100%),linear-gradient(to_bottom,transparent_0%,black_14%,black_86%,transparent_100%)] [mask-composite:intersect]`}
        aria-hidden
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_48%,rgba(59,130,246,0.07),transparent_58%),radial-gradient(ellipse_at_86%_66%,rgba(14,165,233,0.06),transparent_62%)] blur-[16px]" />
          <svg viewBox="0 0 900 700" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="lrA" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.05)" />
                <stop offset="45%" stopColor="rgba(59,130,246,0.14)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.08)" />
              </linearGradient>
              <linearGradient id="lrB" x1="0%" y1="20%" x2="100%" y2="90%">
                <stop offset="0%" stopColor="rgba(14,165,233,0.05)" />
                <stop offset="55%" stopColor="rgba(59,130,246,0.12)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.09)" />
              </linearGradient>
              <linearGradient id="lrC" x1="10%" y1="0%" x2="90%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
                <stop offset="70%" stopColor="rgba(59,130,246,0.08)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.05)" />
              </linearGradient>
              <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="8" />
              </filter>
              <filter id="ribbonBlur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <linearGradient id="thinBlue" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.1)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.2)" />
              </linearGradient>
              <linearGradient id="thinWhite" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.22)" />
              </linearGradient>
            </defs>

            <ellipse cx="760" cy="290" rx="220" ry="150" fill="rgba(147,197,253,0.08)" filter="url(#softBlur)" />
            <ellipse cx="820" cy="470" rx="210" ry="140" fill="rgba(186,230,253,0.06)" filter="url(#softBlur)" />

            {/* Thick translucent ribbons */}
            <path d="M200 620 C 430 520 580 500 760 360 S 1080 120 1320 190" fill="none" stroke="url(#lrA)" strokeWidth="40" opacity="0.085" filter="url(#ribbonBlur)" />
            <path d="M260 680 C 520 560 680 570 880 410 S 1120 260 1380 320" fill="none" stroke="url(#lrB)" strokeWidth="34" opacity="0.078" filter="url(#ribbonBlur)" />
            <path d="M350 520 C 600 430 760 410 940 300 S 1160 160 1360 220" fill="none" stroke="url(#lrC)" strokeWidth="30" opacity="0.07" filter="url(#ribbonBlur)" />
            <path d="M180 560 C 420 470 580 452 770 328 S 1050 182 1280 228" fill="none" stroke="url(#lrA)" strokeWidth="24" opacity="0.062" />
            <path d="M240 730 C 500 620 690 620 900 450 S 1150 300 1400 350" fill="none" stroke="url(#lrB)" strokeWidth="20" opacity="0.05" />

            {/* Structured thin flowing lines (18+) */}
            <path d="M190 600 C 410 510 560 500 740 360 S 1030 150 1270 210" fill="none" stroke="url(#thinBlue)" strokeWidth="3.2" opacity="0.2" />
            <path d="M205 616 C 430 522 580 510 760 370 S 1048 162 1285 222" fill="none" stroke="url(#thinBlue)" strokeWidth="2.8" opacity="0.18" />
            <path d="M220 632 C 450 536 600 526 780 382 S 1065 178 1300 238" fill="none" stroke="url(#thinBlue)" strokeWidth="2.5" opacity="0.17" />
            <path d="M235 648 C 468 548 620 542 798 398 S 1082 194 1316 252" fill="none" stroke="url(#thinBlue)" strokeWidth="2.3" opacity="0.16" />
            <path d="M250 664 C 486 562 640 556 816 412 S 1098 208 1332 268" fill="none" stroke="url(#thinBlue)" strokeWidth="2.1" opacity="0.15" />
            <path d="M265 678 C 504 574 660 570 834 426 S 1115 224 1348 282" fill="none" stroke="url(#thinBlue)" strokeWidth="1.9" opacity="0.14" />
            <path d="M280 694 C 522 588 680 584 852 440 S 1132 238 1364 296" fill="none" stroke="url(#thinBlue)" strokeWidth="1.8" opacity="0.13" />
            <path d="M295 708 C 540 600 700 598 870 454 S 1148 254 1380 310" fill="none" stroke="url(#thinBlue)" strokeWidth="1.7" opacity="0.12" />
            <path d="M240 560 C 468 470 612 456 786 338 S 1060 136 1292 196" fill="none" stroke="url(#thinBlue)" strokeWidth="1.9" opacity="0.13" />
            <path d="M260 542 C 490 454 632 440 806 322 S 1078 122 1310 182" fill="none" stroke="url(#thinBlue)" strokeWidth="1.7" opacity="0.12" />
            <path d="M300 520 C 526 436 664 420 836 306 S 1096 108 1328 166" fill="none" stroke="url(#thinBlue)" strokeWidth="1.6" opacity="0.11" />
            <path d="M320 506 C 546 426 684 410 854 296 S 1112 100 1344 156" fill="none" stroke="url(#thinBlue)" strokeWidth="1.5" opacity="0.1" />
            <path d="M340 492 C 566 414 704 398 872 286 S 1128 92 1360 146" fill="none" stroke="url(#thinBlue)" strokeWidth="1.4" opacity="0.09" />
            <path d="M360 478 C 586 402 724 386 890 274 S 1144 82 1376 136" fill="none" stroke="url(#thinBlue)" strokeWidth="1.3" opacity="0.085" />
            <path d="M220 590 C 442 500 588 488 766 350 S 1044 144 1276 204" fill="none" stroke="url(#thinWhite)" strokeWidth="2.4" opacity="0.2" />
            <path d="M248 620 C 474 528 624 520 802 378 S 1070 172 1302 230" fill="none" stroke="url(#thinWhite)" strokeWidth="2.1" opacity="0.17" />
            <path d="M276 650 C 504 558 654 552 832 406 S 1096 202 1328 258" fill="none" stroke="url(#thinWhite)" strokeWidth="1.9" opacity="0.15" />
            <path d="M304 680 C 536 590 684 586 862 436 S 1122 232 1354 286" fill="none" stroke="url(#thinWhite)" strokeWidth="1.7" opacity="0.13" />
            <path d="M332 708 C 568 620 714 618 892 466 S 1148 264 1380 316" fill="none" stroke="url(#thinWhite)" strokeWidth="1.5" opacity="0.11" />
            <path d="M280 560 C 512 472 654 458 828 336 S 1094 130 1324 188" fill="none" stroke="url(#thinWhite)" strokeWidth="1.5" opacity="0.1" />
          </svg>
        </div>
      </div>
    );
  }

  if (variant === "flowLeft") {
    return (
      <div className={`${BASE} ${className} [mask-image:radial-gradient(circle_at_35%_30%,black_42%,transparent_88%)]`} aria-hidden>
        <svg className="absolute -left-24 -top-16 h-[130%] w-[72%] opacity-70" viewBox="0 0 900 760" preserveAspectRatio="xMidYMid slice">
          <path d="M-120 40 C 140 60 230 180 340 330 S 620 570 940 640" fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="30" />
          <path d="M-80 0 C 180 40 280 170 380 310 S 640 520 950 590" fill="none" stroke="rgba(14,165,233,0.14)" strokeWidth="20" />
          <path d="M-90 120 C 120 140 220 240 320 380 S 610 620 910 700" fill="none" stroke="rgba(59,130,246,0.14)" strokeWidth="14" />
          <path d="M-20 110 C 180 150 280 250 400 390 S 660 610 920 680" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />
        </svg>
      </div>
    );
  }

  if (variant === "arcRight") {
    return (
      <div className={`${BASE} ${className} [mask-image:radial-gradient(circle_at_78%_70%,black_40%,transparent_86%)]`} aria-hidden>
        <div className="absolute -bottom-24 -right-20 h-[120%] w-[62%] rounded-full bg-[radial-gradient(ellipse_at_40%_40%,rgba(59,130,246,0.18),transparent_70%)]" />
        <svg className="absolute -bottom-24 -right-16 h-[95%] w-[58%] opacity-65" viewBox="0 0 780 780" preserveAspectRatio="xMidYMid slice">
          <ellipse cx="420" cy="420" rx="320" ry="280" fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth="34" />
          <ellipse cx="420" cy="420" rx="280" ry="240" fill="none" stroke="rgba(14,165,233,0.12)" strokeWidth="20" />
          <ellipse cx="420" cy="420" rx="238" ry="202" fill="none" stroke="rgba(59,130,246,0.14)" strokeWidth="12" />
          <ellipse cx="420" cy="420" rx="208" ry="174" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }

  if (variant === "mesh") {
    return (
      <div className={`${BASE} ${className} [mask-image:radial-gradient(circle_at_center,black_55%,transparent_92%)]`} aria-hidden>
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              "linear-gradient(140deg, rgba(59,130,246,0.1) 0%, rgba(255,255,255,0) 35%), repeating-linear-gradient(135deg, rgba(59,130,246,0.08) 0px, rgba(59,130,246,0.08) 1px, transparent 1px, transparent 22px), repeating-linear-gradient(48deg, rgba(14,165,233,0.07) 0px, rgba(14,165,233,0.07) 1px, transparent 1px, transparent 28px)",
          }}
        />
      </div>
    );
  }

  return (
    <div className={`${BASE} ${className} [mask-image:linear-gradient(to_top,black_20%,transparent_92%)]`} aria-hidden>
      <svg className="absolute inset-x-0 bottom-0 h-[58%] w-full opacity-55" viewBox="0 0 1440 440" preserveAspectRatio="none">
        <path d="M-20 340 C 170 270 290 262 450 290 C 650 326 810 360 1010 320 C 1180 286 1320 214 1468 244" fill="none" stroke="rgba(59,130,246,0.14)" strokeWidth="22" />
        <path d="M-40 390 C 150 334 310 326 490 348 C 700 374 860 406 1060 372 C 1230 344 1360 280 1490 302" fill="none" stroke="rgba(14,165,233,0.1)" strokeWidth="14" />
        <path d="M-10 356 C 190 292 312 290 474 312 C 690 340 840 370 1030 336 C 1200 306 1322 238 1470 264" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="3" />
      </svg>
    </div>
  );
}
