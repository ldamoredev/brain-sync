import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { ZodError } from 'zod';
import logger from '../../logger';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    logger.error(err);

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
        });
    }

    if (err instanceof ZodError) {
        return res.status(400).json({
            status: 'fail',
            message: 'Validation Error',
            errors: err.issues,
        });
    }

    // Fallback for unhandled errors
    return res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
    });
};
