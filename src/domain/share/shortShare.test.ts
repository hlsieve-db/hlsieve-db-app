import { describe, expect, it } from 'vitest'

import {
  SHORT_SHARE_ID_LENGTH,
  buildShortShareUrl,
  isShortShareId,
} from './shortShare'

describe('short share id format', () => {
  it('accepts exactly eight base62 characters', () => {
    expect(SHORT_SHARE_ID_LENGTH).toBe(8)
    ;['Ab3xK9pQ', 'AAAAAAAA', '00000000', 'zzzzzzzz', 'aB3dE5fG'].forEach(
      (id) => expect(isShortShareId(id)).toBe(true),
    )
  })

  it.each([
    ['too short', 'Ab3xK9p'],
    ['too long', 'Ab3xK9pQr'],
    ['empty', ''],
    ['a hyphen, which base62 excludes', 'Ab3x-9pQ'],
    ['an underscore', 'Ab3x_9pQ'],
    ['a dot, which could walk a path', 'Ab3x.9pQ'],
    ['a slash', 'Ab3x/9pQ'],
    ['a space', 'Ab3x 9pQ'],
    ['a percent escape', 'Ab3x%39p'],
    ['a newline, which anchors must not let through', 'Ab3xK9pQ\n'],
    ['a leading newline', '\nAb3xK9pQ'],
    ['non-ascii', 'あいうえおかきく'],
  ])('rejects %s', (_label, id) => {
    expect(isShortShareId(id)).toBe(false)
  })

  // The id is the only thing protecting a snapshot, so two ids differing only
  // in case must not collide.
  it('is case sensitive', () => {
    expect(isShortShareId('AbCdEfGh')).toBe(true)
    expect('AbCdEfGh').not.toBe('abcdefgh')
  })
})

describe('short share url', () => {
  it('builds an absolute url under the given origin', () => {
    expect(buildShortShareUrl('Ab3xK9pQ', 'https://hlsieve.com')).toBe(
      'https://hlsieve.com/s/Ab3xK9pQ',
    )
  })

  it('stays on the origin it was given', () => {
    expect(buildShortShareUrl('Ab3xK9pQ', 'http://localhost:5173')).toBe(
      'http://localhost:5173/s/Ab3xK9pQ',
    )
  })

  // A rejected id cannot reach the path, so no id can steer the link
  // somewhere else.
  it.each(['../evil', 'https://evil.test/x', 'Ab3x/9pQ', ''])(
    'refuses to build a url for %s',
    (id) => {
      expect(() => buildShortShareUrl(id, 'https://hlsieve.com')).toThrow()
    },
  )
})
