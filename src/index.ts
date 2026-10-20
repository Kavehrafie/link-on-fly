import { Hono } from 'hono'
import links from './links.yaml'

type Branch = {
  title: string
  slug: string
  description?: string
  children: (Branch | Leaf)[]
}

type Leaf = {
  title: string
  slug: string
  description?: string
  targets: { type: 'r2bucket' | "url"; name: string }[]
}

const app = new Hono()

app.get("*", (c) => {

})

export default app
