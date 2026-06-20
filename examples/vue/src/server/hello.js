export const get = async (req, res, ctx) => {
  return { status: 200, body: { message: 'Hello from Vitella SSR API!', query: ctx.query } }
}
