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

export default async function (
  path: string,
): Promise<ParserResult[]> {
  const res: ParserResult[] = [];
  const root = path;
  for (let year of fs.readdirSync((`${root}`))) {
    for (let month of fs.readdirSync((`${root}/${year}`))) {
      for (let article of fs.readdirSync((`${root}/${year}/${month}`))) {
        const json = JSON.parse(
          fs.readFileSync((`${root}/${year}/${month}/${article}`)).toString(),
        );
        res.push({
          title: json.title,
          authors: json.authors,
          dates: json.dates,
          is_range_date: false,
          parts: json.parts,
          comments: [],
          comment_pivots: [],
          description: '',
          page_start: 1,
          page_end: 1,
        });
      }
    }
  }
  return res;
}
