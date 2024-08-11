import path, { join, basename } from 'path';
import fs, { pathExistsSync } from 'fs-extra';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import ocr from './ocr';
import {
  ContentPart,
  ContentPartRaw,
  ContentType,
  OCRParameterLegacy,
  OCRParameterAdvanced,
  OCRResult,
  ParserOption,
  ParserResult,
  Pivot,
  TagType,
  OCRParameter,
  CommonResource,
} from './types';

let timeout = process.env.CI ? Date.now() + 5 * 60 * 60 * 1000 : Infinity;

let [_, __, ocr_config_dir, raw_dir, ocr_cache_dir] = process.argv;
if (!path.isAbsolute(ocr_cache_dir)) {
  ocr_cache_dir = join(__dirname, ocr_cache_dir);
}
if (!path.isAbsolute(raw_dir)) {
  raw_dir = join(__dirname, raw_dir);
}
if (!path.isAbsolute(ocr_config_dir)) {
  ocr_config_dir = join(__dirname, ocr_config_dir);
}

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

export async function do_ocr(
  dirPathOrFilePath: string,
  parser_opt: ParserOption,
  entity_type: string,
  entity_id: string,
) {
  parser_opt.ocr = {
    det_db_box_thresh: 0.2,
    // use_gpu: true,
    // gpu_mem: 7000,
    rec_char_dict_path: './paddle/ppocr_keys_v1.txt',
    rec_model_dir: './paddle/ch_PP-OCRv4_rec_infer',
    det_model_dir: './paddle/ch_PP-OCRv4_det_infer',

    det_limit_side_len: 2496,
    drop_score: 0.3,

    ...parser_opt.ocr,
  };
  for (const article of parser_opt.articles!) {
    const parts: PartRaw[] = [];
    for (let i = article.page_start; i <= article.page_end; ++i) {
      
      if (Date.now() > timeout) {
        console.log('timeout');
        return;
      }
      
      console.log(i + '/' + article.page_end);
      const merged_ocr_parameters: Partial<
        OCRParameter & OCRParameterAdvanced
      > = {
        ...(parser_opt.ocr || {}),
        ...(article.ocr ? article.ocr : {}),
        ...(article.ocr_exceptions ? article.ocr_exceptions[i] : {}),
        ...(parser_opt.ocr_exceptions ? parser_opt.ocr_exceptions[i] : {}),
      };
      await ocr(
        entity_type == 'pdf'
          ? {
              file_path: dirPathOrFilePath,
              page: i,
              is_pdf: true,
              cache_path: 
                join(ocr_cache_dir, entity_id, `${i}.json`),
            params: merged_ocr_parameters,
          }
          : {
            file_path:
              pathExistsSync(join(dirPathOrFilePath, `${i}.jpg`)) ?
                join(dirPathOrFilePath, `${i}.jpg`) :
              pathExistsSync(join(dirPathOrFilePath, `${i}.jpeg`)) ?
              join(dirPathOrFilePath, `${i}.jpeg`):
                join(dirPathOrFilePath, `${i}.png`),
            cache_path: 
                join(ocr_cache_dir, entity_id, `${i}.json`),
            page: i,
              params: merged_ocr_parameters,
          },
      );
    }
  }
}

(async () => {
  const f_list = (await fs.readdir(ocr_config_dir)).filter(i => i.endsWith('.ts'))
  const cfgs = (await Promise.all<{default: CommonResource}>(
    f_list.map((file) => import(join(ocr_config_dir, file))),
  )).map(i => i.default);

  let i = 0;
  for (const cfg of cfgs) {
    ++i;
    console.log(i + '/' + cfgs.length, cfg.path, cfg?.parser_option?.articles?.length);

    if (cfg.parser_id === 'automation') {
      const res = await do_ocr(join(raw_dir, cfg.path), cfg.parser_option, (cfg as any).entity.type, cfg.entity.id);
    }
    if (Date.now() > timeout) {
      console.log('timeout');
      return;
    }
  }
})();
