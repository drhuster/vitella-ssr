const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]

export const get = async (req, res, ctx) => {
  return { status: 200, body: users }
}

export const post = async (req, res, ctx) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const data = JSON.parse(body)
  const newUser = { id: users.length + 1, name: data.name }
  users.push(newUser)
  ctx.cookies.set('last_added', String(newUser.id), { httpOnly: true })
  return { status: 201, body: newUser }
}
