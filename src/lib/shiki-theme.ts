// Custom Shiki theme from the palette (plan §5.6): mostly monochrome, ultraviolet keywords, muted comments.
// Hex values mirror tokens.css primitives (Shiki needs literal colours); tests/theme.test.ts keeps them in sync.
export const TEXT = '#EDEDF0', TEXT_2 = '#B4B4BD', TEXT_3 = '#8A8A96', ACCENT = '#8D6CFF', TERM_BG = '#060608';

export const rewindTheme = {
  name: 'rewind-dark',
  type: 'dark',
  colors: { 'editor.background': TERM_BG, 'editor.foreground': TEXT },
  settings: [
    { settings: { foreground: TEXT, background: TERM_BG } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: TEXT_3, fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.operator.new', 'keyword.control'], settings: { foreground: ACCENT } },
    { scope: ['string', 'string.template', 'punctuation.definition.string'], settings: { foreground: TEXT_2 } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: TEXT_2 } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function'], settings: { foreground: TEXT, fontStyle: 'bold' } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: TEXT_3 } },
    { scope: ['variable', 'variable.other', 'variable.parameter', 'support.variable', 'entity.name'], settings: { foreground: TEXT } },
  ],
};
