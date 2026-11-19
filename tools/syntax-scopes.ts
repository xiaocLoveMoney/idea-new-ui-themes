/**
 * IntelliJ highlighting roles -> TextMate scopes. A palette colors roles; the build expands each
 * role into one `tokenColors` rule. Order matters only between equally specific scopes (later
 * wins), so broad roles come first and language-specific ones last.
 *
 * Role names follow the IntelliJ color scheme keys they come from, e.g. `keyword` is
 * DEFAULT_KEYWORD and `field` is DEFAULT_INSTANCE_FIELD.
 */
export const SYNTAX_SCOPES = {
  /** TEXT / DEFAULT_IDENTIFIER: IntelliJ leaves identifiers, operators and class names plain. */
  text: [
    'source',
    'text',
    'variable',
    'variable.parameter',
    'meta.definition.variable.name',
    'entity.name.variable',
    'entity.name.type',
    'entity.name.class',
    'entity.name.namespace',
    'entity.other.inherited-class',
    'support.class',
    'support.type',
    'keyword.operator',
    'punctuation',
    'meta.embedded',
    'support.constant.property-value.css',
    'meta.property-value.css'
  ],
  /** DEFAULT_KEYWORD, also YAML keys, primitives and literals such as true/null. */
  keyword: [
    'keyword',
    'storage',
    'storage.type',
    'storage.modifier',
    'constant.language',
    'variable.language',
    'keyword.operator.new',
    'keyword.operator.expression',
    'keyword.operator.wordlike',
    'keyword.operator.logical.python',
    'keyword.operator.instanceof',
    'keyword.operator.typeof',
    'support.type.primitive',
    'support.type.builtin',
    'storage.type.primitive',
    'punctuation.definition.template-expression',
    'punctuation.section.embedded',
    'entity.name.tag.yaml'
  ],
  /** DEFAULT_STRING */
  string: ['string', 'string.quoted', 'string.template', 'constant.other.symbol'],
  /** DEFAULT_VALID_STRING_ESCAPE */
  escape: ['constant.character.escape', 'constant.character.format.placeholder', 'constant.other.placeholder'],
  /** JS.REGEXP */
  regexp: ['string.regexp', 'constant.other.character-class.regexp', 'keyword.operator.quantifier.regexp'],
  /** DEFAULT_NUMBER */
  number: ['constant.numeric', 'keyword.other.unit'],
  /** DEFAULT_LINE_COMMENT / DEFAULT_BLOCK_COMMENT */
  comment: ['comment', 'punctuation.definition.comment'],
  /** DEFAULT_DOC_COMMENT */
  docComment: ['comment.block.documentation', 'comment.block.javadoc'],
  /** DEFAULT_DOC_COMMENT_TAG */
  docTag: [
    'comment.block.documentation storage.type.class',
    'comment.block.documentation keyword',
    'storage.type.class.jsdoc',
    'storage.type.class.javadoc',
    'keyword.other.documentation'
  ],
  /** DEFAULT_FUNCTION_DECLARATION / DEFAULT_INSTANCE_METHOD */
  function: ['entity.name.function', 'support.function', 'meta.function-call.generic'],
  /** DEFAULT_INSTANCE_FIELD, also JSON keys and CSS property names. */
  field: [
    'variable.other.property',
    'variable.other.object.property',
    'variable.other.member',
    'entity.name.variable.field',
    'meta.object-literal.key',
    'support.variable.property',
    'support.type.property-name'
  ],
  /** DEFAULT_CONSTANT / DEFAULT_STATIC_FIELD */
  constant: ['variable.other.constant', 'variable.other.enummember', 'entity.name.constant', 'support.constant'],
  /** DEFAULT_METADATA: annotations and decorators. */
  metadata: [
    'meta.decorator',
    'meta.annotation',
    'punctuation.decorator',
    'entity.name.function.decorator',
    'storage.type.annotation',
    'punctuation.definition.annotation',
    'meta.declaration.annotation'
  ],
  /** TYPE_PARAMETER_NAME_ATTRIBUTES */
  typeParameter: ['entity.name.type.parameter', 'meta.type.parameters entity.name.type'],
  /** HTML_TAG_NAME / XML_TAG_NAME */
  tag: ['entity.name.tag', 'punctuation.definition.tag', 'meta.tag.sgml', 'meta.tag.preprocessor.xml'],
  /** JS.JSX_CLIENT_COMPONENT */
  component: ['support.class.component', 'entity.name.tag.component'],
  /** HTML_ATTRIBUTE_NAME / XML_ATTRIBUTE_NAME */
  attribute: ['entity.other.attribute-name'],
  /** HTML_ENTITY_REFERENCE */
  entity: ['constant.character.entity', 'punctuation.definition.entity'],
  /** CSS.COLOR */
  cssColor: ['constant.other.color', 'support.constant.color'],
  /** HYPERLINK_ATTRIBUTES / MARKDOWN_LINK_TEXT */
  link: ['markup.underline.link', 'string.other.link', 'markup.link'],
  /** KOTLIN_LABEL */
  label: ['entity.name.label', 'storage.modifier.label'],
  /** Markdown headings. */
  heading: ['markup.heading', 'entity.name.section', 'punctuation.definition.heading'],
  bold: ['markup.bold'],
  italic: ['markup.italic'],
  strikethrough: ['markup.strikethrough'],
  /** MARKDOWN_CODE_SPAN */
  inlineCode: ['markup.inline.raw', 'markup.fenced_code', 'markup.raw'],
  /** MARKDOWN_LIST_MARKER / MARKDOWN_BLOCK_QUOTE_MARKER */
  markdownMarker: ['punctuation.definition.list.begin.markdown', 'markup.quote', 'punctuation.definition.quote.begin.markdown'],
  /** FILESTATUS_ADDED / FILESTATUS_MODIFIED / FILESTATUS_DELETED in diffs. */
  inserted: ['markup.inserted', 'meta.diff.header.to-file'],
  changed: ['markup.changed'],
  deleted: ['markup.deleted', 'meta.diff.header.from-file'],
  diffRange: ['meta.diff.range', 'meta.diff.header'],
  /** BAD_CHARACTER */
  invalid: ['invalid', 'invalid.illegal', 'invalid.deprecated'],
  /** PY.SELF_PARAMETER */
  pythonSelf: ['variable.language.special.self.python', 'variable.parameter.function.language.special.self.python'],
  /** PY.KEYWORD_ARGUMENT */
  pythonKeywordArgument: ['variable.parameter.function-call.python'],
  /** PY.BUILTIN_NAME */
  pythonBuiltin: ['support.function.builtin.python', 'support.type.python', 'support.type.exception.python']
} as const satisfies Record<string, readonly string[]>;

export type SyntaxRole = keyof typeof SYNTAX_SCOPES;
