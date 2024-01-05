import { Date, OCRResult, ParserResult } from './types';
import type { Item, ContentObj } from './pdf.js';

export function merge_to_lines(ocrResults: OCRResult[], threshold = 50) {
  const next = new Map<OCRResult, OCRResult>();
  const to_remove = new Map<OCRResult, boolean>();
  for (const a of ocrResults) {
    for (const b of ocrResults) {
      if (a == b) continue;
      if (next.get(a)) {
        continue;
      }
      const x_diff = Math.abs(b.box[0][0] - a.box[1][0]);
      const y_diff = Math.abs(b.box[0][1] - a.box[1][1]);
      if (x_diff + y_diff < threshold && !next.get(b)) {
        next.set(a, b);
        to_remove.set(b, true);
      }
    }
  }
  const lines: OCRResult[] = ocrResults
    .filter((i) => !to_remove.get(i))
    .map((i) => {
      let j = next.get(i);
      const r = i;
      while (j) {
        r.text += j.text;
        j = next.get(j);
      }
      return r;
    })
    .sort((a, b) => a.box[0][1] - b.box[0][1]);
  return lines;
}

export function pdfjsContentToOCRResult(
  obj: ContentObj,
  height: number,
): OCRResult[] {
  return obj.items
    .map((i) => {
      const x = i.transform[4];
      const y = height - i.transform[5];
      const r: OCRResult = {
        text: i.str,
        box: [
          [x, y],
          [x + i.width, y],
          [x + i.width, y + i.height],
          [x, y + i.height],
        ],
      };
      return r;
    })
    .filter((i) => i.text.length);
}

export function toChineseSymbols(str: string) {
  let p = 1;
  const s = Array.from(str);
  while (true) {
    const f = s.indexOf('"');
    if (f > -1) {
      s[f] = p % 2 ? '“' : '”';
    } else {
      break;
    }
    ++p;
  }
  return s.join('');
}

/**
 * 零转换: O○〇 -> 0
 * 中文转换: 一二三四五六七八九十廿卅卌 -> 0-9,10,20,30,40
 * duration转换1： -至— -> -
 * duration转换2： 、，, -> ,
 *
 * 支持的格式：
 * 1911.10.10-1912.12.12
 * 1911.10.10-12.12
 * 1911.10.10-12
 * 1911.10-12
 * 1911.10.10,11,12
 * 1911.10,12
 */
