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

export default async function (
  dirPathOrFilePath: string,
): Promise<ParserResult[]> {
  const year_start = 1946;
  const year_end = 1958;
  const res: ParserResult[] = [];
  return [];
  // TODO 数量太大，构建时磁盘空间不足
  for (let i = year_start; i <= year_end; ++i) {
    for (let j = year_start === 1946 ? 5 : 1; j <= 12; ++j) {
      const dir = `${i}年${j > 9 ? j : '0' + j}月`;
      try {
        execSync(`7z x -y ${dir}.7z`, {
          cwd: dirPathOrFilePath,
        });
      } catch (e) {}
      const files = readdirSync(join(dirPathOrFilePath, dir));
      for (const file of files) {
        const content = readFileSync(
          join(dirPathOrFilePath, dir, file),
        )
          .toString()
          .split('\n');
        res.push({
          title: content[0].substring(4),
          dates: [
            {
              year: parseInt(content[2].split('-')[0]),
              month: parseInt(content[2].split('-')[1]),
              day: parseInt(content[2].split('-')[2]),
            },
          ],
          authors: content[1].split('　').filter((i) => i),
          parts: content
            .slice(6)
            .map((i) => i.trim())
            .filter((i) => i)
            .map((i) => ({
              type: ContentType.paragraph,
              text: i,
            })),
          comments: [],
          page_end: 0,
          page_start: 0,
          is_range_date: false,
          comment_pivots: [],
          description: '',
        });
      }
    }
  }

  return res;
}
