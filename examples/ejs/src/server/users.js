import { readBody } from '@vitella-ssr/core'

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]

export const get = async () => {
  return { status: 200, body: users }
}

export const post = async (req) => {
  const raw = await readBody(req)
  const data = JSON.parse(raw)
  const newUser = { id: users.length + 1, name: data.name }
  users.push(newUser)
  return { status: 201, body: newUser }
}
