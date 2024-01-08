import path, { join, basename } from 'path';
import { diff_match_patch, Diff } from 'diff-match-patch';
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
  CommonResource,
  OCRCacheFile,
  Patch,
  PatchV2,
} from './types';
import { get_article_id, } from './utils';
import { traditionalChineseToSimpleChinese } from './i18n';
import { get_tags } from './get_tags';
import automationParser from './parser/automation';
import CCRD from './parser/CCRD';
import chuanxinlu from './parser/chuanxinlu';
import jimi from './parser/jimi';
import jinghuo from './parser/jinghuo';
import jqjianghua from './parser/jqjianghua';
import qibenyu from './parser/qibenyu';
import rmrb from './parser/rmrb';
import wanghongwen from './parser/wanghongwen';
import wengeqianqixinianlu1 from './parser/wengeqianqixinianlu1';
import wenji from './parser/wenji';
import wenku from './parser/wenku';
import xuanji from './parser/xuanji';
import yaowenyuan from './parser/yaowenyuan';
import zhangchunqiao from './parser/zhangchunqiao';
import zzj1 from './parser/zzj1';

const [_, __, config_dir, ocr_cache_dir, ocr_patch_dir, parsed_dir, raw_dir] = process.argv;

export const bracket_left = '〔';
export const bracket_right = '〕';

export function extract_pivots(s: string, part_idx: number): [Pivot[], string] {
  const res: Pivot[] = [];
  const exp = new RegExp(`${bracket_left}\\d+${bracket_right}`);
  while (true) {
    const idx = s.search(exp);
    if (idx == -1) {
      break;
    }
    const index = parseInt(s.match(exp)![0].substr(1));
    s = s.replace(exp, '');
    res.push({ part_idx, offset: idx, index });
  }
  return [res, s];
}

/**
 * 1) 编辑/删除/插入段落，修改段落类型
 * 2) 编辑/删除/插入注释
 * 3) 编辑/删除描述
 */
export function apply_patch_v2(
  parserResult: ParserResult,
  patch: PatchV2,
): ParserResult {
  const { parts, comment_pivots, comments } = parserResult;
  const final_parts: ContentPart[] = [];
  const final_comments: string[] = [];
  const final_pivots: Pivot[] = [];
  for (let i in parts) {
    const idx = parseInt(i);
    if (patch.parts[i]) {
      if (patch.parts[i].insertBefore)
        for (const j of patch.parts[i].insertBefore!) {
          const [pivots, k] = extract_pivots(j.text, final_parts.length);
          final_parts.push({ type: j.type, text: k });
          final_pivots.push(...pivots);
        }
      if (!patch.parts[i].delete) {
        let final_text = parts[i].text;
        if (patch.parts[i].diff) {
          const original_text_arr = Array.from(parts[idx].text);
          // 恢复bracket
          comment_pivots
            .filter((i) => i.part_idx === idx)
            .sort((a, b) => b.index - a.index)
            .forEach((i) =>
              original_text_arr.splice(
                i.offset,
                0,
                `${bracket_left}${i.index}${bracket_right}`,
              ),
            );
          const original_text_with_brackets = original_text_arr.join('');
          final_text = new diff_match_patch()
            .diff_fromDelta(original_text_with_brackets, patch.parts[i].diff!)
            .filter((i) => i[0] !== -1)
            .map((i) => i[1])
            .join('');
        }

        const [pivots, final_text_without_brackets] = extract_pivots(
          final_text,
          final_parts.length,
        );
        final_parts.push({
          type: patch.parts[i].type || parts[i].type,
          text: final_text_without_brackets,
        });
        final_pivots.push(...pivots);
      }
      if (patch.parts[i].insertAfter)
        for (const j of patch.parts[i].insertAfter!) {
          const [pivots, k] = extract_pivots(j.text, final_parts.length);
          final_parts.push({ type: j.type, text: k });
          final_pivots.push(...pivots);
        }
    } else {
      final_pivots.push(
        ...comment_pivots
          .filter((j) => j.part_idx === idx)
          .map((j) => ({ ...j, part_idx: final_parts.length })),
      );
      final_parts.push(parts[i]);
    }
  }
  if (patch.newComments && patch.newComments.length) {
    final_comments.push(...patch.newComments);
  } else {
    for (let idx_from_0 in comments) {
      const idx_from_1 = parseInt(idx_from_0) + 1;
      if (patch.comments[idx_from_1]) {
        if (patch.comments[idx_from_1].insertBefore)
          final_comments.push(
            ...patch.comments[idx_from_1].insertBefore!.map((j) => j.text),
          );
        if (!patch.comments[idx_from_1].delete) {
          const final_text = patch.comments[idx_from_1].diff
            ? new diff_match_patch()
                .diff_fromDelta(
                  comments[idx_from_0],
                  patch.comments[idx_from_1].diff!,
                )
                .filter((i) => i[0] !== -1)
                .map((i) => i[1])
                .join('')
            : comments[idx_from_0];
          final_comments.push(final_text);
        }
        if (patch.comments[idx_from_1].insertAfter)
          final_comments.push(
            ...patch.comments[idx_from_1].insertAfter!.map((j) => j.text),
          );
      } else {
        final_comments.push(parserResult.comments[idx_from_0]);
      }
    }
  }

  const newResult: ParserResult = { ...parserResult };
  newResult.comments = final_comments;
  newResult.parts = final_parts;
  newResult.comment_pivots = final_pivots;
  if (typeof patch.description === 'string') {
    if (patch.description.length) {
      newResult.description = new diff_match_patch()
        .diff_fromDelta(parserResult.description || '', patch.description)
        .filter((i) => i[0] !== -1)
        .map((i) => i[1])
        .join('');
    }
  } else {
    newResult.description = '';
  }
  return newResult;
}

