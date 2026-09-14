import { AUTO_APPROVE_THRESHOLD } from './approval.js';
import { contextSchema, ruleSchema } from './rule-schema.js';
import type { CatalogRule, EvaluationContext, RuleCondition, RuleConstraint, RuleTarget } from './rule-schema.js';

export type Truth = true | false | 'unknown';
export type RuleOutcome = 'valid' | 'invalid' | 'unknown' | 'not_applicable';
export type RuleResult = { ruleId: string; outcome: RuleOutcome; evidenceIds: string[]; reasons: string[] };
function all(values: Truth[]): Truth {
  return values.includes(false) ? false : values.includes('unknown') ? 'unknown' : true;
}
function any(values: Truth[]): Truth {
  return values.includes(true) ? true : values.includes('unknown') ? 'unknown' : false;
}
export function evaluateCondition(condition: RuleCondition, context: EvaluationContext): Truth {
  switch (condition.kind) {
    case 'all': return all(condition.conditions.map(c => evaluateCondition(c, context)));
    case 'any': return any(condition.conditions.map(c => evaluateCondition(c, context)));
    case 'not': {
      const value = evaluateCondition(condition.condition, context);
      return value === 'unknown' ? value : !value;
    }
    case 'text': case 'boolean': {
      const value = context.values[condition.field];
      return value === undefined ? 'unknown' : value === condition.value.value;
    }
    case 'text_set': {
      const value = context.values[condition.field];
      return value === undefined ? 'unknown' : condition.values.some(x => x.value === value);
    }
    case 'number': {
      const value = context.values[condition.field];
      if (value === undefined) return 'unknown';
      const limit = condition.value.value;
      switch (condition.op) {
        case 'eq': return value === limit;
        case 'gt': return value > limit;
        case 'gte': return value >= limit;
        case 'lt': return value < limit;
        case 'lte': return value <= limit;
      }
    }
  }
}
function scopeApplies(rule: CatalogRule, context: EvaluationContext): Truth {
  const targets = rule.scope.targets.map(t => t.value);
  let actual: string[] | undefined;
  switch (rule.scope.kind) {
    case 'series': actual = context.seriesId === undefined ? undefined : [context.seriesId]; break;
    case 'products': actual = context.productId === undefined ? undefined : [context.productId]; break;
    case 'families': actual = context.familyIds; break;
    case 'categories': actual = context.category === undefined ? undefined : [context.category]; break;
    case 'modifications': actual = context.selection.modification; break;
  }
  return actual === undefined ? 'unknown' : actual.some(x => targets.includes(x));
}
function selected(target: RuleTarget, context: EvaluationContext): Truth {
  const values = context.selection[target.kind];
  return values === undefined ? 'unknown' : values.includes(target.id.value);
}
function outcome(value: Truth): RuleOutcome {
  return value === 'unknown' ? 'unknown' : value ? 'valid' : 'invalid';
}
function evaluateConstraint(constraint: RuleConstraint, context: EvaluationContext): RuleOutcome {
  switch (constraint.type) {
    case 'allowed_values': case 'forbidden_values': {
      const value = context.values[constraint.field];
      if (value === undefined) return 'unknown';
      const inside = constraint.values.some(v => v.value === value);
      return outcome(constraint.type === 'allowed_values' ? inside : !inside);
    }
    case 'requires': case 'conditional_requirement': return outcome(selected(constraint.target, context));
    case 'excludes': {
      const value = selected(constraint.target, context);
      return outcome(value === 'unknown' ? value : !value);
    }
    case 'dimension_range': {
      const value = context.values[constraint.field];
      if (value === undefined) return 'unknown';
      const min = constraint.minimum?.value, max = constraint.maximum?.value;
      const low = min === undefined || (constraint.minimumInclusive ? value >= min : value > min);
      const high = max === undefined || (constraint.maximumInclusive ? value <= max : value < max);
      return outcome(low && high);
    }
    case 'conditional_availability': return outcome(constraint.available.value);
    case 'modification_allowed': case 'modification_forbidden': {
      const modifications = context.selection.modification;
      if (modifications === undefined) return 'unknown';
      if (!modifications.includes(constraint.modificationId.value)) return 'not_applicable';
      return constraint.type === 'modification_allowed' ? 'valid' : 'invalid';
    }
  }
}
import { ruleEvidence } from './rule-schema.js';
function evaluateParsedRule(rule: CatalogRule, context: EvaluationContext): RuleResult {
  const evidenceIds = [...new Set(ruleEvidence(rule).map(e => e.id))].sort();
  const result = (outcome: RuleOutcome, reason: string): RuleResult => ({ ruleId: rule.id, outcome, evidenceIds, reasons: [reason] });
  if (rule.catalogVersionId !== context.catalogVersionId) return result('unknown', 'catalog_version_mismatch');
  const scope = scopeApplies(rule, context);
  if (scope === false) return result('not_applicable', 'outside_scope');
  if (scope === 'unknown') return result('unknown', 'unknown_scope');
  if (rule.reviewStatus !== 'approved' && rule.reviewStatus !== 'auto_approved') return result('unknown', 'rule_not_approved');
  if (rule.reviewStatus === 'auto_approved' && rule.confidence < AUTO_APPROVE_THRESHOLD) return result('unknown', 'ineligible_auto_approval');
  if (rule.modelingStatus === 'unmodeled') return result('unknown', 'unmodeled_rule');
  const applies = rule.when ? evaluateCondition(rule.when, context) : true;
  if (applies === false) return result('not_applicable', 'condition_false');
  if (applies === 'unknown') return result('unknown', 'condition_unknown');
  return result(evaluateConstraint(rule.constraint, context), 'constraint_evaluated');
}
/** Parse runtime inputs so callers cannot bypass schemas using unchecked model output. */
export function evaluateRule(rawRule: unknown, rawContext: unknown): RuleResult {
  return evaluateParsedRule(ruleSchema.parse(rawRule), contextSchema.parse(rawContext));
}
export function evaluateRules(rawRules: unknown[], rawContext: unknown): {
  outcome: RuleOutcome; results: RuleResult[]; conflicts: { code: 'unresolved_conflict'; ruleIds: string[]; target: string }[];
} {
  const rules = rawRules.map(r => ruleSchema.parse(r));
  if (new Set(rules.map(r => r.id)).size !== rules.length) throw new Error('Duplicate rule IDs');
  const context = contextSchema.parse(rawContext);
  const results = rules.map(r => evaluateParsedRule(r, context));
  const declarations = new Map<string, { allowed: string[]; forbidden: string[] }>();
  for (const rule of rules) {
    if (rule.catalogVersionId !== context.catalogVersionId || scopeApplies(rule, context) !== true || !['approved', 'auto_approved'].includes(rule.reviewStatus) || rule.modelingStatus !== 'modeled') continue;
    if (rule.reviewStatus === 'auto_approved' && rule.confidence < AUTO_APPROVE_THRESHOLD) continue;
    if (rule.when && evaluateCondition(rule.when, context) !== true) continue;
    const c = rule.constraint;
    if (c.type !== 'modification_allowed' && c.type !== 'modification_forbidden') continue;
    const values = declarations.get(c.modificationId.value) ?? { allowed: [], forbidden: [] };
    values[c.type === 'modification_allowed' ? 'allowed' : 'forbidden'].push(rule.id);
    declarations.set(c.modificationId.value, values);
  }
  const conflicts = [...declarations.entries()].filter(([, x]) => x.allowed.length && x.forbidden.length)
    .map(([target, x]) => ({ code: 'unresolved_conflict' as const, target, ruleIds: [...x.allowed, ...x.forbidden].sort() }));
  const combined = results.some(r => r.outcome === 'invalid') ? 'invalid'
    : conflicts.length || results.some(r => r.outcome === 'unknown') ? 'unknown'
    : results.some(r => r.outcome === 'valid') ? 'valid' : 'not_applicable';
  return { outcome: combined, results, conflicts };
}
