const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]

export const get = async () => {
  return { status: 200, body: users }
}

export const post = async (req) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const data = JSON.parse(body)
  const newUser = { id: users.length + 1, name: data.name }
  users.push(newUser)
  return { status: 201, body: newUser }
}