export function apply_patch(parserResult: ParserResult, patch: Patch) {
  const d = new diff_match_patch();
  const { parts, comment_pivots } = parserResult;
  Object.keys(patch.parts).forEach((i) => {
    const idx = parseInt(i);
    const text_arr = Array.from(parts[idx].text);
    comment_pivots
      .filter((i) => i.part_idx === idx)
      .sort((a, b) => b.index - a.index)
      .forEach((i) =>
        text_arr.splice(
          i.offset,
          0,
          `${bracket_left}${i.index}${bracket_right}`,
        ),
      );
    const origin_text = text_arr.join('');
    const diff = d.diff_fromDelta(origin_text, patch.parts[i]);
    const new_text = diff
      .filter((i) => i[0] !== -1)
      .map((i) => i[1])
      .join('');
    parserResult.comment_pivots = comment_pivots.filter(
      (x) => x.part_idx !== idx,
    );
    const [pivots, pure_text] = extract_pivots(new_text, idx);
    parserResult.comment_pivots.push(...pivots);
    parts[idx].text = pure_text;
  });
  Object.keys(patch.comments).forEach((i) => {
    const idx = parseInt(i);
    const diff = d.diff_fromDelta(
      parserResult.comments[idx - 1],
      patch.comments[i],
    );
    const new_text = diff
      .filter((i) => i[0] !== -1)
      .map((i) => i[1])
      .join('');
    parserResult.comments[idx - 1] = new_text;
  });
  if (patch.description) {
    const diff = d.diff_fromDelta(parserResult.description, patch.description);
    const new_text = diff
      .filter((i) => i[0] !== -1)
      .map((i) => i[1])
      .join('');
    patch.description = new_text;
  }
}

