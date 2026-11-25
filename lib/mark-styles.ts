export const signatureColors = [
  { id: "black", label: "검정", value: "#191f28" },
  { id: "blue", label: "파랑", value: "#1d4ed8" },
  { id: "navy", label: "남색", value: "#0b1f44" }
] as const;

export const signatureStyles = [
  { id: "pen", label: "펜 기본", fontId: "pen", slant: 0, flourish: false },
  { id: "pen-slant", label: "펜 기울임", fontId: "pen", slant: 0.32, flourish: false },
  { id: "pen-line", label: "펜 밑줄", fontId: "pen", slant: 0.12, flourish: true },
  { id: "brush", label: "붓글씨", fontId: "brush", slant: 0, flourish: false },
  { id: "brush-slant", label: "붓 기울임", fontId: "brush", slant: 0.34, flourish: true },
  { id: "gaegu", label: "개구", fontId: "gaegu", slant: 0.08, flourish: false },
  { id: "melody", label: "하이멜로디", fontId: "melody", slant: 0.18, flourish: false },
  { id: "yeon", label: "연성", fontId: "yeon", slant: 0, flourish: true },
  { id: "gamja", label: "감자꽃", fontId: "gamja", slant: 0.22, flourish: false },
  { id: "dokdo", label: "동해독도", fontId: "dokdo", slant: 0, flourish: false },
  { id: "single", label: "싱글데이", fontId: "single", slant: 0.16, flourish: false },
  { id: "single-line", label: "싱글데이 밑줄", fontId: "single", slant: 0.2, flourish: true }
] as const;

export const stampColors = [
  { id: "cinnabar", label: "주홍", value: "#d0212b" },
  { id: "deep", label: "진홍", value: "#9d1c2b" },
  { id: "scarlet", label: "선홍", value: "#e23b3b" },
  { id: "dark", label: "적갈", value: "#7f1d1d" }
] as const;

export const stampFontChoices = [
  { id: "myeongjoBold", label: "명조 굵게" },
  { id: "myeongjo", label: "명조" },
  { id: "song", label: "송명조" },
  { id: "batang", label: "바탕" },
  { id: "brush", label: "붓" },
  { id: "dohyeon", label: "각진 도장" },
  { id: "black", label: "굵은 도장" }
] as const;

export const stampPresets = [
  { id: "circle-vertical", label: "원형 세로", shape: "circle", layout: "vertical", relief: "yang", doubleBorder: false, aspect: 1 },
  { id: "circle-double", label: "원형 이중", shape: "circle", layout: "grid", relief: "yang", doubleBorder: true, aspect: 1 },
  { id: "square-grid", label: "사각 격자", shape: "square", layout: "grid", relief: "yang", doubleBorder: false, aspect: 1 },
  { id: "square-vertical", label: "사각 세로", shape: "square", layout: "vertical", relief: "yang", doubleBorder: false, aspect: 1 },
  { id: "ellipse-horizontal", label: "타원 가로", shape: "ellipse", layout: "horizontal", relief: "yang", doubleBorder: false, aspect: 1.7 },
  { id: "ellipse-vertical", label: "타원 세로", shape: "ellipse", layout: "vertical", relief: "yang", doubleBorder: false, aspect: 0.7 },
  { id: "round-grid", label: "둥근사각", shape: "round-rect", layout: "grid", relief: "yang", doubleBorder: false, aspect: 1 },
  { id: "round-double", label: "둥근사각 이중", shape: "round-rect", layout: "vertical", relief: "yang", doubleBorder: true, aspect: 1 },
  { id: "circle-yin", label: "음각 원형", shape: "circle", layout: "grid", relief: "yin", doubleBorder: false, aspect: 1 },
  { id: "square-yin", label: "음각 사각", shape: "square", layout: "grid", relief: "yin", doubleBorder: true, aspect: 1 },
  { id: "ellipse-double", label: "타원 이중", shape: "ellipse", layout: "horizontal", relief: "yang", doubleBorder: true, aspect: 1.7 },
  { id: "round-yin", label: "음각 둥근사각", shape: "round-rect", layout: "vertical", relief: "yin", doubleBorder: false, aspect: 1 }
] as const;

export type StampPreset = (typeof stampPresets)[number];
