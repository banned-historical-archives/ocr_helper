npm run build_ocr_cache -- /var/config /var/raw_dir /var/ocr_cache

npm run build_parsed_article -- /var/config /var/ocr_cache /var/ocr_patch /var/parsed /var/raw_dir

## raw_dir

abcd.pdf
bcde/1.jpg
bcde/2.jpg
bcde/3.png

## config
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

## parsed
prefix/book_id/prefix/article_id.json
prefix/book_id/book_id.bookinfo
prefix/music_id/music_id.musicinfo
prefix/gallery_id/gallery_id.galleryinfo