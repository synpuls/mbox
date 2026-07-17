import {
  createEditorState,
  createEditorView,
  createMboxExtension,
  editorPresentationTheme,
} from "mbox";
import { hatenaDefaultPresentationTheme, hatenaPlugins } from "mbox/hatena";
import { createPlaygroundHandle } from "./playground-handle";
import "./styles.css";

// The "run it" page for the Hatena notation namespace. Editor setup and the
// mbox extension wiring are notation-agnostic; only the plugin bundle and the
// seed `doc` are specific to Hatena.
const parent = document.querySelector<HTMLDivElement>("#editor");

if (!parent) {
  throw new Error("Editor mount element was not found.");
}

// A Hatena syntax catalog: every supported construct appears once, grouped under
// a labelled heading.
const doc = `[:contents]

Move the cursor onto a line to reveal its raw notation.

*Part 1 — Hatena notation catalog

Body text under the large heading notation (*).


A paragraph after two blank lines (line-break notation).

**Medium heading notation (**)

***Small heading notation (***)

▼ List notation (- / -- / + / ++)
-Unordered list level 1
--Unordered list level 2
-Back to level 1
+Ordered list level 1
++Ordered list level 2

▼ Definition list notation (:term:description)
:Hatena:an internet services company
:mbox:a structured editor built on CodeMirror 6

▼ Table notation (|*header| and |cell|)
|*Name|*Color|*Count|
|apple|red|1|
|orange|orange|2|

▼ Quote notation (>> to <<)
>>
This is a quote block. A single-level quote.
<<

▼ Pre notation (>| to |<)
>|
This is a pre block.
    Pre body with indentation.
-Unordered list level 1
--Unordered list level 2
|<

▼ Super pre notation (>|| to ||<)
>||
This is a super pre. Body containing an <b>HTML tag</b>.
||<

▼ Super pre with syntax highlighting (>|lang| to ||<)
>|python|
def hello(name="world"):
    return f"Hello, {name}"
||<

▼ Super pre with language auto-detection (>|??| to ||<)
>|??|
const answer = 42;
||<

▼ Footnote notation ( (( to )) )
A footnote is inserted mid-sentence((this is the footnote body)). And another one((a second footnote)).

▼ Unformatted block notation (>< to ><)
><div class="raw">A block without auto-inserted p tags</div><

▼ Tex notation ([tex:...])
[tex:x^2 + y^2 = z^2]

▼ Table of contents notation ([:contents])
[:contents]

▼ Category notation ([category])
[test][notation]

▼ Auto links
http notation (bare URL): http://example.com/
http notation (brackets): [http://example.com/]
http notation (:title): [http://example.com/:title]
http notation (:title=...): [http://example.com/:title=custom title]
google notation: [google:hatena]
google image: [google:image:cat]
wikipedia notation: [wikipedia:Hatena]
auto link stop: []http://example.com/[]
id notation: id:hatena
id notation (image): id:hatena:image
question notation: question:1234567890:title
fotolife notation: f:id:hatena:20240101000000:image
isbn notation: isbn:4873115655
asin notation: asin:4873115655

▼ Leading-space escape (a half-width space at line start)
 *A heading notation escaped by a leading space
 -A list notation escaped by a leading space

▼ Draft notation (<!-- to -->)
<!-- An example draft comment -->


*Part 2 — Extended notation

▼ Nested quotes
>>
Outer quote.
>>
Inner quote.
<<
Back to the outer quote.
<<

▼ Quote with cite (>URL> form)
>http://example.com/>
A quote with its source URL.
<<

▼ Definition list continuation line (::)
:term:first line of the description
::second, continued line of the description

▼ Mixed list markers (-+ / +-)
-+Mixed markers
+-Reverse mix

▼ Heading with a name attribute
*name1*A named heading


*Part 3 — Precedence examples

▼ Distinguishing the blocks that start with ">" (>> / >| / >|| / >< / >URL>)
>>
Quote block
<<
>|
Pre block
|<
>||
Super pre block
||<

▼ Other notation inside a super pre
>||
*Heading notation
-List notation
|Table notation|
[http://example.com/]
((Footnote notation))
||<

▼ A leading "*" in the first table row's cell
|*This is a header cell|A normal cell|

▼ Bracket notation collisions ([http] / [tex] / [wikipedia] / [google] / [] stop)
[http://example.com/:title=link] and [tex:a+b] and [wikipedia:Hatena] mixed on one line.

▼ Heading vs the name-attribute boundary
*A plain heading
*abc*A heading with a name attribute

▼ Leading-space escape vs each notation
 >>A quote notation escaped by a leading space
 |cell| (a table notation escaped by a leading space)


*Part 4 — Additional notation

▼ Footnote notation (multiple)
Sentence A((footnote A)), sentence B((footnote B)), sentence C((footnote C)).

▼ Read-more notation (====)
====
Everything below this line is the "read more" body.
Another body line of the read-more notation.`;

const view = createEditorView({
  parent,
  state: createEditorState({
    activeLine: true,
    ariaLabel: "Hatena playground editor",
    doc,
    extensions: [
      createMboxExtension({
        // The playground plays the host role: it owns URL semantics and
        // passes a resolver into the notation bundle, same as gfm's linkUrl.
        // codeHighlight "all" exercises the dynamic loader: the `>|python|`
        // block in the seed doc loads its language on demand.
        plugins: hatenaPlugins({
          link: { idUrl: (name) => `/${name}` },
          codeHighlight: { languages: "all" },
        }),
      }),
      editorPresentationTheme({ minHeight: "560px" }),
      hatenaDefaultPresentationTheme(),
    ],
  }),
});

window.__mboxHatenaPlayground = createPlaygroundHandle(view);
