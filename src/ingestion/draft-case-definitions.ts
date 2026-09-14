import type { RecordData } from '../catalog/record-data';
/** Proposed executable expectations, not human-verified truth. */
export function draftCaseDefinition(
  id: string,
  records: RecordData[],
): unknown {
  const source = (ruleId: string) => {
    const r = records.find((r) => r.kind === 'rule' && r.data.id === ruleId);
    if (r?.kind !== 'rule')
      throw new Error('Draft case rule missing: ' + ruleId);
    return r.data.sourceText;
  };
  const context = (
    sku: string,
    values: Record<string, string | number | boolean>,
    modifications: string[] = [],
  ) => ({
    catalogVersionId: 'benchmark-candidate',
    seriesId: 'Allure',
    productId: 'product:' + sku,
    values,
    selection: { modification: modifications },
  });
  const check = (
    text: string,
    sku: string,
    values: Record<string, string | number | boolean>,
    expected: string,
    modifications: string[] = [],
  ) => ({
    test: 'rules',
    ruleSourceTexts: [text],
    context: context(sku, values, modifications),
    expected,
  });
  switch (id) {
    case 'missing-skin-dimensions':
      return {
        test: 'record_blockers',
        entityId: 'product:SK W39',
        expectedBlockers: ['missing_required_field'],
      };
    case 'overlay-nominal-vs-actual':
      return {
        test: 'corrupt_dimension',
        sku: 'OLF330',
        field: 'widthIn',
        value: 3,
      };
    case 'wrong-footnote-scope':
      return {
        test: 'footnote_scope',
        sku: 'W3021',
        pageNumber: 22,
        injectedSymbol: '♦',
        expectedEligible: false,
      };
    case 'missing-diagram':
      return {
        test: 'remove_diagram_evidence',
        sku: 'CM-1',
        field: 'profileWidthIn',
      };
    case 'stale-index':
      return {
        test: 'navigation',
        pageNumber: 51,
        expectedPrintedLabel: '30',
        indexPage: 2,
        indexText: 'Base Cabinets',
      };
    case 'cross-page-mixer': {
      const text = source('rule:mixer-host');
      return {
        checks: [
          check(text, 'MLU-B18', { hostSku: 'B18FD' }, 'valid'),
          check(text, 'MLU-B18', { hostSku: 'B18' }, 'invalid'),
          check(text, 'MLU-B18', {}, 'unknown'),
        ],
      };
    }
    case 'conditional-cut-rod': {
      const text = source('rule:cut-rod-required');
      return {
        checks: [
          check(
            text,
            'B18',
            { cutDepthReductionApplied: true, hasRodAccessory: true },
            'valid',
            ['CUT-ROD'],
          ),
          check(
            text,
            'B18',
            { cutDepthReductionApplied: true, hasRodAccessory: true },
            'invalid',
          ),
          check(text, 'B18', {}, 'unknown'),
          check(
            text,
            'B18',
            { cutDepthReductionApplied: false, hasRodAccessory: true },
            'not_applicable',
          ),
        ],
      };
    }
    case 'style-and-finish': {
      const rule = records.find(
        (r) =>
          r.kind === 'rule' &&
          r.data.scope.kind === 'products' &&
          r.data.scope.targets.some((t) => t.value === 'product:W2421') &&
          r.data.sourceText.includes('Galaxy'),
      );
      if (rule?.kind !== 'rule') throw new Error('Style case rule missing');
      return {
        checks: [
          check(
            rule.data.sourceText,
            'W2421',
            { style: 'Galaxy', finish: 'Frost' },
            'valid',
          ),
          check(
            rule.data.sourceText,
            'W2421',
            { style: 'Luna', finish: 'Frost' },
            'invalid',
          ),
          check(
            rule.data.sourceText,
            'W2421',
            { style: 'Galaxy', finish: 'Linen' },
            'invalid',
          ),
        ],
      };
    }
    default:
      throw new Error('Draft case has no executable definition');
  }
}
