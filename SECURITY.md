# Security Policy

## Supported versions

mbox is pre-1.0. Security fixes are applied to the latest published `0.x`
release only; please upgrade to the newest version before reporting.

| Version | Supported          |
| ------- | ------------------ |
| latest `0.x` | :white_check_mark: |
| older        | :x:                |

## Untrusted content

mbox is intended to parse and render structured text; hosts that load or show
untrusted documents must define the resource and navigation policies around it.

- mbox provides no input-size, CPU, or interruption-limit API. Its document
  cache reparses the entire document after each edit. GFM parsing goes through
  `mdast-util-from-markdown` / micromark and can be superlinear on malformed
  input with many unclosed delimiters. Inline parsing also temporarily allocates
  scan indexes proportional to an input block (about 13 B/character for a
  3.6 MB single line), released after parsing. Set limits at fetch, decode,
  paste, and programmatic-update entry points, and use a worker when needed.
- `image: { renderMode: "preview" }` can load image URLs specified by the document. In a
  browser, `<img>` requests mainly create external-communication concerns such
  as IP, user-agent, or referrer tracking, bandwidth use, and image-decoding
  resource consumption. They can also become SSRF risks when a host performs
  server-side rendering, uses an image proxy, or fetches from an internal
  network. Use the default `"token"` mode unless external image loading is
  intended, and enforce appropriate URL, network, CSP, and privacy policies.
- GFM link destinations, including `linkUrl` return values, are revalidated
  against the allowlist and permanently blocked protocols. Host-supplied
  `pageUrl`, `iconUrl`, `idUrl`, Scrapbox `image: { resolveSrc }`, and mbox or
  Scrapbox completion-candidate `iconUrl` values reach `href` or `src` without
  a scheme check; enforce the host's policy. Document image URLs from GFM,
  mbox, and Scrapbox likewise reach `img.src` unchecked. By contrast, Scrapbox
  image click links and document-derived Scrapbox or Hatena links have parser
  scheme restrictions.
- For untrusted documents, prefer an explicit language allowlist to
  `codeHighlight: { languages: "all" }`. Loading many language chunks can
  affect network use, load volume, and predictability; this is about
  controlling those costs, not a claim of arbitrary code execution.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub's private vulnerability reporting: go to the
repository's **Security** tab and choose **"Report a vulnerability"**
(https://github.com/synpuls/mbox/security/advisories/new). This keeps the report
confidential until a fix is available.

Include, where possible: affected version, a description of the issue, and a
minimal reproduction. We aim to acknowledge reports within a few days and will
coordinate a fix and disclosure timeline with you.
