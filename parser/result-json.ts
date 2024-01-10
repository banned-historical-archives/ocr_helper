// https://unpkg.com/browse/pdfjs-dist@2.14.305/legacy/build/pdf.js
import { readFileSync } from 'fs-extra';
import * as pdfjsLib from '../pdf.js';

import {
  ArticleType,
  ContentPart,
  ContentPartRaw,
  ContentType,
  Date,
  OCRResult,
  ParserOption,
  ParserResult,
  Pivot,
} from '../types';
import { merge_to_lines, pdfjsContentToOCRResult } from '../utils';

export default async function(
  path: string,
): Promise<ParserResult[]> {
  return JSON.parse(readFileSync(path).toString()) as ParserResult[];
}