export function extract_dates(
  str: string,
  opt: {
    remove_unknowns: boolean;
  } = {
    remove_unknowns: false,
  },
): { dates: Date[]; is_range_date: boolean } {
  str = str.replace(/ /g, '');

  const to = '\\-至—';
  const seperator = '\\,，、';
  const cn_digitals = '\\d一二三四五六七八九○O〇十廿卅卌';

  if (opt.remove_unknowns) {
    str = str.replace(
      new RegExp(`[^${cn_digitals}${to}${seperator}年月日\\.]`, 'g'),
      '',
    );
  }

  function normalize_date(s: string) {
    s = s
      .replace(/卌/g, '四十')
      .replace(/卅/g, '三十')
      .replace(/卅/g, '三十')
      .replace(/廿/g, '二十')
      .replace(/——/g, '-')
      .replace(new RegExp(`[${to}]`, 'g'), '-')
      .replace(new RegExp(`[${seperator}]`, 'g'), ',')
      .replace(/^十年/g, '10年')
      .replace(/^一十一/g, '11') // 少部分文稿使用这种日期
      .replace(/^一十二/g, '12')
      .replace(/^一十三/g, '13')
      .replace(/^一十四/g, '14')
      .replace(/^一十五/g, '15')
      .replace(/^一十六/g, '16')
      .replace(/^一十七/g, '17')
      .replace(/^一十八/g, '18')
      .replace(/^一十九/g, '19')
      .replace(/^二十年/g, '20年')
      .replace(/^三十年/g, '30年')
      .replace(/^四十年/g, '40年')
      .replace(/^五十年/g, '50年')
      .replace(/^六十年/g, '60年')
      .replace(/^七十年/g, '70年')
      .replace(/^八十年/g, '80年')
      .replace(/^九十年/g, '90年')
      .replace(/十月/g, '10月')
      .replace(/二十日/g, '20日')
      .replace(/三十日/g, '30日')
      .replace(/十日/g, '10日')
      .replace(/二十/g, '2')
      .replace(/三十/g, '3')
      .replace(/十/g, '1')
      .replace(/一/g, '1')
      .replace(/二/g, '2')
      .replace(/三/g, '3')
      .replace(/四/g, '4')
      .replace(/五/g, '5')
      .replace(/六/g, '6')
      .replace(/七/g, '7')
      .replace(/八/g, '8')
      .replace(/九/g, '9')
      .replace(/[O○〇]/g, '0');
    return s;
  }

  // 1911.10.10-1912.12.12
  // 1911.10.10-12.12
  // 1911.10.10-12
  // 1911.10-12
  const format_a = Array.from(
    str.matchAll(
      new RegExp(`\\d+\\.\\d+(\\.\\d+)?[${to}]+\\d+(\\.\\d+)?(\\.\\d+)?`, 'g'),
    ),
  )[0];
  // 1911.10.10,11,12
  // 1911.10.10,11.12,12.23
  // 1911.10,11,12
  const format_b = Array.from(
    str.matchAll(
      new RegExp(
        `\\d+\\.\\d+(\\.\\d+)?[${seperator}]+(\\d+(\\.\\d)?[${seperator}]?)+`,
        'g',
      ),
    ),
  )[0];
  // 1911.10.10
  // 1911.10
  // 1911
  const format_c = Array.from(
    str.matchAll(new RegExp(`\\d+\\.\\d+(\\.\\d+)?[^${seperator}${to}]+`, 'g')),
  )[0];

  // 一九三二年十月二十日至一九三三年十月二十日
  // 一九三二年十月二十日至十二月二十日
  // 一九三二年十月二十日至十二月
  // 一九三二年十月至十二月
  const format_d = Array.from(
    str.matchAll(
      new RegExp(
        `[${cn_digitals}]+年[${cn_digitals}]+月([${cn_digitals}]+日)?[${to}]+([${cn_digitals}]+年)?([${cn_digitals}]+月)?([${cn_digitals}]+日)?`,
        'g',
      ),
    ),
  )[0];
  // 一九三二年十月二十日，二十一日，二十二日
  // 一九三二年十月二十日，十一月十日，十一月十二日
  // 一九三二年十月，十一月，十二月
  const format_e = Array.from(
    str.matchAll(
      new RegExp(
        `[${cn_digitals}]+年[${cn_digitals}]+月([${cn_digitals}]+日)?[${seperator}]+([${cn_digitals}]+[月日]+([${cn_digitals}][月日])?[${seperator}]?)+`,
        'g',
      ),
    ),
  )[0];
  // 一九三二年十月二十日
  // 一九三二年十月
  // 一九三二年
  const format_f = Array.from(
    str.matchAll(
      new RegExp(
        `[${cn_digitals}]+年([${cn_digitals}]+月)?([${cn_digitals}]+日)?`,
        'g',
      ),
    ),
  )[0];

  if (format_a || format_d) {
    const s = normalize_date((format_a || format_d)[0]).split('-');
    let last_year = 0;
    let last_month = 0;
    let has_day = true;
    return {
      dates: s.map((i, idx) => {
        const t: (number | undefined)[] = i
          .split(new RegExp(`[\\.年月日]`))
          .map((j) => parseInt(j))
          .map((i) => (i ? i : undefined));
        if (idx == 0) {
          has_day = !!t[2];
        }
        if (idx == 0 || (t[0] && t[1] && t[2])) {
          last_year = t[0] || last_year;
          last_month = t[1] || last_month;
          return {
            year: t[0],
            month: t[1],
            day: t[2],
          };
        } else {
          if (t[0] && t[1]) {
            last_month = t[0];
            return {
              year: last_year,
              month: t[0],
              day: t[1],
            };
          } else {
            return has_day
              ? {
                  year: last_year,
                  month: last_month,
                  day: t[0],
                }
              : {
                  year: last_year,
                  month: t[0],
                  day: undefined,
                };
          }
        }
      }),
      is_range_date: true,
    };
  } else if (format_b || format_c || format_e || format_f) {
    const s = normalize_date(
      (format_b || format_c || format_e || format_f)[0],
    ).split(/[\,]/);
    let last_year = 0;
    let last_month = 0;
    let has_day = false;
    return {
      dates: s.map((i, idx) => {
        const t: (number | undefined)[] = i
          .split(new RegExp(`[\\.年月日]`))
          .map((j) => parseInt(j))
          .map((i) => (i ? i : undefined));
        if (idx == 0) {
          has_day = !!t[2];
        }
        if (idx == 0 || (t[0] && t[1] && t[2])) {
          last_year = t[0] || last_year;
          last_month = t[1] || last_month;
          return {
            year: t[0],
            month: t[1],
            day: t[2],
          };
        } else {
          if (t[0] && t[1]) {
            last_month = t[0];
            has_day = true;
            return {
              year: last_year,
              month: t[0],
              day: t[1],
            };
          } else {
            return has_day
              ? {
                  year: last_year,
                  month: last_month,
                  day: t[0],
                }
              : {
                  year: last_year,
                  month: t[0],
                  day: undefined,
                };
          }
        }
      }),
      is_range_date: false,
    };
  }
  return {
    dates: [
      {
        year: undefined,
        month: undefined,
        day: undefined,
      },
    ],
    is_range_date: false,
  };
}

