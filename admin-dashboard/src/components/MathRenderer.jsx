import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * MathRenderer — Offline KaTeX Math Rendering Component (Admin Dashboard)
 *
 * Parses a string for inline LaTeX expressions enclosed in single dollar signs
 * ($...$) and renders them using KaTeX. Non-math segments are rendered as plain
 * text. All math rendering happens fully offline via the bundled katex npm package.
 *
 * @param {string} content - The text string to parse and render.
 * @param {string} [className] - Optional CSS class names to apply to the wrapper.
 */
export default function MathRenderer({ content, className = '' }) {
  const segments = useMemo(() => {
    if (!content || typeof content !== 'string') {
      return [{ type: 'text', value: String(content ?? '') }];
    }

    const parts = [];
    const regex = /\$([^$]+)\$/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }

      try {
        const html = katex.renderToString(match[1], {
          throwOnError: false,
          displayMode: false,
          output: 'html',
        });
        parts.push({ type: 'math', html });
      } catch (_err) {
        parts.push({ type: 'text', value: match[0] });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', value: content }];
  }, [content]);

  // Safely parse inline emphasis formatting (<u>...</u> and **...**) in non-math text segments
  const renderFormattedText = (text, keyPrefix) => {
    if (!text || typeof text !== 'string') return null;

    // Split by <u>...</u> or **...** (case-insensitive for <u> tags)
    const formatRegex = /(<u>[\s\S]*?<\/u>|\*\*[\s\S]*?\*\*)/gi;
    const tokens = text.split(formatRegex);

    return tokens.map((token, idx) => {
      if (!token) return null;

      const uMatch = token.match(/^<u>([\s\S]*?)<\/u>$/i);
      if (uMatch) {
        const inner = uMatch[1].replace(/^\*\*([\s\S]*?)\*\*$/, '$1');
        return (
          <span
            key={`${keyPrefix}-u-${idx}`}
            className="underline font-bold underline-offset-4 decoration-2 decoration-orange-500 text-orange-600 dark:text-orange-400"
          >
            {inner}
          </span>
        );
      }

      const bMatch = token.match(/^\*\*([\s\S]*?)\*\*$/);
      if (bMatch) {
        const inner = bMatch[1];
        const innerUMatch = inner.match(/^<u>([\s\S]*?)<\/u>$/i);
        if (innerUMatch) {
          return (
            <span
              key={`${keyPrefix}-bu-${idx}`}
              className="underline font-bold underline-offset-4 decoration-2 decoration-orange-500 text-orange-600 dark:text-orange-400"
            >
              {innerUMatch[1]}
            </span>
          );
        }
        return (
          <strong key={`${keyPrefix}-b-${idx}`} className="font-bold">
            {inner}
          </strong>
        );
      }

      return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{token}</React.Fragment>;
    });
  };

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'math' ? (
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
