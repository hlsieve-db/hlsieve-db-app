import { prerenderCards } from './prerenderCards'

const startedAt = performance.now()
const routes = await prerenderCards()
const duration = Math.round(performance.now() - startedAt)
const cardDetailRouteCount = routes.filter(({ routePath }) =>
  routePath.startsWith('/cards/'),
).length

console.log(
  `Prerendered ${routes.length} routes (${cardDetailRouteCount} Card Detail routes) in ${duration}ms.`,
)
