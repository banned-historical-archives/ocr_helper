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
import { readdir, readFile } from 'fs-extra';
import {join} from 'path';

export default async function (
  path: string,
): Promise<ParserResult[]> {
   const p = join(path, 'html/CR');
   const dirs = (await readdir(p)).filter(i => !i.endsWith('.htm'));
   const res: ParserResult[] = [];
   for (const i of dirs) {
     for (const j of await readdir(join(p, i))) {
        const file = (await readFile(join(p, i, j))).toString();
        for (const article of file.split('~{～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～～~}')) {
            let tmp = article.split('<a name')[1];
            const title = tmp.substring(tmp.indexOf('~{') + 2, tmp.indexOf('~}'));
            tmp = tmp.split('</a>')[1];
            
            const authors: string[] = [
                tmp.substring(tmp.indexOf('~{·') + 3, tmp.indexOf('·~}')).trim().replace(/ /g, '')
            ];
            tmp = tmp.substring(tmp.indexOf('·~}') + 3);
            tmp = tmp.substring(tmp.indexOf('\n   '));

            const paragraphs: string[] = [];
            // 连续两个换行分割段落
            tmp.split('\n\n').forEach(paragraph => {
                paragraphs.push(paragraph.split('\n').map(x => x.replace(/^ *\~\{/, '').replace(/\~\}$/, '')).join(''));
            });
            res.push({
                title,
                authors,
                dates: [],
                comment_pivots: [],
                comments: [],
                is_range_date: false,
                description: '',
                page_start:0,
                page_end:0,
                parts: paragraphs.map(x => ({text: x, type: ContentType.paragraph})),
            })
        }
     }
   }
   return res;
}