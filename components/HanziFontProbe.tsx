import { local } from "@/lib/site";

/**
 * Installs the self-hosted hanzi font, but only for browsers that need it.
 *
 * Nearly every visitor already has a CJK font — PingFang on Apple platforms,
 * Microsoft YaHei on Windows, Noto on Android — and `--font-hanzi` in
 * app/globals.css names all of them ahead of the webfont. The obvious thing
 * would be to declare the @font-face in the stylesheet and let the browser
 * decide, but Chromium downloads a webfont whenever it appears in a matched
 * font-family list, without checking whether an earlier family already drew
 * every character. That would bill ~280 kB to everyone to help nobody.
 *
 * So the rule is not in the stylesheet. This probe draws a hanzi and compares
 * it against a private-use codepoint, which is guaranteed to have no glyph. If
 * they come out identical the browser is drawing tofu, and only then is the
 * @font-face injected. `--font-hanzi` already ends with this family name, so
 * text reflows onto it as soon as the rule exists.
 *
 * A server component, so the probe is in the prerendered HTML and runs during
 * head parsing — before the first paint, rather than after hydration.
 */
export function HanziFontProbe() {
  const face = (weight: number, file: string) =>
    `@font-face{font-family:"Hanzi Garden SC";font-style:normal;font-weight:${weight};` +
    // `fallback` over `swap`: the thing it would swap *from* is the tofu this
    // font exists to prevent, so a brief invisible beat is the kinder default.
    `font-display:fallback;src:url("${local(file)}") format("woff2")}`;

  const css =
    face(400, "fonts/noto-sans-sc-subset-400.woff2") +
    face(600, "fonts/noto-sans-sc-subset-600.woff2");

  const probe = `
(function () {
  try {
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    function ink(ch) {
      ctx.clearRect(0, 0, 32, 32);
      ctx.font = '24px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(ch, 0, 0);
      var d = ctx.getImageData(0, 0, 32, 32).data, h = 0;
      for (var i = 3; i < d.length; i += 4) h = (h * 31 + d[i]) | 0;
      return h;
    }
    // \\u597d is 好; \\ue000 is private-use, so no font defines it. Different
    // pixels mean a real CJK glyph was drawn and there is nothing to fix.
    if (ink('\\u597d') !== ink('\\ue000')) return;
    var style = document.createElement('style');
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
  } catch (e) {
    // A locked-down canvas reads back blank for both samples and lands here or
    // in the branch above; either way the worst case is loading a font that
    // was not needed, never leaving a visitor staring at empty boxes.
  }
})();
`.trim();

  return <script id="hanzi-font-probe" dangerouslySetInnerHTML={{ __html: probe }} />;
}
