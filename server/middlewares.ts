import { ErrorRequestHandler, RequestHandler } from 'express'
import boom from '@hapi/boom'

/**
 * Call the error handler if a middleware function throw an error
 *
 * @param {Function} fn original middleware function of the route
 * @returns {Promise<Function>} the same middleware function of the route but error handled
 */
export const asyncMiddleware = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    next(err)
  })
}

// Middleware to handle middleware errors
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Check whether the error is a boom error
  if (!err.isBoom) {
    // Check if error is invalid JSON body
    if (err instanceof SyntaxError && err.hasOwnProperty('body')) err = boom.badRequest(err.message)
    else if (err.name === 'UnauthorizedError') err = boom.unauthorized(err)
    // The error was not recognized, send a 500 HTTP error
    else err = boom.internal(err)
  }

  const {
    output: { payload }
  } = err

  // Pass the error to the logging handler
  let errorLogged = new Error(`Error ${payload.statusCode} - ${payload.error} - Message :\n${payload.message}`)
  errorLogged.stack = err.stack
  console.error(errorLogged)

  // Send the error to the client
  res.status(payload.statusCode).json({
    message: err.message || payload.message,
    data: err.data || undefined
  })

  next()
}
