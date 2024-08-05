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
        let first = 0;
        for (let article of file.split('<a name')) {
          article=article.replace(/\r\n/g, '\n').replace('back to TOC</a>\n\n', 'back to TOC</a>\n').replace(/[　\t]/g, ' ');
          if (!first) {
            first = 1;
            continue;
          }
          if (article.startsWith('=T')) continue;

          // type=1的title author content格式都与0不同
          let type = 0;
          let tmp: string;
          if (article.indexOf('·~}') == -1) {
            if (article.indexOf('back to TOC') >= 0) {
              tmp = article.substring(0, article.indexOf('\n\n'));
            } else if (article.indexOf('</a>') == -1)
            tmp = article.substring(0, article.indexOf('\n\n'));
            else
            tmp = article.substring(0, article.indexOf('</a>'));
          
            if (article.split(/\n +·/g).length > 1) {
              type = 1;
            }
          } else {
            tmp = article.split(/\~\{[ 　]*·/)[0];
          }
            //console.log([tmp]);
            let tmp2 = article.substring(tmp.length);
            let title = '';
            
            if (type == 0)
            while (tmp.indexOf('~{') >= 0) {
              const t = tmp.substring(tmp.indexOf('~{') + 2, tmp.indexOf('~}')).trim();
              if (!t.startsWith('【') && !t.startsWith('〖'))
              title+=t;
              tmp=tmp.substring(tmp.indexOf('~}')+2);
            }
            else {
              title = tmp.split('</a>')[0].split('>')[1].trim();
            }

            if (title.startsWith('杂志上连载')) continue;
            if (title.startsWith('端思潮》一书的电子')) title = '文化大革命和它的异端思潮（连载之一）';
            if (title.startsWith('初所撰写的对文革的反思〈')) title = '我心中的文革';
            if (title.startsWith('·杨道远·')) {
              title='武汉地区文革初期的“五十天”（上）——《武汉地区文革纪实》选载';
              tmp2 = article.substring(article.indexOf('·杨道远·'));
            }
            if (!title) {
              console.log('#parse failed#',article.split('\n').slice(0,8).join('\n'))
              continue;
            }
            
            tmp = tmp2;
            let authors: string[] = [];
            if (type == 0) {
            if (tmp.indexOf('·~}') != -1) {
              authors = tmp.substring(tmp.indexOf('·') + 1, tmp.indexOf('·~}')).trim().split('·').map(x => x.replace(/[ 　]/g, '')).filter(x => x);
            }
            tmp = tmp.substring(tmp.indexOf('·~}') + 3);
            tmp = tmp.substring(tmp.indexOf('\n   '));
          } else {
            authors = tmp.substring(tmp.indexOf('·') + 1, tmp.indexOf('·\n')).trim().split('·').map(x => x.replace(/[ 　]/g, '')).filter(x => x);
            tmp = tmp.substring(tmp.indexOf('·') + 1);
            tmp = tmp.substring(tmp.indexOf('\n   '));
          }

          if (!authors.reduce((m,i) => m && i.length < 10, true) ||
          title.length > 50) {
              console.log('#parse failed#',article.split('\n').slice(0,8).join('\n'))
            continue;
          }
            console.log([title, authors])

            const paragraphs: string[] = [];
            // 连续两个换行分割段落
            tmp.split(/\n\n[　 \~]/).forEach(paragraph => {
                const content = paragraph.split('\n').map(x => x.replace(/ *\~?\{/, '').replace(/\~\}$/, '')).join('').trim();
                if (content) {
                    paragraphs.push(content);
                }
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