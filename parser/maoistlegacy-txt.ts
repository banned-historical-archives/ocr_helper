import { readJsonSync } from "fs-extra";
import { ParserResult, TagType } from "../types";

export default async (
    file: string,
) => {
    const meta = readJsonSync(file);
    const res: ParserResult[] = [
        {
            title: meta.title,
            dates: meta.dates,
            is_range_date: false,
            authors: meta.creator || [],
            comments: [],
            comment_pivots: [],
            description: '',

            page_start: 1,
            page_end: 1,
            origin: meta.source[0] || '',
            tags: meta.tags.map((i: string) => ({
                name: i,
                type: TagType.subject,
            })),
            parts: meta.parts,
        },
    ];
    return res;
}