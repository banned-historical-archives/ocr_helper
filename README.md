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

## ocr_cache
abcd/1.json
abcd/2.json
bcde/1.json
bcde/2.json

## ocr_patch
${prefix_of_article_id}/article_id_x.json
${prefix_of_article_id}/article_id_y.json
${prefix_of_article_id}/article_id_z.json

## parsed_article
${prefix_of_article_id}/article_id_x.json
${prefix_of_article_id}/article_id_y.json
${prefix_of_article_id}/article_id_z.json