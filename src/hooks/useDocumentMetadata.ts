import { useEffect } from 'react'

import {
  DEFAULT_META_DESCRIPTION,
  DEFAULT_OG_IMAGE_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from '../domain/site/constants'

export type RobotsDirective = 'index,follow' | 'noindex,follow' | 'noindex'

export type DocumentMetadata = {
  title: string
  description?: string
  canonicalPath?: string
  robots?: RobotsDirective
  ogType?: 'website'
  imageUrl?: string
}

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

export function useDocumentMetadata({
  title,
  description = DEFAULT_META_DESCRIPTION,
  canonicalPath,
  robots = 'index,follow',
  ogType = 'website',
  imageUrl = DEFAULT_OG_IMAGE_URL,
}: DocumentMetadata) {
  useEffect(() => {
    const previousTitle = document.title
    const mutations: HeadMutation[] = []
    const canonicalUrl = canonicalPath
      ? new URL(canonicalPath, SITE_ORIGIN).toString()
      : undefined
    const socialUrl = canonicalUrl ?? SITE_ORIGIN

    document.title = title
    setMetaContent('name', 'description', description, mutations)
    setMetaContent('name', 'robots', robots, mutations)
    setMetaContent('property', 'og:type', ogType, mutations)
    setMetaContent('property', 'og:site_name', SITE_NAME, mutations)
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
  }, [canonicalPath, description, imageUrl, ogType, robots, title])
}
