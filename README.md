npm run build_ocr_cache -- /var/ocr_config /var/raw_dir /var/ocr_cache

npm run build_parsed_article -- /var/ocr_config /var/ocr_cache /var/ocr_patch /var/parsed_article

npm run build_tag -- /var/parsed_article /var/tags

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
[article_id_x][book_idx].json
[article_id_y][book_idx].json
[article_id_z][book_idy].json
[article_id_z][book_idz].json

## parsed_article
prefix/book_id/article_id.json

## tag
prefix/book_id/article_id.json