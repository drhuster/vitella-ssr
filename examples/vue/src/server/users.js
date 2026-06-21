import { readBody } from '@vitella-ssr/core'

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]

export const get = async (req, res, ctx) => {
  return { status: 200, body: users }
}

export const post = async (req, res, ctx) => {
  const raw = await readBody(req)
  const data = JSON.parse(raw)
  const newUser = { id: users.length + 1, name: data.name }
  users.push(newUser)
  ctx.cookies.set('last_added', String(newUser.id), { httpOnly: true })
  return { status: 201, body: newUser }
}
