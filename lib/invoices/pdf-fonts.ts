import { Font } from "@react-pdf/renderer";



let fontsRegistered = false;



/** Register Inter for invoice PDFs (Fontsource CDN). */

export function ensureInvoicePdfFonts(): void {

  if (fontsRegistered) return;



  Font.register({

    family: "Inter",

    fonts: [

      {

        src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-400-normal.ttf",

        fontWeight: 400,

      },

      {

        src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-500-normal.ttf",

        fontWeight: 500,

      },

      {

        src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-600-normal.ttf",

        fontWeight: 600,

      },

      {

        src: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-700-normal.ttf",

        fontWeight: 700,

      },

    ],

  });



  Font.registerHyphenationCallback((word) => [word]);



  fontsRegistered = true;

}