(async () => {
  const f_list = (await fs.readdir(config_dir)).filter(i => i.endsWith('.ts'))
  const cfgs = (await Promise.all<{default: CommonResource}>(
    f_list.map((file) => import(join(config_dir, file))),
  )).map(i => i.default);

  for (const cfg of cfgs) {
    if (
      !!cfg.resource_type &&
      cfg.resource_type != 'book'
    ) {
      const id = cfg.entity.id;
      await fs.ensureDir(join(parsed_dir, id.slice(0, 3), id));
      if (cfg.resource_type == 'music') {
        await fs.writeFileSync(join(parsed_dir, id.slice(0, 3), id, id + '.musicinfo'), JSON.stringify(cfg));
      } else if (cfg.resource_type == 'gallery') {
        await fs.writeFileSync(join(parsed_dir, id.slice(0, 3), id, id + '.galleryinfo'), JSON.stringify(cfg));
      }
      continue;
    }
    const book_id = cfg.entity.id;
    console.log('book id', book_id);
    const ocr_cache_path = join(ocr_cache_dir, book_id);

    let res: ParserResult[] = [];
    if (cfg.parser_id === 'automation') {
      res = await automationParser(ocr_cache_path, cfg.parser_option);
    } else if (cfg.parser_id === 'CCRD') {
      res = await CCRD(join(raw_dir, cfg.path));
    } else if (cfg.parser_id === 'chuanxinlu') {
      res = await chuanxinlu(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'jimi') {
      res = await jimi(join(raw_dir, cfg.path));
    } else if (cfg.parser_id === 'jinghuo') {
      res = await jinghuo(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'jqjianghua') {
      res = await jqjianghua(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'qibenyu') {
      res = await qibenyu(join(raw_dir, cfg.path));
    } else if (cfg.parser_id === 'rmrb') {
      res = await rmrb(join(raw_dir, cfg.path));
    } else if (cfg.parser_id === 'wanghongwen') {
      res = await wanghongwen(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'wengeqianqixinianlu1') {
      res = await wengeqianqixinianlu1(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'wenji') {
      res = await wenji(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'wenku') {
      res = await wenku(join(raw_dir, cfg.path));
    } else if (cfg.parser_id === 'wenku') {
      res = await wenku(join(raw_dir, cfg.path));
    } else if (cfg.parser_id === 'xuanji') {
      res = await xuanji(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'yaowenyuan') {
      res = await yaowenyuan(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'zhangchunqiao') {
      res = await zhangchunqiao(join(raw_dir, cfg.path), cfg.parser_option);
    } else if (cfg.parser_id === 'zzj1') {
      res = await zzj1(join(raw_dir, cfg.path), cfg.parser_option);
    }
    for (let article of res) {
      const article_id = get_article_id(article);
      article.alias = traditionalChineseToSimpleChinese(article.alias || '');
      article.description = traditionalChineseToSimpleChinese(article.description || '');
      article.parts.forEach(j => {
        j.text = traditionalChineseToSimpleChinese(j.text);
      });
      for (let j = 0; j < article.comments.length; ++j) {
        article.comments[j] = traditionalChineseToSimpleChinese(
          article.comments[j],
        );
      }

      const patch_path = join(ocr_patch_dir, `[${article_id}][${book_id}].ts`);
      if (await fs.pathExists(patch_path)) {
        console.log('found patch', patch_path);
        const patch_list = (await import(patch_path)).default;
        for (const patch of patch_list) {
          if (patch.version === 2) {
            article = apply_patch_v2(article, patch);
          } else {
            apply_patch(article, patch);
          }
        }
      }

      await fs.ensureDir(join(parsed_dir, book_id.slice(0, 3), book_id, article_id.slice(0, 3)));
      await fs.writeFile(join(parsed_dir, book_id.slice(0, 3), book_id, article_id.slice(0, 3), `${article_id}.json`), JSON.stringify(article));
      await fs.writeFile(join(parsed_dir, book_id.slice(0, 3), book_id, article_id.slice(0, 3), `${article_id}.tag`), JSON.stringify(get_tags(article)));
      await fs.writeFile(join(parsed_dir, book_id.slice(0, 3), book_id, `${book_id}.bookinfo`), JSON.stringify(
        cfg.entity
      ));
    }
  }
})();
