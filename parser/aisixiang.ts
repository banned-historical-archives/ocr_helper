import { join } from 'path';
import { basename } from 'node:path/posix';
import { existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import ocr from '../ocr';
import {
  ContentPart,
  ContentPartRaw,
  ContentType,
  Date,
  OCRParameterLegacy,
  OCRParameterAdvanced,
  OCRResult,
  ParserOption,
  ParserResult,
  Pivot,
  TagType,
} from '../types';
import { merge_to_lines } from '../utils';
import { execSync } from 'child_process';
import fs from 'fs';
import { JSDOM } from 'jsdom';

export default async function (
  path: string,
): Promise<ParserResult[]> {
  const res: ParserResult[] = [];
  const root = path;
  for (let html of fs.readdirSync((`${root}`))) {
    const dom = new JSDOM(fs.readFileSync((`${root}/${html}`)).toString());
    const doc = dom.window.document as any;
    const title = doc.querySelector('.show_text h3').textContent.trim();
    const author = doc.querySelector('strong').textContent.trim();
    const date_raw = doc.querySelector('.show_text .info').textContent.trim();
    const date_str = date_raw.match(/\d{4}-\d{2}-\d{2}/)[0];
    const content = Array.from(doc.querySelectorAll('.article-content p')).map((i: any) => i.textContent.trim()).filter(i => i)
    res.push({
      title: title,
      authors: [author],
      dates: [{
        year: parseInt(date_str.split('-')[0]),
        month: parseInt(date_str.split('-')[1]),
        day: parseInt(date_str.split('-')[2]),
      }],
      is_range_date: false,
      parts: content.map(i => ({ type: ContentType.paragraph, text: i as string })),
      comments: [],
      comment_pivots: [],
      description: '',
      page_start: 1,
      page_end: 1,
    });
  }
  return res;
}
