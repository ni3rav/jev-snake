import { createHighlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const INPUT_THEME = "nord";
const OUTPUT_THEME = "vitesse-dark";

const highlighterPromise = createHighlighter({
  langs: ["json"],
  themes: [INPUT_THEME, OUTPUT_THEME],
  engine: createJavaScriptRegexEngine(),
});

export async function highlightJson(
  value: unknown,
  pane: "input" | "output",
): Promise<string> {
  const highlighter = await highlighterPromise;
  return highlighter.codeToHtml(JSON.stringify(value, null, 2), {
    lang: "json",
    theme: pane === "input" ? INPUT_THEME : OUTPUT_THEME,
  });
}