export function hash_str_arr(s: string[]) {
  return md5(s.join('^')).substr(0, 10);
}

export function ensure_two_digits(a: number | undefined, fallback = '00') {
  if (!a && a !== 0) {
    return fallback;
  }
  return a < 10 ? `0${a}` : a;
}

export function get_article_id(r: ParserResult) {
  return hash_str_arr([
    r.title,
    JSON.stringify(
      r.dates.sort((a, b) =>
        `${a.year || '0000'}-${ensure_two_digits(a.month)}-${ensure_two_digits(
          a.day,
        )}` >
        `${b.year || '0000'}-${ensure_two_digits(b.month)}-${ensure_two_digits(
          b.day,
        )}`
          ? 1
          : -1,
      ),
    ),
    JSON.stringify(!!r.is_range_date),
    JSON.stringify(r.authors.sort((a, b) => (a > b ? 1 : -1))),
    JSON.stringify(r.file_id || ''),
  ]);
}

export function md5(inputString: string) {
  var hc = '0123456789abcdef';
  function rh(n: number) {
    var j,
      s = '';
    for (j = 0; j <= 3; j++)
      s +=
        hc.charAt((n >> (j * 8 + 4)) & 0x0f) + hc.charAt((n >> (j * 8)) & 0x0f);
    return s;
  }
  function ad(x: number, y: number) {
    var l = (x & 0xffff) + (y & 0xffff);
    var m = (x >> 16) + (y >> 16) + (l >> 16);
    return (m << 16) | (l & 0xffff);
  }
  function rl(n: number, c: number) {
    return (n << c) | (n >>> (32 - c));
  }
  function cm(
    q: number,
    a: number,
    b: number,
    x: number,
    s: number,
    t: number,
  ) {
    return ad(rl(ad(ad(a, q), ad(x, t)), s), b);
  }
  function ff(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) {
    return cm((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) {
    return cm((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) {
    return cm(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ) {
    return cm(c ^ (b | ~d), a, b, x, s, t);
  }
  function sb(x: string) {
    var i;
    var nblk = ((x.length + 8) >> 6) + 1;
    var blks = new Array(nblk * 16);
    for (i = 0; i < nblk * 16; i++) blks[i] = 0;
    for (i = 0; i < x.length; i++)
      blks[i >> 2] |= x.charCodeAt(i) << ((i % 4) * 8);
    blks[i >> 2] |= 0x80 << ((i % 4) * 8);
    blks[nblk * 16 - 2] = x.length * 8;
    return blks;
  }
  var i,
    x = sb(inputString),
    a = 1732584193,
    b = -271733879,
    c = -1732584194,
    d = 271733878,
    olda,
    oldb,
    oldc,
    oldd;
  for (i = 0; i < x.length; i += 16) {
    olda = a;
    oldb = b;
    oldc = c;
    oldd = d;
    a = ff(a, b, c, d, x[i + 0], 7, -680876936);
    d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063);
    b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = gg(b, c, d, a, x[i + 0], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558);
    d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = hh(d, a, b, c, x[i + 0], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i + 0], 6, -198630844);
    d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = ad(a, olda);
    b = ad(b, oldb);
    c = ad(c, oldc);
    d = ad(d, oldd);
  }
  return rh(a) + rh(b) + rh(c) + rh(d);
}