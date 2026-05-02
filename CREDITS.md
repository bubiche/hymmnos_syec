# Credits

syec is a fan tool for reading lyrics in Hymmnos, the constructed language of
song magic from the *Ar Tonelico* video game series. Nothing in this project is
original creative work in the Hymmnos language itself — the dictionary, the
grammar, the fonts, and the framing are all the work of others.

## Language and source material

- **Hymmnos** and the *Ar Tonelico* series are the work of **Akira Tsuchiya**
  and **Gust Co. Ltd.**

## Dictionary data

The dictionary embedded in this app was built from the canonical MySQL dump in
[`flan/hymmnoserver`](https://github.com/flan/hymmnoserver), which is the data
behind <https://hymmnoserver.uguu.ca/index.php> — the long-standing English fan
translation of the Hymmnos Server reference site
(<http://game.salburg.com/hymmnoserver/>) by **Akira Tsuchiya**.

- Upstream commit pinned at:
  [`75f5f4a8172ed9d22ab1e03e269c174ae8c98621`](https://github.com/flan/hymmnoserver/commit/75f5f4a8172ed9d22ab1e03e269c174ae8c98621).
- File: `database/hymmnoserver.mysqldump`.
- Maintainer of the English fan translation and its repository:
  **Neil Tallim** ([@flan](https://github.com/flan)).

The Pastalia morphology rules and the Binasphere Chorus decoder used in this
app are ports of `common/lookup.py` and `common/transformations.py` from the
same upstream.

## Fonts

- **`hymmnos.ttf`** — by **UnDefine**, distributed via
  <http://game.salburg.com/hymmnoserver/hymmnos.ttf>. Used for Central,
  Pastalia, Metafalss, Alpha, and Alpha-EOLIA glyphs.
- **`ar-ciela_compartment.ttf`** — by **Akira Tsuchiya**, distributed via
  <http://game.salburg.com/hymmnoserver/ar-ciela_compartment.ttf>. Used for
  Cult Ciel (Ar Ciela) glyphs.

Both fonts are vendored under `src/assets/fonts/` for offline rendering.

## In-fiction summaries

The "About Hymmnos" panel in the app distills passages from the English
Hymmnos Server pages on
[introduction](https://hymmnoserver.uguu.ca/introduction.php),
[grammar](https://hymmnoserver.uguu.ca/grammar.php),
[advanced grammar](https://hymmnoserver.uguu.ca/grammar2.php),
[Ar Ciela](https://hymmnoserver.uguu.ca/ar-ciela.php), and
[dialects](https://hymmnoserver.uguu.ca/dialects.php).
