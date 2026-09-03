import type { DiscoveryMode, SearchFormDefinition } from './types'

function valueForMode(form: SearchFormDefinition, mode: DiscoveryMode): string {
  if (mode === 'parallel_only') return form.parallelFilter.parallelOnlyValue
  if (mode === 'non_parallel') return form.parallelFilter.nonParallelValue
  return form.parallelFilter.allValue
}

export function buildSearchUrl(
  form: SearchFormDefinition,
  mode: DiscoveryMode,
  productValue?: string,
): string {
  const url = new URL(form.action)
  url.searchParams.set(
    form.parallelFilter.parameterName,
    valueForMode(form, mode),
  )
  if (form.textView) {
    url.searchParams.set(form.textView.parameterName, form.textView.value)
  }
  if (productValue !== undefined) {
    if (!form.productFilter) {
      throw new Error('Product filter is not defined by the official form.')
    }
    url.searchParams.set(form.productFilter.parameterName, productValue)
  }
  return url.toString()
}
