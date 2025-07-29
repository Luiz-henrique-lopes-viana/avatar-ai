/**
 * @class Spanish lip-sync processor
 * @author [Your Name]
 * @description Advanced Spanish viseme mapping with fine-tuned phoneme-to-viseme conversion
 */

class LipsyncEs {
  /**
   * @constructor
   */
  constructor() {
    // Spanish phonemes to Oculus/ARKit visemes mapping
    // Based on Spanish phonetic rules and common viseme representations
    this.rules = {
      A: [
        "[A]=aa",
        "[Á]=aa",
        "[À]=aa",
        "[Ä]=aa", // All A variants map to 'aa'
        "[A]I=aa I",
        "[A]Y=aa I", // Diphthongs
        "[A]U=aa U",
      ],

      B: [
        "[B]=PP",
        "[V]=PP", // B/V merger in Spanish
        "[BU]=PP U",
        "[BA]=PP aa",
        "[BE]=PP E",
        "[BI]=PP I",
        "[BO]=PP O",
      ],

      C: [
        "[CA]=kk aa",
        "[CO]=kk O",
        "[CU]=kk U", // Hard C
        "[CE]=SS E",
        "[CI]=SS I", // Soft C
        "[CH]=CH", // Special CH phoneme
      ],

      D: [
        "[D]=DD",
        "[D]E=DD E",
        "[D]A=DD aa",
        "[D]O=DD O",
        "[D]I=DD I",
        "[D]U=DD U",
        "[D]#=TH", // Final D often softened in Spanish
      ],

      E: [
        "[E]=E",
        "[É]=E",
        "[È]=E",
        "[Ë]=E",
        "[E]A=E aa",
        "[E]I=E I",
        "[E]O=E O", // Diphthongs
        "[E]U=E U",
      ],

      F: ["[F]=FF"],

      G: [
        "[GA]=kk aa",
        "[GO]=kk O",
        "[GU]=kk U", // Hard G
        "[GE]=kk E",
        "[GI]=kk I", // Soft G (Spanish 'jota' sound)
        "[GÜ]=kk U", // Umlaut G
        "[G]#=kk", // Final G
      ],

      H: [
        "[H]=", // Silent in Spanish
      ],

      I: [
        "[I]=I",
        "[Í]=I",
        "[Ì]=I",
        "[Ï]=I",
        "[I]A=I aa",
        "[I]E=I E", // Diphthongs
        "[I]O=I O",
        "[I]U=I U",
      ],

      J: [
        "[J]=kk", // Strong guttural sound
      ],

      K: ["[K]=kk"],

      L: [
        "[L]=nn",
        "[LL]=nn", // Traditional LL as 'nn' (could be 'RR' for some dialects)
        "[L]#=nn", // Final L
      ],

      M: [
        "[M]=PP",
        "[M]B=PP",
        "[M]P=PP", // M before B/P
        "[M]#=PP", // Final M
      ],

      N: [
        "[N]=nn",
        "[Ñ]=nn", // Ñ as palatal nasal
        "[N]#=nn", // Final N
        "[N]C=nn kk",
        "[N]G=nn kk", // Nasal before velar
        "[N]F=nn FF",
        "[N]V=nn FF", // Nasal before labiodental
      ],

      O: [
        "[O]=O",
        "[Ó]=O",
        "[Ò]=O",
        "[Ö]=O",
        "[O]A=O aa",
        "[O]E=O E", // Diphthongs
        "[O]I=O I",
        "[O]U=O U",
      ],

      P: ["[P]=PP"],

      Q: ["[Q]=kk", "[QU]=kk U"],

      R: [
        "[R]=RR",
        "[RR]=RR", // Strong trilled R
        "[R]#=RR", // Final R
        "[R]B=RR PP",
        "[R]P=RR PP", // R before labial
        "[R]D=RR DD",
        "[R]T=RR DD", // R before dental
      ],

      S: [
        "[S]=SS",
        "[Z]=SS", // S/Z merger in many dialects
        "[S]#=SS", // Final S
        "[S]C=SS kk",
        "[S]K=SS kk", // S before velar
        "[S]P=SS PP",
        "[S]B=SS PP", // S before labial
      ],

      T: [
        "[T]=DD",
        "[T]#=DD", // Final T
        "[T]R=DD RR",
        "[T]L=DD nn", // T before liquids
      ],

      U: [
        "[U]=U",
        "[Ú]=U",
        "[Ù]=U",
        "[Ü]=U",
        "[U]A=U aa",
        "[U]E=U E", // Diphthongs
        "[U]I=U I",
        "[U]O=U O",
        "[QU]=kk U",
        "[GU]=kk U", // Special cases
      ],

      V: [
        "[V]=PP", // Same as B in Spanish
      ],

      W: [
        "[W]=FF", // Only in loanwords
      ],

      X: [
        "[X]=kk SS", // Often pronounced as 'ks'
        "[X]A=kk SS aa",
        "[X]E=kk SS E", // Before vowels
        "[X]#=kk SS", // Final X
      ],

      Y: [
        "[Y]=I",
        "[Ý]=I",
        "[Y]#=I", // Final Y
        "[Y]A=I aa",
        "[Y]E=I E", // Diphthongs
        "[Y]O=I O",
        "[Y]U=I U",
      ],

      Z: [
        "[Z]=SS", // S/Z merger in many dialects
      ],
    };

    // Regular expression operators for Spanish phonetic rules
    const ops = {
      "#": "[AEIOUÁÉÍÓÚÜ]+", // One or more vowels (including accented)
      ".": "[BDLMNRV]", // Voiced consonants
      "%": "(?:AR|ER|IR|OR|UR)", // Common Spanish verb endings
      "&": "(?:[SZCX]|CH|LL|RR)", // Special Spanish consonants
      "@": "(?:[TDNR]|CH|LL|RR)", // Strong consonants
      "^": "[BCDFGHJKLMNÑPQRSTVWXYZ]", // Any consonant
      "+": "[EIYÍÝ]", // Front vowels
      ":": "[BCDFGHJKLMNÑPQRSTVWXYZ]*", // Zero or more consonants
      " ": "\\b", // Word boundary
    };

    // Convert rules to regex
    Object.keys(this.rules).forEach((key) => {
      this.rules[key] = this.rules[key].map((rule) => {
        const posL = rule.indexOf("[");
        const posR = rule.indexOf("]");
        const posE = rule.indexOf("=");
        const strLeft = rule.substring(0, posL);
        const strLetters = rule.substring(posL + 1, posR);
        const strRight = rule.substring(posR + 1, posE);
        const strVisemes = rule.substring(posE + 1);

        const o = { regex: "", move: 0, visemes: [] };

        let exp = "";
        exp += [...strLeft].map((x) => ops[x] || x).join("");
        const ctxLetters = [...strLetters];
        ctxLetters[0] = ctxLetters[0].toLowerCase();
        exp += ctxLetters.join("");
        o.move = ctxLetters.length;
        exp += [...strRight].map((x) => ops[x] || x).join("");
        o.regex = new RegExp(exp);

        if (strVisemes.length) {
          strVisemes.split(" ").forEach((viseme) => {
            o.visemes.push(viseme);
          });
        }

        return o;
      });
    });

    // Viseme durations in relative units (1 = average)
    // Fine-tuned for Spanish phonetics
    this.visemeDurations = {
      aa: 0.95,
      E: 0.9,
      I: 0.85,
      O: 0.98,
      U: 0.92,
      PP: 1.05,
      SS: 1.15,
      CH: 1.25,
      DD: 1.02,
      FF: 0.95,
      kk: 1.18,
      nn: 0.85,
      RR: 1.1,
      TH: 0.9,
      sil: 1,
    };

    // Pauses in relative units (1 = average)
    this.specialDurations = {
      " ": 1,
      ",": 2.5,
      ".": 3,
      ";": 2,
      ":": 2,
      "¿": 1.5,
      "?": 3,
      "¡": 1.5,
      "!": 3,
      "-": 0.7,
    };

    // Spanish number words
    this.digits = [
      "cero",
      "uno",
      "dos",
      "tres",
      "cuatro",
      "cinco",
      "seis",
      "siete",
      "ocho",
      "nueve",
    ];
    this.ones = [
      "",
      "uno",
      "dos",
      "tres",
      "cuatro",
      "cinco",
      "seis",
      "siete",
      "ocho",
      "nueve",
    ];
    this.tens = [
      "",
      "diez",
      "veinte",
      "treinta",
      "cuarenta",
      "cincuenta",
      "sesenta",
      "setenta",
      "ochenta",
      "noventa",
    ];
    this.teens = [
      "diez",
      "once",
      "doce",
      "trece",
      "catorce",
      "quince",
      "dieciséis",
      "diecisiete",
      "dieciocho",
      "diecinueve",
    ];
    this.hundreds = [
      "",
      "ciento",
      "doscientos",
      "trescientos",
      "cuatrocientos",
      "quinientos",
      "seiscientos",
      "setecientos",
      "ochocientos",
      "novecientos",
    ];

    // Symbols to Spanish words
    this.symbols = {
      "%": "por ciento",
      "€": "euros",
      "&": "y",
      "+": "más",
      $: "dólares",
      "£": "libras",
      "¥": "yenes",
      "¢": "centavos",
      "§": "sección",
      "©": "derechos de autor",
      "®": "marca registrada",
      "™": "marca comercial",
      "°": "grados",
      "×": "por",
      "÷": "dividido por",
      "=": "igual a",
      "<": "menor que",
      ">": "mayor que",
      "~": "aproximadamente",
    };
    this.symbolsReg = /[%€&+\$£¥¢§©®™°×÷=<>~]/g;
  }

