import path, { join, basename } from 'path';
import fs, { pathExistsSync } from 'fs-extra';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import ocr from './ocr';
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
  OCRParameter,
  Book,
} from './types';
import { get_tags } from './get_tags';

let [_, __, parsed_article_dir, tags_dir] = process.argv;

(async () => {
  const p1 = (await fs.readdir(parsed_article_dir)).filter(i => !i.startsWith('.') && i !== 'README.md')
  for (const prefix1 of p1) {
    const book_list = await fs.readdir(join(parsed_article_dir, prefix1))
    let i = 0;
    for (const book of book_list) {
      ++i;
      console.log(book, `${i}/${book_list.length}`);
      const prefix2_list = (await fs.readdir(join(parsed_article_dir, prefix1, book))).filter(i => !i.endsWith('.bookinfo'));
      for (const prefix2 of prefix2_list) {
        for (const article of await fs.readdir(join(parsed_article_dir, prefix1, book, prefix2))) {
          const data = JSON.parse(fs.readFileSync(join(parsed_article_dir, prefix1, book, article)).toString()) as ParserResult;
          const target_dir = join(tags_dir, prefix1, book);
          fs.ensureDirSync(target_dir);
          fs.writeFileSync(join(target_dir, article), JSON.stringify(get_tags(data)));
        }
      }
    }
  }
})();