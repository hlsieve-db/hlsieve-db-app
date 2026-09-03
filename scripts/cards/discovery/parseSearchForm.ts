import { load, type CheerioAPI } from 'cheerio'

import type {
  DiscoveryIssue,
  ProductFilterDefinition,
  SearchFormDefinition,
} from './types'

export type SearchFormParseResult =
  | { ok: true; value: SearchFormDefinition; warnings: DiscoveryIssue[] }
  | { ok: false; errors: DiscoveryIssue[] }

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function fieldByHeading($: CheerioAPI, form: ReturnType<CheerioAPI>) {
  return (heading: string) =>
    form
      .find('dl')
      .filter((_, element) =>
        normalized($(element).find('dt').first().text()).includes(heading),
      )
      .first()
}

export function parseSearchForm(
  html: string,
  sourceUrl: string,
): SearchFormParseResult {
  const $ = load(html)
  const forms = $('form')
  const form = forms
    .filter((_, element) => normalized($(element).text()).includes('パラレル'))
    .first()
  if (form.length === 0) {
    return {
      ok: false,
      errors: [
        { code: 'FORM_NOT_FOUND', message: 'Card search form was not found.' },
      ],
    }
  }

  const issues: DiscoveryIssue[] = []
  const method = (form.attr('method') ?? 'get').toLowerCase()
  if (method !== 'get') {
    issues.push({
      code: 'FORM_METHOD_NOT_GET',
      message: `Card search form method must be GET, received ${method}.`,
    })
  }
  let action: string | undefined
  try {
    const rawAction = form.attr('action')
    if (rawAction) action = new URL(rawAction, sourceUrl).toString()
  } catch {
    action = undefined
  }
  if (!action) {
    issues.push({
      code: 'FORM_ACTION_MISSING',
      message: 'Search form action is missing or invalid.',
    })
  }

  const findField = fieldByHeading($, form)
  const parallelField = findField('パラレル')
  const parallelInputs = parallelField.find('input[name][value]')
  if (parallelField.length === 0 || parallelInputs.length === 0) {
    issues.push({
      code: 'PARALLEL_FILTER_MISSING',
      message: 'Parallel filter was not found.',
    })
  }
  const names = new Set<string>()
  const options = new Map<string, string>()
  const values = new Set<string>()
  parallelInputs.each((_, element) => {
    const input = $(element)
    const name = input.attr('name')
    const value = input.attr('value')
    const id = input.attr('id')
    const label = normalized(
      id ? parallelField.find(`label[for="${id}"]`).first().text() : '',
    )
    if (name) names.add(name)
    if (!value) return
    if (values.has(value)) {
      issues.push({
        code: 'PARALLEL_OPTION_DUPLICATE_VALUE',
        message: `Parallel option value ${value} is duplicated.`,
      })
    }
    values.add(value)
    if (!['すべて', 'パラレルのみ', 'パラレルを除く'].includes(label)) {
      issues.push({
        code: 'PARALLEL_OPTION_UNKNOWN',
        message: `Unknown parallel option label: ${label || '(empty)'}.`,
      })
    } else {
      options.set(label, value)
    }
  })
  if (names.size !== 1) {
    issues.push({
      code: 'PARALLEL_FILTER_MISSING',
      message: 'Parallel options must share exactly one parameter name.',
    })
  }
  for (const label of ['すべて', 'パラレルのみ', 'パラレルを除く']) {
    if (!options.has(label)) {
      issues.push({
        code: 'PARALLEL_OPTION_MISSING',
        message: `Parallel option ${label} is missing.`,
      })
    }
  }

  let productFilter: ProductFilterDefinition | undefined
  const productField = findField('収録商品')
  const productSelect = productField.find('select[name]').first()
  if (productSelect.length > 0) {
    const parameterName = productSelect.attr('name')
    const productOptions = productSelect
      .find('option[value]')
      .toArray()
      .map((element) => ({
        value: $(element).attr('value') ?? '',
        label: normalized($(element).text()),
      }))
      .filter((option) => option.value !== '')
    if (!parameterName || productOptions.some((option) => !option.label)) {
      issues.push({
        code: 'PRODUCT_FILTER_INVALID',
        message: 'Product filter parameter or option label is invalid.',
      })
    } else {
      productFilter = { parameterName, options: productOptions }
    }
  }

  if (issues.length > 0 || !action || names.size !== 1) {
    return { ok: false, errors: issues }
  }
  return {
    ok: true,
    value: {
      sourceUrl,
      action,
      method: 'get',
      parallelFilter: {
        parameterName: [...names][0] as string,
        allValue: options.get('すべて') as string,
        parallelOnlyValue: options.get('パラレルのみ') as string,
        nonParallelValue: options.get('パラレルを除く') as string,
      },
      ...(productFilter ? { productFilter } : {}),
    },
    warnings: [],
  }
}
