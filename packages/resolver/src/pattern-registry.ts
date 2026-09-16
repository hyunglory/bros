import {
  type IdentifierPatternDefinition,
  type IdentifierPatternRegistryDefinition,
  type IdentifierPatternSource,
  type SourceIdentifierType,
  validateIdentifierPatternRegistry,
} from "@bros/contracts";

export type PatternRegistryErrorCode =
  "INVALID_PATTERN_REGISTRY" | "UNSAFE_PATTERN_REGEX" | "DUPLICATE_PATTERN_ID";

export class PatternRegistryError extends Error {
  constructor(readonly code: PatternRegistryErrorCode) {
    super(code);
    this.name = "PatternRegistryError";
  }
}

export interface IdentifierPatternMatch {
  brandKey: string;
  candidateValue: string;
  identifierType: SourceIdentifierType;
  matchEnd: number;
  matchStart: number;
  patternId: string;
  registryVersion: string;
  source: IdentifierPatternSource;
}

interface CompiledPattern extends IdentifierPatternDefinition {
  expression: RegExp;
}

const maxInputLength = 16_384;

function patternError(code: PatternRegistryErrorCode): never {
  throw new PatternRegistryError(code);
}

// The registry is deploy-time configuration, but it remains defensive because a
// single pathological regex would block every resolver worker. The bounded input
// plus these exclusions keep the supported subset suitable for deterministic
// identifier extraction; complex semantic matching belongs in later stages.
function compile(definition: IdentifierPatternDefinition): CompiledPattern {
  const regex = definition.regex;
  if (
    /\\[1-9]/u.test(regex) ||
    /\(\?(?:[=!]|<[=!])/u.test(regex) ||
    /\(\?<[A-Za-z][A-Za-z0-9_]*>/u.test(regex.replace("(?<identifier>", "")) ||
    /\((?:[^()\\]|\\.)*[+*{][^()]*\)[+*{]/u.test(regex) ||
    /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)[+*{]/u.test(regex)
  ) {
    return patternError("UNSAFE_PATTERN_REGEX");
  }
  const namedCaptureCount = (regex.match(/\(\?<identifier>/gu) ?? []).length;
  if (namedCaptureCount !== 1) return patternError("UNSAFE_PATTERN_REGEX");
  try {
    return { ...definition, expression: new RegExp(regex, "u") };
  } catch {
    return patternError("UNSAFE_PATTERN_REGEX");
  }
}

function checkedDefinition(value: unknown): IdentifierPatternRegistryDefinition {
  const result = validateIdentifierPatternRegistry(value);
  if (!result.ok) {
    return patternError("INVALID_PATTERN_REGISTRY");
  }
  return structuredClone(result.value);
}

export function createIdentifierPatternRegistry(value: unknown) {
  const definition = checkedDefinition(value);
  const ids = new Set<string>();
  const patternsByBrand = new Map<string, CompiledPattern[]>();
  for (const pattern of definition.patterns) {
    if (ids.has(pattern.id)) return patternError("DUPLICATE_PATTERN_ID");
    ids.add(pattern.id);
    const compiled = compile(pattern);
    const patterns = patternsByBrand.get(compiled.brandKey) ?? [];
    patterns.push(compiled);
    patternsByBrand.set(compiled.brandKey, patterns);
  }

  return Object.freeze({
    version: definition.version,
    match(
      brandKey: string | null,
      source: IdentifierPatternSource,
      value: string,
    ): readonly IdentifierPatternMatch[] {
      if (brandKey === null || typeof brandKey !== "string" || typeof value !== "string") return [];
      if (value.length > maxInputLength) return [];
      const patterns = patternsByBrand.get(brandKey) ?? [];
      const matches: IdentifierPatternMatch[] = [];
      for (const pattern of patterns) {
        if (pattern.source !== source) continue;
        // Expressions deliberately have no g/y flag, so lastIndex cannot leak between calls.
        const result = pattern.expression.exec(value);
        const candidateValue = result?.groups?.identifier;
        if (result === null || candidateValue === undefined || candidateValue.trim().length === 0)
          continue;
        matches.push(
          Object.freeze({
            brandKey: pattern.brandKey,
            candidateValue,
            identifierType: pattern.identifierType,
            matchEnd: result.index + result[0].length,
            matchStart: result.index,
            patternId: pattern.id,
            registryVersion: definition.version,
            source: pattern.source,
          }),
        );
      }
      return Object.freeze(matches);
    },
  });
}
