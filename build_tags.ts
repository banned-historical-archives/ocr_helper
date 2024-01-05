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
  const f1_list = (await fs.readdir(parsed_article_dir)).filter(i => !i.startsWith('.') && fs.statSync(i).isDirectory)
  for (const f1 of f1_list) {
    const book_list = (await fs.readdir(join(parsed_article_dir, f1))).filter(i => fs.statSync(i).isDirectory)
    let i = 0;
    for (const book of book_list) {
      ++i;
      console.log(book, `${i}/${book_list.length}`);
      const article_list = (await fs.readdir(join(parsed_article_dir, f1, book)));
      for (const article of article_list) {
        const data = JSON.parse(fs.readFileSync(join(parsed_article_dir, f1, book, article)).toString()) as ParserResult;
        const target = join(tags_dir, f1, book, article);
        fs.writeFileSync(target, JSON.stringify(get_tags(data)));
      }
    }
  }
})();