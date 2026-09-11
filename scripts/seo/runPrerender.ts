import { prerenderCards } from './prerenderCards'

const startedAt = performance.now()
const routes = await prerenderCards()
const duration = Math.round(performance.now() - startedAt)

console.log(
  `Prerendered ${routes.length} routes (${routes.length - 4} Card Detail routes) in ${duration}ms.`,
)
