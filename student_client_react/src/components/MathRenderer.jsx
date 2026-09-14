import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * MathRenderer — Offline KaTeX Math & Rich Formatting Rendering Component
 *
 * Parses a string for inline LaTeX expressions enclosed in single dollar signs
 * ($...$) and renders them using KaTeX. Non-math segments are safely parsed for
 * semantic formatting tags (<sup>, <sub>, <u>, <b>, <strong>, <i>, <em>, <s>, <strike>, **).
 * All math and formatting happens fully offline via the bundled katex npm package.
 *
 * @param {string} content - The text string to parse and render.
 * @param {string} [className] - Optional CSS class names to apply to the wrapper.
 */
export default function MathRenderer({ content, className = '' }) {
  const segments = useMemo(() => {
    if (!content || typeof content !== 'string') {
      return [{ type: 'text', value: String(content ?? '') }];
    }

    // Regex: match $...$ blocks where the content is non-empty.
    // Uses a non-greedy match so nested/adjacent dollar signs work correctly.
    const parts = [];
    const regex = /\$([^$]+)\$/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Push any plain text before this math block
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }

      // Render the LaTeX expression to an HTML string
      try {
        const html = katex.renderToString(match[1], {
          throwOnError: false,
          displayMode: false,
          output: 'html',
        });
        parts.push({ type: 'math', html });
      } catch (_err) {
        // Fallback: render the raw $...$ as plain text if KaTeX fails
        parts.push({ type: 'text', value: match[0] });
      }

      lastIndex = regex.lastIndex;
    }

    // Push any trailing plain text after the last math block
    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', value: content }];
  }, [content]);

  // Safely parse inline formatting tags (<sup>, <sub>, <u>, <b>, <strong>, <i>, <em>, <s>, <strike>, **) in non-math segments
  const renderFormattedText = (text, keyPrefix) => {
    if (!text || typeof text !== 'string') return null;

    const formatRegex = /(<sup>[\s\S]*?<\/sup>|<sub>[\s\S]*?<\/sub>|<u>[\s\S]*?<\/u>|<b>[\s\S]*?<\/b>|<strong>[\s\S]*?<\/strong>|<i>[\s\S]*?<\/i>|<em>[\s\S]*?<\/em>|<s>[\s\S]*?<\/s>|<strike>[\s\S]*?<\/strike>|\*\*[\s\S]*?\*\*)/gi;
    const tokens = text.split(formatRegex);

    return tokens.map((token, idx) => {
      if (!token) return null;
      const subKey = `${keyPrefix}-${idx}`;

      const supMatch = token.match(/^<sup>([\s\S]*?)<\/sup>$/i);
      if (supMatch) {
        return (
          <sup key={subKey} className="text-[0.75em] leading-none align-super font-semibold">
            {renderFormattedText(supMatch[1], `${subKey}-sup`)}
          </sup>
        );
      }

      const subMatch = token.match(/^<sub>([\s\S]*?)<\/sub>$/i);
      if (subMatch) {
        return (
          <sub key={subKey} className="text-[0.75em] leading-none align-sub font-semibold">
            {renderFormattedText(subMatch[1], `${subKey}-sub`)}
          </sub>
        );
      }

      const uMatch = token.match(/^<u>([\s\S]*?)<\/u>$/i);
      if (uMatch) {
        return (
          <span
            key={subKey}
            className="underline font-bold underline-offset-4 decoration-2 decoration-orange-500 text-orange-600 dark:text-orange-400"
          >
            {renderFormattedText(uMatch[1], `${subKey}-u`)}
          </span>
        );
      }

      const bMatch = token.match(/^(?:<b>|<strong>|\*\*)([\s\S]*?)(?:<\/b>|<\/strong>|\*\*)$/i);
      if (bMatch) {
        return (
          <strong key={subKey} className="font-bold">
            {renderFormattedText(bMatch[1], `${subKey}-b`)}
          </strong>
        );
      }

      const iMatch = token.match(/^(?:<i>|<em>)([\s\S]*?)(?:<\/i>|<\/em>)$/i);
      if (iMatch) {
        return (
          <em key={subKey} className="italic">
            {renderFormattedText(iMatch[1], `${subKey}-i`)}
          </em>
        );
      }

      const sMatch = token.match(/^(?:<s>|<strike>)([\s\S]*?)(?:<\/s>|<\/strike>)$/i);
      if (sMatch) {
        return (
          <s key={subKey} className="line-through">
            {renderFormattedText(sMatch[1], `${subKey}-s`)}
          </s>
        );
      }

      return <React.Fragment key={subKey}>{token}</React.Fragment>;
    });
  };

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'math' ? (
          // dangerouslySetInnerHTML is safe here — KaTeX generates sanitized HTML
          <span key={i} dangerouslySetInnerHTML={{ __html: seg.html }} />
        ) : (
          <React.Fragment key={i}>
            {renderFormattedText(seg.value, i)}
          </React.Fragment>
        )
      )}
    </span>
  );
}
