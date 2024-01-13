import { exec, execSync } from 'node:child_process';
import * as pdfjsLib from './pdf.js';
import { join, basename, dirname, extname } from 'node:path/posix';
import { isAbsolute } from 'node:path';
import fs from 'fs-extra';
import {
  OCRParameter,
  OCRParameterAdvanced,
  OCRParameterLegacy,
  OCRResult,
} from './types';
import pdf2image from './pdf2image';
import sizeOf from 'image-size';
import { tmpdir } from 'node:os';
import { merge_to_lines, pdfjsContentToOCRResult } from './utils';

export default async function ocr({
  file_path,
  cache = true,
  is_pdf,
  page,
  cache_path,
  params,
}: {
  cache?: boolean;
  cache_path?: string;
  file_path: string;
  is_pdf?: boolean;
  page?: number; // start from 1
  params: Partial<OCRParameter & OCRParameterAdvanced>;
}): Promise<{
  ocr_results: OCRResult[];
  dimensions: { height: number; width: number };
}> {
  if (cache && (await fs.pathExists(cache_path!))) {
    return JSON.parse((await fs.readFile(cache_path!)).toString());
  }
  console.log('ocr:', file_path, page, is_pdf);
  if (!(await fs.pathExists(dirname(cache_path!)))) {
    await fs.ensureDir(dirname(cache_path!));
  }
  let res: {
    ocr_results: OCRResult[];
    dimensions: { height: number; width: number };
  };

  if (is_pdf && params.extract_text_from_pdf) {
    const doc = await pdfjsLib.getDocument({
      url: file_path,
      cMapPacked: true,
      cMapUrl: './node_modules/pdfjs-dist/cmaps/',
    }).promise;
    let content_obj = await (await doc.getPage(page!)).getTextContent();
    const viewport = (await doc.getPage(page!)).getViewport({ scale: 1 });
    res = {
      dimensions: { width: viewport.width, height: viewport.height },
      ocr_results: pdfjsContentToOCRResult(content_obj, viewport.height).map(
        (i) => {
          // 去掉空格块
          i.text = i.text.replace(/ /g, '');
          return i;
        },
      ),
    };
  } else {
    const abs_ocr_target = is_pdf
      ? await pdf2image({ pdf_path: file_path, page: page! - 1 })
      : file_path;
    const dimensions = sizeOf(abs_ocr_target);

    const tmp_file = join(tmpdir(), Math.random().toString());
    await fs.writeFile(
      tmp_file,
      JSON.stringify({
        ...params,
        image_dir: abs_ocr_target,
      }),
    );
    const ocr_command = `python3 /app/ocr.py ${tmp_file}`;
    const raw = execSync(ocr_command, {
      cwd: '/app'
    }).toString();
    const t = JSON.parse(raw) as [
      [[number, number], [number, number], [number, number], [number, number]],
      [string, number],
    ][];

    res = {
      ocr_results: t[0].map((i: any) => ({
        text: i[1][0],
        box: i[0],
      })),
      dimensions: {
        height: dimensions.height!,
        width: dimensions.width!,
      },
    };
    is_pdf && (await fs.remove(abs_ocr_target));
  }
  await fs.writeFile(cache_path!, JSON.stringify(res));

  return res;
}