  /**
   * Convert numbers to Spanish words
   * @param {string} num Number as string
   * @return {string} Number in Spanish words
   */
  convertNumberToWords(num) {
    if (num === "0") return "cero";

    // Handle decimal numbers
    if (num.includes(".")) {
      const parts = num.split(".");
      return (
        this.convertIntegerToWords(parts[0]) +
        " punto " +
        this.convertDigitByDigit(parts[1])
      );
    }

    // Handle digit-by-digit for phone numbers, codes, etc.
    if (num.startsWith("0") || num.length > 6) {
      return this.convertDigitByDigit(num);
    }

    return this.convertIntegerToWords(parseInt(num));
  }

  convertDigitByDigit(num) {
    return num
      .split("")
      .map((d) => this.digits[parseInt(d)])
      .join(" ");
  }

  convertIntegerToWords(num) {
    if (num < 10) return this.ones[num];
    if (num < 20) return this.teens[num - 10];
    if (num < 100) {
      const ten = Math.floor(num / 10);
      const unit = num % 10;
      return this.tens[ten] + (unit !== 0 ? " y " + this.ones[unit] : "");
    }
    if (num < 1000) {
      const hundred = Math.floor(num / 100);
      const remainder = num % 100;
      return (
        (hundred === 1 && remainder === 0 ? "cien" : this.hundreds[hundred]) +
        (remainder !== 0 ? " " + this.convertIntegerToWords(remainder) : "")
      );
    }
    if (num < 1000000) {
      const thousand = Math.floor(num / 1000);
      const remainder = num % 1000;
      return (
        (thousand === 1
          ? "mil"
          : this.convertIntegerToWords(thousand) + " mil") +
        (remainder !== 0 ? " " + this.convertIntegerToWords(remainder) : "")
      );
    }
    if (num < 1000000000) {
      const million = Math.floor(num / 1000000);
      const remainder = num % 1000000;
      return (
        (million === 1
          ? "un millón"
          : this.convertIntegerToWords(million) + " millones") +
        (remainder !== 0 ? " " + this.convertIntegerToWords(remainder) : "")
      );
    }
    return "número muy grande";
  }

