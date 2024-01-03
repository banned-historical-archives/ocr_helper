npm run build_ocr_cache -- /var/ocr_config /var/raw_dir /var/ocr_cache

npm run build_parsed_article -- /var/ocr_config /var/ocr_cache /var/ocr_patch /var/parsed_article

## raw_dir

abcd.pdf
bcde/1.jpg
bcde/2.jpg
bcde/3.png

## ocr_config
abcd.ts
bcde.ts

## ocr_patch
abc/abcd/1.ts
abc/abcd/2.ts
bcd/bcde/1.ts
bcd/bcde/2.ts

## ocr_cache
abc/abcd/1.json
abc/abcd/2.json
bcd/bcde/1.json
bcd/bcde/2.json

## parsed_article
${prefix_of_article_id}/article_id_x.json
${prefix_of_article_id}/article_id_y.json
${prefix_of_article_id}/article_id_z.json