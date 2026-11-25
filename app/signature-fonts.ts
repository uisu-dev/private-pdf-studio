import localFont from "next/font/local";

const nanumPen = localFont({
  src: "../fonts/NanumPenScript-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const nanumBrush = localFont({
  src: "../fonts/NanumBrushScript-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const gaegu = localFont({
  src: "../fonts/Gaegu-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const hiMelody = localFont({
  src: "../fonts/HiMelody-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const yeonSung = localFont({
  src: "../fonts/YeonSung-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const gamjaFlower = localFont({
  src: "../fonts/GamjaFlower-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const eastSeaDokdo = localFont({
  src: "../fonts/EastSeaDokdo-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const singleDay = localFont({
  src: "../fonts/SingleDay-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const nanumMyeongjo = localFont({
  src: "../fonts/NanumMyeongjo-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const nanumMyeongjoBold = localFont({
  src: "../fonts/NanumMyeongjo-Bold.woff2",
  weight: "700",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const songMyung = localFont({
  src: "../fonts/SongMyung-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const gowunBatangBold = localFont({
  src: "../fonts/GowunBatang-Bold.woff2",
  weight: "700",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const doHyeon = localFont({
  src: "../fonts/DoHyeon-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});
const blackHanSans = localFont({
  src: "../fonts/BlackHanSans-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false
});

export const signatureFontFaces = {
  pen: nanumPen,
  brush: nanumBrush,
  gaegu,
  melody: hiMelody,
  yeon: yeonSung,
  gamja: gamjaFlower,
  dokdo: eastSeaDokdo,
  single: singleDay
} as const;

export const stampFontFaces = {
  myeongjo: nanumMyeongjo,
  myeongjoBold: nanumMyeongjoBold,
  song: songMyung,
  batang: gowunBatangBold,
  brush: nanumBrush,
  dohyeon: doHyeon,
  black: blackHanSans
} as const;

export const signatureFallback = nanumPen;
export const stampFallback = nanumMyeongjo;

export const loadedFontFaces = [
  nanumPen,
  nanumBrush,
  gaegu,
  hiMelody,
  yeonSung,
  gamjaFlower,
  eastSeaDokdo,
  singleDay,
  nanumMyeongjo,
  nanumMyeongjoBold,
  songMyung,
  gowunBatangBold,
  doHyeon,
  blackHanSans
];
