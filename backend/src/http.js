class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorMiddleware(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  if (err.code === 'INVALID_DOCUMENT') {
    return res.status(400).json({ code: 'INVALID_DOCUMENT', message: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 'INVALID_DOCUMENT', message: 'File must be 5 MB or smaller.' });
  }
  console.error(err);
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
}

function requireString(value, field, { max = 2000, min = 1 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, 'INVALID_REQUEST', `${field} is required.`);
  }
  return value.trim();
}

function optionalString(value, max = 200) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new HttpError(400, 'INVALID_REQUEST', 'A text field is too long or invalid.');
  }
  return value.trim();
}

function requirePositiveInt(value, field, max = 20) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new HttpError(400, 'INVALID_REQUEST', `${field} must be a whole number from 1 to ${max}.`);
  }
  return number;
}

function optionalNumber(value, field) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(400, 'INVALID_REQUEST', `${field} must be a positive number.`);
  }
  return number;
}

module.exports = {
  HttpError,
  asyncHandler,
  errorMiddleware,
  requireString,
  optionalString,
  requirePositiveInt,
  optionalNumber
};
