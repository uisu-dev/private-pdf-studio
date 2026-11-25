import brush from "@fontsource/nanum-brush-script/files/nanum-brush-script-korean-400-normal.woff2";
import gaegu from "@fontsource/gaegu/files/gaegu-korean-400-normal.woff2";
import myeongjo from "@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-800-normal.woff2";
import pen from "@fontsource/nanum-pen-script/files/nanum-pen-script-korean-400-normal.woff2";

export type SignatureFontId = "pen" | "brush" | "gaegu";

export type SignatureFont = {
  id: SignatureFontId;
  family: string;
  label: string;
  weight: string;
  src: string;
};

export const SIGNATURE_FONTS: SignatureFont[] = [
  { id: "pen", family: "Nanum Pen Script", label: "펜", weight: "400", src: pen },
  { id: "brush", family: "Nanum Brush Script", label: "붓", weight: "400", src: brush },
  { id: "gaegu", family: "Gaegu", label: "손글씨", weight: "400", src: gaegu }
];

export const SEAL_FONT = {
  family: "Nanum Myeongjo",
  label: "명조",
  weight: "800",
  src: myeongjo
};

let loading: Promise<void> | null = null;

export function loadSignFonts() {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }
  if (!loading) {
    const faces = [
      ...SIGNATURE_FONTS.map((font) => ({ family: font.family, weight: font.weight, src: font.src })),
      { family: SEAL_FONT.family, weight: SEAL_FONT.weight, src: SEAL_FONT.src }
    ];
    loading = Promise.all(
      faces.map(async (font) => {
        const face = new FontFace(font.family, `url(${font.src})`, {
          weight: font.weight,
          style: "normal",
          display: "swap"
        });
        await face.load();
        document.fonts.add(face);
        await document.fonts.load(`${font.weight} 64px "${font.family}"`);
      })
    ).then(() => undefined).catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
