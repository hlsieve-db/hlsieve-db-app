import { useEffect } from 'react'

import { resolvePageMetadata, type PageMetadata } from '../domain/site/metadata'

export type DocumentMetadata = PageMetadata

type HeadMutation = () => void

function setMetaContent(
  attribute: 'name' | 'property',
  key: string,
  content: string,
  mutations: HeadMutation[],
) {
  const selector = `meta[${attribute}="${key}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  const element = existing ?? document.createElement('meta')
  const previousContent = existing?.getAttribute('content')

  if (!existing) {
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.setAttribute('content', content)

  mutations.push(() => {
    if (!existing) {
      element.remove()
    } else if (previousContent === null || previousContent === undefined) {
      element.removeAttribute('content')
    } else {
      element.setAttribute('content', previousContent)
    }
  })
}

function setCanonicalLink(
  canonicalUrl: string | undefined,
  mutations: HeadMutation[],
) {
  const existing = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )

  if (!canonicalUrl) {
    if (!existing) return
    const parent = existing.parentNode
    const nextSibling = existing.nextSibling
    existing.remove()
    mutations.push(() => {
      if (parent) parent.insertBefore(existing, nextSibling)
    })
    return
  }

  const element = existing ?? document.createElement('link')
  const previousHref = existing?.getAttribute('href')
  if (!existing) {
    element.setAttribute('rel', 'canonical')
    document.head.append(element)
  }
  element.setAttribute('href', canonicalUrl)

  mutations.push(() => {
    if (!existing) {
      element.remove()
    } else if (previousHref === null || previousHref === undefined) {
      element.removeAttribute('href')
    } else {
      element.setAttribute('href', previousHref)
    }
  })
}

export function useDocumentMetadata(metadata: DocumentMetadata) {
  const resolved = resolvePageMetadata(metadata)
  const {
    title,
    description,
    canonicalUrl,
    robots,
    ogType,
    siteName,
    socialUrl,
    imageUrl,
  } = resolved

  useEffect(() => {
    const previousTitle = document.title
    const mutations: HeadMutation[] = []

    document.title = title
    setMetaContent('name', 'description', description, mutations)
    setMetaContent('name', 'robots', robots, mutations)
    setMetaContent('property', 'og:type', ogType, mutations)
    setMetaContent('property', 'og:site_name', siteName, mutations)
    setMetaContent('property', 'og:title', title, mutations)
    setMetaContent('property', 'og:description', description, mutations)
    setMetaContent('property', 'og:url', socialUrl, mutations)
    setMetaContent('property', 'og:image', imageUrl, mutations)
    setMetaContent('name', 'twitter:card', 'summary_large_image', mutations)
    setMetaContent('name', 'twitter:title', title, mutations)
    setMetaContent('name', 'twitter:description', description, mutations)
    setMetaContent('name', 'twitter:image', imageUrl, mutations)
    setCanonicalLink(canonicalUrl, mutations)

    return () => {
      document.title = previousTitle
      for (const restore of mutations.reverse()) restore()
    }
  }, [
    canonicalUrl,
    description,
    imageUrl,
    ogType,
    robots,
    siteName,
    socialUrl,
    title,
  ])
}
