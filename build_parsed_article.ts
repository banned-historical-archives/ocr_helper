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
  Book,
  OCRCacheFile,
  Patch,
  PatchV2,
} from './types';
import { get_article_id, merge_to_lines, pdfjsContentToOCRResult } from './utils';
import { traditionalChineseToSimpleChinese } from './i18n';

const [_, __, ocr_config_dir, ocr_cache_dir, ocr_patch_dir, parsed_article_dir] = process.argv;

type PartRaw = { page: number; x: number; merge_up?: boolean } & ContentPartRaw;
function extract_parts(
  ocr: OCRResult[],
  page: number,
  page_dimensions: { width: number; height: number },
  ocr_parameters: Partial<OCRParameter & OCRParameterAdvanced>,
): PartRaw[] {
  const res: PartRaw[] = [];
  for (let i = 0, last_x = 0; i < ocr.length; ++i) {
    let text = ocr[i].text.trim();
    const x = ocr[i].box[0][0];
    res.push({
      page,
      text,
      x,
      type: ContentType.paragraph,
    });
    last_x = x;
  }
  const paragraphs = res.filter((i) => i.type === ContentType.paragraph);
  for (let i = 0; i < paragraphs.length; ++i) {
    const last = paragraphs[i - 1];
    const next = paragraphs[i + 1];
    const t = paragraphs[i];
    if (ocr_parameters.differential_paragraph_merge_strategy_threshold) {
      if (
        last &&
        t.x - last.x >
          ocr_parameters.differential_paragraph_merge_strategy_threshold
      ) {
        t.merge_up = false;
      } else if (
        next &&
        t.x - next.x >
          ocr_parameters.differential_paragraph_merge_strategy_threshold
      ) {
        t.merge_up = false;
      } else {
        t.merge_up = true;
      }
    } else if (ocr_parameters.standard_paragraph_merge_strategy_threshold) {
      t.merge_up =
        t.x <
        page_dimensions.width *
          ocr_parameters.standard_paragraph_merge_strategy_threshold;
    }
  }
  return res;
}

function merge_parts(parts: PartRaw[]): ContentPart[] {
  const res: ContentPart[] = [];
  for (let i = 0; i < parts.length; ++i) {
    if (
      parts[i].merge_up &&
      res.length &&
      res[res.length - 1].type === parts[i].type
    ) {
      res[res.length - 1].text += parts[i].text;
    } else {
      res.push({
        type: parts[i].type,
        text: parts[i].text,
      });
    }
  }
  return res;
}

export async function parse_article(
  ocr_cache_path: string,
  parser_opt: ParserOption,
): Promise<ParserResult[]> {
  const res: ParserResult[] = [];
  parser_opt.ocr = {

    content_thresholds: [0.0, 0.0, 0.0, 0.0],
    line_merge_threshold: 30,
    standard_paragraph_merge_strategy_threshold: 0,
    differential_paragraph_merge_strategy_threshold: 30,
    auto_vsplit: true,
    vsplit: 0.5,
    ...parser_opt.ocr,
  };
  for (const article of parser_opt.articles!) {
    const parts: PartRaw[] = [];
    for (let i = article.page_start; i <= article.page_end; ++i) {

      const merged_ocr_parameters: Partial<
        OCRParameter & OCRParameterAdvanced
      > = {
        ...(parser_opt.ocr || {}),
        ...(article.ocr ? article.ocr : {}),
        ...(article.ocr_exceptions ? article.ocr_exceptions[i] : {}),
        ...(parser_opt.ocr_exceptions ? parser_opt.ocr_exceptions[i] : {}),
      };
      let { ocr_results, dimensions } = JSON.parse((await fs.readFile(join(ocr_cache_path, `${i}.json`))).toString()) as OCRCacheFile;

      const content_thresholds = merged_ocr_parameters.content_thresholds!;
      const line_merge_threshold = merged_ocr_parameters.line_merge_threshold!;

      // 还原OCR结果的坐标
      const size = dimensions;
      const content_thresholds_px = [
        content_thresholds[0] * size.height!,
        size.height! - content_thresholds[1] * size.height!,
        content_thresholds[2] * size.width!,
        size.width! - content_thresholds[3] * size.width!,
      ];
      ocr_results = ocr_results.filter(
        (i: OCRResult) =>
          i.box[0][0] >= content_thresholds_px[2] &&
          i.box[3][0] >= content_thresholds_px[2] &&
          i.box[1][0] <= content_thresholds_px[3] &&
          i.box[2][0] <= content_thresholds_px[3] &&
          i.box[0][1] >= content_thresholds_px[0] &&
          i.box[1][1] >= content_thresholds_px[0] &&
          i.box[2][1] <= content_thresholds_px[1] &&
          i.box[3][1] <= content_thresholds_px[1],
      );

      if (
        (merged_ocr_parameters.auto_vsplit && size.height < size.width) ||
        (!merged_ocr_parameters.auto_vsplit && merged_ocr_parameters.vsplit)
      ) {
        const left = ocr_results.filter((i) => {
          return (
            i.box[0][0] < size.width * merged_ocr_parameters.vsplit! &&
            i.box[3][0] < size.width * merged_ocr_parameters.vsplit!
          );
        });
        const right = ocr_results.filter((i) => {
          return (
            i.box[0][0] >= size.width * merged_ocr_parameters.vsplit! &&
            i.box[3][0] >= size.width * merged_ocr_parameters.vsplit!
          );
        });
        parts.push(
          ...extract_parts(
            merge_to_lines(left, line_merge_threshold).sort(
              (a, b) => a.box[0][1] - b.box[0][1],
            ),
            i,
            size,
            merged_ocr_parameters,
          ),
          ...extract_parts(
            merge_to_lines(right, line_merge_threshold).sort(
              (a, b) => a.box[0][1] - b.box[0][1],
            ),
            i,
            size,
            merged_ocr_parameters,
          ),
        );
      } else {
        parts.push(
          ...extract_parts(
            merge_to_lines(ocr_results, line_merge_threshold).sort(
              (a, b) => a.box[0][1] - b.box[0][1],
            ),
            i,
            size,
            merged_ocr_parameters,
          ),
        );
      }
    }
    const merged_parts = merge_parts(parts);
    res.push({
      title: article.title,
      alias: article.alias,
      parts: merged_parts,
      authors: article.authors,
      dates: article.dates,
      is_range_date: !!article.is_range_date,
      comments: [],
      comment_pivots: [],
      description: '',
      page_start: article.page_start,
      page_end: article.page_end,
    });
  }

  return res;
}

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
  const f_list = (await fs.readdir(ocr_config_dir)).filter(i => i.endsWith('.ts'))
  const cfgs = (await Promise.all<{default: Book}>(
    f_list.map((file) => import(join(ocr_config_dir, file))),
  )).map(i => i.default);

  for (const cfg of cfgs) {
    const uuid = path.parse(cfg.path).name;
    console.log('book id', uuid);
    const ocr_cache_path = join(ocr_cache_dir, uuid);

    const res = await parse_article(ocr_cache_path, cfg.parser_option);
    for (let article of res) {
      const id = get_article_id(article);
      console.log('article id', id);
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

      const patch_path = join(ocr_patch_dir, `[${id}][${uuid}].ts`);
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
      await fs.ensureDir(join(parsed_article_dir, uuid.slice(0, 3), uuid))
      await fs.writeFile(join(parsed_article_dir, uuid.slice(0, 3), uuid, `${id}.json`), JSON.stringify(article));
    }
  }
})();
