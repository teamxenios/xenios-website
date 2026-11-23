import assert from 'node:assert/strict';
export function cssReferenceParser(postcss, valueParser) {
  return css => {
    const refs = [], root = postcss.parse(css);
    const urls = value => valueParser(value).walk(node => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
      const content = node.nodes.filter(n => n.type !== 'space' && n.type !== 'comment');
      assert(content.length === 1 && ['word', 'string'].includes(content[0].type), 'UNSUPPORTED_CSS_URL');
      refs.push(content[0].value); return false; // Do not parse url(...) text inside a data string.
    });
    root.walkDecls(d => urls(d.value));
    root.walkAtRules('import', rule => {
      const nodes = valueParser(rule.params).nodes.filter(n => n.type !== 'space' && n.type !== 'comment');
      if (nodes[0]?.type === 'string') refs.push(nodes[0].value);
      else { assert(nodes[0]?.type === 'function' && nodes[0].value.toLowerCase() === 'url', 'UNSUPPORTED_CSS_IMPORT'); urls(rule.params); }
    });
    return refs;
  };
}
