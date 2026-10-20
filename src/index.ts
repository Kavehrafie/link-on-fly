import { Hono } from 'hono'
import links from './links.yaml'



const app = new Hono()

app.get("*", (c) => {

})

export default app