  /**
   * Preprocess text for Spanish:
   * - Convert symbols to words
   * - Convert numbers to words
   * - Normalize text (remove diacritics if needed)
   * - Filter out unspoken characters
   * @param {string} s Text
   * @return {string} Pre-processed text
   */
  preProcessText(s) {
    return s
      .replace(/[#_*\":;]/g, "") // Remove special formatting characters
      .replace(this.symbolsReg, (symbol) => " " + this.symbols[symbol] + " ") // Convert symbols
      .replace(/(\d)\.(\d)/g, "$1 punto $2") // Decimal numbers
      .replace(/(\d),(\d)/g, "$1 coma $2") // European decimal format
      .replace(/\d+/g, this.convertNumberToWords.bind(this)) // Numbers to words
      .replace(/(\D)\1\1+/g, "$1$1") // Max 2 repeating characters
      .replace(/\s+/g, " ") // Normalize spaces
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .normalize("NFC") // Remove diacritics (optional)
      .trim();
  }

  /**
   * Convert Spanish text to visemes
   * @param {string} w Text
   * @return {Object} Visemes and timing information
   */
  wordsToVisemes(w) {
    let o = {
      words: w.toUpperCase(),
      visemes: [],
      times: [],
      durations: [],
      i: 0,
    };
    let t = 0;

    const chars = [...o.words];
    while (o.i < chars.length) {
      const c = chars[o.i];
      const ruleset = this.rules[c];

      if (ruleset) {
        let matched = false;

        // Try each rule in order
        for (let i = 0; i < ruleset.length; i++) {
          const rule = ruleset[i];
          const test =
            o.words.substring(0, o.i) +
            c.toLowerCase() +
            o.words.substring(o.i + 1);
          const matches = test.match(rule.regex);

          if (matches) {
            // Apply viseme rules
            rule.visemes.forEach((viseme) => {
              // Merge with previous if same viseme
              if (
                o.visemes.length &&
                o.visemes[o.visemes.length - 1] === viseme
              ) {
                const d = 0.7 * (this.visemeDurations[viseme] || 1);
                o.durations[o.durations.length - 1] += d;
                t += d;
              } else {
                const d = this.visemeDurations[viseme] || 1;
                o.visemes.push(viseme);
                o.times.push(t);
                o.durations.push(d);
                t += d;
              }
            });

            o.i += rule.move;
            matched = true;
            break;
          }
        }

        if (!matched) o.i++;
      } else {
        // Handle punctuation and spaces
        const duration = this.specialDurations[c] || 0;
        if (duration > 0) {
          o.visemes.push("sil");
          o.times.push(t);
          o.durations.push(duration);
          t += duration;
        }
        o.i++;
      }
    }

    // Add a small pause at the end if needed
    if (o.visemes.length > 0 && o.visemes[o.visemes.length - 1] !== "sil") {
      o.visemes.push("sil");
      o.times.push(t);
      o.durations.push(0.5);
    }

    return o;
  }
}

export { LipsyncEs };
