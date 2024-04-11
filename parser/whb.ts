import { readFileSync } from 'fs';
import {
  ContentPart,
  ContentPartRaw,
  ContentType,
  Date,
  OCRResult,
  ParserOption,
  ParserResult,
  Pivot,
  TagType,
} from '../types';
import { merge_to_lines, pdfjsContentToOCRResult } from '../utils';
import { join, basename } from 'node:path/posix';
import fs from 'fs';

export default async function (
  path: string,
): Promise<ParserResult[]> {
  const res: ParserResult[] = [];
  const root = path;
  for (let j of fs.readdirSync((`${root}`))) {
    for (let k of fs.readdirSync((`${root}/${j}`))) {
      const json = JSON.parse(
        fs.readFileSync((`${root}/${j}/${k}`)).toString(),
      );
      res.push({
        title: json.ytitle + json.mtitle + json.ftitle ,
        authors: json.authors,
        dates: json.date,
        is_range_date: false,
        parts: json.text,
        comments: [],
        origin: json.source,
        comment_pivots: [],
        description: '',
        page_start: 1,
        page_end: 1,
      });
    }
  }

  return res;
}
