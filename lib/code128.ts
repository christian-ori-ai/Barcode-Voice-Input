const PATTERNS: string[] = [
  "212222","222122","222221","121223","121322","131222","122213","122312",
  "132212","221213","221312","231212","112232","122132","122231","113222",
  "123122","123221","223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211","212123","212321",
  "232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131","311123","311321",
  "331121","312113","312311","332111","314111","221411","431111","111224",
  "111422","121124","121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112",
  "421211","212141","214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141","411131","211412",
  "211214","211232","2331112"
];

const START_C = 105;
const FNC1 = 102;
const STOP = 106;

export interface BarcodeData {
  bars: boolean[];
  humanReadable: string;
}

function patternToBars(pattern: string): boolean[] {
  const bars: boolean[] = [];
  let isBar = true;
  for (const ch of pattern) {
    const width = parseInt(ch, 10);
    for (let i = 0; i < width; i++) {
      bars.push(isBar);
    }
    isBar = !isBar;
  }
  return bars;
}

export function calculateSSCCCheckDigit(digits17: string): number {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const digit = parseInt(digits17[i], 10);
    const weight = (i % 2 === 0) ? 3 : 1;
    sum += digit * weight;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

export function encodeSSCC(ssccDigits: string): BarcodeData {
  const fullData = "00" + ssccDigits;

  const values: number[] = [START_C, FNC1];

  for (let i = 0; i < fullData.length; i += 2) {
    const pair = fullData.substring(i, i + 2);
    values.push(parseInt(pair, 10));
  }

  let checksum = values[0];
  for (let i = 1; i < values.length; i++) {
    checksum += values[i] * i;
  }
  checksum = checksum % 103;

  values.push(checksum);
  values.push(STOP);

  const allBars: boolean[] = [];
  for (const val of values) {
    allBars.push(...patternToBars(PATTERNS[val]));
  }

  const humanReadable = "00" + ssccDigits;

  return { bars: allBars, humanReadable };
}

export function isValidSSCCInput(input: string): boolean {
  return /^\d{17,18}$/.test(input);
}
