import { Archivo, DM_Mono } from "next/font/google";

/** Archivo variable with the width axis: display type uses "wdth" 68–86, body "wdth" 100. */
export const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});
